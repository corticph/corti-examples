/**
 * client.ts — Corti SDK dictation integration.
 *
 * Provides a single entry point — startSession() — that:
 *   1. Creates a CortiClient and connects to the transcription WebSocket once.
 *   2. Reuses the same socket for subsequent sessions (flush/flushed keeps it open).
 *   3. Sends the transcription configuration.
 *   4. Once CONFIG_ACCEPTED, acquires the microphone and streams audio.
 *   5. Fires onTranscript / onCommand / onReady callbacks for incoming events.
 *
 * This module has no DOM dependencies — all UI wiring lives in index.html.
 */

import { CortiClient, type Corti } from "@corti/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionOptions {
  accessToken: string;
  tenantName: string;
  /** "eu" or "us" — returned by the server from CORTI_ENVIRONMENT */
  environment: string;
  /** BCP-47 language tag, e.g. "en-US". Defaults to "en-US". */
  primaryLanguage?: string;
  /** Called once the config is accepted and microphone recording has begun. */
  onReady?: () => void;
  /** Called for each transcript event (both interim and final). */
  onTranscript?: (data: Corti.TranscribeTranscriptData) => void;
  /** Called when a registered voice command is detected. */
  onCommand?: (data: Corti.TranscribeCommandData) => void;
}

export interface ActiveSession {
  /** Stops recording, sends a flush, and resolves when the server confirms "flushed". */
  stop: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level socket — reused across sessions
// ---------------------------------------------------------------------------

type TranscribeSocket = Awaited<ReturnType<CortiClient["transcribe"]["connect"]>>;

let socket: TranscribeSocket | undefined;

// Mutable per-session callbacks — updated on each startSession() call.
let onTranscriptCb: SessionOptions["onTranscript"];
let onCommandCb: SessionOptions["onCommand"];
let onFlushedCb: (() => void) | undefined;
let startAudioCb: (() => Promise<void>) | undefined;

// ---------------------------------------------------------------------------
// startSession
// ---------------------------------------------------------------------------

/**
 * Starts a dictation session.
 *
 * If the WebSocket is already open (e.g. after a previous stop()), it is
 * reused — only a new config is sent. Otherwise a new connection is opened.
 *
 * @returns An object with a `stop()` method for graceful cleanup.
 */
export async function startSession(options: SessionOptions): Promise<ActiveSession> {
  const {
    accessToken,
    tenantName,
    environment,
    primaryLanguage = "en-US",
    onReady,
    onTranscript,
    onCommand,
  } = options;

  // Update per-session callbacks.
  onTranscriptCb = onTranscript;
  onCommandCb = onCommand;

  let micStream: MediaStream | undefined;
  let mediaRecorder: MediaRecorder | undefined;

  async function startAudio() {
    if (!navigator.mediaDevices) {
      throw new Error("Media Devices API not supported in this browser");
    }

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Prefer WebM/Opus; fall back to browser default.
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"]
      .find((t) => MediaRecorder.isTypeSupported(t));

    mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
    console.log(`[dictation] MediaRecorder using: ${mediaRecorder.mimeType || "browser default"}`);

    mediaRecorder.ondataavailable = async (event: BlobEvent) => {
      if (event.data.size > 0) {
        socket!.sendAudio(await event.data.arrayBuffer());
      }
    };

    mediaRecorder.start(250);
    console.log("[dictation] Recording started");
    onReady?.();
  }

  // Keep startAudio accessible to the message handler closure.
  startAudioCb = startAudio;

  // -- Connect (once) -------------------------------------------------------
  if (!socket) {
    const client = new CortiClient({
      environment,
      tenantName,
      auth: { accessToken },
    });

    socket = await client.transcribe.connect();

    socket.on("message", (message) => {
      switch (message.type) {
        case "CONFIG_ACCEPTED":
          console.log("[dictation] Config accepted, session:", message.sessionId);
          startAudioCb?.().catch((err) => console.error("[dictation] Failed to start audio:", err));
          break;

        case "CONFIG_DENIED":
          console.error("[dictation] Config denied:", message.reason);
          break;

        case "CONFIG_TIMEOUT":
          console.error("[dictation] Config timed out");
          break;

        case "transcript":
          onTranscriptCb?.(message.data);
          break;

        case "command":
          onCommandCb?.(message.data);
          break;

        case "flushed":
          console.log("[dictation] Flushed — all buffered audio processed");
          onFlushedCb?.();
          onFlushedCb = undefined;
          break;

        case "usage":
          console.log("[dictation] Usage:", message.credits, "credits");
          break;

        case "ended":
          console.log("[dictation] Session ended by server");
          socket = undefined;
          break;

        case "error":
          console.error("[dictation] Server error:", message.error);
          break;
      }
    });
  }

  // -- Send configuration ---------------------------------------------------
  await socket.waitForOpen();

  socket.sendConfiguration({
    type: "config",
    configuration: {
      primaryLanguage,
      interimResults: true,
      spokenPunctuation: true,
      automaticPunctuation: true,
      commands: [
        { id: "next-section", phrases: ["next section", "go to next section"] },
        { id: "new-paragraph", phrases: ["new paragraph"] },
        { id: "delete-last", phrases: ["delete last", "delete that"] },
      ],
    },
  });

  // -- Return cleanup function ----------------------------------------------
  return {
    stop: () => new Promise<void>((resolve) => {
      onFlushedCb = resolve;

      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.requestData();
        mediaRecorder.stop();
      }
      micStream?.getAudioTracks().forEach((track) => track.stop());

      // Flush tells the server to process all remaining buffered audio.
      // The socket stays open and can be reused for the next session.
      socket!.sendFlush({ type: "flush" });
      console.log("[dictation] Flush sent — waiting for server confirmation");
    }),
  };
}
