/**
 * A guided, step-by-step walkthrough of the minimum path through the Corti
 * API: install the SDK, create an interaction, get audio in, get a
 * transcript out, then turn it into a document or codes. Chat-style
 * narration on the left, a runnable terminal on the right, modeled on
 * Modal's playground/get_started flow. Each step's Run button calls the
 * real SDK against your current session, and the ids each call returns
 * (interactionId, recordingId, transcript text) feed the next step, so the
 * whole page is one continuous live session, not five isolated snippets.
 * Ends by handing off to the applet gallery on the homepage.
 */

import { type Corti, CortiClient } from "@corti/sdk";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Compass,
  Loader2,
  Play,
  Terminal as TerminalIcon,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { findDefaultTemplate, useGuidedTemplates } from "../applets/_shared/corti-documents";
import { useCortiAccessToken } from "../applets/_shared/useCortiAccessToken";
import { Highlighted } from "../components/docs/CodeBlock";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";

interface GettingStartedStep {
  title: string;
  prompt: string;
  message: string[];
  code: string;
}

const STEPS: GettingStartedStep[] = [
  {
    title: "Install the SDK",
    prompt:
      "How do I start using the Corti SDK, and what does the client actually need from me to know which environment it's talking to?",
    message: [
      "This walkthrough covers the shortest real path through the Corti API: get a patient conversation in as audio, turn it into a transcript, then turn that transcript into medical codes a biller can use, plus a clinical note if your tenant has a template configured. Every step below builds toward that one outcome, and the ids each step returns feed directly into the next.",
      "Every example in this sandbox is built on one package, @corti/sdk. Install it, then construct a client with either a static accessToken or a refreshAccessToken function that returns one, plus an expiry, whenever the SDK needs a fresh token.",
      "You never pass a cluster or tenant name directly. The SDK decodes the token's iss claim, formatted as https://auth.<cluster>.corti.app/realms/<tenant>, and derives both from that on every request. That's also why swapping a token is enough to point the same client at dev, staging, or a different tenant entirely, with zero config changes.",
      "Click Run and this page constructs a client with your current session token and calls languages.list(), a read-only endpoint with no side effects, so you can see the client and your credentials actually work before anything downstream depends on them.",
    ],
    code: `npm install @corti/sdk

import { CortiClient } from "@corti/sdk";

const client = new CortiClient({
  auth: { accessToken: "<token>" },
});

const { languages } = await client.languages.list();`,
  },
  {
    title: "Create an interaction",
    prompt:
      "What's the first real API call I make, and why does almost everything else depend on it?",
    message: [
      "Nearly everything in the Corti API hangs off one thing: an interaction. It's the container for a single patient encounter, the id every recording, transcript, extracted fact, and generated document gets attached to. There is no way to upload a recording or persist a fact without one.",
      "The only required fields are on encounter: identifier (any string you choose, useful for correlating back to your own system), status (planned, in-progress, completed, and a few others), and type (first_consultation, consultation, emergency, and a few more). patient is optional and only matters if you want demographics attached for downstream context.",
      "The response hands back an interactionId and a websocketUrl, whether or not you end up using the socket. Keep the id around, every step after this one needs it.",
      "Run below creates a real interaction on your tenant. If you re-run this step later, the recording and transcript from your first pass become orphaned, so this walkthrough clears them for you automatically.",
    ],
    code: `const interaction = await client.interactions.create({
  encounter: {
    identifier: crypto.randomUUID(),
    status: "planned",
    type: "first_consultation",
  },
});

interaction.interactionId; // attach everything else to this
interaction.websocketUrl;  // for live audio over /streams`,
  },
  {
    title: "Get audio in",
    prompt:
      "How do I actually get audio into an interaction, and does it matter whether the conversation is happening live or already recorded?",
    message: [
      "From here you pick a path based on when the audio exists, and the two paths look genuinely different in code, not just in configuration.",
      "A conversation happening right now streams live over the interaction's own socket at /streams, frame by frame, with transcript and fact events arriving as the conversation continues. Audio that already exists as a file, a dictaphone recording, a call recording pulled from a PBX, gets uploaded once instead: no socket, no streaming, just a single POST.",
      "Uploads have real limits worth knowing up front: 120 minutes of audio or 150MB per file, whichever comes first. Longer source audio needs to be split before it reaches this endpoint.",
      "This walkthrough runs the recorded path, since it's the one that fits a linear, run-it-yourself walkthrough. Choose an audio file below, then Run to upload it to the interaction from the previous step. The live path is shown as reference only; see the Speech to Text applets in the gallery for that version working end to end.",
    ],
    code: `// Live: open the socket the interaction just gave you
const socket = await client.stream.connect({
  id: interaction.interactionId,
  tenantName,
  token: accessToken,
});

// Recorded: upload the file to the same interaction (the path this walkthrough runs)
const { recordingId } = await client.recordings.upload(
  file,
  interaction.interactionId,
);`,
  },
  {
    title: "Get a transcript back out",
    prompt:
      "Once the recording is uploaded, how do I actually get text back out of it, and why can't I just wait for the response?",
    message: [
      "The live path pushes transcript and fact events straight to your socket handler as the conversation happens, so there's nothing to poll. The uploaded-file path works differently, it's a job, not an instant response.",
      "By default a transcript request processes synchronously for up to 25 seconds before the API falls back to background processing anyway, so you'd block for the whole window regardless. Setting async: true up front skips straight to a 202 Accepted with status processing, so you poll on your own schedule instead of holding a connection open.",
      "Run below creates the transcript job for the recording you just uploaded, polls getStatus on a fixed interval until it stops reading processing, and prints the finalized text once it does.",
    ],
    code: `const { id, status: initial } = await client.transcripts.create(
  interaction.interactionId,
  { recordingId, primaryLanguage: "en", async: true },
);

let status = initial;
while (status === "processing") {
  await sleep(1500);
  ({ status } = await client.transcripts.getStatus(
    interaction.interactionId,
    id,
  ));
}
const final = await client.transcripts.get(interaction.interactionId, id);`,
  },
  {
    title: "Turn the transcript into codes and a note",
    prompt:
      "Now that I have a transcript, what do I actually do with the raw text to make it useful for a clinician or a biller?",
    message: [
      "This is the payoff the whole walkthrough has been building toward. A transcript on its own isn't the deliverable, feed the same text into codes.predict for billing codes, and into documents.generate for a structured note, SOAP, discharge summary, referral letter, whatever template you configure. Neither call needs a new interaction, or even an existing one, both accept plain text as context directly.",
      "documents.generate needs a templateRef pointing at a template already configured on your tenant. codes.predict needs a system array naming which coding systems to run against, icd10cm-outpatient and cpt are common defaults, plus an optional filter to include or exclude specific codes or categories.",
      "That's the whole shape of the API: one interaction, audio in, output out. Every applet in this sandbox takes one of these steps further: batching it, adding a review queue, chaining it through multiple agents, cross-walking it across coding systems.",
      "Run below predicts billing codes from the transcript above, or a sample sentence if you skipped ahead without running earlier steps, and generates a note if your tenant has a template configured. If it doesn't, you'll see codes only, with a note explaining why.",
    ],
    code: `const codes = await client.codes.predict({
  system: ["icd10cm-outpatient"],
  context: [{ type: "text", text: transcriptText }],
});

const note = await client.documents.generate({
  outputLanguage: "en",
  templateRef: { templateId },
  context: [{ type: "text", text: transcriptText }],
});`,
  },
];

