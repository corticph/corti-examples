/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { countTrailingBreaksAfter, isStructuralTrailingBr } from "./useCaretOverlay";

/** Build a contenteditable root from an HTML string. */
function setupEditor(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** querySelector that fails the test loudly when nothing matches. */
function query(root: ParentNode, selector: string): Element {
  const el = root.querySelector(selector);
  if (!el) {
    throw new Error(`No element matches "${selector}"`);
  }
  return el;
}

/** Resolve the last text node and its length for the end-of-content caret. */
function endOfLastTextNode(root: HTMLElement): {
  node: Node;
  offset: number;
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let current = walker.nextNode() as Text | null;
  while (current) {
    if ((current.textContent ?? "").length > 0) {
      last = current;
    }
    current = walker.nextNode() as Text | null;
  }
  if (!last) {
    return { node: root, offset: 0 };
  }
  return { node: last, offset: (last.textContent ?? "").length };
}

describe("isStructuralTrailingBr", () => {
  it("returns true when the <br> is the last element child of root", () => {
    const root = setupEditor("<br>");
    const br = query(root, "br");
    expect(isStructuralTrailingBr(br, root)).toBe(true);
  });

  it("returns true when the <br> is the last element child of the root's last child div", () => {
    const root = setupEditor("<div>hello<br></div>");
    const br = query(root, "br");
    expect(isStructuralTrailingBr(br, root)).toBe(true);
  });

  it("returns false when the <br> is followed by a text node", () => {
    const root = setupEditor("<div>hello<br>world</div>");
    const br = query(root, "br");
    expect(isStructuralTrailingBr(br, root)).toBe(false);
  });

  it("returns false when the <br> is a middle child of a div that is the root's last child", () => {
    const root = setupEditor("<div>hello<br><br>world</div>");
    const brs = root.querySelectorAll("br");
    expect(isStructuralTrailingBr(brs[0], root)).toBe(false);
  });

  it("returns false when root has no element children", () => {
    const root = setupEditor("text only");
    expect(isStructuralTrailingBr(document.createElement("br"), root)).toBe(false);
  });

  it("returns true when the <br> is followed only by a ZWSP anchor text node", () => {
    const root = setupEditor("<div>hello<br></div>");
    const br = query(root, "br");
    const zwsp = document.createTextNode("​");
    br.after(zwsp);
    expect(isStructuralTrailingBr(br, root)).toBe(true);
  });
});

describe("countTrailingBreaksAfter (excludeStructural=false, out-of-editor)", () => {
  it("returns 0 for empty editor with only a structural <br>", () => {
    const root = setupEditor("<div><br></div>");
    // No text nodes — point is at root, offset 0
    const point = { node: root, offset: 0 };
    expect(countTrailingBreaksAfter(root, point)).toBe(0);
  });

  it("returns 1 for a single-line text with a trailing <br>", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(1);
  });

  it("returns 2 for new line (text + <br> + structural <br>)", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br><br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(2);
  });

  it("returns 3 for new paragraph (text + <br> + <br> + structural <br>)", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br><br><br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(3);
  });

  it("returns 0 for a <br> in the middle of text (not at end of text node)", () => {
    const root = setupEditor("<div>hello<br>world<br></div>");
    // Point at the end of "hello" (before the <br>) — offset 5
    const textNode = query(root, "div").firstChild as Text;
    const point = { node: textNode, offset: 5 };
    expect(countTrailingBreaksAfter(root, point)).toBe(0);
  });

  it("returns 0 when point is not at end of its text node", () => {
    const root = setupEditor("<div>hello world<br></div>");
    const textNode = query(root, "div").firstChild as Text;
    const point = { node: textNode, offset: 5 };
    expect(countTrailingBreaksAfter(root, point)).toBe(0);
  });

  it("returns 0 when point.node is not a text node", () => {
    const root = setupEditor("<div><br></div>");
    const point = { node: root, offset: 0 };
    expect(countTrailingBreaksAfter(root, point)).toBe(0);
  });

  it("handles text + trailing <br> with empty text node after <br>", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br></div>");
    const br = query(root, "br");
    const empty = document.createTextNode("");
    br.after(empty);
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(1);
  });

  it("handles new line + empty text node after trailing <br>", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br><br></div>");
    const brs = root.querySelectorAll("br");
    const empty = document.createTextNode("");
    brs[1].after(empty);
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(2);
  });

  it("handles nested div shape (text in div + trailing br in div)", () => {
    const root = setupEditor("<div>line one</div><div>line two<br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(1);
  });

  it("handles multi-paragraph with nested divs and trailing breaks", () => {
    const root = setupEditor("<div>line one</div><div>line two<br><br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(2);
  });

  it("does not count non-br block elements", () => {
    const root = setupEditor("<div>text<p></p></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point)).toBe(0);
  });
});

describe("countTrailingBreaksAfter (excludeStructural=true, in-editor)", () => {
  it("returns 0 for empty editor with only a structural <br>", () => {
    const root = setupEditor("<div><br></div>");
    const point = { node: root, offset: 0 };
    expect(countTrailingBreaksAfter(root, point, true)).toBe(0);
  });

  it("returns 0 for a single-line text with a trailing structural <br>", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point, true)).toBe(0);
  });

  it("returns 1 for new line (text + <br> + structural <br>)", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br><br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point, true)).toBe(1);
  });

  it("returns 2 for new paragraph (text + <br> + <br> + structural <br>)", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br><br><br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point, true)).toBe(2);
  });

  it("handles text + trailing <br> with empty text node after <br>", () => {
    const root = setupEditor("<div>The patient reports mild chest pain<br></div>");
    const br = query(root, "br");
    const empty = document.createTextNode("");
    br.after(empty);
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point, true)).toBe(0);
  });

  it("handles new line + ZWSP anchor between command <br> and structural <br>", () => {
    // Simulates the DOM after a "new line" voice command with the adapter's
    // ZWSP caret anchor: text<br>​<br> (structural). The overlay measures from
    // the ZWSP anchor (end of textContent including ZWSP), so point is at the
    // ZWSP end. Only the structural <br> follows → excludeStructural drops it.
    const root = setupEditor("<div>The patient reports mild chest pain<br><br></div>");
    const brs = root.querySelectorAll("br");
    const zwsp = document.createTextNode("​");
    brs[0].after(zwsp);
    // Point is at end of the ZWSP text node (the adapter's caret anchor)
    const point = { node: zwsp, offset: 1 };
    expect(countTrailingBreaksAfter(root, point, true)).toBe(0);
  });

  it("handles new paragraph + ZWSP anchor between command <br>s and structural <br>", () => {
    // Simulates: text<br><br>​<br> (two command <br>s + ZWSP + structural)
    const root = setupEditor("<div>The patient reports mild chest pain<br><br><br></div>");
    const brs = root.querySelectorAll("br");
    const zwsp = document.createTextNode("​");
    brs[1].after(zwsp);
    // Point at end of ZWSP. The ZWSP is already 2 lines down (after two command
    // <br>s). Only the structural <br> follows → excludeStructural drops it → 0.
    // The caret rect at the ZWSP is already at the correct line, no additional
    // drop needed.
    const point = { node: zwsp, offset: 1 };
    expect(countTrailingBreaksAfter(root, point, true)).toBe(0);
  });

  it("handles nested div shape (text in div + trailing br in div)", () => {
    const root = setupEditor("<div>line one</div><div>line two<br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point, true)).toBe(0);
  });

  it("handles multi-paragraph with nested divs and trailing breaks", () => {
    const root = setupEditor("<div>line one</div><div>line two<br><br></div>");
    const point = endOfLastTextNode(root);
    expect(countTrailingBreaksAfter(root, point, true)).toBe(1);
  });
});
