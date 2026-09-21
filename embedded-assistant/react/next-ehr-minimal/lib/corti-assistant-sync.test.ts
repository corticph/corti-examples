import { describe, expect, it } from "vitest";
import { mapCortiSoapDocumentToEhrFields } from "@/lib/corti-assistant-sync";
import { CORTI_SOAP_SECTIONS } from "@/lib/corti-soap-template";

describe("corti assistant document sync", () => {
  it("maps schema-driven SOAP section UUIDs to EHR fields", () => {
    const sections = CORTI_SOAP_SECTIONS.map((section) => ({
      key: section.id,
      text: `${section.title} content`,
    }));

    expect(mapCortiSoapDocumentToEhrFields({ document: { sections } })).toEqual({
      subjective: "Subjective content",
      objective: "Objective content",
      assessment: "Assessment content",
      plan: "Actions and Plan content",
    });
  });

  it("ignores sections outside the fixed SOAP mapping", () => {
    expect(
      mapCortiSoapDocumentToEhrFields({
        document: {
          sections: [
            { key: "00000000-0000-0000-0000-000000000000", text: "Unknown content" },
          ],
        },
      }),
    ).toEqual({});
  });
});
