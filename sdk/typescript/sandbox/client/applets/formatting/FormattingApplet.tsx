import type { RecordingStateChangedEventDetail } from "@corti/dictation-web";
import { Bold, Italic, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { useSessionState } from "../_shared/sessionState";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import { ComparisonSection } from "./ComparisonSection";
import { buildFormattingConfig } from "./config";
import { FormattingDialog } from "./FormattingDialog";
import { type FormattingCategoryKey, getCategoryByKey } from "./formattingOptions";
import { useFormattingConfig } from "./formattingStore";

export function FormattingApplet() {
  return (
    <Tabs defaultValue="single" className="w-full">
      <TabsList>
        <TabsTrigger value="single">Single dictation</TabsTrigger>
        <TabsTrigger value="comparison">Comparison</TabsTrigger>
      </TabsList>
      <TabsContent value="single">
        <SingleDictation />
      </TabsContent>
      <TabsContent value="comparison">
        <ComparisonMode />
      </TabsContent>
    </Tabs>
  );
}

function SingleDictation() {
  const { authConfig } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { config: formattingConfig, setConfig, reset } = useFormattingConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;
  const [interim, setInterim] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFormattingKey, setActiveFormattingKey] = useState<string>("");
  const [editorHtml, setEditorHtml] = useSessionState("editorHtml", "");

  const syncHtml = useCallback(() => {
    setEditorHtml(editorRef.current?.innerHTML ?? "");
  }, [setEditorHtml]);

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }
      if (data.isFinal) {
        setInterim("");
        adapterRef.current?.insert(data.text, { primaryLanguage: language });
        syncHtml();
      } else {
        setInterim(data.text);
      }
    },
    [language, syncHtml],
  );

  const format = (style: "bold" | "italic") => {
    adapterRef.current?.applyFormat?.(style);
    syncHtml();
  };

  const dictationConfig = useMemo(
    () => buildFormattingConfig(language, formattingConfig),
    [language, formattingConfig],
  );

  const formattingKey = JSON.stringify(formattingConfig);
  const formattingChanged = activeFormattingKey !== "" && activeFormattingKey !== formattingKey;

  const handleRecordingStateChanged = useCallback(
    (e: CustomEvent<RecordingStateChangedEventDetail>) => {
      if (e.detail?.state === "recording") {
        setActiveFormattingKey(formattingKey);
      }
    },
    [formattingKey],
  );

  useEffect(() => {
    if (editorRef.current && editorHtml) {
      editorRef.current.innerHTML = editorHtml;
    }
    adapterRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Formatting preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how dates, times, numbers, measurements, and ordinals appear in your transcript.
          Changes apply on the next recording session — dictate, adjust, then dictate again to see
          the difference.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Settings2 className="h-4 w-4" />
          Formatting settings
        </button>
        {formattingChanged && (
          <span className="text-xs text-muted-foreground">Restart recording to apply changes</span>
        )}
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
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-testid="formatting-editor"
        onInput={syncHtml}
        className={cn(
          "min-h-[260px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-corti-lime",
          "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Place_your_caret_and_start_dictating…']",
        )}
      />
      {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}

      <div className="flex justify-end">
        <CortiDictationComponent
          authConfig={authConfig}
          dictationConfig={dictationConfig}
          settingsEnabled={["device", "language", "keybinding"]}
          onTranscript={handleTranscript}
          onRecordingStateChanged={handleRecordingStateChanged}
          onLanguagesChanged={onLanguagesChanged}
        />
      </div>

      <FormattingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={formattingConfig}
        onChange={setConfig}
        onReset={reset}
      />
    </div>
  );
}

function ComparisonMode() {
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<FormattingCategoryKey>("dates");
  const selectedCategory = getCategoryByKey(selectedCategoryKey);

  return (
    <ComparisonSection
      selectedCategory={selectedCategory}
      onSelectCategory={(cat) => setSelectedCategoryKey(cat.key)}
    />
  );
}
