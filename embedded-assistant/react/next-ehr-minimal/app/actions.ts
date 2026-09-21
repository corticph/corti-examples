"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getConsultationFormEntryTypes,
  getConsultationTemplate,
  isConsultationType,
} from "@/lib/consultation-templates";
import { createRecordEntriesFromConsultation } from "@/lib/ehr-db";
import { recordEntryTypes, type RecordEntryType } from "@/lib/ehr-types";

export type InteractionField =
  | "patientId"
  | "appointmentId"
  | "consultationType"
  | "clinician"
  | "reason"
  | "subjective"
  | "objective"
  | "bloodPressure"
  | "heartRate"
  | "temperatureC"
  | "heightCm"
  | "weightKg"
  | "bmi"
  | "assessment"
  | "plan"
  | "testName"
  | "testReason"
  | "vaccine"
  | "vaccineDose"
  | "vaccineSite"
  | "vaccineBatch"
  | "vaccineStatus"
  | "gestationWeeks"
  | "fetalHeartRate"
  | "fundalHeightCm"
  | "maternityNotes"
  | "outcomeType"
  | "outcomeDetails";

export type InteractionFormState = {
  message: string | null;
  fieldErrors: Partial<Record<InteractionField, string>>;
};

function readTrimmedString(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function requireString(
  formData: FormData,
  field: InteractionField,
  label: string,
  fieldErrors: InteractionFormState["fieldErrors"],
) {
  const value = readTrimmedString(formData, field);

  if (value.length === 0) {
    fieldErrors[field] = `${label} is required.`;
    return null;
  }

  return value;
}

function readOptionalNumber(
  formData: FormData,
  field: InteractionField,
  label: string,
  fieldErrors: InteractionFormState["fieldErrors"],
  range: { min: number; max: number },
) {
  const value = readTrimmedString(formData, field);

  if (value.length === 0) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    fieldErrors[field] = `${label} must be a number.`;
    return null;
  }

  if (numericValue < range.min || numericValue > range.max) {
    fieldErrors[field] =
      `${label} must be between ${range.min} and ${range.max}.`;
    return null;
  }

  return numericValue;
}

function hasRecordEntryType(value: string): value is RecordEntryType {
  return recordEntryTypes.includes(value as RecordEntryType);
}

function readSelectedEntryTypes(formData: FormData) {
  return Array.from(new Set(formData.getAll("entryTypes")))
    .filter((value): value is string => typeof value === "string")
    .filter(hasRecordEntryType);
}

