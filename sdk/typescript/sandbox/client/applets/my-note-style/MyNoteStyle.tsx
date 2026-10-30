/**
 * My Note Style applet — learn from edits to generated notes.
 *
 * The learning loop:
 *   1. Generate a note from a transcript
 *   2. Edit the generated note section by section
 *   3. "Store to memory" — an agent interprets each edit and proposes a
 *      template prompt update (writing style, content, or rule)
 *   4. Regenerate with accumulated memory applied as runtime overrides
 *   5. Compare baseline vs. personalised output side-by-side
 *
 * Layout:
 *   - Left column (input): template selector, transcript, language, generate,
 *     store-to-memory, regenerate controls
 *   - Main column (wider): editable generated note / side-by-side comparison
 *   - Memory log (collapsible right panel): learned rules, toggle open/close
 *
 * Fullscreen overlay renders fixed inset-0 at the top of the component tree
 * (per the design skill's fullscreen overlay guidance).
 */

import type { Corti, CortiClient } from "@corti/sdk";
import { CortiClient as CortiClientClass } from "@corti/sdk";
import {
  Brain,
  Eraser,
  FileText,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OUTPUT_LANGUAGES } from "../_shared/corti-documents";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import {
  configureMyNoteStyleAgent,
  describeAgentError,
  hasSectionChanged,
  interpretEdit,
} from "./agent";
import {
  describeDocumentsError,
  type GeneratedNote,
  generateNote,
  listCandidateTemplates,
  type ResolvedTemplate,
  resolveTemplate,
} from "./documents";
import {
  addMemory,
  clearMemories,
  configureMemoryStore,
  loadMemories,
  type MemoryEntry,
  type PromptSurface,
  removeMemory,
} from "./memoryStore";

