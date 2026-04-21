"use client";

import { useRef, useState } from "react";
import { type CortiAssistantStatus } from "./corti-assistant-types";

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useCortiAssistantStatus() {
  const hasStarted = useRef(false);
  const [status, setStatus] = useState<CortiAssistantStatus>({
    tone: "default",
    message: "Starting Corti assistant…",
  });

  async function runOnce(task: () => Promise<void>) {
    if (hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    try {
      await task();
      setStatus({ tone: "default", message: "Corti assistant ready" });
    } catch (error) {
      setStatus({
        tone: "error",
        message: toErrorMessage(error, "Failed to start Corti assistant"),
      });
    }
  }

  function showError(error: unknown, fallback = "Corti assistant error") {
    setStatus({
      tone: "error",
      message: toErrorMessage(error, fallback),
    });
  }

  return {
    status,
    runOnce,
    showError,
  };
}
