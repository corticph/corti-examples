import type { AuthResponse, ConfigResponse } from "../types";

// Cached promise for config - only fetches once
let configPromiseCache: Promise<ConfigResponse> | null = null;

export function fetchConfig(): Promise<ConfigResponse> {
  if (!configPromiseCache) {
    configPromiseCache = fetch("/api/config").then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    });
  }
  return configPromiseCache;
}

// Cached promise for auth - only fetches once
let authPromiseCache: Promise<AuthResponse> | null = null;

export function fetchAuthToken(): Promise<AuthResponse> {
  if (!authPromiseCache) {
    authPromiseCache = fetch("/api/auth").then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    });
  }
  return authPromiseCache;
}
