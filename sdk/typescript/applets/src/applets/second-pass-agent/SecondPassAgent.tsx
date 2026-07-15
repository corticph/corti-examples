import { useEffect, useState } from "react";
import { Download, RotateCcw, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  exportAgent,
  resetPrompt,
  runSecondPassAgent,
  savePrompt,
  useSecondPassAgentStore,
} from "./agent";
import { flattenTranscriptForAgent } from "./model";

export function SecondPassAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } =
    useCortiAccessToken();
  const agentStore = useSecondPassAgentStore();
  const [promptDraft, setPromptDraft] = useState(agentStore.prompt);

  const runner = useTranscriptRunner();
  const [agentOutput, setAgentOutput] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);

  useEffect(() => {
    configureSecondPassAgent(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  useEffect(() => {
    setPromptDraft(agentStore.prompt);
  }, [agentStore.prompt]);

  const promptDirty = promptDraft !== agentStore.prompt;

  function handleGenerate() {
    setJsonOpen(false);
    void runner.generate({
      onRunStart: () => setAgentOutput(""),
      // Runs once the transcript is finalized; a failure here keeps the raw
      // transcript on screen (the runner preserves it on error).
      secondPass: async (transcript) => {
        const agentInput = flattenTranscriptForAgent(transcript);
        setAgentOutput(await runSecondPassAgent(agentInput));
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          Second-pass agent
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Upload an audio file or reuse an existing recording, generate a
          transcript through <code>/transcripts</code>, then run a second-pass
          Corti agent over the finalized text. The raw transcript stays visible
          even if the agent step fails.
        </p>
      </div>

      <TranscriptRunnerForm
        runner={runner}
        idPrefix="second-pass"
        description="Configure transcript generation, edit the agent prompt, then run the second-pass agent."
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
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Agent prompt
              </h4>
              <p className="text-xs text-muted-foreground">
                Edit the second-pass prompt before running the agent.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {agentStore.status === "preparing"
                ? "Updating agent..."
                : promptDirty
                  ? "Unsaved changes"
                  : `Agent ${agentStore.status}`}
            </span>
          </div>
          <Textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            rows={8}
            spellCheck={false}
            className="resize-y font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void savePrompt(promptDraft)}
              disabled={!promptDirty || agentStore.status === "preparing"}
            >
              Save prompt
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void resetPrompt()}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={exportAgent}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>
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

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Agent second pass
            </h3>
            <p className="text-xs text-muted-foreground">
              Output from the second-pass Corti agent using the stored system
              prompt.
            </p>
          </div>

          <Textarea
            value={agentOutput}
            readOnly
            rows={14}
            placeholder="The agent output will appear here after the transcript is finalized."
            className="resize-y font-mono text-xs"
          />
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