const SAMPLE_TRANSCRIPT =
  "Patient reports two days of sore throat and mild fever. No cough. Rapid strep test positive. Plan: amoxicillin 500mg three times daily for 10 days.";

type RunStatus = "idle" | "running" | "done" | "error";

interface StepRun {
  status: RunStatus;
  lines: string[];
}

const IDLE_RUN: StepRun = { status: "idle", lines: [] };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TerminalPanel({
  code,
  runtime,
  onRun,
  disabled,
  hint,
  extra,
}: {
  code: string;
  runtime: StepRun;
  onRun: () => void;
  disabled: boolean;
  hint: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">getting-started.ts</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-[3] overflow-auto">
          <Highlighted code={code} language="typescript" fontSize="15px" />
        </div>

        <div className="flex min-h-0 flex-[2] flex-col border-t border-border bg-zinc-950">
          {extra && <div className="shrink-0 border-b border-white/10 px-3 py-2.5">{extra}</div>}
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-1.5 font-mono text-xs text-white/40">
              <TerminalIcon className="h-3.5 w-3.5" />
              Output
            </div>
            <Button size="sm" onClick={onRun} disabled={disabled} className="gap-1.5">
              {runtime.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : runtime.status === "error" ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : runtime.status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 font-mono text-sm leading-relaxed">
            {runtime.lines.length === 0 ? (
              <p className="text-white/30">{hint ?? "Not run yet. Click Run to call this live."}</p>
            ) : (
              runtime.lines.map((line, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only log lines, never reordered
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    line.startsWith("error:")
                      ? "text-red-400"
                      : line.startsWith("$") || line.startsWith("→")
                        ? "text-white/50"
                        : "text-corti-lime",
                  )}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GettingStarted() {
  const navigate = useNavigate();
  const { authConfig: rawAuth } = useAuth();
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const authed = !!rawAuth.authToken;
  const { templates } = useGuidedTemplates(authConfig, sdkEnvironment);
  const template = findDefaultTemplate(templates, "soap");

  const [index, setIndex] = useState(0);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [runtime, setRuntime] = useState<Record<number, StepRun>>({});

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const current = runtime[index] ?? IDLE_RUN;

  const back = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => {
    if (isLast) {
      navigate("/");
      return;
    }
    setIndex((i) => Math.min(STEPS.length - 1, i + 1));
  };

  const setStatus = (i: number, status: RunStatus) =>
    setRuntime((prev) => ({
      ...prev,
      [i]: { status, lines: prev[i]?.lines ?? [] },
    }));

  const appendLine = (i: number, line: string) =>
    setRuntime((prev) => ({
      ...prev,
      [i]: {
        status: "running",
        lines: [...(prev[i]?.lines ?? []), line],
      },
    }));

  /** Pretty-print the actual raw API response so the shape is visible, not just cherry-picked fields. */
  const appendJson = (i: number, value: unknown) =>
    JSON.stringify(value, null, 2)
      .split("\n")
      .forEach((line) => {
        appendLine(i, line);
      });

  const prerequisiteHint = (i: number): string | null => {
    if (!authed) {
      return "Authenticate to run this step live.";
    }
    if (i === 2 && !interactionId) {
      return "Run step 2 first.";
    }
    if (i === 2 && !file) {
      return "Choose an audio file below first.";
    }
    if (i === 3 && !recordingId) {
      return "Run step 3 first.";
    }
    return null;
  };

  const runStep = async (i: number) => {
    setRuntime((prev) => ({ ...prev, [i]: { status: "running", lines: [] } }));
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
      });
      switch (i) {
        case 0: {
          appendLine(i, "$ client.languages.list()");
          const res = await client.languages.list();
          const codes = Object.keys(res.languages ?? {});
          appendLine(i, `${codes.length} language(s) available on this tenant`);
          appendLine(i, codes.slice(0, 12).join(", ") + (codes.length > 12 ? ", ..." : ""));
          appendLine(i, "→ response (first 3 entries):");
          appendJson(i, Object.fromEntries(Object.entries(res.languages ?? {}).slice(0, 3)));
          break;
        }
        case 1: {
          const encounter = {
            identifier: crypto.randomUUID(),
            status: "planned" as const,
            type: "first_consultation" as const,
          };
          appendLine(i, "$ client.interactions.create({ encounter })");
          appendLine(i, "→ request encounter:");
          appendJson(i, encounter);
          const interaction = await client.interactions.create({ encounter });
          setInteractionId(interaction.interactionId);
          setRecordingId(null);
          setTranscriptText(null);
          setRuntime((prev) => ({
            ...prev,
            2: IDLE_RUN,
            3: IDLE_RUN,
          }));
          appendLine(i, "→ response:");
          appendJson(i, interaction);
          break;
        }
        case 2: {
          if (!interactionId) {
            throw new Error("Run step 2 first to create an interaction.");
          }
          if (!file) {
            throw new Error("Choose an audio file below first.");
          }
          appendLine(i, `$ client.recordings.upload(${file.name}, ${interactionId})`);
          appendLine(
            i,
            `→ uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB, ${file.type || "unknown type"})`,
          );
          const recording = await client.recordings.upload(file, interactionId);
          setRecordingId(recording.recordingId);
          setTranscriptText(null);
          setRuntime((prev) => ({ ...prev, 3: IDLE_RUN }));
          appendLine(i, "→ response:");
          appendJson(i, recording);
          break;
        }
        case 3: {
          if (!interactionId || !recordingId) {
            throw new Error("Run step 3 first to upload a recording.");
          }
          appendLine(i, "$ client.transcripts.create(..., { async: true })");
          const created = await client.transcripts.create(interactionId, {
            recordingId,
            primaryLanguage: "en",
            async: true,
          } as unknown as Corti.TranscriptsCreateRequest);
          appendLine(i, `→ response: { id: "${created.id}", status: "${created.status}" }`);
          let status = created.status;
          const transcriptId = created.id;
          while (status === "processing") {
            await sleep(1500);
            const polled = await client.transcripts.getStatus(interactionId, transcriptId);
            status = polled.status;
            appendLine(i, `$ client.transcripts.getStatus(...) → status: ${status}`);
          }
          if (status === "failed") {
            throw new Error("Transcript processing failed.");
          }
          appendLine(i, "$ client.transcripts.get(...)");
          const final = await client.transcripts.get(interactionId, transcriptId);
          appendLine(i, "→ response:");
          appendJson(i, {
            id: final.id,
            status: final.status,
            recordingId: final.recordingId,
            usageInfo: final.usageInfo,
            metadata: final.metadata,
            transcripts: final.transcripts,
          });
          const text = (final.transcripts ?? []).map((t) => t.text).join(" ");
          setTranscriptText(text || null);
          if (!text) {
            appendLine(i, "(no speech detected in this recording)");
          }
          break;
        }
        case 4: {
          const text = transcriptText ?? SAMPLE_TRANSCRIPT;
          if (!transcriptText) {
            appendLine(i, "(no live transcript yet, using a sample sentence)");
          }
          appendLine(
            i,
            '$ client.codes.predict({ system: ["icd10cm-outpatient"], context: [...] })',
          );
          const codes = await client.codes.predict({
            system: ["icd10cm-outpatient"],
            context: [{ type: "text", text }],
          });
          appendLine(i, "→ response:");
          appendJson(i, {
            codes: codes.codes,
            candidates: codes.candidates,
            usageInfo: codes.usageInfo,
          });
          if (template) {
            appendLine(
              i,
              `$ client.documents.generate({ templateRef: { templateId: "${template.id}" }, context: [...] })`,
            );
            const doc = await client.documents.generate({
              outputLanguage: "en",
              templateRef: { templateId: template.id },
              context: [{ type: "text", text }],
            });
            appendLine(i, "→ response:");
            appendJson(i, {
              name: doc.document.name,
              outputLanguage: doc.document.outputLanguage,
              usageInfo: doc.usageInfo,
              sections: doc.document.stringDocument,
            });
          } else {
            appendLine(i, "(no templates found on this tenant, skipping document generation)");
          }
          break;
        }
      }
      setStatus(i, "done");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      appendLine(i, `error: ${message}`);
      setStatus(i, "error");
    }
  };

  const hint = prerequisiteHint(index);
  const disabled = current.status === "running" || (hint !== null && index !== 4) || !authed;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-52px-40px)] lg:overflow-hidden">
      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">
        <section className="flex w-full flex-col border-b border-border lg:min-h-0 lg:w-1/2 lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-5 py-2.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.08em]">Getting started</span>
              <span>
                Step {index + 1} of {STEPS.length}
              </span>
            </div>
            <Progress value={((index + 1) / STEPS.length) * 100} />
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-3">
            <h1 className="text-lg font-bold tracking-tight text-foreground">{step.title}</h1>

            <div className="flex items-start justify-end gap-2">
              <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-3 py-1.5 text-[13px] leading-snug text-foreground">
                {step.prompt}
              </p>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                <User className="h-3 w-3" />
              </span>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-corti-lime/15 text-corti-lime">
                <Bot className="h-3 w-3" />
              </span>
              <div className="max-w-[85%] space-y-1.5 rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2">
                {step.message.map((p, i) => (
                  <p
                    // biome-ignore lint/suspicious/noArrayIndexKey: static per-step content, never reordered
                    key={i}
                    className="text-[13px] leading-snug text-foreground"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
            <Button variant="outline" onClick={back} disabled={index === 0} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static wizard steps, never reordered
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-colors",
                    i === index ? "bg-foreground" : "bg-border",
                  )}
                />
              ))}
            </div>
            <Button onClick={next} className="gap-1.5">
              {isLast ? "Explore examples" : "Next"}
              {isLast ? <Compass className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </section>

        <section className="flex w-full flex-col bg-muted/20 px-4 py-4 sm:px-6 lg:min-h-0 lg:w-1/2 lg:px-8 lg:py-6">
          <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-1 flex-col gap-2">
            <TerminalPanel
              code={step.code}
              runtime={current}
              onRun={() => runStep(index)}
              disabled={disabled}
              hint={hint}
              extra={
                index === 2 ? (
                  <label
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/20 px-2.5 text-xs text-white/50 transition-colors hover:border-white/40",
                      file && "border-solid border-white/30 text-white/80",
                    )}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{file ? file.name : "Choose an audio file..."}</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                ) : undefined
              }
            />
            {!authed && (
              <p className="shrink-0 text-center text-xs text-muted-foreground">
                Not authenticated. Head to the{" "}
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="underline hover:text-foreground"
                >
                  homepage
                </button>{" "}
                to authenticate, then come back to run these live.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
