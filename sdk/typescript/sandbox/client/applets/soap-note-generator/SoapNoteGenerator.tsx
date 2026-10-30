import type { DocGenConfig } from "../_shared/DocumentGeneratorApplet";
import { DocumentGeneratorApplet } from "../_shared/DocumentGeneratorApplet";

const config: DocGenConfig = {
  heading: "SOAP note generator",
  description:
    "Paste or dictate a clinical transcript and generate a structured SOAP note using Corti's document generation API. Sections (Subjective, Objective, Assessment, Plan) are controlled by the template configured for your tenant.",
  templateKeywords: ["soap", "brief", "progress"],
  inputLabel: "Clinical input",
  sampleText:
    "Patient presents with a 3-day history of productive cough and low-grade fever. On exam, lungs clear to auscultation bilaterally, no wheezing. Throat mildly erythematous. Temperature 37.8°C. Plan: supportive care, rest, fluids. Return if symptoms worsen.",
  generateLabel: "Generate SOAP note",
};

export function SoapNoteGenerator() {
  return <DocumentGeneratorApplet config={config} />;
}
