import { describe, expect, it } from "vitest";
import {
  buildGenieMessage,
  parseGenieResponse,
  summarizeCommand,
  summarizeNudge,
} from "./genieModel";

/* ------------------------------------------------------------------ */
/* buildGenieMessage                                                   */
/* ------------------------------------------------------------------ */

describe("buildGenieMessage", () => {
  it("builds a JSON string with mode, input1, input2", () => {
    const msg = buildGenieMessage("command", "insert plan, new plan", "insert a new paragraph");
    expect(JSON.parse(msg)).toEqual({
      mode: "command",
      input1: "insert plan, new plan",
      input2: "insert a new paragraph",
    });
  });
});

/* ------------------------------------------------------------------ */
/* parseGenieResponse — command mode                                   */
/* ------------------------------------------------------------------ */

describe("parseGenieResponse — command mode", () => {
  it("parses a valid insert_text command", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "insert_plan",
        phrases: ["insert plan", "new plan"],
        action: { kind: "insert_text", text: "\nPlan:" },
        description: "Insert a Plan heading",
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("command");
      if (result.mode === "command") {
        expect(result.command.id).toBe("insert_plan");
        expect(result.command.phrases).toEqual(["insert plan", "new plan"]);
        expect(result.command.action.kind).toBe("insert_text");
      }
    }
  });

  it("parses a valid delete_last command", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "undo_that",
        phrases: ["undo that", "scratch that"],
        action: { kind: "delete_last" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(true);
  });

  it("parses a valid script command with variables", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "select_text",
        phrases: ["select {text}"],
        variables: [{ key: "text", type: "wildcard" }],
        action: { kind: "script", code: "return variables.text;" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "command") {
      expect(result.command.variables).toEqual([{ key: "text", type: "wildcard" }]);
    }
  });

  it("parses a valid enum variable command", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "insert_template",
        phrases: ["insert {template} template"],
        variables: [
          {
            key: "template",
            type: "enum",
            enum: ["soap", "progress", "discharge"],
          },
        ],
        action: { kind: "insert_template", variableKey: "template" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "command") {
      expect(result.command.variables?.[0]).toEqual({
        key: "template",
        type: "enum",
        enum: ["soap", "progress", "discharge"],
      });
    }
  });

  it("rejects invalid JSON", () => {
    const result = parseGenieResponse("not json at all", "command");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result as { error: string }).error).toContain("not valid JSON");
    }
  });

  it("rejects wrong type field", () => {
    const json = JSON.stringify({ type: "nudge", rule: {} });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects missing command field", () => {
    const json = JSON.stringify({ type: "command" });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects bad command ID (spaces)", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "bad id",
        phrases: ["test"],
        action: { kind: "noop" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects empty phrases", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "test",
        phrases: [],
        action: { kind: "noop" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects unknown action kind", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "test",
        phrases: ["test"],
        action: { kind: "unknown_kind" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects insert_text without text field", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "test",
        phrases: ["test"],
        action: { kind: "insert_text" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects script without code field", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "test",
        phrases: ["test"],
        action: { kind: "script" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("rejects insert_template without variableKey", () => {
    const json = JSON.stringify({
      type: "command",
      command: {
        id: "test",
        phrases: ["test"],
        action: { kind: "insert_template" },
      },
    });
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(false);
  });

  it("strips markdown code fences", () => {
    const json =
      "```json\n" +
      JSON.stringify({
        type: "command",
        command: {
          id: "test",
          phrases: ["test"],
          action: { kind: "noop" },
        },
      }) +
      "\n```";
    const result = parseGenieResponse(json, "command");
    expect(result.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* parseGenieResponse — nudge mode                                     */
/* ------------------------------------------------------------------ */

describe("parseGenieResponse — nudge mode", () => {
  it("parses a valid text-match nudge rule", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "chf_type",
        title: "Specify CHF type",
        message: "Please specify the type and acuity.",
        trigger: {
          textMatch: {
            conditions: [{ contains: "heart failure" }, { contains: "CHF" }],
            mode: "any",
            none: [{ contains: "systolic" }, { contains: "diastolic" }],
          },
        },
        resolve: {
          textMatch: {
            conditions: [{ contains: "systolic" }, { contains: "diastolic" }],
            mode: "any",
          },
        },
        enabled: true,
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "nudge") {
      expect(result.rule.id).toBe("chf_type");
      expect(result.rule.title).toBe("Specify CHF type");
      expect(result.rule.trigger.textMatch?.mode).toBe("any");
      expect(result.rule.trigger.textMatch?.none).toHaveLength(2);
    }
  });

  it("parses a valid SNOMED nudge rule", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "chf_snomed",
        title: "Heart Failure (SNOMED)",
        message: "Specify the subtype.",
        trigger: {
          snomed: {
            conditions: [
              { code: "84114007", op: "=", condition: "present" },
              { code: "84114007", op: "descendent-of", condition: "absent" },
            ],
            mode: "all",
          },
        },
        resolve: {
          snomed: {
            conditions: [{ code: "84114007", op: "descendent-of", condition: "present" }],
            mode: "any",
          },
        },
        enabled: true,
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "nudge") {
      expect(result.rule.trigger.snomed?.conditions).toHaveLength(2);
    }
  });

  it("parses a valid prompt nudge rule", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "custom_prompt",
        title: "Custom check",
        message: "Check the note.",
        trigger: {
          prompt: { prompt: "Check if the note specifies CHF type." },
        },
        resolve: {},
        enabled: true,
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(true);
  });

  it("parses a nudge with empty resolve (never auto-resolves)", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "never_resolves",
        title: "Always active",
        message: "This nudge never resolves.",
        trigger: { textMatch: { conditions: [{ contains: "test" }] } },
        resolve: {},
        enabled: true,
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(true);
  });

  it("rejects nudge with bad ID", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "bad id",
        title: "Test",
        message: "Test",
        trigger: {},
        resolve: {},
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(false);
  });

  it("rejects nudge with empty title", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "test",
        title: "",
        message: "Test",
        trigger: {},
        resolve: {},
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(false);
  });

  it("rejects nudge with invalid SNOMED op", () => {
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "test",
        title: "Test",
        message: "Test",
        trigger: {
          snomed: {
            conditions: [{ code: "123", op: "invalid", condition: "present" }],
            mode: "all",
          },
        },
        resolve: {},
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(false);
  });

  it("rejects nudge with prompt over 500 chars", () => {
    const longPrompt = "x".repeat(501);
    const json = JSON.stringify({
      type: "nudge",
      rule: {
        id: "test",
        title: "Test",
        message: "Test",
        trigger: { prompt: { prompt: longPrompt } },
        resolve: {},
      },
    });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(false);
  });

  it("rejects wrong type for nudge mode", () => {
    const json = JSON.stringify({ type: "command", command: {} });
    const result = parseGenieResponse(json, "nudge");
    expect(result.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* summarizeCommand / summarizeNudge                                  */
/* ------------------------------------------------------------------ */

describe("summarizeCommand", () => {
  it("summarizes an insert_text command", () => {
    const summary = summarizeCommand({
      id: "insert_plan",
      phrases: ["insert plan"],
      action: { kind: "insert_text", text: "\nPlan:" },
      builtin: false,
    });
    expect(summary).toContain("insert_plan");
    expect(summary).toContain("ready for use");
  });

  it("summarizes a delete_last command", () => {
    const summary = summarizeCommand({
      id: "undo_that",
      phrases: ["undo that"],
      action: { kind: "delete_last" },
      builtin: false,
    });
    expect(summary).toContain("undo_that");
    expect(summary).toContain("delete the last dictated segment");
  });
});

describe("summarizeNudge", () => {
  it("summarizes a nudge rule", () => {
    const summary = summarizeNudge({
      id: "chf_type",
      title: "Specify CHF type",
      message: "Specify type and acuity.",
      trigger: { textMatch: { conditions: [{ contains: "CHF" }] } },
      resolve: {},
      enabled: true,
      builtin: false,
    });
    expect(summary).toContain("Specify CHF type");
    expect(summary).toContain("ready for use");
  });
});
