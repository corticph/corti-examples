/**
 * Details panel for the raw-SDK applet: the connect → handshake → stream flow.
 */
const STEPS: { label: string; detail: string }[] = [
  {
    label: "1. Construct client",
    detail:
      "new CortiClient({ auth: { refreshAccessToken } }) — cluster and tenant are decoded from the JWT.",
  },
  {
    label: "2. Connect + config",
    detail:
      "client.transcribe.connect({ configuration }) resolves only after CONFIG_ACCEPTED, so audio is never sent before the handshake.",
  },
  {
    label: "3. Stream audio",
    detail:
      "The host captures audio with MediaRecorder and sends 250 ms frames via socket.sendAudio().",
  },
  {
    label: "4. Handle transcript",
    detail:
      "transcript messages are inserted with the shared spacing/casing helper. The connection is torn down on stop / unmount.",
  },
];

export function SdkDetails() {
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
