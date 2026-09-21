import { create } from "zustand";

export const consultationFormFieldNames = [
  "clinician",
  "reason",
  "subjective",
  "objective",
  "bloodPressure",
  "heartRate",
  "temperatureC",
  "heightCm",
  "weightKg",
  "bmi",
  "assessment",
  "plan",
  "testName",
  "testReason",
  "vaccine",
  "vaccineDose",
  "vaccineSite",
  "vaccineBatch",
  "vaccineStatus",
  "gestationWeeks",
  "fetalHeartRate",
  "fundalHeightCm",
  "maternityNotes",
  "outcomeType",
  "outcomeDetails",
] as const;

export type ConsultationFormFieldName = (typeof consultationFormFieldNames)[number];
export type ConsultationFormFields = Record<ConsultationFormFieldName, string>;
export type ConsultationFormFieldUpdates = Partial<ConsultationFormFields>;

type InitialConsultationFormFields = {
  clinician: string;
  outcomeType: string;
  reason: string;
};

type ConsultationFormStore = {
  fields: ConsultationFormFields;
  formKey: string | null;
  initializeForm: (formKey: string, fields: ConsultationFormFields) => void;
  updateField: (fieldName: ConsultationFormFieldName, value: string) => void;
  updateFields: (fields: ConsultationFormFieldUpdates) => void;
};

const emptyConsultationFormFields: ConsultationFormFields = {
  clinician: "",
  reason: "",
  subjective: "",
  objective: "",
  bloodPressure: "",
  heartRate: "",
  temperatureC: "",
  heightCm: "",
  weightKg: "",
  bmi: "",
  assessment: "",
  plan: "",
  testName: "",
  testReason: "",
  vaccine: "",
  vaccineDose: "",
  vaccineSite: "",
  vaccineBatch: "",
  vaccineStatus: "administered",
  gestationWeeks: "",
  fetalHeartRate: "",
  fundalHeightCm: "",
  maternityNotes: "",
  outcomeType: "none",
  outcomeDetails: "",
};

const consultationFormFieldNameSet = new Set<string>(consultationFormFieldNames);

export function isConsultationFormFieldName(value: string): value is ConsultationFormFieldName {
  return consultationFormFieldNameSet.has(value);
}

export function buildInitialConsultationFormFields({
  clinician,
  outcomeType,
  reason,
}: InitialConsultationFormFields): ConsultationFormFields {
  return {
    ...emptyConsultationFormFields,
    clinician,
    outcomeType,
    reason,
  };
}

export const useConsultationFormStore = create<ConsultationFormStore>((set) => ({
  fields: emptyConsultationFormFields,
  formKey: null,
  initializeForm: (formKey, fields) =>
    set((state) => (state.formKey === formKey ? state : { fields, formKey })),
  updateField: (fieldName, value) =>
    set((state) => ({
      fields: {
        ...state.fields,
        [fieldName]: value,
      },
    })),
  updateFields: (fields) =>
    set((state) => ({
      fields: {
        ...state.fields,
        ...fields,
      },
    })),
}));

export function updateConsultationFormFields(fields: ConsultationFormFieldUpdates) {
  useConsultationFormStore.getState().updateFields(fields);
}
