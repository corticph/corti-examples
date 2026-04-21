export type AppointmentStatus =
  | "upcoming"
  | "checked-in"
  | "in-progress"
  | "completed";

export type OutcomeType = "none" | "prescription" | "referral";

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
  lastVisitDate: string | null;
  nextAppointmentAt: string | null;
};

export type VisitSummary = {
  id: number;
  patientId: number;
  appointmentId: number | null;
  visitDate: string;
  clinician: string;
  reason: string;
  subjective: string;
  objective: string | null;
  bloodPressure: string | null;
  heartRate: number | null;
  temperatureC: number | null;
  assessment: string;
  plan: string;
  outcomeType: OutcomeType;
  outcomeDetails: string | null;
};

export type AppointmentSummary = {
  id: number;
  patientId: number;
  patientName: string;
  startsAt: string;
  clinician: string;
  reason: string;
  status: AppointmentStatus;
};

export type DashboardData = {
  totals: {
    patientCount: number;
    upcomingCount: number;
    completedThisWeek: number;
    prescriptionsThisMonth: number;
  };
  recentPatients: PatientSummary[];
  upcomingAppointments: AppointmentSummary[];
};

export type PatientDetail = {
  patient: PatientSummary;
  visits: VisitSummary[];
  appointments: AppointmentSummary[];
};

export type AppointmentDetail = {
  appointment: AppointmentSummary;
  patient: PatientSummary;
  visits: VisitSummary[];
};
