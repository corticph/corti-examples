import { CortiClient } from "@corti/sdk";
import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  cortiEnvironment,
  CortiAuth,
  cortiErrorResponse,
  createCortiAuth,
  createCortiClient,
  createCortiClientRopc,
  getCortiConfig,
  getRopcConfig,
  sendCortiConfigError,
  sendRopcConfigError,
} from "../lib/corti.js";

export function registerToken(app: Application): void {
  app.get("/token", asyncHandler(getToken));
  app.get("/token/cc", asyncHandler(tokenCc));
  app.get("/token/bearer", asyncHandler(tokenBearer));
  app.get("/token/ropc", asyncHandler(tokenRopc));
  app.get("/token/ropc-client", asyncHandler(tokenRopcClient));
}

async function getToken(req: Request, res: Response): Promise<void> {
  if (sendCortiConfigError(res)) {
    return;
  }

  const config = getCortiConfig();

  if (!config) {
    res.status(400).json({ error: "Corti credentials required." });

    return;
  }
  try {
    const cortiAuth = createCortiAuth();

    if (!cortiAuth) {
      res.status(400).json({ error: "Corti credentials required." });

      return;
    }

    const scopesParam = typeof req.query.scopes === "string" ? req.query.scopes : undefined;
    const scopes = scopesParam
      ? scopesParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const data = await cortiAuth.getToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      ...(scopes?.length ? { scopes } : {}),
    });

    res.json(data);
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}

async function tokenCc(_req: Request, res: Response): Promise<void> {
  if (sendCortiConfigError(res)) {
    return;
  }

  const { client } = createCortiClient();

  if (!client) {
    res.status(400).json({ error: "Corti credentials required." });

    return;
  }

  try {
    await client.facts.factGroupsList();

    res.json({
      message: "Corti client (client credentials) called Facts.FactGroupsList successfully.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}

async function tokenBearer(_req: Request, res: Response): Promise<void> {
  if (sendCortiConfigError(res)) {
    return;
  }

  const config = getCortiConfig();

  if (!config) {
    res.status(400).json({ error: "Corti credentials required." });

    return;
  }
  try {
    const cortiAuth = createCortiAuth();

    if (!cortiAuth) {
      res.status(400).json({ error: "Corti credentials required." });

      return;
    }

    const tokenBody = await cortiAuth.getToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    const accessToken = tokenBody.accessToken ?? "";
    const bearerClient = new CortiClient({
      tenantName: config.tenantName,
      environment: cortiEnvironment,
      auth: { accessToken },
    });

    await bearerClient.facts.factGroupsList();
    res.json({
      message: "Corti client (Bearer token from CC) called Facts.FactGroupsList successfully.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}

async function tokenRopc(req: Request, res: Response): Promise<void> {
  if (sendRopcConfigError(res)) {
    return;
  }

  const config = getRopcConfig();

  if (!config) {
    res.status(400).json({ error: "ROPC credentials required." });
    return;
  }

  try {
    const cortiAuth = new CortiAuth({
      tenantName: config.tenantName,
      environment: config.environment,
    });
    const scopesParam = typeof req.query.scopes === "string" ? req.query.scopes : undefined;
    const scopes = scopesParam
      ? scopesParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const data = await cortiAuth.getRopcFlowToken({
      clientId: config.clientId,
      username: config.username,
      password: config.password,
      ...(scopes?.length ? { scopes } : {}),
    });

    res.json(data);
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}

async function tokenRopcClient(_req: Request, res: Response): Promise<void> {
  if (sendRopcConfigError(res)) {
    return;
  }

  const { client } = createCortiClientRopc();

  if (!client) {
    res.status(400).json({ error: "ROPC credentials required." });
    return;
  }

  try {
    await client.facts.factGroupsList();
    res.json({
      message:
        "Corti client (ROPC auth) called Facts.FactGroupsList successfully.",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
