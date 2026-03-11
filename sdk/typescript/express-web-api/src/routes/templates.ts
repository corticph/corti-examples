import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerTemplates(app: Application): void {
  app.get("/templates", asyncHandler(handle));
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
    const org = (req.query.org as string) || undefined;
    const lang = (req.query.lang as string) || undefined;
    const status = (req.query.status as string) || undefined;

    const listRequest: { org?: string[]; lang?: string[]; status?: string[] } = {};

    if (org) {
      listRequest.org = [org];
    }
    if (lang) {
      listRequest.lang = [lang];
    }
    if (status) {
      listRequest.status = [status];
    }

    const sectionListRequest: { org?: string[]; lang?: string[] } = {};

    if (org) {
      sectionListRequest.org = [org];
    }
    if (lang) {
      sectionListRequest.lang = [lang];
    }

    const listResponse = await client.templates.list(listRequest);
    const sectionListResponse = await client.templates.sectionList(sectionListRequest);
    const templates = listResponse.data ?? [];
    const sections = sectionListResponse.data ?? [];

    let templateByKey = null;

    if (templates.length > 0 && templates[0].key) {
      templateByKey = await client.templates.get(templates[0].key);
    }

    res.json({
      listCount: templates.length,
      templates,
      sectionListCount: sections.length,
      sections,
      templateByKey,
      message: "List templates, list sections, and get by key completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
