import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Pill } from "../components/ui/Pill";
import { useProfiles } from "../context/ProfilesContext";
import { importEnvProfile } from "../lib/authApi";

export function ProfilesPage() {
  const { profiles, activeId, setActive, createProfile, deleteProfile } = useProfiles();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function importFromEnv() {
    setImportError(null);
    setImporting(true);
    try {
      const env = await importEnvProfile();
      if (!env.hasCredentials) {
        setImportError("No CORTI_CLIENT_ID / CORTI_CLIENT_SECRET in .env");
        return;
      }
      createProfile({
        name: `${env.tenant} (from .env)`,
        region: env.region === "us" ? "us" : "eu",
        tenant: env.tenant,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
      });
    } catch (e: any) {
      setImportError(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
          <p className="mt-1 text-sm text-muted-700">
            Each profile holds the credentials for one Corti project. The active profile feeds every
            request and workflow run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={importFromEnv} disabled={importing}>
            {importing ? "Importing…" : "Import from .env"}
          </Button>
          <Link
            to="/profiles/new"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            + New profile
          </Link>
        </div>
      </header>

      {importError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {importError}
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted-300 bg-paper p-12 text-center">
          <h2 className="text-lg font-semibold">No profiles yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-700">
            Click <strong>Import from .env</strong> to seed one from your existing credentials, or{" "}
            <strong>+ New profile</strong> to fill them in by hand.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => {
            const isActive = p.id === activeId;
            const tokenLive = p.cachedToken && p.tokenExpiresAt && p.tokenExpiresAt > Date.now();
            return (
              <Card key={p.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{p.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Pill tone="neutral">{p.region.toUpperCase()}</Pill>
                      <Pill tone="neutral">tenant: {p.tenant}</Pill>
                      <Pill tone={tokenLive ? "good" : "neutral"}>
                        {tokenLive ? "token cached" : "no token"}
                      </Pill>
                    </div>
                  </div>
                  {isActive && <Pill tone="accent">active</Pill>}
                </div>
                <div className="font-mono text-xs text-muted-500">
                  client: {p.clientId.slice(0, 12)}…
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!isActive && (
                    <Button variant="secondary" onClick={() => setActive(p.id)}>
                      Set active
                    </Button>
                  )}
                  <Link
                    to={`/profiles/${p.id}`}
                    className="rounded-lg border border-muted-300 px-3 py-1.5 text-sm text-ink hover:bg-paper-muted"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Delete profile "${p.name}"?`)) deleteProfile(p.id);
                    }}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
