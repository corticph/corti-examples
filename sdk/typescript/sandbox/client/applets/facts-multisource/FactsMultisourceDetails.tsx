/** Details card: client.facts.extract, stateless multi-document extraction. */
export function FactsMultisourceDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Request
        </p>
        <p className="mt-1 font-mono text-foreground">
          POST https://api.&lt;cluster&gt;.corti.ai/v2/facts/extract
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body</p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>context</code>: array of <code>{'{ type: "text", text }'}</code>, but the API only
            accepts a single entry per call — merge multiple source documents into that one entry's
            text, or issue a separate call per document
          </li>
          <li>
            <code>outputLanguage</code>: the language code for extracted facts
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Response
        </p>
        <p className="mt-1 text-muted-foreground">
          <code>facts</code>: a flat array of <code>{"{ group, text }"}</code> (<code>value</code>{" "}
          is deprecated in favor of <code>text</code>), plus <code>outputLanguage</code> and{" "}
          <code>usageInfo</code>.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        <code>extract</code> does not persist anything and needs no interaction id. For a fact list
        tied to an interaction that a user can edit later, use <code>client.facts.create</code> /{" "}
        <code>list</code> / <code>batchUpdate</code> instead. See the{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/api-reference"
          target="_blank"
          rel="noopener noreferrer"
        >
          API reference
        </a>
        .
      </p>
    </div>
  );
}
