import type { ConsultationFormFieldName } from "@/lib/consultation-form-store";

export const CORTI_SOAP_TEMPLATE_ID = "f901c06a-70db-59f6-8d0a-0a4bef4b8c77";

export const CORTI_SOAP_SECTIONS = [
  {
    id: "30391bb8-2bd5-528c-98d5-808c0bc4a717",
    title: "Subjective",
    formField: "subjective",
  },
  {
    id: "9d06b8c9-6757-52d1-ab7b-791f155fabbc",
    title: "Objective",
    formField: "objective",
  },
  {
    id: "7c1af3f7-6574-50dc-bcd9-efdae057db57",
    title: "Assessment",
    formField: "assessment",
  },
  {
    id: "362ada95-ac25-56b9-b792-000de66e1b35",
    title: "Actions and Plan",
    formField: "plan",
  },
] as const satisfies readonly {
  id: string;
  title: string;
  formField: ConsultationFormFieldName;
}[];

export function getCortiSoapFormField(sectionId: string) {
  return CORTI_SOAP_SECTIONS.find((section) => section.id === sectionId)?.formField;
}