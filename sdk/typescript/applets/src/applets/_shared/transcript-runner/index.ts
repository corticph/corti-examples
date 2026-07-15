/**
 * Shared offline `/transcripts` runner: state hook, REST helpers, transcript
 * model, and presentational surfaces. Consumed by the file-transcription and
 * second-pass-agent applets; neither depends on the other.
 */
export * from "./model";
export * from "./transcripts-api";
export { useTranscriptRunner } from "./useTranscriptRunner";
export type { GenerateOptions, TranscriptRunner } from "./useTranscriptRunner";
export { TranscriptRunnerForm } from "./TranscriptRunnerForm";
export type { TranscriptRunnerFormProps } from "./TranscriptRunnerForm";
export {
  TranscriptRunMetadata,
  TranscriptOutputCard,
  TranscriptJsonDialog,
} from "./TranscriptResults";
