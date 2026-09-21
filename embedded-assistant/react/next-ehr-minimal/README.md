# Corti Assistant in an EHR workflow

A fictional EHR showing how to add Corti Assistant to an existing clinical workflow. The clinician stays in the host application: it supplies patient context, embeds Assistant, and maps reviewed SOAP documentation into its own consultation form.

**Looking for Assistant? Open Patients, select a patient, then choose New consultation → Annual checkup.** Assistant appears above the form on that screen, not on the dashboard, patient overview, or other consultation types.

This is a local integration demo with synthetic data, not a production EHR. It uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand and SQLite.

## What the example demonstrates

The surrounding EHR provides patients, appointments, consultation types, clinical fields and local persistence. The integration demonstrates the round trip between that host and Corti Assistant:

1. The EHR chooses where Assistant appears and supplies encounter metadata and patient facts.
2. The host authenticates one demo Corti user, configures the workflow, creates an interaction and opens it in the embed.
3. The clinician records, generates documentation and reviews or edits it inside Assistant.
4. The clinician explicitly syncs the document. The host handles `document.synced` and maps known section UUIDs into its Subjective, Objective, Assessment and Plan fields.
5. The host hides and collapses Assistant. The form remains editable, and saving the consultation is a separate EHR action.

The host owns the form and decides where content goes. Assistant owns the recording and document-generation/review experience. Generating a document does not automatically update or save the EHR form.

## Run locally

### Prerequisites

- Node.js 22 LTS and npm.
- A browser with microphone access.
- A Corti project with Embedded Assistant access, a client configured for ROPC, and an enabled demo Corti user in the same environment and tenant.

From the repository root:

```bash
cd embedded-assistant/react/next-ehr-minimal
npm install
cp .env.example .env
```

Populate the local environment file with the values below. The committed [.env.example](.env.example) provides the starting values:

| Variable | Value to use |
| --- | --- |
| `EHR_SQLITE_PATH` | Keep `./data/ehr-demo.sqlite` for this walkthrough. The application creates and seeds the local database on first use. |
| `CORTI_ENVIRONMENT` | Your API client's **Environment ID**, such as `eu` or `us`. Replace the example's `staging-eu` unless your credentials are actually for staging. |
| `CORTI_TENANT_NAME` | Your API client's **Tenant name**, usually `base`. Do not use the project display name. |
| `CORTI_CLIENT_ID` | The full **Client ID** of a client configured for **Embedded Assistant → ROPC (Resource Owner Password)**. |
| `CORTI_USER_EMAIL` | Your demo Corti user's email, not the Console login identity. |
| `CORTI_USER_PASSWORD` | That demo user's password, not a client secret or Console password. |

In [Corti Console](https://console.corti.app), select your project and create the client under **API clients**. Under **Customers**, select a customer and use **Add user → Manual Invite → Set Password** to create a demo user with known credentials. Ask your project administrator or [contact Corti](mailto:help@corti.ai) if you do not have access to these controls. See [Authentication for Embedded Users](https://docs.corti.ai/assistant/authentication) for the authentication flows.

All variables are read on the server. Do not add `NEXT_PUBLIC_` prefixes or commit `.env`; the example ignores `.env` and the local `data/` directory. Use synthetic patient data and a test conversation only.

Start the application after setting the variables:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), or the URL printed by Next.js if that port is occupied. The same server serves the EHR, `GET /api/config` (Assistant URL) and `GET /api/auth` (demo user token exchange); there is no separate backend to start.

## Find Assistant and test the workflow

1. Open **Patients** in the sidebar and select any seeded patient.
2. Open **New consultation** and choose **Annual checkup**. Do not choose **Start planned contact** unless that appointment is an annual checkup: it opens the appointment's own consultation type, which may not include Assistant.
3. Above the consultation form, find **Corti assistant / Live consultation workspace**. Wait for **Corti assistant ready**. Assistant is initially hidden while the host authenticates and initialises the interaction.
4. Allow microphone access and record a short synthetic annual-checkup conversation. Include a symptom/history, an observation, an assessment and a plan so there is content for all four SOAP fields. Stop recording, generate the document and review or edit it in Assistant.
5. Before syncing, inspect the EHR's SOAP fields: document generation alone should not have populated them.
6. Use Assistant's document sync action. The known non-empty sections should populate the EHR form, and the panel should display **Document synced. Assistant collapsed.** Blank sections and the exact text `Not recorded` are skipped.
7. Choose **Show assistant** to reopen the same embed. You can continue editing the EHR form; syncing again replaces the mapped fields with non-empty document content, so it can overwrite manual edits there.
8. To test persistence too, expand **Record entries → Add extra entry types** and select **Exams** and **Diagnoses** to save the Objective and Assessment content. Complete any missing SOAP fields, at least one vital sign, one body measurement and a test name, then choose **Save consultation**. Sync only updates form state; it does not save the patient record. The host saves the selected entry types, not the Assistant document as a whole.

