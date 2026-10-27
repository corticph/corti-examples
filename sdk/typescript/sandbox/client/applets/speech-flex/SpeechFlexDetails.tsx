/**
 * Details panel for the Speech Flex applet: explains the dual-mode concept
 * and the visit-schedule lifecycle, both anchored on the current live demo.
 */
const NOTES: { label: string; detail: string }[] = [
  {
    label: "Dual mode",
    detail:
      "Dictation mode uses /transcribe for self-entry speech recognition. Ambient mode uses /streams for conversational audio capture with diarized transcription and optional facts. Both operate against the same patient interaction — the clinician flexes between them via the mode toggle in the capture bar.",
  },
  {
    label: "Visit schedule",
    detail:
      "Corti interactions sorted by encounter.period.startedAt serve as the visit schedule — similar to an HL7 SIU feed in a traditional EHR integration. New visits can be created with the New visit form (patient name, MRN, scheduled time), and the selected visit can be edited or deleted from the patient context block. Selecting a visit anchors both capture modes.",
  },
  {
    label: "Interaction as anchor",
    detail:
      "Both modes share one interactionId. Dictation text persists client-side per interaction; ambient segments accumulate server-side under the interaction. Note generation offers five context sources — the interaction's server-side data, or explicit client-side context: dictation text, ambient or pasted transcript, and facts.",
  },
  {
    label: "Verbatim dictation routing",
    detail:
      "In Combined mode each template section can draw from Dictation, Ambient, and/or Facts. A Dictation Router agent assigns dictated sentences to sections by index only — the clinician's exact words are reassembled verbatim, never paraphrased — and a Dictation Merger agent weaves AI-generated content around them when a section uses both sources. If routing fails or places nothing anywhere, Dictation sections fall back to the full dictation instead of silently disappearing from the note.",
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
