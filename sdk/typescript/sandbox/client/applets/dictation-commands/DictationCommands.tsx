/**
 * Applet — CONCEPT: executable voice commands.
 *
 * Dictate into a plain <textarea> via <corti-dictation>, and turn `command`
 * events into real editor actions. Commands are data-driven (managed in the
 * details card / command store), routed through the shared dispatcher, and
 * dictation-segment ranges are kept valid across typing, dictation, and commands
 * via the offset-map. Each executed command is pushed to the debugger log.
 */

import type { Corti } from "@corti/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchCommand } from "../_shared/commandDispatch";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { diffEdit, type Range, transformRanges } from "../_shared/offsetMap";
import { useSessionState } from "../_shared/sessionState";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useHidCommandCatalog, useHidCommandHandler } from "../_shared/useDictationDevice";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { buildRegistry, TEMPLATES, toTranscribeCommands } from "./commandModel";
import { logCommand, setIdentity, useCommandStore } from "./commandStore";
import { buildDictationConfig } from "./config";

export function DictationCommands() {
  const { authConfig, clientId, tenantName } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { commands } = useCommandStore();

  // Associate saved commands with this API client (clientId+tenant).
  useEffect(() => {
    setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const historyRef = useRef<Range[]>([]);
  const prevTextRef = useRef("");
  const [interim, setInterim] = useState("");
  const [dictText, setDictText] = useSessionState("dictationText", "");

  const registry = useMemo(() => buildRegistry(commands), [commands]);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const dictationConfig = useMemo(
    () => buildDictationConfig(language, toTranscribeCommands(commands)),
    [language, commands],
  );

  const reconcile = useCallback((a: EditorAdapter) => {
    const next = a.getText();
    const edit = diffEdit(prevTextRef.current, next);
    if (edit) {
      historyRef.current = transformRanges(historyRef.current, edit);
    }
    prevTextRef.current = next;
  }, []);

  const syncText = useCallback(() => {
    setDictText(textareaRef.current?.value ?? "");
  }, [setDictText]);

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }
      const a = adapterRef.current;
      if (!a) {
        return;
      }
      if (data.isFinal) {
        setInterim("");
        const inserted = a.insert(data.text, { primaryLanguage: language });
        reconcile(a);
        historyRef.current = [...historyRef.current, inserted];
        prevTextRef.current = a.getText();
        syncText();
      } else {
        setInterim(data.text);
      }
    },
    [reconcile, syncText],
  );

  const handleCommand = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      const a = adapterRef.current;
      if (!data || !a) {
        return;
      }
      const outcome = dispatchCommand(a, data, registryRef.current, {
        history: historyRef.current,
        templates: TEMPLATES,
        primaryLanguage: language,
      });
      logCommand({
        id: data.id,
        variables: data.variables,
        description: outcome.description,
      });
      reconcile(a);
    },
    [reconcile],
  );

  // A handheld-mic button mapped to a command dispatches the same way locally
  // (the API does not execute button commands), as if the command were spoken.
  const handleHidCommand = useCallback(
    (commandId: string) => {
      const a = adapterRef.current;
      if (!a) {
        return;
      }
      const data = {
        id: commandId,
        variables: {},
      } as Corti.TranscribeCommandData;
      const outcome = dispatchCommand(a, data, registryRef.current, {
        history: historyRef.current,
        templates: TEMPLATES,
        primaryLanguage: language,
      });
      logCommand({ id: commandId, description: outcome.description });
      reconcile(a);
    },
    [reconcile],
  );
  useHidCommandHandler(handleHidCommand);
  useHidCommandCatalog(
    "dictation-commands",
    useMemo(() => commands.map((c) => ({ id: c.id, label: c.id })), [commands]),
  );

  const handleInput = useCallback(() => {
    const a = adapterRef.current;
    if (a) {
      reconcile(a);
    }
    syncText();
  }, [reconcile, syncText]);

  useEffect(() => {
    adapterRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el && dictText) {
      el.value = dictText;
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Executable dictation commands</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When a defined command phrase is recognized, the application receives a command event and
          responds with a real editor action. Manage the full set — and add your own — below.
        </p>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          onInput={handleInput}
          rows={12}
          placeholder="Press the microphone and start dictating…"
          className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
        />
        {interim && <p className="mt-1 text-sm italic text-muted-foreground">{interim}</p>}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{commands.length} commands configured</span>
        <CortiDictationComponent
          authConfig={authConfig}
          dictationConfig={dictationConfig}
          settingsEnabled={["device", "language", "keybinding"]}
          onTranscript={handleTranscript}
          onCommand={handleCommand}
          onLanguagesChanged={onLanguagesChanged}
        />
      </div>
    </div>
  );
}
