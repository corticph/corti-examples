/**
 * Shared offline `/transcripts` runner: state hook, REST helpers, transcript
 * model, and presentational surfaces. Consumed by the file-transcription and
 * second-pass-agent applets; neither depends on the other.
 */
export * from "./model";
export {
  TranscriptJsonDialog,
  TranscriptOutputCard,
  TranscriptRunMetadata,
} from "./TranscriptResults";
export type { TranscriptRunnerFormProps } from "./TranscriptRunnerForm";
export { TranscriptRunnerForm } from "./TranscriptRunnerForm";
export * from "./transcripts-api";
export type { GenerateOptions, TranscriptRunner } from "./useTranscriptRunner";
export { useTranscriptRunner } from "./useTranscriptRunner";