As a quick negative check, start a different consultation type, such as **General GP visit**: its normal EHR form should appear without Assistant. The `annual-checkup` gate is intentional, not a loading failure.

## Why the integration is deliberately narrow

The EHR has enough surrounding screens to make the integration realistic, but the first Assistant workflow limits the moving parts. These are choices made by this example, not Corti defaults:

| Choice | Reason |
| --- | --- |
| Assistant only for `annual-checkup` | Demonstrates that the host decides where it belongs without changing other clinical workflows. |
| One fixed standard SOAP template | Gives the host predictable section UUIDs and four known destination fields. |
| Forced first-document template and disabled default-template selection | Keeps the output contract consistent during the walkthrough. |
| At most one generated document | Avoids deciding which of several documents should populate the form. |
| English-only spoken-language options and document output | Keeps the initial workflow consistent while demonstrating host-controlled configuration. |
| Explicit sync | Separates generation/review from applying content to the EHR. |
| One configured demo Corti user | Keeps clinician identity mapping out of the first integration. |

Once this round trip works, add flexibility deliberately. Several known templates need their own mappings; arbitrary personal templates may introduce sections with no predefined destination. Do not change the template without also reviewing the section mapping.

## Key implementation files

| File | Responsibility |
| --- | --- |
| [Patient consultation route](app/patients/[id]/new-interaction/page.tsx) and [appointment consultation route](app/appointments/[id]/new-interaction/page.tsx) | Render Assistant only for annual checkups. |
| [Annual-checkup integration](components/annual-checkup-corti-assistant.tsx) and [visit configuration](lib/corti-assistant-visit-config.ts) | Derive encounter identity and patient facts from EHR data. |
| [Embed](components/corti-assistant-embed.tsx) and [client panel](components/corti-assistant-panel-client.tsx) | Mount `CortiEmbeddedReact`, handle readiness/errors/sync, and control visibility. |
| [Interaction initialisation](lib/corti-assistant-ehr-integration.ts) | Authenticate, configure, create the interaction, add facts, navigate and show Assistant. Defines the workflow restrictions. |
| [SOAP identifiers](lib/corti-soap-template.ts) and [document sync](lib/corti-assistant-sync.ts) | Map section `key` UUIDs to form fields, rather than matching display titles. Unknown keys are ignored. |
| [Form store](lib/consultation-form-store.ts), [form](components/consultation-form.tsx) and [server action](app/actions.ts) | Apply field updates, allow editing and save selected EHR entries. |
| [Server authentication](lib/corti-server-auth.ts) | Exchange the demo user's credentials through a `CortiAuth` instance. |

For the full API surface, see the [Web Component API](https://docs.corti.ai/assistant/web-component-api) and [Configuration Scenarios](https://docs.corti.ai/assistant/configuration-scenarios).

## Automated checks

Run the focused integration tests without a live Corti connection:

```bash
npm run test:run -- lib/corti-assistant-sync.test.ts lib/corti-assistant-visit-config.test.ts lib/consultation-templates.test.ts
```

These check the fixed SOAP mapping, unknown-section handling, patient facts and consultation-template rules. They do not exercise real authentication, microphone capture or document generation; use the browser walkthrough above for that.

Other commands, run from the example directory:

| Command | Purpose |
| --- | --- |
| `npm run test:run` | Run all unit tests once. |
| `npm test` | Run tests in watch mode. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Build the Next.js application. |
| `npm start` | Serve the built application. This does not make the demo safe to deploy publicly. |

## Troubleshooting and limits

- **No Assistant panel:** use **New consultation → Annual checkup**. The dashboard, patient overview and other consultation types do not embed Assistant.
- **Assistant fails to initialise:** check all five `CORTI_*` values, the client's ROPC grant and the demo user's credentials. Restart Next.js after environment changes and reload the page. The example caches bootstrap data in the browser; a transient authentication error can require a reload.
- **Recording fails:** check browser microphone permissions and device selection. A real recording/generation test requires a reachable Corti environment and valid credentials.
- **Sync leaves a field unchanged:** confirm that the generated section has content and that its key matches the fixed SOAP mapping. Unknown keys, blank text and `Not recorded` do not update fields; vitals are not part of the four-field mapping.
- **Save fails:** complete the fields required by the selected EHR record-entry types. This is separate from document sync.
- **Database fails to open:** set `EHR_SQLITE_PATH` to a writable path. The database is local demo persistence, not shared production storage.

The token route has no host-user authentication check and returns access and refresh tokens for the configured demo user. Keep this application local; do not expose `/api/auth` publicly. A production integration needs authenticated host routes, per-clinician identity, token lifecycle management, patient/encounter authorisation, durable persistence, audit controls and workflow-specific recovery. Never log tokens or clinical payloads. See the [reliability guide](https://docs.corti.ai/assistant/reliability-timeouts) for production lifecycle handling.
