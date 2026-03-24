import * as fs from "node:fs";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";
import { resolveSampleFilePath } from "../lib/sample.js";

const CHUNK_SIZE = 4096;

export function registerTranscribeWithConfig(app: Application): void {
  app.get("/transcribe-with-config", asyncHandler(handle));
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
    // connect() sends configuration and resolves only after CONFIG_ACCEPTED.
    // It rejects on CONFIG_DENIED / CONFIG_TIMEOUT.
    const socket = await client.transcribe.connect({
      configuration: { primaryLanguage: "en" },
    });

    const messages: unknown[] = [];
    let flushedResolve: () => void;
    const flushedPromise = new Promise<void>((resolve) => {
      flushedResolve = resolve;
    });

    socket.on("message", (msg: unknown) => {
      messages.push(msg);

      const m = msg as { type?: string };
      if (m.type === "flushed") {
        flushedResolve();
      }
    });

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
      messageCount: messages.length,
      messages,
      message:
        "Transcribe WebSocket (SDK, with config): configuration passed to connect(), audio sent by chunks, flush sent, flushed received.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
