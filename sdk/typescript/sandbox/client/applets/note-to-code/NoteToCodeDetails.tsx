import { CodingSettings } from "../_shared/CodingSettings";
import { updateNoteToCodeSystems, useNoteToCodeStore } from "./api";

export function NoteToCodeDetails() {
  const { systems } = useNoteToCodeStore();
  return (
    <CodingSettings
      systems={systems}
      onSystemsChange={updateNoteToCodeSystems}
      description="Direct call to Corti's coding API — no interaction or agent required."
    />
  );
}
