import type { Corti } from "@corti/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  type CommandRegistry,
  capitalizeLastSegment,
  deleteLastSegment,
  describeCombo,
  dispatchCommand,
  executeAction,
  formatSelection,
  insertParagraph,
  insertTemplate,
  lastSentenceRange,
  lastWordRange,
  selectEnumRange,
  selectWildcardText,
} from "./command-dispatch";
import type { EditorAdapter } from "./editor-adapter";
import { buildInsertion } from "./text-insertion";

/** Minimal in-memory adapter for testing handlers without the DOM. */
function makeFake(initial = "", richText = false) {
  let text = initial;
  let start = initial.length;
  let end = initial.length;
  const formats: string[] = [];
  const adapter: EditorAdapter = {
    richText,
    getText: () => text,
    getSelection: () => ({ start, end }),
    setSelection: (a, b) => {
      start = a;
      end = b;
    },
    focus: () => {},
    insert: (segment, options) => {
      const insertion = buildInsertion(text, start, segment, options);
      text = text.slice(0, start) + insertion + text.slice(end);
      start = end = start + insertion.length;
      return { start: start - insertion.length, end: start };
    },
    replaceRange: (a, b, t) => {
      text = text.slice(0, a) + t + text.slice(b);
      start = end = a + t.length;
    },
    ...(richText ? { applyFormat: (s: string) => formats.push(s) } : {}),
  };
  return {
    adapter,
    formats,
    get text() {
      return text;
    },
  };
}

function cmd(id: string, variables?: Record<string, string>): Corti.TranscribeCommandData {
  return {
    id,
    variables: variables ?? null,
    rawTranscriptText: "",
    start: 0,
    end: 1,
  };
}

describe("range helpers", () => {
  it("lastWordRange finds the final word", () => {
    expect(lastWordRange("hello world")).toEqual({ start: 6, end: 11 });
  });
  it("lastSentenceRange finds the final sentence", () => {
    const r = lastSentenceRange("One. Two three.");
    expect("One. Two three.".slice(r?.start, r?.end)).toBe("Two three.");
  });
});

describe("handlers", () => {
  it("deleteLastSegment removes the last dictation range", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(11, 11);
    const out = deleteLastSegment(f.adapter, cmd("x"), {
      history: [{ start: 6, end: 11 }],
    });
    expect(f.text).toBe("hello ");
    expect(out.handled).toBe(true);
  });

  it("deleteLastSegment removes an active selection first", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(0, 6);
    deleteLastSegment(f.adapter, cmd("x"), { history: [] });
    expect(f.text).toBe("world");
  });

  it("insertParagraph inserts a newline", () => {
    const f = makeFake("a");
    f.adapter.setSelection(1, 1);
    insertParagraph(f.adapter, cmd("x"), { history: [] });
    expect(f.text).toBe("a\n");
  });

  it("capitalizeLastSegment capitalizes the last segment in place", () => {
    const f = makeFake("the cat");
    capitalizeLastSegment(f.adapter, cmd("x"), {
      history: [{ start: 4, end: 7 }],
    });
    expect(f.text).toBe("the Cat");
  });

  it("insertTemplate splices a named template", () => {
    const f = makeFake("");
    insertTemplate("template")(f.adapter, cmd("t", { template: "soap" }), {
      history: [],
      templates: { soap: "S/O/A/P" },
    });
    expect(f.text).toBe("S/O/A/P");
  });

  it("selectEnumRange selects the last word", () => {
    const f = makeFake("hello world");
    selectEnumRange("range")(f.adapter, cmd("s", { range: "the last word" }), {
      history: [],
    });
    expect(f.adapter.getSelection()).toEqual({ start: 6, end: 11 });
  });

  it("selectWildcardText selects the spoken text", () => {
    const f = makeFake("the patient is male");
    selectWildcardText("utterance")(f.adapter, cmd("s", { utterance: "male" }), { history: [] });
    expect(f.adapter.getSelection()).toEqual({ start: 15, end: 19 });
  });

  it("formatSelection applies a style on rich editors", () => {
    const f = makeFake("x", true);
    formatSelection("style")(f.adapter, cmd("f", { style: "bold" }), {
      history: [],
    });
    expect(f.formats).toEqual(["bold"]);
  });

  it("formatSelection is a no-op on plain editors", () => {
    const f = makeFake("x", false);
    const out = formatSelection("style")(f.adapter, cmd("f", { style: "bold" }), {
      history: [],
    });
    expect(out.description).toMatch(/not supported/i);
  });
});