// ─── Sample transcript ─────────────────────────────────────────────── //
const SAMPLE_TRANSCRIPT = `So, Tom, good to see you again. I think it was, what, last Tuesday you were in?

Yeah, last Tuesday. The ninth.

Right, the ninth. And we'd talked through your symptoms then — you had the sore throat, the runny nose, bit of a temperature. I remember we figured it was a viral upper respiratory infection. How's it been since?

Honestly, not great. I mean, the sore throat went away after a couple more days, like you said it would. But then the — the congestion just sort of moved into my face. Like, here.

Okay, sinus pressure.

Yeah, and the — I've got this cough now that I didn't really have before. It's mostly at night. Keeps me up, which is... yeah, I'm pretty run down.

Mm. And when did the sinus pressure start?

Maybe Thursday? Thursday evening. I was at work and I just — I could feel it building. By Friday morning I thought my head was going to explode.

Okay. And the cough, when did that kick in?

Friday, Saturday, somewhere in there. It's like it's in my chest but it's not... it's not a deep cough, if that makes sense? It's more like tickly. I keep coughing but nothing really comes up.

Productive or dry, would you say?

Dry, mostly. Maybe a little bit of clear stuff in the morning but, you know, not like green or anything.

Okay, that's useful. Any fever since I saw you last?

I took my temperature on Saturday with one of those forehead things we have at the office. It said 37.4 but I don't know how accurate those are.

That's borderline, not really a fever. We'd call 38 and above a fever. Any chills, body aches?

No, no chills. A bit of... I don't know, I felt a bit achy on Friday but I figured that was just from not sleeping.

Fair enough. How about your ears — any pain, fullness, feeling of pressure?

Actually yeah, the left one's been a bit blocked up. Not painful exactly, just... muffled. Like when you're on a plane.

That's quite common with the congestion. And your sense of smell and taste?

Gone. Completely gone. I had a curry on Saturday and I couldn't taste a thing, which was... disappointing, yeah.

I bet. Any pain in your face when you lean forward? Like if you bend over to tie your shoes?

Oh, yeah, actually. I didn't connect that but yeah, when I bend down there's a sort of — it's like a pressure right behind my cheekbones. Both sides.

Okay. And you mentioned you're not sleeping well. Is it just the cough or is the congestion making it hard to breathe at night?

Both, really. I tried propping myself up with pillows like you suggested last time, and that helped a bit with the breathing, but then the cough... I probably slept three, four hours last night. I had a big day at work yesterday too so I just...

I can imagine. Are you still taking the paracetamol?

Yeah, two tablets, four times a day, like you said. I've got the 500 milligram ones. That's been helping with the sinus pain, actually. The headache especially. But I didn't want to keep taking them for too long, so I've probably cut back to three times a day the last couple of days.

That's fine, you're well within safe limits. We say maximum is four grams in 24 hours, so eight of the 500 milligram tablets, and you're taking six. You're nowhere near the ceiling. Are you taking anything else? Any over-the-counter stuff?

I bought some of that pseudoephedrine stuff, the Sudafed, from the chemist. The 60 milligram ones. I've been taking one maybe twice a day.

Okay, and is that helping?

A little bit, I think? Hard to tell. Maybe for a few hours and then it comes back. Oh, and I've been doing the salt water rinse thing you mentioned. The nasal irrigation.

The saline rinse, good.

Yeah, got one of those squeeze bottles. NeilMed, I think it's called. That actually does help for an hour or so after I do it. But I wasn't sure how often I could use it.

As often as you like, really. Three, four times a day is perfectly fine. It's just saline, it's not medicated. Now, let me have a look at you. If you could pop your top off and sit up on the couch for me.

Sure.

I'm just going to listen to your chest. Breathe in normally for me... and out... and a couple of deep breaths now... good. Okay, that all sounds nice and clear. No wheeze, no crackles, good air entry both sides. Let me have a look at your throat. Say "ahh."

Ahh.

A bit of redness at the back, but nothing too dramatic. No exudate on the tonsils, which is good. Let me check your ears... Left ear, the tympanic membrane looks a little dull, slightly retracted. There's no fluid behind it but there's some negative pressure there, which fits with what you're describing, that muffled feeling. Right ear looks fine. Let me check your sinuses. I'm just going to press here — tell me if it's tender.

Ow. Yeah, that's — yeah.

That's the maxillary sinus. And here?

That one's not as bad.

Okay. And forehead, here?

Mmm, a bit tender but not like the cheeks.

Alright. I'm just going to take your temperature now. This is the ear one, it's a bit more accurate than the forehead scanner.

What's it showing?

37.1. Normal. Okay. So here's where we are, Tom. What you're describing is very consistent with what we'd call a post-viral sinusitis, or possibly an acute sinusitis that's still viral in origin. The timeline fits — you had the initial cold symptoms, they improved after about a week, and now the inflammation has moved into the sinuses. The cough you're getting is almost certainly post-nasal drip, mucus running down the back of your throat at night, tickling everything off.

That's what I thought it might be, actually. I did a bit of, you know, Googling.

Of course you did. Everyone does. And I'm sure Dr. Google told you it was a sinus infection and you needed antibiotics.

I mean... yeah, kind of.

Right. So here's the thing. Most of these — and I'd say yours fits the pattern — are still viral. About 90 percent of acute sinusitis is viral. The inflammation and the mucus and the pressure, that's all your body's response to the virus, not a bacterial infection on top of it. The guidelines we use, the NICE guidelines, say we should treat symptomatically for at least 10 to 14 days before we even think about antibiotics, unless there are specific red flags.

And I don't have those red flags?

You don't. No high fever, no severe unilateral facial pain, no periorbital swelling, symptoms haven't been going on more than 10 days without improvement, no double sickening where you got better and then suddenly much worse. Your chest is clear. Your temperature is normal. The mucus is clear, not purulent. Everything points to viral.

So what do I do? Just... wait?

I know it's frustrating. What I'd suggest is — keep going with the saline rinses, four times a day if you can. They genuinely help. You can step up the pseudoephedrine to 60 milligrams three times a day if you need it, just don't take it after about four in the afternoon or it'll keep you up even more. And for the cough at night, you could try a honey and lemon drink before bed, or there's a simple linctus you can get from the pharmacy, glycerin-based, that coats the throat. I'm not a big fan of the medicated cough syrups — limited evidence they work and they can give you side effects.

Okay.

If the congestion is really bothering you, I could prescribe a steroid nasal spray. Something like mometasone — that's Nasonex — 50 micrograms, two sprays into each nostril once a day. It takes a few days to really kick in, but it can reduce the inflammation in the sinus passages quite effectively. It's not a quick fix but it's the thing most likely to actually shift this.

Yeah, let's do that. I'll take anything at this point.

I'll write that up for you. One thing to flag — it can take 3 to 5 days before you notice a difference, so don't stop it if you don't feel better the next day. Keep using it for at least two weeks. And the technique matters — look down toward your toes when you spray, not up. If you spray upward it goes straight down your throat and you taste it, which is horrible, and it doesn't work as well.

Looking down, got it.

Now, I want you to keep an eye on a few things. If you develop a fever above 38, if the facial pain gets significantly worse, especially on one side, if you get any swelling around the eye, any visual changes — blurred vision, double vision — or if you're not improving at all by, say, day fourteen, fifteen, I want you to come back. Or if things were getting better and then suddenly get worse again, that's what we call a double sickening, and that can indicate a bacterial infection has taken hold. In that case we'd look at antibiotics, something like amoxicillin 500 milligrams three times a day for 7 to 10 days, or doxycycline if you're penicillin allergic, which you're not.

No, I'm fine with penicillin.

Good. So that's the plan. Saline rinses, pseudoephedrine, the nasal spray I'll prescribe, paracetamol for pain as needed, honey and lemon for the cough. And rest — I know you've got a lot on at work but your body's fighting something off and sleep is genuinely part of the treatment here.

I'll try. My boss is... well, you know.

I do know. Do your best. Can I just check — any past medical history I should be aware of? Anything chronic?

No, I'm pretty healthy generally. I had my tonsils out when I was a kid, that's about it.

And you're not on any regular medications? No inhalers, nothing for blood pressure?

No, nothing regular. I take the odd ibuprofen if I've got a headache but that's it. Oh, and I had a vitamin D thing a couple of years ago, I was taking supplements for a bit, but I stopped.

Okay, that's not on your record so I'll make a note. Any allergies?

Penicillin's fine, like I said. I get a bit of an upset stomach with erythromycin, but I don't know if that's an allergy or just a side effect.

I'll note that as an intolerance rather than an allergy — they're different things, and it matters if we ever need to prescribe a macrolide. We'd probably go with doxycycline in that case anyway. Smoking status?

I quit about three years ago. Was on maybe ten a day before that.

Good, that's what your record shows. And alcohol?

I'll have a few beers on the weekend, nothing heavy. Maybe six, seven units a week.

That's well within limits. Alright, Tom, I think we're sorted. I'll get that prescription sent to — is it still the Boots on the high street?

Yeah, that one.

Done. You should be able to pick it up in about an hour. And remember — back here if anything changes, or if you're not improving in two weeks. Otherwise, I'd expect this to clear up over the next week to ten days. The post-nasal cough can linger a bit longer than everything else, sometimes three, even four weeks. Don't be alarmed if the cough is the last thing to go.

Four weeks? Brilliant.

I know, I know. But it does get gradually better. It's not going to be like this for four weeks, it'll just be the last symptom to fully disappear. You'll notice it improving week by week.

Okay. Yeah, alright. Thanks, doc.

You're welcome. Take care of yourself, Tom. And drink plenty of fluids — I should have said that at the start.

I will. Cheers.`;

