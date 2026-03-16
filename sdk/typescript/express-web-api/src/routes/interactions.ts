import { Corti } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerInteractions(app: Application): void {
  app.get("/interactions", asyncHandler(handle));
}

function parseSort(s?: string): Corti.InteractionsListRequestSort | undefined {
  if (!s) {
    return undefined;
  }

  const v = s.toLowerCase();
  const map: Record<string, string> = {
    id: Corti.InteractionsListRequestSort.Id,
    assigneduserid: Corti.InteractionsListRequestSort.AssignedUserId,
    patient: Corti.InteractionsListRequestSort.Patient,
    createdat: Corti.InteractionsListRequestSort.CreatedAt,
    endedat: Corti.InteractionsListRequestSort.EndedAt,
    updatedat: Corti.InteractionsListRequestSort.UpdatedAt,
  };

  return (map[v] ?? s) as Corti.InteractionsListRequestSort;
}

function parseDirection(s?: string): Corti.CommonSortingDirectionEnum | undefined {
  if (!s) {
    return undefined;
  }

  const v = s.toLowerCase();

  if (v === "asc") {
    return Corti.CommonSortingDirectionEnum.Asc;
  }
  if (v === "desc") {
    return Corti.CommonSortingDirectionEnum.Desc;
  }

  return undefined;
}

function parseEncounterStatus(s?: string): Corti.InteractionsEncounterStatusEnum[] | undefined {
  if (!s) {
    return undefined;
  }

  const v = s.toLowerCase();
  const map: Record<string, Corti.InteractionsEncounterStatusEnum> = {
    planned: Corti.InteractionsEncounterStatusEnum.Planned,
    "in-progress": Corti.InteractionsEncounterStatusEnum.InProgress,
    "on-hold": Corti.InteractionsEncounterStatusEnum.OnHold,
    completed: Corti.InteractionsEncounterStatusEnum.Completed,
    cancelled: Corti.InteractionsEncounterStatusEnum.Cancelled,
    deleted: Corti.InteractionsEncounterStatusEnum.Deleted,
  };
  const status = map[v] ?? (v as Corti.InteractionsEncounterStatusEnum);

  return [status];
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
    const sort = parseSort(req.query.sort as string);
    const direction = parseDirection(req.query.direction as string);
    const pageSize = req.query.pageSize != null ? Number(req.query.pageSize) : undefined;
    const index = req.query.index != null ? Number(req.query.index) : 1;
    const encounterStatus = parseEncounterStatus(req.query.encounterStatus as string);
    const patient = (req.query.patient as string) || undefined;

    const pager = await client.interactions.list({
      sort,
      direction,
      pageSize,
      index,
      encounterStatus,
      patient,
    });
    const collected: Corti.InteractionsGetResponse[] = [];

    for await (const item of pager) {
      collected.push(item);
    }

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
    const interactionId = created.interactionId;

    if (!interactionId) {
      throw new Error("Missing interactionId");
    }

    const got = await client.interactions.get(interactionId);
    const updated = await client.interactions.update(interactionId, {
      encounter: { status: Corti.InteractionsEncounterStatusEnum.InProgress },
    });

    await client.interactions.delete(interactionId);

    res.json({
      listCount: collected.length,
      list: collected,
      listRequest: {
        sort: req.query.sort,
        direction,
        pageSize,
        index,
        encounterStatus: req.query.encounterStatus,
        patient,
      },
      createdInteraction: created,
      gotInteraction: got,
      updatedInteraction: updated,
      deletedId: interactionId,
      message: "List, create, get, update, and delete interactions completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
