import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerAgentic(app: Application): void {
  app.get("/agentic", asyncHandler(handle));
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
    const listedPage = await client.agentic.agents.list({ pageSize: 10 });
    const listAgents = listedPage.data;

    const createdAgent = await client.agentic.agents.create({
      name: `SDK Example Agentic ${Date.now()}`,
      description: "Example agent created via Agentic API v2.",
      lifecycle: "ephemeral",
    });

    const getAgent = await client.agentic.agents.get(createdAgent.id);
    const agentCard = await client.agentic.agents.card(createdAgent.id);
    const agentCardUrl = await client.agentic.agents.getCardUrl(createdAgent.id);

    const registryPage = await client.agentic.registry.connectors.list({ pageSize: 10 });
    const registryConnectors = registryPage.data;

    const sendMessageResponse = await client.agentic.agents.sendMessage(createdAgent.id, {
      message: {
        role: "ROLE_USER",
        parts: [{ text: "Hello from SDK agentic example" }],
        messageId: `msg-${Date.now()}`,
      },
    });

    const contextsPage = await client.agentic.contexts.list({
      agentId: createdAgent.id,
      pageSize: 10,
    });
    const contexts = contextsPage.data;

    const usage = await client.agentic.agents.usage(createdAgent.id, {});

    await client.agentic.agents.delete(createdAgent.id);

    res.json({
      listCount: listAgents.length,
      agents: listAgents,
      createdAgent,
      getAgent,
      agentCard,
      agentCardUrl: agentCardUrl.href,
      registryConnectorsCount: registryConnectors.length,
      registryConnectors,
      sendMessageResponse,
      contextsCount: contexts.length,
      contexts,
      usage,
      deletedAgentId: createdAgent.id,
      message:
        "Agentic v2: list/create/get/card/getCardUrl, registry connectors, sendMessage, contexts list, usage, delete",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