// ─── Types ─────────────────────────────────────────────────────────── //
type Phase = "idle" | "generating" | "generated" | "learning" | "learned";

interface SectionEditState {
  sectionId: string;
  heading: string;
  original: string;
  edited: string;
  isLearning: boolean;
}

// ─── UI Primitives ─────────────────────────────────────────────────── //
function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </p>
  );
}

function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
}) {
  const variants = {
    primary: "bg-foreground text-background hover:bg-foreground/85 disabled:bg-foreground/30",
    outline:
      "border border-border bg-background text-foreground hover:bg-muted disabled:text-muted-foreground",
    ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[5px] font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-3.5 text-[13px]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

// ─── Build overrides from memory entries ────────────────────────────── //

/** Manual rules come from the memory-log "Add rule" form; agent entries come
 *  from edit interpretation. Entries persisted before the `source` field
 *  existed are classified by shape — manual rules never carried edit text. */
function isManualEntry(m: MemoryEntry): boolean {
  return m.source === "manual" || (m.source == null && !m.originalText && !m.editedText);
}

/** Convert learned memory entries into runtime template overrides.
 *
 *  Accumulation semantics: each agent proposal is a COMPLETE replacement for
 *  one prompt surface of one section, produced by an agent that also received
 *  the section's previously learned entries (see interpretEdit). Applying
 *  every stored proposal would duplicate base-template text and let two
 *  proposals of different ages contradict each other ("terse bullets" in one
 *  cycle, "full prose" in the next), so:
 *  - agent entries: only the newest proposal per (section, surface) is
 *    applied — it already merges whichever older instructions still apply,
 *    since the newest edit wins;
 *  - manual rules: independent one-line instructions the agent has not folded
 *    into a proposal, so every rule added after the newest miscPrompt proposal
 *    is applied as a "Very important rules" bullet. */
function buildOverrides(
  memories: MemoryEntry[],
  template: ResolvedTemplate,
): Corti.GuidedTemplateOverrides | undefined {
  const sections: Corti.GuidedSectionOverride[] = [];
  const bySection = new Map<
    string,
    { manual: MemoryEntry[]; agentBySurface: Map<PromptSurface, MemoryEntry> }
  >();

  for (const m of memories) {
    if (!m.proposedPromptUpdate) {
      continue;
    }
    let group = bySection.get(m.sectionId);
    if (!group) {
      group = { manual: [], agentBySurface: new Map() };
      bySection.set(m.sectionId, group);
    }
    if (isManualEntry(m)) {
      group.manual.push(m);
    } else {
      // The store is append-only, so the last entry per surface is the
      // newest complete replacement for that surface.
      group.agentBySurface.set(m.promptSurface, m);
    }
  }

  // Only override sections that exist in the current template
  for (const [sectionId, group] of bySection) {
    const exists = template.sections.find((s) => s.sectionId === sectionId);
    if (!exists) {
      continue;
    }

    const instructions: Corti.GuidedSectionInstructionsOverride = {};

    const content = group.agentBySurface.get("contentPrompt");
    if (content) {
      instructions.contentPrompt = content.proposedPromptUpdate;
    }
    const style = group.agentBySurface.get("writingStylePrompt");
    if (style) {
      instructions.writingStylePrompt = style.proposedPromptUpdate;
    }

    const miscParts: string[] = [];
    const latestMisc = group.agentBySurface.get("miscPrompt");
    // Manual rules the newest miscPrompt proposal has not yet seen: any rule
    // created after it (or all of them, when no proposal exists yet).
    const unseenManual = group.manual.filter(
      (m) => !latestMisc || m.createdAt > latestMisc.createdAt,
    );
    if (unseenManual.length > 0) {
      miscParts.push(
        `Very important rules:\n${unseenManual.map((r) => `- ${r.proposedPromptUpdate}`).join("\n")}`,
      );
    }
    if (latestMisc) {
      miscParts.push(latestMisc.proposedPromptUpdate);
    }
    if (miscParts.length > 0) {
      instructions.miscPrompt = miscParts.join("\n\n");
    }

    if (Object.keys(instructions).length > 0) {
      sections.push({ sectionId, generation: { instructions } });
    }
  }

  if (sections.length === 0) {
    return undefined;
  }
  return { sections };
}

// ─── Main component ─────────────────────────────────────────────────── //
// Mounted standalone on the applet's dedicated /fullscreen route (the
// sandbox's "fullscreen" demoPlacement), so the workspace renders directly —
// no middle "Open fullscreen" step and no internal overlay indirection. Exit
// is owned by the surrounding frame (Navbar button + Escape), the same
// pattern as speech-flex. onClose stays available for any host that wants to
// unmount the panel itself.
export function MyNoteStyle() {
  return <FullscreenPanel />;
}

// ─── Fullscreen layout ───────────────────────────────────────────────── //
function FullscreenPanel({ onClose }: { onClose?: () => void }) {
  const { authConfig, sdkEnvironment, isReady, clientId, tenantName } = useCortiAccessToken();

  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPT);
  const [language, setLanguage] = useState("en");
  const [template, setTemplate] = useState<ResolvedTemplate | null>(null);
  const [templateList, setTemplateList] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [note, setNote] = useState<GeneratedNote | null>(null);
  const [baselineNote, setBaselineNote] = useState<GeneratedNote | null>(null);
  const [adaptiveNote, setAdaptiveNote] = useState<GeneratedNote | null>(null);
  const [edits, setEdits] = useState<Record<string, SectionEditState>>({});
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "compare">("edit");
  const [memoryLogOpen, setMemoryLogOpen] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [manualRuleSection, setManualRuleSection] = useState<string>("");
  const [manualRuleText, setManualRuleText] = useState("");

  const clientRef = useRef<CortiClient | null>(null);

  // Re-create the client when auth availability, tenant, or cluster changes —
  // NOT on the authConfig object identity: the useCortiAccessToken memo returns
  // a fresh object on every token refresh, and each CortiClient construction
  // eagerly refreshes the token, so keying on the identity (or on isReady,
  // which dips on every mid-flight mint) recreates the client in an infinite
  // construct → mint → dip → rebuild loop while the panel is open.
  // hasAccessToken never dips mid-mint, so it is the safe gate — the same
  // pattern as real-time-nudge. The captured authConfig keeps working after
  // later refreshes because the hook's refreshAccessToken is value-stable.
  const hasAccessToken = !!authConfig?.accessToken;
  useEffect(() => {
    if (hasAccessToken) {
      clientRef.current = new CortiClientClass({
        environment: sdkEnvironment,
        auth: authConfig,
        analytics: EXAMPLES_ANALYTICS,
      });
    } else {
      clientRef.current = null;
    }
    // authConfig identity deliberately excluded from deps — see comment above.
    // clientId/tenantName still rebuild the client on cluster/tenant switches.
  }, [hasAccessToken, clientId, tenantName, sdkEnvironment]);

  const getClient = useCallback((): CortiClient => {
    const client = clientRef.current;
    if (!client) {
      throw new Error("Not authenticated yet.");
    }
    return client;
  }, []);

  // Configure stores on auth change (namespace = clientId:tenant)
  useEffect(() => {
    if (!isReady) {
      return;
    }
    configureMemoryStore(clientId, tenantName);
    setMemories(loadMemories());
    configureMyNoteStyleAgent(clientId, tenantName);
  }, [isReady, clientId, tenantName]);

  // Fetch the template list once per auth cycle (client/tenant switch), then
  // keep the current selection when it is still in the list, otherwise
  // auto-select the first candidate. Changing the selection must not
  // re-trigger this fetch.
  useEffect(() => {
    if (!isReady) {
      return;
    }
    let active = true;
    listCandidateTemplates(getClient(), 12)
      .then((refs) => {
        if (!active) {
          return;
        }
        setTemplateList(refs);
        setSelectedTemplateId((prev) =>
          refs.some((r) => r.id === prev) ? prev : (refs[0]?.id ?? prev),
        );
      })
      .catch((e) => setError(describeDocumentsError(e)));
    return () => {
      active = false;
    };
  }, [isReady, clientId, tenantName, getClient]);

  // Resolve the selected template whenever it changes
  useEffect(() => {
    if (!isReady || !selectedTemplateId) {
      return;
    }
    let active = true;
    resolveTemplate(getClient(), selectedTemplateId)
      .then((t) => {
        if (active) {
          setTemplate(t);
        }
      })
      .catch((e) => setError(describeDocumentsError(e)));
    return () => {
      active = false;
    };
  }, [isReady, selectedTemplateId, getClient]);

  // ── Generate ──────────────────────────────────────────────────────── //
  const handleGenerate = useCallback(async () => {
    if (!template) {
      return;
    }
    setPhase("generating");
    setError(null);
    setShowComparison(false);
    setActiveTab("edit");
    try {
      const result = await generateNote(getClient(), template.templateId, transcript, language);
      setNote(result);
      const nextEdits: Record<string, SectionEditState> = {};
      for (const s of result.sections) {
        nextEdits[s.sectionId] = {
          sectionId: s.sectionId,
          heading: s.heading,
          original: s.text,
          edited: s.text,
          isLearning: false,
        };
      }
      setEdits(nextEdits);
      setBaselineNote(null);
      setAdaptiveNote(null);
      setPhase("generated");
    } catch (e) {
      setError(describeDocumentsError(e));
      setPhase("idle");
    }
  }, [template, transcript, language, getClient]);

  // ── Store to memory ────────────────────────────────────────────────── //
  const handleStoreToMemory = useCallback(async () => {
    if (!template || !note) {
      return;
    }
    setPhase("learning");
    setError(null);
    try {
      const client = getClient();
      const changed = Object.values(edits).filter(
        (e) => !e.isLearning && hasSectionChanged(e.original, e.edited),
      );

      if (changed.length === 0) {
        setError("No edits detected. Edit the note sections first, then store to memory.");
        setPhase("generated");
        return;
      }

      setEdits((prev) => {
        const next = { ...prev };
        for (const c of changed) {
          next[c.sectionId] = { ...c, isLearning: true };
        }
        return next;
      });

      for (const c of changed) {
        const templateSection = template.sections.find((s) => s.sectionId === c.sectionId);
        if (!templateSection) {
          continue;
        }

        const result = await interpretEdit(client, {
          section: templateSection,
          originalText: c.original,
          editedText: c.edited,
          // Earlier cycles' rules are merged into the new proposal instead of
          // blindly concatenating contradicting replacements.
          existingMemories: memories.filter((m) => m.sectionId === c.sectionId),
        });

        // A trivial edit (e.g. a typo fix) is not a pattern worth learning —
        // the agent signals this with an empty proposedPromptUpdate, so skip
        // storing instead of injecting the change description as prompt text.
        if (result.proposedPromptUpdate.trim()) {
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            sectionId: c.sectionId,
            sectionHeading: c.heading,
            classification: result.classification,
            promptSurface: result.promptSurface,
            changeDescription: result.changeDescription,
            proposedPromptUpdate: result.proposedPromptUpdate,
            rationale: result.rationale,
            originalText: c.original,
            editedText: c.edited,
            createdAt: new Date().toISOString(),
            source: "agent",
          };
          addMemory(entry);
        }

        // Snap original to current edited so next cycle only captures new edits
        setEdits((prev) => ({
          ...prev,
          [c.sectionId]: {
            ...prev[c.sectionId],
            isLearning: false,
            original: c.edited,
          },
        }));
      }

      setMemories(loadMemories());
      setPhase("learned");
    } catch (e) {
      setError(describeAgentError(e));
      // Sections that were not yet processed keep isLearning set — they were
      // flagged up front and only un-flagged as processed. Clear the flag for
      // everything still flagged so the "Interpreting edit…" spinner stops and
      // the edits can be stored again.
      setEdits((prev) => {
        const next = { ...prev };
        for (const [id, state] of Object.entries(prev)) {
          if (state.isLearning) {
            next[id] = { ...state, isLearning: false };
          }
        }
        return next;
      });
      // Sections processed before the failure were already stored — reflect
      // them in the memory log.
      setMemories(loadMemories());
      setPhase("generated");
    }
  }, [template, note, edits, memories, getClient]);

  // ── Regenerate with memory (comparison) ────────────────────────────── //
  const handleRegenerate = useCallback(async () => {
    if (!template) {
      return;
    }
    setPhase("generating");
    setError(null);
    setShowComparison(true);
    setActiveTab("compare");
    try {
      const client = getClient();
      const overrides = buildOverrides(memories, template);
      const [baseline, adaptive] = await Promise.all([
        generateNote(client, template.templateId, transcript, language),
        generateNote(client, template.templateId, transcript, language, overrides),
      ]);
      setBaselineNote(baseline);
      setAdaptiveNote(adaptive);
      setPhase("generated");
    } catch (e) {
      setError(describeDocumentsError(e));
      setPhase("idle");
    }
  }, [template, transcript, language, memories, getClient]);

  // ── Delete / clear memory ──────────────────────────────────────────── //
  const handleDeleteMemory = useCallback((id: string) => {
    setMemories(removeMemory(id));
  }, []);

  const handleClearMemory = useCallback(() => {
    clearMemories();
    setMemories([]);
  }, []);

  const handleAddManualRule = useCallback(() => {
    if (!template || !manualRuleText.trim() || !manualRuleSection) {
      return;
    }
    const section = template.sections.find((s) => s.sectionId === manualRuleSection);
    if (!section) {
      return;
    }
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      sectionId: section.sectionId,
      sectionHeading: section.heading,
      classification: "hard",
      promptSurface: "miscPrompt",
      changeDescription: manualRuleText.trim(),
      proposedPromptUpdate: manualRuleText.trim(),
      rationale: "Clinician-defined hard rule",
      originalText: "",
      editedText: "",
      createdAt: new Date().toISOString(),
      source: "manual",
    };
    addMemory(entry);
    setMemories(loadMemories());
    setManualRuleText("");
    setManualRuleSection("");
    setShowAddRule(false);
  }, [template, manualRuleText, manualRuleSection]);

  const changedCount = useMemo(
    () =>
      Object.values(edits).filter((e) => !e.isLearning && hasSectionChanged(e.original, e.edited))
        .length,
    [edits],
  );

  // ── Render ──────────────────────────────────────────────────────────── //
  // In-flow layout (h-full) inside the sandbox's /fullscreen frame, which
  // keeps the frame's Navbar + Escape exit reachable — never fixed overlay
  // positioning, which would cover the frame and hide its exit control.
  return (
    <div className="flex h-full flex-col bg-background">
      {/* TopBar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <Brain size={16} className="text-corti-lime" />
          <span className="text-[13px] font-medium">My Note Style</span>
        </div>
        <div className="flex items-center gap-3">
          {phase === "generating" || phase === "learning" ? (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              {phase === "generating" ? "Generating…" : "Learning…"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setMemoryLogOpen((o) => !o)}
            className="flex h-7 items-center gap-1 rounded-[5px] px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={memoryLogOpen ? "Hide memory log" : "Show memory log"}
          >
            {memoryLogOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            <span className="hidden sm:inline">Memory</span>
            {memories.length > 0 && (
              <span className="rounded-[4px] bg-muted px-1 text-[10px] font-medium">
                {memories.length}
              </span>
            )}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Error callout */}
      {error && (
        <div className="border-b border-variant-warning-border bg-variant-warning-bg px-6 py-2 text-[12px] text-variant-warning-text">
          {error}
        </div>
      )}

      {/* Body — two columns + collapsible memory log */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left column — Input ───────────────────────────────────── */}
        <aside className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
          {/* Template selector */}
          <div className="border-b border-border px-5 py-4">
            <Eyebrow>Template</Eyebrow>
            {templateList.length > 0 ? (
              <select
                value={selectedTemplateId ?? ""}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="mt-2 h-9 w-full rounded-[5px] border border-border bg-background px-3 text-[12px] focus:border-ring focus:outline-none"
              >
                {templateList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {isReady ? "Loading templates…" : "Authenticating…"}
              </p>
            )}
          </div>

          {/* Transcript + Language + Generate */}
          <div className="space-y-4 px-5 py-4">
            <div>
              <label
                htmlFor="adaptive-transcript"
                className="text-[11px] font-medium text-muted-foreground"
              >
                Transcript
              </label>
              <textarea
                id="adaptive-transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="mt-1 h-44 w-full resize-none rounded-[5px] border border-border bg-background px-3 py-2.5 text-[12px] leading-relaxed text-foreground focus:border-ring focus:outline-none"
                placeholder="Paste a transcript or clinical text…"
              />
            </div>

            <div>
              <label
                htmlFor="adaptive-language"
                className="text-[11px] font-medium text-muted-foreground"
              >
                Output language
              </label>
              <select
                id="adaptive-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1 h-9 w-full rounded-[5px] border border-border bg-background px-3 text-[13px] focus:border-ring focus:outline-none"
              >
                {OUTPUT_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={
                phase === "generating" || phase === "learning" || !template || !transcript.trim()
              }
              className="w-full"
            >
              <FileText size={14} />
              Generate note
            </Button>
          </div>

          {/* Learn controls */}
          {note && (
            <div className="border-t border-border px-5 py-4">
              <Eyebrow>Learn from edits</Eyebrow>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Edit the note sections in the main panel, then store the changes as learned memory.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {changedCount} section{changedCount === 1 ? "" : "s"} changed
                </span>
              </div>
              <Button
                variant="outline"
                onClick={handleStoreToMemory}
                disabled={changedCount === 0 || phase === "learning"}
                className="mt-2 w-full"
              >
                <Brain size={14} />
                {phase === "learning" ? "Learning…" : "Store to memory"}
              </Button>
            </div>
          )}

          {/* Regenerate controls */}
          {memories.length > 0 && (
            <div className="border-t border-border px-5 py-4">
              <Eyebrow>Regenerate with memory</Eyebrow>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {memories.length} learned rule
                {memories.length === 1 ? "" : "s"}. Regenerate to compare baseline vs. personalised
                output.
              </p>
              <Button
                onClick={handleRegenerate}
                disabled={phase === "generating"}
                className="mt-2 w-full"
              >
                <Sparkles size={14} />
                Regenerate & compare
              </Button>
            </div>
          )}
        </aside>

        {/* ── Main column — Note / Comparison ────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Tab switcher */}
          {showComparison && (
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2.5">
              <button
                type="button"
                onClick={() => setActiveTab("edit")}
                className={cx(
                  "rounded-[5px] px-3 py-1 text-[12px] font-medium transition-colors",
                  activeTab === "edit"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                Edit & learn
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("compare")}
                className={cx(
                  "rounded-[5px] px-3 py-1 text-[12px] font-medium transition-colors",
                  activeTab === "compare"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                Comparison
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {activeTab === "edit" || !showComparison ? (
              <EditView
                note={note}
                edits={edits}
                setEdits={setEdits}
                phase={phase}
                hasNote={!!note}
              />
            ) : (
              <CompareView baseline={baselineNote} adaptive={adaptiveNote} />
            )}
          </div>
        </main>

        {/* ── Memory log — collapsible right panel ────────────────────── */}
        {memoryLogOpen && (
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-card">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <Eyebrow>
                Memory log
                {memories.length > 0 && (
                  <span className="ml-1.5 rounded-[4px] bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                    {memories.length}
                  </span>
                )}
              </Eyebrow>
              <div className="flex items-center gap-3">
                {memories.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearMemory}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Eraser size={11} /> Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddRule((s) => !s)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus size={11} /> Add rule
                </button>
              </div>
            </div>

            {/* Manual hard rule form */}
            {showAddRule && template && (
              <div className="shrink-0 border-b border-border px-5 py-3">
                <select
                  value={manualRuleSection}
                  onChange={(e) => setManualRuleSection(e.target.value)}
                  className="h-8 w-full rounded-[5px] border border-border bg-background px-2.5 text-[11px] focus:border-ring focus:outline-none"
                >
                  <option value="">Select section…</option>
                  {template.sections.map((s) => (
                    <option key={s.sectionId} value={s.sectionId}>
                      {s.heading}
                    </option>
                  ))}
                </select>
                <textarea
                  value={manualRuleText}
                  onChange={(e) => setManualRuleText(e.target.value)}
                  placeholder="e.g. Always include medication dosages"
                  className="mt-2 h-16 w-full resize-none rounded-[5px] border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed focus:border-ring focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddRule(false);
                      setManualRuleText("");
                      setManualRuleSection("");
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddManualRule}
                    disabled={!manualRuleText.trim() || !manualRuleSection}
                    className="flex-1"
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
              {memories.length === 0 && !showAddRule ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Brain size={24} className="mx-auto text-muted-foreground/30" />
                    <p className="mt-2 text-[11px] italic text-muted-foreground">
                      No learned rules yet. Edit a generated note, then store to memory. Or add a
                      rule manually.
                    </p>
                  </div>
                </div>
              ) : (
                memories.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-[5px] border border-border bg-background px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium">{m.sectionHeading}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(m.id)}
                        className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      →{" "}
                      {m.promptSurface === "writingStylePrompt"
                        ? "Writing style"
                        : m.promptSurface === "contentPrompt"
                          ? "Content"
                          : "Rules"}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed">{m.changeDescription}</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Edit View ───────────────────────────────────────────────────────── //
function EditView({
  note,
  edits,
  setEdits,
  phase,
  hasNote,
}: {
  note: GeneratedNote | null;
  edits: Record<string, SectionEditState>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, SectionEditState>>>;
  phase: Phase;
  hasNote: boolean;
}) {
  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText size={32} className="mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-[13px] font-medium text-muted-foreground">No note yet</p>
          <p className="mt-1 text-[12px] text-muted-foreground/70">
            Click "Generate note" to create one from the transcript.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-5">
      {note?.sections.map((section) => {
        const edit = edits[section.sectionId];
        if (!edit) {
          return null;
        }
        const isChanged = hasSectionChanged(edit.original, edit.edited);
        return (
          <div
            key={section.sectionId}
            className={cx(
              "rounded-md border bg-card",
              isChanged ? "border-corti-lime/50" : "border-border",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <Eyebrow>{section.heading}</Eyebrow>
              {edit.isLearning && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 size={11} className="animate-spin" />
                  Interpreting edit…
                </span>
              )}
              {isChanged && !edit.isLearning && (
                <span className="rounded-[4px] bg-corti-lime/10 px-1.5 py-px text-[10px] font-medium text-corti-lime">
                  edited
                </span>
              )}
            </div>
            <textarea
              value={edit.edited}
              onChange={(e) =>
                setEdits((prev) => ({
                  ...prev,
                  [section.sectionId]: {
                    ...prev[section.sectionId],
                    edited: e.target.value,
                  },
                }))
              }
              disabled={phase === "generating" || phase === "learning"}
              className="h-auto min-h-[100px] w-full resize-y rounded-b-md border-0 bg-transparent px-4 py-3 text-[13px] leading-relaxed focus:outline-none disabled:opacity-60"
            />
          </div>
        );
      })}
      {note?.creditsConsumed != null && (
        <p className="text-right text-[10px] text-muted-foreground">
          {note.creditsConsumed} credits consumed
        </p>
      )}
    </div>
  );
}

// ─── Comparison View ─────────────────────────────────────────────────── //
function CompareView({
  baseline,
  adaptive,
}: {
  baseline: GeneratedNote | null;
  adaptive: GeneratedNote | null;
}) {
  if (!baseline || !adaptive) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="mx-auto animate-spin text-muted-foreground/40" />
          <p className="mt-3 text-[13px] text-muted-foreground">Generating comparison…</p>
        </div>
      </div>
    );
  }

  const baseMap = new Map(baseline.sections.map((s) => [s.sectionId, s]));
  const adaptMap = new Map(adaptive.sections.map((s) => [s.sectionId, s]));
  const allIds = new Set([...baseMap.keys(), ...adaptMap.keys()]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      <div className="grid grid-cols-2 gap-4">
        {/* Baseline column */}
        <div>
          <div className="sticky top-0 mb-3 rounded-[5px] bg-muted px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Baseline (no memory)
            </span>
          </div>
          <div className="space-y-3">
            {[...allIds].map((id) => {
              const s = baseMap.get(id);
              if (!s) {
                return null;
              }
              return (
                <div key={id} className="rounded-md border border-border bg-card px-4 py-3">
                  <Eyebrow>{s.heading}</Eyebrow>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/80">
                    {s.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Adaptive column */}
        <div>
          <div className="sticky top-0 mb-3 rounded-[5px] bg-corti-lime/10 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-corti-lime">
              Personalised (with memory)
            </span>
          </div>
          <div className="space-y-3">
            {[...allIds].map((id) => {
              const s = adaptMap.get(id);
              if (!s) {
                return null;
              }
              const baseS = baseMap.get(id);
              const isDiff = baseS && baseS.text !== s.text;
              return (
                <div
                  key={id}
                  className={cx(
                    "rounded-md border bg-card px-4 py-3",
                    isDiff ? "border-corti-lime/40" : "border-border",
                  )}
                >
                  <Eyebrow>{s.heading}</Eyebrow>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/80">
                    {s.text}
                  </p>
                  {isDiff && (
                    <span className="mt-2 inline-block rounded-[4px] bg-corti-lime/10 px-1.5 py-px text-[10px] font-medium text-corti-lime">
                      changed by memory
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
