// Thin wrapper around MediaRecorder for streaming audio chunks to Corti.
// MediaRecorder emits Matroska/WebM container chunks; ffprobe on Corti's side auto-detects
// the format from the first chunk, so we don't need raw PCM. Setting `audioFormat`
// explicitly in the stream config is still recommended.

export type MicChunk = Blob;

export type MicRecorderHandlers = {
  /** Fired roughly every `timesliceMs` with a binary chunk. Send straight over WS. */
  onChunk: (chunk: MicChunk) => void;
  /** Fatal recorder errors. The stream should be closed and the recorder discarded. */
  onError: (err: Error) => void;
  /** Audio-input level meter (0..1) sampled per animation frame. Optional. */
  onLevel?: (level: number) => void;
};

export type MicRecorderOptions = {
  /** MIME requested from MediaRecorder. We pick a sensible default if omitted. */
  mimeType?: string;
  /** Chunk interval in milliseconds. Smaller = lower latency, more network overhead. */
  timesliceMs?: number;
  /** deviceId from enumerateDevices(). Use this to pick BlackHole, an aggregate device, etc. */
  deviceId?: string;
};

/**
 * Resolve the best MIME the current browser supports for streaming.
 * Order of preference matches what Corti's ffprobe handles cleanly.
 */
export function pickMimeType(preferred?: string): string {
  const candidates = [
    preferred,
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ].filter(Boolean) as string[];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  // Last resort — let the browser pick. ffprobe will figure it out.
  return "";
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;
  private levelRaf: number | null = null;
  private handlers: MicRecorderHandlers;
  public mimeType: string = "";

  constructor(handlers: MicRecorderHandlers) {
    this.handlers = handlers;
  }

  /** Request mic permission, start capturing, fire chunk callbacks. */
  async start(opts: MicRecorderOptions = {}): Promise<void> {
    const mimeType = pickMimeType(opts.mimeType);
    this.mimeType = mimeType;

    try {
      // When deviceId is provided (e.g., BlackHole), use it exactly — otherwise let the
      // browser pick the default input.
      const constraints: MediaStreamConstraints = opts.deviceId
        ? { audio: { deviceId: { exact: opts.deviceId } } }
        : { audio: true };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e: any) {
      throw new Error(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied. Allow access in the browser site settings and retry."
          : `Couldn't open microphone: ${e?.message ?? String(e)}`,
      );
    }

    try {
      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);
    } catch (e: any) {
      this.cleanupStream();
      throw new Error(`MediaRecorder init failed: ${e?.message ?? String(e)}`);
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.handlers.onChunk(e.data);
    };
    this.recorder.onerror = (e: any) => {
      const msg = e?.error?.message ?? "MediaRecorder error";
      this.handlers.onError(new Error(msg));
    };

    // Level meter (drives the recording indicator pulse). Optional — only run when caller asked.
    if (this.handlers.onLevel) this.attachLevelMeter();

    this.recorder.start(opts.timesliceMs ?? 250);
  }

  /** Stop recorder and release the mic. Idempotent. */
  stop(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.recorder = null;
    if (this.levelRaf != null) {
      cancelAnimationFrame(this.levelRaf);
      this.levelRaf = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        /* ignore */
      }
      this.audioCtx = null;
    }
    this.analyser = null;
    this.cleanupStream();
  }

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  private cleanupStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private attachLevelMeter() {
    if (!this.stream || !this.handlers.onLevel) return;
    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    runLevelMeter(this.analyser, this.handlers.onLevel, (raf) => {
      this.levelRaf = raf;
    });
  }
}

// ---- File-backed source ----
//
// Streams an audio file to Corti as raw 16-bit PCM at 16 kHz mono. This is the format the
// docs explicitly recommend ("When using Raw PCM audio, 16-bit little-endian mono at 16 kHz
// is recommended") and avoids the quality loss of the previous webm/opus pipeline.
//
// The earlier implementation went file → decodeAudioData → AudioBufferSourceNode →
// MediaStreamDestination → MediaRecorder(webm/opus) → server. Two lossy codecs in series
// (opus on top of m4a/AAC) degraded the audio enough that the recognizer hallucinated
// "Vieux parleralux se jour férenalis gourine." from a clean English clip. Going to raw
// PCM means only the *original* file codec sits between the source recording and the STT.
//
// Pacing: we deliver 250 ms chunks every 250 ms via setInterval. That's "near real-time"
// per the docs ("Audio should be streamed at or near real-time speed. Streaming audio
// faster than real time is not recommended and may cause buffering issues...").
export const FILE_AUDIO_FORMAT = "audio/pcm; rate=16000; channels=1; bits=16";

export type FileRecorderHandlers = {
  /** Fired ~every 250ms with a raw-PCM ArrayBuffer (16-bit LE, 16 kHz, mono). */
  onChunk: (chunk: ArrayBuffer) => void;
  onError: (err: Error) => void;
  onLevel?: (level: number) => void;
  /** Fired when playback completes naturally (NOT when stop() was called). */
  onEnded?: () => void;
};

export type FileRecorderOptions = {
  file: File | Blob;
};

const PCM_SAMPLE_RATE = 16000;
const PCM_CHUNK_MS = 250;
const PCM_CHUNK_SAMPLES = (PCM_SAMPLE_RATE * PCM_CHUNK_MS) / 1000; // 4000
// Streams STT runs on a ~3s rolling inference window. Clips shorter than that often
// produce no transcript at all — even after `end` flushes the buffer — because the
// recognizer never had a full window of material to predict on. Pad short clips with
// trailing silence so the speech sits inside a complete window.
export const PCM_MIN_STREAM_SEC = 4;

