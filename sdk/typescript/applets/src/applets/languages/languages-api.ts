/**
 * Data + types for the `GET /v2/languages/` endpoint, which reports which
 * languages are enabled per STT endpoint (transcribe / streams / transcripts).
 * See https://docs.corti.ai/api-reference/languages/list-languages
 */
import { buildApiUrl } from "../_shared/urls";

/** The three endpoints a language can be enabled for — also the filter values. */
export type EndpointFilter = "transcribe" | "streams" | "transcripts";

/** Dropdown options, in the order the app talks about the endpoints. */
export const ENDPOINT_FILTERS: EndpointFilter[] = [
  "transcribe",
  "streams",
  "transcripts",
];

interface EndpointAvailability {
  enabled: boolean;
}

interface LanguageEntry {
  endpoints?: {
    transcribe?: EndpointAvailability;
    streams?: EndpointAvailability;
    transcripts?: EndpointAvailability;
  };
}

export interface LanguagesResponse {
  languages: Record<string, LanguageEntry>;
}

/** One flattened, table-ready row per language code. */
export interface LanguageRow {
  code: string;
  transcribe: boolean;
  streams: boolean;
  transcripts: boolean;
}

/** Shape of the Corti error body (best-effort — fields are all optional). */
interface ApiErrorBody {
  detail?: string;
  type?: string;
  status?: number;
}

/**
 * Fetch the per-endpoint language availability map. When `endpoint` is passed,
 * appends `?endpoint=<value>` so the API returns only languages enabled for that
 * endpoint; omitting it returns the full map.
 */
export async function fetchLanguages(
  endpoint?: EndpointFilter,
): Promise<LanguagesResponse> {
  // Routed through the REST proxy, which injects Authorization + Tenant-Name.
  let url = `${buildApiUrl()}/v2/languages/`;
  if (endpoint) url += `?endpoint=${encodeURIComponent(endpoint)}`;

  const response = await fetch(url);

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = await response.json();
    } catch {
      /* non-JSON error body — fall through to the status message */
    }
    const message =
      body?.detail ||
      body?.type ||
      `${response.status} ${response.statusText}`.trim();
    throw new Error(message || `HTTP ${response.status}`);
  }

  return response.json();
}

/** Flatten the `languages` map into rows sorted by language code. */
export function toRows(resp: LanguagesResponse | null): LanguageRow[] {
  if (!resp?.languages) return [];
  return Object.entries(resp.languages)
    .map(([code, entry]) => ({
      code,
      transcribe: !!entry.endpoints?.transcribe?.enabled,
      streams: !!entry.endpoints?.streams?.enabled,
      transcripts: !!entry.endpoints?.transcripts?.enabled,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
