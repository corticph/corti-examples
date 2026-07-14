import { notFound } from "next/navigation";
import { CalendarClock, ChevronDown, FilePenLine, IdCard, MapPin, Phone, ShieldPlus } from "lucide-react";
import Link from "next/link";
import { EhrSidebar } from "@/components/ehr-sidebar";
import {
  BlankConsultationMenu,
  PatientRecordFilters,
  PatientRecordView,
} from "@/components/ehr-parts";
import { PageShell } from "@/components/ui";
import { getPatientDetail } from "@/lib/ehr-db";
import { recordEntryTypes, type RecordEntryType } from "@/lib/ehr-types";
import { formatDate, formatDateTime } from "@/lib/ehr-utils";

function parseRecordType(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return "all";
  }

  return recordEntryTypes.includes(rawValue as RecordEntryType)
    ? (rawValue as RecordEntryType)
    : "all";
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const detail = getPatientDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { patient, recordEntries, entryCounts, appointments } = detail;
  const activeType = parseRecordType(type);
  const hasNextAppointment = appointments.length > 0;

  return (
    <PageShell sidebar={<EhrSidebar activePath="/patients" />}>
      <div className="flex h-[calc(100vh-2rem)] min-h-0 flex-col gap-3 sm:h-[calc(100vh-3rem)]">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Patient record
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-2xl font-black tracking-tight">
                {patient.fullName}
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {patient.age} yrs · {patient.sex} · NHS {patient.nhsNumber}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasNextAppointment ? (
              <Link
                href={`/appointments/${appointments[0].id}/new-interaction`}
                className="button-primary inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90"
              >
                <FilePenLine size={16} />
                Start planned contact
              </Link>
            ) : null}
            <BlankConsultationMenu
              patientId={patient.id}
              variant={hasNextAppointment ? "secondary" : "primary"}
            />
          </div>
        </header>

        <details className="surface-card group shrink-0 overflow-visible">
          <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-sm">
            <span className="font-semibold">Details</span>
            <span className="truncate text-[hsl(var(--muted-foreground))]">
              DOB {formatDate(patient.dob)} · {patient.chronicConditions} · Allergies: {patient.allergies}
            </span>
            <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
          </summary>
          <div className="grid gap-4 border-t border-[hsl(var(--border))] px-4 py-3 text-sm md:grid-cols-2 xl:grid-cols-5">
            <div className="flex items-start gap-3">
              <IdCard size={16} className="mt-1 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">Born {formatDate(patient.dob)}</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  NHS {patient.nhsNumber}
                </p>
              </div>
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
              <MapPin size={16} className="mt-1 shrink-0" />
              <div>
                <p className="font-semibold">Address</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {patient.address}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldPlus size={16} className="mt-1 shrink-0" />
              <div>
                <p className="font-semibold">Clinical background</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {patient.chronicConditions} · Allergies: {patient.allergies}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CalendarClock size={16} className="mt-1 shrink-0" />
              <div>
                <p className="font-semibold">Next planned contact</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {patient.nextAppointmentAt
                    ? formatDateTime(patient.nextAppointmentAt)
                    : "No appointment booked"}
                </p>
              </div>
            </div>
          </div>
        </details>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <PatientRecordFilters
            patientId={patient.id}
            activeType={activeType}
            entries={recordEntries}
            counts={entryCounts}
          />
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <PatientRecordView entries={recordEntries} activeType={activeType} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