export class FileRecorder {
  private intervalId: number | null = null;
  private chunks: ArrayBuffer[] = [];
  private chunkIdx = 0;
  private stoppedByCaller = false;
  private handlers: FileRecorderHandlers;
  public durationSec = 0;
  /** Exposed for parity with MicRecorder.mimeType (used in logging/diagnostics). */
  public readonly mimeType = FILE_AUDIO_FORMAT;

  constructor(handlers: FileRecorderHandlers) {
    this.handlers = handlers;
  }

  async start(opts: FileRecorderOptions): Promise<void> {
    // 1) Decode whatever container the user picked (wav/mp3/m4a/webm/...) into a Float32 PCM
    //    buffer at the AudioContext's native sample rate (typically 44.1 or 48 kHz).
    let audioBuffer: AudioBuffer;
    let decodeCtx: AudioContext | null = null;
    try {
      const bytes = await opts.file.arrayBuffer();
      decodeCtx = new AudioContext();
      audioBuffer = await decodeCtx.decodeAudioData(bytes);
    } catch (e: any) {
      throw new Error(
        `Couldn't decode audio file: ${e?.message ?? String(e)}. Try .wav, .mp3, .m4a, or .webm.`,
      );
    } finally {
      try {
        decodeCtx?.close();
      } catch {
        /* ignore */
      }
    }
    this.durationSec = audioBuffer.duration;

    // 2) Resample to 16 kHz and mix down to mono using OfflineAudioContext. This runs as
    //    fast as the CPU allows (not real-time) so the user doesn't wait on playback to
    //    finish before streaming can start.
    const targetSamples = Math.max(1, Math.ceil(audioBuffer.duration * PCM_SAMPLE_RATE));
    const offlineCtx = new OfflineAudioContext(1, targetSamples, PCM_SAMPLE_RATE);
    const src = offlineCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(offlineCtx.destination);
    src.start(0);
    const rendered = await offlineCtx.startRendering();
    let float32 = rendered.getChannelData(0);

    // 2b) Pad short clips with trailing silence. Without this, files under ~3s frequently
    //     produce no transcript at all (the rolling inference window never fills).
    const minSamples = PCM_SAMPLE_RATE * PCM_MIN_STREAM_SEC;
    if (float32.length < minSamples) {
      const padded = new Float32Array(minSamples);
      padded.set(float32, 0); // remaining samples default to 0 = silence
      float32 = padded;
    }

    // 3) Convert Float32 [-1, 1] → Int16 little-endian and slice into ~250 ms chunks.
    //    Each chunk = 4000 samples = 8000 bytes. Per Corti docs: "only signed, Little
    //    Endian (LE) audio is supported. Use of Big Endian (BE) audio will result in
    //    corrupted transcripts."
    const totalSamples = float32.length;
    const totalChunks = Math.ceil(totalSamples / PCM_CHUNK_SAMPLES);
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * PCM_CHUNK_SAMPLES;
      const samplesInChunk = Math.min(PCM_CHUNK_SAMPLES, totalSamples - offset);
      const buf = new ArrayBuffer(samplesInChunk * 2);
      const view = new DataView(buf);
      for (let j = 0; j < samplesInChunk; j++) {
        const clipped = Math.max(-1, Math.min(1, float32[offset + j]));
        // Asymmetric Int16 range: -32768 to 32767.
        const int16 = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
        view.setInt16(j * 2, int16, true /* little-endian */);
      }
      this.chunks.push(buf);
    }

    // 4) Emit chunks at real-time pace. setInterval is good enough for our 250 ms cadence;
    //    sub-millisecond drift doesn't affect the server's decoder.
    this.intervalId = window.setInterval(() => {
      if (this.stoppedByCaller || this.intervalId == null) return;
      if (this.chunkIdx >= this.chunks.length) {
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.chunks = [];
        this.handlers.onEnded?.();
        return;
      }
      const chunk = this.chunks[this.chunkIdx++];
      this.handlers.onChunk(chunk);
      if (this.handlers.onLevel) this.handlers.onLevel(rmsOfInt16LE(chunk));
    }, PCM_CHUNK_MS);
  }

  stop(): void {
    this.stoppedByCaller = true;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.chunks = [];
  }

  get isRecording(): boolean {
    return this.intervalId != null;
  }
}

// RMS of a 16-bit LE PCM chunk, normalized to [0, 1] then mildly amplified so typical
// speech reaches a visible level on the meter.
function rmsOfInt16LE(buf: ArrayBuffer): number {
  const view = new DataView(buf);
  const count = buf.byteLength / 2;
  if (count === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < count; i++) {
    const s = view.getInt16(i * 2, true) / 32768;
    sumSq += s * s;
  }
  return Math.min(1, Math.sqrt(sumSq / count) * 3);
}

// Shared RMS level-meter loop used by both Mic and File sources.
function runLevelMeter(
  analyser: AnalyserNode,
  onLevel: (level: number) => void,
  setRaf: (raf: number) => void,
) {
  const buf = new Uint8Array(analyser.fftSize);
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    // RMS-ish: mean absolute deviation from the 128 midline.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i] - 128);
    onLevel(Math.min(1, sum / buf.length / 64));
    setRaf(requestAnimationFrame(tick));
  };
  setRaf(requestAnimationFrame(tick));
}
