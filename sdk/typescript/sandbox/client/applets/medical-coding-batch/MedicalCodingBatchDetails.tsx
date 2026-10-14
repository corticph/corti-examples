/** Details card: batching client.codes.predict across a document backlog. */
export function MedicalCodingBatchDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Call shape
        </p>
        <p className="mt-1 text-muted-foreground">
          One <code>client.codes.predict</code> call per document. There is no
          batch endpoint, batching is a client-side loop that aggregates{" "}
          <code>codes</code> and <code>candidates</code> across calls.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          filter
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>include</code>: condition objects restricting prediction to
            specific codes, e.g.{" "}
            <code>[{`{ property: "code", op: "is-a", value: ["E11"] }`}]</code>{" "}
            for diabetes only
          </li>
          <li>
            <code>exclude</code>: condition objects subtracting codes from the
            include set
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cost
        </p>
        <p className="mt-1 text-muted-foreground">
          Each call returns its own <code>usageInfo.creditsConsumed</code>. Sum
          it across the batch before reporting a total.
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
        for the full CodesFilter and coding system list.
      </p>
    </div>
  );
}
