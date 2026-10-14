# Applet: Command Genie

## Concept

An agent that generates voice command or nudge rule definitions from natural language descriptions. The user describes what they want in plain language, and the agent builds the structured configuration — immediately testable in a live dictation surface.

Two modes share one editor:
- **Command Genie** — enter trigger phrases + action description → agent generates a `ManagedCommand` → saved to `commandStore` → test by dictating.
- **Nudge Genie** — enter trigger description + nudge message → agent generates a `NudgeRule` → saved to `nudgeRuleStore` → test via the nudge evaluation pipeline (text matching, SNOMED/ICD-10 code prediction, prompt).

## Architecture

The genie agent ("Command Genie") is created via `ensureAgent()` — find-or-create by name. Each wish is a single isolated message (no `contextId`). The agent's behavior lives entirely in its fixed system prompt, which includes schema examples for all action kinds and criteria types.

The response is validated (`genieModel.ts`) before being saved to the shared stores. Items appear in the Dictation commands and Real-time nudge applets for the same API client.

In nudge mode, the full evaluation pipeline from the real-time-nudge applet is reused: cadence detector → debounce → predict (SNOMED/ICD-10) → agent evaluation → prompt evaluation → nudge state diff.

## File structure

```
client/applets/command-genie/
  CommandGenie.tsx          # Main component (mode toggle, inputs, dictation, nudge panel)
  genieAgent.ts              # Agent transport (system prompt, ensure, send, parse)
  genieModel.ts              # Types, validation, message building
  CommandGenieDetails.tsx    # "How it works" reference card
  README.md                  # This file
```

## Dependencies to copy

### npm packages
- `@corti/sdk` — CortiClient, types
- `@lit/react` — (transitive via cortiDictationReact)
- `lucide-react` — icons

### Shared files (from `_shared/`)
- `cortiAgent.ts` — ensureAgent, sendAgentMessage, describeAgentError
- `cortiDictationReact.tsx` — CortiDictationComponent
- `useCortiAccessToken.ts` — useCortiAccessToken
- `useDictationLanguage.ts` — useDictationLanguage
- `useActiveControl.ts` — useActiveControl
- `sessionState.tsx` — useSessionState
- `commandDispatch.ts` — dispatchCommand, CommandAction, KeyCombo
- `editorAdapter.ts` — EditorAdapter
- `offsetMap.ts` — Range
- `ruleStore.ts` — createRuleStore
- `configStore.ts` — createLocalConfigStore, identityNamespace

### From other applets
- `dictation-commands/commandModel.ts` — ManagedCommand, buildRegistry, toTranscribeCommands, TEMPLATES
- `dictation-commands/commandStore.ts` — useCommandStore, upsertCommand, setIdentity, logCommand, clearLog
- `dictation-suite/suiteConfig.ts` — buildSuiteConfig
- `dictionary-terms/terms.ts` — termStore
- `text-replacements/replacements.ts` — replacementStore
- `real-time-nudge/nudgeRules.ts` — NudgeRule, nudgeRuleStore
- `real-time-nudge/useNudges.ts` — useNudges, UseNudgesOptions
- `real-time-nudge/snomedAgent.ts` — configureNudgeAgent, evaluateCodesWithAgent, evaluatePromptWithAgent, etc.
- `real-time-nudge/predictCodes.ts` — predictCodes, invalidateCache
- `real-time-nudge/NudgeConfig.tsx` — NudgeConfig, loadSettings, NudgeSettings
- `real-time-nudge/connectionState.ts` — nudgeConnectionState

### shadcn/ui components
- `button` — Button
- `popover` — Popover, PopoverContent, PopoverTrigger

## Notes

- The agent's system prompt is fixed (not user-editable) — a deliberate safety boundary. The agent has no experts, no MCP servers, no tools — it can only generate JSON text.
- User inputs are sent as data, not instructions. The system prompt instructs the agent to treat all user input as configuration descriptions.
- The `script` action kind runs in a sandboxed `new Function()` scope — the same mechanism used by the existing command dispatch system. The agent generates the script, not the user.
- Generated items persist to the shared stores (`commandStore` / `nudgeRuleStore`) and appear in the Dictation commands and Real-time nudge applets for the same API client.
- The genie history is in-memory session state (`useSessionState`) — it survives remount but not page refresh.
- Agent calls require standard API client credentials (full-scope token). Limited-scope streaming tokens do not grant access to agent endpoints — a 403 error is expected if tried.
- The success message matches the user's requested format: "Your wish is my command! Command 'title' that does 'x' is ready for use."

## Future opportunities

- Allow the genie to edit existing commands/nudges (currently create-only)
- Multi-turn conversation with the genie agent (currently each wish is isolated)
- User-editable system prompt with save/reset (currently fixed)
- Bulk generation (describe a set of commands/nudges at once)
- Pre-built genie templates for common clinical workflows
