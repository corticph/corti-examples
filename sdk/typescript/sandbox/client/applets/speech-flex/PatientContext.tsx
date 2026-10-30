/**
 * PatientContext — the selected visit's identity block (top of the left rail).
 *
 * Read-only summary of the active interaction — patient name, MRN, encounter
 * type, scheduled time, and the interaction id — with an inline edit form, a
 * delete button, and a clear button. This anchors both capture modes to the
 * same encounter.
 */

import { Loader2, Pencil, Save, Stethoscope, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../_shared/utils";
import { Eyebrow } from "./kit";
import { ENCOUNTER_TYPE_LABELS, type VisitItem, visitPatientName } from "./workspaceState";

/** The editable slice of a visit handed to updateVisit(). */
export interface VisitEditParams {
  patientName: string;
  patientIdentifier: string;
  encounterType: string;
  encounterStatus: string;
  scheduledAt?: Date;
}

function formatVisitTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputClasses =
  "w-full rounded-[5px] border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none focus-visible:border-lime-600 dark:focus-visible:border-corti-lime";

export function PatientContext({
  visit,
  onSave,
  onClear,
  onDelete,
}: {
  /** The selected visit, or null when the workspace is unscoped. */
  visit: VisitItem | null | undefined;
  /** Persists the edit form; rejects on failure so editing stays open. */
  onSave: (params: VisitEditParams) => Promise<void>;
  /** Deselects the visit (clears the patient context). */
  onClear: () => void;
  /** Deletes the visit; rejects on failure so the button can re-enable. */
  onDelete: (visitId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    patientName: "",
    patientIdentifier: "",
    encounterType: "outpatient",
    encounterStatus: "planned",
    scheduledAt: "",
  });

  const startEditing = () => {
    if (!visit) {
      return;
    }
    setForm({
      patientName: visit.patient?.name ?? "",
      patientIdentifier: visit.patient?.identifier ?? "",
      encounterType: visit.encounter.type ?? "outpatient",
      encounterStatus: visit.encounter.status ?? "planned",
      scheduledAt: visit.encounter.period.startedAt
        ? new Date(visit.encounter.period.startedAt).toISOString().slice(0, 16)
        : "",
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        patientName: form.patientName,
        patientIdentifier: form.patientIdentifier,
        encounterType: form.encounterType,
        encounterStatus: form.encounterStatus,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt) : undefined,
      });
      setEditing(false);
    } catch {
      // onSave already logged; keep the form open so nothing is lost.
    } finally {
      setSaving(false);
    }
  };

  const deleteVisit = async () => {
    if (!visit) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(visit.interactionId);
    } catch {
      // onDelete already logged; the click can simply be retried.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Patient</Eyebrow>
        {visit && !editing && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={startEditing}
              title="Edit visit details"
              aria-label="Edit visit details"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void deleteVisit()}
              disabled={deleting}
              title={deleting ? "Deleting visit…" : "Delete visit"}
              aria-label={deleting ? "Deleting visit" : "Delete visit"}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onClear}
              title="Clear patient context"
              aria-label="Clear patient context"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      {!visit ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">No visit selected.</p>
      ) : editing ? (
        <div className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Patient name</span>
            <input
              type="text"
              value={form.patientName}
              onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
              className={inputClasses}
            />
          </label>
          <div className="flex gap-2">
            <label className="flex w-28 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">MRN</span>
              <input
                type="text"
                value={form.patientIdentifier}
                onChange={(e) => setForm((f) => ({ ...f, patientIdentifier: e.target.value }))}
                className={cn(inputClasses, "font-mono")}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Visit type</span>
              <select
                value={form.encounterType}
                onChange={(e) => setForm((f) => ({ ...f, encounterType: e.target.value }))}
                className={inputClasses}
              >
                {Object.entries(ENCOUNTER_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Visit date</span>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              className={inputClasses}
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-[5px] border border-lime-600 bg-lime-600/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-lime-600/20 disabled:opacity-50 dark:border-corti-lime dark:bg-corti-lime/10 dark:hover:bg-corti-lime/20"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-[5px] border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 shrink-0 text-lime-600 dark:text-corti-lime" />
            <span className="text-[13px] font-medium text-foreground">
              {visitPatientName(visit)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 pl-6">
            <span className="font-mono text-xs text-muted-foreground">
              MRN {visit.patient?.identifier ?? "—"}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {ENCOUNTER_TYPE_LABELS[visit.encounter.type] ?? visit.encounter.type} ·{" "}
              {formatVisitTime(visit.encounter.period.startedAt)}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/50" title="Interaction ID">
              {visit.interactionId}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
