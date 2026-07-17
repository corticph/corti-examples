/**
 * AppControlAdapter — the application-control analog of EditorAdapter.
 *
 * EditorAdapter speech-enables *editable controls* (text in/out). AppControlAdapter
 * speech-enables the *application itself*: non-text actions like opening a panel,
 * switching a tab, clicking a button, or confirming a dialog. A host registers its
 * actionable UI as named `AppControl`s; command dispatch resolves a spoken target
 * to a control and runs it. Controls also expose `isAvailable()` / `getState()`,
 * so commands can be contextual and the UI can show "application awareness" — what
 * is on screen and what is actionable right now.
 *
 * This is the command-and-control half of a Fluency-Direct-style integration at
 * the application layer. It is DOM-agnostic on purpose: the same registry shape
 * is what a native host implements through a bridge (see native-host-adapter.ts).
 *
 * Portable: no app or React dependencies.
 */

export type AppControlKind = "action" | "toggle" | "navigation";

export interface AppControl {
  id: string;
  /** Spoken/human label used to resolve a command to this control. */
  label: string;
  kind: AppControlKind;
  /** Perform the control. `arg` carries a parameter (e.g. "open"/"close" for a toggle). */
  run(arg?: string): void;
  /** Whether the control can run right now (app-state awareness). Defaults to true. */
  isAvailable?(): boolean;
  /** Current state, for the awareness display (e.g. "open", "active"). */
  getState?(): string | null;
  /** Extra spoken phrasings that also resolve to this control. */
  aliases?: string[];
}

export interface AppControlOutcome {
  handled: boolean;
  description: string;
}

export interface AppControlSnapshotEntry {
  id: string;
  label: string;
  kind: AppControlKind;
  state: string | null;
  available: boolean;
}

export interface AppControlRegistry {
  /** Register a control; returns an unregister function. */
  register(control: AppControl): () => void;
  get(id: string): AppControl | undefined;
  list(): AppControl[];
  /** Resolve a spoken target to a control (exact label/id/alias, then contains). */
  resolve(spoken: string): AppControl | undefined;
  /** Resolve + availability-gate + run; returns an outcome for the activity log. */
  run(idOrSpoken: string, arg?: string): AppControlOutcome;
  /** Current state of every control, for the awareness panel. */
  snapshot(): AppControlSnapshotEntry[];
}

/** Strip filler words so "open the details panel" resolves to a "details" control. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|a|an|to|panel|button|tab|dialog|view)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createAppControlRegistry(): AppControlRegistry {
  const controls = new Map<string, AppControl>();

  const resolve = (spoken: string): AppControl | undefined => {
    if (controls.has(spoken)) {
      return controls.get(spoken);
    }
    const target = normalize(spoken);
    if (!target) {
      return undefined;
    }
    for (const c of controls.values()) {
      if (normalize(c.label) === target) {
        return c;
      }
      if (c.aliases?.some((a) => normalize(a) === target)) {
        return c;
      }
    }
    for (const c of controls.values()) {
      const n = normalize(c.label);
      if (n && (target.includes(n) || n.includes(target))) {
        return c;
      }
    }
    return undefined;
  };

  return {
    register(control) {
      controls.set(control.id, control);
      return () => {
        // Only remove if it's still the same registration.
        if (controls.get(control.id) === control) {
          controls.delete(control.id);
        }
      };
    },
    get: (id) => controls.get(id),
    list: () => [...controls.values()],
    resolve,
    run(idOrSpoken, arg) {
      const control = resolve(idOrSpoken);
      if (!control) {
        return {
          handled: false,
          description: `No control for "${idOrSpoken}"`,
        };
      }
      if (control.isAvailable && !control.isAvailable()) {
        return {
          handled: true,
          description: `"${control.label}" is not available right now`,
        };
      }
      control.run(arg);
      return {
        handled: true,
        description: `${control.label}${arg ? ` → ${arg}` : ""}`,
      };
    },
    snapshot() {
      return [...controls.values()].map((c) => ({
        id: c.id,
        label: c.label,
        kind: c.kind,
        state: c.getState?.() ?? null,
        available: c.isAvailable ? c.isAvailable() : true,
      }));
    },
  };
}
