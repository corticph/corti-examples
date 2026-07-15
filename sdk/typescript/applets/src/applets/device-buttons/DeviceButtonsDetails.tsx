/**
 * Details panel for the device-buttons applet: how WebHID button control works
 * and how activation is gated on mic selection.
 */
const STEPS: { label: string; detail: string }[] = [
  {
    label: "1. Connect",
    detail:
      "Connect device opens the browser's WebHID picker. The dictation_support library recognizes Philips SpeechMike / SpeechOne / PowerMic / Foot Control and reports semantic button events (Record, Stop, Play, F1–F4…). Granted devices reconnect automatically on reload.",
  },
  {
    label: "2. Add mappings",
    detail:
      "Add mapping captures the next button you press (so only real buttons appear), then assign it an action: toggle-to-talk recording, push-to-talk recording, or a command. Record → toggle is mapped by default. Mappings persist per API client and are shared across all applets.",
  },
  {
    label: "3. Select as microphone",
    detail:
      "Buttons stay inert until the handheld device is chosen as the microphone in a surface's device dropdown. This keeps the built-in mic unaffected and ties the buttons to the device you are actually recording with.",
  },
  {
    label: "4. Record / command",
    detail:
      "A recording button drives that surface's start/stop/toggle (the same methods the on-screen button and keybindings use), in both dictation and ambient applets. A command button dispatches its command id locally in the dictation-commands applet — the API does not yet execute button-triggered commands.",
  },
];

export function DeviceButtonsDetails() {
  return (
    <div className="space-y-4">
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
      <p className="text-xs text-muted-foreground">
        Requires a Chromium browser (Chrome / Edge) over a secure context;
        WebHID is unavailable in Firefox and Safari.
      </p>
    </div>
  );
}
