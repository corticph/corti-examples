import { useRef, useState } from "react";
import {
  CortiEmbeddedReact,
  type CortiEmbeddedReactRef,
  useCortiEmbeddedApi,
} from "@corti/embedded-web/react";
import type { AuthResponse, Status } from "../types";

interface EmbeddedAssistantProps {
  baseUrl: string;
  authData: AuthResponse;
}

export function EmbeddedAssistant({
  baseUrl,
  authData,
}: EmbeddedAssistantProps) {
  const cortiRef = useRef<CortiEmbeddedReactRef>(null);
  const api = useCortiEmbeddedApi(cortiRef);

  // Guard against onReady firing more than once (e.g. React StrictMode double-invocation)
  const hasInitialized = useRef(false);

  const [status, setStatus] = useState<Status>({
    message: "Initializing...",
    type: "loading",
  });

  const handleReady = async () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    try {
      setStatus({ message: "Authenticating...", type: "loading" });
      await api.auth(authData);

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
      await api.navigate(`/session/${interaction.id}`);

      setStatus({ message: "Session started!", type: "success" });
    } catch (error) {
      setStatus({
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        type: "error",
      });
    }
  };

  const handleEvent = () => {
    // Events are logged internally by the component
  };

  const handleError = (event: CustomEvent) => {
    setStatus({
      message: `Error: ${event.detail?.message || "Unknown error"}`,
      type: "error",
    });
  };

  return (
    <div className="container">
      <h1>Corti Embedded Assistant - React Basic Example</h1>

      <div className="info">
        <h2>About This Example</h2>
        <p>
          This demonstrates the Corti Embedded Assistant React component using
          the proper React hooks and API.
        </p>
      </div>

      <div className={`status ${status.type}`}>{status.message}</div>

      <div className="assistant-container">
        <CortiEmbeddedReact
          ref={cortiRef}
          baseURL={baseUrl}
          visibility="visible"
          onReady={handleReady}
          onEvent={handleEvent}
          onError={handleError}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
