import * as fs from "node:fs";
import * as path from "node:path";
import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

const SAMPLE_FILE = "trouble-breathing.mp3";

function resolveSampleFilePath(): string | null {
  const dirs = [
    path.join(process.cwd(), "sample"),
    path.join(process.cwd(), "..", "..", "..", "..", "typescript", "next", "public"),
  ];

  for (const dir of dirs) {
    const p = path.join(dir, SAMPLE_FILE);

    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export function registerTranscripts(app: Application): void {
  app.get("/transcripts", asyncHandler(handle));
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
    const id = String(Date.now());
    const created = await client.interactions.create({
      encounter: {
        identifier: id,
        status: Corti.InteractionsEncounterStatusEnum.Planned,
        type: Corti.InteractionsEncounterTypeEnum.FirstConsultation,
      },
      patient: {
        identifier: id,
        gender: "unknown",
      },
    });
    const demoInteractionId = created.interactionId;

    if (!demoInteractionId) {
      throw new Error("Missing interactionId");
    }

    const samplePath = resolveSampleFilePath();

    if (!samplePath) {
      await client.interactions.delete(demoInteractionId);
      res.status(400).json({
        error:
          "Sample file not found. Copy trouble-breathing.mp3 to sample/ or use typescript/next/public/trouble-breathing.mp3.",
      });

      return;
    }

    const uploadResponse = await client.recordings.upload(
      fs.createReadStream(samplePath),
      demoInteractionId,
    );
    const recordingId = uploadResponse.recordingId;

    if (!recordingId) {
      throw new Error("Missing recordingId");
    }

    const listResp2 = await client.transcripts.list(demoInteractionId, {});
    const listTranscripts = listResp2.transcripts ?? [];

    const createdTranscript = await client.transcripts.create(demoInteractionId, {
      recordingId,
      primaryLanguage: "en",
    });
    const transcriptId = createdTranscript.id;

    if (!transcriptId) {
      throw new Error("Missing transcript id");
    }

    const statusResponse = await client.transcripts.getStatus(demoInteractionId, transcriptId);
    const getTranscript = await client.transcripts.get(demoInteractionId, transcriptId);

    await client.transcripts.delete(demoInteractionId, transcriptId);
    await client.recordings.delete(demoInteractionId, recordingId);
    await client.interactions.delete(demoInteractionId);

    res.json({
      listTranscripts,
      createdTranscript: { transcriptId: createdTranscript.id },
      transcriptStatus: statusResponse,
      getTranscript,
      message:
        "List, create, get status, get, delete transcript and cleanup completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
