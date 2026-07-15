/**
 * Tiny external store shared by the applet body (which dictates + executes
 * commands) and the manager card (which views/edits commands and shows the
 * debugger). User-created commands persist to localStorage; the preloaded
 * catalog is always merged in. Uses useSyncExternalStore — no provider needed,
 * which suits the Sandbox rendering the body and details as siblings.
 */
import { useSyncExternalStore } from "react";
import {
  createLocalConfigStore,
  identityNamespace,
  type ConfigStore,
} from "../_shared/config-store";
import { CATALOG, type ManagedCommand } from "./command-model";

const COMMANDS_KEY = "dictation-commands.userCommands";
const LOG_LIMIT = 50;

// Persistence is namespaced by API client (clientId:tenant); see setIdentity.
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);

export interface CommandLogEntry {
  id: string;
  variables?: Record<string, string | null> | null;
  description: string;
  at: number;
}

interface StoreState {
  commands: ManagedCommand[];
  log: CommandLogEntry[];
}

function loadUserCommands(): ManagedCommand[] {
  return store.get<ManagedCommand[]>(COMMANDS_KEY, []);
}

let state: StoreState = {
  commands: [...CATALOG, ...loadUserCommands()],
  log: [],
};

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return state;
}

function persistUser() {
  store.set(
    COMMANDS_KEY,
    state.commands.filter((c) => !c.builtin),
  );
}

/**
 * Point the store at a specific API client's namespace and reload its saved
 * commands. Called by the applet once auth resolves; a no-op if unchanged.
 */
export function setIdentity(clientId?: string, tenant?: string) {
  const ns = identityNamespace(clientId, tenant);
  if (ns === namespace) return;
  namespace = ns;
  store = createLocalConfigStore(ns);
  state = { ...state, commands: [...CATALOG, ...loadUserCommands()] };
  emit();
}

export function upsertCommand(command: ManagedCommand) {
  const idx = state.commands.findIndex((c) => c.id === command.id);
  const commands =
    idx === -1
      ? [...state.commands, command]
      : state.commands.map((c, i) => (i === idx ? command : c));
  state = { ...state, commands };
  persistUser();
  emit();
}

export function removeCommand(id: string) {
  state = { ...state, commands: state.commands.filter((c) => c.id !== id) };
  persistUser();
  emit();
}

export function resetUserCommands() {
  state = { ...state, commands: state.commands.filter((c) => c.builtin) };
  persistUser();
  emit();
}

/** Remove multiple commands by id. Built-in catalog commands are never removed. */
export function removeCommands(ids: string[]) {
  const set = new Set(ids);
  state = {
    ...state,
    commands: state.commands.filter((c) => c.builtin || !set.has(c.id)),
  };
  persistUser();
  emit();
}

export function logCommand(entry: Omit<CommandLogEntry, "at">) {
  state = {
    ...state,
    log: [{ ...entry, at: Date.now() }, ...state.log].slice(0, LOG_LIMIT),
  };
  emit();
}

export function clearLog() {
  state = { ...state, log: [] };
  emit();
}

export function useCommandStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
