import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

const ENDPOINTS: Record<string, Corti.LanguagesListRequestEndpoint> = {
  streams: Corti.LanguagesListRequestEndpoint.Streams,
  transcribe: Corti.LanguagesListRequestEndpoint.Transcribe,
  transcripts: Corti.LanguagesListRequestEndpoint.Transcripts,
};

export function registerLanguages(app: Application): void {
  app.get("/languages", asyncHandler(handle));
}

async function handle(req: Request, res: Response): Promise<void> {
  if (sendCortiConfigError(res)) {
    return;
  }

  const { client } = createCortiClient();

  if (!client) {
    res.status(500).json({ error: "Missing client" });

    return;
  }

  try {
    const endpointParam = req.query.endpoint as string | undefined;
    const listRequest: Corti.LanguagesListRequest = {};

    if (endpointParam && endpointParam in ENDPOINTS) {
      listRequest.endpoint = ENDPOINTS[endpointParam];
    }

    const languages = await client.languages.list(listRequest);

    res.json({
      languages,
      message: "List languages completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
