const STEPS: { label: string; detail: string }[] = [
  {
    label: "Why raw SDK",
    detail:
      "This example uses raw @corti/sdk because the host owns MediaRecorder directly. That makes the outgoing microphone blobs available for local archiving without depending on web-component internals.",
  },
  {
    label: "1. Connect + handshake",
    detail:
      "client.transcribe.connect({ configuration }) resolves only after CONFIG_ACCEPTED, so recording never starts streaming before the socket is ready.",
  },
  {
    label: "2. Record, pause, flush",
    detail:
      "Record starts or resumes the same websocket session. Stop recording pauses the microphone, flushes the recorder buffer, and sends a websocket flush so the session stays open for the next push-to-talk segment.",
    },
  {
    label: "3. Fan out each blob",
    detail:
      "Every MediaRecorder chunk is used twice: appended to the local archive seam and sent to Corti via socket.sendAudio(). Across pause/resume, those chunks aggregate into one session archive with multiple segments.",
  },
  {
    label: "4. End session explicitly",
    detail:
      "End session or refresh sends the terminal end message, closes the socket, and persists the finalized Blob into IndexedDB with MIME and device metadata. Navigating away does the same teardown.",
  },
];

export function AudioArchiveDetails() {
  return (
    <ol className="flex flex-col gap-2">
      {STEPS.map((step) => (
        <li key={step.label} className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {step.label}
          </span>
          <span className="text-sm text-foreground">{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}
