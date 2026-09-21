import Link from "next/link";
import {
  Baby,
  Beaker,
  BookOpenText,
  ClipboardCheck,
  ChevronRight,
  ClipboardList,
  Crosshair,
  FilePenLine,
  FileText,
  HeartPulse,
  MessageSquareText,
  Pill,
  Ruler,
  Send,
  Syringe,
  UserRound,
} from "lucide-react";
import {
  PrimaryLink,
  SecondaryLink,
  SectionCard,
  StatusChip,
} from "@/components/ui";
import {
  consultationTemplates,
  getConsultationTemplate,
} from "@/lib/consultation-templates";
import {
  PatientRecordFilterTabs,
  type PatientRecordFilterTabItem,
} from "@/components/patient-record-filter-tabs";
import type {
  AppointmentSummary,
  ConsultationType,
  PatientSummary,
  RecordEntry,
  RecordEntryCount,
  RecordEntryType,
} from "@/lib/ehr-types";
import {
  appointmentStatusLabel,
  formatDate,
  formatDateTime,
  initialsFromName,
  outcomeLabel,
  recordEntryTypeDescription,
  recordEntryTypeLabel,
} from "@/lib/ehr-utils";
import { VitalsCombinedChart } from "@/components/vitals-combined-chart";

const entryTypeStyles: Record<
  RecordEntryType,
  {
    border: string;
    background: string;
    chipBackground: string;
    text: string;
    iconText: string;
    activeRing: string;
    bar: string;
    row: string;
    rowHover: string;
    icon: typeof ClipboardList;
  }
> = {
  history: {
    border: "border-sky-200",
    background: "bg-sky-50",
    chipBackground: "bg-sky-100/70",
    text: "text-sky-900",
    iconText: "text-sky-700",
    activeRing: "ring-sky-500/70",
    bar: "bg-sky-500",
    row: "bg-sky-100/70 border-l-sky-500",
    rowHover: "hover:bg-sky-100",
    icon: BookOpenText,
  },
  examination: {
    border: "border-teal-200",
    background: "bg-teal-50",
    chipBackground: "bg-teal-100/70",
    text: "text-teal-950",
    iconText: "text-teal-700",
    activeRing: "ring-teal-500/70",
    bar: "bg-teal-500",
    row: "bg-teal-100/70 border-l-teal-500",
    rowHover: "hover:bg-teal-100",
    icon: ClipboardCheck,
  },
  diagnosis: {
    border: "border-orange-200",
    background: "bg-orange-50",
    chipBackground: "bg-orange-100/70",
    text: "text-orange-950",
    iconText: "text-orange-700",
    activeRing: "ring-orange-500/70",
    bar: "bg-orange-500",
    row: "bg-orange-100/70 border-l-orange-500",
    rowHover: "hover:bg-orange-100",
    icon: Crosshair,
  },
  "care-plan": {
    border: "border-indigo-200",
    background: "bg-indigo-50",
    chipBackground: "bg-indigo-100/70",
    text: "text-indigo-950",
    iconText: "text-indigo-700",
    activeRing: "ring-indigo-500/70",
    bar: "bg-indigo-500",
    row: "bg-indigo-100/70 border-l-indigo-500",
    rowHover: "hover:bg-indigo-100",
    icon: ClipboardList,
  },
  vitals: {
    border: "border-rose-200",
    background: "bg-rose-50",
    chipBackground: "bg-rose-100/70",
    text: "text-rose-900",
    iconText: "text-rose-700",
    activeRing: "ring-rose-500/70",
    bar: "bg-rose-500",
    row: "bg-rose-100/70 border-l-rose-500",
    rowHover: "hover:bg-rose-100",
    icon: HeartPulse,
  },
  "body-metrics": {
    border: "border-emerald-200",
    background: "bg-emerald-50",
    chipBackground: "bg-emerald-100/70",
    text: "text-emerald-900",
    iconText: "text-emerald-700",
    activeRing: "ring-emerald-500/70",
    bar: "bg-emerald-500",
    row: "bg-emerald-100/70 border-l-emerald-500",
    rowHover: "hover:bg-emerald-100",
    icon: Ruler,
  },
  "test-order": {
    border: "border-yellow-200",
    background: "bg-yellow-50",
    chipBackground: "bg-yellow-100/70",
    text: "text-yellow-950",
    iconText: "text-yellow-700",
    activeRing: "ring-yellow-500/75",
    bar: "bg-yellow-500",
    row: "bg-yellow-100/70 border-l-yellow-500",
    rowHover: "hover:bg-yellow-100",
    icon: Beaker,
  },
  "lab-result": {
    border: "border-amber-200",
    background: "bg-amber-50",
    chipBackground: "bg-amber-100/70",
    text: "text-amber-950",
    iconText: "text-amber-700",
    activeRing: "ring-amber-500/75",
    bar: "bg-amber-500",
    row: "bg-amber-100/70 border-l-amber-500",
    rowHover: "hover:bg-amber-100",
    icon: Beaker,
  },
  medication: {
    border: "border-lime-200",
    background: "bg-lime-50",
    chipBackground: "bg-lime-100/70",
    text: "text-lime-950",
    iconText: "text-lime-700",
    activeRing: "ring-lime-500/75",
    bar: "bg-lime-500",
    row: "bg-lime-100/70 border-l-lime-500",
    rowHover: "hover:bg-lime-100",
    icon: Pill,
  },
  vaccination: {
    border: "border-fuchsia-200",
    background: "bg-fuchsia-50",
    chipBackground: "bg-fuchsia-100/70",
    text: "text-fuchsia-950",
    iconText: "text-fuchsia-700",
    activeRing: "ring-fuchsia-500/70",
    bar: "bg-fuchsia-500",
    row: "bg-fuchsia-100/70 border-l-fuchsia-500",
    rowHover: "hover:bg-fuchsia-100",
    icon: Syringe,
  },
  maternity: {
    border: "border-pink-200",
    background: "bg-pink-50",
    chipBackground: "bg-pink-100/70",
    text: "text-pink-950",
    iconText: "text-pink-700",
    activeRing: "ring-pink-500/70",
    bar: "bg-pink-500",
    row: "bg-pink-100/70 border-l-pink-500",
    rowHover: "hover:bg-pink-100",
    icon: Baby,
  },
  "patient-message": {
    border: "border-cyan-200",
    background: "bg-cyan-50",
    chipBackground: "bg-cyan-100/70",
    text: "text-cyan-950",
    iconText: "text-cyan-700",
    activeRing: "ring-cyan-500/70",
    bar: "bg-cyan-500",
    row: "bg-cyan-100/70 border-l-cyan-500",
    rowHover: "hover:bg-cyan-100",
    icon: MessageSquareText,
  },
  referral: {
    border: "border-violet-200",
    background: "bg-violet-50",
    chipBackground: "bg-violet-100/70",
    text: "text-violet-950",
    iconText: "text-violet-700",
    activeRing: "ring-violet-500/70",
    bar: "bg-violet-500",
    row: "bg-violet-100/70 border-l-violet-500",
    rowHover: "hover:bg-violet-100",
    icon: Send,
  },
  document: {
    border: "border-stone-200",
    background: "bg-stone-50",
    chipBackground: "bg-stone-100/80",
    text: "text-stone-900",
    iconText: "text-stone-700",
    activeRing: "ring-stone-500/70",
    bar: "bg-stone-500",
    row: "bg-stone-100/80 border-l-stone-500",
    rowHover: "hover:bg-stone-100",
    icon: FileText,
  },
};

