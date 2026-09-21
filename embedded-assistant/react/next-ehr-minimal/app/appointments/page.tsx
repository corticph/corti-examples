import { EhrSidebar } from "@/components/ehr-sidebar";
import { AppointmentList } from "@/components/ehr-parts";
import { PageShell } from "@/components/ui";
import { getDashboardData } from "@/lib/ehr-db";

export default function AppointmentsPage() {
  const { upcomingAppointments } = getDashboardData();

  return (
    <PageShell sidebar={<EhrSidebar activePath="/appointments" />}>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-black tracking-tight">Appointments</h1>
          <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">
            Review upcoming consultations, open booked visits, and move directly
            into the consultation note.
          </p>
        </header>
        <AppointmentList appointments={upcomingAppointments} />
      </div>
    </PageShell>
  );
}
