/**
 * useInteractions — list, create, and select patient interactions.
 *
 * Corti interactions sorted by scheduled visit date serve as the visit
 * schedule. Supports auto-select by MRN or encounter identifier for
 * EHR integrations that pass patient context to the host application.
 */
import type { Corti, CortiClient } from "@corti/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VisitItem } from "./workspaceState";

function mapInteractionToVisit(interaction: Corti.InteractionsGetResponse): VisitItem {
  return {
    interactionId: interaction.id,
    encounter: {
      identifier: interaction.encounter.identifier,
      status: interaction.encounter.status,
      type: interaction.encounter.type,
      period: {
        startedAt: interaction.encounter.period.startedAt
          ? new Date(interaction.encounter.period.startedAt).toISOString()
          : new Date(interaction.createdAt).toISOString(),
        endedAt: interaction.encounter.period.endedAt
          ? new Date(interaction.encounter.period.endedAt).toISOString()
          : null,
      },
      title: interaction.encounter.title ?? null,
    },
    patient: interaction.patient
      ? {
          identifier: interaction.patient.identifier,
          name: interaction.patient.name ?? null,
          gender: interaction.patient.gender ?? null,
          birthDate: interaction.patient.birthDate
            ? new Date(interaction.patient.birthDate).toISOString()
            : null,
          pronouns: interaction.patient.pronouns ?? null,
        }
      : undefined,
    assignedUserId: interaction.assignedUserId,
    createdAt: new Date(interaction.createdAt).toISOString(),
  };
}

export interface UseInteractionsResult {
  visits: VisitItem[];
  loading: boolean;
  error: string | null;
  selectedVisitId: string | null;
  selectVisit: (id: string | null) => void;
  refresh: () => Promise<void>;
  createVisit: (params: {
    patientIdentifier: string;
    patientName: string;
    scheduledAt: Date;
    encounterType?: string;
  }) => Promise<string>;
  updateVisit: (params: {
    interactionId: string;
    patientName?: string;
    patientIdentifier?: string;
    encounterTitle?: string;
    encounterType?: string;
    encounterStatus?: string;
    scheduledAt?: Date;
  }) => Promise<void>;
  autoSelectByPatient: (mrn: string) => void;
  autoSelectByEncounter: (encounterId: string) => void;
}

export function useInteractions(client: CortiClient | null): UseInteractionsResult {
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const requestedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!client) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await client.interactions.list({
        pageSize: 50,
      });
      const items: VisitItem[] = [];
      for await (const interaction of page) {
        items.push(mapInteractionToVisit(interaction));
      }
      // Sort by scheduled visit date (encounter.period.startedAt), newest first
      items.sort(
        (a, b) =>
          new Date(b.encounter.period.startedAt).getTime() -
          new Date(a.encounter.period.startedAt).getTime(),
      );
      setVisits(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visits");
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Fetch once when the client is ready.
  useEffect(() => {
    if (!client || requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    void refresh();
  }, [client, refresh]);

  const createVisit = useCallback(
    async (params: {
      patientIdentifier: string;
      patientName: string;
      scheduledAt: Date;
      encounterType?: string;
    }) => {
      if (!client) {
        throw new Error("SDK client not ready");
      }
      const { interactionId } = await client.interactions.create({
        encounter: {
          identifier: `enc-${crypto.randomUUID()}`,
          status: "planned",
          type: (params.encounterType ?? "outpatient") as
            | "first_consultation"
            | "consultation"
            | "emergency"
            | "inpatient"
            | "outpatient",
          period: {
            startedAt: params.scheduledAt,
          },
          title: params.patientName,
        },
        patient: {
          identifier: params.patientIdentifier,
          name: params.patientName,
        },
      });
      await refresh();
      setSelectedVisitId(interactionId);
      return interactionId;
    },
    [client, refresh],
  );

  const updateVisit = useCallback(
    async (params: {
      interactionId: string;
      patientName?: string;
      patientIdentifier?: string;
      encounterTitle?: string;
      encounterType?: string;
      encounterStatus?: string;
      scheduledAt?: Date;
    }) => {
      if (!client) {
        throw new Error("SDK client not ready");
      }
      await client.interactions.update(params.interactionId, {
        patient: {
          name: params.patientName,
          identifier: params.patientIdentifier,
        },
        encounter: {
          title: params.encounterTitle,
          type: params.encounterType as
            | "first_consultation"
            | "consultation"
            | "emergency"
            | "inpatient"
            | "outpatient",
          status: params.encounterStatus as
            | "planned"
            | "in-progress"
            | "on-hold"
            | "completed"
            | "cancelled"
            | "deleted",
          period: params.scheduledAt
            ? {
                startedAt: params.scheduledAt,
              }
            : undefined,
        },
      });
      await refresh();
    },
    [client, refresh],
  );

  const autoSelectByPatient = useCallback(
    (mrn: string) => {
      const match = visits.find((v) => v.patient?.identifier === mrn);
      if (match) {
        setSelectedVisitId(match.interactionId);
      }
    },
    [visits],
  );

  const autoSelectByEncounter = useCallback(
    (encounterId: string) => {
      const match = visits.find((v) => v.encounter.identifier === encounterId);
      if (match) {
        setSelectedVisitId(match.interactionId);
      }
    },
    [visits],
  );

  return {
    visits,
    loading,
    error,
    selectedVisitId,
    selectVisit: setSelectedVisitId,
    refresh,
    createVisit,
    updateVisit,
    autoSelectByPatient,
    autoSelectByEncounter,
  };
}
