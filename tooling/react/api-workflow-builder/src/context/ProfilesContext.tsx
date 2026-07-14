import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { mintToken } from "../lib/authApi";
import { loadActiveId, loadProfiles, saveActiveId, saveProfiles } from "../profiles/storage";
import type { Profile, Region } from "../profiles/types";
import { baseUrlFor, wsBaseFor } from "../profiles/types";

type ProfilesState = {
  profiles: Profile[];
  activeId: string | null;
  active: Profile | null;
  baseUrl: string;
  wsBase: string;

  createProfile: (input: Omit<Profile, "id" | "cachedToken" | "tokenExpiresAt">) => Profile;
  updateProfile: (id: string, patch: Partial<Profile>) => void;
  deleteProfile: (id: string) => void;
  setActive: (id: string | null) => void;

  // Mint a token for the active profile (or a specific one). Returns the access token string.
  // Caches the token on the profile until ~30s before its declared expiry.
  ensureToken: (profileId?: string) => Promise<string>;
  forceMint: (profileId?: string) => Promise<string>;

  mintingId: string | null;
  mintError: string | null;
};

const Ctx = createContext<ProfilesState | null>(null);

function uid(): string {
  // crypto.randomUUID is widely available in modern browsers; fallback to Math.random
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());
  const [mintingId, setMintingId] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  useEffect(() => saveProfiles(profiles), [profiles]);
  useEffect(() => saveActiveId(activeId), [activeId]);

  // If activeId points at a deleted profile, fix it up
  useEffect(() => {
    if (activeId && !profiles.find((p) => p.id === activeId)) {
      setActiveId(profiles[0]?.id ?? null);
    } else if (!activeId && profiles.length > 0) {
      setActiveId(profiles[0].id);
    }
  }, [profiles, activeId]);

  const active = useMemo(
    () => profiles.find((p) => p.id === activeId) ?? null,
    [profiles, activeId],
  );

  const createProfile: ProfilesState["createProfile"] = useCallback((input) => {
    const profile: Profile = { ...input, id: uid() };
    setProfiles((cur) => [...cur, profile]);
    setActiveId((cur) => cur ?? profile.id);
    return profile;
  }, []);

  const updateProfile: ProfilesState["updateProfile"] = useCallback((id, patch) => {
    setProfiles((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const deleteProfile: ProfilesState["deleteProfile"] = useCallback((id) => {
    setProfiles((cur) => cur.filter((p) => p.id !== id));
  }, []);

  const setActive: ProfilesState["setActive"] = useCallback((id) => {
    setActiveId(id);
  }, []);

  const forceMint = useCallback<ProfilesState["forceMint"]>(
    async (profileId) => {
      const id = profileId ?? activeId;
      if (!id) throw new Error("No active profile");
      setMintingId(id);
      setMintError(null);
      try {
        const target = profiles.find((p) => p.id === id);
        if (!target) throw new Error("Profile not found");
        if (!target.clientId || !target.clientSecret) {
          throw new Error("Profile is missing clientId or clientSecret");
        }
        const res = await mintToken({
          clientId: target.clientId,
          clientSecret: target.clientSecret,
          region: target.region,
          tenant: target.tenant,
        });
        const expiresAt = Date.now() + (res.expiresIn ?? 300) * 1000;
        setProfiles((cur) =>
          cur.map((p) =>
            p.id === id ? { ...p, cachedToken: res.accessToken, tokenExpiresAt: expiresAt } : p,
          ),
        );
        return res.accessToken;
      } catch (e: any) {
        setMintError(e?.message ?? String(e));
        throw e;
      } finally {
        setMintingId(null);
      }
    },
    [activeId, profiles],
  );

  const ensureToken = useCallback<ProfilesState["ensureToken"]>(
    async (profileId) => {
      const id = profileId ?? activeId;
      if (!id) throw new Error("No active profile");
      const target = profiles.find((p) => p.id === id);
      if (!target) throw new Error("Profile not found");
      const valid =
        target.cachedToken && target.tokenExpiresAt && target.tokenExpiresAt > Date.now() + 30_000;
      if (valid) return target.cachedToken!;
      return forceMint(id);
    },
    [activeId, profiles, forceMint],
  );

  const value: ProfilesState = {
    profiles,
    activeId,
    active,
    baseUrl: active ? baseUrlFor(active.region) : "https://api.eu.corti.app",
    wsBase: active ? wsBaseFor(active.region) : "wss://api.eu.corti.app",
    createProfile,
    updateProfile,
    deleteProfile,
    setActive,
    ensureToken,
    forceMint,
    mintingId,
    mintError,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfiles(): ProfilesState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfiles must be used inside ProfilesProvider");
  return v;
}

// Convenience selector for "do we have a usable active profile?"
export function useActiveProfile(): { profile: Profile | null; baseUrl: string; wsBase: string } {
  const { active, baseUrl, wsBase } = useProfiles();
  return { profile: active, baseUrl, wsBase };
}

export type { Profile, Region };
