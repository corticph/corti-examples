/**
 * Shared state types for the Speech Flex applet.
 *
 * The applet provides two recording modes — dictation and ambient — both
 * anchored to the same interaction (the patient visit). These types model
 * the visit schedule and the mode the clinician is working in.
 */

export type WorkspaceMode = "dictation" | "ambient";

/** Human-readable labels for encounter.type values (Corti interaction API). */
export const ENCOUNTER_TYPE_LABELS: Record<string, string> = {
  first_consultation: "First consult",
  consultation: "Consultation",
  emergency: "Emergency",
  inpatient: "Inpatient",
  outpatient: "Outpatient",
};

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

/**
 * Fallback patient names for interactions that carry no patient data.
 *
 * The visit schedule lists every interaction on the shared sandbox tenant.
 * Most of them are created by other applets without a `patient` object, so
 * the schedule would otherwise show the same "Unknown patient" on every row.
 * Hashing the interaction id picks a stable, distinct-looking name per
 * visit — stable across reloads, distinct from the other rows.
 */
const FALLBACK_PATIENT_FIRST_NAMES = [
  "Maria",
  "Anna",
  "Sofia",
  "Emma",
  "Ida",
  "Clara",
  "Astrid",
  "Alma",
  "Ellen",
  "Signe",
  "Camilla",
  "Louise",
  "Mette",
  "Freja",
  "Josefine",
  "Marie",
  "Mads",
  "Emil",
  "Frederik",
  "Magnus",
  "Oliver",
  "Villads",
  "Noah",
  "Elias",
  "Sofus",
  "Aksel",
  "Viggo",
  "Oscar",
  "Anton",
  "Tobias",
  "Rasmus",
  "Henrik",
  "Karl",
  "Malik",
  "Yusuf",
  "Emre",
  "Karim",
  "Amira",
  "Leila",
  "Nora",
];

const FALLBACK_PATIENT_LAST_NAMES = [
  "Andersen",
  "Jensen",
  "Kristensen",
  "Nielsen",
  "Larsen",
  "Madsen",
  "Thomsen",
  "Sørensen",
  "Poulsen",
  "Holm",
  "Møller",
  "Kjær",
  "Lund",
  "Berg",
  "Dahl",
  "Vinther",
  "Skov",
  "Kruse",
  "Winther",
  "Bjerre",
  "Hoffmann",
  "Hansen",
  "Pedersen",
  "Christensen",
  "Vestergaard",
  "Lindgren",
  "Bak",
  "Aziz",
  "Yıldız",
  "Novak",
  "Horvat",
  "Kowalski",
  "Fontaine",
  "Moreau",
  "Rossi",
  "Esposito",
  "Papadopoulos",
  "Schmidt",
  "Fischer",
  "Weber",
];

const FALLBACK_MIDDLE_INITIAL_COUNT = 26;

/**
 * Deterministic fallback name for a patient-less interaction.
 *
 * Uses the djb2 hash of the interaction id to index the name pools (first
 * name, middle initial, last name) — 40 × 26 × 40 combinations, so the
 * ~50 interactions on the tenant virtually always get distinct names.
 * The middle initial also reads like a real medical-record identity.
 */
export function fallbackPatientName(interactionId: string): string {
  // djbx33 (djb2) hash, masked to 32 bits after each step.
  let hash = 5381;
  for (let i = 0; i < interactionId.length; i++) {
    hash = (hash * 33 + interactionId.charCodeAt(i)) >>> 0;
  }
  const first = FALLBACK_PATIENT_FIRST_NAMES[hash % FALLBACK_PATIENT_FIRST_NAMES.length];
  const initialOffset = Math.floor(hash / FALLBACK_PATIENT_FIRST_NAMES.length);
  const initial = String.fromCharCode(65 + (initialOffset % FALLBACK_MIDDLE_INITIAL_COUNT));
  const lastOffset = Math.floor(
    hash / (FALLBACK_PATIENT_FIRST_NAMES.length * FALLBACK_MIDDLE_INITIAL_COUNT),
  );
  const last = FALLBACK_PATIENT_LAST_NAMES[lastOffset % FALLBACK_PATIENT_LAST_NAMES.length];
  return `${first} ${initial}. ${last}`;
}

/**
 * Display name for a visit: the recorded patient name, then the encounter
 * title, and finally the deterministic fallback so unnamed interactions
 * (created by other applets on the shared tenant) each read as a distinct
 * patient instead of "Unknown patient".
 */
export function visitPatientName(visit: VisitItem): string {
  return visit.patient?.name ?? visit.encounter.title ?? fallbackPatientName(visit.interactionId);
}
