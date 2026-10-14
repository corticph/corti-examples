import type { Corti, CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import { createLocalConfigStore } from "../_shared/configStore";

const store = createLocalConfigStore("code-validator");
const SYSTEMS_KEY = "codeValidator.systems";

const DEFAULT_SYSTEMS = ["icd10cm-outpatient"];

export type CodingCode = Corti.CodesGeneralReadResponse;

export interface ValidationResult {
  confirmed: CodingCode[];
  missed: CodingCode[];
  unsupported: string[];
}

export interface CodeValidatorState {
  status: "idle" | "running" | "done" | "error";
  systems: string[];
  result: ValidationResult | null;
  error?: string;
}

let state: CodeValidatorState = {
  status: "idle",
  systems: store.get<string[]>(SYSTEMS_KEY, []).length
    ? store.get<string[]>(SYSTEMS_KEY, [])
    : DEFAULT_SYSTEMS,
  result: null,
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<CodeValidatorState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

export function updateValidatorSystems(systems: string[]) {
  store.set(SYSTEMS_KEY, systems);
  set({ systems });
}

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, "");
}

export async function runCodeValidation(client: CortiClient, text: string, rawProposed: string) {
  if (!text.trim()) {
    return;
  }
  set({ status: "running", result: null, error: undefined });

  const proposed = rawProposed
    .split(/[,\n]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const normalizedProposed = new Set(proposed.map(normalize));

  try {
    const { codes, candidates } = await client.codes.predict({
      system: state.systems as Corti.CommonCodingSystemEnum[],
      context: [{ type: "text", text }],
    });
    const seenKeys = new Set<string>();
    const allApiCodes: CodingCode[] = [];
    for (const c of [...codes, ...candidates]) {
      const k = `${c.system}::${c.code}`;
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        allApiCodes.push(c);
      }
    }

    const confirmed: CodingCode[] = [];
    const missed: CodingCode[] = [];

    for (const c of allApiCodes) {
      if (normalizedProposed.has(normalize(c.code))) {
        confirmed.push(c);
      } else {
        missed.push(c);
      }
    }

    const apiNormalized = new Set(allApiCodes.map((c) => normalize(c.code)));
    const unsupported = proposed.filter((p) => !apiNormalized.has(normalize(p)));

    set({ status: "done", result: { confirmed, missed, unsupported } });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export function useCodeValidatorStore(): CodeValidatorState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
