import { MCP_NAME } from "./config.js";
import type { Clinician } from "./directory.js";

// Current signed-in session (single-user). Distinct from the Corti connection:
// this is "who is signed in right now" plus the MCP server name the scope-token
// DataPart must use (read off the active agent, or MCP_NAME when we created it).

let activeClinician: Clinician | null = null;
let activeMcpName: string = MCP_NAME;

export function getClinician(): Clinician | null {
  return activeClinician;
}
export function setClinician(clinician: Clinician): void {
  activeClinician = clinician;
}

export function getActiveMcpName(): string {
  return activeMcpName;
}
export function setActiveMcpName(name: string): void {
  activeMcpName = name;
}
