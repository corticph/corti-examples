import { randomUUID } from "node:crypto";
import type { CortiClient } from "@corti/sdk";

/**
 * Every Corti API call after this point (recordings, transcripts, facts, documents) is
 * scoped to this interaction ID — it's the thread that ties the whole encounter together.
 */
export async function createInteraction(client: CortiClient): Promise<string> {
  const { interactionId } = await client.interactions.create({
    encounter: {
      identifier: randomUUID(),
      status: "planned",
      type: "first_consultation",
    },
  });

  if (!interactionId) {
    throw new Error("Corti API did not return an interactionId");
  }

  return interactionId;
}