const filterOrder: RecordEntryType[] = [
  "history",
  "examination",
  "diagnosis",
  "care-plan",
  "vitals",
  "body-metrics",
  "test-order",
  "lab-result",
  "medication",
  "vaccination",
  "maternity",
  "patient-message",
  "referral",
  "document",
];

function getEntryTypeStyle(type: RecordEntryType) {
  return entryTypeStyles[type];
}

function formatMonthDay(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function occasionKey(entry: RecordEntry) {
  return entry.occurredAt.slice(0, 10);
}

function groupEntriesByOccasion(entries: RecordEntry[]) {
  const groups: { key: string; entries: RecordEntry[] }[] = [];

  entries.forEach((entry) => {
    const key = occasionKey(entry);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.key === key) {
      currentGroup.entries.push(entry);
      return;
    }

    groups.push({ key, entries: [entry] });
  });

  return groups;
}

function countForType(counts: RecordEntryCount[], type: RecordEntryType) {
  return counts.find((entry) => entry.type === type)?.count ?? 0;
}

function entryDetailLines(entry: RecordEntry) {
  const { payload } = entry;

  if (payload.history) {
    return [payload.history.detail];
  }

  if (payload.examination) {
    return [payload.examination.findings];
  }

  if (payload.diagnosis) {
    return [payload.diagnosis.impression];
  }

  if (payload.carePlan) {
    return [
      payload.carePlan.plan,
      payload.carePlan.outcomeType
        ? `Outcome: ${outcomeLabel(payload.carePlan.outcomeType)}${payload.carePlan.outcomeDetails ? ` - ${payload.carePlan.outcomeDetails}` : ""}`
        : null,
    ].filter(Boolean) as string[];
  }

  if (payload.testOrder) {
    return [
      `${payload.testOrder.testName} - ${payload.testOrder.status}`,
      payload.testOrder.reason ?? null,
    ].filter(Boolean) as string[];
  }

  if (payload.labResult) {
    const result = payload.labResult;
    return [
      `${result.testName}: ${result.result}${result.unit ? ` ${result.unit}` : ""}`,
      result.referenceRange ? `Reference ${result.referenceRange}` : null,
      `Status ${result.status}`,
    ].filter(Boolean) as string[];
  }

  if (payload.medication) {
    const medication = payload.medication;
    return [
      `${medication.medication} - ${medication.dose}`,
      `Action: ${medication.status}`,
      medication.instructions ?? null,
    ].filter(Boolean) as string[];
  }

  if (payload.vaccination) {
    const vaccination = payload.vaccination;
    return [
      vaccination.vaccine,
      vaccination.dose ? `Dose: ${vaccination.dose}` : null,
      vaccination.site ? `Site: ${vaccination.site}` : null,
      vaccination.batch ? `Batch: ${vaccination.batch}` : null,
      `Status: ${vaccination.status}`,
    ].filter(Boolean) as string[];
  }

  if (payload.maternity) {
    const maternity = payload.maternity;
    return [
      maternity.gestationWeeks
        ? `${maternity.gestationWeeks} weeks gestation`
        : null,
      maternity.fetalHeartRate
        ? `FHR ${maternity.fetalHeartRate} bpm`
        : null,
      maternity.fundalHeightCm
        ? `Fundal height ${maternity.fundalHeightCm} cm`
        : null,
      maternity.notes,
    ].filter(Boolean) as string[];
  }

  if (payload.referral) {
    return [
      `${payload.referral.specialty} - ${payload.referral.destination}`,
      `Status: ${payload.referral.status}`,
    ];
  }

  if (payload.vitals) {
    const vitals = payload.vitals;
    return [
      vitals.systolic && vitals.diastolic
        ? `BP ${vitals.systolic}/${vitals.diastolic}`
        : null,
      vitals.heartRate ? `HR ${vitals.heartRate} bpm` : null,
      vitals.temperatureC ? `Temp ${vitals.temperatureC.toFixed(1)} C` : null,
      vitals.oxygenSaturation ? `SpO2 ${vitals.oxygenSaturation}%` : null,
    ].filter(Boolean) as string[];
  }

  if (payload.bodyMetrics) {
    const metrics = payload.bodyMetrics;
    return [
      metrics.heightCm ? `Height ${metrics.heightCm} cm` : null,
      metrics.weightKg ? `Weight ${metrics.weightKg.toFixed(1)} kg` : null,
      metrics.bmi ? `BMI ${metrics.bmi.toFixed(1)}` : null,
    ].filter(Boolean) as string[];
  }

  if (payload.message) {
    return [`${payload.message.channel}: ${payload.message.detail}`];
  }

  if (payload.document) {
    return [
      `${payload.document.documentType}`,
      `Status: ${payload.document.status}`,
    ];
  }

  return [];
}

