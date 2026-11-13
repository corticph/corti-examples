/**
 * Details panel for the rich-text applet: summarizes the casing/spacing rules
 * applied at the insertion boundary.
 */
const RULES: { label: string; detail: string }[] = [
  {
    label: "Spacing",
    detail:
      "A single space is added between words, but not at the field start, after an opening bracket/quote, or before left-attaching punctuation ( , . : ; ! ? ) ] } % ).",
  },
  {
    label: "Casing",
    detail:
      "The first letter is capitalized at the start of the field or after sentence-ending punctuation (. ! ?). Disable this when automaticPunctuation handles casing server-side.",
  },
  {
    label: "French",
    detail: "A non-breaking space precedes : ; ! ? for fr (but not fr-CH).",
  },
  {
    label: "Interim vs final",
    detail:
      "Interim segments are previewed below the editor; only final segments are spliced into the document at the caret.",
  },
];

export function RichTextDetails() {
  return (
    <dl className="flex flex-col gap-2">
      {RULES.map((rule) => (
        <div key={rule.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {rule.label}
          </dt>
          <dd className="text-sm text-foreground">{rule.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
