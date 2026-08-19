import { useEffect, useRef, useState } from "react";
import {
  CortiEmbeddedReact,
  type CortiEmbeddedReactRef,
  useCortiEmbeddedApi,
} from "@corti/embedded-web/react";
import type { AuthResponse, Status } from "../types";

const EMBEDDED_READY_TIMEOUT_MS = 20_000;
const INTERACTION_LOADED_TIMEOUT_MS = 20_000;
const RECOVERY_MESSAGE =
  "Assistant is taking longer than expected to load. Check your connection, then try again.";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function waitForInteractionLoaded(
  corti: CortiEmbeddedReactRef,
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

interface EmbeddedAssistantProps {
  baseUrl: string;
  authData: AuthResponse;
}

export function EmbeddedAssistant({ baseUrl, authData }: EmbeddedAssistantProps) {
  const cortiRef = useRef<CortiEmbeddedReactRef>(null);
  const api = useCortiEmbeddedApi(cortiRef);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard against onReady firing more than once (e.g. React StrictMode double-invocation)
  const hasInitialized = useRef(false);
  const [embedKey, setEmbedKey] = useState(0);

  const [status, setStatus] = useState<Status>({
    message: "Initializing...",
    type: "loading",
  });

  useEffect(() => {
    hasInitialized.current = false;
    setStatus({ message: "Initializing...", type: "loading" });

    const timeoutId = setTimeout(() => {
      hasInitialized.current = true;
      setStatus({ message: RECOVERY_MESSAGE, type: "error", canRetry: true });
    }, EMBEDDED_READY_TIMEOUT_MS);
    readyTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      if (readyTimeoutRef.current === timeoutId) readyTimeoutRef.current = null;
    };
  }, [embedKey]);

  const handleReady = async () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    if (readyTimeoutRef.current !== null) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }

    try {
      const corti = cortiRef.current;
      if (!corti) throw new Error("Embedded assistant not found");
      (corti as typeof corti & { analytics?: Record<string, string> }).analytics = {
        examples_repo: "embedded-assistant/react/basic-example",
      };
      corti.hide();

      setStatus({ message: "Authenticating...", type: "loading" });
      await api.auth(authData);

      await api.configureApp({
        ui: {
          interactionTitle: true,
          aiChat: true,
          documentFeedback: true,
          navigation: true,
        },
      });

      await api.setInteractionOptions({
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

      setStatus({ message: "Creating interaction...", type: "loading" });
      const interaction = await api.createInteraction({
        assignedUserId: null,
        encounter: {
          identifier: `encounter-${Date.now()}`,
          status: "planned",
          type: "first_consultation",
          period: { startedAt: new Date().toISOString() },
        },
      });

      setStatus({ message: "Starting session...", type: "loading" });
      await waitForInteractionLoaded(corti, () =>
        api.navigate({ path: `/session/${interaction.id}` }),
      );
      corti.show();

      setStatus({ message: "Session started!", type: "success" });
    } catch (error) {
      setStatus({
        message: `Error: ${getErrorMessage(error)}`,
        type: "error",
        canRetry: true,
      });
    }
  };

  const handleRetry = () => {
    if (readyTimeoutRef.current !== null) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    hasInitialized.current = false;
    setEmbedKey((key) => key + 1);
  };

  const handleEvent = () => {
    // Events are logged internally by the component
  };

  const handleError = (event: CustomEvent) => {
    setStatus({
      message: `Error: ${event.detail?.message || "Unknown error"}`,
      type: "error",
      canRetry: true,
    });
  };

  return (
    <div className="container">
      <h1>Corti Embedded Assistant - React Basic Example</h1>

      <div className="info">
        <h2>About This Example</h2>
        <p>
          This demonstrates the Corti Embedded Assistant React component using the proper React
          hooks and API.
        </p>
      </div>

      <div className={`status ${status.type}`}>
        <span>{status.message}</span>
        {status.canRetry ? (
          <button type="button" className="retry-button" onClick={handleRetry}>
            Retry
          </button>
        ) : null}
      </div>

      <div className="assistant-container">
        <CortiEmbeddedReact
          key={embedKey}
          ref={cortiRef}
          baseURL={baseUrl}
          visibility="hidden"
          onReady={handleReady}
          onEvent={handleEvent}
          onError={handleError}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
