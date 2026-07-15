import { describe, expect, it } from "vitest";
import {
  buildAudioArchiveFileName,
  closeOpenAudioArchiveSegment,
  getAudioFileExtension,
} from "./audio-archive";

describe("audio archive helpers", () => {
  it("maps common capture mime types to file extensions", () => {
    expect(getAudioFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(getAudioFileExtension("audio/mp4")).toBe("m4a");
    expect(getAudioFileExtension("audio/mpeg")).toBe("mp3");
    expect(getAudioFileExtension("audio/flac")).toBe("flac");
  });

  it("builds deterministic archive file names", () => {
    expect(
      buildAudioArchiveFileName({
        endpoint: "transcribe",
        createdAt: Date.parse("2026-06-24T12:34:56.789Z"),
        mimeType: "audio/webm;codecs=opus",
      }),
    ).toBe("corti-transcribe-session-2026-06-24T12-34-56Z.webm");
  });

  it("closes only the last open segment", () => {
    const segments = [
      {
        id: "closed",
        startedAt: 100,
        endedAt: 200,
        durationMs: 100,
        startReason: "start" as const,
        endReason: "pause" as const,
      },
      {
        id: "open",
        startedAt: 300,
        endedAt: null,
        durationMs: null,
        startReason: "resume" as const,
      },
    ];

    expect(closeOpenAudioArchiveSegment(segments, "stop", 600)).toEqual([
      segments[0],
      {
        id: "open",
        startedAt: 300,
        endedAt: 600,
        durationMs: 300,
        startReason: "resume",
        endReason: "stop",
      },
    ]);
  });
});
