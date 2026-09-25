import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, describeError } from "./corti.js";
import { loadConfig } from "./env.js";
import { createInteraction } from "./steps/createInteraction.js";
import { extractFacts } from "./steps/extractFacts.js";
import { generateNote } from "./steps/generateNote.js";
import { transcribeAudio } from "./steps/transcribeAudio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_AUDIO_PATH = path.join(__dirname, "..", "sample", "trouble-breathing.mp3");

async function main(): Promise<void> {
  console.log("Ambient scribe quickstart\n");

  console.log("[1/5] Loading and validating Corti credentials from .env ...");
  const config = loadConfig();
  const client = createClient(config);
  console.log(
    `      OK. Tenant "${config.tenantName}" on ${config.environment.toUpperCase()} — access token will be fetched/refreshed automatically.\n`,
  );

  console.log("[2/5] Creating interaction ...");
  const interactionId = await createInteraction(client);
  console.log(`      OK. interactionId = ${interactionId}\n`);

  console.log("[3/5] Uploading sample audio and transcribing (async) ...");
  console.log(`      Audio file: ${SAMPLE_AUDIO_PATH}`);
  const { recordingId, fullText, segmentCount } = await transcribeAudio(
    client,
    interactionId,
    SAMPLE_AUDIO_PATH,
  );
  console.log(`      OK. recordingId = ${recordingId}`);
  console.log(`      OK. ${segmentCount} transcript segment(s) received.`);
  console.log(`      Transcript: "${truncate(fullText, 160)}"\n`);

  console.log("[4/5] Extracting clinical facts from the transcript ...");
  const facts = await extractFacts(client, fullText);
  console.log(`      OK. ${facts.length} fact(s) extracted.`);

  for (const fact of facts.slice(0, 5)) {
    console.log(`      - [${fact.group ?? "general"}] ${fact.text}`);
  }

  if (facts.length > 5) {
    console.log(`      ... and ${facts.length - 5} more.`);
  }

  console.log("");

  console.log('[5/5] Generating structured clinical note (SOAP template) ...');
  const note = await generateNote(client, interactionId, facts);
  console.log(`      OK. Document "${note.name}" generated with ${note.sections.length} section(s).\n`);

  console.log("✓ Ambient scribe workflow completed successfully\n");
  console.log(`interactionId: ${interactionId}`);
  console.log(`recordingId:   ${recordingId}\n`);
  console.log("--- Generated note ---\n");

  for (const section of note.sections) {
    console.log(`## ${section.name}`);
    console.log(section.text || "(empty)");
    console.log("");
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

main().catch((error: unknown) => {
  console.error(`\n✗ Ambient scribe workflow failed: ${describeError(error)}`);
  process.exit(1);
});
