import type { Profile } from "./types";

const KEY_PROFILES = "corti.profiles";
const KEY_ACTIVE = "corti.activeProfile";

export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(KEY_PROFILES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(KEY_PROFILES, JSON.stringify(profiles));
}

export function loadActiveId(): string | null {
  return localStorage.getItem(KEY_ACTIVE);
}

export function saveActiveId(id: string | null): void {
  if (id) localStorage.setItem(KEY_ACTIVE, id);
  else localStorage.removeItem(KEY_ACTIVE);
}
