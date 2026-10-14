/**
 * Details panel for the dictation-box applet: the integration model behind the
 * "speech-enable the active control" + dictation-box workflow.
 */
const NOTES: { label: string; detail: string }[] = [
  {
    label: "Active control",
    detail:
      "Final dictation inserts at the caret of whichever editable field is focused — exactly like typing. useActiveControl tracks the focused control and exposes it as an EditorAdapter, so the same insertion logic drives every field.",
  },
  {
    label: "Box-target override",
    detail:
      "“target dictation box” routes dictation into the box without moving focus: the form field keeps the caret and lime border while the box shows a “Receiving dictation” badge. The override clears when you focus another field (click or “go to {field}”) or on transfer.",
  },
  {
    label: "Transfer",
    detail:
      "“transfer text” inserts the box's text at the caret of the last-active form field (with the shared spacing/casing rules), then clears the box. “Last-active form field” is tracked separately from the box via a focusin listener.",
  },
  {
    label: "Form navigation",
    detail:
      "“go to {field}” focuses a text field (caret to end) or opens a dropdown; “pick|choose|option {number}” selects an option by index. The dropdown is a custom listbox — native <select> can't be opened or picked-by-index programmatically. Generalizing field control into an AppControlAdapter is the next phase.",
  },
];

export function BoxDetails() {
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
