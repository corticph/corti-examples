import { CodingSettings } from "../_shared/CodingSettings";
import { updateValidatorSystems, useCodeValidatorStore } from "./api";

export function CodeValidatorDetails() {
  const { systems } = useCodeValidatorStore();
  return (
    <CodingSettings
      systems={systems}
      onSystemsChange={updateValidatorSystems}
      description="Compares your proposed codes against the API's predictions for confirmed, missed, and unsupported codes."
    />
  );
}
