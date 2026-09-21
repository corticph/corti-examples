"use client";

import dynamic from "next/dynamic";
import {
  CORTI_ASSISTANT_COMPACT_HEIGHT,
  CortiAssistantShell,
} from "@/components/corti-assistant-shell";
import type { CortiAssistantVisitConfig } from "@/lib/corti-assistant-visit-config";

type CortiAssistantPanelProps = {
  encounterIdentifier: string;
  visitConfig: CortiAssistantVisitConfig;
};

const CortiAssistantPanelClient = dynamic<CortiAssistantPanelProps>(
  () =>
    import("@/components/corti-assistant-panel-client").then(
      (module) => module.CortiAssistantPanelClient,
    ),
  {
    ssr: false,
    loading: () => (
      <CortiAssistantShell
        statusMessage="Starting Corti assistant..."
        height={CORTI_ASSISTANT_COMPACT_HEIGHT}
      >
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
