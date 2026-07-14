// Thin WebSocket client for Corti's /streams endpoint.
// Handles the connection lifecycle, config handshake, audio frames, and inbound events.
// Caller drives state via start()/sendConfig()/sendAudio()/end()/close() — this class is
// not a singleton; one instance per session.

export type StreamConfig = {
  type: "config";
  configuration: {
    transcription: {
      primaryLanguage: string;
      isDiarization?: boolean;
      isMultichannel?: boolean;
      participants?: Array<{ channel: number; role: string }>;
    };
    mode: {
      type: "facts" | "transcription";
      outputLocale?: string;
      factGenerationInterval?: "fixed" | "fast_init";
    };
    retentionPolicy?: "none" | "retain";
    audioFormat?: string;
    audioEvents?: { enabled: boolean };
  };
};

// Raw envelope coming back from the server. We pass the parsed JSON through;
// callers inspect `type` to route events (CONFIG_ACCEPTED, transcript, facts, etc.).
export type StreamEvent = {
  type: string;
  [key: string]: unknown;
};

export type ClientStatus =
  | "idle"
  | "connecting"
  | "open" // socket open, before config sent
  | "configuring" // config sent, waiting for CONFIG_ACCEPTED
  | "streaming" // CONFIG_ACCEPTED received, ok to send audio
  | "ending" // local close requested, waiting for server end
  | "closed"
  | "error";

export type ClientHandlers = {
  onStatusChange?: (s: ClientStatus) => void;
  onEvent?: (e: StreamEvent) => void;
  /** Fatal errors (the socket is closed when this fires). */
  onError?: (err: Error) => void;
};

/**
 * Append a Bearer token to a websocketUrl returned by POST /v2/interactions.
 * The docs (authentication/security_best_practices) explicitly say to use the server-returned
 * websocketUrl rather than constructing it. This helper just glues the token on.
 *
 * The space in "Bearer xxx" must be %20-encoded as a URL query value.
 */
export function appendStreamsToken(websocketUrl: string, accessToken: string): string {
  const sep = websocketUrl.includes("?") ? "&" : "?";
  return `${websocketUrl}${sep}token=${encodeURIComponent(`Bearer ${accessToken}`)}`;
}

/**
 * Fallback URL construction for when the caller doesn't have a websocketUrl in hand
 * (e.g. they picked an existing interaction so the create response is gone). Mirrors
 * the documented /transcribe URL shape — just `tenant-name` + `token`, no `environment`.
 */
export function buildStreamsUrlFallback(opts: {
  region: "eu" | "us";
  interactionId: string;
  tenant: string;
  accessToken: string;
}): string {
  // Verified against the official Corti SDK source:
  //   environments.ts: wss = "wss://api.{region}.corti.app/audio-bridge/v2"
  //   stream/client/Client.ts: path = `/interactions/${id}/streams`
  // The interaction id goes IN THE MIDDLE — `/streams/{id}` (what we had before) was wrong.
  const tokenParam = encodeURIComponent(`Bearer ${opts.accessToken}`);
  const host = opts.region === "us" ? "api.us.corti.app" : "api.eu.corti.app";
  return `wss://${host}/audio-bridge/v2/interactions/${opts.interactionId}/streams?tenant-name=${encodeURIComponent(
    opts.tenant,
  )}&token=${tokenParam}`;
}

/**
 * URL for the stateless /transcribe endpoint. No interactionId — just `tenant-name`
 * + `token` query params. Same handshake protocol as /streams (config message →
 * CONFIG_ACCEPTED → audio frames → ENDED) so StreamsClient works unchanged.
 */
export function buildTranscribeUrl(opts: {
  region: "eu" | "us";
  tenant: string;
  accessToken: string;
}): string {
  const tokenParam = encodeURIComponent(`Bearer ${opts.accessToken}`);
  const host = opts.region === "us" ? "api.us.corti.app" : "api.eu.corti.app";
  return `wss://${host}/audio-bridge/v2/transcribe?tenant-name=${encodeURIComponent(
    opts.tenant,
  )}&token=${tokenParam}`;
}

export class StreamsClient {
  private ws: WebSocket | null = null;
  private status: ClientStatus = "idle";
  private handlers: ClientHandlers;

  constructor(handlers: ClientHandlers = {}) {
    this.handlers = handlers;
  }

  get currentStatus(): ClientStatus {
    return this.status;
  }

