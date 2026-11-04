/**
 * Applet — CONCEPT: multi-source FactsR extraction, curated and persisted
 * (`client.facts.extract`, then `client.facts.create` against a real
 * interaction, verified with `client.facts.list`).
 *
 * A single extract() call only gets you a stateless preview. This applet
 * goes one step further: a reviewer curates which extracted facts to keep,
 * confirmed facts get persisted against a real interaction instead of just
 * living in memory, and a final list() call proves they are actually stored.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { useAuth } from "../../context/AuthContext";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";

interface SourceDoc {
  id: string;
  label: string;
  text: string;
}

interface CuratedFact {
  key: string;
  group: string;
  text: string;
  keep: boolean;
}

const SAMPLE_DOCS: SourceDoc[] = [
  {
    id: "referral",
    label: "Referral letter",
    text: "Referring patient for evaluation of persistent fatigue and unintentional weight loss over 3 months. Family history of colorectal cancer (father, age 58).",
  },
  {
    id: "intake",
    label: "Intake form",
    text: "Current medications: lisinopril 10mg daily. Allergies: penicillin (rash). Smoking status: former smoker, quit 2019.",
  },
  {
    id: "history",
    label: "History note",
    text: "Prior colonoscopy 2021, unremarkable. No prior surgeries. Lives alone, works as a teacher.",
  },
];

function describeFactsError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Facts request failed (403). Verify the token scope, tenant, and environment.";
  }
  return message;
}

export function FactsMultisource() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const { createInteraction } = useAuth();
  const [docs, setDocs] = useSessionState<SourceDoc[]>("docs", SAMPLE_DOCS);
  const [curated, setCurated] = useSessionState<CuratedFact[] | null>("curated", null);
  const [interactionId, setInteractionId] = useSessionState<string | null>("interactionId", null);
  const [persisted, setPersisted] = useSessionState<Corti.FactsListItem[] | null>(
    "persisted",
    null,
  );
  const [loading, setLoading] = useState<"combined" | "per-doc" | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [error, setError] = useSessionState<string | null>("error", null);

  const addDoc = () => {
    setDocs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: `Source ${prev.length + 1}`, text: "" },
    ]);
  };

  const updateDoc = (id: string, patch: Partial<SourceDoc>) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const toCurated = (facts: Corti.FactsExtractResponseFactsItem[]) =>
    facts.map((f, i) => ({
      key: `${f.group}:${i}:${f.text}`,
      group: f.group,
      text: f.text,
      keep: true,
    }));

  const runCombined = async () => {
    const active = docs.filter((d) => d.text.trim());
    if (active.length === 0) {
      return;
    }
    setLoading("combined");
    setError(null);
    setPersisted(null);
    setInteractionId(null);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
        analytics: EXAMPLES_ANALYTICS,
      });
      // The API allows exactly one context entry, so all documents are merged
      // into a single labeled text block rather than one entry per document.
      const combinedText = active.map((d) => `${d.label}:\n${d.text}`).join("\n\n");
      const response = await client.facts.extract({
        context: [{ type: "text", text: combinedText }],
        outputLanguage: "en",
      });
      setCurated(toCurated(response.facts));
    } catch (e) {
      setError(describeFactsError(e));
      setCurated(null);
    } finally {
      setLoading(null);
    }
  };

  const runPerDocument = async () => {
    const active = docs.filter((d) => d.text.trim());
    if (active.length === 0) {
      return;
    }
    setLoading("per-doc");
    setError(null);
    setPersisted(null);
    setInteractionId(null);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
        analytics: EXAMPLES_ANALYTICS,
      });
      const all: Corti.FactsExtractResponseFactsItem[] = [];
      for (const doc of active) {
        const response = await client.facts.extract({
          context: [{ type: "text", text: doc.text }],
          outputLanguage: "en",
        });
        all.push(...response.facts);
      }
      setCurated(toCurated(all));
    } catch (e) {
      setError(describeFactsError(e));
      setCurated(null);
    } finally {
      setLoading(null);
    }
  };

  const toggleKeep = (key: string) => {
    setCurated((prev) => prev?.map((f) => (f.key === key ? { ...f, keep: !f.keep } : f)) ?? null);
  };

  const confirmAndPersist = async () => {
    const selected = curated?.filter((f) => f.keep) ?? [];
    if (selected.length === 0) {
      return;
    }
    setPersisting(true);
    setError(null);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
        analytics: EXAMPLES_ANALYTICS,
      });
      const interaction = await createInteraction();
      setInteractionId(interaction.interactionId);
      await client.facts.create(interaction.interactionId, {
        facts: selected.map((f) => ({ text: f.text, group: f.group })),
      });
      const listing = await client.facts.list(interaction.interactionId);
      setPersisted(listing.facts);
    } catch (e) {
      setError(describeFactsError(e));
    } finally {
      setPersisting(false);
    }
  };

  const grouped = curated
    ? curated.reduce<Record<string, CuratedFact[]>>((acc, f) => {
        if (!acc[f.group]) {
          acc[f.group] = [];
        }
        acc[f.group].push(f);
        return acc;
      }, {})
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Multi-source FactsR extraction, curated and persisted
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Extract facts across several documents, curate which ones to keep, then persist the
          confirmed facts against a real interaction with <code>client.facts.create</code>.
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <div key={doc.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={doc.label}
                  onChange={(e) => updateDoc(doc.id, { label: e.target.value })}
                  className="h-8 min-w-0 flex-1 text-sm"
                />
                <Button size="sm" variant="ghost" onClick={() => removeDoc(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                rows={4}
                value={doc.text}
                onChange={(e) => updateDoc(doc.id, { text: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={addDoc}>
          <Plus className="h-3.5 w-3.5" /> Add source document
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runCombined} disabled={loading !== null}>
          {loading === "combined" && <Loader2 className="h-4 w-4 animate-spin" />}
          Extract: one call, all documents
        </Button>
        <Button variant="outline" onClick={runPerDocument} disabled={loading !== null}>
          {loading === "per-doc" && <Loader2 className="h-4 w-4 animate-spin" />}
          Extract: one call per document
        </Button>
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      {grouped && (
        <Tabs defaultValue="grouped">
          <TabsList>
            <TabsTrigger value="grouped">Curate</TabsTrigger>
            <TabsTrigger value="json">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="grouped" className="grid items-start gap-3 sm:grid-cols-2">
            {Object.entries(grouped).map(([group, facts]) => (
              <div key={group} className="rounded-md border border-border p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group} ({facts.length})
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                  {facts.map((fact) => (
                    <li key={fact.key} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={fact.keep}
                        onChange={() => toggleKeep(fact.key)}
                        className="mt-1 h-3.5 w-3.5 accent-corti-lime"
                      />
                      <span className={fact.keep ? "" : "text-muted-foreground line-through"}>
                        {fact.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="json">
            <Textarea
              value={JSON.stringify(grouped, null, 2)}
              readOnly
              className="min-h-[300px] font-mono text-sm"
            />
          </TabsContent>
        </Tabs>
      )}

      {curated && (
        <div>
          <Button onClick={confirmAndPersist} disabled={persisting}>
            {persisting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm & persist {curated.filter((f) => f.keep).length} selected fact(s)
          </Button>
        </div>
      )}

      {persisted && (
        <div className="rounded-md border border-corti-lime/50 bg-corti-lime/5 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Persisted to interaction {interactionId} ({persisted.length} fact(s))
          </h3>
          <ul className="space-y-1 text-sm text-foreground">
            {persisted.map((fact) => (
              <li key={fact.id} className="font-mono text-xs">
                [{fact.id}] {fact.group}: {fact.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
