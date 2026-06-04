/**
 * client.ts — Corti SDK ambient stream integration (no DOM dependencies).
 */

import { CortiClient, type Corti } from "@corti/sdk";

export interface SessionOptions {
  accessToken: string;
  interactionId: string;
  tenantName: string;
  environment: string;
  onReady?: () => void;
  onTranscript?: (message: Corti.StreamTranscriptMessage) => void;
  onFacts?: (message: Corti.StreamFactsMessage) => void;
}

export interface ActiveSession {
  endSession: () => Promise<void>;
}

export async function startSession(
  options: SessionOptions,
): Promise<ActiveSession> {
  const {
    accessToken,
    interactionId,
    tenantName,
    environment,
    onReady,
    onTranscript,
    onFacts,
  } = options;

  const client = new CortiClient({
    environment,
    tenantName,
    auth: { accessToken },
  });

  const configuration: Corti.StreamConfig = {
    mode: { type: "facts", outputLocale: "en" },
    transcription: {
      primaryLanguage: "en",
      isDiarization: true,
      isMultichannel: false,
      participants: [],
    },
  };

  const socket = await client.stream.connect({
    id: interactionId,
    configuration,
  });

  let configAccepted = false;
  let mediaRecorder: MediaRecorder | undefined;
  let micStream: MediaStream | undefined;
  let endedResolver: (() => void) | undefined;

  socket.on("message", (message) => {
    switch (message.type) {
      case "CONFIG_ACCEPTED":
        if (!configAccepted) {
          configAccepted = true;
          startAudio().catch((err) => {
            console.error("[ambient] Failed to start audio:", err);
          });
        }
        break;

      case "transcript":
        onTranscript?.(message);
        break;

      case "facts":
        onFacts?.(message);
        break;

      case "ENDED":
        endedResolver?.();
        endedResolver = undefined;
        break;

      case "error":
        console.error("[ambient] Server error:", message.error);
        break;

      default:
        break;
    }
  });

  async function startAudio() {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ].find((type) => MediaRecorder.isTypeSupported(type));

    mediaRecorder = new MediaRecorder(
      micStream,
      mimeType ? { mimeType } : undefined,
    );

    mediaRecorder.ondataavailable = async (event: BlobEvent) => {
      if (event.data.size > 0 && configAccepted) {
        socket.sendAudio(await event.data.arrayBuffer());
      }
    };

    mediaRecorder.start(250);
    onReady?.();
  }

  return {
    endSession: () =>
      new Promise<void>((resolve) => {
        endedResolver = resolve;

        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.requestData();
          mediaRecorder.stop();
        }

        micStream?.getAudioTracks().forEach((track) => {
          track.stop();
        });

        socket.sendEnd({ type: "end" });
      }),
  };
}
