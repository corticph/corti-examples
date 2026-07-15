/** Details card: request shape + parameters for GET /v2/languages. */
import { ENDPOINT_FILTERS } from "./languages-api";

export function LanguagesDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Request
        </p>
        <p className="mt-1 font-mono text-foreground">
          GET https://api.&lt;cluster&gt;.corti.app/v2/languages/
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Headers
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>Authorization: Bearer &lt;token&gt;</code>
          </li>
          <li>
            <code>Tenant-Name: &lt;tenant&gt;</code>
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Query parameter
        </p>
        <p className="mt-1 text-muted-foreground">
          Optional <code>endpoint</code> ={" "}
          {ENDPOINT_FILTERS.map((ep, i) => (
            <span key={ep}>
              {i > 0 && " | "}
              <code>{ep}</code>
            </span>
          ))}
          . Omit it (the “All endpoints” option) to list every language.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Availability is reported per endpoint — a language can be enabled for
        transcribe but not streams or transcripts. See the{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/api-reference/languages/list-languages"
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
