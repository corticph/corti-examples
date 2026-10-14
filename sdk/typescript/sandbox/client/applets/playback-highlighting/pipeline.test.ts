import type { Corti, CortiClient } from "@corti/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeTranscriptError,
  type PipelineProgress,
  runPlaybackHighlightingPipeline,
} from "./pipeline";

function makeClient(opts: {
  createInteraction?: ReturnType<typeof vi.fn>;
  uploadRecording?: ReturnType<typeof vi.fn>;
  createTranscript?: ReturnType<typeof vi.fn>;
  getStatus?: ReturnType<typeof vi.fn>;
  getTranscript?: ReturnType<typeof vi.fn>;
}): CortiClient {
  return {
    interactions: {
      create:
        opts.createInteraction ??
        vi.fn().mockResolvedValue({ interactionId: "int-1", websocketUrl: "" }),
    },
    recordings: {
      upload: opts.uploadRecording ?? vi.fn().mockResolvedValue({ recordingId: "rec-1" }),
    },
    transcripts: {
      create:
        opts.createTranscript ?? vi.fn().mockResolvedValue({ id: "tr-1", status: "processing" }),
      getStatus: opts.getStatus ?? vi.fn().mockResolvedValue({ status: "completed" }),
      get:
        opts.getTranscript ??
        vi.fn().mockResolvedValue({
          id: "tr-1",
          status: "completed",
          transcripts: [],
        }),
    },
  } as unknown as CortiClient;
}

function makeFile(): File {
  return new File(["audio data"], "test.wav", { type: "audio/wav" });
}

describe("runPlaybackHighlightingPipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the full pipeline and returns the result", async () => {
    vi.useFakeTimers();
    const steps: PipelineProgress[] = [];
    const client = makeClient({});

    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "en",
      diarize: false,
      wordLevel: true,
      onProgress: (p) => steps.push(p),
    });

    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(steps).toEqual([
      { step: "creating-interaction" },
      { step: "uploading-recording" },
      { step: "creating-transcript" },
      { step: "polling", pollAttempt: 1 },
      { step: "fetching-result" },
    ]);

    vi.useRealTimers();
  });

  it("passes correct params to interactions.create", async () => {
    vi.useFakeTimers();
    const createInteraction = vi.fn().mockResolvedValue({
      interactionId: "int-99",
      websocketUrl: "",
    });
    const client = makeClient({ createInteraction });

    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "en",
      diarize: false,
      wordLevel: false,
    });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(createInteraction).toHaveBeenCalledOnce();
    const arg = createInteraction.mock.calls[0][0] as Corti.InteractionsCreateRequest;
    expect(arg.encounter.status).toBe("planned");
    expect(arg.encounter.type).toBe("first_consultation");
    expect(arg.encounter.identifier).toMatch(/^[\da-f-]{36}$/);

    vi.useRealTimers();
  });

  it("passes correct params to transcripts.create", async () => {
    vi.useFakeTimers();
    const createTranscript = vi.fn().mockResolvedValue({
      id: "tr-1",
      status: "completed",
    });
    const client = makeClient({ createTranscript });

    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "da",
      diarize: true,
      wordLevel: true,
      automaticPunctuation: true,
      spokenPunctuation: false,
    });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(createTranscript).toHaveBeenCalledWith("int-1", {
      recordingId: "rec-1",
      primaryLanguage: "da",
      diarize: true,
      wordLevel: { enabled: true },
      async: true,
      automaticPunctuation: true,
      spokenPunctuation: false,
    });

    vi.useRealTimers();
  });

  it("polls until status is completed", async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const getStatus = vi.fn().mockImplementation(() => {
      pollCount += 1;
      return Promise.resolve({
        status: pollCount < 3 ? "processing" : "completed",
      });
    });
    const client = makeClient({ getStatus });

    const steps: PipelineProgress[] = [];
    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "en",
      diarize: false,
      wordLevel: false,
      onProgress: (p) => steps.push(p),
    });

    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(getStatus).toHaveBeenCalledTimes(3);
    expect(steps.filter((s) => s.step === "polling")).toHaveLength(3);

    vi.useRealTimers();
  });

  it("throws on failed status", async () => {
    vi.useFakeTimers();
    const getStatus = vi.fn().mockResolvedValue({ status: "failed" });
    const client = makeClient({ getStatus });

    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "en",
      diarize: false,
      wordLevel: false,
    });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow("Transcript processing failed");

    vi.useRealTimers();
  });

  it("throws on poll timeout", async () => {
    vi.useFakeTimers();
    const getStatus = vi.fn().mockResolvedValue({ status: "processing" });
    const client = makeClient({ getStatus });

    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "en",
      diarize: false,
      wordLevel: false,
    });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(95_000);

    await expect(promise).rejects.toThrow("Timed out waiting");

    vi.useRealTimers();
  });

  it("returns transcripts from the final GET", async () => {
    vi.useFakeTimers();
    const segments = [
      {
        channel: 0,
        participant: 0,
        speakerId: 0,
        text: "Hello",
        start: 0,
        end: 1,
      },
    ];
    const getTranscript = vi.fn().mockResolvedValue({
      id: "tr-1",
      status: "completed",
      transcripts: segments,
    });
    const client = makeClient({
      createTranscript: vi.fn().mockResolvedValue({ id: "tr-1", status: "completed" }),
      getTranscript,
    });

    const promise = runPlaybackHighlightingPipeline(client, {
      file: makeFile(),
      primaryLanguage: "en",
      diarize: false,
      wordLevel: true,
    });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.transcripts).toEqual(segments);
    expect(result.wordLevel).toBe(true);
    expect(result.status).toBe("completed");

    vi.useRealTimers();
  });
});

describe("describeTranscriptError", () => {
  it("returns a friendly 403 message", () => {
    expect(describeTranscriptError(new Error("HTTP 403 Forbidden"))).toBe(
      "Transcript request failed (403). Verify the token scope, tenant, and environment.",
    );
  });

  it("passes through non-403 messages", () => {
    expect(describeTranscriptError(new Error("Network error"))).toBe("Network error");
  });
});
