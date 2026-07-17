/**
 * Data + types for the `GET /v2/languages/` endpoint, which reports which
 * languages are enabled per STT endpoint (transcribe / streams / transcripts).
 * See https://docs.corti.ai/api-reference/languages/list-languages
 */
import type { CortiClient } from "@corti/sdk";

/** The three endpoints a language can be enabled for — also the filter values. */
export type EndpointFilter = "transcribe" | "streams" | "transcripts";

/** Dropdown options, in the order the app talks about the endpoints. */
export const ENDPOINT_FILTERS: EndpointFilter[] = ["transcribe", "streams", "transcripts"];

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

/**
 * Fetch the per-endpoint language availability map. When `endpoint` is passed
 * the API returns only languages enabled for that endpoint; omitting it returns
 * the full map.
 */
export async function fetchLanguages(
  client: CortiClient,
  endpoint?: EndpointFilter,
): Promise<LanguagesResponse> {
  const data = await client.languages.list({ endpoint });
  return data as LanguagesResponse;
}

/** Flatten the `languages` map into rows sorted by language code. */
export function toRows(resp: LanguagesResponse | null): LanguageRow[] {
  if (!resp?.languages) {
    return [];
  }
  return Object.entries(resp.languages)
    .map(([code, entry]) => ({
      code,
      transcribe: !!entry.endpoints?.transcribe?.enabled,
      streams: !!entry.endpoints?.streams?.enabled,
      transcripts: !!entry.endpoints?.transcripts?.enabled,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
