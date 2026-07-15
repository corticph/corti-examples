/**
 * A small mock "clinical workspace" app: tabs, a collapsible details panel,
 * action buttons, and a confirm dialog. It registers each actionable piece as an
 * AppControl so voice commands (and ordinary clicks) drive the same effects. The
 * Notes tab holds a textarea so dictation (the EditorAdapter half) and app
 * command-and-control coexist on one surface.
 */
import { useEffect, useRef, useState } from "react";
import { Check, PanelRightOpen, Plus, Save } from "lucide-react";
import { cn } from "../_shared/utils";
import type { AppControlRegistry } from "../_shared/app-control-adapter";

const TABS = ["overview", "orders", "notes"] as const;
type Tab = (typeof TABS)[number];

const tabBtn = (active: boolean) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
    active
      ? "bg-accent font-medium text-foreground ring-2 ring-inset ring-lime-600 dark:ring-corti-lime"
      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
  );

const actionBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50";

export function MockApp({
  registry,
  onStateChange,
  interim,
}: {
  registry: AppControlRegistry;
  onStateChange: () => void;
  /** Live interim transcript, shown under the tab bar (reserved height = no shift). */
  interim?: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [orders, setOrders] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Refs mirror state so control closures (registered once) read current values.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const detailsRef = useRef(detailsOpen);
  detailsRef.current = detailsOpen;
  const modalRef = useRef(modalOpen);
  modalRef.current = modalOpen;
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Landing on the Notes tab (by voice or click) focuses the textarea and drops
  // the caret at the end, so dictation flows straight into it.
  useEffect(() => {
    if (tab !== "notes") return;
    const el = notesRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [tab]);

  // Register the app's controls once. Effects read refs, so closures stay valid.
  useEffect(() => {
    const offs = [
      ...TABS.map((t) =>
        registry.register({
          id: `tab-${t}`,
          label: t,
          kind: "navigation",
          run: () => setTab(t),
          getState: () => (tabRef.current === t ? "active" : null),
        }),
      ),
      registry.register({
        id: "details",
        label: "details",
        kind: "toggle",
        aliases: ["details panel"],
        run: (arg) =>
          setDetailsOpen(
            arg === "open"
              ? true
              : arg === "close"
                ? false
                : !detailsRef.current,
          ),
        getState: () => (detailsRef.current ? "open" : "closed"),
      }),
      registry.register({
        id: "new-order",
        label: "new order",
        kind: "action",
        run: () => setModalOpen(true),
      }),
      registry.register({
        id: "save",
        label: "save",
        kind: "action",
        run: () => setSavedAt(Date.now()),
      }),
      registry.register({
        id: "confirm",
        label: "confirm",
        kind: "action",
        isAvailable: () => modalRef.current,
        run: () => {
          setOrders((o) => [...o, `Order #${o.length + 1}`]);
          setModalOpen(false);
          setTab("orders");
        },
      }),
      registry.register({
        id: "cancel",
        label: "cancel",
        kind: "action",
        isAvailable: () => modalRef.current,
        run: () => setModalOpen(false),
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [registry]);

  // Refresh the awareness panel whenever any app state changes (click or voice).
  useEffect(() => {
    onStateChange();
  }, [tab, detailsOpen, modalOpen, orders, savedAt, onStateChange]);

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-muted/30 shadow-sm">
      {/* Top bar: tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 p-2">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={tabBtn(tab === t)}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={actionBtn}
            onClick={() => setModalOpen(true)}
          >
            <Plus className="h-4 w-4" /> New order
          </button>
          <button
            type="button"
            className={actionBtn}
            onClick={() => setSavedAt(Date.now())}
          >
            <Save className="h-4 w-4" /> Save
          </button>
          <button
            type="button"
            className={cn(actionBtn, detailsOpen && "ring-1 ring-corti-lime")}
            onClick={() => setDetailsOpen((v) => !v)}
          >
            <PanelRightOpen className="h-4 w-4" /> Details
          </button>
        </div>
      </div>

      {/* Body: active tab + optional details panel */}
      <div className="flex min-h-[180px] bg-card">
        <div className="flex-1 p-4">
          {tab === "overview" && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Overview</p>
              <p>
                Drive this workspace by voice: switch tabs, open the details
                panel, create an order, or save.
              </p>
              {savedAt && (
                <p className="inline-flex items-center gap-1 font-medium text-lime-600 dark:text-corti-lime">
                  <Check className="h-4 w-4" /> Saved
                </p>
              )}
            </div>
          )}
          {tab === "orders" && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Orders</p>
              {orders.length === 0 ? (
                <p className="text-muted-foreground">
                  No orders yet — say “new order”, then “confirm”.
                </p>
              ) : (
                <ul className="space-y-1">
                  {orders.map((o) => (
                    <li
                      key={o}
                      className="rounded border border-border bg-muted/40 px-2 py-1 text-foreground"
                    >
                      {o}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === "notes" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Notes</p>
              <textarea
                ref={notesRef}
                rows={5}
                placeholder="Dictate or type a note here, then say “save”…"
                className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
              />
            </div>
          )}
        </div>

        {detailsOpen && (
          <aside className="w-48 shrink-0 border-l border-border p-4 text-sm">
            <p className="mb-1 font-medium text-foreground">Details</p>
            <p className="text-muted-foreground">
              A side panel toggled by “open/close details”.
            </p>
          </aside>
        )}
      </div>

      {/* Interim transcript — at the bottom of the workspace, reserved height so
          nothing shifts as interim text streams in. */}
      <div className="min-h-[1.75rem] border-t border-border bg-muted/40 px-3 py-1 text-sm italic text-muted-foreground">
        {interim}
      </div>

      {/* Confirm dialog — confirm/cancel are availability-gated on it being open. */}
      {modalOpen && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-foreground/20 p-4">
          <div className="w-full max-w-xs rounded-lg border border-border bg-card p-4 shadow-lg">
            <p className="text-sm font-medium text-foreground">Create order?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Say “confirm” or “cancel”.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className={actionBtn}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(actionBtn, "border-corti-lime")}
                onClick={() => {
                  setOrders((o) => [...o, `Order #${o.length + 1}`]);
                  setModalOpen(false);
                  setTab("orders");
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