export function PatientList({ patients }: { patients: PatientSummary[] }) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[hsl(var(--border))] px-5 py-4">
        <h2 className="text-lg font-bold">Patient registry</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Current patients with contact details, background, and record activity.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-5 py-3 font-semibold">Patient</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Background</th>
              <th className="px-5 py-3 font-semibold">Latest record</th>
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
                  {patient.lastRecordAt
                    ? formatDate(patient.lastRecordAt)
                    : "No records yet"}
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
                <p className="mt-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {getConsultationTemplate(appointment.consultationType).label}
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

export function PatientRecordFilters({
  patientId,
  activeType,
  entries,
  counts,
}: {
  patientId: number;
  activeType: RecordEntryType | "all";
  entries: RecordEntry[];
  counts: RecordEntryCount[];
}) {
  const baseTabClassName =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition hover:brightness-95 hover:shadow-sm";
  const tabs: PatientRecordFilterTabItem[] = [
    {
      active: activeType === "all",
      className: [
        baseTabClassName,
        activeType === "all"
          ? "border-slate-500 bg-slate-200 text-slate-950 shadow-md ring-2 ring-slate-500/70 ring-offset-2 ring-offset-[hsl(var(--background))]"
          : "border-slate-200 bg-slate-100/80 text-slate-800",
      ].join(" "),
      count: entries.length,
      href: `/patients/${patientId}`,
      iconClassName: "text-slate-900",
      label: "All",
      type: "all",
    },
    ...filterOrder.flatMap((type) => {
      const count = countForType(counts, type);

      if (count === 0) {
        return [];
      }

      const style = getEntryTypeStyle(type);

      return [
        {
          active: activeType === type,
          className: [
            baseTabClassName,
            activeType === type
              ? `${style.border} ${style.chipBackground} ${style.text} ${style.activeRing} shadow-md ring-2 ring-offset-2 ring-offset-[hsl(var(--background))]`
              : `${style.border} ${style.chipBackground} ${style.text}`,
          ].join(" "),
          count,
          href: `/patients/${patientId}?type=${type}`,
          iconClassName: style.text,
          label: recordEntryTypeLabel(type),
          type,
        },
      ];
    }),
  ];

  return (
    <PatientRecordFilterTabs tabs={tabs} />
  );
}

