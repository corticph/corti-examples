/**
 * Applet — CONCEPT: a hub-and-spoke network of narrow-tool specialist agents
 * (`client.agents.create`, mixing inline "new" experts with registry
 * "reference" experts), plus a chained delegation trace for a compound
 * question that needs more than one specialist in sequence.
 *
 * This is a narrative applet: wiring a real orchestrator with real MCP
 * servers and a populated expert registry needs infrastructure specific to
 * your deployment. Instead, it renders the hub-and-spoke shape, lets you
 * inspect the request payload for each spoke, and simulates a compound
 * question being decomposed and answered one specialist at a time.
 */
import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { useSessionState } from "../_shared/sessionState";

interface ChainStep {
  spokeId: string;
  spokeName: string;
  output: string;
}

interface CompoundQuestion {
  id: string;
  question: string;
  chain: ChainStep[];
  final: string;
}

const COMPOUND_QUESTIONS: CompoundQuestion[] = [
  {
    id: "dose-interaction",
    question:
      "What is the correct pediatric dose of amoxicillin for a 20kg child, and are there interactions with their current lisinopril?",
    chain: [
      {
        spokeId: "literature",
        spokeName: "literature-search",
        output: "No clinically significant interaction found between amoxicillin and lisinopril.",
      },
      {
        spokeId: "calculator",
        spokeName: "dosage-calculator",
        output:
          "Weight-based pediatric dose: 20kg x 25mg/kg/day = 500mg/day, divided into two doses.",
      },
    ],
    final: "500mg/day divided into two doses. No interaction concern with lisinopril.",
  },
  {
    id: "interaction-coding",
    question:
      "Check interactions between warfarin and grapefruit, and suggest an ICD-10 code for atrial fibrillation for the chart.",
    chain: [
      {
        spokeId: "literature",
        spokeName: "literature-search",
        output: "Grapefruit can increase warfarin's anticoagulant effect; monitor INR closely.",
      },
      {
        spokeId: "registry",
        spokeName: "coding-specialist",
        output: "Suggested code: I48.91, unspecified atrial fibrillation.",
      },
    ],
    final:
      "Monitor INR due to a grapefruit and warfarin interaction. Suggested code I48.91 for review.",
  },
];

interface Spoke {
  id: string;
  name: string;
  description: string;
  tool: string;
  kind: "new" | "reference";
  code: string;
}

const SPOKES: Spoke[] = [
  {
    id: "literature",
    name: "literature-search",
    description: "Looks up drug interactions and clinical literature",
    tool: "web-search-mcp",
    kind: "new",
    code: `{
  type: "new",
  name: "literature-search",
  description: "Looks up drug interactions and clinical literature",
  systemPrompt: "Answer only using search results. Cite sources.",
  mcpServers: [{ name: "web-search-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/search" }],
}`,
  },
  {
    id: "calculator",
    name: "dosage-calculator",
    description: "Computes weight-based dosing and unit conversions",
    tool: "calculator-mcp",
    kind: "new",
    code: `{
  type: "new",
  name: "dosage-calculator",
  description: "Computes weight-based dosing and unit conversions",
  mcpServers: [{ name: "calculator-mcp", transportType: "http", authorizationType: "bearer", url: "https://tools.example.com/calc" }],
}`,
  },
  {
    id: "registry",
    name: "coding-specialist (registry)",
    description: "A pre-built expert reused from the shared expert registry",
    tool: "coding-mcp (inherited from registry)",
    kind: "reference",
    code: `{
  type: "reference",
  name: "coding-specialist",
  config: { defaultSystems: ["icd10cm-outpatient", "cpt"] },
}`,
  },
];

export function MultiAgentSpecialists() {
  const [active, setActive] = useState<string>(SPOKES[0].id);
  const spoke = SPOKES.find((s) => s.id === active) ?? SPOKES[0];

  const [question, setQuestion] = useState<CompoundQuestion>(COMPOUND_QUESTIONS[0]);
  const [revealed, setRevealed] = useSessionState("revealed", 0);

  const pickQuestion = (q: CompoundQuestion) => {
    setQuestion(q);
    setRevealed(0);
  };

  const advance = () => {
    setRevealed((prev) => Math.min(prev + 1, question.chain.length + 1));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Narrow-tool specialist network</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One orchestrator delegates to single-purpose specialists, each with exactly one
          capability. Click a spoke to see its expert definition.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-md border border-corti-lime/50 bg-corti-lime/5 px-4 py-2 text-sm font-semibold text-foreground">
          Orchestrator
        </div>
        <div className="grid w-full items-start gap-3 sm:grid-cols-3">
          {SPOKES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                "rounded-md border p-3 text-left transition-colors",
                s.id === active
                  ? "border-corti-lime bg-corti-lime/5"
                  : "border-border hover:bg-accent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <Badge variant={s.kind === "reference" ? "secondary" : "outline"}>{s.kind}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">{s.tool}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Expert definition: {spoke.name}
        </h3>
        <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground">
          {spoke.code}
        </pre>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          A compound question, delegated one specialist at a time
        </h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {COMPOUND_QUESTIONS.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => pickQuestion(q)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                q.id === question.id
                  ? "border-corti-lime text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {q.id}
            </button>
          ))}
        </div>
        <p className="mb-2 text-sm text-foreground">"{question.question}"</p>

        <div className="space-y-2">
          {question.chain.map((step, i) => (
            <div
              key={step.spokeId}
              className={cn(
                "rounded-md border p-2 text-sm",
                i < revealed
                  ? "border-border"
                  : "border-dashed border-border text-muted-foreground",
              )}
            >
              <Badge variant="outline">{step.spokeName}</Badge>
              {i < revealed ? (
                <p className="mt-1 text-muted-foreground">{step.output}</p>
              ) : (
                <p className="mt-1 italic">not called yet</p>
              )}
            </div>
          ))}
          <div
            className={cn(
              "rounded-md border p-2 text-sm",
              revealed > question.chain.length
                ? "border-corti-lime/50 bg-corti-lime/5"
                : "border-dashed border-border text-muted-foreground",
            )}
          >
            <Badge variant="secondary">orchestrator: combined answer</Badge>
            {revealed > question.chain.length ? (
              <p className="mt-1 text-foreground">{question.final}</p>
            ) : (
              <p className="mt-1 italic">waiting on specialists above</p>
            )}
          </div>
        </div>

        {revealed <= question.chain.length && (
          <Button size="sm" className="mt-2" onClick={advance}>
            {revealed === question.chain.length
              ? "Combine into final answer"
              : `Call ${question.chain[revealed]?.spokeName}`}
          </Button>
        )}
      </div>
    </div>
  );
}
