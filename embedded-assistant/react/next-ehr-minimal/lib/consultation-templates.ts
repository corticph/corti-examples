import {
  recordEntryTypes,
  type ConsultationType,
  type RecordEntryType,
} from "@/lib/ehr-types";

type ConsultationTemplate = {
  type: ConsultationType;
  label: string;
  description: string;
  defaultEntryTypes: RecordEntryType[];
};

const nonConsultationFormEntryTypes = new Set<RecordEntryType>([
  "lab-result",
  "patient-message",
  "document",
]);

const prenatalOnlyEntryTypes = new Set<RecordEntryType>(["maternity"]);

export const consultationTemplates = [
  {
    type: "general-gp",
    label: "General GP visit",
    description:
      "Standard problem-focused encounter with history, examination, assessment, care plan, and observations.",
    defaultEntryTypes: [
      "history",
      "examination",
      "diagnosis",
      "care-plan",
      "vitals",
    ],
  },
  {
    type: "annual-checkup",
    label: "Annual checkup",
    description:
      "Preventive review with observations, body metrics, care plan, and routine investigations.",
    defaultEntryTypes: [
      "history",
      "vitals",
      "body-metrics",
      "test-order",
      "care-plan",
    ],
  },
  {
    type: "lab-test",
    label: "Lab test",
    description:
      "Investigation-only workflow for ordering or performing a lab test without a full clinical note.",
    defaultEntryTypes: ["test-order"],
  },
  {
    type: "vaccination",
    label: "Vaccination",
    description:
      "Immunization visit with vaccination details and optional observations or advice.",
    defaultEntryTypes: ["vaccination", "care-plan"],
  },
  {
    type: "prenatal",
    label: "Pre-natal visit",
    description:
      "Antenatal review with history, observations, body metrics, maternity findings, and care plan.",
    defaultEntryTypes: [
      "history",
      "vitals",
      "body-metrics",
      "maternity",
      "care-plan",
    ],
  },
  {
    type: "medication-review",
    label: "Medication review",
    description:
      "Medication-focused encounter with history, medication action, observations, and care plan.",
    defaultEntryTypes: ["history", "medication", "vitals", "care-plan"],
  },
] as const satisfies readonly ConsultationTemplate[];

export function getConsultationTemplate(type: ConsultationType) {
  return consultationTemplates.find((template) => template.type === type)!;
}

export function getConsultationFormEntryTypes(type: ConsultationType) {
  return recordEntryTypes.filter((entryType) => {
    if (nonConsultationFormEntryTypes.has(entryType)) {
      return false;
    }

    return type === "prenatal" || !prenatalOnlyEntryTypes.has(entryType);
  });
}

export function isConsultationType(value: string): value is ConsultationType {
  return consultationTemplates.some((template) => template.type === value);
}