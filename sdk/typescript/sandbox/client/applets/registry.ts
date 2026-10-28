/**
 * Applet manifest for the Sandbox page. Each entry is a self-contained example
 * implementation of ONE concept. Adding an applet = add a folder + one entry.
 */

import {
  AppWindow,
  ArrowLeftRight,
  Bird,
  BookOpen,
  Boxes,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Code2,
  Columns2,
  FileAudio,
  FileOutput,
  FileStack,
  Fingerprint,
  Gamepad2,
  GitBranch,
  HardDrive,
  Highlighter,
  Languages as LanguagesIcon,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
  Mail,
  MessageCircle,
  MessageSquareCode,
  Mic,
  Network,
  PanelRight,
  Replace,
  Scissors,
  Shield,
  ShieldCheck,
  Sparkles,
  SpellCheck,
  Stethoscope,
  Tag,
  Type,
  Users,
  Wand2,
} from "lucide-react";
import type { ComponentType } from "react";
import { AmbientDetails } from "./ambient-diarized/AmbientDetails";
import { AmbientDiarized } from "./ambient-diarized/AmbientDiarized";
import { AppControl } from "./app-control/AppControl";
import { AppControlDetails } from "./app-control/AppControlDetails";
import { BatchProcessor } from "./batch-processor/BatchProcessor";
import { ChartPrepWorkflow } from "./chart-prep-workflow/ChartPrepWorkflow";
import { ChartPrepWorkflowDetails } from "./chart-prep-workflow/ChartPrepWorkflowDetails";
import { CodeCrosswalk } from "./code-crosswalk/CodeCrosswalk";
import { CodeCrosswalkDetails } from "./code-crosswalk/CodeCrosswalkDetails";
import { CodeValidator } from "./code-validator/CodeValidator";
import { CodeValidatorDetails } from "./code-validator/CodeValidatorDetails";
import { CommandGenie } from "./command-genie/CommandGenie";
import { CommandGenieDetails } from "./command-genie/CommandGenieDetails";
import { ConversationalAgent } from "./conversational-agent/ConversationalAgent";
import { ConversationalAgentDetails } from "./conversational-agent/ConversationalAgentDetails";
import { DeviceButtons } from "./device-buttons/DeviceButtons";
import { DeviceButtonsDetails } from "./device-buttons/DeviceButtonsDetails";
import { AudioArchiveDetails } from "./dictation-audio-archive/AudioArchiveDetails";
import { DictationAudioArchive } from "./dictation-audio-archive/DictationAudioArchive";
import { BoxDetails } from "./dictation-box/BoxDetails";
import { DictationBox } from "./dictation-box/DictationBox";
import { CommandManager } from "./dictation-commands/CommandManager";
import { DictationCommands } from "./dictation-commands/DictationCommands";
import { DictationRichText } from "./dictation-richtext/DictationRichText";
import { RichTextDetails } from "./dictation-richtext/RichTextDetails";
import { SegmentComparisonCard } from "./dictation-richtext/SegmentComparisonCard";
import { DictationSdk } from "./dictation-sdk/DictationSdk";
import { SdkDetails } from "./dictation-sdk/SdkDetails";
import { DictationSuite } from "./dictation-suite/DictationSuite";
import { SuiteDetails } from "./dictation-suite/SuiteDetails";
import { DictionaryTerms } from "./dictionary-terms/DictionaryTerms";
import { TermsDetails } from "./dictionary-terms/TermsDetails";
import { DischargeSummary } from "./discharge-summary/DischargeSummary";
import { EncounterTracker } from "./encounter-tracker/EncounterTracker";
import { EncounterTrackerDetails } from "./encounter-tracker/EncounterTrackerDetails";
import { EvidenceCoding } from "./evidence-coding/EvidenceCoding";
import { EvidenceCodingDetails } from "./evidence-coding/EvidenceCodingDetails";
import { FactsMultisource } from "./facts-multisource/FactsMultisource";
import { FactsMultisourceDetails } from "./facts-multisource/FactsMultisourceDetails";
import { FileTranscription } from "./file-transcription/FileTranscription";
import { FileTranscriptionDetails } from "./file-transcription/FileTranscriptionDetails";
import { FormattingApplet } from "./formatting/FormattingApplet";
import { FormattingDetails } from "./formatting/FormattingDetails";
import { HitlCheckpoint } from "./hitl-checkpoint/HitlCheckpoint";
import { HitlCheckpointDetails } from "./hitl-checkpoint/HitlCheckpointDetails";
import { Languages } from "./languages/Languages";
import { LanguagesDetails } from "./languages/LanguagesDetails";
import { MedicalCodingBatch } from "./medical-coding-batch/MedicalCodingBatch";
import { MedicalCodingBatchDetails } from "./medical-coding-batch/MedicalCodingBatchDetails";
import { MedicalCodingLive } from "./medical-coding-live/MedicalCodingLive";
import { MedicalCodingLiveDetails } from "./medical-coding-live/MedicalCodingLiveDetails";
import { MultiAgentRoles } from "./multi-agent-roles/MultiAgentRoles";
import { MultiAgentRolesDetails } from "./multi-agent-roles/MultiAgentRolesDetails";
import { MultiAgentSpecialists } from "./multi-agent-specialists/MultiAgentSpecialists";
import { MultiAgentSpecialistsDetails } from "./multi-agent-specialists/MultiAgentSpecialistsDetails";
import { NoteDiff } from "./note-diff/NoteDiff";
import { NoteToCode } from "./note-to-code/NoteToCode";
import { NoteToCodeDetails } from "./note-to-code/NoteToCodeDetails";
import { OnDemandAgent } from "./on-demand-agent/OnDemandAgent";
import { OnDemandAgentDetails } from "./on-demand-agent/OnDemandAgentDetails";
import { PlaybackHighlighting } from "./playback-highlighting/PlaybackHighlighting";
import { PlaybackHighlightingDetails } from "./playback-highlighting/PlaybackHighlightingDetails";
import { PriorAuthWorkflow } from "./prior-auth-workflow/PriorAuthWorkflow";
import { PriorAuthWorkflowDetails } from "./prior-auth-workflow/PriorAuthWorkflowDetails";
import { ProcedureNote } from "./procedure-note/ProcedureNote";
import { QaReviewerWorkflow } from "./qa-reviewer-workflow/QaReviewerWorkflow";
import { QaReviewerWorkflowDetails } from "./qa-reviewer-workflow/QaReviewerWorkflowDetails";
import { RealTimeNudge } from "./real-time-nudge/RealTimeNudge";
import { RealTimeNudgeDetails } from "./real-time-nudge/RealTimeNudgeDetails";
import { RecordingTranscript } from "./recording-transcript/RecordingTranscript";
import { RecordingTranscriptDetails } from "./recording-transcript/RecordingTranscriptDetails";
import { ReferralLetter } from "./referral-letter/ReferralLetter";
import { ScribeLikeMe } from "./scribe-like-me/ScribeLikeMe";
import { ScribeLikeMeDetails } from "./scribe-like-me/ScribeLikeMeDetails";
import { SecondPassAgent } from "./second-pass-agent/SecondPassAgent";
import { SecondPassAgentDetails } from "./second-pass-agent/SecondPassAgentDetails";
import { SoapNoteGenerator } from "./soap-note-generator/SoapNoteGenerator";
import { SpeechFlex } from "./speech-flex/SpeechFlex";
import { SpeechFlexDetails } from "./speech-flex/SpeechFlexDetails";
import { TemplateShowdown } from "./template-showdown/TemplateShowdown";
import { ReplacementsDetails } from "./text-replacements/ReplacementsDetails";
import { TextReplacements } from "./text-replacements/TextReplacements";
import { WakeCommandAgent } from "./wake-command-agent/WakeCommandAgent";
import { WakeCommandAgentDetails } from "./wake-command-agent/WakeCommandAgentDetails";

