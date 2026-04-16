import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerCodes(app: Application): void {
  app.get("/codes", asyncHandler(handle));
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
    const predictResponse = await client.codes.predict({
      system: [Corti.CommonCodingSystemEnum.Icd10CmOutpatient, Corti.CommonCodingSystemEnum.Cpt],
      context: [
        {
          type: "text",
          text: "Short arm splint applied in ED for pain control.",
        },
      ],
    });

    res.json({
      predictResponse,
      message: "Code prediction completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
