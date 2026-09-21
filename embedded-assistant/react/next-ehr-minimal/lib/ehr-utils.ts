import type { RecordEntryType } from "@/lib/ehr-types";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function initialsFromName(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function outcomeLabel(outcomeType: "none" | "prescription" | "referral") {
  switch (outcomeType) {
    case "prescription":
      return "Prescription";
    case "referral":
      return "Referral";
    default:
      return "Advice only";
  }
}

export function recordEntryTypeLabel(type: RecordEntryType) {
  switch (type) {
    case "body-metrics":
      return "Body data";
    case "care-plan":
      return "Care plans";
    case "diagnosis":
      return "Diagnoses";
    case "examination":
      return "Exams";
    case "history":
      return "History";
    case "lab-result":
      return "Labs";
    case "patient-message":
      return "Messages";
    case "test-order":
      return "Tests";
    case "vitals":
      return "Vitals";
    case "medication":
      return "Medication";
    case "vaccination":
      return "Vaccinations";
    case "maternity":
      return "Maternity";
    case "referral":
      return "Referrals";
    case "document":
      return "Documents";
  }
}

export function recordEntryTypeDescription(type: RecordEntryType) {
  switch (type) {
    case "body-metrics":
      return "Height, weight, and BMI over time.";
    case "care-plan":
      return "Care plans, follow-up, and safety-netting from encounters.";
    case "diagnosis":
      return "Clinical impressions and working diagnoses over time.";
    case "examination":
      return "Examination findings recorded during encounters.";
    case "history":
      return "Patient-reported history and symptoms from encounters or messages.";
    case "vitals":
      return "Blood pressure, heart rate, temperature, and related observations.";
    case "test-order":
      return "Investigations ordered or performed during care.";
    case "lab-result":
      return "Results received from pathology and external services.";
    case "medication":
      return "Medication starts, renewals, dose changes, and stops.";
    case "vaccination":
      return "Vaccines administered, planned, or declined.";
    case "maternity":
      return "Pregnancy-specific observations and antenatal notes.";
    case "patient-message":
      return "Patient calls, portal messages, and reception notes.";
    case "referral":
      return "Referral requests and specialty follow-up.";
    case "document":
      return "Letters, forms, plans, and received documents.";
  }
}

export function appointmentStatusLabel(status: "upcoming" | "checked-in" | "in-progress" | "completed") {
  switch (status) {
    case "checked-in":
      return "Checked in";
    case "in-progress":
      return "In progress";
    case "completed":
      return "Completed";
    default:
      return "Upcoming";
  }
}