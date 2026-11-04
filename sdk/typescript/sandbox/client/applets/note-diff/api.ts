import type { CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import { documentSections, generateFromText } from "../_shared/corti-documents";

export interface NoteDiffState {
  status: "idle" | "running" | "done" | "error";
  sectionsA: [string, string][];
  sectionsB: [string, string][];
  error?: string;
}

let state: NoteDiffState = {
  status: "idle",
  sectionsA: [],
  sectionsB: [],
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<NoteDiffState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

export async function runNoteDiff(
  client: CortiClient,
  textA: string,
  textB: string,
  templateId: string,
  language: string,
) {
  if (!textA.trim() || !textB.trim()) {
    return;
  }
  set({ status: "running", sectionsA: [], sectionsB: [], error: undefined });
  try {
    const [responseA, responseB] = await Promise.all([
      generateFromText(client, templateId, textA, language),
      generateFromText(client, templateId, textB, language),
    ]);
    set({
      status: "done",
      sectionsA: documentSections(responseA.document),
      sectionsB: documentSections(responseB.document),
    });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export function useNoteDiffStore(): NoteDiffState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
