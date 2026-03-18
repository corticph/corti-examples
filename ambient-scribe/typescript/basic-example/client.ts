/**
 * client.ts — Corti SDK streaming integration for AmbientScribe.
 *
 * Provides a single entry point — startSession() — that:
 *   1. Creates a CortiClient with a stream-scoped access token.
 *   2. Connects to the Corti streaming WebSocket.
 *   3. Acquires audio depending on the selected mode.
 *   4. Streams audio to Corti in 200 ms chunks.
 *   5. Emits transcript and fact events via callbacks.
 *
 * This module has no DOM dependencies — all UI wiring lives in index.html.
 */

import { CortiClient, type Corti } from "@corti/sdk";
import {
  getMicrophoneStream,
  getRemoteParticipantStream,
  getDisplayMediaStream,
  mergeMediaStreams,
} from "./audio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Mode = "single" | "virtual";

/** How the remote participant's audio is captured in virtual mode. */
export type RemoteSource = "webrtc" | "display";

export interface SessionOptions {
  accessToken: string;
  interactionId: string;
  tenantName: string;
  environment: string;
  mode: Mode;
  remoteSource?: RemoteSource;
  peerConnection?: RTCPeerConnection;
  onTranscript?: (data: unknown) => void;
  onFact?: (data: unknown) => void;
}

export interface ActiveSession {
  endConsultation: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// startSession
// ---------------------------------------------------------------------------

/**
 * Starts a streaming session in the chosen mode.
 *
 * 1. Creates a CortiClient using the scoped access token from the server.
 * 2. Connects to the streaming WebSocket via client.stream.connect().
 * 3. Acquires the appropriate audio stream(s) depending on the mode.
 * 4. Pipes audio to Corti in 200 ms chunks via MediaRecorder.
 * 5. Fires onTranscript / onFact callbacks for incoming events.
 *
 * @returns An object with an `endConsultation()` method for cleanup.
 */
export async function startSession(
  options: SessionOptions
): Promise<ActiveSession> {
  const {
    accessToken,
    interactionId,
    tenantName,
    environment,
    mode,
    remoteSource = "webrtc",
    peerConnection,
    onTranscript,
    onFact,
  } = options;

  // -- 1. Create a client scoped to streaming only -------------------------
  const client = new CortiClient({
    environment,
    tenantName,
    auth: {
      accessToken, // Token with "stream" scope only
    },
  });

  // With a stream-scoped token these would fail:
  //   await client.interactions.list();                // outside scope
  //   await client.transcribe.connect({ id: "..." });  // outside scope

  // -- 2. Set up the streaming configuration -------------------------

  const participants = mode === "single" ? [
    {
      channel: 0,
      role: "multiple"
    }
  ] : [
    {
      channel: 0,
      role: "doctor"
    },
    {
      channel: 1,
      role: "patient"
    }
  ];

  const configuration = {
    transcription: {
      primaryLanguage: "en-US",
      isMultichannel: mode !== "single",
      participants,
    },
    mode: {
      type: "facts",
      outputLocale: "en-US",
    },
  } as Corti.StreamConfig;

  // -- 3. Connect to the Corti streaming WebSocket -------------------------
  const streamSocket = await client.stream.connect({ id: interactionId, configuration });

  // -- 4. Acquire audio depending on mode ----------------------------------
  //    "single"  → just the local microphone
  //    "virtual" → local mic + remote audio (WebRTC or display), merged

  const microphoneStream = await getMicrophoneStream();
  console.log(`[${mode}] Microphone stream acquired`);

  // audioStream is what we feed into MediaRecorder.
  // endMergedStream is only set when we merge (virtual mode).
  let audioStream: MediaStream;
  let remoteStream: MediaStream | undefined;
  let endMergedStream: (() => void) | undefined;

  if (mode === "virtual") {
    // Get the remote participant's audio from the chosen source.
    if (remoteSource === "display") {
      // Screen / tab capture — the browser will show a picker dialog.
      // Useful when the video-call runs in another tab and you don't
      // have direct access to the peer connection.
      remoteStream = await getDisplayMediaStream();
      console.log("[virtual:display] Display media stream acquired");
    } else {
      // WebRTC — pull audio tracks from an existing peer connection.
      if (!peerConnection) {
        throw new Error(
          'Virtual mode with remoteSource "webrtc" requires an RTCPeerConnection'
        );
      }
      remoteStream = getRemoteParticipantStream(peerConnection);
      console.log("[virtual:webrtc] Remote participant stream acquired");
    }

    // Merge: channel 0 = doctor (mic), channel 1 = patient (remote)
    const merged = mergeMediaStreams([microphoneStream, remoteStream]);
    audioStream = merged.stream;
    endMergedStream = merged.endStream;
  } else {
    audioStream = microphoneStream;
  }

  // -- 5. Stream audio to Corti in 250 ms chunks --------------------------
  // Prefer WebM with Opus codec (recommended by Corti), fall back to browser default
  const supportedMimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  
  let mimeType: string | undefined;
  for (const type of supportedMimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      mimeType = type;
      break;
    }
  }

