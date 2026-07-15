import { useState, useEffect, useRef, useCallback } from "react";
import { segmentStore, type SegmentEntry } from "./segment-store";
import { spliceSegment } from "../_shared/text-insertion";

const LANGUAGE = "en";

function buildConcatenated(segs: readonly SegmentEntry[]): string {
  let text = "";
  for (const seg of segs) {
    const { text: next } = spliceSegment(text, text.length, text.length, seg.final, {
      primaryLanguage: LANGUAGE,
      capitalize: true,
    });
    text = next;
  }
  return text;
}

const emptyHint = (
  <span className="italic text-muted-foreground">No segments yet…</span>
);

function NumberedList({ items }: { items: readonly string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

export function SegmentComparisonCard() {
  const [segments, setSegments] = useState<readonly SegmentEntry[]>(() =>
    segmentStore.get(),
  );

  useEffect(() => segmentStore.subscribe(setSegments), []);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const syncScroll = useCallback((source: HTMLDivElement, target: HTMLDivElement) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    target.scrollTop = source.scrollTop;
    syncingRef.current = false;
  }, []);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const onLeft = () => syncScroll(left, right);
    const onRight = () => syncScroll(right, left);
    left.addEventListener("scroll", onLeft);
    right.addEventListener("scroll", onRight);
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
    };
  }, [syncScroll]);

  const concatenated = buildConcatenated(segments);
  const isEmpty = segments.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Segment comparison
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live view of transcript segments as they arrive. Top: final segments
          concatenated with the same spacing and casing rules as the editor.
          Bottom: each final segment (left) next to its raw counterpart (right).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Concatenated
        </span>
        <div className="min-h-[80px] max-h-[200px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
          {isEmpty ? emptyHint : concatenated}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Final segments
          </span>
          <div
            ref={leftRef}
            className="min-h-[80px] max-h-[200px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-sm font-mono"
          >
            {isEmpty ? emptyHint : <NumberedList items={segments.map((s) => s.final)} />}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Raw segments
          </span>
          <div
            ref={rightRef}
            className="min-h-[80px] max-h-[200px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-sm font-mono"
          >
            {isEmpty ? emptyHint : <NumberedList items={segments.map((s) => s.raw)} />}
          </div>
        </div>
      </div>
    </div>
  );
}
