import { Copy, Download, Sparkles, Upload } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSessionState } from "../_shared/sessionState";
import {
  TranscriptJsonDialog,
  TranscriptOutputCard,
  TranscriptRunMetadata,
  TranscriptRunnerForm,
  useTranscriptRunner,
} from "../_shared/transcript-runner";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import {
  configureSecondPassAgent,
  runSecondPassAgent,
  selectAgent,
  useAgentLibrary,
  useSecondPassAgentStore,
  useSelectedAgentId,
} from "./agent";
import { resolveSelectedAgent } from "./agentLibrary";
import { flattenTranscriptForAgent } from "./model";

export function SecondPassAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const agentStore = useSecondPassAgentStore();
  const agents = useAgentLibrary();
  const selectedAgentId = useSelectedAgentId();

  const runner = useTranscriptRunner();
  const [agentOutput, setAgentOutput] = useSessionState("agentOutput", "");
  const [jsonOpen, setJsonOpen] = useSessionState("jsonOpen", false);

  useEffect(() => {
    configureSecondPassAgent(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  const selectedAgent = useMemo(
    () => resolveSelectedAgent(agents, selectedAgentId),
    [agents, selectedAgentId],
  );

  // Install the selected agent's prompt on the platform agent whenever the
  // selection changes (or on first load when the library resolves).
  useEffect(() => {
    if (selectedAgent) {
      selectAgent(selectedAgent);
    }
  }, [selectedAgent]);

  function handleGenerate() {
    setJsonOpen(false);
    void runner.generate({
      onRunStart: () => setAgentOutput(""),
      secondPass: async (transcript) => {
        const agentInput = flattenTranscriptForAgent(transcript);
        setAgentOutput(await runSecondPassAgent(agentInput));
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">Second-pass agent</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Upload an audio file or reuse an existing recording, generate a transcript through{" "}
          <code>/transcripts</code>, then run a second-pass Corti agent over the finalized text. The
          raw transcript stays visible even if the agent step fails.
        </p>
      </div>

      <TranscriptRunnerForm
        runner={runner}
        idPrefix="second-pass"
        description="Configure transcript generation, pick an agent, then run the second-pass agent."
        actionLabel="Generate"
        actionIcon={
          runner.sourceMode === "upload" ? (
            <Upload className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )
        }
        onGenerate={handleGenerate}
        generateDisabled={agentStore.status === "preparing"}
        phaseLabel={{ second_pass: "Running agent..." }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agent
          </span>
          <select
            value={selectedAgentId}
            onChange={(e) => {
              const entry = agents.find((a) => a.id === e.target.value);
              if (entry) {
                selectAgent(entry);
              }
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-corti-lime"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {agentStore.status === "preparing"
              ? "Updating agent..."
              : agentStore.activeName
                ? `Active: ${agentStore.activeName}`
                : ""}
          </span>
        </label>
      </TranscriptRunnerForm>

      <TranscriptRunMetadata
        runState={runner.runState}
        selectedInteraction={runner.selectedInteraction}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <TranscriptOutputCard
          runState={runner.runState}
          downloadPrefix="corti-second-pass-transcript"
          title="Original transcript"
          rows={14}
          onViewJson={() => setJsonOpen(true)}
        />

        <section className="flex flex-col rounded-xl border border-border bg-card p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Agent second pass</h3>
            <p className="text-xs text-muted-foreground">
              Output from the second-pass Corti agent using the selected agent's system prompt.
            </p>
          </div>

          <Textarea
            value={agentOutput}
            readOnly
            rows={14}
            placeholder="The agent output will appear here after the transcript is finalized."
            className="mb-4 flex-1 resize-y font-mono text-xs"
          />

          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setJsonOpen(true)}
              disabled={!runner.runState.transcriptJson}
            >
              View JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (runner.runState.transcriptJson && runner.runState.transcriptId) {
                  const blob = new Blob([JSON.stringify(runner.runState.transcriptJson, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${runner.runState.transcriptId}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                }
              }}
              disabled={!runner.runState.transcriptJson || !runner.runState.transcriptId}
            >
              <Download className="h-4 w-4" /> Download JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(agentOutput)}
              disabled={!agentOutput}
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </section>
      </div>

      <TranscriptJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        transcriptJson={runner.runState.transcriptJson}
      />
    </div>
  );
}
