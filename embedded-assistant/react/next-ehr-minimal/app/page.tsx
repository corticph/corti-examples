import Link from "next/link";
import { Sparkles } from "lucide-react";
import { EhrSidebar } from "@/components/ehr-sidebar";
import { AppointmentList, PatientList } from "@/components/ehr-parts";
import { MetricBox, PageShell, SectionCard } from "@/components/ui";
import { getAllPatients, getDashboardData } from "@/lib/ehr-db";

export default function Home() {
  const dashboard = getDashboardData();
  const patients = getAllPatients().slice(0, 8);
  const nextAppointment = dashboard.upcomingAppointments[0];
  const nextAppointmentTime = nextAppointment
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(nextAppointment.startsAt))
    : null;

  return (
    <PageShell sidebar={<EhrSidebar activePath="/" />}>
      <div className="min-w-0 space-y-6">
        <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--accent))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--accent-foreground))]">
              <Sparkles size={14} />
              Practice overview
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">
              Today&apos;s clinic overview
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Review the patient panel, monitor today&apos;s schedule, and move
              directly from booked appointments into structured consultation
              documentation.
            </p>
          </div>

          <SectionCard className="p-5">
            <p className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              Today at a glance
            </p>
            <div className="mt-4 space-y-2">
              <Link
                href="/appointments"
                className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-4 py-3 transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                  Queue
                </p>
                <p className="font-mono-data text-base font-bold">
                  {dashboard.totals.upcomingCount} appointments
                </p>
              </Link>
              {nextAppointment ? (
                <Link
                  href={`/appointments/${nextAppointment.id}`}
                  className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-4 py-3 transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                    Next up
                  </p>
                  <p className="truncate text-right text-sm font-semibold">
                    {`${nextAppointment.patientName} at ${nextAppointmentTime}`}
                  </p>
                </Link>
              ) : (
                <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                    Next up
                  </p>
                  <p className="truncate text-right text-sm font-semibold">
                    No open appointments
                  </p>
                </div>
              )}
            </div>
          </SectionCard>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricBox
            label="Patients"
            value={String(dashboard.totals.patientCount)}
            subtext="Active patient panel"
          />
          <MetricBox
            label="Upcoming today"
            value={String(dashboard.totals.upcomingCount)}
            subtext="Current appointment queue"
          />
          <MetricBox
            label="Visits this week"
            value={String(dashboard.totals.completedThisWeek)}
            subtext="Completed consultations"
          />
          <MetricBox
            label="Prescriptions this month"
            value={String(dashboard.totals.prescriptionsThisMonth)}
            subtext="Medication outcomes recorded"
          />
        </section>

        <div className="min-w-0 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0 space-y-6">
            <AppointmentList appointments={dashboard.upcomingAppointments} />
          </div>
          <div className="min-w-0 space-y-6">
            <PatientList patients={patients} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
