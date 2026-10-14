/** Details card: request/response shape for client.codes.predict. */
export function MedicalCodingLiveDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Request
        </p>
        <p className="mt-1 font-mono text-foreground">
          POST https://api.&lt;cluster&gt;.corti.ai/v2/codes/predict
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body</p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>system</code>: array of coding systems, for example{" "}
            <code>icd10cm-outpatient</code> or <code>cpt</code>
          </li>
          <li>
            <code>context</code>: array of <code>{'{ type: "text", text }'}</code> or{" "}
            <code>{'{ type: "documentId", documentId }'}</code>
          </li>
          <li>
            optional <code>filter</code>: <code>include</code> and <code>exclude</code> as condition
            objects
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Response
        </p>
        <p className="mt-1 text-muted-foreground">
          <code>codes</code> (accepted) and <code>candidates</code> (lower confidence), each with{" "}
          <code>system</code>, <code>code</code>, <code>display</code>, and an{" "}
          <code>evidences</code> array pointing back at the <code>context</code> index that
          justified it.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        See the{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/api-reference"
          target="_blank"
          rel="noopener noreferrer"
        >
          API reference
        </a>{" "}
        for the full coding system list.
      </p>
    </div>
  );
}
