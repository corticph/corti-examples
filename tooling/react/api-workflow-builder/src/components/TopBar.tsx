import { Link, NavLink } from "react-router-dom";
import { useProfiles } from "../context/ProfilesContext";
import { Pill } from "./ui/Pill";

export function TopBar() {
  const { active, profiles, setActive } = useProfiles();

  return (
    <header className="border-b border-muted-300/60 bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-5 w-5 rounded-full bg-ink shadow-[inset_0_-2px_0_rgba(255,255,255,0.18)]"
            />
            <span className="text-base font-semibold tracking-tight">Corti Playground</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavTab to="/endpoints">Endpoints</NavTab>
            <NavTab to="/workflows">Workflows</NavTab>
            <NavTab to="/profiles">Profiles</NavTab>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {active ? (
            <>
              <Pill tone="neutral">{active.region.toUpperCase()}</Pill>
              <Pill tone="neutral">tenant: {active.tenant}</Pill>
              <select
                value={active.id}
                onChange={(e) => setActive(e.target.value)}
                className="rounded-lg border border-muted-300 bg-paper px-2 py-1 text-sm text-ink focus:border-ink focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <Link
              to="/profiles"
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              Set up a profile
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 transition-colors ${
          isActive ? "bg-ink text-paper" : "text-muted-700 hover:bg-paper-muted"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
