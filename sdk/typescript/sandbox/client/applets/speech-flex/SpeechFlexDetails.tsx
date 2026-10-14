/**
 * Details panel for the Speech Flex applet: explains the dual-mode concept.
 */
const NOTES: { label: string; detail: string }[] = [
  {
    label: "Dual mode",
    detail:
      "Dictation mode uses /transcribe for self-entry speech recognition. Ambient mode uses /streams for conversational audio capture with diarized transcription. Both operate against the same patient interaction — the clinician flexes between them via a toggle switch.",
  },
  {
    label: "Visit schedule",
    detail:
      "Corti interactions sorted by encounter.period.startedAt serve as the visit schedule. Each visit is a patient encounter with an MRN, encounter type, and scheduled time — similar to an HL7 SIU feed in a traditional EHR integration.",
  },
  {
    label: "Interaction as anchor",
    detail:
      "Both modes share one interactionId. Dictation text persists client-side per interaction; ambient segments accumulate server-side under the interaction. Note generation reads from the interaction's stored data.",
  },
  {
    label: "Auto-select",
    detail:
      "A visit can be auto-selected by MRN or encounter identifier — matching an open patient chart to a scheduled visit. In the sandbox this is manual; in a real EHR it would be driven by context passed from the host application.",
  },
];

export function SpeechFlexDetails() {
  return (
    <dl className="flex flex-col gap-2">
      {NOTES.map((note) => (
        <div key={note.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {note.label}
          </dt>
          <dd className="text-sm text-foreground">{note.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
