import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";
import { resolveSampleFilePath } from "../lib/sample.js";

export function registerAmbientAsyncEndToEnd(app: Application): void {
  app.get("/ambient-async-end-to-end", asyncHandler(handle));
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

  try {
    const samplePath = resolveSampleFilePath();

    if (!samplePath) {
      res.status(400).json({
        error:
          "Sample file not found. Copy trouble-breathing.mp3 to sample/ or use typescript/next/public/trouble-breathing.mp3.",
      });

      return;
    }

    const identifier = randomUUID();

    const { interactionId } = await client.interactions.create({
      encounter: {
        identifier,
        status: "planned",
        type: "first_consultation",
      },
    });

    if (!interactionId) {
      throw new Error("Missing interactionId");
    }

    const { recordingId } = await client.recordings.upload(
      fs.createReadStream(samplePath, { autoClose: true }),
      interactionId,
    );

    if (!recordingId) {
      throw new Error("Missing recordingId");
    }

    const transcript = await client.transcripts.create(interactionId, {
      recordingId,
      primaryLanguage: "en",
    });

    const context = (transcript.transcripts ?? []).map((t) => ({
      type: "transcript" as const,
      data: t,
    }));

    const document = await client.documents.classic.create(interactionId, {
      context,
      templateKey: "soap",
      outputLanguage: "en",
    });

    res.json({
      interactionId,
      recordingId,
      transcript,
      document,
      documentName: document.name,
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
