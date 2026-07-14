import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Label } from "../components/ui/Input";
import { Pill } from "../components/ui/Pill";
import { useProfiles } from "../context/ProfilesContext";
import type { Region } from "../profiles/types";

export function ProfileEditPage({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id: string }>();
  const { profiles, createProfile, updateProfile, forceMint, mintingId, mintError } = useProfiles();
  const navigate = useNavigate();
  const existing = mode === "edit" && id ? profiles.find((p) => p.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [region, setRegion] = useState<Region>(existing?.region ?? "eu");
  const [tenant, setTenant] = useState(existing?.tenant ?? "base");
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(existing?.clientSecret ?? "");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (mode === "edit" && existing) {
      setName(existing.name);
      setRegion(existing.region);
      setTenant(existing.tenant);
      setClientId(existing.clientId);
      setClientSecret(existing.clientSecret);
    }
  }, [existing, mode]);

  function save() {
    if (mode === "new") {
      const p = createProfile({
        name: name || "Untitled profile",
        region,
        tenant,
        clientId,
        clientSecret,
      });
      navigate(`/profiles/${p.id}`);
    } else if (existing) {
      updateProfile(existing.id, { name, region, tenant, clientId, clientSecret });
    }
  }

  async function testMint() {
    if (mode === "edit" && existing) {
      try {
        await forceMint(existing.id);
      } catch {
        /* surfaced via mintError */
      }
    }
  }

  if (mode === "edit" && !existing) {
    return (
      <div className="rounded-lg border border-muted-300/60 bg-paper p-6 text-sm">
        Profile not found.{" "}
        <Link to="/profiles" className="underline">
          Back to profiles
        </Link>
        .
      </div>
    );
  }

  const tokenLive =
    existing?.cachedToken && existing.tokenExpiresAt && existing.tokenExpiresAt > Date.now();

  return (
    <div className="grid gap-6">
      <header>
        <div className="text-sm text-muted-500">
          <Link to="/profiles" className="hover:underline">
            ← Profiles
          </Link>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {mode === "new" ? "New profile" : `Edit "${existing!.name}"`}
        </h1>
      </header>

      <Card className="p-5">
        <div className="grid gap-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My project"
            />
          </div>
          <div>
            <Label>Region</Label>
            <div className="flex items-center gap-2">
              {(["eu", "us"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                    region === r
                      ? "border-ink bg-ink text-paper"
                      : "border-muted-300 bg-paper hover:bg-paper-muted"
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Tenant name</Label>
            <Input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="base" />
          </div>
          <div>
            <Label>Client ID</Label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <Label>Client secret</Label>
            <div className="flex items-center gap-2">
              <Input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="font-mono"
              />
              <Button variant="secondary" onClick={() => setShowSecret((v) => !v)}>
                {showSecret ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-muted-300/60 pt-4">
            <Button onClick={save}>{mode === "new" ? "Create" : "Save"}</Button>
            {mode === "edit" && (
              <Button
                variant="secondary"
                onClick={testMint}
                disabled={!clientId || !clientSecret || mintingId === existing!.id}
              >
                {mintingId === existing!.id ? "Minting…" : "Test mint token"}
              </Button>
            )}
            {tokenLive && existing && (
              <Pill tone="good">
                token valid until {new Date(existing.tokenExpiresAt!).toLocaleTimeString()}
              </Pill>
            )}
            {mintError && <Pill tone="bad">{mintError}</Pill>}
          </div>
        </div>
      </Card>
    </div>
  );
}
