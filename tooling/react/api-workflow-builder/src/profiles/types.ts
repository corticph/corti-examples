export type Region = "eu" | "us";

export type Profile = {
  id: string;
  name: string;
  region: Region;
  tenant: string;
  clientId: string;
  clientSecret: string;
  // populated after a successful mint, used until expiry
  cachedToken?: string;
  tokenExpiresAt?: number; // epoch ms
};

export function baseUrlFor(region: Region): string {
  // Corti REST API is versioned: api.{region}.corti.app/v2/...
  return region === "us" ? "https://api.us.corti.app/v2" : "https://api.eu.corti.app/v2";
}

export function wsBaseFor(region: Region): string {
  return region === "us" ? "wss://api.us.corti.app" : "wss://api.eu.corti.app";
}
