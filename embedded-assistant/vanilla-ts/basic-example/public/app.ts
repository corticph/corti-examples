import "@corti/embedded-web";
import type { CortiEmbeddedAPI } from "@corti/embedded-web";

type CortiEmbeddedElement = HTMLElement & CortiEmbeddedAPI;

function waitForReady(corti: CortiEmbeddedElement) {
  return new Promise<void>((resolve) => {
    corti.addEventListener("embedded.ready", () => resolve(), { once: true });
  });
}

async function fetchAuthData() {
  const authRes = await fetch("/api/auth");
  if (!authRes.ok) {
    const errorBody = await authRes.json().catch(() => null);
    throw new Error(
      errorBody?.message ?? `Authentication failed (${authRes.status})`,
    );
  }

  return authRes.json();
}

async function main() {
  const statusDiv = document.getElementById("status");
  function setStatus(msg: string, type: "loading" | "success" | "error") {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.className = `status ${type}`;
    }
  }

  setStatus("Initializing...", "loading");

  try {
    // Use the existing CortiEmbeddedWeb instance from the DOM
    const corti = document.getElementById("assistant") as CortiEmbeddedElement;
    if (!corti) {
      setStatus("Error: Embedded assistant not found", "error");
      return;
    }

    // Set up error listener
    corti.addEventListener("error", (event: any) => {
      setStatus(`Error: ${event.detail?.message || "Unknown error"}`, "error");
    });

    const readyPromise = waitForReady(corti);
    const authPromise = fetchAuthData();

    try {
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
      await corti.navigate(`/session/${interaction.id}`);
      setStatus("Session started!", "success");
    } catch (err) {
      setStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error",
      );
    }
  } catch (err) {
    setStatus(
      `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      "error",
    );
  }
}

main();
