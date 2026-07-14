"use client";

import dynamic from "next/dynamic";
import { CortiAssistantShell } from "@/components/corti-assistant-shell";
import { type CortiAssistantInteractionData } from "@/components/corti-assistant-types";

type CortiAssistantPanelProps = {
  interactionData: CortiAssistantInteractionData;
};

const CortiAssistantPanelClient = dynamic<CortiAssistantPanelProps>(
  () =>
    import("@/components/corti-assistant-panel-client").then(
      (module) => module.CortiAssistantPanelClient,
    ),
  {
    ssr: false,
    loading: () => (
      <CortiAssistantShell statusMessage="Starting Corti assistant..." height={800}>
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Preparing Corti assistant...
        </div>
      </CortiAssistantShell>
    ),
  },
);

export function CortiAssistantPanel(props: CortiAssistantPanelProps) {
  return <CortiAssistantPanelClient {...props} />;
}
