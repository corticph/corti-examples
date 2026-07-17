/**
 * Applet — CONCEPT: handheld-mic (WebHID) button mapping.
 *
 * Connect a Philips SpeechMike / Foot Control / PowerMic and map any of its
 * buttons to an action: toggle-to-talk recording, push-to-talk recording, or a
 * (local) command by id. Mappings are global — they apply across every dictation
 * and ambient applet — but only fire on a surface once the handheld device is
 * selected as that surface's microphone.
 *
 * Buttons are learned by pressing them (press → captured by name), which only
 * surfaces the buttons a device actually has.
 */

import { CircleAlert, Gamepad2, Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initDeviceManager } from "../_shared/dictation-device";
import {
  type ButtonAction,
  type ButtonMappings,
  buttonName,
  DEVICE_BUTTONS,
} from "../_shared/hid-recording";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationDevice } from "../_shared/useDictationDevice";
import { cn } from "../_shared/utils";
import {
  setIdentity as setCommandStoreIdentity,
  useCommandStore,
} from "../dictation-commands/command-store";

type ActionKind = ButtonAction["type"];

const ACTION_LABELS: Record<ActionKind, string> = {
  toggle: "Toggle-to-talk recording",
  push: "Push-to-talk recording",
  command: "Run command",
};

/** Mapped bits in catalog order, with any unknown bits appended. */
function orderedBits(mappings: ButtonMappings): number[] {
  const mapped = Object.keys(mappings).map(Number);
  const known = DEVICE_BUTTONS.map((b) => b.bit).filter((bit) => mapped.includes(bit));
  const unknown = mapped.filter((bit) => !known.includes(bit));
  return [...known, ...unknown];
}

export function DeviceButtons() {
  const {
    isAvailable,
    sdkStatus,
    isRequesting,
    error,
    devices,
    mappings,
    learning,
    lastButton,
    requestDevice,
    setMappings,
    startLearning,
    cancelLearning,
  } = useDictationDevice();

  const { clientId, tenantName } = useCortiAccessToken();
  const { commands } = useCommandStore();

  useEffect(() => {
    initDeviceManager();
  }, []);

  useEffect(() => {
    setCommandStoreIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  if (!isAvailable) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-variant-warning-border bg-variant-warning-bg p-4 text-sm text-variant-warning-text">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">WebHID not available</p>
          <p>
            Handheld-mic buttons use the WebHID API, supported in Chromium browsers (Chrome, Edge)
            over a secure context. Open this page in Chrome or Edge to configure a device.
          </p>
        </div>
      </div>
    );
  }

  const connected = devices.length > 0;
  const bits = orderedBits(mappings);

  const setAction = (bit: number, kind: ActionKind) => {
    const current = mappings[bit];
    const action: ButtonAction =
      kind === "command"
        ? {
            type: "command",
            commandId: current?.type === "command" ? current.commandId : (commands[0]?.id ?? ""),
          }
        : { type: kind };
    setMappings({ ...mappings, [bit]: action });
  };

  const setCommandId = (bit: number, commandId: string) =>
    setMappings({ ...mappings, [bit]: { type: "command", commandId } });

  const removeMapping = (bit: number) => {
    const next = { ...mappings };
    delete next[bit];
    setMappings(next);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Gamepad2 className="h-4 w-4 text-corti-lime" />
          Handheld mic buttons
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Map buttons on a Philips SpeechMike (or Foot Control / PowerMic) to recording or commands.
          Mappings apply in every dictation and ambient applet, and activate on a surface once you
          pick the device as its microphone.
        </p>
      </div>

      {/* Connection */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void requestDevice()}
          disabled={isRequesting}
        >
          {isRequesting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="mr-1.5 h-3.5 w-3.5" />
          )}
          {connected ? "Connect another device" : "Connect device"}
        </Button>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            connected ? "text-variant-success-text" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-variant-success-text" : "bg-muted-foreground/50",
            )}
          />
          {connected ? devices.map((d) => d.label).join(", ") : "No device connected"}
        </span>
      </div>

      {/* Mappings */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Button mappings</div>
        {bits.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No buttons mapped. Add one below.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {bits.map((bit) => {
              const action = mappings[bit];
              return (
                <div key={bit} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                    {buttonName(bit)}
                  </span>
                  <Select
                    value={action.type}
                    onValueChange={(v) => setAction(bit, v as ActionKind)}
                  >
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACTION_LABELS) as ActionKind[]).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {ACTION_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {action.type === "command" && (
                    <Select value={action.commandId} onValueChange={(v) => setCommandId(bit, v)}>
                      <SelectTrigger className="h-8 w-52">
                        <SelectValue placeholder="Select command…" />
                      </SelectTrigger>
                      <SelectContent>
                        {commands.length === 0 && (
                          <SelectItem value="" disabled>
                            No commands configured
                          </SelectItem>
                        )}
                        {commands.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMapping(bit)}
                    aria-label={`Remove ${buttonName(bit)} mapping`}
                    className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {learning ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-corti-lime/60 bg-corti-lime/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Press a button on your device…
            </span>
            <Button variant="ghost" size="sm" onClick={cancelLearning}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={startLearning} disabled={!connected}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add mapping
          </Button>
        )}
      </div>

      {/* Live monitor */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Last button:</span>
        {lastButton ? (
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-foreground">
            {lastButton.label}
          </span>
        ) : (
          <span className="italic">press a button on the device to test the connection</span>
        )}
      </div>

      {sdkStatus === "missing" && error && (
        <p className="text-xs text-variant-error-text">{error}</p>
      )}
    </div>
  );
}
