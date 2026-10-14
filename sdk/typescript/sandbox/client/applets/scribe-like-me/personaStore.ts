/**
 * Persona persistence for the Scribe Like Me applet: clinician personas, each
 * with a bundle of historical notes and (once analyzed) a tailored style
 * profile. Persists to localStorage via the shared configStore, namespaced by
 * API client (clientId:tenant) — same pattern as dictation-commands'
 * commandStore.ts. Uses useSyncExternalStore so the wizard body and any
 * sibling panel stay in sync without a provider.
 *
 * Unlike commandStore's fixed built-in catalog, the two example personas are
 * only a ONE-TIME seed: they're plain, fully editable/deletable persona
 * records like any other, meant to validate the concept immediately. Once a
 * client has any saved state, the seed is never re-applied.
 */
import { useSyncExternalStore } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import { SEED_PERSONAS } from "./seedPersonas";

const PERSONAS_KEY = "scribeLikeMe.personas";

export interface StyleSectionOverride {
  sectionId: string;
  family?: string;
  defaultHeading: string;
  defaultContentPrompt: string;
  defaultWritingStylePrompt: string;
  headingOverride: string | null;
  contentPromptOverride: string | null;
  writingStylePromptOverride: string | null;
  rationale: string;
}

/** A durable Guided Documents template + sections created from a StyleProfile's
 * overrides via the authoring API (`documents.sections.create` /
 * `documents.templates.create`), as opposed to the runtime-only overrides used
 * everywhere else in this applet. `sectionIdMap` records base sectionId ->
 * newly-created custom sectionId for every overridden section, so generated
 * notes (whose stringDocument keys are the *template's* section ids) can
 * still be matched back to the right heading. */
export interface CustomTemplateRef {
  templateId: string;
  templateName: string;
  sectionIdMap: Record<string, string>;
  createdAt: string;
}

export interface StyleProfile {
  templateId: string;
  templateName: string;
  styleSummary: string;
  templatePromptOverride: string | null;
  sections: StyleSectionOverride[];
  analyzedAt: string;
  /** Set once "Save as custom template" succeeds; cleared whenever the
   * overrides are edited again so a stale persisted template is never
   * silently treated as current. */
  customTemplate?: CustomTemplateRef | null;
}

export interface Persona {
  id: string;
  name: string;
  specialty: string;
  notes: string[];
  styleProfile: StyleProfile | null;
  createdAt: string;
}

function newId(): string {
  return crypto.randomUUID();
}

function seedToPersona(seed: (typeof SEED_PERSONAS)[number]): Persona {
  return {
    id: newId(),
    name: seed.name,
    specialty: seed.specialty,
    notes: [...seed.notes],
    styleProfile: null,
    createdAt: new Date().toISOString(),
  };
}

// Persistence is namespaced by API client (clientId:tenant); see setIdentity.
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);

function loadPersonas(): Persona[] {
  // `null` (never saved) triggers the one-time seed; a saved `[]` means the
  // user deliberately deleted every persona and must be respected as empty.
  const saved = store.get<Persona[] | null>(PERSONAS_KEY, null);
  if (saved) {
    return saved;
  }
  const seeded = SEED_PERSONAS.map(seedToPersona);
  store.set(PERSONAS_KEY, seeded);
  return seeded;
}

interface StoreState {
  personas: Persona[];
}

let state: StoreState = { personas: loadPersonas() };

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) {
    l();
  }
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return state;
}

function persist() {
  store.set(PERSONAS_KEY, state.personas);
}

/** Point the store at a specific API client's namespace and reload its saved personas. */
export function setIdentity(clientId?: string, tenant?: string) {
  const ns = identityNamespace(clientId, tenant);
  if (ns === namespace) {
    return;
  }
  namespace = ns;
  store = createLocalConfigStore(ns);
  state = { personas: loadPersonas() };
  emit();
}

export function createPersona(name: string, specialty: string): Persona {
  const persona: Persona = {
    id: newId(),
    name,
    specialty,
    notes: [],
    styleProfile: null,
    createdAt: new Date().toISOString(),
  };
  state = { personas: [...state.personas, persona] };
  persist();
  emit();
  return persona;
}

export function removePersona(personaId: string) {
  state = { personas: state.personas.filter((p) => p.id !== personaId) };
  persist();
  emit();
}

/**
 * Replace every persona with a fresh copy of SEED_PERSONAS. Destructive — any
 * user-added personas, notes, or saved style profiles are discarded. This is
 * the escape hatch for the one-time-seed design above: once a browser has
 * saved state, edits to seedPersonas.ts are otherwise invisible until this is
 * called (see the "refresh" button in the wizard's first step).
 */
export function resetToSeedPersonas() {
  state = { personas: SEED_PERSONAS.map(seedToPersona) };
  persist();
  emit();
}

function updatePersona(personaId: string, fn: (p: Persona) => Persona) {
  state = {
    personas: state.personas.map((p) => (p.id === personaId ? fn(p) : p)),
  };
  persist();
  emit();
}

export function addNote(personaId: string, text: string) {
  if (!text.trim()) {
    return;
  }
  updatePersona(personaId, (p) => ({ ...p, notes: [...p.notes, text] }));
}

export function removeNote(personaId: string, index: number) {
  updatePersona(personaId, (p) => ({
    ...p,
    notes: p.notes.filter((_, i) => i !== index),
  }));
}

export function setStyleProfile(personaId: string, styleProfile: StyleProfile) {
  updatePersona(personaId, (p) => ({ ...p, styleProfile }));
}

export function updateStyleProfile(
  personaId: string,
  patch: {
    templatePromptOverride?: string | null;
    sectionEdits?: Array<{
      sectionId: string;
      headingOverride?: string | null;
      contentPromptOverride?: string | null;
      writingStylePromptOverride?: string | null;
    }>;
  },
) {
  updatePersona(personaId, (p) => {
    if (!p.styleProfile) {
      return p;
    }
    const sections = p.styleProfile.sections.map((s) => {
      const edit = patch.sectionEdits?.find((e) => e.sectionId === s.sectionId);
      if (!edit) {
        return s;
      }
      return {
        ...s,
        headingOverride:
          edit.headingOverride !== undefined ? edit.headingOverride : s.headingOverride,
        contentPromptOverride:
          edit.contentPromptOverride !== undefined
            ? edit.contentPromptOverride
            : s.contentPromptOverride,
        writingStylePromptOverride:
          edit.writingStylePromptOverride !== undefined
            ? edit.writingStylePromptOverride
            : s.writingStylePromptOverride,
      };
    });
    return {
      ...p,
      styleProfile: {
        ...p.styleProfile,
        templatePromptOverride:
          patch.templatePromptOverride !== undefined
            ? patch.templatePromptOverride
            : p.styleProfile.templatePromptOverride,
        sections,
        // A previously saved custom template was baked from the prior
        // overrides — once those change, it no longer reflects the draft, so
        // clear it rather than let it silently go stale.
        customTemplate: null,
      },
    };
  });
}

/** Record (or clear) the durable template + sections created by "Save as
 * custom template". No-op if the persona has no style profile. */
export function setCustomTemplate(personaId: string, customTemplate: CustomTemplateRef | null) {
  updatePersona(personaId, (p) => {
    if (!p.styleProfile) {
      return p;
    }
    return { ...p, styleProfile: { ...p.styleProfile, customTemplate } };
  });
}

export function usePersonaStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