  const mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
  console.log(`[${mode}] MediaRecorder using mimeType: ${mediaRecorder.mimeType || 'browser default'}`);

  let configAccepted = false;
  let mediaRecorderStarted = false;
  let isEnding = false;
  let endedResolver: (() => void) | null = null;

  mediaRecorder.ondataavailable = async (event: BlobEvent) => {
    if (event.data.size > 0 && configAccepted && !isEnding) {
      // Convert Blob to ArrayBuffer as required by sendAudio
      const arrayBuffer = await event.data.arrayBuffer();
      streamSocket.sendAudio(arrayBuffer);
    }
  };

  // -- 6. Handle incoming events -------------------------------------------
  streamSocket.on("message", (message) => {
    // Wait for CONFIG_ACCEPTED before starting MediaRecorder
    if (message.type === "CONFIG_ACCEPTED") {
      configAccepted = true;
      console.log(`[${mode}] Configuration accepted, starting MediaRecorder`);
      if (!mediaRecorderStarted) {
        mediaRecorderStarted = true;
        mediaRecorder.start(250);
        console.log(`[${mode}] MediaRecorder started — streaming audio to Corti`);
      }
      return;
    }

    switch (message.type) {
      case "transcript":
        console.log("Transcript:", message);
        onTranscript?.(message);
        break;
      case "facts":
        console.log("Facts:", message);
        onFact?.(message);
        break;
      case "usage":
        console.log("Usage:", message);
        break;
      case "ENDED":
        console.log(`[${mode}] Session ended by server`);
        if (endedResolver) {
          endedResolver();
          endedResolver = null;
        }
        break;
      default:
        console.log("Unhandled message type:", message.type);
        break;
    }
  });

  // -- 7. Return cleanup function ------------------------------------------
  let endedPromise: Promise<void> | null = null;

  return {
    endConsultation: async () => {
      // If already ending, wait for the existing promise
      if (isEnding && endedPromise) {
        await endedPromise;
        return;
      }

      isEnding = true;
      console.log(`[${mode}] Ending consultation...`);

      // Create promise to wait for ENDED message
      endedPromise = new Promise<void>((resolve) => {
        endedResolver = resolve;
      });

      // Stop recording first
      if (mediaRecorder.state !== "inactive") {
        // Request any remaining buffered audio before stopping
        if (mediaRecorder.state === "recording") {
          mediaRecorder.requestData();
        }
        mediaRecorder.stop();
      }

      // Send end message to server
      streamSocket.sendEnd({ type: "end" });

      // Wait for ENDED message before cleaning up resources
      // The server will send usage message, then ENDED
      await endedPromise;

      // Now clean up resources after receiving ENDED
      streamSocket.close();

      // Release the merged stream (virtual mode only)
      endMergedStream?.();

      // Release the remote stream tracks (virtual mode only)
      remoteStream?.getAudioTracks().forEach((track) => track.stop());

      // Release the raw microphone track(s)
      microphoneStream.getAudioTracks().forEach((track) => track.stop());

      console.log(`[${mode}] Consultation ended — all resources cleaned up`);
    },
  };
}
