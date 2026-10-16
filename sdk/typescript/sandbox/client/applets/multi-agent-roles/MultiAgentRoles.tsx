/**
 * Applet — CONCEPT: role-scoped multi-agent tool access
 * (`client.agents.create` with per-expert `mcpServers`), plus a routing
 * trace across several requests, including one that needs both experts and
 * one that matches neither and should escalate to a human.
 *
 * This is a narrative applet: wiring a real orchestrator with real MCP
 * servers needs external tool infrastructure this sandbox cannot assume you
 * have. Instead, it renders the two ways teams structure this, tool access
 * scoped per expert (correct) versus one shared list on the orchestrator
 * (the common mistake), and simulates the orchestrator's routing decision
 * for several sample requests so the routing logic is visible, not abstract.
 */
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { cn } from "../../lib/utils";
import { useSessionState } from "../_shared/sessionState";

const FRONT_DESK_TOOLS = ["scheduling-mcp", "patient-lookup-mcp"];
const CLINICAL_TOOLS = ["facts-mcp", "coding-mcp"];

type ExpertId = "front-desk" | "clinical-notes";

const FRONT_DESK_KEYWORDS = [
  "reschedule",
  "appointment",
  "schedule",
  "book",
  "cancel",
  "insurance",
  "address",
  "phone",
];
const CLINICAL_KEYWORDS = [
  "code",
  "icd",
  "cpt",
  "diagnosis",
  "note",
  "symptom",
  "lab",
  "medication",
  "fact",
];

const SAMPLE_REQUESTS = [
  "Reschedule my appointment to next Tuesday",
  "What ICD-10 code fits uncontrolled type 2 diabetes?",
  "Reschedule my visit, and also let me know about the lab result mentioned in my last note",
  "What's the weather like tomorrow?",
];

function matchExperts(request: string): ExpertId[] {
  const lower = request.toLowerCase();
  const matched: ExpertId[] = [];
  if (FRONT_DESK_KEYWORDS.some((k) => lower.includes(k))) {
    matched.push("front-desk");
  }
  if (CLINICAL_KEYWORDS.some((k) => lower.includes(k))) {
    matched.push("clinical-notes");
  }
  return matched;
}

function mockResponse(expert: ExpertId): string {
  return expert === "front-desk"
    ? "[front-desk, scheduling-mcp / patient-lookup-mcp] Found the appointment and updated it."
    : "[clinical-notes, facts-mcp / coding-mcp] Pulled the relevant fact and returned it for review.";
}

export function MultiAgentRoles() {
  const [scoped, setScoped] = useSessionState("scoped", true);
  const [request, setRequest] = useSessionState("request", SAMPLE_REQUESTS[0]);
  const [trace, setTrace] = useSessionState<{
    request: string;
    matched: ExpertId[];
  } | null>("trace", null);

  const send = () => {
    setTrace({ request, matched: matchExperts(request) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Role-scoped agents: front desk and clinical notes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One orchestrator, two experts. Tool access is scoped per expert via{" "}
          <code>mcpServers</code>, not shared across the whole agent.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant={scoped ? "default" : "outline"} onClick={() => setScoped(true)}>
          Scoped per expert (correct)
        </Button>
        <Button
          size="sm"
          variant={!scoped ? "default" : "outline"}
          onClick={() => setScoped(false)}
        >
          Shared on orchestrator (common mistake)
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-md border border-corti-lime/50 bg-corti-lime/5 px-4 py-2 text-sm font-semibold text-foreground">
          Orchestrator
        </div>
        {!scoped && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {[...FRONT_DESK_TOOLS, ...CLINICAL_TOOLS].map((tool) => (
              <Badge key={tool} variant="destructive">
                {tool}
              </Badge>
            ))}
          </div>
        )}
        <div className="h-6 w-px bg-border" />
        <div className="grid w-full items-start gap-4 sm:grid-cols-2">
          <div
            className={cn(
              "rounded-md border p-3",
              scoped ? "border-border" : "border-dashed border-border",
            )}
          >
            <p className="text-sm font-semibold text-foreground">Front desk expert</p>
            <p className="mt-1 text-xs text-muted-foreground">scheduling, patient lookup</p>
            {scoped && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FRONT_DESK_TOOLS.map((tool) => (
                  <Badge key={tool} variant="outline">
                    {tool}
                  </Badge>
                ))}
              </div>
            )}
            {!scoped && (
              <p className="mt-2 text-xs text-variant-error-foreground">
                given the same full mcpServers list as every other expert, including clinical tools
                it should never call
              </p>
            )}
          </div>
          <div
            className={cn(
              "rounded-md border p-3",
              scoped ? "border-border" : "border-dashed border-border",
            )}
          >
            <p className="text-sm font-semibold text-foreground">Clinical notes expert</p>
            <p className="mt-1 text-xs text-muted-foreground">facts extraction, coding</p>
            {scoped && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CLINICAL_TOOLS.map((tool) => (
                  <Badge key={tool} variant="outline">
                    {tool}
                  </Badge>
                ))}
              </div>
            )}
            {!scoped && (
              <p className="mt-2 text-xs text-variant-error-foreground">
                given the same full mcpServers list as every other expert, including scheduling
                tools it has no business calling
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Send a request, see how the orchestrator routes it
        </h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SAMPLE_REQUESTS.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setRequest(sample)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {sample.length > 36 ? `${sample.slice(0, 36)}…` : sample}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-start gap-2">
          <Textarea
            rows={2}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            className="w-full text-sm"
          />
          <Button onClick={send}>Send</Button>
        </div>

        {trace && (
          <div className="mt-3 rounded-md border border-border p-3">
            <p className="text-sm text-foreground">"{trace.request}"</p>
            {trace.matched.length === 0 && (
              <p className="mt-2 text-sm text-variant-error-foreground">
                No expert's tool set matches this request. Escalate to a human rather than guessing
                with the wrong expert.
              </p>
            )}
            {trace.matched.length === 1 && (
              <div className="mt-2 space-y-1">
                <Badge variant="outline">routed to {trace.matched[0]}</Badge>
                <p className="text-sm text-muted-foreground">{mockResponse(trace.matched[0])}</p>
              </div>
            )}
            {trace.matched.length > 1 && (
              <div className="mt-2 space-y-1">
                <Badge variant="secondary">routed to both, orchestrator combines the results</Badge>
                {trace.matched.map((expert) => (
                  <p key={expert} className="text-sm text-muted-foreground">
                    {mockResponse(expert)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