describe("describeCombo", () => {
  it("formats modifiers + key", () => {
    expect(describeCombo({ ctrl: true, key: "b" })).toBe("Ctrl+B");
    expect(describeCombo({ meta: true, shift: true, key: "ArrowLeft" })).toBe(
      "Cmd+Shift+ArrowLeft",
    );
  });
});

describe("executeAction", () => {
  it("insert_text replaces the selection with the text", () => {
    const f = makeFake("");
    executeAction(f.adapter, { kind: "insert_text", text: "hello" }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("hello");
  });

  it("keypress maps Ctrl+B to bold on a rich editor", () => {
    const f = makeFake("x", true);
    const out = executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ ctrl: true, key: "b" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.formats).toEqual(["bold"]);
    expect(out.handled).toBe(true);
  });

  it("keypress types a printable sequence literally", () => {
    const f = makeFake("");
    executeAction(
      f.adapter,
      {
        kind: "keypress",
        combos: [".", " ", "v", "i", "t", "a", "l", "s"].map((key) => ({
          key,
        })),
      },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe(". vitals");
  });

  it("keypress maps Cmd/Ctrl+A semantics to select all", () => {
    const f = makeFake("alpha beta");
    f.adapter.setSelection(3, 3);
    executeAction(f.adapter, { kind: "keypress", combos: [{ meta: true, key: "a" }] }, cmd("x"), {
      history: [],
    });
    expect(f.adapter.getSelection()).toEqual({ start: 0, end: 10 });
  });

  it("keypress maps primary+ArrowDown to end of document", () => {
    const f = makeFake("one\ntwo");
    f.adapter.setSelection(0, 0);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "ArrowDown" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.adapter.getSelection()).toEqual({ start: 7, end: 7 });
  });

  it("keypress maps primary+ArrowUp to beginning of document", () => {
    const f = makeFake("one\ntwo");
    f.adapter.setSelection(7, 7);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "ArrowUp" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.adapter.getSelection()).toEqual({ start: 0, end: 0 });
  });

  it("keypress maps primary+ArrowRight to end of line", () => {
    const f = makeFake("one\ntwo\nthree");
    f.adapter.setSelection(5, 5);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "ArrowRight" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.adapter.getSelection()).toEqual({ start: 7, end: 7 });
  });

  it("keypress maps primary+ArrowLeft to beginning of line", () => {
    const f = makeFake("one\ntwo\nthree");
    f.adapter.setSelection(6, 6);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "ArrowLeft" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.adapter.getSelection()).toEqual({ start: 4, end: 4 });
  });

  it("script runs with editor + variables and can select text", () => {
    const f = makeFake("the patient is male");
    const out = executeAction(
      f.adapter,
      {
        kind: "script",
        code: "const i = editor.getText().indexOf(variables.text); editor.setSelection(i, i + variables.text.length); return 'ok';",
      },
      cmd("s", { text: "male" }),
      { history: [] },
    );
    expect(f.adapter.getSelection()).toEqual({ start: 15, end: 19 });
    expect(out.description).toBe("ok");
  });

  it("script reports errors instead of throwing", () => {
    const f = makeFake("");
    const out = executeAction(
      f.adapter,
      { kind: "script", code: "throw new Error('boom');" },
      cmd("s"),
      { history: [] },
    );
    expect(out.description).toMatch(/Script error: boom/);
  });

  it("noop reports its note and changes nothing", () => {
    const f = makeFake("abc");
    const out = executeAction(f.adapter, { kind: "noop", note: "nav" }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("abc");
    expect(out.description).toBe("nav");
  });

  it("delegates builtins (delete_last)", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(11, 11);
    executeAction(f.adapter, { kind: "delete_last" }, cmd("x"), {
      history: [{ start: 6, end: 11 }],
    });
    expect(f.text).toBe("hello ");
  });
});

describe("dispatchCommand", () => {
  it("routes to the registered handler", () => {
    const handler = vi.fn(() => ({ handled: true, description: "ok" }));
    const registry: CommandRegistry = { foo: handler };
    const f = makeFake("");
    const out = dispatchCommand(f.adapter, cmd("foo"), registry, {
      history: [],
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(out.handled).toBe(true);
  });

  it("reports unhandled commands", () => {
    const f = makeFake("");
    const out = dispatchCommand(f.adapter, cmd("nope"), {}, { history: [] });
    expect(out.handled).toBe(false);
  });
});
