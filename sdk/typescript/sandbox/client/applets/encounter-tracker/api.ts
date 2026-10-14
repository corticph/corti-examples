import type { Corti, CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import { createLocalConfigStore } from "../_shared/configStore";

const store = createLocalConfigStore("encounter-tracker");
const SYSTEMS_KEY = "encounterTracker.systems";

const DEFAULT_SYSTEMS = ["icd10cm-outpatient"];

export type CodingCode = Corti.CodesGeneralReadResponse;

export interface Encounter {
  id: string;
  label: string;
  text: string;
}

export interface EncounterResult {
  encounter: Encounter;
  status: "pending" | "done" | "error";
  codes: CodingCode[];
  error?: string;
}

export interface EncounterTrackerState {
  status: "idle" | "running" | "done" | "error";
  systems: string[];
  results: EncounterResult[];
  error?: string;
}

let state: EncounterTrackerState = {
  status: "idle",
  systems: store.get<string[]>(SYSTEMS_KEY, []).length
    ? store.get<string[]>(SYSTEMS_KEY, [])
    : DEFAULT_SYSTEMS,
  results: [],
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<EncounterTrackerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

export function updateTrackerSystems(systems: string[]) {
  store.set(SYSTEMS_KEY, systems);
  set({ systems });
}

export async function runEncounterTracker(
  client: CortiClient,
  encounters: Encounter[],
) {
  const valid = encounters.filter((e) => e.text.trim());
  if (valid.length === 0) {
    return;
  }

  const results: EncounterResult[] = valid.map((e) => ({
    encounter: e,
    status: "pending",
    codes: [],
  }));

  set({ status: "running", results: [...results], error: undefined });

  const systems = state.systems as Corti.CommonCodingSystemEnum[];

  await Promise.all(
    valid.map(async (encounter, i) => {
      try {
        const { codes, candidates } = await client.codes.predict({
          system: systems,
          context: [{ type: "text", text: encounter.text }],
        });
        results[i] = {
          ...results[i],
          status: "done",
          codes: [...codes, ...candidates],
        };
      } catch (e) {
        results[i] = {
          ...results[i],
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        };
      }
      set({ results: [...results] });
    }),
  );

  set({ status: "done" });
}

export function useEncounterTrackerStore(): EncounterTrackerState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
