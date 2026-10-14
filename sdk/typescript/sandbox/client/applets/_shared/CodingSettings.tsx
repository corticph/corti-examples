const KNOWN_SYSTEMS: { id: string; label: string }[] = [
  { id: "icd10cm-outpatient", label: "ICD-10-CM (Outpatient)" },
  { id: "icd10cm-inpatient", label: "ICD-10-CM (Inpatient)" },
  { id: "icd10pcs", label: "ICD-10-PCS" },
  { id: "cpt", label: "CPT" },
  { id: "snomed-ct", label: "SNOMED CT" },
  { id: "loinc", label: "LOINC" },
  { id: "hcpcs", label: "HCPCS" },
];

interface Props {
  systems: string[];
  onSystemsChange: (systems: string[]) => void;
  description?: string;
}

export function CodingSettings({ systems, onSystemsChange, description }: Props) {
  const toggle = (id: string) => {
    onSystemsChange(systems.includes(id) ? systems.filter((s) => s !== id) : [...systems, id]);
  };

  const unknown = systems.filter((s) => !KNOWN_SYSTEMS.some((k) => k.id === s));

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          SDK call
        </p>
        <p className="mt-1 font-mono text-xs text-foreground">client.codes.predict()</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coding systems
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {KNOWN_SYSTEMS.map(({ id, label }) => (
            <label key={id} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={systems.includes(id)}
                onChange={() => toggle(id)}
                className="h-3.5 w-3.5 rounded border-border accent-foreground"
              />
              <span className="text-sm text-foreground">{label}</span>
              <span className="font-mono text-xs text-muted-foreground">({id})</span>
            </label>
          ))}
        </div>

        {unknown.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">Also active (not in the list above):</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {unknown.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggle(s)}
                  className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                  title="Click to remove"
                >
                  {s} ×
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          System identifiers must match values enabled for your Corti cluster. Settings saved to
          localStorage.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Calls <code>client.codes.predict()</code> with the selected systems.
          </li>
          <li>
            <code>codes</code>: confirmed predictions. <code>candidates</code>: lower-confidence
            suggestions.
          </li>
          <li>
            Multiple systems in a single call; results include codes from each requested system.
          </li>
        </ul>
      </div>
    </div>
  );
}