export type WorkflowArea =
  | "dictation"
  | "text-generation"
  | "medical-coding"
  | "agentic"
  | "extended";

export interface AppletDefinition {
  id: string;
  title: string;
  /** One-line "the concept this demonstrates". */
  description: string;
  workflow: WorkflowArea;
  icon: LucideIcon;
  Component: ComponentType;
  /** Optional card rendered between the applet body and the details card. */
  ExtraSection?: ComponentType;
  /** Heading for the details card. */
  detailsTitle?: string;
  /** Reference/config details card. */
  Details?: ComponentType;
  /** When true, render the Details card below the Live demo instead of above it. */
  detailsBelowDemo?: boolean;
  /**
   * Widen the docs page for an applet whose demo is a full working screen rather
   * than a single control. The default column is sized for prose; a side-by-side
   * layout collapses into a stack at that width.
   */
  wide?: boolean;
  /**
   * Where the Live-demo section runs: "embedded" (default) mounts the
   * component in the docs card, "fullscreen" links to the standalone
   * full-viewport route instead, "both" embeds the demo AND offers the
   * fullscreen route. The fullscreen route is only reachable for
   * "fullscreen"/"both" applets.
   */
  demoPlacement?: "embedded" | "fullscreen" | "both";
}

export const WORKFLOW_TABS: Array<{
  id: WorkflowArea | "home";
  label: string;
}> = [
  { id: "home", label: "Home" },
  { id: "dictation", label: "Speech to Text" },
  { id: "text-generation", label: "Text Generation" },
  { id: "medical-coding", label: "Medical Coding" },
  { id: "agentic", label: "Agentic" },
  { id: "extended", label: "Extended workflows" },
];

