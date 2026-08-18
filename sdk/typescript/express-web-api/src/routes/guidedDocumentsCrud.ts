import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerGuidedDocumentsCrud(app: Application): void {
  app.get("/documents/guided", asyncHandler(handle));
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
    const listed = await client.documents.list();
    const first = listed[0];

    let retrieved = null;
    if (first?.id) {
      retrieved = await client.documents.get(first.id);
    }

    res.json({
      listCount: listed.length,
      listed,
      retrieved,
      sections: retrieved?.sections ?? first?.sections ?? [],
      message:
        "Guided documents list (GET /documents/); get first persisted document if any. Generate stays ephemeral on /documents/generate.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
