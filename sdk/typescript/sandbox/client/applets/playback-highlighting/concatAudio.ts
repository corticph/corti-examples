/**
 * Concatenates audio blobs (e.g. WebM/Opus from MediaRecorder) into a
 * single WAV blob with an accurate, continuous timeline.
 *
 * WebM blob concatenation via `new Blob([...blobs])` plays through but
 * produces unreliable `audio.currentTime` / `audio.duration` — the
 * Matroska container's internal cluster timestamps don't span across
 * blobs, causing the clock to jump or report Infinity. WAV has no
 * container timestamps; the browser derives currentTime purely from
 * byte position, so it's always accurate.
 */

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockSize = numChannels * bytesPerSample;
  const dataSize = numSamples * blockSize;
  const totalSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockSize, true);
  view.setUint16(32, blockSize, true);
  view.setUint16(34, bytesPerSample * 8, true);

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function concatAudioBlobsToWavUrl(blobs: Blob[]): Promise<string> {
  if (blobs.length === 0) {
    throw new Error("No blobs to concatenate");
  }

  if (blobs.length === 1) {
    return URL.createObjectURL(blobs[0]);
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();

  try {
    const audioBuffers = await Promise.all(
      blobs.map(async (b) => {
        const ab = await b.arrayBuffer();
        return audioCtx.decodeAudioData(ab);
      }),
    );

    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const numChannels = Math.max(...audioBuffers.map((b) => b.numberOfChannels));
    const sampleRate = audioBuffers[0].sampleRate;

    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buf of audioBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
        combined.getChannelData(ch).set(src, offset);
      }
      offset += buf.length;
    }

    const wavBlob = audioBufferToWav(combined);
    return URL.createObjectURL(wavBlob);
  } finally {
    audioCtx.close();
  }
}
