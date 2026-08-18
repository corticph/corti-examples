import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { search } from "./store.js";

export interface Scope {
  allowed: string[]; // patient scopes, e.g. ["patient:000-MOCK-5678"]
  patientNames: Record<string, string>; // scope -> display name, for passage labels
}

export interface ServerOptions {
  // Resolve the caller's scope at tool-call time, keyed by the A2A contextId in
  // the call's _meta (stable across the conversation, so it survives Corti's dual
  // sessions). NEVER resolved from a tool argument, so the model can't widen its
  // own access. Defaults to shared-only.
  getScope?: (contextId?: string) => Scope;
}

// Builds the Search Documents MCP server with the single search_documents tool.
export function createServer(opts: ServerOptions = {}): McpServer {
  const getScope: (contextId?: string) => Scope =
    opts.getScope ?? (() => ({ allowed: [], patientNames: {} }));

  const server = new McpServer({
    name: "search_documents_mcp",
    version: "1.0.0",
  });

  // RAG retrieval tool: returns the passages most relevant to a question,
  // scoped to what the caller may see. The orchestrator writes the answer.
  server.tool(
    "search_documents",
    "Search the available documents for passages relevant to a question. Returns the most relevant excerpts, each labelled with its patient (or 'reference' for shared docs). Base your answer only on the returned passages.",
    {
      query: z.string().describe("The question or keywords to search for"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("How many passages to return (default 4)"),
    },
    async ({ query, topK }, extra) => {
      // Scope rides in the tool call's _meta contextId; works even when this call
      // is unauthenticated, as long as an earlier call bound the scope.
      const contextId =
        typeof extra?._meta?._contextId === "string" ? extra._meta._contextId : undefined;
      const { allowed, patientNames } = getScope(contextId);
      const hits = await search(query, topK ?? 4, allowed);
      console.error(
        `[scope] search_documents | ctx=${contextId?.slice(0, 8) ?? "none"} | allowed=[${allowed.join(", ")}]` +
          ` | query=${JSON.stringify(query)} | hits=${hits.length} [${hits
            .map((hit) => (hit.scope === "shared" ? "shared" : hit.scope.replace(/^patient:/, "")))
            .join(", ")}]`,
      );
      if (hits.length === 0) {
        return {
          content: [
            { type: "text", text: "No relevant passages found in the available documents." },
          ],
        };
      }
      return {
        content: hits.map((hit) => {
          // Label each passage by patient (name + MRN, or "reference" for shared)
          // so the orchestrator can disambiguate results that span patients.
          let label: string;
          if (hit.scope === "shared") {
            label = "reference";
          } else {
            const mrn = hit.scope.replace(/^patient:/, "");
            const name = patientNames[hit.scope];
            label = name ? `patient ${name} (${mrn})` : `patient ${mrn}`;
          }
          return {
            type: "text",
            text: `[${label} | source: ${hit.source}]\n${hit.text}`,
          };
        }),
      };
    },
  );

  return server;
}