export function PatientRecordView({
  entries,
  activeType,
}: {
  entries: RecordEntry[];
  activeType: RecordEntryType | "all";
}) {
  const visibleEntries =
    activeType === "all"
      ? entries
      : entries.filter((entry) => entry.type === activeType);

  if (activeType === "vitals") {
    return <VitalsTimeline entries={visibleEntries} />;
  }

  if (activeType === "body-metrics") {
    return <BodyMetricsTimeline entries={visibleEntries} />;
  }

  if (visibleEntries.length === 0) {
    return <EmptyRecordEntries />;
  }

  return <RecordEntryLedger entries={visibleEntries} />;
}

export function RecordEntryLedger({ entries }: { entries: RecordEntry[] }) {
  const occasionGroups = groupEntriesByOccasion(entries);

  return (
    <SectionCard className="overflow-visible">
      <div className="sticky top-0 z-10 grid grid-cols-[7.5rem_6.5rem_minmax(0,1fr)_9rem] border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] max-lg:hidden">
        <div>Date</div>
        <div>Type</div>
        <div>Entry</div>
        <div>Source</div>
      </div>
      <div className="divide-y-2 divide-[hsl(var(--foreground)/0.14)]">
        {occasionGroups.map((group) => (
          <div key={group.key}>
            <div>
              {group.entries.map((entry) => {
                const style = getEntryTypeStyle(entry.type);
                const Icon = style.icon;
                const lines = entryDetailLines(entry);

                return (
                  <article
                    key={entry.id}
                    className="grid lg:grid-cols-[7.5rem_minmax(0,1fr)]"
                  >
                    <div className="font-mono-data px-3 py-1.5 text-xs">
                      <div>{formatMonthDay(entry.occurredAt)}</div>
                      <div className="text-[hsl(var(--muted-foreground))]">
                        {formatTime(entry.occurredAt)}
                      </div>
                    </div>
                    <div
                      className={`grid gap-2 border-l-4 px-3 py-1.5 transition-colors lg:grid-cols-[6.5rem_minmax(0,1fr)_9rem] ${style.row} ${style.rowHover}`}
                    >
                      <div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.border} ${style.chipBackground} ${style.text}`}
                        >
                          <Icon className={style.iconText} size={13} strokeWidth={2.6} />
                          {recordEntryTypeLabel(entry.type)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-medium text-[hsl(var(--foreground))]">
                          {entry.title}
                        </h3>
                        {lines.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {lines.slice(0, 3).map((line) => (
                              <span
                                key={line}
                                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-1.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))]"
                              >
                                {line}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        <div className="font-semibold text-[hsl(var(--foreground))]">
                          {entry.authoredBy}
                        </div>
                        <div>{entry.source}</div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function chartPoints(values: Array<{ date: string; value: number }>) {
  if (values.length === 0) {
    return "";
  }

  const sorted = [...values].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const min = Math.min(...sorted.map((point) => point.value));
  const max = Math.max(...sorted.map((point) => point.value));
  const range = Math.max(max - min, 1);

  return sorted
    .map((point, index) => {
      const x = sorted.length === 1 ? 50 : (index / (sorted.length - 1)) * 100;
      const y = 82 - ((point.value - min) / range) * 62;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function TimelineChart({
  title,
  unit,
  values,
  colorClass,
}: {
  title: string;
  unit: string;
  values: Array<{ date: string; value: number }>;
  colorClass: string;
}) {
  const sorted = [...values].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const latest = sorted.at(-1);

  return (
    <SectionCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {sorted.length} measurements
          </p>
        </div>
        <div className="text-right font-mono-data text-sm font-bold">
          {latest ? `${latest.value}${unit}` : "--"}
        </div>
      </div>
      <svg viewBox="0 0 100 90" className="mt-4 h-32 w-full overflow-visible">
        <line x1="0" x2="100" y1="82" y2="82" stroke="hsl(var(--border))" />
        <line x1="0" x2="100" y1="20" y2="20" stroke="hsl(var(--border))" />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          points={chartPoints(sorted)}
          className={colorClass}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sorted.map((point, index) => {
          const points = chartPoints(sorted).split(" ");
          const [x, y] = points[index]?.split(",") ?? ["0", "82"];
          return (
            <circle
              key={`${point.date}-${point.value}`}
              cx={x}
              cy={y}
              r="2.6"
              className={colorClass}
              fill="currentColor"
            />
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
        <span>{sorted[0] ? formatMonthDay(sorted[0].date) : "--"}</span>
        <span>{latest ? formatMonthDay(latest.date) : "--"}</span>
      </div>
    </SectionCard>
  );
}

export function VitalsTimeline({ entries }: { entries: RecordEntry[] }) {
  const values = entries
    .filter((entry) => entry.payload.vitals)
    .map((entry) => ({ date: entry.occurredAt, vitals: entry.payload.vitals! }));

  if (values.length === 0) {
    return <EmptyRecordEntries />;
  }

  return (
    <div className="space-y-4">
      <VitalsCombinedChart
        description={recordEntryTypeDescription("vitals")}
        points={values}
      />
      <RecordEntryLedger entries={entries} />
    </div>
  );
}

export function BodyMetricsTimeline({ entries }: { entries: RecordEntry[] }) {
  const values = entries
    .filter((entry) => entry.payload.bodyMetrics)
    .map((entry) => ({
      date: entry.occurredAt,
      bodyMetrics: entry.payload.bodyMetrics!,
    }));

  if (values.length === 0) {
    return <EmptyRecordEntries />;
  }

  return (
    <div className="space-y-4">
      <SectionCard className="p-5">
        <div className="flex items-center gap-3">
          <Ruler size={18} />
          <div>
            <h2 className="text-lg font-bold">Body data timeline</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {recordEntryTypeDescription("body-metrics")}
            </p>
          </div>
        </div>
      </SectionCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <TimelineChart
          title="Weight"
          unit=" kg"
          colorClass="text-emerald-600"
          values={values.flatMap((entry) =>
            entry.bodyMetrics.weightKg
              ? [{ date: entry.date, value: entry.bodyMetrics.weightKg }]
              : [],
          )}
        />
        <TimelineChart
          title="BMI"
          unit=""
          colorClass="text-cyan-600"
          values={values.flatMap((entry) =>
            entry.bodyMetrics.bmi
              ? [{ date: entry.date, value: entry.bodyMetrics.bmi }]
              : [],
          )}
        />
        <TimelineChart
          title="Height"
          unit=" cm"
          colorClass="text-lime-700"
          values={values.flatMap((entry) =>
            entry.bodyMetrics.heightCm
              ? [{ date: entry.date, value: entry.bodyMetrics.heightCm }]
              : [],
          )}
        />
      </div>
      <RecordEntryLedger entries={entries} />
    </div>
  );
}

export function EmptyRecordEntries() {
  return (
    <SectionCard className="p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--border))]">
        <UserRound size={20} />
      </div>
      <h3 className="mt-4 text-lg font-bold">No record entries</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Nothing has been recorded for this category yet.
      </p>
    </SectionCard>
  );
}

export function AppointmentActionCard({
  appointmentId,
  consultationType,
}: {
  appointmentId: number;
  consultationType: ConsultationType;
}) {
  const template = getConsultationTemplate(consultationType);

  return (
    <SectionCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Start consultation</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Open the {template.label.toLowerCase()} template, then add its
            entries into the longitudinal patient record.
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

export function BlankConsultationMenu({
  patientId,
  variant = "secondary",
}: {
  patientId: number;
  variant?: "primary" | "secondary";
}) {
  const summaryClass =
    variant === "primary"
      ? "button-primary inline-flex cursor-pointer list-none items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
      : "button-secondary inline-flex cursor-pointer list-none items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold hover:opacity-90";

  return (
    <details className="relative">
      <summary className={summaryClass}>
        New consultation
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-[min(22rem,calc(100vw-7rem))] rounded-xl border border-[hsl(var(--border))] bg-background p-2 shadow-xl lg:left-auto lg:right-0">
        {consultationTemplates.map((template) => (
          <Link
            key={template.type}
            href={`/patients/${patientId}/new-interaction?type=${template.type}`}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]"
          >
            <span className="font-semibold">{template.label}</span>
            <span className="mt-1 block text-xs leading-5 text-[hsl(var(--muted-foreground))]">
              {template.description}
            </span>
          </Link>
        ))}
      </div>
    </details>
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