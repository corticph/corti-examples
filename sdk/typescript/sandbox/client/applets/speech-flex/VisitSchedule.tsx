/**
 * VisitSchedule — the visit list panel (left column).
 *
 * Renders interactions sorted by scheduled visit date (encounter.period.startedAt).
 * Each row shows the patient name, encounter type, and scheduled time. Selecting
 * a visit sets the active interaction for both dictation and ambient modes.
 * Interactions created without patient data (most other applets on the shared
 * tenant) get a deterministic fallback name — see visitPatientName.
 *
 * Includes a "New visit" form to simulate a schedule feed entry — in a
 * real EHR integration these interactions would be created server-side
 * from the scheduling system, not from the browser. The form expands below
 * the "Visit schedule" heading, spanning the full rail width.
 */
import { CalendarPlus, Loader2, User } from "lucide-react";
import { useState } from "react";
import { cn } from "../_shared/utils";
import { Eyebrow } from "./kit";
import type { VisitItem } from "./workspaceState";
import { ENCOUNTER_TYPE_LABELS, visitPatientName } from "./workspaceState";

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

/**
 * The expanded new-visit form — rendered as a sibling below the schedule
 * heading so it spans the full rail width. Never render it inside the
 * heading's flex row: next to the Eyebrow the fixed-width inputs overflow the
 * narrow rail and get clipped by its scroll container.
 */
function NewVisitForm({
  onCreate,
  onClose,
  creating,
}: {
  onCreate: (params: {
    patientIdentifier: string;
    patientName: string;
    scheduledAt: Date;
  }) => Promise<void>;
  onClose: () => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [mrn, setMrn] = useState("");
  const [time, setTime] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating || !name.trim() || !mrn.trim() || !time) {
      return;
    }
    try {
      await onCreate({
        patientIdentifier: mrn.trim(),
        patientName: name.trim(),
        scheduledAt: new Date(time),
      });
    } catch {
      // onCreate already logged; keep the form open so nothing is lost.
      return;
    }
    setName("");
    setMrn("");
    setTime("");
    onClose();
  };

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
        className="rounded-[5px] border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-lime-600 dark:focus:border-corti-lime"
      />
      <input
        type="text"
        placeholder="MRN"
        value={mrn}
        onChange={(e) => setMrn(e.target.value)}
        className="rounded-[5px] border border-border bg-background px-2 py-1 font-mono text-[13px] outline-none focus:border-lime-600 dark:focus:border-corti-lime"
      />
      <input
        type="datetime-local"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="rounded-[5px] border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-lime-600 dark:focus:border-corti-lime"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={creating || !name.trim() || !mrn.trim() || !time}
          className="rounded-[5px] border border-lime-600 bg-lime-600/10 px-2 py-1 text-xs font-medium text-foreground disabled:opacity-50 dark:border-corti-lime dark:bg-corti-lime/10"
        >
          {creating ? "Creating…" : "Add to schedule"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[5px] border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
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
  onCreate: (params: {
    patientIdentifier: string;
    patientName: string;
    scheduledAt: Date;
  }) => Promise<void>;
  creating: boolean;
}) {
  const [newVisitOpen, setNewVisitOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="shrink-0">Visit schedule</Eyebrow>
        {!newVisitOpen && (
          <button
            type="button"
            onClick={() => setNewVisitOpen(true)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            New visit
          </button>
        )}
      </div>

      {/* The form opens BELOW the heading, spanning the rail's full width —
          never inside the heading row (see NewVisitForm above). */}
      {newVisitOpen && (
        <NewVisitForm
          onCreate={onCreate}
          onClose={() => setNewVisitOpen(false)}
          creating={creating}
        />
      )}

      {loading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading visits…
        </p>
      )}
      {error && <p className="text-xs text-variant-error-text">{error}</p>}

      {!loading && visits.length === 0 && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          No visits scheduled. Create one to get started.
        </p>
      )}

      {visits.length > 0 && (
        <ul className="flex flex-col gap-1">
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
                      : "border-border bg-card hover:border-border-strong hover:bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <User
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-lime-600 dark:text-corti-lime" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {visitPatientName(visit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-5">
                    <span className="text-[12px] text-muted-foreground">
                      {ENCOUNTER_TYPE_LABELS[visit.encounter.type] ?? visit.encounter.type}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {formatVisitTime(visit.encounter.period.startedAt)}
                    </span>
                  </div>
                  {visit.patient?.identifier && (
                    <span className="pl-5 font-mono text-[11px] text-muted-foreground/70">
                      MRN {visit.patient.identifier}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
