import { describe, expect, it } from "vitest";
import {
  type DiarizedSegment,
  groupBySpeakerRuns,
  mergeDiarizedSegments,
  segmentKey,
} from "./diarized-transcript";

function seg(
  start: number,
  end: number,
  speakerId: number,
  transcript: string,
  channel = 0,
): DiarizedSegment {
  return {
    id: "i",
    transcript,
    final: true,
    speakerId,
    participant: { channel },
    time: { start, end },
  };
}

describe("mergeDiarizedSegments", () => {
  it("orders out-of-order segments by time.start", () => {
    const merged = mergeDiarizedSegments([], [seg(2, 3, 1, "second"), seg(0, 1, 0, "first")]);
    expect(merged.map((s) => s.transcript)).toEqual(["first", "second"]);
  });

  it("tie-breaks equal starts by time.end", () => {
    const merged = mergeDiarizedSegments([], [seg(0, 5, 0, "long"), seg(0, 2, 1, "short")]);
    expect(merged.map((s) => s.transcript)).toEqual(["short", "long"]);
  });

  it("merges across messages and keeps global order", () => {
    let acc = mergeDiarizedSegments([], [seg(0, 1, 0, "a"), seg(4, 5, 0, "c")]);
    acc = mergeDiarizedSegments(acc, [seg(2, 3, 1, "b")]); // arrives later, earlier time
    expect(acc.map((s) => s.transcript)).toEqual(["a", "b", "c"]);
  });

  it("dedupes identical (start,end,speaker) keys", () => {
    const acc = mergeDiarizedSegments([seg(0, 1, 0, "old")], [seg(0, 1, 0, "updated")]);
    expect(acc).toHaveLength(1);
    expect(acc[0].transcript).toBe("updated");
  });

  it("treats speakerId and channel as independent in the key", () => {
    const acc = mergeDiarizedSegments([], [seg(0, 1, 0, "spk0ch1", 1), seg(0, 1, 1, "spk1ch0", 0)]);
    expect(acc).toHaveLength(2);
    expect(segmentKey(acc[0])).not.toBe(segmentKey(acc[1]));
  });
});

describe("groupBySpeakerRuns", () => {
  it("groups consecutive same-speaker segments into runs", () => {
    const ordered = [
      seg(0, 1, 0, "hello"),
      seg(1, 2, 0, "there"),
      seg(2, 3, 1, "hi"),
      seg(3, 4, 0, "again"),
    ];
    const runs = groupBySpeakerRuns(ordered);
    expect(runs).toHaveLength(3);
    expect(runs[0].speakerId).toBe(0);
    expect(runs[0].segments.map((s) => s.transcript)).toEqual(["hello", "there"]);
    expect(runs[1].speakerId).toBe(1);
    expect(runs[2].speakerId).toBe(0);
  });
});
