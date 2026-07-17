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
import { dispatchCommand } from "../_shared/command-dispatch";
import { CortiDictationComponent } from "../_shared/corti-dictation-react";
import type { EditorAdapter } from "../_shared/editor-adapter";
import { diffEdit, type Range, transformRanges } from "../_shared/offset-map";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useHidCommandHandler } from "../_shared/useDictationDevice";
import { buildRegistry, TEMPLATES, toTranscribeCommands } from "./command-model";
import { logCommand, setIdentity, useCommandStore } from "./command-store";
import { buildDictationConfig } from "./config";

const LANGUAGE = "en";

export function DictationCommands() {
  const { authConfig, clientId, tenantName } = useCortiAccessToken();
  const { commands } = useCommandStore();

  // Associate saved commands with this API client (clientId+tenant).
  useEffect(() => {
    setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const historyRef = useRef<Range[]>([]);
  const prevTextRef = useRef("");
  const [interim, setInterim] = useState("");

  const registry = useMemo(() => buildRegistry(commands), [commands]);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const dictationConfig = useMemo(
    () => buildDictationConfig(LANGUAGE, toTranscribeCommands(commands)),
    [commands],
  );

  const reconcile = useCallback((a: EditorAdapter) => {
    const next = a.getText();
    const edit = diffEdit(prevTextRef.current, next);
    if (edit) {
      historyRef.current = transformRanges(historyRef.current, edit);
    }
    prevTextRef.current = next;
  }, []);

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
        const inserted = a.insert(data.text, { primaryLanguage: LANGUAGE });
        reconcile(a);
        historyRef.current = [...historyRef.current, inserted];
        prevTextRef.current = a.getText();
      } else {
        setInterim(data.text);
      }
    },
    [reconcile],
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
        primaryLanguage: LANGUAGE,
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
        primaryLanguage: LANGUAGE,
      });
      logCommand({ id: commandId, description: outcome.description });
      reconcile(a);
    },
    [reconcile],
  );
  useHidCommandHandler(handleHidCommand);

  const handleInput = useCallback(() => {
    const a = adapterRef.current;
    if (a) {
      reconcile(a);
    }
  }, [reconcile]);

  useEffect(() => {
    adapterRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Executable dictation commands</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dictate into the editor, then speak a configured command. Each command maps to a real
          editor action; manage the full set — and add your own — in the command manager below.
        </p>
      </div>

      <div className="relative">
        <textarea
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
        />
      </div>
    </div>
  );
}
