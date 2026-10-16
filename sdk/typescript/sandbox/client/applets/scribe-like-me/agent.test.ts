import { describe, expect, it } from "vitest";
import {
  aliasCandidateSections,
  type CandidateTemplate,
  parseAndValidateTailorResponse,
  remapTailorResult,
  summarizeOutputShape,
} from "./agent";

const candidate: CandidateTemplate = {
  templateId: "template-1",
  templateName: "SOAP",
  sections: [
    {
      sectionId: "subjective",
      heading: "Subjective",
      contentPrompt: "Include the patient history.",
      writingStylePrompt: "Use complete sentences.",
      miscPrompt: "Do not infer diagnoses.",
      outputShape: { type: "string" },
    },
    {
      sectionId: "plan",
      heading: "Plan",
      contentPrompt: "Include the treatment plan.",
      writingStylePrompt: "Use concise bullets.",
      miscPrompt: "",
      outputShape: {
        type: "array",
        itemFormat: "- {item}\n",
        items: { type: "string" },
      },
    },
  ],
};

const validResponse = {
  templateId: "template-1",
  templatePromptOverride: null,
  sections: [
    {
      sectionId: "subjective",
      headingOverride: null,
      contentPromptOverride: null,
      writingStylePromptOverride: "Use sentence fragments.",
      rationale: "Fragments recur across the historical notes.",
    },
    {
      sectionId: "plan",
      headingOverride: null,
      contentPromptOverride: null,
      writingStylePromptOverride: null,
      rationale: "The default bullet style already matches.",
    },
  ],
};

describe("summarizeOutputShape", () => {
  it("retains rendering structure without copying value-level schema details", () => {
    expect(
      summarizeOutputShape({
        type: "array",
        description: "One row per medication.",
        itemFormat: "{item}\n",
        minItems: 1,
        items: {
          type: "object",
          fieldFormat: "{name}{route}",
          fields: [
            {
              key: "name",
              description: "Medication name.",
              value: { type: "string", pattern: "^[A-Z]" },
            },
            {
              key: "route",
              description: "Medication route.",
              value: { type: "string", enum: ["", " PO", " IV"] },
            },
          ],
        },
      }),
    ).toEqual({
      type: "array",
      description: "One row per medication.",
      itemFormat: "{item}\n",
      items: {
        type: "object",
        fieldFormat: "{name}{route}",
        fields: [
          {
            key: "name",
            description: "Medication name.",
            value: { type: "string" },
          },
          {
            key: "route",
            description: "Medication route.",
            value: { type: "string", enumValueCount: 3 },
          },
        ],
      },
    });
  });
});

