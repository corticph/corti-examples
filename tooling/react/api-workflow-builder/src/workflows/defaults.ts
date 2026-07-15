import type { Workflow } from "./types";

// Starter workflows shipped as defaults on the very first launch — when the user's
// localStorage has no workflows AND the seed marker (see SEED_MARKER_KEY below) hasn't
// been set. Once seeded, users can freely rename / edit / delete these without the
// defaults returning on subsequent loads (the marker sticks even when the workflow
// list goes empty). That's important: seeding must never overwrite user data or bring
// back workflows the user deliberately removed.
//
// To ship a new default: run a workflow you like, click "Export" on the workflows list
// page to copy the JSON, paste one workflow object into this array (with a stable id).
// Keep ids stable across releases so returning users don't accumulate duplicates.

export const DEFAULT_WORKFLOWS: Workflow[] = [
  // Placeholder — will be filled in once we've exported the three flows.
  // Shape of each entry mirrors the Workflow type from ./types.
];

// localStorage key set to "1" after we've attempted to seed at least once. Prevents
// re-seeding after a user has intentionally cleared everything.
export const SEED_MARKER_KEY = "corti.workflows.seeded";
