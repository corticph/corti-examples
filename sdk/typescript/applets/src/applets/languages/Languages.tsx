/**
 * Applet — CONCEPT: the `GET /v2/languages/` REST endpoint.
 *
 * Pick an optional endpoint filter, click Fetch, and the authenticated GET runs
 * against the live cluster. Results render as a per-endpoint availability table
 * or as the raw JSON body.
 */

import { CortiClient } from "@corti/sdk";
import { Check, Copy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import {
  ENDPOINT_FILTERS,
  type EndpointFilter,
  fetchLanguages,
  type LanguagesResponse,
  toRows,
} from "./languages-api";

type Filter = EndpointFilter | "all";

const COLUMNS: EndpointFilter[] = ENDPOINT_FILTERS;

function AvailabilityCell({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Check className="mx-auto h-4 w-4 text-lime-600 dark:text-corti-lime" aria-label="enabled" />
  ) : (
    <span className="sr-only">not enabled</span>
  );
}

export function Languages() {
  const { refreshAccessToken, sdkEnvironment } = useCortiAccessToken();
  const client = useMemo(
    () => new CortiClient({ environment: sdkEnvironment, auth: { refreshAccessToken } }),
    [sdkEnvironment, refreshAccessToken],
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [data, setData] = useState<LanguagesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLanguages(client, filter === "all" ? undefined : filter);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const rows = toRows(data);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Languages (GET /v2/languages)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          List the languages Corti speech to text supports, with which endpoints each is enabled
          for. Optionally filter to a single endpoint, then fetch.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)} disabled={loading}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All endpoints</SelectItem>
            {ENDPOINT_FILTERS.map((ep) => (
              <SelectItem key={ep} value={ep}>
                {ep}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleFetch} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Fetch languages
        </Button>
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      {!data && !error && (
        <p className="text-sm text-muted-foreground">
          No results yet — pick an endpoint filter (or leave on “All endpoints”) and fetch.
        </p>
      )}

      {data && (
        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="json">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No languages returned.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left">
                      <th className="px-3 py-2 font-bold">Language</th>
                      {COLUMNS.map((col) => (
                        <th key={col} className="px-3 py-2 text-center font-bold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row.code}
                        className={cn(
                          "border-b border-border last:border-0",
                          i % 2 === 1 ? "bg-muted" : "bg-background",
                        )}
                      >
                        <td className="px-3 py-2 font-mono text-foreground">{row.code}</td>
                        <td className="px-3 py-2">
                          <AvailabilityCell enabled={row.transcribe} />
                        </td>
                        <td className="px-3 py-2">
                          <AvailabilityCell enabled={row.streams} />
                        </td>
                        <td className="px-3 py-2">
                          <AvailabilityCell enabled={row.transcripts} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="json" className="space-y-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
              >
                <Copy className="h-4 w-4" /> Copy JSON
              </Button>
            </div>
            <Textarea
              value={JSON.stringify(data, null, 2)}
              readOnly
              className="min-h-[300px] font-mono text-sm"
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
