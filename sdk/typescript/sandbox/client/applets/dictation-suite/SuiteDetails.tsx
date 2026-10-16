/**
 * Details card for the Dictation Suite — conceptual overview of what the
 * suite combines and what a user can try, below the live demo.
 */
const FEATURES: { label: string; detail: string }[] = [
  {
    label: "Voice commands",
    detail:
      "Speak a configured phrase to trigger an editor action — bold, italic, new paragraph, delete the last segment, or insert a template. Commands fire alongside dictation, not instead of it.",
  },
  {
    label: "Text replacements",
    detail:
      'Define find-and-replace rules that rewrite spoken phrases in the final transcript, server-side. A spoken "BID" can read as "twice daily" without any post-processing.',
  },
  {
    label: "Dictionary terms",
    detail:
      "Add custom vocabulary so domain-specific words — medication names, acronyms, anatomical terms — are recognized correctly the first time, instead of needing a replacement afterward.",
  },
  {
    label: "Formatting",
    detail:
      "Control how dates, times, numbers, measurements, and ordinals appear in the transcript. Changes apply on the next recording session.",
  },
  {
    label: "Cleanup agent",
    detail:
      "Run an on-demand copy-edit on the dictated text to catch spelling, grammar, and punctuation without rewording or changing meaning. The original text is preserved and the edit is undoable.",
  },
  {
    label: "Device buttons",
    detail:
      "Map buttons on a handheld microphone (Philips SpeechMike, PowerMic, foot control) to recording start/stop or to any voice command. Buttons and speech share the same command path.",
  },
  {
    label: "Audio archive",
    detail:
      "Optionally save a local copy of the microphone audio while dictating. Archived recordings are stored in the browser and can be downloaded or played back.",
  },
  {
    label: "Draft persistence",
    detail:
      "Dictated text is saved automatically and survives navigation away from the page, browser reloads, and closing the tab. Return to the suite and the text is still there.",
  },
];

export function SuiteDetails() {
  return (
    <dl className="flex flex-col gap-3">
      {FEATURES.map((feature) => (
        <div key={feature.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {feature.label}
          </dt>
          <dd className="text-sm text-foreground">{feature.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