export async function completeAppointmentAction(
  _previousState: InteractionFormState,
  formData: FormData,
): Promise<InteractionFormState> {
  const appointmentId = Number(readTrimmedString(formData, "appointmentId"));
  const patientId = Number(readTrimmedString(formData, "patientId"));

  if (
    (!Number.isInteger(appointmentId) || appointmentId <= 0) &&
    (!Number.isInteger(patientId) || patientId <= 0)
  ) {
    return {
      message:
        "This consultation could not be saved because its patient record was not found.",
      fieldErrors: {},
    };
  }

  const fieldErrors: InteractionFormState["fieldErrors"] = {};
  const consultationTypeValue = readTrimmedString(formData, "consultationType");

  if (!isConsultationType(consultationTypeValue)) {
    fieldErrors.consultationType = "Choose a valid consultation type.";
  }

  const consultationType = isConsultationType(consultationTypeValue)
    ? consultationTypeValue
    : "general-gp";
  const template = getConsultationTemplate(consultationType);
  const formSupportedEntryTypes = getConsultationFormEntryTypes(consultationType);
  const selectedEntryTypes = readSelectedEntryTypes(formData).filter((entryType) =>
    formSupportedEntryTypes.includes(entryType)
  );
  const entryTypes =
    selectedEntryTypes.length > 0
      ? selectedEntryTypes
      : [...template.defaultEntryTypes];
  const clinician = requireString(
    formData,
    "clinician",
    "Clinician",
    fieldErrors,
  );
  const reason = requireString(
    formData,
    "reason",
    "Reason for visit",
    fieldErrors,
  );
  const subjective = readTrimmedString(formData, "subjective");
  const assessment = readTrimmedString(formData, "assessment");
  const plan = readTrimmedString(formData, "plan");
  const objective = readTrimmedString(formData, "objective");
  const bloodPressure = readTrimmedString(formData, "bloodPressure");
  const heartRate = readOptionalNumber(
    formData,
    "heartRate",
    "Heart rate",
    fieldErrors,
    { min: 40, max: 180 },
  );
  const temperatureC = readOptionalNumber(
    formData,
    "temperatureC",
    "Temperature",
    fieldErrors,
    { min: 34, max: 42 },
  );
  const heightCm = readOptionalNumber(formData, "heightCm", "Height", fieldErrors, {
    min: 40,
    max: 230,
  });
  const weightKg = readOptionalNumber(formData, "weightKg", "Weight", fieldErrors, {
    min: 1,
    max: 350,
  });
  const bmi = readOptionalNumber(formData, "bmi", "BMI", fieldErrors, {
    min: 5,
    max: 80,
  });
  const testName = readTrimmedString(formData, "testName");
  const testReason = readTrimmedString(formData, "testReason");
  const vaccine = readTrimmedString(formData, "vaccine");
  const vaccineDose = readTrimmedString(formData, "vaccineDose");
  const vaccineSite = readTrimmedString(formData, "vaccineSite");
  const vaccineBatch = readTrimmedString(formData, "vaccineBatch");
  const vaccineStatusValue = readTrimmedString(formData, "vaccineStatus");
  const vaccineStatus = ["administered", "declined", "planned"].includes(
    vaccineStatusValue,
  )
    ? (vaccineStatusValue as "administered" | "declined" | "planned")
    : "administered";
  const gestationWeeks = readOptionalNumber(
    formData,
    "gestationWeeks",
    "Gestation",
    fieldErrors,
    { min: 4, max: 43 },
  );
  const fetalHeartRate = readOptionalNumber(
    formData,
    "fetalHeartRate",
    "Fetal heart rate",
    fieldErrors,
    { min: 80, max: 220 },
  );
  const fundalHeightCm = readOptionalNumber(
    formData,
    "fundalHeightCm",
    "Fundal height",
    fieldErrors,
    { min: 8, max: 50 },
  );
  const maternityNotes = readTrimmedString(formData, "maternityNotes");
  const outcomeTypeValue = readTrimmedString(formData, "outcomeType");
  const outcomeType = outcomeTypeValue as "none" | "prescription" | "referral";

  if (!["none", "prescription", "referral"].includes(outcomeTypeValue)) {
    fieldErrors.outcomeType = "Choose a valid outcome type.";
  }

  const outcomeDetails = readTrimmedString(formData, "outcomeDetails");

  if (outcomeTypeValue !== "none" && outcomeDetails.length === 0) {
    fieldErrors.outcomeDetails =
      "Outcome details are required for prescriptions and referrals.";
  }

  if (entryTypes.includes("history") && !subjective) {
    fieldErrors.subjective = "History is required for this consultation type.";
  }

  if (entryTypes.includes("examination") && objective.length === 0) {
    fieldErrors.objective = "Examination findings are required for this consultation type.";
  }

  if (entryTypes.includes("diagnosis") && !assessment) {
    fieldErrors.assessment = "Assessment is required for this consultation type.";
  }

  if (entryTypes.includes("care-plan") && !plan) {
    fieldErrors.plan = "Plan is required for this consultation type.";
  }

  if (
    entryTypes.includes("vitals") &&
    bloodPressure.length === 0 &&
    heartRate === null &&
    temperatureC === null
  ) {
    fieldErrors.bloodPressure = "Record at least one vital sign.";
  }

  if (
    entryTypes.includes("body-metrics") &&
    heightCm === null &&
    weightKg === null &&
    bmi === null
  ) {
    fieldErrors.heightCm = "Record at least one body measurement.";
  }

  if (entryTypes.includes("test-order") && testName.length === 0) {
    fieldErrors.testName = "Test name is required for this consultation type.";
  }

  if (entryTypes.includes("vaccination") && vaccine.length === 0) {
    fieldErrors.vaccine = "Vaccine name is required for this consultation type.";
  }

  if (entryTypes.includes("maternity") && maternityNotes.length === 0) {
    fieldErrors.maternityNotes = "Maternity notes are required for this consultation type.";
  }

  if (entryTypes.includes("medication") && outcomeType !== "prescription") {
    fieldErrors.outcomeType = "Medication review entries need a prescription outcome.";
  }

  if (entryTypes.includes("referral") && outcomeType !== "referral") {
    fieldErrors.outcomeType = "Referral entries need a referral outcome.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      message:
        "Complete the highlighted fields before saving the consultation.",
      fieldErrors,
    };
  }

  try {
    createRecordEntriesFromConsultation({
      appointmentId: Number.isInteger(appointmentId) && appointmentId > 0 ? appointmentId : null,
      patientId: Number.isInteger(patientId) && patientId > 0 ? patientId : null,
      selectedEntryTypes: entryTypes,
      clinician: clinician!,
      reason: reason!,
      subjective,
      objective: objective.length > 0 ? objective : null,
      bloodPressure: bloodPressure.length > 0 ? bloodPressure : null,
      heartRate,
      temperatureC,
      heightCm,
      weightKg,
      bmi,
      assessment,
      plan,
      testName: testName.length > 0 ? testName : null,
      testReason: testReason.length > 0 ? testReason : null,
      vaccine: vaccine.length > 0 ? vaccine : null,
      vaccineDose: vaccineDose.length > 0 ? vaccineDose : null,
      vaccineSite: vaccineSite.length > 0 ? vaccineSite : null,
      vaccineBatch: vaccineBatch.length > 0 ? vaccineBatch : null,
      vaccineStatus,
      gestationWeeks,
      fetalHeartRate,
      fundalHeightCm,
      maternityNotes: maternityNotes.length > 0 ? maternityNotes : null,
      outcomeType,
      outcomeDetails: outcomeDetails.length > 0 ? outcomeDetails : null,
    });
  } catch {
    return {
      message:
        "The consultation could not be saved. Refresh the page and try again.",
      fieldErrors: {},
    };
  }

  revalidatePath("/");
  revalidatePath("/patients");
  revalidatePath("/appointments");
  if (Number.isInteger(appointmentId) && appointmentId > 0) {
    revalidatePath(`/appointments/${appointmentId}`);
  }
  if (Number.isInteger(patientId) && patientId > 0) {
    revalidatePath(`/patients/${patientId}`);
    redirect(`/patients/${patientId}`);
  }
  redirect("/");
}
