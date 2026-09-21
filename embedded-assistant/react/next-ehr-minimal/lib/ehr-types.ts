export type AppointmentStatus =
  | "upcoming"
  | "checked-in"
  | "in-progress"
  | "completed";

export type OutcomeType = "none" | "prescription" | "referral";

export type ConsultationType =
  | "general-gp"
  | "annual-checkup"
  | "lab-test"
  | "vaccination"
  | "prenatal"
  | "medication-review";

export const consultationTypes = [
  "general-gp",
  "annual-checkup",
  "lab-test",
  "vaccination",
  "prenatal",
  "medication-review",
] as const satisfies readonly ConsultationType[];

export type PatientSummary = {
  id: number;
  fullName: string;
  dob: string;
  age: number;
  sex: string;
  phone: string;
  email: string;
  address: string;
  nhsNumber: string;
  allergies: string;
  chronicConditions: string;
  lastRecordAt: string | null;
  nextAppointmentAt: string | null;
};

export type AppointmentSummary = {
  id: number;
  patientId: number;
  patientName: string;
  startsAt: string;
  clinician: string;
  reason: string;
  status: AppointmentStatus;
  consultationType: ConsultationType;
};

export type DashboardData = {
  totals: {
    patientCount: number;
    upcomingCount: number;
    recordsThisWeek: number;
    medicationActionsThisMonth: number;
  };
  recentPatients: PatientSummary[];
  upcomingAppointments: AppointmentSummary[];
};

export type PatientDetail = {
  patient: PatientSummary;
  recordEntries: RecordEntry[];
  entryCounts: RecordEntryCount[];
  appointments: AppointmentSummary[];
};

export type AppointmentDetail = {
  appointment: AppointmentSummary;
  patient: PatientSummary;
  recordEntries: RecordEntry[];
};

export type RecordEntryType =
  | "history"
  | "examination"
  | "diagnosis"
  | "care-plan"
  | "vitals"
  | "body-metrics"
  | "test-order"
  | "lab-result"
  | "medication"
  | "vaccination"
  | "maternity"
  | "patient-message"
  | "referral"
  | "document";

export const recordEntryTypes = [
  "history",
  "examination",
  "diagnosis",
  "care-plan",
  "vitals",
  "body-metrics",
  "test-order",
  "lab-result",
  "medication",
  "vaccination",
  "maternity",
  "patient-message",
  "referral",
  "document",
] as const satisfies readonly RecordEntryType[];

export type VitalsPayload = {
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  temperatureC?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
};

export type BodyMetricsPayload = {
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
};

export type HistoryPayload = {
  detail: string;
};

export type ExaminationPayload = {
  findings: string;
};

export type DiagnosisPayload = {
  impression: string;
};

export type CarePlanPayload = {
  plan: string;
  outcomeType?: OutcomeType;
  outcomeDetails?: string | null;
};

export type TestOrderPayload = {
  testName: string;
  reason?: string | null;
  status: "ordered" | "performed" | "resulted";
};

export type LabResultPayload = {
  testName: string;
  result: string;
  unit?: string | null;
  referenceRange?: string | null;
  status: "normal" | "abnormal" | "borderline";
};

export type MedicationPayload = {
  medication: string;
  dose: string;
  status: "started" | "changed" | "renewed" | "stopped";
  instructions?: string | null;
};

export type VaccinationPayload = {
  vaccine: string;
  dose?: string | null;
  site?: string | null;
  batch?: string | null;
  status: "administered" | "declined" | "planned";
};

export type MaternityPayload = {
  gestationWeeks?: number;
  fetalHeartRate?: number;
  fundalHeightCm?: number;
  notes: string;
};

export type MessagePayload = {
  channel: "phone" | "portal" | "reception";
  detail: string;
};

export type ReferralPayload = {
  specialty: string;
  destination: string;
  status: "requested" | "sent" | "accepted" | "completed";
};

export type DocumentPayload = {
  documentType: string;
  status: "created" | "sent" | "received" | "signed";
};

export type RecordEntryPayload = {
  history?: HistoryPayload;
  examination?: ExaminationPayload;
  diagnosis?: DiagnosisPayload;
  carePlan?: CarePlanPayload;
  vitals?: VitalsPayload;
  bodyMetrics?: BodyMetricsPayload;
  testOrder?: TestOrderPayload;
  labResult?: LabResultPayload;
  medication?: MedicationPayload;
  vaccination?: VaccinationPayload;
  maternity?: MaternityPayload;
  message?: MessagePayload;
  referral?: ReferralPayload;
  document?: DocumentPayload;
};

export type RecordEntry = {
  id: number;
  patientId: number;
  appointmentId: number | null;
  interactionId: string | null;
  type: RecordEntryType;
  occurredAt: string;
  title: string;
  summary: string;
  authoredBy: string;
  source: string;
  payload: RecordEntryPayload;
};

export type RecordEntryCount = {
  type: RecordEntryType;
  count: number;
};