describe("aliasCandidateSections + remapTailorResult", () => {
  const uuidCandidate: CandidateTemplate = {
    templateId: "tpl-a",
    templateName: "SOAP",
    sections: [
      {
        sectionId: "362ada95-ac25-56b9-b792-000de66e1b35",
        heading: "Subjective",
        contentPrompt: "Include the patient history.",
        writingStylePrompt: "Use complete sentences.",
        miscPrompt: "",
        outputShape: { type: "string" },
      },
      {
        sectionId: "9f1c3a72-3e4d-4f5a-8b6c-7d8e9f0a1b2c",
        heading: "Plan",
        contentPrompt: "Include the treatment plan.",
        writingStylePrompt: "Use concise bullets.",
        miscPrompt: "",
        outputShape: {
          type: "array",
          itemFormat: "- {item}\n",
          items: { type: "string" },
        },
      },
    ],
  };

  it("replaces UUID sectionIds with short aliases and builds an idMap", () => {
    const { aliased, idMap } = aliasCandidateSections([uuidCandidate]);
    expect(aliased[0].sections[0].sectionId).toBe("s1");
    expect(aliased[0].sections[1].sectionId).toBe("s2");
    expect(idMap.get("s1")).toBe("362ada95-ac25-56b9-b792-000de66e1b35");
    expect(idMap.get("s2")).toBe("9f1c3a72-3e4d-4f5a-8b6c-7d8e9f0a1b2c");
  });

  it("round-trips: alias → validate → remap produces real section IDs", () => {
    const { aliased, idMap } = aliasCandidateSections([uuidCandidate]);
    const agentResponse = {
      templateId: "tpl-a",
      templatePromptOverride: null,
      sections: [
        {
          sectionId: "s1",
          headingOverride: null,
          contentPromptOverride: null,
          writingStylePromptOverride: "Telegraphic.",
          rationale: "Fragments recur.",
        },
        {
          sectionId: "s2",
          headingOverride: null,
          contentPromptOverride: null,
          writingStylePromptOverride: null,
          rationale: "Default matches.",
        },
      ],
    };
    const parsed = parseAndValidateTailorResponse(JSON.stringify(agentResponse), aliased);
    const remapped = remapTailorResult(parsed, idMap);
    expect(remapped.sections[0].sectionId).toBe("362ada95-ac25-56b9-b792-000de66e1b35");
    expect(remapped.sections[1].sectionId).toBe("9f1c3a72-3e4d-4f5a-8b6c-7d8e9f0a1b2c");
  });

  it("validation still catches a garbled alias (not a garbled UUID)", () => {
    const { aliased } = aliasCandidateSections([uuidCandidate]);
    const badResponse = {
      templateId: "tpl-a",
      templatePromptOverride: null,
      sections: [
        {
          sectionId: "s0",
          headingOverride: null,
          contentPromptOverride: null,
          writingStylePromptOverride: null,
          rationale: "x",
        },
        {
          sectionId: "s2",
          headingOverride: null,
          contentPromptOverride: null,
          writingStylePromptOverride: null,
          rationale: "y",
        },
      ],
    };
    expect(() => parseAndValidateTailorResponse(JSON.stringify(badResponse), aliased)).toThrow(
      "unknown sectionId: s0",
    );
  });
});

describe("parseAndValidateTailorResponse", () => {
  it("accepts complete responses and strips markdown fences", () => {
    const result = parseAndValidateTailorResponse(
      `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``,
      [candidate],
    );
    expect(result).toEqual(validResponse);
  });

  it("rejects an unknown template instead of falling back to the first candidate", () => {
    const response = { ...validResponse, templateId: "invented-template" };
    expect(() => parseAndValidateTailorResponse(JSON.stringify(response), [candidate])).toThrow(
      "unknown templateId: invented-template",
    );
  });

  it("rejects missing sections", () => {
    const response = {
      ...validResponse,
      sections: validResponse.sections.slice(0, 1),
    };
    expect(() => parseAndValidateTailorResponse(JSON.stringify(response), [candidate])).toThrow(
      "omitted sectionIds: Plan",
    );
  });

  it("rejects duplicate and unknown section IDs", () => {
    const duplicate = {
      ...validResponse,
      sections: [validResponse.sections[0], validResponse.sections[0]],
    };
    expect(() => parseAndValidateTailorResponse(JSON.stringify(duplicate), [candidate])).toThrow(
      "duplicate sectionId: subjective",
    );

    const unknown = {
      ...validResponse,
      sections: [{ ...validResponse.sections[0], sectionId: "invented-section" }],
    };
    expect(() => parseAndValidateTailorResponse(JSON.stringify(unknown), [candidate])).toThrow(
      "unknown sectionId: invented-section",
    );
  });

  it("rejects invalid override types and empty rationales", () => {
    const invalidOverride = structuredClone(validResponse) as Record<string, unknown>;
    (invalidOverride.sections as Array<Record<string, unknown>>)[0].headingOverride = 42;
    expect(() =>
      parseAndValidateTailorResponse(JSON.stringify(invalidOverride), [candidate]),
    ).toThrow("expected string or null");

    const emptyRationale = structuredClone(validResponse);
    emptyRationale.sections[0].rationale = "  ";
    expect(() =>
      parseAndValidateTailorResponse(JSON.stringify(emptyRationale), [candidate]),
    ).toThrow("empty rationale for subjective");
  });
});
