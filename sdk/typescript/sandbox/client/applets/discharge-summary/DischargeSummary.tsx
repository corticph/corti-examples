import type { DocGenConfig } from "../_shared/DocumentGeneratorApplet";
import { DocumentGeneratorApplet } from "../_shared/DocumentGeneratorApplet";

const config: DocGenConfig = {
  heading: "Discharge summary",
  description:
    "Paste inpatient notes, treatment records, or a clinical encounter transcript and generate a structured discharge summary using Corti's document generation API.",
  templateKeywords: ["discharge", "summary"],
  inputLabel: "Clinical input",
  sampleText:
    "72-year-old male admitted for acute exacerbation of COPD. Treated with nebulized bronchodilators, systemic corticosteroids, and supplemental oxygen. Improved steadily over 4 days. Stable on room air at discharge. Discharged on prednisone taper and maintenance inhalers.",
  generateLabel: "Generate summary",
};

export function DischargeSummary() {
  return <DocumentGeneratorApplet config={config} />;
}
