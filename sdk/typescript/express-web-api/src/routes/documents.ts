import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerDocuments(app: Application): void {
  app.get("/documents", asyncHandler(handle));
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

    const listResp2 = await client.documents.list(demoInteractionId);
    const listDocuments = listResp2.data ?? [];

    const createdDocument = await client.documents.create(demoInteractionId, {
      context: [
        {
          type: "facts",
          data: [
            { text: "Patient has trouble breathing", source: Corti.CommonSourceEnum.Core },
            { text: "Patient is experiencing chest pain", source: Corti.CommonSourceEnum.User },
          ],
        },
      ],
      templateKey: "corti-patient-summary",
      outputLanguage: "en",
      name: "Patient Consultation Note",
    });
    const documentId = createdDocument.id;

    if (!documentId) {
      throw new Error("Missing document id");
    }

    const retrievedDocument = await client.documents.get(demoInteractionId, documentId);

    const updatedDocument = await client.documents.update(demoInteractionId, documentId, {
      sections: [
        {
          key: "chief-complaint",
          text: "Patient reports severe trouble breathing and chest pain",
        },
      ],
    });

    await client.documents.delete(demoInteractionId, documentId);
    await client.interactions.delete(demoInteractionId);

    res.json({
      listDocuments,
      createdDocument,
      retrievedDocument,
      updatedDocument,
      message: "List, create, get, update, delete document and cleanup completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
