/**
 * Real source code for each applet, imported verbatim via Vite `?raw` so the
 * docs view always shows the actual implementation (no hand-kept snippets).
 *
 * Keyed by applet id (see `registry.ts`). Each entry lists the main component
 * plus the one domain/logic file that best explains the concept.
 */
import type { SourceFile } from "../components/docs/CodeBlock";
import ambientTsx from "./ambient-diarized/AmbientDiarized.tsx?raw";
import ambientConfig from "./ambient-diarized/config.ts?raw";
import appControlTsx from "./app-control/AppControl.tsx?raw";
import appControlCommands from "./app-control/commands.ts?raw";
import commandGenieTsx from "./command-genie/CommandGenie.tsx?raw";
import commandGenieAgent from "./command-genie/genieAgent.ts?raw";
import commandGenieModel from "./command-genie/genieModel.ts?raw";
import boxCommands from "./dictation-box/commands.ts?raw";
import boxTsx from "./dictation-box/DictationBox.tsx?raw";
import commandModel from "./dictation-commands/commandModel.ts?raw";
import commandsTsx from "./dictation-commands/DictationCommands.tsx?raw";
import richTextConfig from "./dictation-richtext/config.ts?raw";
import richTextTsx from "./dictation-richtext/DictationRichText.tsx?raw";
import dictationSdkConfig from "./dictation-sdk/config.ts?raw";
import dictationSdkTsx from "./dictation-sdk/DictationSdk.tsx?raw";
import termsTsx from "./dictionary-terms/DictionaryTerms.tsx?raw";
import termsLogic from "./dictionary-terms/terms.ts?raw";
import comparisonSectionTsx from "./formatting/ComparisonSection.tsx?raw";
import comparisonConnectionTs from "./formatting/comparisonConnection.ts?raw";
import formattingConfigTs from "./formatting/config.ts?raw";
import formattingAppletTsx from "./formatting/FormattingApplet.tsx?raw";
import formattingDialogTsx from "./formatting/FormattingDialog.tsx?raw";
import formattingOptionsTs from "./formatting/formattingOptions.ts?raw";
import languagesTsx from "./languages/Languages.tsx?raw";
import languagesApi from "./languages/languagesApi.ts?raw";
import onDemandAgentLogic from "./on-demand-agent/agent.ts?raw";
import onDemandAgentTsx from "./on-demand-agent/OnDemandAgent.tsx?raw";
import playbackHighlightingConcatAudio from "./playback-highlighting/concatAudio.ts?raw";
import playbackHighlightingLiveConfig from "./playback-highlighting/LiveDictationConfig.tsx?raw";
import playbackHighlightingLivePanel from "./playback-highlighting/LiveDictationPanel.tsx?raw";
import playbackHighlightingTsx from "./playback-highlighting/PlaybackHighlighting.tsx?raw";
import playbackHighlightingPipeline from "./playback-highlighting/pipeline.ts?raw";
import playbackHighlightingPlayer from "./playback-highlighting/SyncedTranscriptPlayer.tsx?raw";
import playbackHighlightingLiveTranscript from "./playback-highlighting/useLiveTranscript.ts?raw";
import playbackHighlightingSync from "./playback-highlighting/usePlaybackSync.ts?raw";
import realTimeNudgeGrammar from "./real-time-nudge/grammar.ts?raw";
import realTimeNudgeRuleEditor from "./real-time-nudge/NudgeRuleEditor.tsx?raw";
import realTimeNudgeEngine from "./real-time-nudge/nudgeEngine.ts?raw";
import realTimeNudgeTsx from "./real-time-nudge/RealTimeNudge.tsx?raw";
import realTimeNudgeSnomedAgent from "./real-time-nudge/snomedAgent.ts?raw";
import recordingTranscriptPipeline from "./recording-transcript/pipeline.ts?raw";
import recordingTranscriptTsx from "./recording-transcript/RecordingTranscript.tsx?raw";
import scribeLikeMeAgent from "./scribe-like-me/agent.ts?raw";
import scribeLikeMeTsx from "./scribe-like-me/ScribeLikeMe.tsx?raw";
import replacementsLogic from "./text-replacements/replacements.ts?raw";
import replacementsTsx from "./text-replacements/TextReplacements.tsx?raw";

