import * as fs from "node:fs";
import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  cortiErrorResponse,
  createCortiAuth,
  createCortiClient,
  getCortiConfig,
  sendCortiConfigError,
} from "../lib/corti.js";
import { resolveSampleFilePath } from "../lib/sample.js";

const CHUNK_SIZE = 4096;

export function registerStream(app: Application): void {
  app.get("/stream", asyncHandler(handle));
}

async function handle(req: Request, res: Response): Promise<void> {
  if (sendCortiConfigError(res)) {
    return;
  }

  const config = getCortiConfig();

  if (!config) {
    res.status(400).json({ error: "Corti credentials required." });

    return;
  }

  const { client } = createCortiClient();

  if (!client) {
    res.status(500).json({ error: "Missing client" });

    return;
  }

  const cortiAuth = createCortiAuth();

  if (!cortiAuth) {
    res.status(400).json({ error: "Corti credentials required." });

    return;
  }

  const tokenBody = await cortiAuth.getToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  const accessToken = tokenBody.accessToken;

  if (!accessToken) {
    res.status(400).json({ error: "Could not obtain access token." });

    return;
  }

  const bearerToken = accessToken.startsWith("Bearer ") ? accessToken : `Bearer ${accessToken}`;

  let interactionId =
    typeof req.query.interactionId === "string" ? req.query.interactionId.trim() : null;

  if (!interactionId) {
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

    interactionId = created.interactionId ?? null;
  }

  if (!interactionId) {
    res.status(400).json({ error: "Missing interactionId." });

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
    const socket = await client.stream.connect({
      id: interactionId,
      tenantName: config.tenantName,
      token: bearerToken,
    });

    const messages: unknown[] = [];
    let configAcceptedResolve: () => void;
    let configAcceptedReject: (err: Error) => void;
    const configAcceptedPromise = new Promise<void>((resolve, reject) => {
      configAcceptedResolve = resolve;
      configAcceptedReject = reject;
    });
    let flushedResolve: () => void;
    const flushedPromise = new Promise<void>((resolve) => {
      flushedResolve = resolve;
    });

    socket.on("message", (msg: unknown) => {
      messages.push(msg);

      const m = msg as { type?: string };
      if (m.type === Corti.StreamConfigStatusMessageType.ConfigAccepted) {
        configAcceptedResolve();
      }
      if (
        m.type === Corti.StreamConfigStatusMessageType.ConfigDenied ||
        m.type === Corti.StreamConfigStatusMessageType.ConfigTimeout ||
        m.type === Corti.StreamConfigStatusMessageType.ConfigMissing ||
        m.type === Corti.StreamConfigStatusMessageType.ConfigNotProvided ||
        m.type === Corti.StreamConfigStatusMessageType.ConfigAlreadyReceived
      ) {
        configAcceptedReject(new Error(`Config not accepted: ${m.type}`));
      }
      if (m.type === "flushed") {
        flushedResolve();
      }
    });

    await socket.waitForOpen();

    socket.sendConfiguration({
      type: "config",
      configuration: {
        transcription: {
          primaryLanguage: "en",
          participants: [],
        },
        mode: { type: Corti.StreamConfigModeType.Transcription },
      },
    });

    await configAcceptedPromise;

    const buffer = Buffer.alloc(CHUNK_SIZE);
    const fd = fs.openSync(samplePath, "r");

    try {
      let read: number;

      do {
        read = fs.readSync(fd, buffer, 0, CHUNK_SIZE, null);
        if (read > 0) {
          const chunk = read < CHUNK_SIZE ? buffer.subarray(0, read) : buffer;
          socket.sendAudio(chunk);
        }
      } while (read > 0);
    } finally {
      fs.closeSync(fd);
    }

    socket.sendFlush({ type: "flush" });
    await flushedPromise;

    socket.close();

    res.json({
      interactionId,
      messageCount: messages.length,
      messages,
      message:
        "Stream WebSocket (SDK): config sent, audio sent by chunks, flush sent, flushed received.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
