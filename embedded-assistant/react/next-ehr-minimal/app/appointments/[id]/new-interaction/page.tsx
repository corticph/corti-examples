import { notFound } from "next/navigation";
import { AnnualCheckupCortiAssistant } from "@/components/annual-checkup-corti-assistant";
import { ConsultationForm } from "@/components/consultation-form";
import { EhrSidebar } from "@/components/ehr-sidebar";
import { BackActions } from "@/components/ehr-parts";
import { PageShell, SectionCard } from "@/components/ui";
import { getAppointmentDetail } from "@/lib/ehr-db";
import { formatDateTime } from "@/lib/ehr-utils";
import { getConsultationTemplate } from "@/lib/consultation-templates";

export default async function NewInteractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getAppointmentDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { appointment, patient } = detail;
  const template = getConsultationTemplate(appointment.consultationType);

  return (
    <PageShell sidebar={<EhrSidebar activePath="/appointments" />}>
      <div className="space-y-6">
        <BackActions patientId={patient.id} appointmentId={appointment.id} />

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              New consultation
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{template.label}</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {patient.fullName} · {appointment.reason} · {formatDateTime(appointment.startsAt)} ·{" "}
              {appointment.clinician}
            </p>
          </div>
        </header>

        {appointment.consultationType === "annual-checkup" ? (
          <AnnualCheckupCortiAssistant detail={detail} />
        ) : null}

        <SectionCard className="p-5">
          <ConsultationForm
            appointmentId={appointment.id}
            patientId={patient.id}
            consultationType={appointment.consultationType}
            clinician={appointment.clinician}
            reason={appointment.reason}
          />
        </SectionCard>
      </div>
    </PageShell>
  );
}
