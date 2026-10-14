/**
 * Per-applet narrative shown above the reference box on each docs page: the
 * premise (why you would reach for this), how it works, and the most important
 * snippets. Keyed by applet id (see `registry.ts`).
 */
export interface WriteupSnippet {
  caption?: string;
  lang?: string;
  code: string;
}

/**
 * One step of a step-by-step build guide: a heading, its own paragraphs, and
 * the snippet(s) (code or a mermaid diagram) that belong right after that
 * text, so a reader (human or an LLM reading the "Copy for LLM" bundle) sees
 * explanation and code interleaved instead of all prose followed by a pile
 * of snippets at the end.
 */
export interface WriteupStep {
  heading: string;
  text: string[];
  snippets?: WriteupSnippet[];
}

export interface AppletWriteup {
  /** The problem this pattern solves and why it exists. One or more paragraphs. */
  premise: string[];
  /**
   * How to build it. Either a flat list of paragraphs (the older, simpler
   * applets) or an ordered list of WriteupStep for a full step-by-step guide
   * with snippets interleaved per step.
   */
  how: string[] | WriteupStep[];
  /** Snippets shown after `how`, only used when `how` is a flat string[]. */
  snippets?: WriteupSnippet[];
  /** Production notes, gotchas, and edge cases. Rendered as a distinct callout list. */
  considerations?: string[];
}

export function isStepGuide(how: AppletWriteup["how"]): how is WriteupStep[] {
  return how.length > 0 && typeof how[0] === "object";
}

