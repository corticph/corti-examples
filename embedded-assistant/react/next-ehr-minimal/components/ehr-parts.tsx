import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  FilePenLine,
  Pill,
  UserRound,
} from "lucide-react";
import {
  PrimaryLink,
  SecondaryLink,
  SectionCard,
  StatusChip,
} from "@/components/ui";
import type {
  AppointmentSummary,
  PatientSummary,
  VisitSummary,
} from "@/lib/ehr-types";
import {
  appointmentStatusLabel,
  formatDate,
  formatDateTime,
  initialsFromName,
  outcomeLabel,
} from "@/lib/ehr-utils";

export function PatientList({ patients }: { patients: PatientSummary[] }) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[hsl(var(--border))] px-5 py-4">
        <h2 className="text-lg font-bold">Patient registry</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Current patients with contact details, background, and recent
          activity.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-5 py-3 font-semibold">Patient</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Background</th>
              <th className="px-5 py-3 font-semibold">Recent visit</th>
              <th className="px-5 py-3 font-semibold">Next appointment</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr
                key={patient.id}
                className="table-row-hover border-t border-[hsl(var(--border))] align-top"
              >
                <td className="px-5 py-4">
                  <Link href={`/patients/${patient.id}`} className="block">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--border))] text-sm font-bold">
                        {initialsFromName(patient.fullName)}
                      </div>
                      <div>
                        <div className="font-semibold">{patient.fullName}</div>
                        <div className="font-mono-data mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                          NHS {patient.nhsNumber}
                        </div>
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <div>{patient.phone}</div>
                  <div className="mt-1 text-[hsl(var(--muted-foreground))]">
                    {patient.email}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div>
                    {patient.age} yrs, {patient.sex}
                  </div>
                  <div className="mt-1 text-[hsl(var(--muted-foreground))]">
                    {patient.chronicConditions}
                  </div>
                  <div className="mt-1 text-[hsl(var(--muted-foreground))]">
                    Allergies: {patient.allergies}
                  </div>
                </td>
                <td className="px-5 py-4 font-mono-data">
                  {patient.lastVisitDate
                    ? formatDate(patient.lastVisitDate)
                    : "No visits yet"}
                </td>
                <td className="px-5 py-4 font-mono-data">
                  {patient.nextAppointmentAt
                    ? formatDateTime(patient.nextAppointmentAt)
                    : "None booked"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function AppointmentList({
  appointments,
}: {
  appointments: AppointmentSummary[];
}) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[hsl(var(--border))] px-5 py-4">
        <h2 className="text-lg font-bold">Upcoming list</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Open any appointment to review context and begin documentation.
        </p>
      </div>
      <div className="divide-y divide-[hsl(var(--border))]">
        {appointments.map((appointment) => {
          const tone = appointment.status === "checked-in" ? "success" : "info";

          return (
            <Link
              key={appointment.id}
              href={`/appointments/${appointment.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[hsl(var(--foreground)/0.03)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{appointment.patientName}</p>
                  <StatusChip tone={tone}>
                    {appointmentStatusLabel(appointment.status)}
                  </StatusChip>
                </div>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {appointment.reason} with {appointment.clinician}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-mono-data text-sm">
                  {formatDateTime(appointment.startsAt)}
                </p>
                <ChevronRight size={18} />
              </div>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function VisitTimeline({ visits }: { visits: VisitSummary[] }) {
  return (
    <div className="space-y-4">
      {visits.map((visit) => (
        <SectionCard key={visit.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <ClipboardList size={16} />
                {formatDateTime(visit.visitDate)}
              </div>
              <h3 className="mt-2 text-lg font-bold">{visit.reason}</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Seen by {visit.clinician}
              </p>
            </div>
            <StatusChip
              tone={
                visit.outcomeType === "referral"
                  ? "warning"
                  : visit.outcomeType === "prescription"
                    ? "success"
                    : "info"
              }
            >
              {outcomeLabel(visit.outcomeType)}
            </StatusChip>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3 text-sm leading-6">
              <div>
                <p className="font-semibold">Subjective</p>
                <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                  {visit.subjective}
                </p>
              </div>
              <div>
                <p className="font-semibold">Objective</p>
                <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                  {visit.objective?.trim() ||
                    (visit.bloodPressure ||
                    visit.heartRate !== null ||
                    visit.temperatureC !== null
                      ? "Objective findings are recorded in the structured observations alongside this note."
                      : "No objective findings were recorded.")}
                </p>
              </div>
              <div>
                <p className="font-semibold">Assessment</p>
                <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                  {visit.assessment}
                </p>
              </div>
              <div>
                <p className="font-semibold">Plan</p>
                <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                  {visit.plan}
                </p>
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    Blood pressure
                  </p>
                  <p className="font-mono-data mt-1 font-semibold">
                    {visit.bloodPressure ?? "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    Heart rate
                  </p>
                  <p className="font-mono-data mt-1 font-semibold">
                    {visit.heartRate !== null
                      ? `${visit.heartRate} bpm`
                      : "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    Temperature
                  </p>
                  <p className="font-mono-data mt-1 font-semibold">
                    {visit.temperatureC !== null
                      ? `${visit.temperatureC.toFixed(1)} C`
                      : "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--muted-foreground))]">Outcome</p>
                  <p className="mt-1 font-semibold">
                    {visit.outcomeDetails ?? "No document raised"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

export function EmptyVisits() {
  return (
    <SectionCard className="p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--border))]">
        <UserRound size={20} />
      </div>
      <h3 className="mt-4 text-lg font-bold">No previous visits</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        No consultations have been recorded yet for this patient.
      </p>
    </SectionCard>
  );
}

export function AppointmentActionCard({
  appointmentId,
}: {
  appointmentId: number;
}) {
  return (
    <SectionCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Start consultation</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Open the GP consultation template, capture structured notes, then
            write either advice, a prescription, or a referral.
          </p>
        </div>
        <div className="flex gap-3">
          <PrimaryLink href={`/appointments/${appointmentId}/new-interaction`}>
            <FilePenLine size={18} className="mr-2" />
            Open interaction
          </PrimaryLink>
        </div>
      </div>
    </SectionCard>
  );
}

export function OutcomeHint({
  type,
}: {
  type: "prescription" | "referral" | "none";
}) {
  if (type === "prescription") {
    return (
      <div className="rounded-lg border border-[hsl(var(--variant-success-border))] bg-[hsl(var(--variant-success-bg))] px-3 py-2 text-sm text-[hsl(var(--variant-success-text))]">
        <div className="flex items-center gap-2 font-semibold">
          <Pill size={16} /> Add the medication or dosage summary in the outcome
          field.
        </div>
      </div>
    );
  }

  if (type === "referral") {
    return (
      <div className="rounded-lg border border-[hsl(var(--variant-warning-border))] bg-[hsl(var(--variant-warning-bg))] px-3 py-2 text-sm text-[hsl(var(--variant-warning-text))]">
        Include the destination service or specialty for the referral letter.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--variant-info-border))] bg-[hsl(var(--variant-info-bg))] px-3 py-2 text-sm text-[hsl(var(--variant-info-text))]">
      Advice-only visits can leave the outcome details blank.
    </div>
  );
}

export function BackActions({
  patientId,
  appointmentId,
}: {
  patientId: number;
  appointmentId?: number;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <SecondaryLink href={`/patients/${patientId}`}>
        Patient record
      </SecondaryLink>
      {appointmentId ? (
        <SecondaryLink href={`/appointments/${appointmentId}`}>
          Appointment overview
        </SecondaryLink>
      ) : null}
    </div>
  );
}
