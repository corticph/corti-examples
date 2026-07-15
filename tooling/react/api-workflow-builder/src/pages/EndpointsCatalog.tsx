import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Pill } from "../components/ui/Pill";
import { useProfiles } from "../context/ProfilesContext";
import { endpointGroups } from "../endpoints/registry";

// Welcome / empty-state shown at /endpoints when no specific endpoint is selected.
// The sidebar always lists every endpoint, so this page is now a quick-glance overview
// rather than the primary navigation device.
export function EndpointsCatalog() {
  const { active } = useProfiles();
  const totalCount = endpointGroups.reduce((n, g) => n + g.endpoints.length, 0);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Endpoints</h1>
        <p className="mt-1 text-sm text-muted-700">
          {totalCount} endpoints across {endpointGroups.length} groups. Pick one from the sidebar
          (or jump in below) to build a request.
        </p>
      </header>

      {!active && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          No active profile. Create one in{" "}
          <Link to="/profiles" className="underline">
            Profiles
          </Link>{" "}
          first; otherwise requests will fail at send-time.
        </div>
      )}

      <div className="grid gap-6">
        {endpointGroups.map((g) => (
          <section key={g.name}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-500">
              {g.name}
              <span className="ml-2 text-xs font-normal normal-case text-muted-500">
                {g.endpoints.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.endpoints.map((e) => (
                <Link key={e.id} to={`/endpoints/${encodeURIComponent(e.id)}`} className="block">
                  <Card className="h-full p-4 transition-colors hover:bg-paper-muted">
                    <div className="flex items-center gap-2">
                      <Pill tone="accent">{e.method}</Pill>
                      <span className="truncate font-mono text-xs text-muted-700">{e.path}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold">{e.label}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-500">{e.description}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
