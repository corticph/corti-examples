import type { DocGenConfig } from "../_shared/DocumentGeneratorApplet";
import { DocumentGeneratorApplet } from "../_shared/DocumentGeneratorApplet";

const config: DocGenConfig = {
  heading: "Referral letter",
  description:
    "Paste a clinical summary or consultation notes and generate a structured referral letter using Corti's document generation API. Sections are controlled by the template configured for your tenant.",
  templateKeywords: ["referral", "letter"],
  inputLabel: "Clinical input",
  sampleText:
    "46-year-old female with history of type 2 diabetes presents with persistent right knee pain for 6 months. Conservative management with NSAIDs and physical therapy has not provided relief. Imaging shows moderate medial compartment osteoarthritis. Requesting orthopedic consultation for possible surgical management.",
  generateLabel: "Generate referral letter",
};

export function ReferralLetter() {
  return <DocumentGeneratorApplet config={config} />;
}