export const APPLETS: AppletDefinition[] = [
  {
    id: "dictation-suite",
    title: "Dictation suite",
    description: "Comprehensive web browser embedded dictation integration",
    workflow: "dictation",
    icon: LayoutGrid,
    Component: DictationSuite,
    detailsTitle: "How it works",
    Details: SuiteDetails,
    detailsBelowDemo: true,
    wide: true,
    demoPlacement: "both",
  },
  {
    id: "speech-flex",
    title: "Speech Flex",
    description:
      "Providing clinicians the ability to seamlessly flex between self entry dictation and conversational audio capture",
    workflow: "dictation",
    icon: Stethoscope,
    Component: SpeechFlex,
    detailsTitle: "How it works",
    Details: SpeechFlexDetails,
    wide: true,
    demoPlacement: "fullscreen",
  },
  {
    id: "languages",
    title: "Languages",
    description: "Per-endpoint language availability (client.languages.list())",
    workflow: "dictation",
    icon: LanguagesIcon,
    Component: Languages,
    detailsTitle: "Endpoint",
    Details: LanguagesDetails,
  },
  {
    id: "dictation-sdk",
    title: "Raw SDK mic",
    description: "Host-managed microphone with @corti/sdk directly",
    workflow: "dictation",
    icon: Code2,
    Component: DictationSdk,
    detailsTitle: "Connection flow",
    Details: SdkDetails,
  },
  {
    id: "dictation-richtext",
    title: "Rich-text insertion",
    description: "Casing and spacing at the rich-text caret boundary",
    workflow: "dictation",
    icon: Type,
    Component: DictationRichText,
    ExtraSection: SegmentComparisonCard,
    detailsTitle: "Insertion rules",
    Details: RichTextDetails,
  },
  {
    id: "formatting",
    title: "Formatting playground",
    description: "Configure formatting preferences and compare options side-by-side",
    workflow: "dictation",
    icon: SpellCheck,
    Component: FormattingApplet,
    detailsTitle: "Formatting options",
    Details: FormattingDetails,
    wide: true,
  },
  {
    id: "text-replacements",
    title: "Text replacements",
    description: "Find/replace rules applied to the final transcript",
    workflow: "dictation",
    icon: Replace,
    Component: TextReplacements,
    detailsTitle: "Replacement manager",
    Details: ReplacementsDetails,
    detailsBelowDemo: true,
  },
  {
    id: "dictionary-terms",
    title: "Dictionary terms",
    description: "Bias recognition toward defined dictionary terms",
    workflow: "dictation",
    icon: SpellCheck,
    Component: DictionaryTerms,
    detailsTitle: "Term manager",
    Details: TermsDetails,
    detailsBelowDemo: true,
  },
  {
    id: "dictation-commands",
    title: "Dictation commands",
    description: "Respond to recognized command phrases with editor actions",
    workflow: "dictation",
    icon: MessageSquareCode,
    Component: DictationCommands,
    detailsTitle: "Command manager",
    Details: CommandManager,
    detailsBelowDemo: true,
  },
  {
    id: "app-control",
    title: "App control",
    description: "Navigate and control app UI by voice",
    workflow: "dictation",
    icon: AppWindow,
    Component: AppControl,
    detailsTitle: "How it works",
    Details: AppControlDetails,
  },
  {
    id: "dictation-box",
    title: "Dictation box",
    description: "Target a dictation box, then transfer text to the active editor",
    workflow: "dictation",
    icon: PanelRight,
    Component: DictationBox,
    detailsTitle: "How it works",
    Details: BoxDetails,
  },
  {
    id: "device-buttons",
    title: "Device buttons",
    description: "Map handheld-mic buttons (SpeechMike) to recording",
    workflow: "dictation",
    icon: Gamepad2,
    Component: DeviceButtons,
    detailsTitle: "How it works",
    Details: DeviceButtonsDetails,
  },
  {
    id: "dictation-audio-archive",
    title: "Audio archive",
    description: "Capture dictation microphone audio and store it locally",
    workflow: "dictation",
    icon: HardDrive,
    Component: DictationAudioArchive,
    detailsTitle: "Archive flow",
    Details: AudioArchiveDetails,
  },
  {
    id: "file-transcription",
    title: "File transcription",
    description: "Offline /transcripts from uploaded or archived audio",
    workflow: "dictation",
    icon: HardDrive,
    Component: FileTranscription,
    detailsTitle: "How it works",
    Details: FileTranscriptionDetails,
  },
  {
    id: "ambient-diarized",
    title: "Conversational transcript",
    description: "Chronological, speaker-grouped /streams transcript",
    workflow: "dictation",
    icon: Users,
    Component: AmbientDiarized,
    detailsTitle: "How it works",
    Details: AmbientDetails,
  },
  {
    id: "soap-note-generator",
    title: "SOAP note generator",
    description: "Template-based SOAP note from transcript or dictation",
    workflow: "text-generation",
    icon: ClipboardList,
    Component: SoapNoteGenerator,
  },
  {
    id: "discharge-summary",
    title: "Discharge summary builder",
    description: "EHR-ready discharge summary from admission notes",
    workflow: "text-generation",
    icon: FileOutput,
    Component: DischargeSummary,
  },
  {
    id: "referral-letter",
    title: "Referral letter generator",
    description: "Structured referral letter from a visit note or transcript",
    workflow: "text-generation",
    icon: Mail,
    Component: ReferralLetter,
  },
  {
    id: "procedure-note",
    title: "Procedure note generator",
    description: "Specialty-adaptable procedure note from dictation",
    workflow: "text-generation",
    icon: Scissors,
    Component: ProcedureNote,
  },
  {
    id: "note-to-code",
    title: "Note-to-code assistant",
    description: "ICD-10-CM code suggestions with confidence ranking",
    workflow: "medical-coding",
    icon: Tag,
    Component: NoteToCode,
    detailsTitle: "Coding settings",
    Details: NoteToCodeDetails,
  },
  {
    id: "code-crosswalk",
    title: "Code crosswalk assistant",
    description: "Map codes across ICD-10-CM, SNOMED CT, CPT, and more",
    workflow: "medical-coding",
    icon: ArrowLeftRight,
    Component: CodeCrosswalk,
    detailsTitle: "Coding settings",
    Details: CodeCrosswalkDetails,
  },
  {
    id: "evidence-coding",
    title: "Evidence-based coding",
    description: "Auditable code predictions with source-text evidence spans",
    workflow: "medical-coding",
    icon: BookOpen,
    Component: EvidenceCoding,
    detailsTitle: "Coding settings",
    Details: EvidenceCodingDetails,
  },
  {
    id: "code-validator",
    title: "Code validation checker",
    description:
      "Compare proposed codes against API predictions: confirmed, missed, and unsupported",
    workflow: "medical-coding",
    icon: ShieldCheck,
    Component: CodeValidator,
    detailsTitle: "Coding settings",
    Details: CodeValidatorDetails,
  },
  {
    id: "encounter-tracker",
    title: "Multi-encounter code tracker",
    description:
      "Code matrix across multiple visits — spot persistent, emerging, and resolved diagnoses",
    workflow: "medical-coding",
    icon: CalendarRange,
    Component: EncounterTracker,
    detailsTitle: "Coding settings",
    Details: EncounterTrackerDetails,
  },
  {
    id: "template-showdown",
    title: "Template showdown",
    description: "Fire one note through every tenant template simultaneously and compare outputs",
    workflow: "text-generation",
    icon: LayoutGrid,
    Component: TemplateShowdown,
  },
  {
    id: "note-diff",
    title: "Two-note comparison",
    description: "Generate the same template for two notes and view sections side-by-side",
    workflow: "text-generation",
    icon: Columns2,
    Component: NoteDiff,
  },
  {
    id: "batch-processor",
    title: "Batch note processor",
    description: "Process multiple notes in parallel with one template using --- separators",
    workflow: "text-generation",
    icon: ListChecks,
    Component: BatchProcessor,
  },
  {
    id: "chart-prep-workflow",
    title: "Multi-agent chart prep",
    description: "Extract facts → draft note → suggest codes (3-agent pipeline)",
    workflow: "extended",
    icon: GitBranch,
    Component: ChartPrepWorkflow,
    detailsTitle: "Workflow details",
    Details: ChartPrepWorkflowDetails,
  },
  {
    id: "prior-auth-workflow",
    title: "Prior-auth workflow",
    description: "Organize context → justify → format PA request",
    workflow: "extended",
    icon: Shield,
    Component: PriorAuthWorkflow,
    detailsTitle: "Workflow details",
    Details: PriorAuthWorkflowDetails,
  },
  {
    id: "qa-reviewer-workflow",
    title: "QA reviewer workflow",
    description: "Draft → review for gaps → propose revisions",
    workflow: "extended",
    icon: CheckSquare,
    Component: QaReviewerWorkflow,
    detailsTitle: "Workflow details",
    Details: QaReviewerWorkflowDetails,
  },
  {
    id: "on-demand-agent",
    title: "On-demand agent",
    description: "On-demand agent copy-edit for typed or dictated text",
    workflow: "agentic",
    icon: Sparkles,
    Component: OnDemandAgent,
    detailsTitle: "Details",
    Details: OnDemandAgentDetails,
  },
  {
    id: "second-pass-agent",
    title: "Second-pass agent",
    description: "Audio-file transcript plus agentic second pass",
    workflow: "agentic",
    icon: HardDrive,
    Component: SecondPassAgent,
    detailsTitle: "Details",
    Details: SecondPassAgentDetails,
  },
  {
    id: "wake-command-agent",
    title: "Wake-command agent",
    description: "Wake-command gated chat UI with threaded agent memory",
    workflow: "agentic",
    icon: MessageCircle,
    Component: WakeCommandAgent,
    detailsTitle: "Details",
    Details: WakeCommandAgentDetails,
    demoPlacement: "both",
  },
  {
    id: "conversational-agent",
    title: "Conversational agent",
    description: "Always-on voice chat with speculative prefetch for instant responses",
    workflow: "agentic",
    icon: Mic,
    Component: ConversationalAgent,
    detailsTitle: "Details",
    Details: ConversationalAgentDetails,
    demoPlacement: "both",
  },
  {
    id: "command-genie",
    title: "Command Genie",
    description: "Describe a command or nudge in plain language — an agent builds it for you",
    workflow: "agentic",
    icon: Wand2,
    Component: CommandGenie,
    detailsTitle: "How it works",
    Details: CommandGenieDetails,
    wide: true,
    demoPlacement: "both",
  },
  {
    id: "recording-transcript",
    title: "Recording to transcript (REST)",
    description: "Upload a recording, create an async transcript, and poll it to completion",
    workflow: "dictation",
    icon: FileAudio,
    Component: RecordingTranscript,
    detailsTitle: "Pipeline",
    Details: RecordingTranscriptDetails,
  },
  {
    id: "playback-highlighting",
    title: "Playback highlighting",
    description:
      "Word-level transcripts synced to audio playback with real-time highlighting, command detection, and multi-recording sequencing",
    workflow: "dictation",
    icon: Highlighter,
    Component: PlaybackHighlighting,
    detailsTitle: "How it works",
    Details: PlaybackHighlightingDetails,
    wide: true,
  },
  {
    id: "medical-coding-live",
    title: "Live encounter to coded output",
    description: "Coding a finalized note (client.codes.predict)",
    workflow: "medical-coding",
    icon: Stethoscope,
    Component: MedicalCodingLive,
    detailsTitle: "Request/response",
    Details: MedicalCodingLiveDetails,
  },
  {
    id: "medical-coding-batch",
    title: "Batch coding with a review queue",
    description: "Coding a document backlog, filtered and aggregated",
    workflow: "medical-coding",
    icon: ClipboardCheck,
    Component: MedicalCodingBatch,
    detailsTitle: "Batching and filters",
    Details: MedicalCodingBatchDetails,
  },
  {
    id: "facts-multisource",
    title: "Multi-source FactsR extraction",
    description: "Facts across several documents (client.facts.extract)",
    workflow: "extended",
    icon: FileStack,
    Component: FactsMultisource,
    detailsTitle: "Extract vs persist",
    Details: FactsMultisourceDetails,
  },
  {
    id: "hitl-checkpoint",
    title: "Human approval checkpoint",
    description: "An agent proposes; a human approves before it acts",
    workflow: "extended",
    icon: ShieldCheck,
    Component: HitlCheckpoint,
    detailsTitle: "Why this is app-level",
    Details: HitlCheckpointDetails,
  },
  {
    id: "multi-agent-roles",
    title: "Role-scoped multi-agent build",
    description: "Front desk vs clinical notes, scoped mcpServers",
    workflow: "extended",
    icon: Network,
    Component: MultiAgentRoles,
    detailsTitle: "Where scoping lives",
    Details: MultiAgentRolesDetails,
  },
  {
    id: "multi-agent-specialists",
    title: "Narrow-tool specialist network",
    description: "One capability per expert, inline and registry",
    workflow: "extended",
    icon: Boxes,
    Component: MultiAgentSpecialists,
    detailsTitle: "Inline vs reference experts",
    Details: MultiAgentSpecialistsDetails,
  },
  {
    id: "scribe-like-me",
    title: "Scribe like me",
    description: "Two agents tailor a template to a clinician's style from their historical notes",
    workflow: "text-generation",
    icon: Fingerprint,
    Component: ScribeLikeMe,
    detailsTitle: "How it works",
    Details: ScribeLikeMeDetails,
    wide: true,
    demoPlacement: "both",
  },
  {
    id: "real-time-nudge",
    title: "Real-time nudge",
    description:
      "Subtle 'chirps' bring feedback via SNOMED-CT and ICD-10-CM code prediction, grammar matching, and agent-assisted evaluation",
    workflow: "agentic",
    icon: Bird,
    Component: RealTimeNudge,
    detailsTitle: "How it works",
    Details: RealTimeNudgeDetails,
    wide: true,
    demoPlacement: "both",
  },
];

