import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";
import { resolveSampleFilePath } from "../lib/sample.js";

export function registerAmbientRtStreams(app: Application): void {
  app.get("/ambient-rt-streams", asyncHandler(handle));
}

async function handle(_req: Request, res: Response): Promise<void> {
  if (sendCortiConfigError(res)) {
    return;
  }

  const { client } = createCortiClient();

  if (!client) {
    res.status(500).json({ error: "Missing client" });
    return;
  }

  const samplePath = resolveSampleFilePath();
  if (!samplePath) {
    res.status(400).json({
      error:
        "Sample file not found. Copy trouble-breathing.mp3 to sample/ or use typescript/next/public/trouble-breathing.mp3.",
    });
    return;
  }

  try {
    const now = new Date();
    const created = await client.interactions.create({
      assignedUserId: randomUUID(),
      encounter: {
        identifier: randomUUID(),
        status: Corti.InteractionsEncounterStatusEnum.Planned,
        type: Corti.InteractionsEncounterTypeEnum.FirstConsultation,
        period: { startedAt: now, endedAt: now },
        title: "Consultation",
      },
    });

    const interactionId = created.interactionId ?? null;
    if (!interactionId) {
      throw new Error("Missing interactionId");
    }

    const socket = await client.stream.connect({
      id: interactionId,
      configuration: {
        transcription: {
          primaryLanguage: "en",
          isDiarization: false,
          isMultichannel: false,
          participants: [{ channel: 0, role: "multiple" }],
        },
        mode: { type: "facts", outputLocale: "en" },
      },
    });

    const messages: unknown[] = [];
    let endedResolve: () => void;
    const endedPromise = new Promise<void>((resolve) => {
      endedResolve = resolve;
    });

    socket.on("message", (msg: unknown) => {
      messages.push(msg);
      const m = msg as { type?: string };
      if (m.type === "ENDED") {
        endedResolve();
      }
    });

    const stream = fs.createReadStream(samplePath, { highWaterMark: 32000, autoClose: true });
    for await (const chunk of stream) {
      socket.sendAudio(chunk);
    }
    socket.sendEnd({ type: "end" });

    await endedPromise;
    socket.close();

    res.json({
      interactionId,
      messageCount: messages.length,
      messages,
      message:
        "Ambient RT streams (SDK): connect with facts config, stream audio, end, await ENDED.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
