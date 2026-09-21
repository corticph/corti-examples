import type { ConsultationFormFieldUpdates } from "@/lib/consultation-form-store";
import { updateConsultationFormFields } from "@/lib/consultation-form-store";
import { getCortiSoapFormField } from "@/lib/corti-soap-template";

type SyncedDocumentSection = {
  key?: string;
  text?: string | null;
};

type SyncedDocumentPayload = {
  document?: {
    sections?: SyncedDocumentSection[] | null;
  } | null;
};

function normalizeSectionText(value: string | null | undefined) {
  const text = value?.trim();
  return text && text !== "Not recorded" ? text : null;
}

export function mapCortiSoapDocumentToEhrFields(
  payload: unknown,
): ConsultationFormFieldUpdates {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {};
  }

  const sections = (payload as SyncedDocumentPayload).document?.sections;
  if (!Array.isArray(sections)) {
    return {};
  }

  return sections.reduce<ConsultationFormFieldUpdates>((fields, section) => {
    const formField = section.key ? getCortiSoapFormField(section.key) : undefined;
    const value = normalizeSectionText(section.text);

    if (formField && value) {
      fields[formField] = value;
    }

    return fields;
  }, {});
}

export function syncCortiSoapDocumentToEhr(payload: unknown) {
  const fields = mapCortiSoapDocumentToEhrFields(payload);
  updateConsultationFormFields(fields);
}