export const WRITEUPS: Record<string, AppletWriteup> = {
  "speech-flex": {
    premise: [
      "Clinicians need both self-entry dictation and conversational ambient capture. Speech Flex gives them a single workspace where they flex between the two modes against the same patient interaction, providing ability to seamlessly switch between functionality as needed: a toggle switch that switches the recording and recognition behavior while keeping the visit context constant.",
      "Dictation mode uses /transcribe for direct, controlled text entry with voice commands. Ambient mode uses /streams for hands-free conversational capture with diarization and facts extraction. Both anchor to the same Corti interaction, so a clinician can dictate corrections into the same encounter they recorded ambient audio for.",
    ],
    how: [
      "A visit schedule (Corti interactions sorted by encounter.period.startedAt) anchors both modes to the patient. Selecting a visit sets the interactionId for both /transcribe and /streams. The toggle switch changes which web component is mounted — <corti-dictation> for dictation, <corti-ambient> for ambient — while the interaction context stays constant.",
      "The SDK's CortiClient.interactions.list() fetches the visit schedule, and interactions.create() simulates an HL7 SIU feed entry. In a production EHR integration, interactions would be created server-side from the scheduling system, and auto-select would match on MRN or encounter identifier when the clinician opens a patient chart.",
    ],
    considerations: [
      "Dictation text is client-side (in the editor); ambient segments and facts are server-side (under the interaction). Note generation reads from the interaction's persisted data, so ambient mode has everything it needs server-side, while dictation text needs to be included as explicit context.",
      "Both web components share the same microphone — only one is mounted at a time, so there's no device contention. Switching modes unmounts one component and mounts the other, which cleanly tears down and re-establishes the WebSocket connection.",
    ],
  },
  languages: {
    premise: [
      "Before you build a language picker or validate a requested locale, you need to know which languages Corti speech to text supports and which endpoints (transcribe, streams, transcripts) each one is enabled for. This endpoint is the source of truth for language availability.",
    ],
    how: [
      "Call `client.languages.list()` with an optional `endpoint` filter to scope the result to a single endpoint, or omit it to get the full map. Flatten the response into per endpoint rows for a table, or read the raw JSON.",
    ],
    snippets: [
      {
        caption: "Underlying REST endpoint",
        lang: "bash",
        code: `GET https://api.<cluster>.corti.app/v2/languages/?endpoint=transcribe
Authorization: Bearer <token>
Tenant-Name: <tenant>`,
      },
      {
        caption: "fetchLanguages()",
        lang: "typescript",
        code: `const data = await client.languages.list({ endpoint });
// data.languages: Record<string, { endpoints: { transcribe?, streams?, transcripts? } }>`,
      },
    ],
  },

  "dictation-sdk": {
    premise: [
      "Reach for the raw @corti/sdk when your app owns the microphone and you want direct control over the /transcribe socket, without the dictation web component in the way. This is the lower level path for teams building custom capture or native hardware.",
    ],
    how: [
      "Construct a client with a refreshAccessToken function. The connect call resolves only after the server sends CONFIG_ACCEPTED, so you can never send audio before the handshake completes. Capture audio with MediaRecorder and stream frames through the socket, then handle transcript messages as they arrive.",
    ],
    snippets: [
      {
        caption: "Connect after the handshake, then stream",
        lang: "typescript",
        code: `const client = new CortiClient({ auth: { refreshAccessToken } });

// resolves only after CONFIG_ACCEPTED
const socket = await client.transcribe.connect({ configuration });

socket.on("transcript", (msg) => insertTranscript(msg));
recorder.ondataavailable = (e) => socket.sendAudio(e.data);`,
      },
    ],
  },

  "recording-transcript": {
    premise: [
      "/transcribe and /streams are both live sockets: audio in, transcript out, while a conversation is happening. But a lot of real audio doesn't arrive live — a dictaphone recording, a call recording pulled from a PBX, a file a clinician uploads after the fact. For creating transcripts from pre-recorded audio files, use the /transcripts REST endpoint.",
      "The /transcripts endpoint is stateful, supporting transcription for audio files uploaded to the /recordings endpoint as part of an /interaction.",
    ],
    how: [
      {
        heading: "Creating transcripts as part of an interaction",
        text: [
          "Each call depends on the id the previous one returned: an interaction id gates the upload, and a recording id gates transcript creation.",
        ],
        snippets: [
          {
            caption: "One id feeds the next request",
            lang: "mermaid",
            code: `flowchart LR
    A[interactions.create] -->|interactionId| B[recordings.upload]
    B -->|recordingId| C[transcripts.create async:true]
    C -->|transcriptId, status: processing| D[transcripts.getStatus]
    D -->|status: processing| D
    D -->|status: completed| E[transcripts.get]
    D -->|status: failed| F[throw]`,
          },
        ],
      },
      {
        heading: "async: true turns a 25s block into a poll loop",
        text: [
          "By default (without async: true), transcripts requests process synchronously for up to 25 seconds before the API falls back to background processing. Set async: true in the request and the API returns a 202 Accepted immediately with the transcript in status processing, so the client can poll on its own schedule instead of holding a request open.",
        ],
        snippets: [
          {
            caption: "Create async, then poll getStatus until it's not processing",
            lang: "typescript",
            code: `const created = await client.transcripts.create(interactionId, {
  recordingId,
  primaryLanguage: "en",
  diarize: true,
  async: true,
});

let status = created.status; // "processing"
while (status === "processing") {
  await sleep(1500);
  ({ status } = await client.transcripts.getStatus(interactionId, created.id));
}
const final = await client.transcripts.get(interactionId, created.id);`,
          },
        ],
      },
      {
        heading: "RTFx: real audio duration over real wall clock",
        text: [
          "Real-time factor is audio duration divided by processing time. The audio duration comes from the file's own <audio> metadata, read client-side, not estimated by summing transcript segment timestamps, so it stays accurate even for a file with long silent stretches. Wall clock runs from the initial POST to the moment status first reads completed.",
        ],
        snippets: [
          {
            caption: "Duration from file metadata, not from the transcript",
            lang: "typescript",
            code: `function getAudioFileDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.onloadedmetadata = () => resolve(audio.duration * 1000);
    audio.onerror = () => reject(new Error("no duration"));
    audio.src = url;
  });
}`,
          },
        ],
      },
    ],
    considerations: [
      "A recording accepts up to 120 minutes of audio or 150MB per file — split longer source audio before uploading.",
      "diarize and participants are mutually exclusive: leave participants empty when diarize is true, since diarization assigns speaker ids automatically instead of using a fixed channel-to-role mapping.",
      "Poll on a fixed interval with a timeout. The API has no webhook/callback for completion, so an unbounded loop is the only failure mode worth guarding against client-side.",
      "This demo does not pass an AbortSignal to the poll loop — navigating away from the page does not cancel the polling. A production implementation should abort the poll on unmount.",
    ],
  },

  "playback-highlighting": {
    premise: [
      "When you transcribe an audio file, each transcript segment comes with start and end timestamps. Play back the audio alongside the transcript and you can highlight the currently-spoken text — a karaoke-style synced view that makes it easy to verify transcription accuracy against the source audio. The same highlighting works for live dictation: capture speech via the `/transcribe` WebSocket, then replay the recorded audio with synced transcript after recording stops.",
      "The `wordLevel.enabled` configuration parameter makes the API return one transcript entry per word instead of per phrase, giving the most granular timestamps for precise word-level highlighting. Without it, highlighting operates at the phrase/utterance level — still useful, just coarser.",
    ],
    how: [
      {
        heading: "Create a word-level transcript with the SDK",
        text: [
          "The `@corti/sdk` `CortiClient` sends the full transcript create request — `recordingId`, `primaryLanguage`, `diarize`, `wordLevel`, `async`, `automaticPunctuation`, `spokenPunctuation`, and `formatting` — via `client.transcripts.create(interactionId, { ... })`.",
        ],
        snippets: [
          {
            caption: "Transcript create with wordLevel via the SDK",
            lang: "typescript",
            code: `const created = await client.transcripts.create(interactionId, {
  recordingId,
  primaryLanguage: "en",
  diarize: false,
  wordLevel: { enabled: true },
  async: true,
  ...(automaticPunctuation !== undefined
    ? { automaticPunctuation }
    : {}),
  ...(spokenPunctuation !== undefined
    ? { spokenPunctuation }
    : {}),
  ...(formattingOverrides
    ? { formatting: formattingOverrides }
    : {}),
});`,
          },
        ],
      },
      {
        heading: "Sync highlighting to audio playback",
        text: [
          "The browser's `timeupdate` event fires only ~4 times per second — too choppy for word-level highlighting where individual words can be shorter than 250ms. Use `requestAnimationFrame` to check `audio.currentTime` every frame (~16ms) and binary-search the sorted word array for the last segment whose `start` <= current time — the word currently being or most recently spoken.",
        ],
        snippets: [
          {
            caption: "requestAnimationFrame sync loop",
            lang: "typescript",
            code: `const tick = () => {
  const currentTimeMs = audio.currentTime * 1000;
  const idx = findActiveIndex(segments, currentTimeMs);
  setActiveIndex(idx);
  rafId = requestAnimationFrame(tick);
};

audio.addEventListener("play", () => {
  rafId = requestAnimationFrame(tick);
});
audio.addEventListener("pause", () => {
  if (rafId) cancelAnimationFrame(rafId);
});`,
          },
        ],
      },
      {
        heading: "Text spacing and casing at boundaries",
        text: [
          "Following the transcript handling best-practices guide, each word's separator is computed from the previous segment's last character and the current segment's first character: no space before left-attaching punctuation, no space after opening brackets, French non-breaking space before `:;!?`. Capitalize the first letter at sentence boundaries (`. ! ?` …) and at the start of a new line.",
        ],
        snippets: [
          {
            caption: "Spacing and casing rules",
            lang: "typescript",
            code: `const LEFT_ATTACH = new Set([",", ".", ":", ";", "!", "?", ")", "]", "}", "%"]);
const SENTENCE_END = new Set([".", "!", "?", "\\u2026"]);

function shouldPrependSpace(prevChar, nextChar, lang) {
  if (!prevChar || isWhitespace(prevChar)) return "";
  if (lang === "fr" && FRENCH_NBSP_BEFORE.has(nextChar)) return "\\u00A0";
  if (LEFT_ATTACH.has(nextChar)) return "";
  return " ";
}

function shouldCapitalize(prevText) {
  if (!prevText) return true;
  const last = prevText.trimEnd().slice(-1);
  return SENTENCE_END.has(last) || prevText.endsWith("\\n");
}`,
          },
        ],
      },
      {
        heading: "Prevent layout shift on highlight",
        text: [
          "Each word span has constant `px-0.5` padding at all times. Bold text (`font-semibold`) is wider than normal text (`font-normal`), but the padding absorbs the difference — the span's outer box width doesn't change when the active class toggles, so neighboring words never shift. The highlight uses an outset box-shadow instead of a border or inset ring, which also avoids affecting layout.",
        ],
        snippets: [
          {
            caption: "Active word with constant padding",
            lang: "typescript",
            code: `<span
  onClick={() => seekTo(seg.start / 1000)}
  className={cn(
    "cursor-pointer rounded-sm px-0.5 transition-colors",
    isActive
      ? "bg-lime-600/25 font-semibold shadow-[0_0_0_1px_rgba(101,163,13,0.4)]"
      : "font-normal text-foreground hover:bg-muted/60",
  )}
>
  {renderTextWithBreaks(displayText)}
</span>`,
          },
        ],
      },
      {
        heading: "Live dictation with parallel audio capture",
        text: [
          "The applet also supports live dictation via the `<corti-dictation>` web component connected to the `/transcribe` WebSocket. The same `wordLevel`, `diarize`, `automaticPunctuation`, `spokenPunctuation`, and `formatting` parameters are passed in the `TranscribeConfig`.",
          "Since the web component owns its microphone internally and exposes no raw audio, a parallel `MediaRecorder` on the same device captures audio for post-recording playback. The component's `recording-state-changed` events gate the capture start/stop.",
        ],
        snippets: [
          {
            caption: "Live transcript accumulation (seconds → ms)",
            lang: "typescript",
            code: `const handleTranscript = (e: CustomEvent) => {
  const data = e.detail?.data;
  if (!data || Array.isArray(data)) return;
  if (!data.isFinal) {
    setInterim(data.text);
    return;
  }
  segmentsRef.current = [...segmentsRef.current, {
    text: data.text,
    start: Math.round(data.start * 1000),  // seconds → ms
    end: Math.round(data.end * 1000),
    channel: 0, participant: 0, speakerId: 0,
  }];
};`,
          },
        ],
      },
    ],
    considerations: [
      "REST `/transcripts` timestamps are integers in milliseconds. WebSocket `/transcribe` timestamps are floats in seconds. The `useLiveTranscript` hook converts live timestamps to milliseconds on intake so the `SyncedTranscriptPlayer` works unchanged across both modes.",
      "Binary search finds the last segment whose `start` <= current time — O(log n) per frame. This avoids flickering during gaps between words where no segment's `[start, end]` range contains the current time.",
      "The transcript create request accepts `wordLevel`, `async`, `automaticPunctuation`, `spokenPunctuation`, and `formatting` alongside the standard fields.",
      "When `wordLevel` is disabled, the player highlights at phrase granularity. The sync code is identical — it matches on `start` regardless of whether each entry is a word or a phrase.",
      "Newlines in segment text (`\\n` → line break, `\\n\\n` → paragraph break) are rendered as `<br>` elements, preserving the transcript's structural formatting.",
      "Auto-scroll with `scrollIntoView({ block: 'nearest' })` keeps the active word visible without jumping the viewport when the word is already on screen.",
      "Live mode uses a `tokenSeen` latch — the dictation component mounts after the first auth token resolves and never unmounts during token refresh, so the WebSocket connection survives.",
    ],
  },

  "dictation-richtext": {
    premise: [
      "When you dictate into formatted content (a contenteditable), you cannot just append text. You need correct spacing and sentence casing at the caret insertion boundary.",
    ],
    how: [
      "Final segments are inserted through a shared ContentEditableAdapter that applies the same buildInsertion casing and spacing rules used elsewhere, writing a text node at the caret via the Range and Selection API. Interim results are previewed below the editor instead of being written into the document.",
    ],
    snippets: [
      {
        caption: "Insert final segments at the caret",
        lang: "typescript",
        code: `const adapter = new ContentEditableAdapter(editorEl);

onFinalSegment((seg) => {
  const text = buildInsertion(seg.text, adapter.context());
  adapter.insertAtCaret(text);
});`,
      },
    ],
  },

  formatting: {
    premise: [
      "Corti formats dates, times, numbers, measurements, and ordinals automatically, but the exact output style depends on your preferences. 'February third twenty twenty five' can be 'February 3, 2025' or '2025-02-03' — the formatting config controls which.",
      "This applet has two modes. Single dictation lets you configure formatting preferences in a reusable dialog and dictate into a rich text editor to see the impact. Comparison mode opens parallel WebSocket connections — one per formatting option in a category — so you can dictate the same phrase and see every option's output side-by-side in real time.",
    ],
    how: [
      "The formatting config is a simple object with six keys (dates, times, numbers, measurements, numericRanges, ordinals), each set to an enum value. Pass it inside the transcribe configuration's formatting field. The config is sent on connection — changing it requires a new session.",
      "The FormattingDialog component is a controlled Radix Dialog with six Select dropdowns. It lives in the formatting applet directory and can be imported by other applets (e.g. Dictation Suite) the same way SuitePanels imports CommandManager from dictation-commands.",
      "Comparison mode uses the raw SDK (not the web component) to open multiple transcribe connections concurrently. One getUserMedia stream feeds audio to all sockets via a single MediaRecorder — each dataavailable chunk is fanned out to every open socket. Each socket receives a config with only the selected category's value changed; all other categories use server defaults.",
    ],
    snippets: [
      {
        caption: "Formatting config in the transcribe configuration",
        lang: "typescript",
        code: `const config = {
  primaryLanguage: "en",
  formatting: {
    dates: "locale:long",        // "February 3, 2025"
    times: "locale",             // "8:00 AM" (en) / "08:00" (en-GB)
    numbers: "numerals_above_nine",
    measurements: "abbreviated",
    numericRanges: "numerals",
    ordinals: "numerals_above_nine",
  },
};`,
      },
      {
        caption: "Comparison: fan out one microphone to parallel sockets",
        lang: "typescript",
        code: `const configs = category.options.map((option) => ({
  option,
  config: {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    formatting: { ...DEFAULT_FORMATTING, [category.key]: option.value },
  },
}));

// One recorder, N sockets
recorder.ondataavailable = async (e) => {
  const buffer = await e.data.arrayBuffer();
  for (const c of sockets) {
    c.socket.sendAudio(buffer);
  }
};`,
      },
    ],
    considerations: [
      "Formatting is a config-time setting: it is sent in the initial config message and cannot be changed mid-session. The dialog shows a 'Restart recording to apply changes' hint when the draft differs from the active session.",
      "Locale-based options (dates, times) format according to the primaryLanguage. 'en' defaults to 12-hour time and 'February 3, 2025'; 'en-GB' defaults to 24-hour time and '3 February 2025'.",
      "The comparison mode opens one WebSocket per formatting option in the selected category. For dates that is 5 connections, for measurements only 2. Each connection consumes credits independently.",
      "The SDK's TranscribeConfig types formatting as Corti.TranscribeFormatting, but does not type replacements, terms, or keyterms yet — the same cast the dictation-suite uses. The FormattingDialog uses the applet-level FormattingConfig type, which is a plain string-keyed object.",
    ],
  },

  "dictation-commands": {
    premise: [
      "Corti emits command events when defined command phrases are recognized. Commands by themselves, however, do nothing and client applications must respond to them. This example turns those events into real editor actions and lets you manage the command set from the UI.",
    ],
    how: [
      "Commands are data driven: a ManagedCommand is an id, phrases, variables, and a client side action (insert text, keypress, or a small script). They are routed through a shared dispatcher to the focused editor. You can view the preloaded catalog, create or edit commands, export them as JSON, and they persist per API client.",
    ],
    snippets: [
      {
        caption: "A data-driven command, dispatched to the editor",
        lang: "typescript",
        code: `const command = {
  id: "bold",
  phrases: ["bold that", "make it bold"],
  action: { type: "keypress", keys: "Mod+b" },
};

// on a detected command event
dispatchCommand(detected, registry, editorAdapter);`,
      },
    ],
  },

  "text-replacements": {
    premise: [
      "Some spoken phrases should be rewritten in the final transcript. A dictated 'BID' should read 'twice daily', a shorthand should expand to its full form. Replacements let you configure those find and replace rules.",
    ],
    how: [
      "Configure the rule set in the manager, then dictate to see the rules applied to final results. Rules can be exported as a JSON config and persist per API client. The config is sent through buildReplacementConfig, which uses a typed cast until the SDK types the field.",
    ],
    snippets: [
      {
        caption: "Build the replacements config",
        lang: "typescript",
        code: `const config = buildReplacementConfig(rules);
// { replacements: [{ from: "BID", to: "twice daily" }, ...] }`,
      },
    ],
  },

  "dictionary-terms": {
    premise: [
      "Speech recognition can make mistakes, especially when encountering new terminology it has not been exposed to or unique accents and dialects. Defined dictionary terms bias the model toward the words you care about so they transcribe correctly.",
    ],
    how: [
      "Configure the term list in the manager, then dictate. The terms are sent in the transcribe config as a normalized terms array plus the matching keyterms wrapper. Terms can be exported as JSON and persist per API client.",
    ],
    snippets: [
      {
        caption: "Build the terms config",
        lang: "typescript",
        code: `const config = buildTermsConfig(terms);
// { terms: ["amoxicillin", ...], keyterms: { ... } }`,
      },
    ],
  },

  "dictation-box": {
    premise: [
      "Some desktop dictation applications provide a dictation box that can be targeted for speech to text capture and transfer to the target editor.",
    ],
    how: [
      "A single mic drives a mock form and a scratch box. Final dictation inserts at the caret of the focused control through a framework agnostic EditorAdapter, exactly like typing. Commands change the routing and drive the form.",
    ],
    snippets: [
      {
        caption: "The box command set, dispatched to app actions",
        lang: "typescript",
        code: `// "show dictation box"   focus the box
// "target dictation box" route dictation without moving focus
// "transfer text"        move the box text into the last field
// "go to {field}"        focus a field
// "pick {number}"        select the Nth dropdown option
handleBoxCommand(command, boxActions);`,
      },
    ],
  },

  "app-control": {
    premise: [
      "Sometimes you want to control the application itself, not just insert text: navigate the application, switch tabs, open or close a panel, click buttons, confirm or cancel a dialog.",
    ],
    how: [
      "Each actionable piece of UI registers itself as an AppControl. The command handler resolves a spoken target through a shared registry and runs it, gated by isAvailable so a dialog only accepts confirm or cancel while it is open. An awareness panel is rendered straight from the registry snapshot.",
    ],
    snippets: [
      {
        caption: "Register controls, resolve and run by voice",
        lang: "typescript",
        code: `registry.register({
  id: "tab:orders",
  isAvailable: () => true,
  run: () => setTab("orders"),
});

// on a command event
handleAppCommand(command, registry);`,
      },
    ],
  },

  "ambient-diarized": {
    premise: [
      "A /streams diarized transcript may not always arrive in order. Finalized segments come in arrays that can interleave across speakers, with no interim results. Therefore, if you append in arrival order, then you may get a scrambled conversation. This example renders the conversational transcript in true chronological order, grouped by speaker.",
    ],
    how: [
      "Create an interaction id on mount and pass it to the ambient component. Merge incoming segments by time.start (tie breaking on time.end) and group them into speaker runs, rather than appending as they arrive. You can also toggle diarization, multichannel, and facts mode.",
    ],
    snippets: [
      {
        caption: "Order by time, then group into speaker runs",
        lang: "typescript",
        code: `const interactionId = await createInteraction();

const ordered = mergeDiarizedSegments(allSegments); // sort by time.start
const runs = groupBySpeakerRuns(ordered);           // never arrival order`,
      },
    ],
  },

  "on-demand-agent": {
    premise: [
      "Speech to text commands can be linked to calls to the Corti Agentic Framework. For example, an on-demand agent can copy-edit text entered by typing or dictation to catch spelling, grammar, and punctuation issues without rewording or changing meaning.",
    ],
    how: [
      "On first use the app finds or creates a named copy editor agent and caches its id per API client. A copy edit sends the current text with no contextId so each call is isolated, then reads the edited text back from the task result. The minimal edit behavior lives entirely in the agent system prompt.",
    ],
    snippets: [
      {
        caption: "Ensure the agent, then run a copy edit",
        lang: "typescript",
        code: `const agentId = await ensureAgent(client, agentSpec); // list or create, cached

const task = await client.agents.messageSend(agentId, { message });
const edited = task.status.message.parts.find((p) => p.text)?.text;`,
      },
    ],
  },

  "medical-coding-live": {
    premise: [
      "A team with a working live transcription pipeline eventually hits the same wall: the encounter ends, a finished note exists, and now someone needs ICD and CPT codes attached to it before the chart can close or a claim can go out. Most teams solve this by exporting the note and pasting it into a separate coding tool, or by having a human coder do it entirely by hand. Neither scales, and both break the promise of a single application that takes a patient encounter from speech to a billable, coded record without a handoff to another system.",
      "The piece that closes this gap is a REST resource, client.codes.predict. It takes text, or a reference to a stored document, and returns structured medical codes with a confidence split baked into the response shape itself. It is not a new speech model and it does not touch your STT pipeline at all. It is a separate call you make once the encounter is over.",
      "A single predict() call is only the first half of a real workflow, though, and treating it as the whole thing is the mistake worth calling out up front. A raw code list with no review step is not something most billing or compliance teams will accept as final output; it is a draft. The other half, the part that turns one API call into an actual production workflow, is what happens after the first response comes back: a reviewer has to accept or reject each low confidence candidate, those decisions have to inform a second, refined call, and the two passes have to converge into one final, locked set of codes with a record of who decided what. This guide builds the whole thing, first pass through refined pass, ending with the same multi-pass loop the live demo on this page runs.",
    ],
    how: [
      {
        heading: "Where this fits relative to your STT pipeline",
        text: [
          "Before touching any code, it helps to see the whole shape of the pipeline this fits into. Nothing about your existing /transcribe or /streams session changes. Coding is a set of extra calls that happen after the encounter, against the finished text, not a parallel stream running alongside the audio.",
        ],
        snippets: [
          {
            caption: "Coding happens after the encounter, as its own multi-pass loop",
            lang: "mermaid",
            code: `sequenceDiagram
    participant C as Client app
    participant S as Corti /streams or /transcribe
    participant K as Corti codes.predict
    participant H as Human reviewer
    C->>S: create interaction, open socket
    loop each utterance
        S-->>C: finalized segment
    end
    C->>C: assemble finished note from segments
    C->>K: predict() first pass
    K-->>C: { codes, candidates, usageInfo }
    C->>H: render candidates for review
    H-->>C: accept / reject each candidate
    C->>K: predict() refined pass, filter.exclude = rejected codes
    K-->>C: { codes, candidates, usageInfo }
    C->>C: merge into one locked code set + audit log`,
          },
        ],
      },
      {
        heading: "Finishing the encounter and assembling one block of note text",
        text: [
          "Create the interaction and run the STT session exactly the way the ambient-diarized applet in this sandbox already does: client.interactions.create({ encounter, patient? }), then open a /streams or /transcribe socket against that interaction id and collect segments as they finalize. None of that changes for coding.",
          "What changes is the step after. Once the encounter is over, whether that means a clinician has reviewed and signed off on a note or your app has auto-assembled one from the finalized segments, you need a single string of text representing the whole encounter. Concatenate finalized segments in chronological order, or use whatever note text your review UI already produces. This string is what feeds every predict() call from here on, first pass and refined pass alike.",
        ],
        snippets: [
          {
            caption: "Assemble one note string from finalized segments",
            lang: "typescript",
            code: `const finalizedNote = segments
  .filter((s) => s.isFinal)
  .sort((a, b) => a.time.start - b.time.start)
  .map((s) => s.text)
  .join(" ");`,
          },
        ],
      },
      {
        heading: "Deciding which coding systems to request",
        text: [
          "system is a required field on the request and it is an array, not a single value, drawn from CommonCodingSystemEnum. The common ones are icd10cm-outpatient, icd10cm-inpatient, icd10pcs, and cpt. There is also a set of country specific systems: icd10gm-outpatient, icd10uk-inpatient, cim10fr-outpatient, opcs4, ops, and ccam, among others.",
          "Pick this list deliberately per client rather than requesting everything available. An outpatient only practice has no use for icd10pcs, an inpatient procedure system, and requesting it just adds candidates nobody on that team will ever accept. Build the system array from what the client actually bills against, and reuse the exact same array for both the first and the refined pass; system does not change between passes, only the filter does.",
        ],
        snippets: [
          {
            caption: "A deliberately scoped system list, reused across both passes",
            lang: "typescript",
            code: `const system: Corti.CommonCodingSystemEnum[] = ["icd10cm-outpatient", "cpt"];
// not icd10pcs or icd10cm-inpatient, this client is outpatient only`,
          },
        ],
      },
      {
        heading: "Building the context array",
        text: [
          'context is the other required field, an array of CommonAiContext entries. Each entry is either { type: "text", text } for a plain string, or { type: "documentId", documentId } for something already stored on the Corti side. You can pass more than one entry in a single call, for example a primary note plus a separate addendum written later, and each entry keeps its own index in the array.',
          "That index matters later. Every piece of evidence the model returns points back at a specific context entry by index, so if you concatenate two documents into one string instead of passing them as two context entries, you lose the ability to tell which document a given code actually came from.",
        ],
        snippets: [
          {
            caption: "One context entry per distinct source document",
            lang: "typescript",
            code: `const context: Corti.CommonAiContext[] = [
  { type: "text", text: finalizedNote },
  // a second entry keeps its own index for evidence attribution
  // { type: "text", text: addendum },
];`,
          },
        ],
      },
      {
        heading: "Calling codes.predict for the first pass",
        text: [
          "With system and context assembled, the call itself is a single method on a CortiClient instance built from the same authConfig every other applet in this sandbox uses. There is no separate coding specific client, codes is just another resource on the same client you already use for transcribe, streams, and interactions. This first call has no filter at all; it is a clean read of what the model finds across the whole note.",
        ],
        snippets: [
          {
            caption: "The first predict() call, unfiltered",
            lang: "typescript",
            code: `const client = new CortiClient({ environment: sdkEnvironment, auth: authConfig });

const firstPass = await client.codes.predict({
  system: ["icd10cm-outpatient", "cpt"],
  context: [{ type: "text", text: finalizedNote }],
});`,
          },
        ],
      },
      {
        heading: "Reading codes versus candidates",
        text: [
          "The response is a CodesGeneralResponse with three top level fields: codes, candidates, and usageInfo. codes and candidates share the exact same item shape, CodesGeneralReadResponse (system, code, display, an optional evidences array, an optional alternatives array). The only difference between the two arrays is confidence. codes is what the model is willing to assert outright. candidates is what it noticed and judged relevant, but held back from asserting.",
          "Treat candidates as a review queue, not as noise. A human coder clearing that queue, confirming or dismissing each entry, is the normal shape of this workflow, not an edge case to design around later, and it is the input the refinement pass further down this guide depends on.",
        ],
        snippets: [
          {
            caption: "Render both buckets separately",
            lang: "typescript",
            code: `firstPass.codes.forEach((c) => renderAcceptedCode(c));
firstPass.candidates.forEach((c) => renderReviewQueueItem(c));

// firstPass.usageInfo.creditsConsumed tells you the cost of this one call`,
          },
        ],
      },
      {
        heading: "Tracing a code back to the evidence that justified it",
        text: [
          "Each entry in evidences is a CodesGeneralReadResponseEvidencesItem with four fields: contextIndex (which entry in your context array this evidence came from), text (the exact span of the note the model relied on), and start / end, zero based character offsets into that context entry's text, start inclusive and end exclusive.",
          "This is what lets a review UI highlight, directly inside the original note, exactly which sentence justified a given code, instead of showing a bare code and asking a reviewer to take it on faith. Keep the exact string you sent as context; if you reformat or re-punctuate the note before display, the start/end offsets stop lining up with the text on screen.",
        ],
        snippets: [
          {
            caption: "Highlight the evidence span inside the original note",
            lang: "typescript",
            code: `const evidence = code.evidences?.[0];
if (evidence) {
  const before = finalizedNote.slice(0, evidence.start);
  const span = finalizedNote.slice(evidence.start, evidence.end);
  const after = finalizedNote.slice(evidence.end);
  // render before + <mark>span</mark> + after
}`,
          },
        ],
      },
      {
        heading: "Surfacing alternatives next to the primary code",
        text: [
          "alternatives is a shorter list on each code entry, CodesGeneralReadResponseAlternativesItem, just code and display, representing other codes the model considered plausible for that same finding before settling on the one it actually returned. Showing alternatives directly in a review card lets a coder swap in a different code with one click, instead of re-running the whole prediction to get a second opinion on the same finding.",
        ],
        snippets: [
          {
            caption: "A review card with its alternatives",
            lang: "typescript",
            code: `function CodeCard({ item }: { item: Corti.CodesGeneralReadResponse }) {
  return (
    <div>
      <strong>{item.code}</strong> {item.display}
      {item.alternatives?.map((alt) => (
        <button key={alt.code} onClick={() => swapCode(item, alt)}>
          use {alt.code} instead
        </button>
      ))}
    </div>
  );
}`,
          },
        ],
      },
      {
        heading: "Why one predict() call is not the whole workflow",
        text: [
          "A first pass, on its own, hands a reviewer a mix of confident codes and lower confidence candidates and then stops. Nothing captures what the reviewer decided, nothing uses that decision to improve the next attempt, and there is no single, final list anyone can actually export or attach to a claim. Those three gaps, no record of the decision, no reuse of the decision, no converged final list, are exactly what the rest of this guide closes.",
          "The mechanism for reusing a reviewer's decision is already sitting in the request shape from the first pass: filter.exclude. A candidate the reviewer rejects is, from the API's point of view, just a code string. Passing that code string back in filter.exclude on a second call tells the model not to surface it again, which is a real, working feedback loop built entirely out of fields the endpoint already supports, not a new capability bolted on top of it.",
        ],
        snippets: [
          {
            caption: "The full loop: review, refine, converge",
            lang: "mermaid",
            code: `flowchart TD
    P1[First pass: predict, no filter] --> Codes1[codes: auto-accepted]
    P1 --> Cand1[candidates: needs review]
    Cand1 --> Rev{Reviewer decision}
    Rev -->|accept| Acc[Accepted candidate]
    Rev -->|reject| Rej[Rejected candidate]
    Rej --> Filter[filter.exclude = rejected codes]
    Filter --> P2[Refined pass: predict again]
    P2 --> Codes2[codes: auto-accepted]
    P2 --> Cand2[candidates: review again if any]
    Codes1 --> Locked[Locked code set]
    Codes2 --> Locked
    Acc --> Locked
    Cand2 --> Rev`,
          },
        ],
      },
      {
        heading: "Turning reviewer decisions into a refined second pass",
        text: [
          "Collect every reviewer decision as it happens, keyed by a stable identity for each candidate (system plus code is enough, since the same code should not appear twice under the same system in one response). Once at least one decision exists, build a filter.exclude array of condition objects from every code the reviewer rejected, and call predict again with the exact same system and context, adding only that filter.",
          "The refined call can still return new candidates of its own; the model is not guaranteed to converge to zero candidates in one extra pass, particularly on a note with several plausible findings. That is expected. A refined pass is a better pass, not necessarily a final one, which is why the review step applies to a refined pass's candidates exactly the same way it applied to the first pass's.",
        ],
        snippets: [
          {
            caption: "Build filter.exclude from rejected decisions, then re-predict",
            lang: "typescript",
            code: `const rejectedCodes = firstPass.candidates
  .filter((c) => decisions[\`\${c.system}:\${c.code}\`] === "rejected")
  .map((c) => c.code);

const refinedPass = await client.codes.predict({
  system: ["icd10cm-outpatient", "cpt"],
  context: [{ type: "text", text: finalizedNote }],
  filter: rejectedCodes.length
    ? { exclude: [{ property: "code", op: "is-a", value: rejectedCodes }] }
    : undefined,
});`,
          },
        ],
      },
      {
        heading: "Converging both passes into one locked code set",
        text: [
          "With a first pass and a refined pass both in hand, the final code set is a merge, not a replacement: every codes entry from either pass (deduplicated, since a code confirmed in both passes should only count once), plus every candidate from either pass that the reviewer explicitly accepted. Nothing enters the locked set without either the model asserting it outright or a human accepting it.",
          "Dedupe by the same system-plus-code key used for tracking decisions, so a code that shows up as a candidate in the first pass and then as an accepted candidate is not double counted once the refined pass runs.",
        ],
        snippets: [
          {
            caption: "Merge two passes into one deduplicated locked set",
            lang: "typescript",
            code: `function key(item: Corti.CodesGeneralReadResponse) {
  return \`\${item.system}:\${item.code}\`;
}

function dedupe(items: Corti.CodesGeneralReadResponse[]) {
  return Array.from(new Map(items.map((i) => [key(i), i])).values());
}

const lockedCodes = dedupe([...firstPass.codes, ...refinedPass.codes]);
const lockedCandidates = dedupe([...firstPass.candidates, ...refinedPass.candidates])
  .filter((c) => decisions[key(c)] === "accepted");

const lockedSet = [...lockedCodes, ...lockedCandidates];`,
          },
        ],
      },
      {
        heading: "Recording every decision as an audit trail",
        text: [
          'Every accept, every reject, and the refinement call itself are each worth one append-only audit log entry: a timestamp, an actor (the reviewer\'s identity, or "system" for the automated refine step), and a short description of what happened. This is the same append-only pattern used by the human-approval-checkpoint guide elsewhere in this section, applied here to a coding review instead of a broader agentic proposal, and it is what turns a locked code set from an unexplained final answer into something a billing or compliance review can actually trace back through.',
        ],
        snippets: [
          {
            caption: "One audit entry per decision and per refinement call",
            lang: "typescript",
            code: `interface AuditEntry { at: string; actor: string; event: string; }

const auditLog: AuditEntry[] = [];

function recordDecision(item: Corti.CodesGeneralReadResponse, decision: "accepted" | "rejected") {
  auditLog.push({
    at: new Date().toISOString(),
    actor: "reviewer",
    event: \`\${decision} \${item.code} (\${item.display})\`,
  });
}`,
          },
        ],
      },
      {
        heading: "Trying the full refinement loop yourself",
        text: [
          "The live demo on this page runs the entire loop built across this guide against your authenticated Corti client: edit the sample note, run the first pass, accept or reject each candidate, run the refined pass once at least one decision has been made, and watch the locked code set and the audit log build up underneath as both passes converge. The full component source for this demo is included in the Copy for LLM bundle for this page, so an assistant reading that bundle has the working end to end implementation, review loop and all, not just the isolated call.",
        ],
      },
    ],
    considerations: [
      "candidates is not an error state or a lower quality result. It is the model telling you it saw something plausibly codeable and is not confident enough to assert it on its own. Route it to a human reviewer rather than discarding it or silently auto-accepting it.",
      "Coding runs against a single snapshot of text, not a live stream, and each call costs credits regardless of how much new content it saw (check usageInfo.creditsConsumed on every pass, not just the first). Decide up front whether you call predict once at the end of the encounter or once per addendum. Calling it per utterance wastes credits and gives you fragments instead of codes for a coherent note.",
      "Evidence start and end offsets point at character positions in the exact string you sent as that context entry's text. If you reformat, re-punctuate, or trim the note before rendering it to a reviewer, the offsets no longer line up. Keep the exact string you sent as the one you highlight against, and only reformat a copy for display.",
      "A refined pass is not guaranteed to be the last one. Design the review UI to accept that a second round of candidates might need a second round of decisions, rather than assuming one refinement always reaches zero candidates.",
      "Pick systems deliberately per client. Requesting icd10pcs (an inpatient procedure system) for an outpatient only practice wastes part of every call and adds candidates your reviewers will never use. Build the system list from what the client actually bills, not from including everything available.",
      "This demo does not implement retry or 429 backoff. A production workflow should handle rate-limit responses with exponential backoff rather than surfacing them as errors.",
    ],
  },

  "medical-coding-batch": {
    premise: [
      "Not every coding problem starts with a live encounter. A backlog of existing notes, already written, sitting in an EMR or a document store, still needs codes attached for chart completion, form fill, or a claim to go out. A chart audit team faces the same shape of problem from the other direction: hundreds of already written notes, no live audio anywhere, and a need to run coding across all of them on a schedule instead of one at a time as a clinician finishes a visit.",
      "The endpoint is the same one used for a live encounter, client.codes.predict, and there is no separate batch or bulk variant anywhere in the SDK. What actually changes between a single live note and a backlog of a thousand documents is not the call itself, it is what gets layered around it.",
      "A single unfiltered pass over a large backlog is a reasonable first attempt and a poor final workflow. It tends to surface the same handful of low value candidates over and over across many documents, things a chart audit team will reject every single time they see them, and a review queue that repeats the same rejection hundreds of times is not actually saving anyone effort. This guide builds past that: one full pass across the backlog, a review step where rejections get remembered, and a second pass that reuses everything the first pass's reviewers already decided so the queue on the re-run is measurably smaller.",
    ],
    how: [
      {
        heading: "Seeing the shape of a batch run that learns",
        text: [
          "There is no bulk endpoint. A batch is a client-side loop over predict, and a batch that learns is that same loop run more than once, with each re-run informed by what reviewers decided on the previous one.",
        ],
        snippets: [
          {
            caption: "N documents converge into one review queue, per round",
            lang: "mermaid",
            code: `flowchart LR
    D1[Document 1] --> P1[predict, round N]
    D2[Document 2] --> P2[predict, round N]
    D3[Document 3] --> P3[predict, round N]
    P1 --> A[Auto-applied codes]
    P2 --> A
    P3 --> A
    P1 --> Q[Review queue: candidates]
    P2 --> Q
    P3 --> Q
    A --> Locked[Locked set across all rounds]
    Q --> R[Coder review]
    R -->|accept| Locked
    R -->|reject| Learn[Learned exclude list]
    Learn --> P1`,
          },
        ],
      },
      {
        heading: "Representing each document as either text or a stored documentId",
        text: [
          'A document in the batch can arrive two ways: as plain text you already have (pasted from an existing note, or read from a file) or as a documentId referencing something already stored on the Corti side. Both map onto the same CommonAiContext union used in the live coding guide elsewhere in this section, { type: "text", text } or { type: "documentId", documentId }, just one entry per document instead of one entry per encounter.',
        ],
        snippets: [
          {
            caption: "Normalize a batch item into a context entry",
            lang: "typescript",
            code: `interface BatchDoc { label: string; text?: string; documentId?: string; }

function toContext(doc: BatchDoc): Corti.CommonAiContext {
  return doc.documentId
    ? { type: "documentId", documentId: doc.documentId }
    : { type: "text", text: doc.text ?? "" };
}`,
          },
        ],
      },
      {
        heading: "Fixing the system list once for every round",
        text: [
          "system does not change per document, and it does not change between rounds either. The coding systems a given client actually bills against are a property of that client's practice, not of any one note or any one run, so decide the system array once, outside the loop, and reuse it on every round.",
        ],
        snippets: [
          {
            caption: "One system list, reused for every call, every round",
            lang: "typescript",
            code: `const system: Corti.CommonCodingSystemEnum[] = ["icd10cm-outpatient", "cpt"];`,
          },
        ],
      },
      {
        heading: "Scoping the first round with a manual filter",
        text: [
          'filter is what keeps a broad backlog from returning noise, before any review has even happened. It is an optional CodesFilter with two fields. include is a list of condition objects that restrict prediction to specific codes or categories, for example [{ property: "code", op: "is-a", value: ["E11"] }] to scope a diabetes chart audit to only diabetes related codes. exclude subtracts from that include set using the same condition-object shape. The is-a op expands a category code like E11 into its specific leaf codes such as E11.65; use a different op if you want the bare category only.',
          "Without a filter, a batch of a thousand notes returns whatever the model finds across every system in your system array, for every document, which is rarely what a targeted audit actually wants. This manual filter is the starting point; the next few steps add a second, learned layer on top of it.",
        ],
        snippets: [
          {
            caption: "A manual filter scoped to one audit question",
            lang: "typescript",
            code: `const manualFilter = { include: [{ property: "code", op: "is-a", value: ["E11"] }] };
// scopes the run to diabetes-related leaf codes only, before any learning happens`,
          },
        ],
      },
      {
        heading: "Running the first round, one predict() call per document",
        text: [
          "With context, system, and the manual filter all defined, the loop itself is mechanical: call client.codes.predict once per document, passing the same system and filter every time and only context changing. Aggregate as you go: push codes into a per-document accepted list, since these auto-apply to that document's record, and push candidates into one shared review queue tagged with which document they came from.",
        ],
        snippets: [
          {
            caption: "The first round, aggregated into one accepted list and one queue",
            lang: "typescript",
            code: `const accepted: Corti.CodesGeneralReadResponse[] = [];
const queue: Array<{ docLabel: string; item: Corti.CodesGeneralReadResponse }> = [];
let totalCredits = 0;

for (const doc of documents) {
  const response = await client.codes.predict({ system, context: [toContext(doc)], filter: manualFilter });
  totalCredits += response.usageInfo.creditsConsumed;
  accepted.push(...response.codes);
  response.candidates.forEach((item) => queue.push({ docLabel: doc.label, item }));
}`,
          },
        ],
      },
      {
        heading: "Letting reviewers clear the queue, one decision at a time",
        text: [
          "A coder working the queue does not want to open twenty separate note views to find twenty separate lists of two or three candidates each; they want one queue, with enough context per row to jump back to the source document, and exactly two choices per row: accept it into the locked set, or reject it. Record every decision keyed by the document it belongs to plus the code itself, since the same code can appear as a candidate on more than one document in the same run.",
        ],
        snippets: [
          {
            caption: "Recording a decision, keyed by document and code",
            lang: "typescript",
            code: `type Decision = "accepted" | "rejected";
const decisions: Record<string, Decision> = {};

function decide(docLabel: string, item: Corti.CodesGeneralReadResponse, decision: Decision) {
  decisions[\`\${docLabel}::\${item.system}:\${item.code}\`] = decision;
}`,
          },
        ],
      },
      {
        heading: "Turning rejections across the whole batch into a learned filter",
        text: [
          "Once reviewers have cleared some of the queue, walk every recorded decision and pull out the code from every rejection, regardless of which document it came from. A code a reviewer rejects on one document is very likely to get rejected again if it shows up as a candidate on a different document in the same backlog, since it reflects the same audit team's judgment about what does not belong in this batch. Deduplicate that list into a learned exclude array.",
        ],
        snippets: [
          {
            caption: "Deriving a learned exclude list from every rejection so far",
            lang: "typescript",
            code: `function learnedExclude(decisions: Record<string, Decision>): string[] {
  return Array.from(
    new Set(
      Object.entries(decisions)
        .filter(([, d]) => d === "rejected")
        .map(([key]) => key.split("::")[1].split(":")[1]), // the code portion of the key
    ),
  );
}`,
          },
        ],
      },
      {
        heading: "Re-running the batch with the learned filter merged in",
        text: [
          "For the next round, union the learned exclude list from the previous step with whatever manual exclude value was already set, and run the exact same loop from the first round again, across the exact same documents, with this augmented filter. The system array and the documents themselves do not change between rounds, only the filter grows.",
        ],
        snippets: [
          {
            caption: "A second round, filter augmented with learned rejections",
            lang: "typescript",
            code: `const excludeForRound2 = Array.from(
  new Set([
    ...(manualFilter.exclude?.[0]?.value ?? []),
    ...learnedExclude(decisions),
  ]),
);

const round2Filter = {
  ...manualFilter,
  exclude: [{ property: "code", op: "is-a", value: excludeForRound2 }],
};

for (const doc of documents) {
  const response = await client.codes.predict({ system, context: [toContext(doc)], filter: round2Filter });
  // aggregate exactly as in the first round
}`,
          },
        ],
      },
      {
        heading: "Watching the queue shrink across rounds",
        text: [
          "A batch that learns should produce a visibly smaller review queue on its second round than its first, on the same backlog, since every code the reviewers already rejected is now excluded before it can reappear as a candidate. This is the concrete signal that the loop is working: not a subjective sense that review is easier, but a queue size that measurably drops round over round.",
        ],
        snippets: [
          {
            caption: "A simple before/after comparison across rounds",
            lang: "mermaid",
            code: `flowchart LR
    R1[Round 1 queue: 12 candidates] -->|8 rejected, learned| R2[Round 2 queue: 4 candidates]
    R2 -->|1 rejected, learned| R3[Round 3 queue: 1 candidate]`,
          },
        ],
      },
      {
        heading: "Totaling the cost across every round",
        text: [
          "There is no single credits figure for a batch as a whole, because there is no single call for a batch as a whole, and a batch that runs more than one round adds another layer on top of that: sum usageInfo.creditsConsumed from every response in every round, not just the latest one, before reporting a total cost for the audit.",
        ],
        snippets: [
          {
            caption: "Running total across every round, not just the latest",
            lang: "typescript",
            code: `const totalCreditsAcrossRounds = rounds.reduce((sum, round) => sum + round.credits, 0);`,
          },
        ],
      },
      {
        heading: "Trying the learning loop yourself",
        text: [
          "The live demo on this page lets you add several documents as editable cards, set a manual filter.include and filter.exclude, run the batch, clear the queue by accepting or rejecting each candidate, then re-run with a button that shows exactly how many rejected codes it learned and folded into the next round's filter. The locked code set and the audit log accumulate across every round you run. The full component source is included in the Copy for LLM bundle for this page.",
        ],
      },
    ],
    considerations: [
      "The is-a op in include or exclude expands a category code to its leaf codes. If your review workflow wants to see category level results (E11 as a whole) before a coder picks the specific leaf code, use a different op or omit the filter to get the bare category.",
      "include and exclude operate on the same list: exclude subtracts from include, it does not add a second independent restriction. An empty include with a non-empty exclude still returns the full set for the requested systems, minus whatever exclude removed.",
      "A learned exclude list is a per-batch judgment, not a permanent, cross-audit rule. A code rejected for one backlog scoped to one audit question might be entirely valid in a different backlog scoped to a different question, so do not carry a learned exclude list forward into an unrelated run without review.",
      "Running a large batch means many sequential or concurrent calls, and every one of them consumes credits independently of how big or small the document was, on every round. Estimate cost from the batch size times the number of rounds you expect to run, not from a single note's cost, before running an audit against a full backlog.",
      "Keep the system list narrow per client based on what they actually bill. A client who only ever sees outpatient encounters does not need icd10pcs or icd10cm-inpatient in the request, and adding them only produces candidates nobody on that team will ever accept.",
      "This demo does not implement rate limiting, retry, or 429 backoff. A production batch workflow should throttle concurrency and retry with exponential backoff to avoid hitting API rate limits.",
      "Batch predict calls are not abortable — navigating away from the page mid-run does not cancel in-flight requests. A production implementation should pass an AbortSignal to each predict call.",
    ],
  },

  "facts-multisource": {
    premise: [
      "An intake workflow rarely gets one clean document to work from. A new patient shows up as a referral letter, a separate intake form, and a history note, arriving together, each with different details and none of them structured. Somebody, or something, has to read all three and pull out the facts that matter: symptoms, medications, relevant history, before any of it is useful to a clinician or a downstream system. Doing that by hand for every new patient does not scale, and doing it with a single generic text extraction call per document loses exactly the connections across documents that make multi-source intake worth automating in the first place.",
      "FactsR is not websocket only, which is worth stating plainly since most existing examples talk about facts arriving as StreamFactsMessage events during a live /streams session, generated as an ambient encounter progresses. That is one real way to get facts, but it requires a live audio session and only ever sees one source at a time, the transcript. client.facts is a separate, dedicated REST resource with its own client.facts.extract method. extract takes plain text, not audio, needs no interaction id at all, and can fold more than one document's worth of text into a single call. That reframes the whole problem: multi-source document extraction is a text-in, JSON-out call you can make on demand, not a byproduct of a live encounter.",
      "A single extract() call is still only half of a real intake pipeline, and it is worth being direct about which half. extract() is explicitly stateless: nothing it returns is saved anywhere, and it forgets everything the moment the response comes back. A production intake workflow needs more than a preview. It needs a point where a person confirms which extracted facts are actually correct, a point where those confirmed facts get written down somewhere durable, and a point where you can prove they are actually stored, not just sitting in a browser tab. This guide builds all three on top of extract(), ending with the same preview, curate, persist, and verify sequence the live demo on this page runs.",
    ],
    how: [
      {
        heading: "Seeing how several sources become one confirmed, persisted result",
        text: [
          "The full shape has four stages, not one: several source documents go into a stateless preview, a reviewer curates what comes out of that preview, curated facts get written to a real interaction, and a final read confirms they actually landed.",
        ],
        snippets: [
          {
            caption: "Preview, curate, persist, verify",
            lang: "mermaid",
            code: `flowchart LR
    R[Referral letter] --> X[facts.extract: stateless preview]
    I[Intake form] --> X
    H[History note] --> X
    X --> F[Flat facts: group + text]
    F --> C{Reviewer curates}
    C -->|keep| K[Confirmed facts]
    C -->|discard| D[Discarded]
    K --> N[interactions.create]
    N --> P[facts.create: persist]
    P --> V[facts.list: verify]`,
          },
        ],
      },
      {
        heading: "Combining source documents into extract()'s one context entry",
        text: [
          'extract() takes a context array of CommonTextContext entries, each { type: "text", text } — but the API only accepts a single entry per call, so multiple source documents cannot be passed as separate array entries the way a primary note plus an addendum can for some other endpoints. To extract across several documents at once, merge their text into that one entry, labeling each block so the source stays identifiable inside the merged text even though the array itself holds just one item.',
        ],
        snippets: [
          {
            caption: "One context entry, multiple documents merged",
            lang: "typescript",
            code: `const context: Corti.CommonTextContext[] = [
  {
    type: "text",
    text: [
      \`Referral letter:\\n\${referralLetter}\`,
      \`Intake form:\\n\${intakeForm}\`,
      \`History note:\\n\${historyNote}\`,
    ].join("\\n\\n"),
  },
];`,
          },
        ],
      },
      {
        heading: "Choosing combined extraction when cross-document connections matter",
        text: [
          'Call client.facts.extract({ context, outputLanguage: "en" }) with all documents merged into that one context entry, and the model sees every document at once. That means it can connect a detail mentioned only in one source (a family history noted in the referral letter) with a detail mentioned only in another (a prior procedure noted in the history note), and return a fact that reflects that connection. An intake workflow assembling a single patient summary usually wants this: the cross-document connections are exactly the value being extracted.',
        ],
        snippets: [
          {
            caption: "One call, all documents, connections preserved",
            lang: "typescript",
            code: `const client = new CortiClient({ environment: sdkEnvironment, auth: authConfig });

const response = await client.facts.extract({
  context,
  outputLanguage: "en",
});
// response.facts may include a fact that draws on more than one source document`,
          },
        ],
      },
      {
        heading: "Choosing per-document extraction when attribution matters more",
        text: [
          "The alternative is one extract() call per document, in a loop, with the resulting fact arrays concatenated afterward. This keeps attribution unambiguous, since you know exactly which call, and therefore which single source document, produced which fact. The tradeoff is that the model never sees the other documents while extracting from any one of them, so it cannot connect details that live in separate sources. An audit or an EDC population workflow that needs to trace every extracted value back to its exact source document usually wants this loop, even though it costs one call per document instead of one call total.",
        ],
        snippets: [
          {
            caption: "One call per document, attribution preserved",
            lang: "typescript",
            code: `const perDocumentFacts: Array<Corti.FactsExtractResponseFactsItem & { source: string }> = [];

for (const doc of [
  { label: "referral", text: referralLetter },
  { label: "intake", text: intakeForm },
  { label: "history", text: historyNote },
]) {
  const response = await client.facts.extract({
    context: [{ type: "text", text: doc.text }],
    outputLanguage: "en",
  });
  response.facts.forEach((f) => perDocumentFacts.push({ ...f, source: doc.label }));
}`,
          },
        ],
      },
      {
        heading: "Reading the response shape",
        text: [
          "Whichever strategy you pick, the response is a FactsExtractResponse with three fields: facts, an array of FactsExtractResponseFactsItem ({ group, text, value }, where value is deprecated and text is the field to read); outputLanguage, echoing back the language of the output; and usageInfo, the credits consumed by that one call.",
        ],
        snippets: [
          {
            caption: "Example facts array",
            lang: "typescript",
            code: `// response.facts:
// [
//   { group: "history", text: "Relevant family history noted in the referral letter" },
//   { group: "medications", text: "Current medication noted on the intake form" },
//   { group: "history", text: "Prior procedure noted in the history note" }
// ]`,
          },
        ],
      },
      {
        heading: "Grouping the flat facts array by fact group",
        text: [
          "The response is flat: facts is a single array with no grouping structure beyond the group string on each item. Call client.facts.factGroupsList() once, it takes no arguments, to get the FactsFactGroupsListResponse, the reference taxonomy of valid group keys such as symptoms, medications, or history. Treat that list as the canonical set of groups rather than inferring groups from whatever happens to show up in one extraction, then reduce the flat facts array into a keyed object on the group field.",
        ],
        snippets: [
          {
            caption: "Group the flat array by fact group",
            lang: "typescript",
            code: `const byGroup: Record<string, Corti.FactsExtractResponseFactsItem[]> = {};
for (const fact of response.facts) {
  (byGroup[fact.group] ??= []).push(fact);
}
// byGroup.history, byGroup.medications, etc.`,
          },
        ],
      },
      {
        heading: "Letting a reviewer curate before anything is treated as final",
        text: [
          "Not every extracted fact deserves to become part of the patient record. The model can extract a detail that is present in the source text but not actually clinically relevant, or misjudge which fact group something belongs to. Render every extracted fact with a simple keep or discard choice, defaulting to kept, so a reviewer only has to act on the ones they disagree with rather than re-entering everything by hand.",
        ],
        snippets: [
          {
            caption: "Curated facts, defaulting to kept",
            lang: "typescript",
            code: `interface CuratedFact { group: string; text: string; keep: boolean; }

const curated: CuratedFact[] = response.facts.map((f) => ({
  group: f.group,
  text: f.text,
  keep: true, // reviewer can uncheck any fact before it is persisted
}));`,
          },
        ],
      },
      {
        heading: "Persisting confirmed facts against a real interaction",
        text: [
          "extract() never needed an interaction id because it never stored anything. Persisting does. Create one with the same interaction creation flow used for a live encounter elsewhere in this sandbox, then call client.facts.create(interactionId, { facts }) with only the facts the reviewer kept, each shaped as { text, group }. This is the same facts resource, just a different, stateful method on it.",
        ],
        snippets: [
          {
            caption: "Create an interaction, then persist only the kept facts",
            lang: "typescript",
            code: `const interaction = await createInteraction(); // { interactionId, websocketUrl }

const kept = curated.filter((f) => f.keep);
await client.facts.create(interaction.interactionId, {
  facts: kept.map((f) => ({ text: f.text, group: f.group })),
});`,
          },
        ],
      },
      {
        heading: "Verifying what actually got persisted",
        text: [
          "Do not assume the create call did what you expect just because it did not throw. Call client.facts.list(interactionId) immediately after, which returns a FactsListResponse with a facts array of FactsListItem entries, each now carrying a server-assigned id plus createdAt, updatedAt, and a source field (core for model-generated, user for reviewer-added, system for anything derived from an external record). Rendering this list back to the reviewer is the concrete proof that curation actually persisted, not just a UI state that resets on refresh.",
        ],
        snippets: [
          {
            caption: "Read back the persisted facts to confirm they landed",
            lang: "typescript",
            code: `const listing = await client.facts.list(interaction.interactionId);
listing.facts.forEach((f) => console.log(f.id, f.group, f.text, f.source));`,
          },
        ],
      },
      {
        heading: "Mapping grouped facts onto your target schema",
        text: [
          "Whether you map from the stateless preview or from the persisted, server-confirmed list, this last step is specific to each integration. For an EDC form, it usually means a lookup table from group key to form field id, with each fact's text either written directly into a free text field or parsed further if the target field expects a structured value like a date or a coded term. For an agent's context, it usually means serializing the grouped facts as JSON and passing that JSON as part of the agent's message, the same structured input the human-approval-checkpoint and multi-agent guides elsewhere in this section build on.",
        ],
        snippets: [
          {
            caption: "A minimal group-to-field mapper",
            lang: "typescript",
            code: `const FIELD_MAP: Record<string, string> = {
  history: "patient_history_field",
  medications: "current_medications_field",
};

function toFormValues(byGroup: Record<string, Corti.FactsExtractResponseFactsItem[]>) {
  const values: Record<string, string> = {};
  for (const [group, fieldId] of Object.entries(FIELD_MAP)) {
    values[fieldId] = (byGroup[group] ?? []).map((f) => f.text).join("; ");
  }
  return values;
}`,
          },
        ],
      },
      {
        heading: "Trying the full preview-to-persisted pipeline yourself",
        text: [
          "The live demo on this page lets you edit three sample source documents as cards, run either extraction strategy, uncheck any fact that should not be kept, then confirm and persist the rest against a real interaction created on the spot. The persisted section that appears afterward is read back with a real list() call, showing each fact's server-assigned id as proof it is no longer just a stateless preview. The full component source for this pipeline is included in the Copy for LLM bundle for this page.",
        ],
      },
    ],
    considerations: [
      "extract() is stateless. It does not persist facts anywhere and needs no interaction id, so nothing is stored if you refresh the page or lose the response before running the persist step. Treat its output as a draft until it has gone through curation and a real create() call.",
      "value on a fact item is explicitly marked deprecated in the type definition, in favor of text. Read text; only fall back to value against an older integration that has not migrated.",
      "One combined call versus one call per document is a real tradeoff, not a stylistic choice. Combined calls cost one request's worth of credits but blur attribution across sources; per-document calls cost one request per document but keep every fact traceable to exactly one source. Pick per-document whenever a regulator or an EDC audit will ask where a specific value came from.",
      "Treat factGroupsList() as the source of truth for what group values exist. Facts returned by extract() use group keys drawn from that list, so building a UI or a schema mapping against a hardcoded set of group names risks silently dropping facts if the taxonomy changes.",
      "A fact's source field on the persisted list distinguishes core (model-generated), user (added or kept by a reviewer), and system (derived from an external record like an EHR). Preserve that distinction in your own schema rather than flattening every fact to look the same once persisted.",
    ],
  },

  "hitl-checkpoint": {
    premise: [
      "A common requirement in regulated and clinical settings is deceptively simple to state and genuinely hard to build correctly: an agent that gathers and structures data across sources is fine, but the agent cannot be the one that takes the action. A human has to look at what the agent produced and explicitly approve it before anything downstream happens, and that approval has to be logged well enough to survive an audit later. In a setting governed by a regulation like CFR Part 11, the FDA rule covering electronic records and signatures in clinical research, this turns from a nice-to-have review step into a hard blocker: without it, the system cannot ship at all, regardless of how good the agent's output is.",
      'This pattern does not exist anywhere as a single API call, and it is important to understand exactly why before building it. The Corti Agentic Framework (client.agents.*) gives you orchestrator and expert agents, and a way to send them messages and read back structured results through client.agents.messageSend. It does not give you a built-in "awaiting human approval" task state. There is no confirmed status value in the SDK for a task that pauses pending a person\'s decision. That gap is not a missing feature to work around. It is the actual design point: the approval gate and the audit trail belong to your application, not to the framework, which is exactly the property a regulated environment needs, since the trail is then something your team owns and controls end to end rather than something opaque inside a third-party system.',
      "A plain binary gate, approve or reject with nothing in between, is a reasonable starting point and an incomplete real workflow. In practice a reviewer often does not want to reject an otherwise-good proposal outright just because one detail is off; they want to send it back with a specific note and get a corrected version, without losing the thread connecting the original proposal to its revision. This guide builds the full chain: a proposal, a reviewer who can approve, reject outright, or request a revision with feedback, an orchestrator step that produces a new version addressing that feedback, and an audit log that captures every version, not just the final one.",
    ],
    how: [
      {
        heading: "Where the human sits in the flow",
        text: [
          "The orchestrator never talks to a downstream system directly. Every path from a proposal to a real mutation passes through an explicit human decision, and every decision, approve, reject, or request a revision, gets written to an audit log regardless of outcome.",
        ],
        snippets: [
          {
            caption: "A proposal is held, not executed, until a human decides",
            lang: "mermaid",
            code: `sequenceDiagram
    participant O as Orchestrator agent
    participant App as Application state
    participant H as Human reviewer
    participant API as Downstream API
    O->>App: propose action v1 + payload (status: pending)
    App->>H: render proposal for review
    alt approved
        H->>App: approve
        App->>API: execute action (e.g. facts.create)
        App->>App: audit log: approved, executed
    else revision requested
        H->>App: request revision + feedback
        App->>O: feedback on v1
        O->>App: propose action v2 (status: pending)
        App->>H: render v2 for review
    else rejected outright
        H->>App: reject
        App->>App: audit log: rejected, not executed
    end`,
          },
        ],
      },
      {
        heading: "Seeing every state a single proposal chain can pass through",
        text: [
          "A proposal moves through exactly four states, and a rejection or an approval is terminal while a revision request loops back to a brand new pending state, not to the same one.",
        ],
        snippets: [
          {
            caption: "State chain for one proposal, across revisions",
            lang: "mermaid",
            code: `stateDiagram-v2
    [*] --> pending: v1 proposed
    pending --> approved: reviewer approves
    pending --> rejected: reviewer rejects outright
    pending --> revision_requested: reviewer sends feedback
    revision_requested --> pending: orchestrator proposes v2
    approved --> [*]
    rejected --> [*]`,
          },
        ],
      },
      {
        heading: "Building an orchestrator that gathers from multiple sources",
        text: [
          'Create an orchestrator agent with client.agents.create({ name, description, agentType: "orchestrator", experts, mcpServers }). Its experts might include a facts extraction expert and a coding expert, each pulling from a different source: a referral document, a live encounter, a lab result. The orchestrator\'s job is only to gather what those experts return and produce one structured output describing a single proposed action, for example a fact to persist, a coded value to attach to a chart, or a message to send.',
        ],
        snippets: [
          {
            caption: "An orchestrator with two data-gathering experts",
            lang: "typescript",
            code: `const orchestrator = await client.agents.create({
  name: "Intake review orchestrator",
  description: "Gathers facts and coding suggestions, proposes one action for review",
  agentType: "orchestrator",
  experts: [
    { type: "new", name: "facts-gatherer", description: "Extracts facts from intake sources" },
    { type: "new", name: "coding-suggester", description: "Suggests codes for review, never applies them" },
  ],
});`,
          },
        ],
      },
      {
        heading: "Reading the orchestrator's output as a proposal, not as final content",
        text: [
          "The orchestrator's output is text from client.agents.messageSend, the same extractAgentText pattern already used by the on-demand-agent applet elsewhere in this sandbox. The difference here is what you do with that text: instead of inserting it somewhere as finished content, parse it as a structured proposal describing an action your application has not taken yet.",
        ],
        snippets: [
          {
            caption: "Send a message, parse the result as a proposal",
            lang: "typescript",
            code: `const resp = await client.agents.messageSend(orchestrator.id, {
  message: { role: "user", parts: [{ kind: "text", text: intakePacket }], messageId: crypto.randomUUID(), kind: "message" },
});
const raw = extractAgentText(resp);
const parsed = JSON.parse(raw); // { action: "facts.create", payload: {...} }`,
          },
        ],
      },
      {
        heading: "Wrapping the parsed output in an application-owned Proposal",
        text: [
          'The moment a proposal exists, your application takes over. Wrap it in a Proposal object your own code defines, not an SDK type: a taskId that stays the same across every version so the whole chain can be traced back to one origin, a version number that starts at 1, proposedAt and proposedBy, the action name and its payload, a status field that starts at "pending", and an optional feedback field used only once a revision is requested. Store that object wherever your app keeps state that needs to survive a page reload, since a proposal a reviewer has not yet seen must not disappear if their browser closes.',
        ],
        snippets: [
          {
            caption: "The Proposal shape, defined by your application",
            lang: "typescript",
            code: `interface Proposal {
  taskId: string;
  version: number;
  proposedAt: string;
  proposedBy: string;
  action: string;
  payload: unknown;
  status: "pending" | "approved" | "rejected" | "revision_requested";
  decidedBy?: string;
  decidedAt?: string;
  feedback?: string;
}

const proposal: Proposal = {
  taskId: resp.task?.id ?? crypto.randomUUID(),
  version: 1,
  proposedAt: new Date().toISOString(),
  proposedBy: "facts-gatherer",
  action: parsed.action,
  payload: parsed.payload,
  status: "pending",
};`,
          },
        ],
      },
      {
        heading: "Presenting three options to the reviewer, not two",
        text: [
          "Render the pending proposal to a human reviewer with enough context to decide: what action is being proposed, what data backs it up (the same evidence and source attribution patterns from the coding and facts guides elsewhere in this section apply directly here), and who or what proposed it. The reviewer has three options, not two: approve, reject outright, or request a revision with a short note explaining what is wrong. Nothing else should be a valid transition out of pending, and the UI should make invalid transitions structurally impossible rather than merely discouraged, since a bug that allows a fourth path is exactly what an audit will find later.",
        ],
      },
      {
        heading: "Guarding the approve transition and only then mutating real data",
        text: [
          "Only on approval does your application make the real downstream call: client.facts.create to persist a fact for real (as opposed to the stateless client.facts.extract used to build the proposal), a write to an EHR integration, or a coded value attached to a claim. Guard the transition so a proposal can only move out of pending once; approving an already-approved proposal, or approving a rejected one, should throw rather than silently succeed.",
        ],
        snippets: [
          {
            caption: "A guarded approval that only then triggers the real mutation",
            lang: "typescript",
            code: `async function approve(proposal: Proposal, reviewer: string) {
  if (proposal.status !== "pending") throw new Error("not pending");
  // only now does a real mutation happen
  await client.facts.create(interactionId, { facts: proposal.payload.facts });
  proposal.status = "approved";
  proposal.decidedBy = reviewer;
  proposal.decidedAt = new Date().toISOString();
}`,
          },
        ],
      },
      {
        heading: "Requesting a revision instead of rejecting outright",
        text: [
          "Rejecting a proposal that is 90 percent right just because of one wrong detail throws away the 90 percent that was correct. Requesting a revision keeps the taskId and the history intact while marking this version as revision_requested and attaching the reviewer's feedback, which is what the next step feeds back to the orchestrator.",
        ],
        snippets: [
          {
            caption: "Guard the revision request the same way as approve",
            lang: "typescript",
            code: `function requestRevision(proposal: Proposal, reviewer: string, feedback: string) {
  if (proposal.status !== "pending") throw new Error("not pending");
  proposal.status = "revision_requested";
  proposal.decidedBy = reviewer;
  proposal.decidedAt = new Date().toISOString();
  proposal.feedback = feedback;
}`,
          },
        ],
      },
      {
        heading: "Producing a new version that addresses the feedback",
        text: [
          "Send the previous proposal's payload and its feedback back to the orchestrator as the next message in the same pattern as the original proposal (or, in a simpler implementation, apply the feedback deterministically if it maps to a known correction). Whichever way the new payload is produced, create a new Proposal with the same taskId, version incremented by one, status reset to pending, and no decidedBy or decidedAt yet, since this version has not been reviewed.",
        ],
        snippets: [
          {
            caption: "A new version, same taskId, reset to pending",
            lang: "typescript",
            code: `function reviseProposal(previous: Proposal, newPayload: unknown): Proposal {
  return {
    taskId: previous.taskId,
    version: previous.version + 1,
    proposedAt: new Date().toISOString(),
    proposedBy: previous.proposedBy,
    action: previous.action,
    payload: newPayload,
    status: "pending",
  };
}`,
          },
        ],
      },
      {
        heading: "Appending every version and every transition to one audit log",
        text: [
          "Every transition, proposed, approved, rejected, revision requested, and re-proposed, gets appended to an audit log entry with a timestamp and an actor: the agent or task id involved, and the human identity that decided it where a human was involved. Keep this log append-only and independent of the proposal records it describes, so that even if a proposal version is later deleted or overwritten, the audit entries referencing its taskId still prove the whole chain happened, feedback and all. This is the artifact a CFR Part 11 style review actually asks for, and it is deliberately simple: the value of an audit trail comes from its completeness and immutability, not from its sophistication.",
        ],
        snippets: [
          {
            caption: "One audit entry per transition, across every version",
            lang: "typescript",
            code: `interface AuditEntry { at: string; actor: string; event: string; }

const auditLog: AuditEntry[] = [];

function record(actor: string, event: string) {
  auditLog.push({ at: new Date().toISOString(), actor, event });
}

// record("reviewer@clinic.example", 'requested revision on v1: "missing lab context"');
// record("facts-gatherer", "orchestrator revised proposal to v2 based on feedback");
// record("reviewer@clinic.example", "approved v2, downstream mutation executed");`,
          },
        ],
      },
      {
        heading: "Trying the full revision loop yourself",
        text: [
          "The interactive panel on this page simulates the orchestrator producing a v1 proposal (a full live orchestrator needs external MCP servers specific to your deployment, which this sandbox cannot assume you have configured), then lets you approve it, reject it outright, or send it back with written feedback for a v2, v3, and so on, exactly the way built above, with a real, append-only audit log covering the whole chain rendered underneath. The full application code for the proposal type, the guarded transitions, and the audit log is included in the Copy for LLM bundle for this page.",
        ],
      },
    ],
    considerations: [
      "There is no confirmed SDK task state for awaiting approval. Do not build the gate expecting the framework to pause execution for you; the agent's messageSend call already returned by the time you decide whether to act on it, so the pause has to live in your application, before you call whatever mutates real data.",
      'Make invalid state transitions impossible, not just discouraged. A proposal that is approved twice, or rejected after already being approved, is exactly the kind of bug an auditor will find, so guard every transition (if proposal.status !== "pending", throw) rather than trusting the UI to only ever call it once.',
      "The audit log needs to be append-only and needs to survive independently of the proposal it describes. If a proposal record is later deleted or overwritten, the audit log entries referencing its taskId are what prove the decision, and every revision leading up to it, happened.",
      "Reject is not the absence of an action, it is an action, and so is a revision request. Log both with the same rigor as an approval: who decided, when, and, if you capture one, why. A regulator reviewing the trail cares as much about what was correctly stopped or sent back as what was correctly executed.",
      "Do not let a revision loop run forever. Cap the number of versions a single taskId can accumulate, and route a proposal that is still not acceptable after several revisions to a different, more senior reviewer instead of leaving it in an endless request-revise cycle.",
    ],
  },

  "multi-agent-roles": {
    premise: [
      "A single agent built to handle two different jobs at once, say front desk work (scheduling, patient lookup) and clinical notes (facts, coding), tends to end up with access to every tool it uses for either job, all the time. Nothing stops the front desk half of that agent's reasoning from calling a clinical tool it should never touch, or the clinical half from reaching into a scheduling system it has no business modifying. This is a real production problem, not a hypothetical one, and the fix is not a smarter prompt telling the agent to behave itself. It is a structural fix: build two agents, or two experts under one orchestrator, and give each access to only the tools its own role actually needs.",
      "The Corti Agentic Framework supports this directly, and it is worth being precise about where the mechanism actually lives, since it is easy to assume tool access is a property of the top level agent when it is not. client.agents.create takes an optional experts array, and each entry in that array can carry its own mcpServers list, completely separate from any other expert's list and separate from whatever the orchestrator itself declares. Scoping happens at the expert level. An orchestrator with two experts, each with a distinct mcpServers array, gives you two agents with genuinely disjoint tool access inside one orchestrated system.",
      "Building the two scoped experts is only the first half of this guide. The second half is what makes a role split actually work in production: the orchestrator has to route every incoming request to the right expert, handle a request that genuinely spans both roles by calling both and combining their answers, and recognize a request that matches neither role instead of forcing it onto whichever expert happens to be closest. The role split in this guide, front desk versus clinical notes, is one axis you can cut a multi-agent system along, by department, by who in an organization the agent is standing in for. The other guide in this pair, on narrow-tool specialists, cuts along a different axis, by capability rather than role, so read them together if you are deciding how to structure a system with more than a couple of distinct jobs.",
    ],
    how: [
      {
        heading: "Seeing the two disjoint tool surfaces you are building toward",
        text: [
          "The end state is one orchestrator with two experts, and critically, two separate mcpServers arrays, one per expert, with no overlap between them.",
        ],
        snippets: [
          {
            caption: "Two experts, two disjoint tool surfaces",
            lang: "mermaid",
            code: `flowchart TB
    O[Orchestrator]
    O --> FD[Front desk expert]
    O --> CN[Clinical notes expert]
    FD -.-> S1[scheduling-mcp]
    FD -.-> S2[patient-lookup-mcp]
    CN -.-> S3[facts-mcp]
    CN -.-> S4[coding-mcp]`,
          },
        ],
      },
      {
        heading: "Creating the orchestrator shell first",
        text: [
          'Start with client.agents.create({ name, description, agentType: "orchestrator", experts: [] }), an orchestrator with no experts yet. agentType is optional on the request, but set it explicitly to "orchestrator" so the framework, and anyone reading the configuration later, understands this agent\'s job is to route and coordinate, not to answer directly.',
        ],
        snippets: [
          {
            caption: "An empty orchestrator shell",
            lang: "typescript",
            code: `const agent = await client.agents.create({
  name: "Front desk / clinical orchestrator",
  description: "Routes requests to a scheduling expert or a clinical notes expert",
  agentType: "orchestrator",
  experts: [],
});`,
          },
        ],
      },
      {
        heading: "Choosing inline experts for deployment-specific roles",
        text: [
          'Each entry in experts is either an inline new expert, { type: "new", name, description, systemPrompt?, mcpServers? }, or a reference to a shared or registry expert, { type: "reference", id?, name?, systemPrompt?, config? }. For a role split like this one, inline new experts are usually the right choice, since a front desk expert and a clinical notes expert are specific to this deployment, not generic capabilities you would reuse verbatim across different systems.',
        ],
        snippets: [
          {
            caption: "The shape of one inline expert entry",
            lang: "typescript",
            code: `const frontDeskExpert = {
  type: "new" as const,
  name: "front-desk",
  description: "Scheduling and patient lookup",
  systemPrompt: "Handle scheduling and intake requests only.",
  mcpServers: [] as Corti.AgentsCreateMcpServer[], // filled in next
};`,
          },
        ],
      },
      {
        heading: "Giving the front desk expert its own, narrow mcpServers list",
        text: [
          "Define the front desk expert's mcpServers array with only the MCP servers that expose scheduling and patient lookup tools. Each AgentsCreateMcpServer entry needs name, transportType, authorizationType, and url at minimum, plus whatever authorizationScope, tokenUrl, or token that particular MCP server's auth flow requires.",
        ],
        snippets: [
          {
            caption: "Front desk mcpServers, scheduling and patient lookup only",
            lang: "typescript",
            code: `frontDeskExpert.mcpServers = [
  { name: "scheduling-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/scheduling" },
  { name: "patient-lookup-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/patients" },
];`,
          },
        ],
      },
      {
        heading: "Defining the clinical notes expert with its own, separate list",
        text: [
          "Define the clinical notes expert the same way, with its own systemPrompt focused on facts and coding, and its own mcpServers array containing only the servers that expose facts and coding tools. This array must be a genuinely different array from the front desk expert's, not the same reference reused, or the scoping does nothing.",
        ],
        snippets: [
          {
            caption: "Clinical notes expert, facts and coding only",
            lang: "typescript",
            code: `const clinicalNotesExpert = {
  type: "new" as const,
  name: "clinical-notes",
  description: "Facts extraction and medical coding",
  systemPrompt: "Handle clinical documentation requests only.",
  mcpServers: [
    { name: "facts-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/facts" },
    { name: "coding-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/coding" },
  ] as Corti.AgentsCreateMcpServer[],
};`,
          },
        ],
      },
      {
        heading: "Assembling the full agents.create call",
        text: [
          "With both experts defined, pass them together in the experts array on the same create call. The orchestrator itself can also declare its own mcpServers if there are tools every expert should share, but for a role split like this one, keep the orchestrator's own list empty or minimal; the whole point of the split is that the two experts do not share a tool surface, and a broad shared list on the orchestrator undermines that on the same call meant to enforce it.",
        ],
        snippets: [
          {
            caption: "The full call, two experts, two disjoint tool lists",
            lang: "typescript",
            code: `const agent = await client.agents.create({
  name: "Front desk / clinical orchestrator",
  description: "Routes requests to a scheduling expert or a clinical notes expert",
  agentType: "orchestrator",
  experts: [frontDeskExpert, clinicalNotesExpert],
});`,
          },
        ],
      },
      {
        heading: "Understanding the three shapes a real request can take",
        text: [
          "Once two scoped experts exist, every incoming request falls into one of three shapes: it clearly belongs to one expert, it genuinely spans both, or it belongs to neither. Handling only the first shape and hoping the others do not happen is how a role-scoped system quietly misroutes real traffic. The orchestrator, not your application code, is responsible for telling these three shapes apart, based on how each expert's systemPrompt and description were written when it was created.",
        ],
        snippets: [
          {
            caption: "Three outcomes for one incoming request",
            lang: "mermaid",
            code: `flowchart TD
    Req[Incoming request] --> Route{Orchestrator routes}
    Route -->|matches front desk only| FD[Front desk expert answers]
    Route -->|matches clinical notes only| CN[Clinical notes expert answers]
    Route -->|matches both| Both[Both experts called, answers combined]
    Route -->|matches neither| Esc[Escalate to a human, do not guess]`,
          },
        ],
      },
      {
        heading: "Letting the orchestrator route, not routing manually",
        text: [
          "Once created, messages route to the orchestrator via client.agents.messageSend, and the orchestrator decides which expert handles a given request based on its systemPrompt and the experts' descriptions. Your application code does not need to manually route between the two experts; that routing decision is the orchestrator's job, driven by how each expert was described at creation time.",
        ],
        snippets: [
          {
            caption: "Send one request, let the orchestrator decide",
            lang: "typescript",
            code: `const resp = await client.agents.messageSend(agent.id, {
  message: { role: "user", parts: [{ kind: "text", text: userRequest }], messageId: crypto.randomUUID(), kind: "message" },
});
// the orchestrator, not your code, chose which expert(s) handled this`,
          },
        ],
      },
      {
        heading: "Combining both experts' answers for a request that spans both roles",
        text: [
          "If a request genuinely needs both roles at once, for example a patient asking to reschedule while also asking about a lab result mentioned in their chart, that is the orchestrator's problem to solve by calling both experts and combining their output, not a reason to give one expert both tool sets. The combined answer should make clear which part came from which expert, since a reviewer troubleshooting a bad answer needs to know which expert, and therefore which tool, was responsible for which part of the response.",
        ],
      },
      {
        heading: "Escalating a request that matches neither expert",
        text: [
          "A request that matches neither role, a question entirely outside scheduling and entirely outside clinical documentation, should not get forced onto whichever expert seems closest. Design the orchestrator's prompt and the surrounding application to recognize a no-match case explicitly and escalate it to a human, rather than letting an expert answer something its tools were never scoped to handle.",
        ],
      },
      {
        heading: "Trying the routing decision yourself",
        text: [
          "The interactive panel on this page does two things. First, it toggles between the two shapes built above: tool access scoped per expert, the correct version from the steps above, against one shared tool list handed to every expert, the mistake this pattern exists to prevent. Second, it simulates the orchestrator's routing decision across a set of sample requests, including one that matches only one expert, one that spans both and gets a combined response, and one that matches neither and should escalate. The full expert definitions and the routing logic are included in the Copy for LLM bundle for this page.",
        ],
      },
    ],
    considerations: [
      "The common mistake is defining one mcpServers array and reusing the same reference or the same copy-pasted list for every expert, which produces two experts that read as separate roles in their name and description but have identical tool access underneath. Scoping only works if the arrays are actually different.",
      'agentType: "orchestrator" is optional in the request type, but set it explicitly. An unset agentType leaves the framework and future maintainers to infer the agent\'s role from its experts array, which is fragile once a system grows past two or three experts.',
      "Each mcpServer entry needs its own authorizationType and, depending on that type, an authorizationScope, tokenUrl, or token. Get these values from whatever MCP server you are integrating with, not from a shared secrets file meant for a different tool.",
      "A request that spans both roles is not an edge case to special-case away later; design the combined-answer format from the start, since retrofitting attribution (which part of an already-shipped answer came from which expert) onto an existing system is much harder than building it in from the first version.",
      "A no-match request that gets forced onto the nearest expert anyway is a silent failure mode, not a graceful one. Test explicitly for requests that should escalate, not only for requests that should route cleanly.",
    ],
  },

  "multi-agent-specialists": {
    premise: [
      "The role-scoped guide elsewhere in this section splits a system by department: front desk versus clinical notes. This guide splits it along a different axis entirely: by capability. Instead of two generalist experts each handling a whole area of work, a primary reasoning agent delegates to several narrow specialists, each of which does exactly one thing and has access to exactly the one tool it needs to do that thing. A literature lookup specialist can search, nothing else. A dosage calculator specialist can compute, nothing else. Neither can touch the other's tool, and neither needs to, because the orchestrator, not any individual specialist, is what holds the full picture of a request.",
      "This shape matters for a concrete reason beyond tidiness: a specialist with one narrow tool is much easier to reason about, test, and constrain than a generalist with a broad tool set. If a dosage calculator expert only has access to a calculator MCP server, there is no scenario where it accidentally calls a web search tool and returns an answer sourced from an unverified page instead of an actual computation. The tool surface itself is the guardrail, not a prompt asking the model to stay in its lane.",
      "Three independent specialists sitting next to a hub are only half the picture, though. Most real questions worth routing to a specialist network are compound: they need more than one specialist, in sequence, where the second specialist's job depends on what the first one found. A question about the correct dose of a drug and whether it interacts with something else is really two questions, and answering the second well can depend on the answer to the first. This guide builds the hub-and-spoke network, and then builds the chained delegation on top of it: how the orchestrator calls specialists one after another instead of all at once, and how it combines their separate outputs into one answer.",
    ],
    how: [
      {
        heading: "Seeing the hub-and-spoke shape you are building",
        text: [
          "One orchestrator at the center, several narrow specialists as spokes, and each spoke connected to exactly one tool. Two of the spokes below are built inline for this deployment; the third is pulled from a shared registry instead of being redefined.",
        ],
        snippets: [
          {
            caption: "Hub-and-spoke: one capability per specialist",
            lang: "mermaid",
            code: `flowchart TB
    O[Orchestrator] --> L[literature-search: new]
    O --> C[dosage-calculator: new]
    O --> R[coding-specialist: reference]
    L -.-> WS[web-search-mcp]
    C -.-> CALC[calculator-mcp]
    R -.-> REG[(registry expert:\ninherited mcpServers)]`,
          },
        ],
      },
      {
        heading: "Defining an inline specialist scoped to exactly one tool",
        text: [
          'An inline new expert has the shape { type: "new", name, description, systemPrompt?, mcpServers? }. For a narrow specialist, its mcpServers array should contain exactly one server. A literature search expert needs only a web search MCP server, nothing else in its tool list.',
        ],
        snippets: [
          {
            caption: "A literature search specialist, one tool only",
            lang: "typescript",
            code: `const literatureSearch = {
  type: "new" as const,
  name: "literature-search",
  description: "Looks up drug interactions and clinical literature",
  mcpServers: [
    { name: "web-search-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/search" },
  ] as Corti.AgentsCreateMcpServer[],
};`,
          },
        ],
      },
      {
        heading: "Defining a second inline specialist the same way",
        text: [
          "Repeat the same shape for a second narrow capability, a dosage calculator, with its own single-entry mcpServers array pointing at a calculator MCP server instead of a search one. Nothing here is shared between the two experts; each has its own array from the start.",
        ],
        snippets: [
          {
            caption: "A dosage calculator specialist, one tool only",
            lang: "typescript",
            code: `const dosageCalculator = {
  type: "new" as const,
  name: "dosage-calculator",
  description: "Computes weight-based dosing and unit conversions",
  mcpServers: [
    { name: "calculator-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/calc" },
  ] as Corti.AgentsCreateMcpServer[],
};`,
          },
        ],
      },
      {
        heading: "Listing available registry experts before building a third from scratch",
        text: [
          "Before writing a third specialist inline, check whether one already exists. client.agents.getRegistryExperts() returns an AgentsRegistryExpertsResponse containing a list of AgentsRegistryExpert entries, each with name, description, an optional displayName and displayDescription for presenting it in a UI, an optional mcpServers list already configured for that expert, and an optional configSchema describing what a reference to it may override.",
        ],
        snippets: [
          {
            caption: "Look up a published expert by name",
            lang: "typescript",
            code: `const registryExperts = await client.agents.getRegistryExperts();
const codingSpecialist = registryExperts.experts.find((e) => e.name === "coding-specialist");`,
          },
        ],
      },
      {
        heading: "Referencing the registry expert instead of redefining it",
        text: [
          "A reference expert has the shape { type: \"reference\", id?, name?, systemPrompt?, config? }. Pass id over name when you have it: id wins over name if you supply both, and a stable id keeps working even if the registry expert is later renamed, while a reference by name would start failing to resolve. The optional systemPrompt is an override, appended to or replacing the registry expert's own prompt depending on how it was published, and config is deep merged against that expert's configSchema, so you can adjust its behavior per orchestrator without forking its definition.",
        ],
        snippets: [
          {
            caption: "Reference a registry expert with a config override",
            lang: "typescript",
            code: `const codingReference = {
  type: "reference" as const,
  id: codingSpecialist?.name,
  config: { defaultSystems: ["icd10cm-outpatient", "cpt"] },
};`,
          },
        ],
      },
      {
        heading: "Assembling the orchestrator from a mix of both kinds",
        text: [
          'Create the orchestrator the same way as any other, client.agents.create({ name, description, agentType: "orchestrator", experts }), but populate experts with a straightforward mix: inline new experts for anything specific to this deployment, and reference experts for anything a registry already maintains centrally. There is no restriction on mixing both kinds in the same array; the SDK\'s AgentsCreateAgentExpertsItem type is a union of exactly these two shapes for precisely this reason.',
        ],
        snippets: [
          {
            caption: "The full call, two inline specialists and one reference",
            lang: "typescript",
            code: `const agent = await client.agents.create({
  name: "Clinical reasoning orchestrator",
  description: "Delegates to narrow, single-purpose specialists",
  agentType: "orchestrator",
  experts: [literatureSearch, dosageCalculator, codingReference],
});`,
          },
        ],
      },
      {
        heading: "Recognizing when a question needs more than one specialist",
        text: [
          "A compound question, one drug's dose and its interaction with another drug, or an interaction check plus a coding suggestion for the same chart, cannot be answered by any single spoke acting alone. The orchestrator has to recognize this from the question itself, before calling anything, since calling only one specialist on a two-part question silently drops the second part.",
        ],
        snippets: [
          {
            caption: "One compound question, two specialists needed",
            lang: "mermaid",
            code: `sequenceDiagram
    participant U as User
    participant O as Orchestrator
    participant Lit as literature-search
    participant Calc as dosage-calculator
    U->>O: dose + interaction question
    O->>Lit: check interaction
    Lit-->>O: interaction result
    O->>Calc: compute dose (using patient weight)
    Calc-->>O: dose result
    O->>U: combined answer: dose + interaction`,
          },
        ],
      },
      {
        heading: "Calling specialists in sequence, not only in parallel",
        text: [
          "Some compound questions are independent enough to answer in parallel, but many are not: the second specialist's useful context can depend on what the first one returned. Calling literature-search first to establish whether an interaction exists, then calling dosage-calculator, means the orchestrator can fold the interaction finding into the prompt it sends to the calculator, rather than treating the two calls as unrelated.",
        ],
        snippets: [
          {
            caption: "Sequential delegation, second call informed by the first",
            lang: "typescript",
            code: `const interactionCheck = await client.agents.messageSend(literatureSearch.id, {
  message: { role: "user", parts: [{ kind: "text", text: interactionQuestion }], messageId: crypto.randomUUID(), kind: "message" },
});

const doseCalculation = await client.agents.messageSend(dosageCalculator.id, {
  message: {
    role: "user",
    parts: [{ kind: "text", text: \`\${doseQuestion}\\n\\nKnown interaction context: \${extractAgentText(interactionCheck)}\` }],
    messageId: crypto.randomUUID(),
    kind: "message",
  },
});`,
          },
        ],
      },
      {
        heading: "Combining separate specialist outputs into one answer",
        text: [
          "The final answer a user sees should read as one coherent response, not as two pasted-together outputs, but it should still make clear which claim came from which specialist so a reviewer can trace a wrong answer back to the tool responsible for it. A short combined summary with each specialist's contribution attributed is enough; it does not need its own agent call to produce.",
        ],
        snippets: [
          {
            caption: "Combine attributed outputs into one final answer",
            lang: "typescript",
            code: `const combined = {
  interaction: extractAgentText(interactionCheck),
  dose: extractAgentText(doseCalculation),
  summary: \`\${extractAgentText(doseCalculation)} \${extractAgentText(interactionCheck)}\`,
};`,
          },
        ],
      },
      {
        heading: "Comparing inline and reference definitions side by side",
        text: [
          "The interactive panel on this page lets you click through each spoke in the hub-and-spoke diagram to see its actual expert definition. The two inline specialists show a full definition, name, description, and their single mcpServers entry. The registry-referenced specialist shows a visibly shorter definition, just the reference and its config override, since a reference expert points at something that already exists rather than redescribing it.",
        ],
      },
      {
        heading: "Trying the chained delegation yourself",
        text: [
          "Below the spoke comparison, the same panel lets you pick a compound question and step through it one specialist at a time: call the first specialist, see its output, call the second specialist (informed by the first, exactly as built above), then combine both into a final answer. Watching the trace build up one call at a time is the point: a compound question is a sequence, not a single lookup. The full definitions and the chained delegation logic are included in the Copy for LLM bundle for this page.",
        ],
      },
    ],
    considerations: [
      "A registry expert's config is deep merged against its configSchema, not replaced wholesale. Check the configSchema before assuming a given override field exists; a typo in a config key is silently dropped rather than rejected, since it simply fails to match anything in the schema.",
      "id wins over name when a reference expert supplies both. If a registry expert gets renamed, a reference by id keeps working while a reference by name may start failing to resolve, so prefer id in production configuration and reserve name for quick prototyping.",
      "A narrow specialist is only as narrow as its mcpServers list. Double check that an inline new expert's mcpServers array really does contain exactly one server; it is easy to copy a broader list from another expert during development and forget to trim it down.",
      "Not everything needs to be a registry expert. Something genuinely specific to one deployment, like a literature search scoped to one clinic's preferred medical databases, belongs inline as a new expert. Publish to the registry only what is actually meant to be reused across multiple orchestrators or customers.",
      "Sequential delegation costs more time and more calls than calling every specialist in parallel. Reserve it for questions where the second call genuinely benefits from the first call's output; a compound question whose two halves are truly independent does not need to wait for one before starting the other.",
    ],
  },

  "soap-note-generator": {
    premise: [
      "Once a note or transcript exists, turning it into a structured document is a single call, not a pipeline. client.documents.generate takes plain context (no interaction required) and a reference to a stored template, and returns a structured document with no data retention, this is the base pattern every other document-generation applet in this sandbox replicates with a different default template.",
    ],
    how: [
      "Fetch the tenant's templates with client.documents.templates.list() and resolve the one you want by name or id. Pass outputLanguage, templateRef.templateId, and a context array (here, a single { type: \"text\", text } entry) to client.documents.generate. The response's document.stringDocument is a section-name to section-text map; render its entries in the order the API returned them.",
    ],
    snippets: [
      {
        caption: "Generate a document with no interaction and no persistence",
        lang: "typescript",
        code: `const client = new CortiClient({ environment: sdkEnvironment, auth: authConfig });
const { document, usageInfo } = await client.documents.generate({
  outputLanguage: "en",
  templateRef: { templateId },
  context: [{ type: "text", text: note }],
});

Object.entries(document.stringDocument); // [ [sectionName, sectionText], ... ]`,
      },
    ],
  },

  "discharge-summary": {
    premise: [
      "The same client.documents.generate call as soap-note-generator, aimed at a discharge-summary template instead, for turning inpatient notes, treatment records, or a full encounter transcript into a structured discharge summary.",
    ],
    how: [
      "Resolve the discharge-summary template by name (falling back to the tenant's first template if none matches), then call client.documents.generate with the pasted note as a single text context entry. Nothing about the call changes from the base pattern, only which template is referenced.",
    ],
    snippets: [
      {
        caption: "Default to whichever stored template matches by name",
        lang: "typescript",
        code: `const template = templates.find((t) => t.name.toLowerCase().includes("discharge")) ?? templates[0];`,
      },
    ],
  },

  "referral-letter": {
    premise: [
      "The same client.documents.generate call as soap-note-generator, aimed at a referral-letter template, for turning a clinical summary, consultation notes, or a visit transcript into a structured referral letter.",
    ],
    how: [
      "Resolve the referral-letter template by name, then call client.documents.generate with the pasted note as a single text context entry, same shape as every other document-generation applet in this sandbox.",
    ],
    snippets: [
      {
        caption: "Default to whichever stored template matches by name",
        lang: "typescript",
        code: `const template = templates.find((t) => t.name.toLowerCase().includes("referral")) ?? templates[0];`,
      },
    ],
  },

  "procedure-note": {
    premise: [
      "The same client.documents.generate call as soap-note-generator, aimed at a procedure-note template, for turning a procedure dictation, operative notes, or a free-text procedural description into a structured procedure note.",
    ],
    how: [
      "Resolve the procedure-note template by name, then call client.documents.generate with the pasted note as a single text context entry, same shape as every other document-generation applet in this sandbox.",
    ],
    snippets: [
      {
        caption: "Default to whichever stored template matches by name",
        lang: "typescript",
        code: `const template = templates.find((t) => t.name.toLowerCase().includes("procedure")) ?? templates[0];`,
      },
    ],
  },

  "chart-prep-workflow": {
    premise: [
      "A raw transcript is not a chart. Getting from one to the other is naturally three distinct jobs, extracting facts, drafting a note, and suggesting codes, and each job does better with its own narrowly-scoped agent than one agent asked to do all three at once.",
    ],
    how: [
      "Create (or reuse) three agents via client.agents.create, each with its own name and systemPrompt: a Fact Extractor, a Note Drafter, and a Code Suggester. Send the raw transcript to the first agent, then feed each agent's text response into the next agent's message as plain text. No shared conversation context is needed, behavior lives entirely in each stage's prompt.",
    ],
    snippets: [
      {
        caption: "Each stage's output becomes the next stage's input",
        lang: "typescript",
        code: `let text = transcript;
for (const stage of [factExtractor, noteDrafter, codeSuggester]) {
  const agentId = await ensureAgent(client, stage);
  text = await sendAgentMessage(client, agentId, text);
}`,
      },
    ],
  },

  "prior-auth-workflow": {
    premise: [
      "Drafting a prior authorization request is really three narrower jobs: organizing the clinical context, writing a payer-facing justification, and formatting the final request. Splitting them across three agents keeps each prompt focused instead of asking one agent to reason about structure and persuasive writing at the same time.",
    ],
    how: [
      "Same three-agent sequential pattern as chart-prep-workflow: a Context Organizer extracts diagnosis, findings, prior treatments, requested service, and urgency; a Justification Writer turns that into a medical necessity statement; a Request Formatter combines both into the final structured request.",
    ],
    snippets: [
      {
        caption: "Three narrowly-scoped agents, chained by plain text",
        lang: "typescript",
        code: `const context = await run(contextOrganizer, clinicalInput);
const justification = await run(justificationWriter, context);
const request = await run(requestFormatter, justification);`,
      },
    ],
  },

  "qa-reviewer-workflow": {
    premise: [
      "A draft-review-revise loop only works if the reviewer isn't the same agent that wrote the draft, an agent asked to critique its own output tends to rationalize it instead. Splitting drafting, reviewing, and revising across three separately-prompted agents keeps the review honest.",
    ],
    how: [
      "A Note Drafter produces a SOAP note from raw input, a Note Reviewer inspects it for missing elements, inconsistencies, and compliance gaps, and a Note Reviser turns those findings into specific corrections plus follow-up questions for the clinician, explicitly instructed not to fabricate facts to fill genuine gaps.",
    ],
    snippets: [
      {
        caption: "The reviewer only ever sees the draft, never the original input",
        lang: "typescript",
        code: `const draft = await run(noteDrafter, rawInput);
const issues = await run(noteReviewer, draft);
const revision = await run(noteReviser, issues);`,
      },
    ],
  },

  "note-diff": {
    premise: [
      "The same note, phrased two different ways, can produce noticeably different structured output from the same template. Seeing that side by side, section by section, is more convincing than reading about it, and it is the fastest way to sanity check a template against real variation in how notes get written.",
    ],
    how: [
      "Fire two independent client.documents.generate calls in parallel, one per note, same template and output language. Align the two stringDocument maps by taking the union of both sets of section names, then render one row per section name with note A's text on the left and note B's on the right; a section missing on one side renders as a dashed placeholder instead of blank space.",
    ],
    snippets: [
      {
        caption: "Two independent calls, aligned by section-name key",
        lang: "typescript",
        code: `const [a, b] = await Promise.all([
  generateFromText(client, templateId, noteA, language),
  generateFromText(client, templateId, noteB, language),
]);
const sections = new Set([
  ...Object.keys(a.document.stringDocument),
  ...Object.keys(b.document.stringDocument),
]);`,
      },
    ],
  },

  "batch-processor": {
    premise: [
      "A single note through client.documents.generate is a demo. A backlog of notes through the same template is the actual workload most teams have, and the only thing that changes is fan-out: the same call, run many times, independently, without one slow note blocking the rest.",
    ],
    how: [
      "Split the pasted text on lines that are exactly ---, trim and drop empty entries, then fire one client.documents.generate call per note via Promise.allSettled so one failure doesn't take down the batch. Each note renders as its own collapsible card with its own pending/done/error state. The chosen template and output language persist to localStorage per API client via the shared config-store, so the next session remembers the last choice.",
    ],
    snippets: [
      {
        caption: "Independent, fault-isolated calls per note",
        lang: "typescript",
        code: `const notes = text.split(/^---$/m).map((n) => n.trim()).filter(Boolean);
const results = await Promise.allSettled(
  notes.map((note) => generateFromText(client, templateId, note, language)),
);`,
      },
    ],
  },

  "template-showdown": {
    premise: [
      "Choosing a template for a new workflow usually means guessing from its name and description. Running one real note through every template on the tenant at once, side by side, turns that guess into a comparison you can actually see.",
    ],
    how: [
      "Fetch every template with client.documents.templates.list(), then kick off one client.documents.generate call per template, all against the same note and language. Update each template's own card independently as its promise settles, rather than waiting for the slowest template before rendering anything.",
    ],
    snippets: [
      {
        caption: "Each template's card updates independently as it resolves",
        lang: "typescript",
        code: `templates.forEach((t) => {
  generateFromText(client, t.id, note, language)
    .then((r) => setResults((prev) => ({ ...prev, [t.id]: { status: "done", result: r } })))
    .catch((e) => setResults((prev) => ({ ...prev, [t.id]: { status: "error", error: e } })));
});`,
      },
    ],
  },

  "note-to-code": {
    premise: [
      "The simplest possible use of client.codes.predict: no interaction, no review loop, just a note, a target coding system list, and the two result buckets the API already gives you split into two tables.",
    ],
    how: [
      "Toggle target systems from CODING_SYSTEMS, call client.codes.predict with the note as a single text context entry, and render result.codes as a Primary codes table and result.candidates as a Lower-confidence candidates table.",
    ],
    snippets: [
      {
        caption: "One call, two result buckets",
        lang: "typescript",
        code: `const { codes, candidates, usageInfo } = await client.codes.predict({
  system: Array.from(selectedSystems),
  context: [{ type: "text", text: note }],
});`,
      },
    ],
  },

  "code-crosswalk": {
    premise: [
      "A note that supports a diagnosis code often supports a procedure code too, and requesting both in separate calls just doubles your latency for no reason, system accepts an array, so one call can target every coding system you care about at once.",
    ],
    how: [
      "Send every selected coding system in a single client.codes.predict call, then group the combined codes and candidates client-side by their system field into one table per system that actually returned a result. Each row shows the code, its description, and any alternatives the model also considered for that same evidence.",
    ],
    snippets: [
      {
        caption: "One call, many systems, grouped client-side",
        lang: "typescript",
        code: `const response = await client.codes.predict({ system: selectedSystems, context });
const bySystem = response.codes.reduce((acc, c) => {
  (acc[c.system] ??= []).push(c);
  return acc;
}, {} as Record<string, typeof response.codes>);`,
      },
    ],
  },

  "code-validator": {
    premise: [
      "A coder's proposed code list and the model's predicted code list are two independent opinions, and the gap between them is where review time should actually go. Rather than eyeballing two lists, predict against the same note and diff the two sets automatically.",
    ],
    how: [
      "Parse the user's proposed codes (one system:code per line) into a set, call client.codes.predict for the same note, then compare by that same system:code key: codes in both sets are confirmed, codes the API found but the user didn't propose are missed, and proposed codes absent from the API's codes are unsupported (labeled separately if they at least show up as a low-confidence candidate).",
    ],
    snippets: [
      {
        caption: "A three-way set comparison keyed by system:code",
        lang: "typescript",
        code: `const key = (c: { system: string; code: string }) => \`\${c.system}:\${c.code}\`;
const apiKeys = new Set(response.codes.map(key));
const confirmed = [...proposed].filter((k) => apiKeys.has(k));
const missed = response.codes.filter((c) => !proposed.has(key(c)));
const unsupported = [...proposed].filter((k) => !apiKeys.has(k));`,
      },
    ],
  },

  "evidence-coding": {
    premise: [
      "A predicted code is easy to distrust until you can see exactly which words in the note produced it. evidences[] already carries that pointer, character offsets back into the input, this applet spends it on the most direct possible use: click a code, see the passage.",
    ],
    how: [
      "Call client.codes.predict as usual, then for the selected code merge its evidences[] start/end offsets (de-duping overlaps), and slice the original note into plain and highlighted segments at those boundaries. Selecting a different code re-slices the note against that code's own spans; deselecting returns to plain text.",
    ],
    snippets: [
      {
        caption: "Slice the note at a code's own evidence span boundaries",
        lang: "typescript",
        code: `const spans = mergeSpans(selectedCode.evidences.map((e) => [e.start, e.end]));
const segments = segmentNote(note, spans); // [{ text, highlighted: boolean }, ...]`,
      },
    ],
  },

  "encounter-tracker": {
    premise: [
      "The same diagnosis code showing up in every visit is a much stronger signal than one that appears once, and the reverse is just as informative, a code that vanishes after one visit might have resolved or might have been miscoded. Seeing code persistence across several encounters at once needs a matrix, not a list.",
    ],
    how: [
      "Predict codes for each encounter's note independently and in parallel, then union every system:code that appears across all the results and render one matrix row per code, one column per encounter, marking presence in each. Rows where the code is present in every encounter get a distinct color from rows where it is only partially present.",
    ],
    snippets: [
      {
        caption: "Union of per-encounter code sets, keyed by system:code",
        lang: "typescript",
        code: `const perEncounter = await Promise.all(
  encounters.map((e) => client.codes.predict({ system, context: [{ type: "text", text: e.note }] })),
);
const allKeys = new Set(perEncounter.flatMap((r) => r.codes.map(key)));`,
      },
    ],
  },

  "scribe-like-me": {
    premise: [
      "A generic clinical-note template produces correct but generic prose. A clinician who has been documenting for years already has a personal style, terse fragments or full narrative, particular abbreviations, a habit of quoting the patient's own words, and template prompts that don't reflect any of that will keep producing notes that read like nobody's actual handwriting. The fix isn't a bigger prompt, it's letting the clinician's own historical notes drive the prompt.",
      "This applet utilizes two agents in sequence to address this challenge: a reviewer that reads a batch of historical notes and describes the style in prose, and a tailor that turns that description into concrete Guided Documents section overrides against a real Corti Standard template. Neither agent alone does the job — a single agent asked to both interpret style and emit valid override JSON tends to blend the two badly.",
    ],
    how: [
      "Both agents are created once (client.agents.create) and reused for every persona; nothing persona-specific lives in either agent's systemPrompt. The Reviewer's message is just the clinician's name, specialty, and historical notes, and it returns a plain-text style summary. The Tailor's message is that summary plus a JSON shortlist of candidate templates (each with its sections' default contentPrompt/writingStylePrompt), and it must return one override per section, grounded in a rationale, as strict JSON.",
      "Overrides are applied at generation time via documents.generate's templateRef.overrides — Corti's Path 2 pattern — so the base template is never mutated and a plain, override-free call against the same template produces the out-of-the-box baseline for comparison. Generating the same transcript under two personas' saved profiles, side by side, is the actual test of whether the tailoring did anything.",
    ],
    snippets: [
      {
        caption: "Two agents, one pipeline",
        lang: "typescript",
        code: `const reviewerId = await ensureAgent(client, STYLE_REVIEWER_AGENT);
const styleSummary = await sendAgentMessage(client, reviewerId, notesBlock);

const tailorId = await ensureAgent(client, TEMPLATE_TAILOR_AGENT);
const raw = await sendAgentMessage(client, tailorId, \`\${styleSummary}\\n\${JSON.stringify(candidates)}\`);
const { templateId, sections } = JSON.parse(raw);`,
      },
      {
        caption: "Tailored vs. out-of-the-box, same transcript",
        lang: "typescript",
        code: `const tailored = await client.documents.generate({
  outputLanguage, context: [{ type: "text", text: transcript }],
  templateRef: { templateId, overrides: { sections } },
});
const baseline = await client.documents.generate({
  outputLanguage, context: [{ type: "text", text: transcript }],
  templateRef: { templateId }, // no overrides
});`,
      },
    ],
    considerations: [
      "The Tailor agent must return strict JSON with no surrounding prose — parsing falls back to extracting the outermost {...} block, but a systemPrompt that drifts (e.g. after manually editing the agent in Console) can still break this.",
      "Overrides are per-field partial on instructions but wholesale on outputSchema — this applet only touches contentPrompt/writingStylePrompt/heading, never outputSchema, so it never risks that all-or-nothing replacement.",
      'Candidate templates are restricted to source: "corti" so the demo works the same regardless of what custom templates already exist in the tenant; a real integration would likely also offer the tenant\'s own templates.',
    ],
  },

  "real-time-nudge": {
    premise: [
      "CDI programs depend on physician queries to close documentation gaps, but those queries typically arrive after documentation when the clinician no longer has the encounter fresh in mind. Real-time nudges shift the feedback upstream to the point of documentation, surfacing subtle 'chirps' when specificity is missing: CHF without type or acuity, diabetes without type, CKD without a stage.",
      "The key design principle is that nudges are never hard-stop alerts. They don't block the clinician's flow — in this implementation they appear alongside the editor, can be dismissed, and auto-resolve when the text changes to satisfy the rule's resolve criteria.",
    ],
    how: [
      "The editor is a contentEditable surface with the same dictation core as the dictation suite — push-to-talk, voice commands, interim transcripts. The nudge engine wraps the editor with a cadence detector that watches for sentence completions (period + space), line breaks, paragraph breaks, and edits.",
      "After a 3-second debounce from the last cadence event, the engine reads the editor's text and runs it through the active rule set. Each rule has trigger criteria and resolve criteria. When the trigger fires and the nudge isn't already active, a nudge card appears in the side panel. When the resolve criteria are met, the nudge auto-resolves with a checkmark.",
      "Text rules use a `conditions` array with a `mode` of `any` (OR) or `all` (AND), plus a `none` exclusion list. Rule `contains` values support a grammar model: `[optional]` makes a word optional in a phrase, `(A|B|C)` is an alternation (one must match), `{textMatch.conditions}` self-references the rule's own trigger terms, and space-separated groups are AND-ed. For count-based criteria like SIRS, `groups` defines named criterion groups with a `minGroups` threshold (e.g., 2+ of 4 SIRS criteria).",
      "SNOMED and ICD-10 rules use a Corti Agentic Framework agent for evaluation. The text is first sent to `client.codes.predict()` with the appropriate system(s) (`snomedctint` and/or `icd10cm-outpatient`), scoped by a `filter` built from the active code rules. When only one system is active, the filter scopes prediction to that system's codes; when both are active, the call batches both systems with no filter (the API applies the same filter to all systems, so system-specific codes would cause validation failure). The predicted codes and text are then sent to the agent, which evaluates each rule's code conditions using hierarchy-aware reasoning (`is-a` / `descendent-of` / `=` operators) and contextual awareness (negation, family history, ruled-out conditions). The agent returns which rules trigger and which resolve as JSON.",
      "Prompt rules use a separate prompt evaluator agent with a fixed system prompt. The user's custom prompt text (max 500 chars) is sent as message data, never as a system prompt. The agent returns matched criteria IDs and an optional dynamic message per match, shown in the nudge panel when the rule has no static message. Prompt and code agent calls run in parallel.",
      "Text rules evaluate instantly via the grammar engine (no API call). Code and prompt rules show when their agents respond. If an agent call fails, text rules still display and the error appears in the config tab. Predict, agent, and prompt results are cached — predict by text + filter + systems hash, agent by text + codes + rule IDs, prompt by text + criteria + prompt hashes — with config toggles to disable caching for testing.",
      "Rules persist per API client (clientId:tenant) via the same ConfigStore pattern as replacements and terms. Eight seed rules ship built-in: CHF specificity (text), CHF specificity (SNOMED), CHF specificity (ICD-10), diabetes type, anemia specification, sepsis clarification, CKD stage, and a prompt-only demo rule. A dedicated query builder (`NudgeRuleEditor`) lets users create custom rules with collapsible trigger/resolve sections, an add-component dropdown (text matching / SNOMED criteria / ICD-10 criteria / custom prompt), mode selectors, and operator dropdowns. Built-in rules can be viewed in read-only mode.",
    ],
    snippets: [
      {
        caption: "Cadence-based evaluation (not timer-based)",
        lang: "typescript",
        code: `export function classifyInsertion(insertedText: string): CadenceEvent["type"] {
  if (insertedText.includes("\\n\\n")) return "paragraph";
  if (insertedText.includes("\\n")) return "line-break";
  if (/\\.\\s/.test(insertedText) || insertedText.endsWith(".")) return "sentence";
  return "edit";
}`,
      },
      {
        caption: "Grammar — alternation + self-reference + AND groups",
        lang: "typescript",
        code: `// "[congestive] heart failure" — "congestive" is optional
// "(systolic|diastolic|combined systolic diastolic)" — one must match
// "(textMatch.conditions)" — expands to the rule's own trigger.conditions
// Space-separated groups are AND-ed: all must match
trigger: {
  textMatch: {
    conditions: [{ contains: "[congestive] heart failure" }, { contains: "CHF" }],
    mode: "any",
    none: [{
      contains: "(systolic|diastolic|combined systolic diastolic) " +
                "(acute|chronic|acute on chronic) (textMatch.conditions)",
    }],
  },
}`,
      },
      {
        caption: "SNOMED criteria — agent-assisted evaluation",
        lang: "typescript",
        code: `trigger: {
  snomed: {
    conditions: [
      { code: "84114007", op: "is-a", condition: "present" },
      { code: "84114007", op: "descendent-of", condition: "absent" },
    ],
    mode: "all",
  },
}
// Agent evaluates is-a/descendent-of using SNOMED hierarchy.
// Negation, family history, and ruled-out conditions do not trigger.`,
      },
      {
        caption: "ICD-10 criteria — exact match trigger, specific resolve",
        lang: "typescript",
        code: `trigger: {
  icd10: {
    conditions: [
      { code: "I50", op: "=", condition: "present" },
      { code: "I50.9", op: "=", condition: "present" },
    ],
    mode: "any",  // I50 or I50.9 (unspecified)
  },
}
resolve: {
  icd10: {
    conditions: [
      { code: "I50.21", op: "=", condition: "present" },
      { code: "I50.22", op: "=", condition: "present" },
      // ... I50.23, I50.31-33, I50.41-43
    ],
    mode: "any",  // any specific subtype resolves
  },
}
// .0 unspecified sub-codes (I50.20, I50.30) do NOT resolve.`,
      },
      {
        caption: "Adaptive predict system selection",
        lang: "typescript",
        code: `// Only SNOMED rules → snomedctint + SNOMED filter
// Only ICD-10 rules → icd10cm-outpatient + ICD-10 filter
// Both → batched, no filter (API applies same filter to all systems;
//   system-specific codes cause validation failure)
const params = buildPredictParams(rules, snomedEnabled, icd10Enabled);
// params = { systems: ["snomedctint", "icd10cm-outpatient"], filter: undefined }`,
      },
      {
        caption: "Count-based criteria — SIRS groups with minGroups",
        lang: "typescript",
        code: `trigger: {
  textMatch: {
    conditions: [{ contains: "UTI" }, { contains: "pneumonia" }, { contains: "cellulitis" }],
    mode: "any",
    none: [{ contains: "sepsis" }, { contains: "septic shock" }, { contains: "SIRS" }],
    groups: [
      { name: "Temperature", criteria: { conditions: [{ contains: "fever" }, { contains: "temperature 38" }], mode: "any" } },
      { name: "Tachycardia", criteria: { conditions: [{ contains: "tachycardia" }, { contains: "heart rate 9" }], mode: "any" } },
      { name: "Tachypnea", criteria: { conditions: [{ contains: "tachypnea" }], mode: "any" } },
      { name: "WBC", criteria: { conditions: [{ contains: "leukocytosis" }, { contains: "WBC 1" }], mode: "any" } },
    ],
    minGroups: 2,
  },
}`,
      },
    ],
    considerations: [
      "Text rules use a grammar model — no API calls, no credits, fully deterministic. Code rules (SNOMED/ICD-10) require the predict API (credits per call) and optionally the agent (no extra credits beyond agent usage). Prompt rules use a separate agent but no predict call.",
      "The grammar supports `[optional]`, `(A|B|C)` alternation, `{textMatch.conditions}` self-references, AND-ed space-separated groups, and `groups`/`minGroups` for count-based criteria. It is not a full regex engine — just enough for common CDI query patterns.",
      "SNOMED and ICD-10 predict use `client.codes.predict()` via the SDK. The system identifiers (`snomedctint`, `icd10cm-outpatient`) are cast to `Corti.CommonCodingSystemEnum[]` at the call boundary since the SDK's enum does not include SNOMED-CT variants.",
      "The same agent evaluates both SNOMED and ICD-10 criteria. If reasoning quality degrades when handling both code systems, a separate ICD-10 agent may be needed (see PRD Section 11).",
      "When both SNOMED and ICD-10 rules are active, the predict call batches both systems with no filter — the API applies the same filter to all requested systems, so a filter with SNOMED codes would cause ICD-10 validation to fail.",
      "The agent provides hierarchy-aware reasoning (`is-a`/`descendent-of`) and contextual awareness (negation, family history, ruled-out conditions) without a client-side hierarchy cache. Agent results are parsed from JSON returned by `client.agents.messageSend`.",
      "Dismissed nudges stay dismissed for the session even if the trigger re-matches — they only re-fire if the text changes such that the trigger was removed and re-added.",
      "The cadence detector hooks into the same onTranscript handler as dictation: a final transcript insertion triggers an 'edit' cadence event, starting the debounce cycle.",
      "SNOMED code details (predicted code, supporting evidence, alternative codes) are available via an info button on nudge cards that opens a popover. SNOMED browser and ICD-10 index links are in the rule editor toolbar.",
      "A debug log card shows timestamped entries for predict request/response (with full request body), agent request/response, prompt request/response, and nudge state changes. Export as JSON.",
    ],
  },
  "command-genie": {
    premise: [
      "Configuring voice commands and nudge rules requires understanding the data model — action kinds, criteria types, operators, grammar syntax. Command Genie removes that barrier: describe the intent in plain language and a Corti Agentic Framework agent generates the structured configuration for you.",
      "Two modes share one dictation surface. In command mode, the user enters trigger phrases and an action description — the agent produces a ManagedCommand that fires immediately when dictated. In nudge mode, the user describes a trigger condition and a nudge message — the agent produces a NudgeRule that runs through the full evaluation pipeline (text matching, SNOMED/ICD-10 code prediction, prompt-based evaluation).",
    ],
    how: [
      "The user selects a mode and enters two text inputs: trigger phrases/description and the desired action/message. Clicking 'Grant my wish' sends a JSON message to a Corti Agentic Framework agent named 'Command Genie.'",
      "The agent's fixed system prompt includes schema examples for all 11 command action kinds (insert_text, script, delete_last, keypress, etc.) and all 4 nudge criteria types (textMatch, snomed, icd10, prompt). It returns ONLY valid JSON — no prose.",
      "The response is validated in genieModel.ts: ID format (alphanumeric + _-), phrases non-empty, action kind known with required fields, criteria types structurally correct. Invalid responses surface an error message; valid ones are saved to the shared stores.",
      "Generated commands are saved to commandStore (the same store used by the Dictation commands applet). Generated nudges are saved to nudgeRuleStore (the same store used by the Real-time nudge applet). Both persist per API client (clientId:tenant) and appear in the respective applets.",
      "In nudge mode, the full evaluation pipeline from the real-time-nudge applet is reused: cadence detector watches the editor for sentence completions and edits, debounces 3 seconds, then evaluates text rules instantly, sends SNOMED/ICD-10 codes to a prediction API, and routes code/prompt criteria to Corti agents for hierarchy-aware reasoning.",
      "The success message reads: 'Your wish is my command! Command/nudge title that does x is ready for use.' The user can immediately test by dictating into the live editor.",
    ],
    snippets: [
      {
        caption: "Build the genie message and send it to the agent",
        lang: "typescript",
        code: `const message = buildGenieMessage(mode, input1, input2);
// → '{"mode":"command","input1":"insert plan, new plan","input2":"insert a new paragraph with Plan:"}'

const responseText = await sendAgentMessage(client, agentId, message);
const result = parseGenieResponse(responseText, mode);
// → { ok: true, mode: "command", command: { id: "insert_plan", phrases: [...], action: {...} } }`,
      },
      {
        caption: "Agent system prompt — command action kinds",
        lang: "typescript",
        code: `// The fixed system prompt lists all 11 action kinds:
// insert_text: { kind: "insert_text", text: "..." }
// script: { kind: "script", code: "..." }
// delete_last: { kind: "delete_last" }
// new_paragraph: { kind: "new_paragraph" }
// capitalize_last: { kind: "capitalize_last" }
// keypress: { kind: "keypress", combos: [{ meta: true, key: "b" }] }
// noop: { kind: "noop", note: "..." }
// insert_template/select_enum/select_wildcard/format: { kind: "...", variableKey: "..." }`,
      },
      {
        caption: "Agent system prompt — nudge criteria types",
        lang: "typescript",
        code: `// The prompt lists all 4 criteria types:
// textMatch: { conditions: [{contains:"heart failure"}], mode:"any", none:[...] }
// snomed: { conditions: [{code:"84114007",op:"=",condition:"present"}], mode:"all" }
// icd10: { conditions: [{code:"I50.9",op:"=",condition:"present"}], mode:"all" }
// prompt: { prompt: "Check if the note specifies CHF type." }
// Cross-criteria: { mode:"all", textMatch:{...}, snomed:{...} }`,
      },
    ],
    considerations: [
      "The agent's system prompt is fixed (not user-editable) — a deliberate safety boundary. User inputs are sent as data, not instructions.",
      "The agent has no experts, no MCP servers, no tools — it can only generate JSON text.",
      "The script action kind runs in a sandboxed new Function() scope — the same mechanism used by the existing command dispatch system. The agent generates the script, not the user.",
      "Generated items persist to the shared stores and appear in the Dictation commands and Real-time nudge applets for the same API client (clientId:tenant).",
      "Agent calls require standard API client credentials (full-scope token via /api/corti proxy). Limited-scope streaming tokens do not grant access to agent endpoints — a 403 error is expected.",
      "In nudge mode, the full evaluation pipeline (cadence detector, predict, agent, prompt) is reused from the real-time-nudge applet. Enable SNOMED/ICD-10 and agent evaluation in the config dialog (wrench button).",
      "The genie history is in-memory session state — it survives remount but not page refresh.",
      "Validation rejects invalid JSON, wrong type field, bad ID format, empty phrases, unknown action kinds, missing required fields, and malformed criteria — the error message is shown without saving.",
    ],
  },
};

export function getAppletWriteup(id: string): AppletWriteup | undefined {
  return WRITEUPS[id];
}
