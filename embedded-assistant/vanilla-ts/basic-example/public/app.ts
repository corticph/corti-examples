import "@corti/embedded-web";
import type { CortiEmbeddedAPI } from "@corti/embedded-web";

type CortiEmbeddedElement = HTMLElement & CortiEmbeddedAPI;

const EMBEDDED_READY_TIMEOUT_MS = 20_000;
const INTERACTION_LOADED_TIMEOUT_MS = 20_000;
const RECOVERY_MESSAGE =
  "Assistant is taking longer than expected to load. Check your connection, then try again.";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function waitForEvent(corti: CortiEmbeddedElement, eventName: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    let isSettled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleEvent = () => {
      settle(() => resolve());
    };

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      corti.removeEventListener(eventName, handleEvent);
    };

    const settle = (complete: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      complete();
    };

    corti.addEventListener(eventName, handleEvent, { once: true });

    timeoutId = setTimeout(() => {
      settle(() => reject(new Error(RECOVERY_MESSAGE)));
    }, timeoutMs);
  });
}

function waitForInteractionLoaded(
  corti: CortiEmbeddedElement,
  startNavigation: () => Promise<void>,
) {
  return new Promise<void>((resolve, reject) => {
    let isSettled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleLoaded = () => {
      settle(() => resolve());
    };

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      corti.removeEventListener("interaction.loaded", handleLoaded);
    };

    const settle = (complete: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      complete();
    };

    const fail = (error: unknown) => {
      settle(() => reject(error));
    };

    corti.addEventListener("interaction.loaded", handleLoaded, { once: true });

    timeoutId = setTimeout(() => {
      fail(new Error(RECOVERY_MESSAGE));
    }, INTERACTION_LOADED_TIMEOUT_MS);

    void Promise.resolve().then(startNavigation).catch(fail);
  });
}

async function fetchAuthData() {
  const authRes = await fetch("/api/auth");
  if (!authRes.ok) {
    const errorBody = await authRes.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Authentication failed (${authRes.status})`);
  }

  return authRes.json();
}

async function main() {
  const statusDiv = document.getElementById("status");
  const retryButton = document.getElementById("retry") as HTMLButtonElement | null;

  function setStatus(msg: string, type: "loading" | "success" | "error", canRetry = false) {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.className = `status ${type}`;
    }
    if (retryButton) retryButton.hidden = !canRetry;
  }

  function getCortiElement() {
    const corti = document.getElementById("assistant") as CortiEmbeddedElement | null;
    if (!corti) throw new Error("Embedded assistant not found");
    return corti;
  }

  function replaceCortiElement() {
    const currentCorti = getCortiElement();
    const freshCorti = currentCorti.cloneNode(false) as CortiEmbeddedElement;
    freshCorti.setAttribute("visibility", "hidden");
    currentCorti.replaceWith(freshCorti);
    return freshCorti;
  }

  async function start(corti: CortiEmbeddedElement) {
    setStatus("Initializing...", "loading");
    corti.hide();

    corti.addEventListener("error", (event: any) => {
      setStatus(`Error: ${event.detail?.message || "Unknown error"}`, "error", true);
    });

    const readyPromise = waitForEvent(corti, "embedded.ready", EMBEDDED_READY_TIMEOUT_MS);
    const authPromise = fetchAuthData();

    setStatus("Preparing session...", "loading");
    const [, authData] = await Promise.all([readyPromise, authPromise]);

    setStatus("Authenticating...", "loading");
    await corti.auth(authData);

    await corti.configureApp({
      ui: {
        interactionTitle: true,
        aiChat: true,
        documentFeedback: true,
        navigation: true,
      },
    });

    await corti.setInteractionOptions({
      mode: {
        fallback: "in-person",
        options: ["in-person", "virtual"],
      },
      documents: {
        actions: {
          sync: true,
        },
      },
    });

    setStatus("Creating interaction...", "loading");
    const interaction = await corti.createInteraction({
      assignedUserId: null,
      encounter: {
        identifier: `encounter-${Date.now()}`,
        status: "planned",
        type: "first_consultation",
        period: { startedAt: new Date().toISOString() },
      },
    });

    setStatus("Starting session...", "loading");
    await waitForInteractionLoaded(corti, () =>
      corti.navigate({ path: `/session/${interaction.id}` }),
    );
    corti.show();
    setStatus("Session started!", "success");
  }

  async function startWithStatus(corti: CortiEmbeddedElement) {
    try {
      await start(corti);
    } catch (error) {
      setStatus(`Error: ${getErrorMessage(error)}`, "error", true);
    }
  }

  retryButton?.addEventListener("click", () => {
    void startWithStatus(replaceCortiElement());
  });

  void startWithStatus(getCortiElement());
}

main();
