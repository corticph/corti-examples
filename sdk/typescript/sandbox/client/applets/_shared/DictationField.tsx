/**
 * A minimal dictation surface: an (uncontrolled) textarea + <corti-dictation>,
 * inserting final segments at the caret with the shared casing/spacing rules.
 * Reused by config-manager applets (replacements, terms) that just need a place
 * to dictate and observe the effect of their config. Keybinding selector is
 * exposed for push/toggle-to-talk.
 */

import type { Corti } from "@corti/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { CortiDictationComponent } from "./cortiDictationReact";
import type { EditorAdapter } from "./editorAdapter";
import { useSessionState } from "./sessionState";
import { useActiveControl } from "./useActiveControl";
import { useCortiAccessToken } from "./useCortiAccessToken";
import { useDictationLanguage } from "./useDictationLanguage";

export function DictationField({
  dictationConfig,
  placeholder = "Press the microphone and start dictating…",
  rows = 8,
}: {
  dictationConfig: Corti.TranscribeConfig;
  placeholder?: string;
  rows?: number;
}) {
  const { authConfig } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;
  const [interim, setInterim] = useState("");
  const [text, setText] = useSessionState("dictationText", "");

  const syncText = useCallback(() => {
    setText(textareaRef.current?.value ?? "");
  }, [setText]);

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }
      if (data.isFinal) {
        setInterim("");
        adapterRef.current?.insert(data.text, { primaryLanguage: language });
        syncText();
      } else {
        setInterim(data.text);
      }
    },
    [language, syncText],
  );

  useEffect(() => {
    if (textareaRef.current && text) {
      textareaRef.current.value = text;
    }
    adapterRef.current?.focus();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      <div>
        <textarea
          ref={textareaRef}
          rows={rows}
          placeholder={placeholder}
          onInput={syncText}
          className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
        />
        {interim && <p className="mt-1 text-sm italic text-muted-foreground">{interim}</p>}
      </div>
      <div className="flex justify-end">
        <CortiDictationComponent
          authConfig={authConfig}
          dictationConfig={dictationConfig}
          settingsEnabled={["device", "language", "keybinding"]}
          onTranscript={handleTranscript}
          onLanguagesChanged={onLanguagesChanged}
        />
      </div>
    </div>
  );
}
