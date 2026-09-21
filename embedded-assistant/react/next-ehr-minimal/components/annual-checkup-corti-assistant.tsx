import { Suspense } from "react";
import { CortiAssistantLoader } from "@/components/corti-assistant-loader";
import { CortiAssistantPanel } from "@/components/corti-assistant-panel";
import { SectionCard } from "@/components/ui";
import { buildCortiAssistantVisitConfig } from "@/lib/corti-assistant-visit-config";
import type { AppointmentDetail, PatientDetail } from "@/lib/ehr-types";

type AnnualCheckupCortiAssistantProps = {
  detail: AppointmentDetail | PatientDetail;
};

export function AnnualCheckupCortiAssistant({ detail }: AnnualCheckupCortiAssistantProps) {
  const appointment = "appointment" in detail ? detail.appointment : null;
  const reason = appointment?.reason ?? "Annual checkup";
  const encounterIdentifier = appointment
    ? `appointment-${appointment.id}`
    : `patient-${detail.patient.id}-annual-checkup`;

  return (
    <SectionCard className="p-5">
      <Suspense fallback={<CortiAssistantLoader />}>
        <CortiAssistantPanel
          encounterIdentifier={encounterIdentifier}
          visitConfig={buildCortiAssistantVisitConfig({
            patient: detail.patient,
            reason,
          })}
        />
      </Suspense>
    </SectionCard>
  );
}