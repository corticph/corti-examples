import type { Corti, CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import { createLocalConfigStore } from "../_shared/configStore";

const store = createLocalConfigStore("evidence-coding");
const SYSTEMS_KEY = "evidenceCoding.systems";

const DEFAULT_SYSTEMS = ["icd10cm-outpatient"];

export type CodingCode = Corti.CodesGeneralReadResponse;
export type CodeEvidence = Corti.CodesGeneralReadResponseEvidencesItem;

export interface EvidenceCodingState {
  status: "idle" | "running" | "done" | "error";
  systems: string[];
  codes: CodingCode[];
  candidates: CodingCode[];
  error?: string;
}

let state: EvidenceCodingState = {
  status: "idle",
  systems: store.get<string[]>(SYSTEMS_KEY, []).length
    ? store.get<string[]>(SYSTEMS_KEY, [])
    : DEFAULT_SYSTEMS,
  codes: [],
  candidates: [],
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<EvidenceCodingState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

export function updateEvidenceCodingSystems(systems: string[]) {
  store.set(SYSTEMS_KEY, systems);
  set({ systems });
}

export async function runEvidenceCoding(client: CortiClient, input: string) {
  if (!input.trim()) {
    return;
  }
  set({ status: "running", codes: [], candidates: [], error: undefined });
  try {
    const result = await client.codes.predict({
      system: state.systems as Corti.CommonCodingSystemEnum[],
      context: [{ type: "text", text: input }],
    });
    set({
      status: "done",
      codes: result.codes || [],
      candidates: result.candidates || [],
    });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export function useEvidenceCodingStore(): EvidenceCodingState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
