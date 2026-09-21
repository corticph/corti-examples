"use client";

import { use, useEffect, useRef, useState } from "react";
import {
  type CortiEmbeddedEvent,
  type CortiEmbeddedReactRef,
  useCortiEmbeddedApi,
} from "@corti/embedded-web/react";
import { getCortiAssistantBootstrap } from "@/components/corti-assistant-bootstrap";
import { CortiAssistantEmbed } from "@/components/corti-assistant-embed";
import {
  CORTI_ASSISTANT_COMPACT_HEIGHT,
  CortiAssistantShell,
} from "@/components/corti-assistant-shell";
import {
  type CortiAssistantInteractionData,
  type CortiAssistantStatus,
} from "@/components/corti-assistant-types";
import {
  CORTI_ASSISTANT_RECOVERY_MESSAGE,
  getCortiAssistantErrorMessage,
  startCortiAssistantSession,
} from "@/lib/corti-assistant-ehr-integration";
import { syncCortiSoapDocumentToEhr } from "@/lib/corti-assistant-sync";
import type { CortiAssistantVisitConfig } from "@/lib/corti-assistant-visit-config";

const EMBEDDED_READY_TIMEOUT_MS = 20_000;
const EMBEDDED_ASSISTANT_COLLAPSED_HEIGHT = 132;

type CortiAssistantPanelClientProps = {
  encounterIdentifier: string;
  visitConfig: CortiAssistantVisitConfig;
};

export function CortiAssistantPanelClient({
  encounterIdentifier,
  visitConfig,
}: CortiAssistantPanelClientProps) {
  const cortiRef = useRef<CortiEmbeddedReactRef>(null);
  const api = useCortiEmbeddedApi(cortiRef);
  const bootstrap = use(getCortiAssistantBootstrap());
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialized = useRef(false);
  const [embedKey, setEmbedKey] = useState(0);
  const [isCollapsedAfterSync, setIsCollapsedAfterSync] = useState(false);
  const [status, setStatus] = useState<CortiAssistantStatus>({
    tone: "default",
    message: "Starting Corti assistant...",
  });

  useEffect(() => {
    if ("error" in bootstrap) return;

    hasInitialized.current = false;

    const timeoutId = setTimeout(() => {
      hasInitialized.current = true;
      setStatus({ tone: "error", message: CORTI_ASSISTANT_RECOVERY_MESSAGE, canRetry: true });
    }, EMBEDDED_READY_TIMEOUT_MS);
    readyTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      if (readyTimeoutRef.current === timeoutId) readyTimeoutRef.current = null;
    };
  }, [bootstrap, embedKey]);

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
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    if (readyTimeoutRef.current !== null) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }

    try {
      const corti = cortiRef.current;
      if (!corti) throw new Error("Embedded assistant not found");

      setIsCollapsedAfterSync(false);
      setStatus({ tone: "default", message: "Starting Corti assistant..." });
      const interactionData: CortiAssistantInteractionData = {
        assignedUserId: null,
        encounter: {
          identifier: `${encounterIdentifier}-${Date.now()}`,
          status: "planned",
          type: "first_consultation",
          period: { startedAt: new Date().toISOString() },
        },
      };
      await startCortiAssistantSession({
        api,
        authData,
        corti,
        interactionData,
        visitConfig,
      });

      setStatus({ tone: "default", message: "Corti assistant ready" });
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Corti assistant error: ${getCortiAssistantErrorMessage(error)}`,
        canRetry: true,
      });
    }
  }

  function handleEmbeddedEvent(event: CortiEmbeddedEvent) {
    const corti = cortiRef.current;
    if (!corti) {
      return;
    }

    if (event.detail.name !== "document.synced") return;

    syncCortiSoapDocumentToEhr(event.detail.payload);

    corti.hide();
    setIsCollapsedAfterSync(true);
    setStatus({ tone: "default", message: "Document synced. Assistant collapsed." });
  }

  function handleError(event: CustomEvent) {
    setStatus({
      tone: "error",
      message: `Corti assistant error: ${event.detail?.message || "Unknown error"}`,
      canRetry: true,
    });
  }

  function handleRetry() {
    if (readyTimeoutRef.current !== null) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }

    hasInitialized.current = false;
    setIsCollapsedAfterSync(false);
    setStatus({ tone: "default", message: "Starting Corti assistant..." });
    setEmbedKey((key) => key + 1);
  }

  function handleShowAssistant() {
    setIsCollapsedAfterSync(false);
    cortiRef.current?.show();
    setStatus({ tone: "default", message: "Corti assistant ready" });
  }

  return (
    <CortiAssistantShell
      statusMessage={status.message}
      statusTone={status.tone}
      canRetry={status.canRetry}
      onRetry={handleRetry}
      height={
        isCollapsedAfterSync ? EMBEDDED_ASSISTANT_COLLAPSED_HEIGHT : CORTI_ASSISTANT_COMPACT_HEIGHT
      }
    >
      <div className="relative h-full w-full">
        {baseUrl && authData ? (
          <>
            <CortiAssistantEmbed
              ref={cortiRef}
              baseUrl={baseUrl}
              embedKey={embedKey}
              onReady={handleReady}
              onError={handleError}
              onEvent={handleEmbeddedEvent}
            />
            {isCollapsedAfterSync ? (
              <div className="absolute inset-0 flex items-center justify-between gap-4 bg-background px-5 text-sm">
                <div>
                  <p className="font-semibold">Document synced to the EHR.</p>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                    The assistant is hidden until you need it again.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleShowAssistant}
                  className="shrink-0 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold hover:bg-[hsl(var(--muted))]"
                >
                  Show assistant
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            {status.message}
          </div>
        )}
      </div>
    </CortiAssistantShell>
  );
}
