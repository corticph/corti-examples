import "@corti/embedded-web";
import type { CortiEmbeddedAPI } from "@corti/embedded-web/types";

type CortiEmbeddedElement = HTMLElement & CortiEmbeddedAPI;

async function main() {
  const authRes = await fetch("/api/auth");
  const authData = await authRes.json();

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

    // Function to initialize the session
    const initializeSession = async () => {
      try {
        setStatus("Authenticating...", "loading");
        await corti.auth(authData);

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
    };

    // Wait for ready event (only once)
    corti.addEventListener("ready", initializeSession, { once: true });
  } catch (err) {
    setStatus(
      `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      "error",
    );
  }
}

main();
