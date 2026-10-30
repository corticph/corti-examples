/**
 * Details panel for the ambient applet: explains the config toggles and the
 * ordering guarantee for diarized transcripts.
 */
const NOTES: { label: string; detail: string }[] = [
  {
    label: "Diarization",
    detail:
      "Separates speakers within a single mono stream. speakerId is a distinct integer per speaker (−1 when off) and is independent of the audio channel.",
  },
  {
    label: "Multichannel",
    detail:
      "Assigns fixed roles to audio channels (here channel 0 = doctor, channel 1 = patient). Mutually exclusive with diarization in this example.",
  },
  {
    label: "Ordering",
    detail:
      "transcript messages carry an array of final segments that can arrive out of order. They are merged and sorted by time.start (tie-break time.end), never appended in arrival order.",
  },
  {
    label: "Facts mode",
    detail:
      "When enabled, the server emits facts grouped by category instead of (well, alongside) the transcript. Facts are rendered grouped by their group field.",
  },
];

export function AmbientDetails() {
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
