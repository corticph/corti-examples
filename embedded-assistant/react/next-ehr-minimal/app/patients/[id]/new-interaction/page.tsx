import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ConsultationForm } from "@/components/consultation-form";
import { CortiAssistantLoader } from "@/components/corti-assistant-loader";
import { CortiAssistantPanel } from "@/components/corti-assistant-panel";
import { CortiAssistantInteractionData } from "@/components/corti-assistant-types";
import { EhrSidebar } from "@/components/ehr-sidebar";
import { BackActions } from "@/components/ehr-parts";
import { PageShell, SectionCard } from "@/components/ui";
import {
  getConsultationTemplate,
  isConsultationType,
} from "@/lib/consultation-templates";
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

  const interactionData: CortiAssistantInteractionData = {
    assignedUserId: null,
    encounter: {
      identifier: `patient-${patient.id}-${consultationType}-${new Date().getTime()}`,
      status: "planned",
      type: "first_consultation",
      period: { startedAt: new Date().toISOString() },
    },
  };

  return (
    <PageShell sidebar={<EhrSidebar activePath="/patients" />}>
      <div className="space-y-6">
        <BackActions patientId={patient.id} />

        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            Blank consultation
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">
            {template.label}
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {patient.fullName} · {template.description}
          </p>
        </header>

        <SectionCard className="p-5">
          <Suspense fallback={<CortiAssistantLoader />}>
            <CortiAssistantPanel interactionData={interactionData} />
          </Suspense>
        </SectionCard>

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