import { MCP_NAME } from './config.js'

// Current signed-in session (single-user). Distinct from the Corti connection:
// this is "who is signed in right now" plus the MCP server name the scope-token
// DataPart must use (read off the active agent, or MCP_NAME when we created it).

let activeClinician = null
let activeMcpName = MCP_NAME

export function getClinician() {
  return activeClinician
}
export function setClinician(c) {
  activeClinician = c
}

export function getActiveMcpName() {
  return activeMcpName
}
export function setActiveMcpName(name) {
  activeMcpName = name
}
