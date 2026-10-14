/**
 * VisitSchedule — the visit list panel (left column).
 *
 * Renders interactions sorted by scheduled visit date (encounter.period.startedAt).
 * Each row shows the patient name, encounter type, and scheduled time. Selecting
 * a visit sets the active interaction for both dictation and ambient modes.
 *
 * Includes a "New visit" form to simulate a schedule feed entry — in a
 * real EHR integration these interactions would be created server-side
 * from the scheduling system, not from the browser.
 */
import { CalendarPlus, Loader2, User } from "lucide-react";
import { useState } from "react";
import { cn } from "../_shared/utils";
import type { VisitItem } from "./workspaceState";

const ENCOUNTER_TYPE_LABELS: Record<string, string> = {
  first_consultation: "First consult",
  consultation: "Consultation",
  emergency: "Emergency",
  inpatient: "Inpatient",
  outpatient: "Outpatient",
};

function formatVisitTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) {
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NewVisitForm({
  onCreate,
  creating,
}: {
  onCreate: (params: { patientIdentifier: string; patientName: string; scheduledAt: Date }) => void;
  creating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mrn, setMrn] = useState("");
  const [time, setTime] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mrn.trim() || !time) {
      return;
    }
    onCreate({
      patientIdentifier: mrn.trim(),
      patientName: name.trim(),
      scheduledAt: new Date(time),
    });
    setName("");
    setMrn("");
    setTime("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        New visit
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
    >
      <input
        type="text"
        placeholder="Patient name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm"
      />
      <input
        type="text"
        placeholder="MRN"
        value={mrn}
        onChange={(e) => setMrn(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm"
      />
      <input
        type="datetime-local"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={creating || !name.trim() || !mrn.trim() || !time}
          className="rounded border border-lime-600 bg-lime-600/10 px-2 py-1 text-xs font-medium text-foreground disabled:opacity-50 dark:border-corti-lime dark:bg-corti-lime/10"
        >
          {creating ? "Creating…" : "Add to schedule"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function VisitSchedule({
  visits,
  loading,
  error,
  selectedVisitId,
  onSelect,
  onCreate,
  creating,
}: {
  visits: VisitItem[];
  loading: boolean;
  error: string | null;
  selectedVisitId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (params: { patientIdentifier: string; patientName: string; scheduledAt: Date }) => void;
  creating: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Visit schedule</h3>
        <NewVisitForm onCreate={onCreate} creating={creating} />
      </div>

      {loading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading visits…
        </p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {!loading && visits.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No visits scheduled. Create one above to get started.
        </p>
      )}

      {visits.length > 0 && (
        <ul className="flex max-h-[500px] flex-col gap-1 overflow-auto">
          {visits.map((visit) => {
            const isSelected = visit.interactionId === selectedVisitId;
            return (
              <li key={visit.interactionId}>
                <button
                  type="button"
                  onClick={() => onSelect(visit.interactionId)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-lime-600 bg-lime-600/10 dark:border-corti-lime dark:bg-corti-lime/10"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">
                      {visit.patient?.name ?? visit.encounter.title ?? "Unknown patient"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-5">
                    <span className="text-xs text-muted-foreground">
                      {ENCOUNTER_TYPE_LABELS[visit.encounter.type] ?? visit.encounter.type}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatVisitTime(visit.encounter.period.startedAt)}
                    </span>
                  </div>
                  {visit.patient?.identifier && (
                    <span className="pl-5 text-xs text-muted-foreground/70">
                      MRN: {visit.patient.identifier}
                    </span>
                  )}
                  <span
                    className="pl-5 font-mono text-[10px] text-muted-foreground/50"
                    title="Encounter ID"
                  >
                    {visit.encounter.identifier}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
