import { notFound } from "next/navigation";
import { CalendarClock, Phone, ShieldPlus } from "lucide-react";
import { EhrSidebar } from "@/components/ehr-sidebar";
import {
  AppointmentList,
  EmptyVisits,
  VisitTimeline,
} from "@/components/ehr-parts";
import { PageShell, SectionCard } from "@/components/ui";
import { getPatientDetail } from "@/lib/ehr-db";
import { formatDate, formatDateTime } from "@/lib/ehr-utils";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = getPatientDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { patient, visits, appointments } = detail;

  return (
    <PageShell sidebar={<EhrSidebar activePath="/patients" />}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Patient record
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              {patient.fullName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
              DOB {formatDate(patient.dob)} · {patient.age} yrs · {patient.sex}
            </p>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <SectionCard className="p-5">
              <h2 className="text-lg font-bold">Key details</h2>
              <div className="mt-4 grid gap-4 text-sm">
                <div>
                  <p className="text-[hsl(var(--muted-foreground))]">Address</p>
                  <p className="mt-1 font-semibold">{patient.address}</p>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={16} className="mt-1 shrink-0" />
                  <div>
                    <p className="font-semibold">{patient.phone}</p>
                    <p className="text-[hsl(var(--muted-foreground))]">
                      {patient.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldPlus size={16} className="mt-1 shrink-0" />
                  <div>
                    <p className="font-semibold">Allergies</p>
                    <p className="text-[hsl(var(--muted-foreground))]">
                      {patient.allergies}
                    </p>
                    <p className="mt-3 font-semibold">Background</p>
                    <p className="text-[hsl(var(--muted-foreground))]">
                      {patient.chronicConditions}
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="p-5">
              <div className="flex items-center gap-3">
                <CalendarClock size={18} />
                <div>
                  <h2 className="text-lg font-bold">Next planned contact</h2>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {patient.nextAppointmentAt
                      ? formatDateTime(patient.nextAppointmentAt)
                      : "No appointment booked"}
                  </p>
                </div>
              </div>
            </SectionCard>

            {appointments.length > 0 ? (
              <AppointmentList appointments={appointments} />
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Previous GP visits
              </h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Review previous consultations to understand recent presentation
                and continuity of care.
              </p>
            </div>
            {visits.length > 0 ? (
              <VisitTimeline visits={visits} />
            ) : (
              <EmptyVisits />
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
