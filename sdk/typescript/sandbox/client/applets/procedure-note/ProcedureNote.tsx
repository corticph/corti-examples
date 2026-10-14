import type { DocGenConfig } from "../_shared/DocumentGeneratorApplet";
import { DocumentGeneratorApplet } from "../_shared/DocumentGeneratorApplet";

const config: DocGenConfig = {
  heading: "Procedure note",
  description:
    "Paste a dictation or procedural description and generate a structured procedure note using Corti's document generation API. Sections are controlled by the template configured for your tenant.",
  templateKeywords: ["procedure", "operative"],
  inputLabel: "Clinical input",
  sampleText:
    "Patient positioned supine. Right wrist prepped and draped in sterile fashion. Local anesthesia administered. Incision made over volar radial aspect. Carpal tunnel released. Hemostasis achieved. Wound closed in layers. Sterile dressing applied. Patient tolerated procedure well.",
  generateLabel: "Generate procedure note",
};

export function ProcedureNote() {
  return <DocumentGeneratorApplet config={config} />;
}
