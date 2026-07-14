import { useState } from "react";
import { GenerateUniqueButton } from "../components/EndpointForm";
import { Button } from "../components/ui/Button";
import { Input, Label, Textarea } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Pill";

// One row in the modal. Each `Ask` is something that needs to be collected before the
// workflow can run. Two flavors:
//   - kind: "text" — render a text input. Default is the saved value (so the user can
//     just hit Run if nothing's changed). At submit we apply the value back into the
//     node's path / query / headers / body JSON.
//   - kind: "file" — render a file input. The file is added to the run's filesRef under
//     `${nodeId}.${fieldName}` so the executor picks it up.
export type Ask =
  | {
      kind: "text";
      nodeId: string;
      nodeRef: string;
      nodeLabel: string;
      label: string; // human label for this field, e.g. "path.id" or "body.identifier"
      defaultValue: string;
      // Where to write the value at run time. Discriminator drives the merge in run().
      target:
        | { kind: "path"; name: string }
        | { kind: "query"; name: string }
        | { kind: "header"; name: string }
        | { kind: "body-multipart"; name: string }
        | { kind: "body-json"; path: string[] }; // dotted path into the parsed JSON body
      hint?: string;
      multiline?: boolean;
    }
  | {
      kind: "file";
      nodeId: string;
      nodeRef: string;
      nodeLabel: string;
      label: string;
      // For binary endpoints the field is "_body". For multipart, the field name from the schema.
      fileFieldName: string;
      accept?: string;
      required?: boolean;
    };

export type PreRunValues = {
  texts: Record<string, string>; // keyed by "ask index" (stable per modal lifecycle)
  files: Record<string, File>; // same
};

export function PreRunModal({
  open,
  asks,
  onCancel,
  onRun,
}: {
  open: boolean;
  asks: Ask[];
  onCancel: () => void;
  onRun: (values: PreRunValues) => void;
}) {
  // Initialise text inputs with their defaults so "Run" is one click away on repeats.
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(asks.map((a, i) => [String(i), a.kind === "text" ? a.defaultValue : ""])),
  );
  const [files, setFiles] = useState<Record<string, File>>({});

  const required = asks.filter((a) => a.kind === "file" && (a.required ?? true));
  const missingFiles = required.filter((a) => !files[idxOf(asks, a)]).length;

  // Group by node so the user can scan the modal section-by-section.
  const groups = new Map<
    string,
    { nodeRef: string; nodeLabel: string; items: { ask: Ask; idx: number }[] }
  >();
  asks.forEach((ask, idx) => {
    const g = groups.get(ask.nodeId);
    if (g) g.items.push({ ask, idx });
    else
      groups.set(ask.nodeId, {
        nodeRef: ask.nodeRef,
        nodeLabel: ask.nodeLabel,
        items: [{ ask, idx }],
      });
  });

  return (
    <Modal open={open} onClose={onCancel} title="Run-time inputs" widthClass="max-w-2xl">
      {asks.length === 0 ? (
        <p className="text-sm text-muted-700">Nothing to ask. Click Run to continue.</p>
      ) : (
        <p className="mb-4 text-sm text-muted-700">
          The workflow needs values for these fields before it can run. Files can't be persisted, so
          they're always uploaded here. Other fields show their saved value as a default — edit if
          you want, then hit Run.
        </p>
      )}

      <div className="grid gap-4">
        {Array.from(groups.values()).map((g) => (
          <section
            key={g.nodeRef}
            className="rounded-lg border border-muted-300/60 bg-paper-muted p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Pill tone="accent">{g.nodeRef}</Pill>
              <span className="text-muted-700">{g.nodeLabel}</span>
            </div>
            <div className="grid gap-3">
              {g.items.map(({ ask, idx }) => (
                <AskRow
                  key={idx}
                  ask={ask}
                  textValue={texts[String(idx)] ?? ""}
                  onText={(v) => setTexts((cur) => ({ ...cur, [String(idx)]: v }))}
                  file={files[String(idx)]}
                  onFile={(f) =>
                    setFiles((cur) => {
                      const next = { ...cur };
                      if (f) next[String(idx)] = f;
                      else delete next[String(idx)];
                      return next;
                    })
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-muted-300/60 pt-4">
        {missingFiles > 0 && (
          <span className="mr-auto text-xs text-amber-900">
            {missingFiles} required file{missingFiles === 1 ? "" : "s"} not uploaded yet.
          </span>
        )}
        <button
          onClick={onCancel}
          className="rounded-lg border border-muted-300 bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-muted"
        >
          Cancel
        </button>
        <Button onClick={() => onRun({ texts, files })} disabled={missingFiles > 0}>
          Run workflow
        </Button>
      </div>
    </Modal>
  );
}

// Returns the modal-local index of an ask object — used as the key in texts/files maps.
function idxOf(asks: Ask[], a: Ask): string {
  return String(asks.indexOf(a));
}

function AskRow({
  ask,
  textValue,
  onText,
  file,
  onFile,
}: {
  ask: Ask;
  textValue: string;
  onText: (v: string) => void;
  file?: File;
  onFile: (f: File | undefined) => void;
}) {
  if (ask.kind === "file") {
    return (
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Label>{ask.label}</Label>
          <Pill tone="neutral">file</Pill>
          {ask.required !== false && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
              Required
            </span>
          )}
        </div>
        <input
          type="file"
          accept={ask.accept}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="text-sm"
        />
        {file && (
          <div className="text-xs text-muted-700">
            {file.name} · {Math.round(file.size / 1024)} KB
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{ask.label}</Label>
        <Pill tone="neutral">{ask.target.kind === "body-json" ? "body" : ask.target.kind}</Pill>
        <GenerateUniqueButton onGenerate={onText} />
      </div>
      {ask.multiline ? (
        <Textarea
          value={textValue}
          onChange={(e) => onText(e.target.value)}
          placeholder={ask.hint}
          rows={4}
        />
      ) : (
        <Input value={textValue} onChange={(e) => onText(e.target.value)} placeholder={ask.hint} />
      )}
      {ask.defaultValue && ask.defaultValue !== textValue && (
        <button
          onClick={() => onText(ask.defaultValue)}
          className="self-start text-[10px] text-muted-500 underline hover:text-ink"
        >
          Reset to saved default
        </button>
      )}
    </div>
  );
}
