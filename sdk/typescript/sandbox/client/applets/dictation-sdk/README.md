# Applet: Raw SDK mic

**Concept:** drive `/transcribe` with `@corti/sdk` directly (no web component),
with the host managing the microphone.

Flow:

1. `new CortiClient({ auth: { refreshAccessToken } })` — cluster + tenant are
   derived from the JWT.
2. `client.transcribe.connect({ configuration })` resolves **after**
   `CONFIG_ACCEPTED`, so audio is never sent before the handshake.
3. The host captures audio with `MediaRecorder` and streams frames via
   `socket.sendAudio()`.
4. `transcript` messages are inserted with the shared `spliceSegment` helper.

A small `AnalyserNode` drives the audio-level meter, and the connection is torn
down on stop / unmount.

## Dependencies to copy

- npm: `@corti/sdk`
- shared files: `../_shared/textInsertion.ts`, `../_shared/useCortiAccessToken.ts`
- local files: `config.ts`
