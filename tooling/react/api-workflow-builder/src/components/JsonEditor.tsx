import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";

export function JsonEditor({
  value,
  onChange,
  minHeight = "200px",
  readOnly = false,
}: {
  value: string;
  onChange?: (v: string) => void;
  minHeight?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-muted-300/60">
      <CodeMirror
        value={value}
        height={minHeight}
        extensions={[json()]}
        editable={!readOnly}
        readOnly={readOnly}
        onChange={(v) => onChange?.(v)}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: !readOnly,
          foldGutter: true,
          autocompletion: false,
        }}
        theme="light"
      />
    </div>
  );
}
