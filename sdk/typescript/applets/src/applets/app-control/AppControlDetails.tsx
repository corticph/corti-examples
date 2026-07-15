/**
 * Details panel for the app-control applet: the abstraction behind driving the
 * application (not just text) by voice, and the native bridge it's designed for.
 */
const NOTES: { label: string; detail: string }[] = [
  {
    label: "AppControlAdapter",
    detail:
      "The application-control analog of EditorAdapter. The app registers each actionable piece (tab, panel, button, dialog action) as a named AppControl with run / isAvailable / getState. Commands resolve a spoken target to a control and run it — written once, independent of the specific UI.",
  },
  {
    label: "Application awareness",
    detail:
      "isAvailable() and getState() let commands be contextual — “confirm”/“cancel” only fire while the dialog is open — and feed the live awareness panel (active tab, panel open/closed). This is what separates a real integration from a single dictation field.",
  },
  {
    label: "Commands vs. dictation",
    detail:
      "Both halves share one mic. Command events drive the app via the registry; final transcripts insert into the focused editable (the Notes textarea) via the same EditorAdapter the other applets use.",
  },
  {
    label: "Native host seam",
    detail:
      "The same resolve-and-run contract bridges to a desktop/OS host: a NativeHostAdapter (documented, not implemented here) exposes listControls / invoke / queryState over IPC, and a thin shim maps it onto the same registry — so the integration logic runs against web or native UI unchanged.",
  },
];

export function AppControlDetails() {
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
