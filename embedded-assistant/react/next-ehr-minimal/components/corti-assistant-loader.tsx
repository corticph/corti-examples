import { CortiAssistantShell } from "@/components/corti-assistant-shell";

type CortiAssistantLoaderProps = {
  message?: string;
  height?: number;
};

export function CortiAssistantLoader({
  message = "Loading Corti assistant…",
  height = 600,
}: CortiAssistantLoaderProps) {
  return (
    <CortiAssistantShell statusMessage={message} height={height}>
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        {message}
      </div>
    </CortiAssistantShell>
  );
}
