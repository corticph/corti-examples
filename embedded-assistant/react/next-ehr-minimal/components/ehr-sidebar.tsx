import { Activity, CalendarClock, LayoutDashboard, Users } from "lucide-react";
import { SidebarLink } from "@/components/ui";

export function EhrSidebar({ activePath }: { activePath: string }) {
  return (
    <div className="flex h-full flex-col items-center gap-5">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--corti-lime))] text-sm font-black text-[hsl(var(--corti-lime-foreground))]"
        title="Harbour Family Practice"
      >
        HF
      </div>

      <nav className="flex flex-col items-center gap-2">
        <SidebarLink
          href="/"
          active={activePath === "/"}
          label="Dashboard"
          icon={<LayoutDashboard size={18} />}
        />
        <SidebarLink
          href="/patients"
          active={activePath.startsWith("/patients")}
          label="Patients"
          icon={<Users size={18} />}
        />
        <SidebarLink
          href="/appointments"
          active={activePath.startsWith("/appointments")}
          label="Appointments"
          icon={<CalendarClock size={18} />}
        />
      </nav>

      <div className="mt-auto flex h-11 w-11 items-center justify-center rounded-lg border border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]" title="Record workflows">
        <Activity size={18} />
      </div>
    </div>
  );
}
