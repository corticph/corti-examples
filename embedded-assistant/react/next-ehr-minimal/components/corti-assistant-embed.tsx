"use client";

import type { RefObject } from "react";
import {
  CortiEmbeddedReact,
  type CortiEmbeddedEvent,
  type CortiEmbeddedReactRef,
} from "@corti/embedded-web/react";

type CortiAssistantEmbedProps = {
  ref: RefObject<CortiEmbeddedReactRef | null>;
  baseUrl: string;
  embedKey: number;
  onError: (event: CustomEvent) => void;
  onReady: () => void;
  onEvent: (event: CortiEmbeddedEvent) => void;
};

export function CortiAssistantEmbed({
  ref,
  baseUrl,
  embedKey,
  onError,
  onReady,
  onEvent,
}: CortiAssistantEmbedProps) {
  return (
    <CortiEmbeddedReact
      key={embedKey}
      ref={ref}
      baseURL={baseUrl}
      visibility="hidden"
      onReady={onReady}
      onError={onError}
      onEvent={onEvent}
      style={{ width: "100%", height: "100%" }}
    />
  );
}