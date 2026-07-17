/**
 * Applet — CONCEPT: correct casing/spacing insertion into formatted content.
 *
 * Dictate into a contenteditable surface with a minimal bold/italic toolbar.
 * Insertion goes through the shared ContentEditableAdapter, which applies the
 * same casing/spacing boundary rules as the plain-text editor and inserts at the
 * caret so text inherits active formatting. Interim results are previewed below;
 * only final segments are committed.
 *
 * The contenteditable here is a deliberately minimal stand-in — the reusable
 * part is the STT integration (adapter + insertion rules), not the editor.
 */

import { Bold, Italic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import { buildDictationConfig } from "./config";
import { segmentStore } from "./segmentStore";

const LANGUAGE = "en";

export function DictationRichText() {
  const { authConfig } = useCortiAccessToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;
  const [interim, setInterim] = useState("");

  const handleTranscript = useCallback((e: CustomEvent) => {
    const data = e.detail?.data;
    if (!data || Array.isArray(data)) {
      return;
    }
    if (data.isFinal) {
      setInterim("");
      adapterRef.current?.insert(data.text, { primaryLanguage: LANGUAGE });
      segmentStore.add(data.text, data.rawTranscriptText ?? data.text);
    } else {
      setInterim(data.text);
    }
  }, []);

  const format = (style: "bold" | "italic") => {
    adapterRef.current?.applyFormat?.(style);
  };

  useEffect(() => {
    segmentStore.reset();
    adapterRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Insertion into rich text</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dictated text is spliced at the caret with correct spacing and sentence casing, inheriting
          any bold/italic formatting active at the cursor. Place your caret, toggle formatting, and
          dictate.
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => format("bold")}
          className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => format("italic")}
          className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
      </div>

      <div
        contentEditable
        suppressContentEditableWarning
        data-testid="richtext-editor"
        className={cn(
          "min-h-[260px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-corti-lime",
          "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Place_your_caret_and_start_dictating…']",
        )}
      />
      {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}

      <div className="flex justify-end">
        <CortiDictationComponent
          authConfig={authConfig}
          dictationConfig={buildDictationConfig(LANGUAGE)}
          settingsEnabled={["device", "language", "keybinding"]}
          onTranscript={handleTranscript}
        />
      </div>
    </div>
  );
}
