import { Activity, CalendarClock, LayoutDashboard, Users } from "lucide-react";
import { SidebarLink } from "@/components/ui";

export function EhrSidebar({ activePath }: { activePath: string }) {
  return (
    <div className="flex h-full flex-col gap-8">
      <div>
        <div className="inline-flex items-center rounded-full bg-[hsl(var(--corti-lime))] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--corti-lime-foreground))]">
          Corti demo
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">
          Harbour Family Practice
        </h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Primary care records, appointments, and consultation workflows for the
          practice.
        </p>
      </div>

      <nav className="flex flex-col gap-2">
        <SidebarLink href="/" active={activePath === "/"} label="Dashboard" />
        <SidebarLink
          href="/patients"
          active={activePath.startsWith("/patients")}
          label="Patients"
        />
        <SidebarLink
          href="/appointments"
          active={activePath.startsWith("/appointments")}
          label="Appointments"
        />
      </nav>

      <div className="surface-card p-4">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <LayoutDashboard size={20} />
          Practice operations
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <div className="flex items-center gap-3">
            <Users size={16} /> Patient registry and contact details
          </div>
          <div className="flex items-center gap-3">
            <CalendarClock size={16} /> Appointment schedule and arrivals
          </div>
          <div className="flex items-center gap-3">
            <Activity size={16} /> Consultation notes and outcomes
          </div>
        </div>
      </div>
    </div>
  );
}
