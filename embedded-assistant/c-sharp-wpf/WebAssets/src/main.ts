import "@corti/embedded-web";
import type {
  AuthPayload,
  CortiEmbeddedAPI,
  CreateInteractionPayload,
  ErrorEventPayload,
  InteractionDetails,
} from "@corti/embedded-web/types";

type CortiEmbeddedElement = HTMLElement & CortiEmbeddedAPI;
type BootstrapMessage = AuthPayload & { baseUrl: string };
type HostMessage =
  | { type: "host.ready"; payload: null }
  | { type: "session.started"; payload: string }
  | { type: "error"; payload: string }
  | { type: string; payload: unknown };

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: string) => void;
        addEventListener: (
          type: "message",
          listener: (event: MessageEvent<BootstrapMessage>) => void,
        ) => void;
      };
    };
  }
}

const statusElement = document.getElementById("status");
const assistantElement = document.getElementById("assistant");

if (!(statusElement instanceof HTMLDivElement)) {
  throw new Error("Missing #status element");
}

if (!assistantElement) {
  throw new Error("Missing #assistant element");
}

const status = statusElement;
const corti = assistantElement as CortiEmbeddedElement;
let bootstrapConfig: BootstrapMessage | null = null;
let hasStarted = false;

const postHostMessage = (message: HostMessage) => {
  window.chrome?.webview?.postMessage(JSON.stringify(message));
};

const setErrorState = (message: string) => {
  status.textContent = `Error: ${message}`;
  status.style.background = "#ffebee";
  status.style.color = "#c62828";
};

const reportError = (message: string) => {
  setErrorState(message);
  postHostMessage({ type: "error", payload: message });
};

window.addEventListener("error", event => {
  reportError(event.message || "Unexpected application error");
});

window.addEventListener("unhandledrejection", event => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  reportError(message);
});

const startEmbeddedSession = () => {
  if (hasStarted || bootstrapConfig === null) {
    return;
  }

  hasStarted = true;
  const config = bootstrapConfig;
  corti.setAttribute("baseURL", config.baseUrl);
  corti.setAttribute("visibility", "visible");
};

corti.addEventListener("embedded.ready", () => {
  void (async () => {
    if (bootstrapConfig === null) {
      reportError("Missing host bootstrap configuration");
      return;
    }

    try {
      status.textContent = "Authenticating...";
      await corti.auth(bootstrapConfig);

      status.textContent = "Creating session...";
      const interactionPayload: CreateInteractionPayload = {
        assignedUserId: null,
        encounter: {
          identifier: `encounter-${Date.now()}`,
          status: "planned",
          type: "first_consultation",
          period: { startedAt: new Date().toISOString() },
        },
      };
      const interaction: InteractionDetails = await corti.createInteraction(interactionPayload);

      status.textContent = "Navigating to session...";
      await corti.navigate(`/session/${interaction.id}`);

      status.textContent = "Ready";
      status.style.background = "#e8f5e9";
      status.style.color = "#2e7d32";
      postHostMessage({ type: "session.started", payload: interaction.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportError(message);
    }
  })();
}, { once: true });

corti.addEventListener("embedded-event", (event: Event) => {
  const detail = (event as CustomEvent<{ name: string; payload: unknown }>).detail;
  postHostMessage({
    type: detail.name,
    payload: detail.payload ?? null,
  });
});

corti.addEventListener("error", (event: Event) => {
  const detail = (event as CustomEvent<ErrorEventPayload>).detail;
  reportError(detail.message);
});

window.chrome?.webview?.addEventListener("message", (event: MessageEvent<BootstrapMessage>) => {
  bootstrapConfig = event.data;
  startEmbeddedSession();
});

postHostMessage({ type: "host.ready", payload: null });
