# Dictation audio archive

**Concept:** host-managed microphone capture with local archive persistence.

This applet uses the raw SDK path instead of `<corti-dictation>` because the
host owns `MediaRecorder` directly. Each microphone blob is:

1. appended to a local audio archive seam
2. sent to Corti via `socket.sendAudio()`

Recording is push-to-talk style at the session level:

- `Record` opens or resumes the current websocket session
- `Stop recording` pauses + flushes but keeps the session open
- `End session` finalizes the archive and closes the socket

The result is a compact reference for developers who need to understand where
to capture dictation audio and how to persist it without building a full audit
tool.

## Files

- `DictationAudioArchive.tsx` — applet UI + raw-SDK session flow
- `AudioArchiveDetails.tsx` — details panel for the seam
- `config.ts` — transcribe configuration

## Shared dependencies

- `../_shared/useCortiAccessToken.ts`
- `../_shared/textInsertion.ts`
- `../_shared/configStore.ts`
- `../_shared/audioArchive.ts`
- `../_shared/audioArchiveStore.ts`
- `../_shared/useAudioArchive.ts`