  /** Open the WebSocket. Resolves when the socket reaches OPEN, rejects on error. */
  connect(url: string): Promise<void> {
    this.setStatus("connecting");
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.ws = new WebSocket(url);
      } catch (e: any) {
        this.setStatus("error");
        reject(new Error(`WebSocket init failed: ${e?.message ?? String(e)}`));
        return;
      }
      // Binary frames carry raw audio; tell the WS to surface them as ArrayBuffer
      // (default in most browsers, but be explicit).
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        if (settled) return;
        settled = true;
        this.setStatus("open");
        resolve();
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev);
      this.ws.onerror = () => {
        // The WebSocket spec intentionally hides error details from JS for security reasons.
        // Don't reject the promise here — wait for `onclose`, which carries the close code
        // (much more diagnostic than the bare `error` event).
      };
      this.ws.onclose = (ev) => {
        // Failure path: connection died before we ever reached OPEN. The close code is the
        // most useful signal we get out of the browser API.
        if (!settled) {
          settled = true;
          this.setStatus("error");
          reject(new Error(describeCloseFailure(ev)));
          return;
        }
        // Normal-flow close: 1000 (normal), 1005 (no status). Anything else is suspicious.
        // BUT: if we're already tearing down (status === "ending" because we sent {type:"end"},
        // or "closed" because the server already sent ENDED), a 1006 is just the TCP racing
        // our own close() and isn't a real problem. Only complain about non-graceful closes
        // that happen during active streaming.
        const wasGraceful = ev.code === 1000 || ev.code === 1005;
        const inTeardown =
          this.status === "ending" || this.status === "closed" || this.status === "error";
        if (!wasGraceful && !inTeardown) {
          this.handlers.onError?.(
            new Error(`WebSocket closed unexpectedly: code=${ev.code} reason="${ev.reason ?? ""}"`),
          );
        }
        this.setStatus("closed");
      };
    });
  }

  /** Send the streams configuration. Must be called within 10s of connect(). */
  sendConfig(config: StreamConfig): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open.");
    }
    this.setStatus("configuring");
    this.ws.send(JSON.stringify(config));
  }

  /**
   * Convenience: connect, send the config, and resolve only when the server returns
   * CONFIG_ACCEPTED (status becomes "streaming"). Rejects on any of the documented
   * config error types (CONFIG_DENIED / CONFIG_MISSING / CONFIG_NOT_PROVIDED / etc).
   *
   * Until this resolves, the caller MUST NOT send any audio — per the /streams docs:
   *   "Clients must send a streams configuration message and wait for a response of type
   *    CONFIG_ACCEPTED before transmitting other data."
   */
  async connectAndConfig(url: string, config: StreamConfig): Promise<void> {
    await this.connect(url);
    return new Promise<void>((resolve, reject) => {
      // Wrap the existing status callback so we can resolve/reject on the relevant transitions
      // without disrupting whatever the caller hooked up.
      const userStatusCb = this.handlers.onStatusChange;
      const userErrorCb = this.handlers.onError;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        this.handlers.onStatusChange = userStatusCb;
        this.handlers.onError = userErrorCb;
      };
      this.handlers.onStatusChange = (s) => {
        userStatusCb?.(s);
        if (settled) return;
        if (s === "streaming") {
          cleanup();
          resolve();
        } else if (s === "error" || s === "closed") {
          cleanup();
          reject(new Error(`Config exchange failed before CONFIG_ACCEPTED (status=${s})`));
        }
      };
      this.handlers.onError = (err) => {
        userErrorCb?.(err);
        if (!settled) {
          cleanup();
          reject(err);
        }
      };
      try {
        this.sendConfig(config);
      } catch (e: any) {
        cleanup();
        reject(e);
      }
    });
  }

  /** Send a binary audio chunk. Caller is responsible for waiting until status === "streaming". */
  sendAudio(chunk: Blob | ArrayBuffer | ArrayBufferView): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
  }

  /** Request the server to flush buffered audio and close cleanly. */
  end(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.setStatus("ending");
    this.ws.send(JSON.stringify({ type: "end" }));
  }

  /** Force-close the socket without waiting for end ack. */
  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  // ---- private helpers ----

  private handleMessage(ev: MessageEvent) {
    // Audio echo / binary frames aren't expected from the server in this flow, but be defensive.
    if (typeof ev.data !== "string") return;
    let parsed: StreamEvent;
    try {
      parsed = JSON.parse(ev.data) as StreamEvent;
    } catch {
      this.handlers.onError?.(
        new Error(`Non-JSON message received: ${String(ev.data).slice(0, 80)}…`),
      );
      return;
    }
    // Drive status from server-side acks/denials.
    const t = String(parsed.type ?? "").toUpperCase();
    if (t === "CONFIG_ACCEPTED") {
      this.setStatus("streaming");
    } else if (
      t === "CONFIG_DENIED" ||
      t === "CONFIG_REJECTED" ||
      t === "CONFIG_NOT_PROVIDED" ||
      t === "CONFIG_TIMEOUT"
    ) {
      this.setStatus("error");
      this.handlers.onError?.(
        new Error(`Config rejected: ${parsed.type} — ${(parsed as any).reason ?? "(no reason)"}`),
      );
    } else if (t === "ENDED") {
      this.setStatus("closed");
    }
    this.handlers.onEvent?.(parsed);
  }

  private setStatus(s: ClientStatus) {
    if (s === this.status) return;
    this.status = s;
    this.handlers.onStatusChange?.(s);
  }
}

// Map a CloseEvent that fired *before* the socket ever opened to a human-readable message.
// The most common case is 1006 (abnormal closure) — that's what browsers show when the
// server rejected the upgrade with an HTTP error (401/403/404/etc.) and we never saw a
// proper WS close frame. In that case the real answer lives in the DevTools Network tab.
function describeCloseFailure(ev: CloseEvent): string {
  const reason = ev.reason || "(no reason returned)";
  const codeHint = (() => {
    switch (ev.code) {
      case 1006:
        return "abnormal closure — server rejected the upgrade before sending a close frame. Open DevTools → Network and look for the WS upgrade row (red status); the HTTP response code on that row is the real answer (401 = bad/missing token, 403 = project not entitled for /streams, 404 = bad interaction id or path)";
      case 1008:
        return "policy violation — server rejected the request after upgrade (auth/scope/format)";
      case 1011:
        return "server internal error during upgrade";
      case 1015:
        return "TLS handshake failure";
      default:
        if (ev.code >= 4000) return `application-specific code ${ev.code} (Corti-defined)`;
        return `unexpected close code ${ev.code}`;
    }
  })();
  return `WebSocket failed to connect: code=${ev.code} reason="${reason}" — ${codeHint}.`;
}
