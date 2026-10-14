import { describe, expect, it } from "vitest";
import { parsePastedTranscript } from "./pastedTranscript";

describe("parsePastedTranscript", () => {
  it("returns an empty array for blank input", () => {
    expect(parsePastedTranscript("")).toEqual([]);
    expect(parsePastedTranscript("   \n\n\t")).toEqual([]);
  });

  it("treats unlabeled lines as one undiarized run (speakerId -1)", () => {
    const segs = parsePastedTranscript("Hello there\ngeneral kenobi");
    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.speakerId === -1)).toBe(true);
    expect(segs.map((s) => s.transcript)).toEqual(["Hello there", "general kenobi"]);
  });

  it("parses Speaker N: labels", () => {
    const segs = parsePastedTranscript("Speaker 1: hello\nSpeaker 2: goodbye");
    expect(segs).toHaveLength(2);
    expect(segs[0].speakerId).toBe(1);
    expect(segs[0].transcript).toBe("hello");
    expect(segs[1].speakerId).toBe(2);
    expect(segs[1].transcript).toBe("goodbye");
  });

  it("parses Channel N labels and dash separators", () => {
    const segs = parsePastedTranscript("Channel 1 - left ear\nChannel 2 - right ear");
    expect(segs[0].speakerId).toBe(1);
    expect(segs[0].transcript).toBe("left ear");
    expect(segs[1].speakerId).toBe(2);
    expect(segs[1].transcript).toBe("right ear");
  });

  it("is case-insensitive about labels", () => {
    const segs = parsePastedTranscript("SPEAKER 3: loud\nspeaker 1: quiet");
    expect(segs[0].speakerId).toBe(3);
    expect(segs[1].speakerId).toBe(1);
  });

  it("assigns unlabeled lines to default speaker 0 when any label is present", () => {
    const segs = parsePastedTranscript("Speaker 1: hi\nunlabeled line\nSpeaker 2: bye");
    expect(segs[1].speakerId).toBe(0);
    expect(segs[1].transcript).toBe("unlabeled line");
  });

  it("synthesizes unique incrementing time windows", () => {
    const segs = parsePastedTranscript("a\nb\nc");
    expect(segs.map((s) => s.time.start)).toEqual([0, 1, 2]);
    expect(segs.map((s) => s.time.end)).toEqual([1, 2, 3]);
  });

  it("marks all segments final with the pasted sentinel id", () => {
    const segs = parsePastedTranscript("x");
    expect(segs[0].final).toBe(true);
    expect(segs[0].id).toBe("pasted");
  });

  it("skips blank and label-only lines", () => {
    const segs = parsePastedTranscript("Speaker 1:\n\nreal line");
    expect(segs).toHaveLength(1);
    expect(segs[0].transcript).toBe("real line");
  });
});
