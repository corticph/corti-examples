import { CodingSettings } from "../_shared/CodingSettings";
import { updateCrosswalkSystems, useCrosswalkStore } from "./api";

export function CodeCrosswalkDetails() {
  const { systems } = useCrosswalkStore();
  return (
    <CodingSettings
      systems={systems}
      onSystemsChange={updateCrosswalkSystems}
      description="Single call with multiple systems — results are grouped by system in the main panel."
    />
  );
}
