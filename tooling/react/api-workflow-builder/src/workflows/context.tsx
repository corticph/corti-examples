import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEFAULT_WORKFLOWS, SEED_MARKER_KEY } from "./defaults";
import { ensureRefs } from "./refs";
import { loadWorkflows, saveWorkflows } from "./storage";
import type { Workflow } from "./types";

type WorkflowsState = {
  workflows: Workflow[];
  getById: (id: string) => Workflow | undefined;
  create: (input: Pick<Workflow, "name" | "description">) => Workflow;
  update: (id: string, patch: Partial<Workflow>) => void;
  remove: (id: string) => void;
};

const Ctx = createContext<WorkflowsState | null>(null);

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function WorkflowsProvider({ children }: { children: ReactNode }) {
  // Backfill missing refs on first load — older workflows persisted before refs existed
  // would otherwise produce empty-string substitution keys.
  //
  // First-launch seeding: if the user has no workflows AND we've never seeded, drop in
  // DEFAULT_WORKFLOWS so they've got a starting point instead of an empty state. The
  // marker key ensures we never re-seed after a user has deliberately cleared their
  // list — deleting all workflows is a valid choice we shouldn't override.
  const [workflows, setWorkflows] = useState<Workflow[]>(() => {
    const loaded = loadWorkflows().map(ensureRefs);
    if (loaded.length > 0) return loaded;
    let alreadySeeded = false;
    try {
      alreadySeeded = localStorage.getItem(SEED_MARKER_KEY) === "1";
    } catch {
      /* private-mode / blocked storage — treat as un-seeded */
    }
    if (alreadySeeded) return loaded;
    try {
      localStorage.setItem(SEED_MARKER_KEY, "1");
    } catch {
      /* ignore */
    }
    return DEFAULT_WORKFLOWS.map(ensureRefs);
  });
  useEffect(() => saveWorkflows(workflows), [workflows]);

  const create = useCallback<WorkflowsState["create"]>((input) => {
    const now = new Date().toISOString();
    const wf: Workflow = {
      id: uid(),
      name: input.name,
      description: input.description,
      nodes: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
    };
    setWorkflows((cur) => [...cur, wf]);
    return wf;
  }, []);

  const update = useCallback<WorkflowsState["update"]>((id, patch) => {
    setWorkflows((cur) =>
      cur.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w)),
    );
  }, []);

  const remove = useCallback<WorkflowsState["remove"]>((id) => {
    setWorkflows((cur) => cur.filter((w) => w.id !== id));
  }, []);

  const value = useMemo<WorkflowsState>(
    () => ({
      workflows,
      getById: (id) => workflows.find((w) => w.id === id),
      create,
      update,
      remove,
    }),
    [workflows, create, update, remove],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkflows(): WorkflowsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkflows must be used inside WorkflowsProvider");
  return v;
}
