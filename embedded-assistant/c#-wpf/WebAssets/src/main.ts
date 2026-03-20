import "@corti/embedded-web";
import type {
  AuthPayload,
  CortiEmbeddedAPI,
  CreateInteractionPayload,
  ErrorEventPayload,
  InteractionDetails,
} from "@corti/embedded-web/types";

type CortiEmbeddedElement = HTMLElement & CortiEmbeddedAPI;

declare global {
  interface Window {
    initializeCorti: (config: AuthPayload & { baseUrl: string }) => Promise<void>;
    chrome?: {
      webview?: {
        postMessage: (message: string) => void;
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

const postHostMessage = (type: string, payload: string) => {
  window.chrome?.webview?.postMessage(JSON.stringify({ type, payload }));
};

const setErrorState = (message: string) => {
  status.textContent = `Error: ${message}`;
  status.style.background = "#ffebee";
  status.style.color = "#c62828";
};

const reportError = (message: string) => {
  setErrorState(message);
  postHostMessage("error", message);
};

window.addEventListener("error", event => {
  reportError(event.message || "Unexpected application error");
});

window.addEventListener("unhandledrejection", event => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  reportError(message);
});

window.initializeCorti = async function initializeCorti(config) {
  corti.setAttribute("baseURL", config.baseUrl);
  corti.setAttribute("visibility", "visible");

  const handleReady = async () => {
    try {
      status.textContent = "Authenticating...";
      await corti.auth(config);

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
      postHostMessage("session.started", interaction.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportError(message);
    }
  };

  corti.addEventListener("embedded.ready", handleReady, { once: true });
  corti.addEventListener("embedded-event", (event: any) => {
    const detail = (event as CustomEvent<{ name: string; payload: unknown }>).detail;
    postHostMessage(detail.name, JSON.stringify(detail.payload ?? null));
  });
  corti.addEventListener("error", (event: any) => {
    const detail = (event as CustomEvent<ErrorEventPayload>).detail;
    reportError(detail.message);
  });
};
