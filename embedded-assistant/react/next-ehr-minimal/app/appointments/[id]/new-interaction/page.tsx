import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ConsultationForm } from "@/components/consultation-form";
import { CortiAssistantLoader } from "@/components/corti-assistant-loader";
import { CortiAssistantPanel } from "@/components/corti-assistant-panel";
import { EhrSidebar } from "@/components/ehr-sidebar";
import { BackActions } from "@/components/ehr-parts";
import { type CortiAssistantInteractionData } from "@/components/corti-assistant-types";
import { PageShell, SectionCard } from "@/components/ui";
import { getAppointmentDetail } from "@/lib/ehr-db";
import { formatDateTime } from "@/lib/ehr-utils";

export default async function NewInteractionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = getAppointmentDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { appointment, patient } = detail;

  const interactionData: CortiAssistantInteractionData = {
    assignedUserId: null,
    encounter: {
      identifier: `appointment-${appointment.id}-${new Date().getTime()}`,
      status: "planned",
      type: "first_consultation",
      period: { startedAt: new Date().toISOString() },
    },
  };

  return (
    <PageShell sidebar={<EhrSidebar activePath="/appointments" />}>
      <div className="space-y-6">
        <BackActions patientId={patient.id} appointmentId={appointment.id} />

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              New consultation
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              {patient.fullName}
            </h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {appointment.reason} · {formatDateTime(appointment.startsAt)} ·{" "}
              {appointment.clinician}
            </p>
          </div>
        </header>

        <SectionCard className="p-5">
          <Suspense fallback={<CortiAssistantLoader />}>
            <CortiAssistantPanel interactionData={interactionData} />
          </Suspense>
        </SectionCard>

        <SectionCard className="p-5">
          <ConsultationForm
            appointmentId={appointment.id}
            clinician={appointment.clinician}
            reason={appointment.reason}
          />
        </SectionCard>
      </div>
    </PageShell>
  );
}
