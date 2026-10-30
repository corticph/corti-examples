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
  isMacPlatform,
  lastSentenceRange,
  lastWordRange,
  selectEnumRange,
  selectWildcardText,
} from "./commandDispatch";
import type { EditorAdapter } from "./editorAdapter";
import { buildInsertion } from "./textInsertion";

/**
 * Minimal in-memory adapter for testing handlers without the DOM.
 *
 * `lineAware` opts into `extendToLineBoundary`, standing in for an adapter that
 * can locate a line (a textarea, or a contenteditable via `Selection.modify`).
 * Left off, it stands in for one that can't and must not guess.
 */
function makeFake(initial = "", richText = false, lineAware = false) {
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
    ...(lineAware
      ? {
          extendToLineBoundary: (direction: "back" | "forward") => {
            if (direction === "back") {
              const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
              if (lineStart >= start) {
                return false;
              }
              start = lineStart;
              return true;
            }
            const next = text.indexOf("\n", end);
            const lineEnd = next === -1 ? text.length : next;
            if (lineEnd <= end) {
              return false;
            }
            end = lineEnd;
            return true;
          },
        }
      : {}),
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

  it("labels Alt as Option on Mac and Alt elsewhere", () => {
    const original = navigator.platform;
    const restore = () => {
      Object.defineProperty(navigator, "platform", {
        value: original,
        configurable: true,
      });
    };
    try {
      Object.defineProperty(navigator, "platform", {
        value: "MacIntel",
        configurable: true,
      });
      expect(isMacPlatform()).toBe(true);
      expect(describeCombo({ alt: true, key: "Backspace" })).toBe("Option+Backspace");
    } finally {
      restore();
    }
    try {
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        configurable: true,
      });
      expect(isMacPlatform()).toBe(false);
      expect(describeCombo({ alt: true, key: "Backspace" })).toBe("Alt+Backspace");
    } finally {
      restore();
    }
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

  /**
   * A user-defined "backspace" command captures an unmodified Backspace. That
   * used to fall through to a synthetic KeyboardEvent, which browsers won't turn
   * into a real edit — the command logged as handled and the editor never
   * changed.
   */
  it("keypress maps plain Backspace to delete one character", () => {
    const f = makeFake("hello");
    f.adapter.setSelection(5, 5);
    executeAction(f.adapter, { kind: "keypress", combos: [{ key: "Backspace" }] }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("hell");
    expect(f.adapter.getSelection()).toEqual({ start: 4, end: 4 });
  });

  it("keypress plain Backspace deletes an active selection instead", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(0, 6);
    executeAction(f.adapter, { kind: "keypress", combos: [{ key: "Backspace" }] }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("world");
  });

  it("keypress plain Backspace at the start deletes nothing", () => {
    const f = makeFake("hello");
    f.adapter.setSelection(0, 0);
    executeAction(f.adapter, { kind: "keypress", combos: [{ key: "Backspace" }] }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("hello");
  });

  it("keypress plain Backspace removes a surrogate pair whole", () => {
    const f = makeFake("hi 🙂");
    f.adapter.setSelection(5, 5);
    executeAction(f.adapter, { kind: "keypress", combos: [{ key: "Backspace" }] }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("hi ");
  });

  it("keypress plain Delete removes the character after the caret", () => {
    const f = makeFake("hello");
    f.adapter.setSelection(0, 0);
    executeAction(f.adapter, { kind: "keypress", combos: [{ key: "Delete" }] }, cmd("x"), {
      history: [],
    });
    expect(f.text).toBe("ello");
  });

  it("keypress repeats deletion once per captured Backspace", () => {
    const f = makeFake("hello");
    f.adapter.setSelection(5, 5);
    executeAction(
      f.adapter,
      {
        kind: "keypress",
        combos: [{ key: "Backspace" }, { key: "Backspace" }],
      },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("hel");
  });

  /**
   * Regression guard. Cmd/Ctrl+Backspace once resolved the line boundary by
   * scanning `getText()` for `\n`. In the contenteditable editor a line break is
   * a `<br>`, which puts no `\n` in `textContent`, so the whole draft read as
   * one line and this deleted everything before the caret. An adapter that
   * cannot locate a line must make NO edit rather than guess.
   */
  it("keypress makes no edit for Cmd+Backspace without line support", () => {
    const f = makeFake("first line second line");
    f.adapter.setSelection(22, 22);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("first line second line");
  });

  it("keypress makes no edit for Cmd+Delete without line support", () => {
    const f = makeFake("first line second line");
    f.adapter.setSelection(0, 0);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "Delete" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("first line second line");
  });

  it("keypress Cmd+Backspace deletes to the line start the adapter reports", () => {
    const f = makeFake("first line\nsecond line", false, true);
    f.adapter.setSelection(22, 22);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("first line\n");
  });

  it("keypress Cmd+Delete deletes to the line end the adapter reports", () => {
    const f = makeFake("first line\nsecond line", false, true);
    f.adapter.setSelection(0, 0);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "Delete" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("\nsecond line");
  });

  it("keypress Cmd+Backspace at a line start deletes nothing", () => {
    const f = makeFake("first line\nsecond line", false, true);
    f.adapter.setSelection(11, 11);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("first line\nsecond line");
  });

  it("keypress Cmd+Backspace deletes an active selection instead", () => {
    const f = makeFake("first line\nsecond line", false, true);
    f.adapter.setSelection(0, 5);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ meta: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe(" line\nsecond line");
  });

  it("keypress maps Alt+Backspace to delete word before caret", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(11, 11);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ alt: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("hello ");
    expect(f.adapter.getSelection()).toEqual({ start: 6, end: 6 });
  });

  it("keypress Alt+Backspace deletes whitespace before caret", () => {
    const f = makeFake("hello   ");
    f.adapter.setSelection(8, 8);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ alt: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("hello");
  });

  it("keypress Alt+Backspace deletes an active selection first", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(0, 5);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ alt: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe(" world");
  });

  it("keypress Alt+Backspace at start deletes nothing", () => {
    const f = makeFake("hello");
    f.adapter.setSelection(0, 0);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ alt: true, key: "Backspace" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("hello");
  });

  it("keypress maps Alt+Delete to delete word after caret", () => {
    const f = makeFake("hello world");
    f.adapter.setSelection(0, 0);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ alt: true, key: "Delete" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe(" world");
    expect(f.adapter.getSelection()).toEqual({ start: 0, end: 0 });
  });

  it("keypress Alt+Delete deletes whitespace after caret", () => {
    const f = makeFake("hello   world");
    f.adapter.setSelection(5, 5);
    executeAction(
      f.adapter,
      { kind: "keypress", combos: [{ alt: true, key: "Delete" }] },
      cmd("x"),
      { history: [] },
    );
    expect(f.text).toBe("helloworld");
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
