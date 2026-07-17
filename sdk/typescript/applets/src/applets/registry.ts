/**
 * Applet manifest for the Sandbox page. Each entry is a self-contained example
 * implementation of ONE concept. Adding an applet = add a folder + one entry.
 */

import {
  AppWindow,
  Code2,
  Gamepad2,
  HardDrive,
  Languages as LanguagesIcon,
  type LucideIcon,
  MessageCircle,
  MessageSquareCode,
  Mic,
  PanelRight,
  Replace,
  Sparkles,
  SpellCheck,
  Type,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { AmbientDetails } from "./ambient-diarized/AmbientDetails";
import { AmbientDiarized } from "./ambient-diarized/AmbientDiarized";
import { AppControl } from "./app-control/AppControl";
import { AppControlDetails } from "./app-control/AppControlDetails";
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
import { DictionaryTerms } from "./dictionary-terms/DictionaryTerms";
import { TermsDetails } from "./dictionary-terms/TermsDetails";
import { FileTranscription } from "./file-transcription/FileTranscription";
import { FileTranscriptionDetails } from "./file-transcription/FileTranscriptionDetails";
import { Languages } from "./languages/Languages";
import { LanguagesDetails } from "./languages/LanguagesDetails";
import { OnDemandAgent } from "./on-demand-agent/OnDemandAgent";
import { OnDemandAgentDetails } from "./on-demand-agent/OnDemandAgentDetails";
import { SecondPassAgent } from "./second-pass-agent/SecondPassAgent";
import { ReplacementsDetails } from "./text-replacements/ReplacementsDetails";
import { TextReplacements } from "./text-replacements/TextReplacements";
import { VoiceAgent } from "./voice-agent/VoiceAgent";
import { VoiceAgentDetails } from "./voice-agent/VoiceAgentDetails";

export type WorkflowArea = "dictation" | "ambient" | "agentic";

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
  /** Heading for the details card shown below the applet body. */
  detailsTitle?: string;
  /** Reference/config details rendered below the applet body. */
  Details?: ComponentType;
}

export const WORKFLOW_TABS: Array<{
  id: WorkflowArea | "home";
  label: string;
}> = [
  { id: "home", label: "Home" },
  { id: "dictation", label: "Dictation" },
  { id: "ambient", label: "Ambient" },
  { id: "agentic", label: "Agentic" },
];

export const APPLETS: AppletDefinition[] = [
  {
    id: "languages",
    title: "Languages",
    description: "Per-endpoint language availability (GET /v2/languages)",
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
    description: "Casing & spacing insertion into formatted content",
    workflow: "dictation",
    icon: Type,
    Component: DictationRichText,
    ExtraSection: SegmentComparisonCard,
    detailsTitle: "Insertion rules",
    Details: RichTextDetails,
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
  },
  {
    id: "dictionary-terms",
    title: "Dictionary terms",
    description: "Custom vocabulary to bias recognition",
    workflow: "dictation",
    icon: SpellCheck,
    Component: DictionaryTerms,
    detailsTitle: "Term manager",
    Details: TermsDetails,
  },
  {
    id: "dictation-commands",
    title: "Dictation commands",
    description: "Turn command events into real editor actions",
    workflow: "dictation",
    icon: MessageSquareCode,
    Component: DictationCommands,
    detailsTitle: "Command manager",
    Details: CommandManager,
  },
  {
    id: "app-control",
    title: "App control",
    description: "Drive app UI by voice (tabs, panels, dialogs)",
    workflow: "dictation",
    icon: AppWindow,
    Component: AppControl,
    detailsTitle: "How it works",
    Details: AppControlDetails,
  },
  {
    id: "dictation-box",
    title: "Dictation box",
    description: "Scratch box, transfer, and voice form navigation",
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
    title: "Diarized ambient",
    description: "Time-ordered, speaker-grouped /streams transcript",
    workflow: "ambient",
    icon: Users,
    Component: AmbientDiarized,
    detailsTitle: "How it works",
    Details: AmbientDetails,
  },
  {
    id: "on-demand-agent",
    title: "On-demand agent",
    description: "On-demand agentic grammar, case and space copy-edit",
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
  },
  {
    id: "conversational-agent",
    title: "Conversational agent",
    description: "Wake-command gated chat UI with threaded agent memory",
    workflow: "agentic",
    icon: MessageCircle,
    Component: ConversationalAgent,
    detailsTitle: "Details",
    Details: ConversationalAgentDetails,
  },
  {
    id: "voice-agent",
    title: "Voice agent",
    description: "Always-on voice chat with speculative prefetch for instant responses",
    workflow: "agentic",
    icon: Mic,
    Component: VoiceAgent,
    detailsTitle: "Details",
    Details: VoiceAgentDetails,
  },
];

export function getApplet(id: string | null): AppletDefinition | undefined {
  return APPLETS.find((a) => a.id === id);
}

export function getAppletsForWorkflow(workflow: WorkflowArea) {
  return APPLETS.filter((applet) => applet.workflow === workflow);
}
