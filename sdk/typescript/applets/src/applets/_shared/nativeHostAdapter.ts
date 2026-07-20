/**
 * NativeHostAdapter — DESIGN SEAM (intentionally not implemented in this web sample).
 *
 * AppControlAdapter (app-control-adapter.ts) drives a web DOM. A real
 * Fluency-Direct-style integration must reach beyond the browser — into a desktop
 * EHR, an OS automation/accessibility layer, or a thick-client app. The command
 * dispatch and the control contract DON'T change for that: only the transport
 * does. A native host implements this interface over its own bridge (Electron IPC,
 * a WebSocket to a desktop agent, a platform accessibility API, etc.), and a thin
 * shim maps it onto the same `AppControlRegistry` the web applets use — so the STT
 * integration logic (resolve a spoken target → invoke it; read state for awareness)
 * is written once and runs against either a web UI or a native one.
 *
 * This file is types + documentation only. It exists so the architecture is
 * explicit about the native bridge without pulling OS control into a web sample.
 */
import type { AppControl, AppControlRegistry, AppControlSnapshotEntry } from "./appControlAdapter";

/** A control as described by the native host (the wire shape of AppControl). */
export interface NativeControlDescriptor {
  id: string;
  label: string;
  kind: AppControl["kind"];
  available: boolean;
  state: string | null;
  aliases?: string[];
}

/**
 * The bridge a native host exposes. All operations are async because they cross a
 * process/IPC boundary. Implement this over your transport of choice.
 */
export interface NativeHostAdapter {
  /** Enumerate the host's currently actionable controls (for awareness + resolve). */
  listControls(): Promise<NativeControlDescriptor[]>;
  /** Invoke a control by id, with an optional argument (e.g. "open"/"close"). */
  invoke(controlId: string, arg?: string): Promise<void>;
  /** Read a single control's current state. */
  queryState(controlId: string): Promise<string | null>;
  /**
   * Insert text into the host's active control — the native counterpart of
   * EditorAdapter.insert, bridging the dictation half of the integration.
   */
  insertText?(text: string): Promise<void>;
  /** Subscribe to host-side state changes (so the awareness UI can refresh). */
  subscribe?(onChange: () => void): () => void;
}

/**
 * Reference shim: how a native host would be projected onto the same
 * `AppControlRegistry` the web applets consume. Left unimplemented on purpose —
 * the body shows the intended mapping in comments.
 *
 * The asymmetry to design around: AppControl.run / isAvailable / getState are
 * synchronous (DOM), while a native bridge is async. A real adapter caches the
 * last `listControls()` snapshot and refreshes it on `subscribe`, exposing the
 * cached values synchronously and firing `invoke` fire-and-forget.
 */
export declare function bridgeNativeHost(host: NativeHostAdapter): AppControlRegistry;

/** The cached descriptor → snapshot-entry projection a bridge would use. */
export function toSnapshotEntry(d: NativeControlDescriptor): AppControlSnapshotEntry {
  return {
    id: d.id,
    label: d.label,
    kind: d.kind,
    state: d.state,
    available: d.available,
  };
}
