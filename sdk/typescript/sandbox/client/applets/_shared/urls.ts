/** Base URL for REST API calls. Origin-relative so it works on any host/port. */
export function buildApiUrl(): string {
  return `${window.location.origin}/api/corti`;
}

/** WebSocket base URL for a given cluster. */
export function buildWsBaseUrl(cluster: string): string {
  return `wss://api.${cluster}.corti.app/audio-bridge/v2`;
}
