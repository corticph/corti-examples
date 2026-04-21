"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createVisitFromAppointment } from "@/lib/ehr-db";

export type InteractionField =
  | "clinician"
  | "reason"
  | "subjective"
  | "objective"
  | "bloodPressure"
  | "heartRate"
  | "temperatureC"
  | "assessment"
  | "plan"
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
  field: "heartRate" | "temperatureC",
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

export async function completeAppointmentAction(
  _previousState: InteractionFormState,
  formData: FormData,
): Promise<InteractionFormState> {
  const appointmentId = Number(readTrimmedString(formData, "appointmentId"));

  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return {
      message:
        "This appointment could not be saved because its record was not found.",
      fieldErrors: {},
    };
  }

  const fieldErrors: InteractionFormState["fieldErrors"] = {};
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
  const subjective = requireString(
    formData,
    "subjective",
    "Subjective note",
    fieldErrors,
  );
  const assessment = requireString(
    formData,
    "assessment",
    "Assessment",
    fieldErrors,
  );
  const plan = requireString(formData, "plan", "Plan", fieldErrors);
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

  if (Object.keys(fieldErrors).length > 0) {
    return {
      message:
        "Complete the highlighted fields before saving the consultation.",
      fieldErrors,
    };
  }

  try {
    createVisitFromAppointment({
      appointmentId,
      clinician: clinician!,
      reason: reason!,
      subjective: subjective!,
      objective: objective.length > 0 ? objective : null,
      bloodPressure: bloodPressure.length > 0 ? bloodPressure : null,
      heartRate,
      temperatureC,
      assessment: assessment!,
      plan: plan!,
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
  revalidatePath(`/appointments/${appointmentId}`);
  redirect("/");
}
