import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerAgents(app: Application): void {
  app.get("/agents", asyncHandler(handle));
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
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const ephemeral =
      req.query.ephemeral === "true" ? true : req.query.ephemeral === "false" ? false : undefined;

    const listAgentsRaw = await client.agents.list({ limit, offset, ephemeral });
    const listAgents = Array.isArray(listAgentsRaw) ? listAgentsRaw : [];

    const createdAgent = await client.agents.create({
      name: "SDK Example Agent",
      description: "Example agent created via SDK for list and create demo.",
    });

    const getAgent = await client.agents.get(createdAgent.id);
    const agentCard = await client.agents.getCard(createdAgent.id);

    const registryExpertsResponse = await client.agents.getRegistryExperts({
      limit: 10,
      offset: 0,
    });
    const registryExpertsList = registryExpertsResponse.experts ?? [];

    const messageSendResponse = await client.agents.messageSend(createdAgent.id, {
      message: {
        role: "user",
        parts: [{ kind: "text", text: "Hello from SDK example" }],
        messageId: `msg-${Date.now()}`,
        kind: "message",
      },
    });

    let getTaskResult = null;
    let getContextResult = null;

    if (messageSendResponse.task?.id != null && messageSendResponse.task?.contextId != null) {
      getTaskResult = await client.agents.getTask(createdAgent.id, messageSendResponse.task.id, {});
      getContextResult = await client.agents.getContext(
        createdAgent.id,
        messageSendResponse.task.contextId,
        {},
      );
    }

    await client.agents.delete(createdAgent.id);

    res.json({
      listCount: listAgents.length,
      agents: listAgents,
      createdAgent,
      getAgent,
      agentCard,
      registryExpertsCount: registryExpertsList.length,
      registryExperts: registryExpertsList,
      messageSendResponse,
      getTask: getTaskResult,
      getContext: getContextResult,
      deletedAgentId: createdAgent.id,
      message:
        "Agents list, create, get, card, registry experts, message send, get task/context, and delete completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
