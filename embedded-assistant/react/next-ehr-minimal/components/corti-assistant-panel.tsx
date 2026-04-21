"use client";

import { use, useRef } from "react";
import {
  CortiEmbeddedReact,
  type CortiEmbeddedReactRef,
  useCortiEmbeddedApi,
} from "@corti/embedded-web/react";
import { getCortiAssistantBootstrap } from "@/components/corti-assistant-bootstrap";
import { CortiAssistantShell } from "@/components/corti-assistant-shell";
import { type CortiAssistantInteractionData } from "@/components/corti-assistant-types";
import { useCortiAssistantStatus } from "./use-corti-assistant-status";

type CortiAssistantPanelProps = {
  interactionData: CortiAssistantInteractionData;
};

export function CortiAssistantPanel({
  interactionData,
}: CortiAssistantPanelProps) {
  const cortiRef = useRef<CortiEmbeddedReactRef>(null);
  const api = useCortiEmbeddedApi(cortiRef);
  const bootstrap = use(getCortiAssistantBootstrap());
  const { status, runOnce, showError } = useCortiAssistantStatus();

  if ("error" in bootstrap) {
    return (
      <CortiAssistantShell statusMessage={bootstrap.error} statusTone="error">
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Corti assistant is unavailable.
        </div>
      </CortiAssistantShell>
    );
  }

  const { baseUrl, authData } = bootstrap;

  async function handleReady() {
    await runOnce(async () => {
      await api.auth(authData);
      const interaction = await api.createInteraction(interactionData);
      await api.navigate(`/session/${interaction.id}`);
    });
  }

  function handleError(event: CustomEvent) {
    showError(event.detail?.message, "Corti assistant error");
  }

  return (
    <CortiAssistantShell
      statusMessage={status.message}
      statusTone={status.tone}
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
            {status.message}
          </div>
        )}
      </div>
    </CortiAssistantShell>
  );
}
