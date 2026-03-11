import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerFacts(app: Application): void {
  app.get("/facts", asyncHandler(handle));
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

    const factGroups = await client.facts.factGroupsList();
    const listResp2 = await client.facts.list(demoInteractionId);
    const listFacts = listResp2.facts ?? [];

    const createdFacts = await client.facts.create(demoInteractionId, {
      facts: [
        { text: "Patient has trouble breathing", group: "history-of-present-illness" },
        { text: "Patient is experiencing chest pain", group: "allergies" },
      ],
    });
    const firstFactId = createdFacts.facts?.[0]?.id;
    const secondFactId = createdFacts.facts?.[1]?.id;

    let updatedFact = null;

    if (firstFactId) {
      updatedFact = await client.facts.update(demoInteractionId, firstFactId, {
        text: "Patient has severe trouble breathing",
        source: Corti.CommonSourceEnum.User,
      });
    }

    let batchUpdate = null;

    if (firstFactId && secondFactId) {
      batchUpdate = await client.facts.batchUpdate(demoInteractionId, {
        facts: [
          { factId: firstFactId, text: "Patient has minor trouble breathing" },
          { factId: secondFactId, text: "Patient is experiencing severe chest pain" },
        ],
      });
    }

    const extractResponse = await client.facts.extract({
      context: [
        {
          type: "text",
          text: "Patient reports headache and fever for two days. No known allergies.",
        },
      ],
      outputLanguage: "en",
    });

    await client.interactions.delete(demoInteractionId);

    res.json({
      factGroups,
      listFacts,
      createdFacts,
      updatedFact,
      batchUpdate,
      extractResponse,
      message:
        "Fact groups, list, create, update, batch update, extract and cleanup completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
