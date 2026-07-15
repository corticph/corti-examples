import type { Workflow } from "./types";

const KEY = "corti.workflows";

export function loadWorkflows(): Workflow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkflows(workflows: Workflow[]): void {
  localStorage.setItem(KEY, JSON.stringify(workflows));
}
