import * as fs from "node:fs";
import * as path from "node:path";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { Corti, cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";
import { resolveSampleFilePath } from "../lib/sample.js";

export function registerRecordings(app: Application): void {
  app.get("/recordings", asyncHandler(handle));
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

    const recordsList = await client.recordings.list(demoInteractionId);
    const listRecordings = recordsList.recordings ?? [];

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

    const sampleDir = path.join(process.cwd(), "sample");

    if (!fs.existsSync(sampleDir)) {
      fs.mkdirSync(sampleDir, { recursive: true });
    }

    const downloadedPath = path.join(sampleDir, `${recordingId}.mp3`);
    const binaryResponse = await client.recordings.get(demoInteractionId, recordingId);
    const arrayBuffer = await binaryResponse.arrayBuffer();

    fs.writeFileSync(downloadedPath, Buffer.from(arrayBuffer));

    await client.recordings.delete(demoInteractionId, recordingId);
    await client.interactions.delete(demoInteractionId);

    res.json({
      recordsList: listRecordings,
      recordCreate: { recordingId: uploadResponse.recordingId },
      downloadedPath,
      message:
        "List, upload, get (download), delete recording and delete interaction completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
