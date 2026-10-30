/**
 * Applet — CONCEPT: handheld-mic (WebHID) button mapping.
 *
 * Connect a Philips SpeechMike / Foot Control / PowerMic and map any of its
 * buttons to an action: toggle-to-talk recording, push-to-talk recording, or a
 * (local) command by id. Mappings have two layers:
 *
 * - Global: the source of truth, edited when this component is standalone
 *   (activeAppletId is null). Persisted per API client.
 * - Per-applet overrides: edited when this component is embedded in an applet
 *   that registered a command catalog. Overrides shadow the global mapping for
 *   the same button while that applet is active; buttons without overrides
 *   fall back to global.
 *
 * Standalone mode shows two kinds of sections:
 * - "Global mappings" — editable, with add/remove/learn.
 * - One section per applet that has persisted overrides — read-only, with a
 *   trash icon to delete individual overrides.
 *
 * Embedded mode (inside a dictation applet) shows the effective mappings
 * (override ?? global) in a single list, with global rows read-only and
 * override rows editable.
 *
 * The command dropdown reads the active applet's catalog from the device store.
 * Commands not in the active catalog are shown greyed out with
 * "(unavailable in this app)". Mappings only fire on a surface once the
 * handheld device is selected as that surface's microphone.
 *
 * Buttons are learned by pressing them (press -> captured by name), which only
 * surfaces the buttons a device actually has.
 */

import { CircleAlert, Gamepad2, Loader2, Plug, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initDeviceManager, registerCommandCatalog } from "../_shared/dictationDevice";
import {
  type ButtonAction,
  type ButtonMappings,
  buttonName,
  DEVICE_BUTTONS,
} from "../_shared/hidRecording";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationDevice } from "../_shared/useDictationDevice";
import { cn } from "../_shared/utils";
import type { ManagedCommand } from "../dictation-commands/commandModel";
import {
  setIdentity as setCommandStoreIdentity,
  useCommandStore,
} from "../dictation-commands/commandStore";
import { deleteOverride, listAllOverrides } from "./mappingStore";

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

/** The commandStore catalog as CommandCatalogEntry[], for the standalone default. */
function commandStoreCatalog(commands: ManagedCommand[]) {
  return commands.map((c) => ({ id: c.id, label: c.id }));
}

