import type { CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import { documentSections, generateFromText } from "../_shared/corti-documents";

export interface BatchJob {
  index: number;
  preview: string;
  status: "pending" | "running" | "done" | "error";
  sections: [string, string][];
  error?: string;
}

export interface BatchProcessorState {
  status: "idle" | "running" | "done" | "error";
  jobs: BatchJob[];
  doneCount: number;
  error?: string;
}

let state: BatchProcessorState = {
  status: "idle",
  jobs: [],
  doneCount: 0,
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<BatchProcessorState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

export function splitNotes(raw: string): string[] {
  return raw
    .split(/^-{3,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runBatch(
  client: CortiClient,
  inputs: string[],
  templateId: string,
  language: string,
) {
  if (inputs.length === 0) {
    return;
  }

  const jobs: BatchJob[] = inputs.map((text, i) => ({
    index: i,
    preview: text.slice(0, 80).replace(/\n/g, " "),
    status: "pending",
    sections: [],
  }));

  set({ status: "running", jobs: [...jobs], doneCount: 0, error: undefined });

  let doneCount = 0;

  await Promise.all(
    inputs.map(async (text, i) => {
      jobs[i] = { ...jobs[i], status: "running" };
      set({ jobs: [...jobs] });
      try {
        const response = await generateFromText(client, templateId, text, language);
        jobs[i] = {
          ...jobs[i],
          status: "done",
          sections: documentSections(response.document),
        };
      } catch (e) {
        jobs[i] = {
          ...jobs[i],
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        };
      }
      doneCount++;
      set({ jobs: [...jobs], doneCount });
    }),
  );

  set({ status: "done" });
}

export function useBatchProcessorStore(): BatchProcessorState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
