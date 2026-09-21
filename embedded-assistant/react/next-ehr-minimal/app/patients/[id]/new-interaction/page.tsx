import { notFound } from "next/navigation";
import { AnnualCheckupCortiAssistant } from "@/components/annual-checkup-corti-assistant";
import { ConsultationForm } from "@/components/consultation-form";
import { EhrSidebar } from "@/components/ehr-sidebar";
import { BackActions } from "@/components/ehr-parts";
import { PageShell, SectionCard } from "@/components/ui";
import { getConsultationTemplate, isConsultationType } from "@/lib/consultation-templates";
import { getPatientDetail } from "@/lib/ehr-db";
import type { ConsultationType } from "@/lib/ehr-types";

function parseConsultationType(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return rawValue && isConsultationType(rawValue)
    ? rawValue
    : ("general-gp" satisfies ConsultationType);
}

export default async function NewPatientInteractionPage({
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

  const { patient } = detail;
  const consultationType = parseConsultationType(type);
  const template = getConsultationTemplate(consultationType);

  return (
    <PageShell sidebar={<EhrSidebar activePath="/patients" />}>
      <div className="space-y-6">
        <BackActions patientId={patient.id} />

        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            Blank consultation
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{template.label}</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {patient.fullName} · {template.description}
          </p>
        </header>

        {consultationType === "annual-checkup" && (
          <AnnualCheckupCortiAssistant detail={detail} />
        )}

        <SectionCard className="p-5">
          <ConsultationForm
            patientId={patient.id}
            consultationType={consultationType}
            clinician="Dr. Mason"
            reason={template.label}
          />
        </SectionCard>
      </div>
    </PageShell>
  );
}
