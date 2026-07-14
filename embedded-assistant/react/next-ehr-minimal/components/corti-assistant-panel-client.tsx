"use client";

import { use, useEffect, useRef, useState } from "react";
import {
  CortiEmbeddedReact,
  type CortiEmbeddedReactRef,
  useCortiEmbeddedApi,
} from "@corti/embedded-web/react";
import { getCortiAssistantBootstrap } from "@/components/corti-assistant-bootstrap";
import { CortiAssistantShell } from "@/components/corti-assistant-shell";
import {
  type CortiAssistantInteractionData,
  type CortiAssistantStatus,
} from "@/components/corti-assistant-types";

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

    function cleanup() {
      clearTimeout(timeoutId);
      corti.removeEventListener("interaction.loaded", handleLoaded);
    }

    const settle = (complete: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      complete();
    };

    const fail = (error: unknown) => {
      settle(() => reject(error));
    };

    function handleLoaded() {
      settle(() => resolve());
    }

    corti.addEventListener("interaction.loaded", handleLoaded, { once: true });

    const timeoutId = setTimeout(() => {
      fail(new Error(RECOVERY_MESSAGE));
    }, INTERACTION_LOADED_TIMEOUT_MS);

    void Promise.resolve().then(startNavigation).catch(fail);
  });
}

type CortiAssistantPanelClientProps = {
  interactionData: CortiAssistantInteractionData;
};

export function CortiAssistantPanelClient({ interactionData }: CortiAssistantPanelClientProps) {
  const cortiRef = useRef<CortiEmbeddedReactRef>(null);
  const api = useCortiEmbeddedApi(cortiRef);
  const bootstrap = use(getCortiAssistantBootstrap());
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialized = useRef(false);
  const [embedKey, setEmbedKey] = useState(0);
  const [status, setStatus] = useState<CortiAssistantStatus>({
    tone: "default",
    message: "Starting Corti assistant...",
  });

  useEffect(() => {
    if ("error" in bootstrap) return;

    hasInitialized.current = false;

    const timeoutId = setTimeout(() => {
      hasInitialized.current = true;
      setStatus({ tone: "error", message: RECOVERY_MESSAGE, canRetry: true });
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

      corti.hide();

      setStatus({ tone: "default", message: "Authenticating..." });
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

      setStatus({ tone: "default", message: "Creating interaction..." });
      const interaction = await api.createInteraction(interactionData);

      setStatus({ tone: "default", message: "Starting session..." });
      await waitForInteractionLoaded(corti, () =>
        api.navigate({ path: `/session/${interaction.id}` }),
      );
      corti.show();

      setStatus({ tone: "default", message: "Corti assistant ready" });
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Corti assistant error: ${getErrorMessage(error)}`,
        canRetry: true,
      });
    }
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
    setStatus({ tone: "default", message: "Starting Corti assistant..." });
    setEmbedKey((key) => key + 1);
  }

  return (
    <CortiAssistantShell
      statusMessage={status.message}
      statusTone={status.tone}
      canRetry={status.canRetry}
      onRetry={handleRetry}
      height={800}
    >
      <div className="relative h-full w-full">
        {baseUrl && authData ? (
          <CortiEmbeddedReact
            key={embedKey}
            ref={cortiRef}
            baseURL={baseUrl}
            visibility="hidden"
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
