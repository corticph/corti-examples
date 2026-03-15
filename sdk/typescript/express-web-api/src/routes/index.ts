import type { Application } from "express";
import { registerAgents } from "./agents.js";
import { registerClientVariants } from "./clientVariants.js";
import { registerCodes } from "./codes.js";
import { registerDocuments } from "./documents.js";
import { registerFacts } from "./facts.js";
import { registerInteractions } from "./interactions.js";
import { registerRecordings } from "./recordings.js";
import { registerStream } from "./stream.js";
import { registerTemplates } from "./templates.js";
import { registerToken } from "./token.js";
import { registerTranscribe } from "./transcribe.js";
import { registerTranscripts } from "./transcripts.js";

export function registerRoutes(app: Application): void {
  registerToken(app);
  registerClientVariants(app);
  registerInteractions(app);
  registerRecordings(app);
  registerTranscripts(app);
  registerFacts(app);
  registerCodes(app);
  registerTemplates(app);
  registerAgents(app);
  registerDocuments(app);
  registerStream(app);
  registerTranscribe(app);
}
