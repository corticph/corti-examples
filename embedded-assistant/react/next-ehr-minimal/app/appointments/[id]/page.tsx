import { notFound } from "next/navigation";
import { CalendarDays, CircleUserRound, FileText } from "lucide-react";
import { EhrSidebar } from "@/components/ehr-sidebar";
import { AppointmentActionCard, BackActions, VisitTimeline } from "@/components/ehr-parts";
import { PageShell, SectionCard, StatusChip } from "@/components/ui";
import { getAppointmentDetail } from "@/lib/ehr-db";
import { appointmentStatusLabel, formatDateTime } from "@/lib/ehr-utils";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = getAppointmentDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { appointment, patient, visits } = detail;

  return (
    <PageShell sidebar={<EhrSidebar activePath="/appointments" />}>
      <div className="space-y-6">
        <BackActions patientId={patient.id} />

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Appointment</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{patient.fullName}</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{appointment.reason} with {appointment.clinician}</p>
          </div>
          <StatusChip tone={appointment.status === "checked-in" ? "success" : "info"}>{appointmentStatusLabel(appointment.status)}</StatusChip>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-6">
            <SectionCard className="p-5">
              <div className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <CalendarDays size={18} className="mt-1 shrink-0" />
                  <div>
                    <p className="font-semibold">Scheduled time</p>
                    <p className="font-mono-data mt-1">{formatDateTime(appointment.startsAt)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CircleUserRound size={18} className="mt-1 shrink-0" />
                  <div>
                    <p className="font-semibold">Patient background</p>
                    <p className="mt-1 text-[hsl(var(--muted-foreground))]">{patient.age} yrs · {patient.sex} · {patient.chronicConditions}</p>
                    <p className="mt-1 text-[hsl(var(--muted-foreground))]">Allergies: {patient.allergies}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText size={18} className="mt-1 shrink-0" />
                  <div>
                    <p className="font-semibold">Reason booked</p>
                    <p className="mt-1 text-[hsl(var(--muted-foreground))]">{appointment.reason}</p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <AppointmentActionCard appointmentId={appointment.id} />
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Previous visits</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Open context before starting the new interaction.</p>
            </div>
            <VisitTimeline visits={visits} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}