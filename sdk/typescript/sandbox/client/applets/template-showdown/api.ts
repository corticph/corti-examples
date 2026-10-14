import type { Corti, CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import { documentSections, generateFromText } from "../_shared/corti-documents";

export interface TemplateResult {
  id: string;
  name: string;
  status: "pending" | "done" | "error";
  sections: [string, string][];
  error?: string;
}

export interface TemplateShowdownState {
  status: "idle" | "running" | "done" | "error";
  results: TemplateResult[];
  doneCount: number;
  totalCount: number;
  error?: string;
}

let state: TemplateShowdownState = {
  status: "idle",
  results: [],
  doneCount: 0,
  totalCount: 0,
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<TemplateShowdownState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

export async function runTemplateShowdown(
  client: CortiClient,
  templates: Corti.GuidedTemplate[],
  input: string,
  language: string,
) {
  if (!input.trim() || templates.length === 0) {
    return;
  }
  set({
    status: "running",
    results: [],
    doneCount: 0,
    totalCount: 0,
    error: undefined,
  });

  const results: TemplateResult[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: "pending",
    sections: [],
  }));

  set({ results: [...results], totalCount: templates.length });

  let doneCount = 0;

  await Promise.all(
    templates.map(async (t, i) => {
      try {
        const response = await generateFromText(client, t.id, input, language);
        results[i] = {
          ...results[i],
          status: "done",
          sections: documentSections(response.document),
        };
      } catch (e) {
        results[i] = {
          ...results[i],
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        };
      }
      doneCount++;
      set({ results: [...results], doneCount });
    }),
  );

  set({ status: "done" });
}

export function useTemplateShowdownStore(): TemplateShowdownState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
