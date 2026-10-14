import { CalendarRange, Loader2, Plus, X } from "lucide-react";
import { CortiClient } from "@corti/sdk";
import { Button } from "@/components/ui/button";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useSessionState } from "../_shared/sessionState";
import {
  type Encounter,
  runEncounterTracker,
  useEncounterTrackerStore,
} from "./api";

const SYSTEM_LABELS: Record<string, string> = {
  "icd10cm-outpatient": "ICD-10-CM",
  "icd10cm-inpatient": "ICD-10-CM (inp.)",
  icd10pcs: "ICD-10-PCS",
  cpt: "CPT",
  "snomed-ct": "SNOMED CT",
  loinc: "LOINC",
  hcpcs: "HCPCS",
};

let nextId = 1;
function makeEncounter(label: string): Encounter {
  return { id: String(nextId++), label, text: "" };
}

const DEFAULT_ENCOUNTERS: Encounter[] = [
  makeEncounter("Visit 1"),
  makeEncounter("Visit 2"),
];

export function EncounterTracker() {
  const { status, results, error } = useEncounterTrackerStore();
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [encounters, setEncounters] = useSessionState<Encounter[]>(
    "encounters",
    DEFAULT_ENCOUNTERS,
  );
  const busy = status === "running";

  const update = (id: string, patch: Partial<Encounter>) => {
    setEncounters((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  };

  const addEncounter = () => {
    if (encounters.length >= 4) {
      return;
    }
    setEncounters((prev) => [
      ...prev,
      makeEncounter(`Visit ${prev.length + 1}`),
    ]);
  };

  const removeEncounter = (id: string) => {
    setEncounters((prev) => prev.filter((e) => e.id !== id));
  };

  const filledCount = encounters.filter((e) => e.text.trim()).length;

  // Build the code matrix from results
  const doneResults = results.filter((r) => r.status === "done");

  type CodeKey = string;
  const codeMap = new Map<
    CodeKey,
    { code: string; display: string; system: string }
  >();
  for (const r of doneResults) {
    for (const c of r.codes) {
      const key = `${c.system}::${c.code}`;
      if (!codeMap.has(key)) {
        codeMap.set(key, {
          code: c.code,
          display: c.display,
          system: c.system,
        });
      }
    }
  }

  const allCodes = Array.from(codeMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Multi-encounter code tracker
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste notes from up to four encounters for the same patient. The
          matrix shows which codes appear across each visit. Useful for spotting
          persistent diagnoses, newly emerging conditions, and resolved issues.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {encounters.map((enc) => (
          <div key={enc.id}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={enc.label}
                onChange={(e) => update(enc.id, { label: e.target.value })}
                disabled={busy}
                className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {encounters.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeEncounter(enc.id)}
                  disabled={busy}
                  className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
                  title="Remove encounter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <textarea
              value={enc.text}
              onChange={(e) => update(enc.id, { text: e.target.value })}
              rows={4}
              readOnly={busy}
              placeholder={`Paste the ${enc.label.toLowerCase()} note here…`}
              className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        ))}

        {encounters.length < 4 && (
          <button
            type="button"
            onClick={addEncounter}
            disabled={busy}
            className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add encounter
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            const client = new CortiClient({
              environment: sdkEnvironment,
              auth: authConfig,
            });
            void runEncounterTracker(client, encounters);
          }}
          disabled={busy || filledCount < 1}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarRange className="h-4 w-4" />
          )}
          Track codes across {filledCount} encounter
          {filledCount !== 1 ? "s" : ""}
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">
            Coding encounters…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {results.length > 0 && allCodes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Code matrix · {allCodes.length} unique code
            {allCodes.length !== 1 ? "s" : ""} across {doneResults.length}{" "}
            encounter{doneResults.length !== 1 ? "s" : ""}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Code
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </th>
                  {doneResults.map((r) => (
                    <th
                      key={r.encounter.id}
                      className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {r.encounter.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCodes.map(([key, info]) => {
                  const presentIn = doneResults.filter((r) =>
                    r.codes.some((c) => `${c.system}::${c.code}` === key),
                  );
                  const presentCount = presentIn.length;
                  const allPresent = presentCount === doneResults.length;
                  const somePresent = presentCount > 0 && !allPresent;

                  return (
                    <tr
                      key={key}
                      className={`border-b border-border last:border-0 ${
                        allPresent
                          ? "bg-green-500/5"
                          : somePresent
                            ? "bg-yellow-500/5"
                            : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-foreground">
                        {info.code}
                        <span className="ml-1 text-muted-foreground">
                          {SYSTEM_LABELS[info.system] ?? info.system}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-foreground">
                        {info.display}
                      </td>
                      {doneResults.map((r) => {
                        const present = r.codes.some(
                          (c) => `${c.system}::${c.code}` === key,
                        );
                        return (
                          <td
                            key={r.encounter.id}
                            className="px-3 py-2 text-center"
                          >
                            {present ? (
                              <span className="text-green-600 dark:text-green-400">
                                yes
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">
                                no
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Green rows appear in all encounters. Yellow rows appear in some.
            Includes both confirmed codes and candidates.
          </p>
        </div>
      )}

      {results.length > 0 && allCodes.length === 0 && status === "done" && (
        <p className="text-sm text-muted-foreground">
          No codes returned for these encounters.
        </p>
      )}
    </div>
  );
}
