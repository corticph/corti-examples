import { CodingSettings } from "../_shared/CodingSettings";
import { updateEvidenceCodingSystems, useEvidenceCodingStore } from "./api";

export function EvidenceCodingDetails() {
  const { systems } = useEvidenceCodingStore();
  return (
    <CodingSettings
      systems={systems}
      onSystemsChange={updateEvidenceCodingSystems}
      description="The response includes evidences[] — character offset spans into the source text that support each code."
    />
  );
}