export function DeviceButtons() {
  const {
    isAvailable,
    isRequesting,
    error,
    devices,
    mappings,
    globalMappings,
    overrideBits,
    activeAppletId,
    activeCatalog,
    learning,
    lastButton,
    requestDevice,
    setGlobalMappings: setGlobals,
    setButtonOverride,
    clearAllOverrides,
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

  const isStandalone = activeAppletId === null;

  // In standalone mode, load all persisted applet overrides so they can be
  // shown as separate sections. Refreshed after any deletion.
  const [allOverrides, setAllOverrides] = useState<Record<string, ButtonMappings>>({});
  useEffect(() => {
    if (isStandalone) {
      setAllOverrides(listAllOverrides());
    }
  }, [isStandalone]);

  const deleteAppletOverride = (appletId: string, bit: number) => {
    deleteOverride(appletId, bit);
    setAllOverrides(listAllOverrides());
  };

  const standaloneCatalog = useMemo(() => commandStoreCatalog(commands), [commands]);
  useEffect(() => {
    if (!isStandalone) {
      return;
    }
    const unregister = registerCommandCatalog({
      appletId: "device-buttons",
      commands: standaloneCatalog,
    });
    return () => unregister();
  }, [isStandalone, standaloneCatalog]);

  const availableCommandIds = useMemo(() => {
    const catalog = activeCatalog;
    if (catalog) {
      return new Set(catalog.commands.map((c) => c.id));
    }
    return new Set(commands.map((c) => c.id));
  }, [activeCatalog, commands]);

  const dropdownCommands = useMemo(() => {
    const catalog = activeCatalog;
    if (catalog) {
      return catalog.commands;
    }
    return commandStoreCatalog(commands);
  }, [activeCatalog, commands]);

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

  const setAction = (bit: number, kind: ActionKind) => {
    const current = mappings[bit];
    const firstId = dropdownCommands[0]?.id ?? "";
    const action: ButtonAction =
      kind === "command"
        ? {
            type: "command",
            commandId: current?.type === "command" ? current.commandId : firstId,
          }
        : { type: kind };
    writeMapping(bit, action);
  };

  const setCommandId = (bit: number, commandId: string) =>
    writeMapping(bit, { type: "command", commandId });

  const removeMapping = (bit: number) => {
    if (isStandalone) {
      const next = { ...globalMappings };
      delete next[bit];
      setGlobals(next);
    } else {
      setButtonOverride(bit, null);
    }
  };

  const resetToGlobal = (bit: number) => {
    setButtonOverride(bit, null);
  };

  function writeMapping(bit: number, action: ButtonAction) {
    if (isStandalone) {
      setGlobals({ ...globalMappings, [bit]: action });
    } else {
      setButtonOverride(bit, action);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Gamepad2 className="h-4 w-4 text-corti-lime" />
          Handheld mic buttons
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Map buttons on a Philips SpeechMike (or Foot Control / PowerMic) to recording or commands.
          {isStandalone
            ? " Global mappings apply in every applet; applet overrides are listed below."
            : " Mappings set here override the global defaults for this applet."}
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
      {isStandalone ? (
        <StandaloneMappings
          globalMappings={globalMappings}
          allOverrides={allOverrides}
          availableCommandIds={availableCommandIds}
          dropdownCommands={dropdownCommands}
          connected={connected}
          learning={learning}
          onStartLearning={startLearning}
          onCancelLearning={cancelLearning}
          setAction={setAction}
          setCommandId={setCommandId}
          removeMapping={removeMapping}
          deleteAppletOverride={deleteAppletOverride}
        />
      ) : (
        <EmbeddedMappings
          mappings={mappings}
          globalMappings={globalMappings}
          overrideBits={overrideBits}
          activeAppletId={activeAppletId}
          availableCommandIds={availableCommandIds}
          dropdownCommands={dropdownCommands}
          connected={connected}
          learning={learning}
          onStartLearning={startLearning}
          onCancelLearning={cancelLearning}
          clearAllOverrides={clearAllOverrides}
          setAction={setAction}
          setCommandId={setCommandId}
          removeMapping={removeMapping}
          resetToGlobal={resetToGlobal}
          writeMapping={writeMapping}
        />
      )}

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

      {error && <p className="text-xs text-variant-error-text">{error}</p>}
    </div>
  );
}

/* ---- Standalone view: separate sections for global + each applet ---- */

function StandaloneMappings(props: {
  globalMappings: ButtonMappings;
  allOverrides: Record<string, ButtonMappings>;
  availableCommandIds: Set<string>;
  dropdownCommands: { id: string; label: string }[];
  connected: boolean;
  learning: boolean;
  onStartLearning: () => void;
  onCancelLearning: () => void;
  setAction: (bit: number, kind: ActionKind) => void;
  setCommandId: (bit: number, commandId: string) => void;
  removeMapping: (bit: number) => void;
  deleteAppletOverride: (appletId: string, bit: number) => void;
}) {
  const globalBits = orderedBits(props.globalMappings);

  return (
    <div className="space-y-3">
      {/* Global mappings */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Global mappings</span>
        {globalBits.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No global buttons mapped. Add one below.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {globalBits.map((bit) => {
              const action = props.globalMappings[bit];
              const commandUnavailable =
                action.type === "command" && !props.availableCommandIds.has(action.commandId);
              return (
                <div key={bit} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                    {buttonName(bit)}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    global
                  </span>
                  <Select
                    value={action.type}
                    onValueChange={(v) => props.setAction(bit, v as ActionKind)}
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
                    <Select
                      value={action.commandId}
                      onValueChange={(v) => props.setCommandId(bit, v)}
                    >
                      <SelectTrigger className={cn("h-8 w-52", commandUnavailable && "opacity-50")}>
                        <SelectValue placeholder="Select command…" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.dropdownCommands.length === 0 && (
                          <SelectItem value="" disabled>
                            No commands configured
                          </SelectItem>
                        )}
                        {props.dropdownCommands.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <button
                    type="button"
                    onClick={() => props.removeMapping(bit)}
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
        {props.learning ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-corti-lime/60 bg-corti-lime/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Press a button on your device…
            </span>
            <Button variant="ghost" size="sm" onClick={props.onCancelLearning}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={props.onStartLearning}
            disabled={!props.connected}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add global mapping
          </Button>
        )}
      </div>

      {/* Applet overrides */}
      {Object.entries(props.allOverrides).map(([appletId, overrides]) => {
        const bits = orderedBits(overrides);
        if (bits.length === 0) {
          return null;
        }
        return (
          <div key={appletId} className="space-y-2">
            <span className="text-sm font-medium text-foreground">{appletId} overrides</span>
            <div className="divide-y divide-border rounded-md border border-border">
              {bits.map((bit) => {
                const action = overrides[bit];
                const globalAction = props.globalMappings[bit];
                return (
                  <div key={bit} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                      {buttonName(bit)}
                    </span>
                    {globalAction && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        override
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {ACTION_LABELS[action.type]}
                    </span>
                    {action.type === "command" && (
                      <span className="text-sm text-foreground">{action.commandId}</span>
                    )}
                    {globalAction && (
                      <span className="text-xs text-muted-foreground">
                        (global: {ACTION_LABELS[globalAction.type]}
                        {globalAction.type === "command" ? ` ${globalAction.commandId}` : ""})
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => props.deleteAppletOverride(appletId, bit)}
                      aria-label={`Remove ${appletId} override for ${buttonName(bit)}`}
                      className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Embedded view: effective mappings in one list ---- */

function EmbeddedMappings(props: {
  mappings: ButtonMappings;
  globalMappings: ButtonMappings;
  overrideBits: number[];
  activeAppletId: string | null;
  availableCommandIds: Set<string>;
  dropdownCommands: { id: string; label: string }[];
  connected: boolean;
  learning: boolean;
  onStartLearning: () => void;
  onCancelLearning: () => void;
  clearAllOverrides: () => void;
  setAction: (bit: number, kind: ActionKind) => void;
  setCommandId: (bit: number, commandId: string) => void;
  removeMapping: (bit: number) => void;
  resetToGlobal: (bit: number) => void;
  writeMapping: (bit: number, action: ButtonAction) => void;
}) {
  const bits = orderedBits(props.mappings);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Button mappings — {props.activeAppletId}
        </span>
        {props.overrideBits.length > 0 && (
          <button
            type="button"
            onClick={props.clearAllOverrides}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset all to global
          </button>
        )}
      </div>
      {bits.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No buttons mapped. Add one below.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {bits.map((bit) => {
            const action = props.mappings[bit];
            const isOverride = props.overrideBits.includes(bit);
            const hasGlobal = Boolean(props.globalMappings[bit]);
            const isGlobalRow = !isOverride;
            const commandUnavailable =
              action.type === "command" && !props.availableCommandIds.has(action.commandId);
            return (
              <div key={bit} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                  {buttonName(bit)}
                </span>
                {isOverride && hasGlobal && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    override
                  </span>
                )}
                {isGlobalRow && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    global
                  </span>
                )}
                {isGlobalRow ? (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {ACTION_LABELS[action.type]}
                    </span>
                    {action.type === "command" && (
                      <span
                        className={cn(
                          "text-sm",
                          commandUnavailable
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {action.commandId}
                        {commandUnavailable ? " (unavailable)" : ""}
                      </span>
                    )}
                    <div className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => props.writeMapping(bit, { ...action })}
                        className="text-xs"
                      >
                        Override
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Select
                      value={action.type}
                      onValueChange={(v) => props.setAction(bit, v as ActionKind)}
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
                      <Select
                        value={action.commandId}
                        onValueChange={(v) => props.setCommandId(bit, v)}
                      >
                        <SelectTrigger
                          className={cn("h-8 w-52", commandUnavailable && "opacity-50")}
                        >
                          <SelectValue placeholder="Select command…" />
                        </SelectTrigger>
                        <SelectContent>
                          {props.dropdownCommands.length === 0 && (
                            <SelectItem value="" disabled>
                              No commands configured
                            </SelectItem>
                          )}
                          {props.dropdownCommands.map((c) => {
                            const unavailable = !props.availableCommandIds.has(c.id);
                            return (
                              <SelectItem key={c.id} value={c.id} disabled={unavailable}>
                                {c.id}
                                {unavailable ? " (unavailable in this app)" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {isOverride && props.globalMappings[bit] ? (
                        <button
                          type="button"
                          onClick={() => props.resetToGlobal(bit)}
                          aria-label={`Reset ${buttonName(bit)} to global`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => props.removeMapping(bit)}
                          aria-label={`Remove ${buttonName(bit)} mapping`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {props.learning ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-corti-lime/60 bg-corti-lime/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Press a button on your device…
          </span>
          <Button variant="ghost" size="sm" onClick={props.onCancelLearning}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={props.onStartLearning}
          disabled={!props.connected}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add mapping
        </Button>
      )}
    </div>
  );
}
