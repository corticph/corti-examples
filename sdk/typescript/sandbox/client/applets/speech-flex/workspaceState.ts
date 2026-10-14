/**
 * Shared state types for the Speech Flex applet.
 *
 * The applet provides two recording modes — dictation and ambient — both
 * anchored to the same interaction (the patient visit). These types model
 * the visit schedule and the mode the clinician is working in.
 */

export type WorkspaceMode = "dictation" | "ambient";

export interface VisitItem {
  interactionId: string;
  encounter: {
    identifier: string;
    status: string;
    type: string;
    period: { startedAt: string; endedAt?: string | null };
    title?: string | null;
  };
  patient?: {
    identifier: string;
    name?: string | null;
    gender?: string | null;
    birthDate?: string | null;
    pronouns?: string | null;
  };
  assignedUserId?: string;
  createdAt: string;
}

export const ENCOUNTER_STATUS = {
  planned: "planned",
  inProgress: "in-progress",
  completed: "completed",
  cancelled: "cancelled",
} as const;

export const ENCOUNTER_TYPES = [
  "first_consultation",
  "consultation",
  "emergency",
  "inpatient",
  "outpatient",
] as const;
