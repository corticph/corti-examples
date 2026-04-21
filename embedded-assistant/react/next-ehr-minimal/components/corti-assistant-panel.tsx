"use client";

import { use, useRef, useState } from "react";
import {
  CortiEmbeddedReact,
  type CortiEmbeddedReactRef,
  useCortiEmbeddedApi,
} from "@corti/embedded-web/react";
import {
  getCortiAssistantBootstrap,
  type CortiAssistantAuthResponse,
} from "@/components/corti-assistant-bootstrap";
import { CortiAssistantShell } from "@/components/corti-assistant-shell";

type PanelState =
  | { type: "loading"; message: string }
  | { type: "error"; message: string }
  | { type: "ready"; message: string };

export type CortiAssistantInteractionData = {
  assignedUserId: string | null;
  encounter: {
    identifier: string;
    status: "planned";
    type: "first_consultation";
    period: {
      startedAt: string;
    };
  };
};

type CortiAssistantPanelProps = {
  interactionData: CortiAssistantInteractionData;
};

export function CortiAssistantPanel({
  interactionData,
}: CortiAssistantPanelProps) {
  const cortiRef = useRef<CortiEmbeddedReactRef>(null);
  const api = useCortiEmbeddedApi(cortiRef);
  const hasInitialized = useRef(false);
  const bootstrap = use(getCortiAssistantBootstrap());
  const [state, setState] = useState<PanelState>({
    type: "loading",
    message: "Starting Corti assistant…",
  });

  if ("error" in bootstrap) {
    return (
      <CortiAssistantShell statusMessage={bootstrap.error} statusTone="error">
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Corti assistant is unavailable.
        </div>
      </CortiAssistantShell>
    );
  }

  const { baseUrl, authData } = bootstrap as {
    baseUrl: string;
    authData: CortiAssistantAuthResponse;
  };

  async function handleReady() {
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;

    try {
      setState({ type: "loading", message: "Authenticating Corti…" });
      await api.auth(authData);

      setState({ type: "loading", message: "Creating interaction…" });
      const interaction = await api.createInteraction(interactionData);

      await api.navigate(`/session/${interaction.id}`);
      setState({ type: "ready", message: "Corti assistant ready" });
    } catch (error) {
      setState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to start Corti assistant",
      });
    }
  }

  function handleError(event: CustomEvent) {
    setState({
      type: "error",
      message: event.detail?.message || "Corti assistant error",
    });
  }

  return (
    <CortiAssistantShell
      statusMessage={state.message}
      statusTone={state.type === "error" ? "error" : "default"}
      height={800}
    >
      <div className="relative h-full w-full">
        {baseUrl && authData ? (
          <CortiEmbeddedReact
            ref={cortiRef}
            baseURL={baseUrl}
            visibility="visible"
            onReady={handleReady}
            onError={handleError}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            {state.message}
          </div>
        )}
      </div>
    </CortiAssistantShell>
  );
}