const SOURCES: Record<string, SourceFile[]> = {
  languages: [
    { name: "Languages.tsx", code: languagesTsx },
    { name: "languagesApi.ts", code: languagesApi },
  ],
  "dictation-sdk": [
    { name: "DictationSdk.tsx", code: dictationSdkTsx },
    { name: "config.ts", code: dictationSdkConfig },
  ],
  "dictation-richtext": [
    { name: "DictationRichText.tsx", code: richTextTsx },
    { name: "config.ts", code: richTextConfig },
  ],
  formatting: [
    { name: "FormattingApplet.tsx", code: formattingAppletTsx },
    { name: "config.ts", code: formattingConfigTs },
    { name: "formattingOptions.ts", code: formattingOptionsTs },
    { name: "FormattingDialog.tsx", code: formattingDialogTsx },
    { name: "ComparisonSection.tsx", code: comparisonSectionTsx },
    { name: "comparisonConnection.ts", code: comparisonConnectionTs },
  ],
  "dictation-commands": [
    { name: "DictationCommands.tsx", code: commandsTsx },
    { name: "commandModel.ts", code: commandModel },
  ],
  "text-replacements": [
    { name: "TextReplacements.tsx", code: replacementsTsx },
    { name: "replacements.ts", code: replacementsLogic },
  ],
  "dictionary-terms": [
    { name: "DictionaryTerms.tsx", code: termsTsx },
    { name: "terms.ts", code: termsLogic },
  ],
  "dictation-box": [
    { name: "DictationBox.tsx", code: boxTsx },
    { name: "commands.ts", code: boxCommands },
  ],
  "app-control": [
    { name: "AppControl.tsx", code: appControlTsx },
    { name: "commands.ts", code: appControlCommands },
  ],
  "ambient-diarized": [
    { name: "AmbientDiarized.tsx", code: ambientTsx },
    { name: "config.ts", code: ambientConfig },
  ],
  "on-demand-agent": [
    { name: "OnDemandAgent.tsx", code: onDemandAgentTsx },
    { name: "agent.ts", code: onDemandAgentLogic },
  ],
  "command-genie": [
    { name: "CommandGenie.tsx", code: commandGenieTsx },
    { name: "genieAgent.ts", code: commandGenieAgent },
    { name: "genieModel.ts", code: commandGenieModel },
  ],
  "recording-transcript": [
    { name: "RecordingTranscript.tsx", code: recordingTranscriptTsx },
    { name: "pipeline.ts", code: recordingTranscriptPipeline },
  ],
  "playback-highlighting": [
    { name: "PlaybackHighlighting.tsx", code: playbackHighlightingTsx },
    { name: "SyncedTranscriptPlayer.tsx", code: playbackHighlightingPlayer },
    { name: "usePlaybackSync.ts", code: playbackHighlightingSync },
    { name: "pipeline.ts", code: playbackHighlightingPipeline },
    { name: "LiveDictationPanel.tsx", code: playbackHighlightingLivePanel },
    { name: "LiveDictationConfig.tsx", code: playbackHighlightingLiveConfig },
    { name: "useLiveTranscript.ts", code: playbackHighlightingLiveTranscript },
    { name: "concatAudio.ts", code: playbackHighlightingConcatAudio },
  ],
  "scribe-like-me": [
    { name: "ScribeLikeMe.tsx", code: scribeLikeMeTsx },
    { name: "agent.ts", code: scribeLikeMeAgent },
  ],
  "real-time-nudge": [
    { name: "RealTimeNudge.tsx", code: realTimeNudgeTsx },
    { name: "nudgeEngine.ts", code: realTimeNudgeEngine },
    { name: "grammar.ts", code: realTimeNudgeGrammar },
    { name: "snomedAgent.ts", code: realTimeNudgeSnomedAgent },
    { name: "NudgeRuleEditor.tsx", code: realTimeNudgeRuleEditor },
  ],
};

export function getAppletSources(id: string): SourceFile[] {
  return SOURCES[id] ?? [];
}
