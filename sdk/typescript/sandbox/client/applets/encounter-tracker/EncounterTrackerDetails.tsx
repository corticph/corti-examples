import { CodingSettings } from "../_shared/CodingSettings";
import { updateTrackerSystems, useEncounterTrackerStore } from "./api";

export function EncounterTrackerDetails() {
  const { systems } = useEncounterTrackerStore();
  return (
    <CodingSettings
      systems={systems}
      onSystemsChange={updateTrackerSystems}
      description="All encounters are coded with the same system set. The matrix shows code persistence across visits."
    />
  );
}