export function getApplet(id: string | null): AppletDefinition | undefined {
  return APPLETS.find((a) => a.id === id);
}

export function getAppletsForWorkflow(workflow: WorkflowArea) {
  return APPLETS.filter((applet) => applet.workflow === workflow);
}

const WORKFLOW_SLUGS: Record<WorkflowArea, string> = {
  dictation: "speech-to-text",
  "text-generation": "text-generation",
  "medical-coding": "medical-coding",
  agentic: "agentic",
  extended: "extended",
};

export function workflowSlug(area: WorkflowArea): string {
  return WORKFLOW_SLUGS[area];
}

export function workflowAreaFromSlug(slug: string): WorkflowArea | undefined {
  return (
    (Object.entries(WORKFLOW_SLUGS) as [WorkflowArea, string][]).find(([, s]) => s === slug)?.[0] ??
    undefined
  );
}

export function appletPath(applet: AppletDefinition): string {
  return `/${workflowSlug(applet.workflow)}/${applet.id}`;
}

/** Whether the applet is reachable on the standalone fullscreen route. */
export function hasFullscreenRoute(applet: AppletDefinition): boolean {
  return applet.demoPlacement === "fullscreen" || applet.demoPlacement === "both";
}

/** Route for the standalone full-viewport demo of a fullscreen-capable applet. */
export function appletFullscreenPath(applet: AppletDefinition): string {
  return `${appletPath(applet)}/fullscreen`;
}

export function getAppletByPath(
  slug: string | undefined,
  id: string | undefined,
): AppletDefinition | undefined {
  if (!slug || !id) {
    return undefined;
  }
  const area = workflowAreaFromSlug(slug);
  if (!area) {
    return undefined;
  }
  const applet = getApplet(id);
  if (!applet || applet.workflow !== area) {
    return undefined;
  }
  return applet;
}
