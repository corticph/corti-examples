import { Link, useParams } from "react-router-dom";
import { RequestRunner } from "../components/RequestRunner";
import { endpointById } from "../endpoints/registry";
import { StreamsRunner } from "../streams/StreamsRunner";
import { TranscribeRunner } from "../transcribe/TranscribeRunner";

export function EndpointPage() {
  const { id } = useParams<{ id: string }>();
  const endpoint = id ? endpointById[id] : undefined;

  if (!endpoint) {
    return (
      <div className="rounded-lg border border-muted-300/60 bg-paper p-6 text-sm">
        Endpoint <code>{id}</code> not found.{" "}
        <Link to="/endpoints" className="underline">
          Back to catalog
        </Link>
        .
      </div>
    );
  }

  // Streams is a WebSocket-based surface and doesn't fit the REST form-and-send runner.
  // It has its own page-level component that handles mic capture, ws lifecycle, and a live
  // event log. /transcribe is the same protocol minus interaction binding — slimmer runner.
  if (endpoint.id === "streams.connect") {
    return <StreamsRunner />;
  }
  if (endpoint.id === "transcribe.connect") {
    return <TranscribeRunner />;
  }

  // Keep the page header tight: just the label. Longer description (if any) lives in a
  // collapsible underneath, so it doesn't drown the form.
  const summary = endpoint.description?.split(". ")[0] ?? "";
  const hasMore = endpoint.description && endpoint.description.length > summary.length + 1;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{endpoint.label}</h1>
        {summary && <p className="mt-1 text-sm text-muted-700">{summary}.</p>}
        {hasMore && (
          <details className="mt-1 text-xs text-muted-500">
            <summary className="cursor-pointer">More info</summary>
            <p className="mt-1">{endpoint.description}</p>
          </details>
        )}
      </header>

      {/* Keying on endpoint.id forces a full remount when the route changes — clears the
          response/error panel, form values, and any picked files from the previous endpoint. */}
      <RequestRunner key={endpoint.id} endpoint={endpoint} />
    </div>
  );
}
