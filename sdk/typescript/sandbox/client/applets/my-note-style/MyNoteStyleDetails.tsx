/**
 * Details card for the My Note Style applet — explains how the generate →
 * edit → store to memory → regenerate loop works and what building blocks
 * it uses.
 */
import { Brain, FileText, RefreshCw, Sparkles } from "lucide-react";

export function MyNoteStyleDetails() {
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-foreground">The loop</h3>
        <ol className="ml-4 space-y-1.5 list-decimal">
          <li>
            <strong className="text-foreground">Generate</strong> — a note is generated from a
            transcript against a Corti Standard template (
            <code className="text-[12px]">client.documents.generate</code>).
          </li>
          <li>
            <strong className="text-foreground">Edit</strong> — the clinician edits the generated
            note section by section in the main panel.
          </li>
          <li>
            <strong className="text-foreground">Store to memory</strong> — each edited section is
            sent to an agent (<code className="text-[12px]">client.agents.*</code>) that interprets
            the diff and proposes a template prompt update (
            <code className="text-[12px]">contentPrompt</code>,
            <code className="text-[12px]">writingStylePrompt</code>, or
            <code className="text-[12px]">miscPrompt</code>).
          </li>
          <li>
            <strong className="text-foreground">Regenerate & compare</strong> — the same transcript
            is generated twice in parallel: once with no overrides (baseline) and once with the
            accumulated memory applied as runtime{" "}
            <code className="text-[12px]">templateRef.overrides</code>. The side-by-side comparison
            shows how much the learning changed the output.
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-foreground">How edits become rules</h3>
        <p>
          The agent interprets each edit and routes it to the right prompt surface automatically —
          the clinician doesn't need to think about classification:
        </p>
        <ul className="ml-4 space-y-1 list-disc">
          <li>
            <strong className="text-foreground">Writing style</strong> — phrasing, terseness,
            abbreviation usage, tone. These become
            <code className="text-[12px]">writingStylePrompt</code> overrides.
          </li>
          <li>
            <strong className="text-foreground">Content</strong> — what clinical information belongs
            in the section. These become
            <code className="text-[12px]">contentPrompt</code> overrides.
          </li>
          <li>
            <strong className="text-foreground">Rules</strong> — non-negotiable instructions
            ("always include medication dosages", "never abbreviate in this section"). These
            accumulate into a <code className="text-[12px]">miscPrompt</code> block under a "Very
            important rules" heading.
          </li>
        </ul>
        <p>
          Clinicians can also add a rule manually from the memory log panel — picking a section and
          typing the instruction — without going through an edit cycle.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-foreground">Building blocks</h3>
        <div className="grid gap-2">
          <div className="flex items-start gap-2">
            <FileText size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <code className="text-[12px]">client.documents.generate</code> — note generation (with
              and without overrides)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Brain size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <code className="text-[12px]">client.agents.*</code> — the My Note Style Memory agent
              interprets edits
            </span>
          </div>
          <div className="flex items-start gap-2">
            <RefreshCw size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <code className="text-[12px]">templateRef.overrides</code> — runtime overrides, base
              template never mutated
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              localStorage persistence — memory entries survive page refresh, namespaced per API
              client/tenant
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-foreground">What this is and isn't</h3>
        <p>
          This is a proof of concept showing how Corti's existing API lets a note generator learn
          from the clinician's own edits — not from historical notes (which is what the{" "}
          <em>Scribe like me</em> applet does). The diff is computed client-side (original vs.
          edited text in React state); the PATCH endpoint for persisting edits server-side is not
          used here. Memory accumulates across cycles, so each "store to memory" iteration builds on
          previous learning.
        </p>
      </div>
    </div>
  );
}
