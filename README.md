# Homicide Media Tracker

## Purpose

This repository is now the superproject that orchestrates the News Media Tracker app and the AtoM service integration together. Runtime application code lives in the `app.news-media-tracker` submodule and AtoM/plugin runtime code lives in the `srvc.atom` submodule.

This README focuses on superproject operations, integration workflow, and repository topology. Historical references later in the file to former root-owned paths are archival context; the canonical code now lives in the two submodules.

## Hosted AtoM bootstrap automation (3.1 lane)

- `npm run atom.bootstrap`: idempotent first-run bootstrap (admin setup, bootstrap state/user setup, plugin enablement, baseline initialization).
- `npm run atom.bootstrap.reset`: clear bootstrap state (and run optional `ATOM_BOOTSTRAP_RESET_HOOK`).
- `npm run atom.bootstrap.reseed`: reset state and rerun bootstrap steps from clean state.
- `npm run atom.bootstrap.force`: rerun all bootstrap steps regardless of saved state.

Bootstrap hooks can be overridden with:

- `ATOM_BOOTSTRAP_ADMIN_HOOK`
- `ATOM_BOOTSTRAP_STATE_HOOK`
- `ATOM_BOOTSTRAP_PLUGIN_HOOK`
- `ATOM_BOOTSTRAP_BASELINE_HOOK`

By default hooks run through `docker compose exec` on service `atom`; set `ATOM_BOOTSTRAP_USE_COMPOSE=false` to run hooks directly in host shell.
When using default hooks, set `ATOM_ADMIN_PASSWORD` and `ATOM_BOOTSTRAP_PASSWORD` explicitly.

## Devcontainer with Compose (superproject + app + service)

All devcontainers now share a single root compose file so the superproject, app workspace, service workspace, and hosted AtoM stack can start together.

1. Open this repository in VS Code and run Reopen in Container for the superproject environment.
1. Open `app.news-media-tracker` or `srvc.atom` directly and run Reopen in Container there to attach to the app-specific or service-specific workspace.
1. Compose services started: `workspace-superproject`, `workspace-app`, `workspace-service`, `atom-host`, `atom-db`, `atom-cache`.
1. Forwarded ports include:

- `3000` (Next.js Dev Server)
- `3001` (Electron Dev)
- `62080` (AtoM host)
- `63306` (MariaDB)
- `63790` (Redis)

1. Run stack checks from inside any attached container:

- `npm run atom.stack.ps`
- `npm run atom.stack.readiness`

1. Bootstrap commands run against service `atom-host` by default in this compose profile (`ATOM_STACK_SERVICE=atom-host`).

Compose file used by all three devcontainers:

- `docker-compose.yml`

## Repository topology (recommended)

Treat this repository as a superproject with two nested projects tracked as Git submodules:

- `app.news-media-tracker` -> tracker application project
- `srvc.atom` -> AtoM service project (host stack + plugin runtime)

This keeps service and app release cadence independent while preserving a single integration workspace.

Canonical ownership in the current split:

- Superproject: devcontainer, integration workflows, cross-repo planning, and shared orchestration
- `app.news-media-tracker`: tracker UI, Electron host, application build/test tooling
- `srvc.atom`: plugin integration, AtoM stack, bootstrap/runtime service scripts

### Clone and sync with submodules

- Fresh clone:
  - `git clone --recurse-submodules <tracker-repo-url>`
- Existing clone:
  - `git submodule update --init --recursive`
- Pull latest for tracker + submodules:
  - `git pull --recurse-submodules`
  - `git submodule update --recursive --remote`

### Submodule paths in this superproject

The superproject currently tracks:

- `app.news-media-tracker` -> `https://github.com/JulianVJacobs/app.news-media-tracker.git`
- `srvc.atom` -> `https://github.com/JulianVJacobs/srvc.atom.git`

To pull the latest submodule commits explicitly:

1. `git submodule update --remote --recursive`
1. `git add .gitmodules app.news-media-tracker srvc.atom`
1. `git commit -m "chore(submodules): bump app/service pointers"`

Useful orchestration commands from the superproject root:

1. `npm run workspace.app.install`
1. `npm run workspace.app.dev`
1. `npm run workspace.service.stack.up`
1. `npm run workspace.service.bootstrap`

## Roadmap

**Current version: 3.1.2 | Strategic direction: AtoM plugin embedded capture + Workbench offline-sync + Event-Actor-Role annotation layer**

Checkbox legend:

- `[x]` completed in this release line
- `[ ]` planned and not yet completed
- `[>]` deferred/re-scoped to a different semver target (no standalone release at original line)
- `[<]` promoted/re-sequenced from a later roadmap line into an earlier active line

**Status update (2026-05-06):**

- ✅ Fleet `3.1.0` completed and merged on `origin/main` (host provisioning, bootstrap automation, plugin runtime binding, workbench host-shell slice all integrated).
- ✅ Fleet `3.1.2` completed and merged on `origin/main` (embedded capture foundation: field ownership contract + plugin form extension hooks + AtoM lifecycle sync bridge + end-to-end verification).
- ⧗ Fleet `3.2.0` planning next (PWA offline-sync for workbench routes; lane decomposition ready for approval).

**Previous status update (2026-04-28):**

### **Foundation: Participant Management (1.x.x releases)**

Establish a solid participant/actor model with alias support, merge workflows, and configurable profiles as the foundation for Event-Actor-Role generalization.

- [x] **1.0.x**
  - [x] Make PWA offline-first
    - [x] Implement service worker for asset caching
    - [x] Use IndexedDB for storage
- [x] **1.1.x**
  - [x] Add "alias" field to every participant
    - [x] Update schema to include alias
    - [x] Add input field to participant form
  - [x] Add participant alias management and promotion
    - [x] Add participant merge management UI
    - [x] Allow promoting an alias to primary name
    - [x] Preserve old primary name as alias after promotion
    - [x] Update duplicate matching to use primary + aliases
- [x] **1.2.x**
  - [x] Combine victim and perpetrator steps into "participants" step
    - [x] Add dropdown to switch between profiles
    - [x] Refactor forms for participant type (type-agnostic form + type selector)
    - [x] Make profiles fully configurable via schema_profile + schema_constraint
  - [x] Complete fleet phase `1.2.1` for participant form integration and verification
    - [x] Run `[1.2.1][00-conductor]` over the approved phase branch
    - [x] Merge `[1.2.1][01-form-submission]` and `[1.2.1][02-list-rendering]` into `phase/1.2.1`
    - [x] Finish `[1.2.1][03-compat-verification]` and open the final PR to `origin/main`
- [>] **1.3.x** (re-scoped into `3.0.x`; no standalone `1.3.x` release)
  - [>] Former `1.3.x` backlog merged into Phase 3 scope to preserve semver sequencing.

---

### **Phase 2: Event-Actor-Role Generalization & Configurable Profiles (2.x.x releases)**

Sequencing note: `2.2.x` should be completed before `3.0.x`/`3.1.x` under the current roadmap, because graph exploration and reproducibility depend on stable identity resolution, merge explainability, and actor merge workflows. If a future `3.0.x` slice is intentionally scoped to raw, non-merged graph views, that should be called out explicitly as an exception.

### Most Recent Fleet Execution (canonical schema)

- Proposed planned version: `3.1.2`
- Approval state: approved and integrated on phase branch (2026-05-06)
- Phase branch: `phase/3.1.2`
- Merge policy: eager-after-green into `phase/3.1.2`, then one final PR to `origin/main`
- Lane identity format: `[<planned-version>][<agent-id>-<short-name>] <task-description>`
- Conductor lane id reserved: `00`
- Launch state: closed
- Completed lanes:
  - `[3.1.2][00-conductor] Integrate phase 3.1.2 embedded-capture fleet`
  - `[3.1.2][01-field-ownership-contract] Publish AtoM-vs-plugin field ownership matrix`
  - `[3.1.2][02-form-extension-hooks] Implement plugin extension hooks for target AtoM capture views`
  - `[3.1.2][03-lifecycle-sync-bridge] Add AtoM lifecycle-to-plugin sync hook wiring`
  - `[3.1.2][04-contract-verification] Verify embedded capture path end-to-end`

- Final PR: conductor output prepared from `phase/3.1.2` to `origin/main` (title prefix `[3.1.2][00-conductor]`)
- Manifest lifecycle: `.github/fleet/3.1.2/manifest.yaml` published for lane status, then deleted before final PR
- Verification: embedded capture path verified end-to-end (AtoM form entry → hook firing → plugin persistence → plugin retrieval) with UX parity to AtoM forms confirmed
- Cleanup: no 3.2.0 offline-sync scope drift accepted during 3.1.2 integration

### Previous Fleet Execution (3.1.0 host provisioning)

- Proposed planned version: `3.1.0`
- Approval state: approved and integrated on phase branch (2026-04-22)
- Phase branch: `phase/3.1.0`
- Merge policy: eager-after-green into `phase/3.1.0`, then one final PR to `origin/main`
- Lane identity format: `[<planned-version>][<agent-id>-<short-name>] <task-description>`
- Conductor lane id reserved: `00`
- Launch state: closed
- Completed lanes:
  - `[3.1.0][00-conductor] Integrate phase 3.1.0 host-provisioning fleet`
  - `[3.1.0][01-atom-stack] Add AtoM host runtime definition for local and CI execution`
  - `[3.1.0][02-bootstrap] Automate first-run bootstrap and plugin enablement`
  - `[3.1.0][03-plugin-runtime-bind] Bind tracker plugin runtime to AtoM routes`
  - `[3.1.0][04-workbench-host-shell] Deliver integrated workbench surfaces`
  - `[3.1.0][05-verification-runbook] Add integrated verification gates and runbook`

- Final PR: conductor output prepared from `phase/3.1.0` to `origin/main` (title prefix `[3.1.0][00-conductor]`)
- Manifest lifecycle: `.github/fleet/3.1.0/manifest.yaml` published for lane status, then deleted before final PR
- Verification: targeted plugin-route smoke checks and integrated `npm run lint` + `npm run test` gates passed on the integrated branch
- Cleanup: no 3.2.x offline-sync scope drift accepted during 3.1.0 integration

- Historical note: legacy phonetic lane labels were used in earlier phases and are now archived-only references.

### Fleet Execution Record (promoted Phase 3 plugin integration)

- Planned version: `3.0.0`
- Approval state: approved and completed (merged 2026-04-22)
- Allowed change class: major (host integration + runtime de-bloat and plugin-first bridge)
- Phase goal: establish AtoM plugin/bridge foundation with Electron de-bloat while preserving workbench domain contracts
- Phase branch: `phase/3.0.0`
- Merge policy: eager-after-green into `phase/3.0.0`, then one final PR to `origin/main`
- Final merge PR: `#46`
- Final merge commit on `main`: `9579fe0`
- Manifest lifecycle: `.github/fleet/3.0.0/manifest.yaml` deleted before final merge per fleet policy
- Conductor lane:
  - `[3.0.0][00-conductor] Integrate phase 3.0.0 plugin-foundation fleet`
- Worker lanes:
  - `[3.0.0][01-electron-debloat] Retire Electron runtime wiring from strategic app path`
  - `[3.0.0][02-plugin-scaffold] Create AtoM plugin scaffold and bridge bootstrap`
  - `[3.0.0][03-backend-domain-port] Port domain persistence/services to plugin backend`
  - `[3.0.0][04-plugin-api-contract] Publish plugin API routes aligned to existing contracts`
  - `[3.0.0][05-workbench-bridge] Repoint workbench integration to plugin/API boundary`
  - `[3.0.0][06-acl-record-linkage] Integrate AtoM ACL and record linkage entry points`
  - `[3.0.0][07-offline-sync-bridge] Add targeted workbench offline/sync bridge`
  - `[3.0.0][08-regression-migration] Run regression, migration rehearsal, and cutover checks`

### Active Fleet Contract (Phase 3.1.0 host provisioning)

- Planned version: `3.1.0`
- Approval state: proposed, awaiting explicit launch approval
- Allowed change class: major (host runtime provisioning + plugin runtime binding)
- Phase goal: deliver a runnable AtoM host stack from this repository and bind the tracker plugin to it for local/CI execution.
- Phase branch: `phase/3.1.0`
- Merge policy: eager-after-green into `phase/3.1.0`, then one final PR to `origin/main`
- Conductor lane:
  - `[3.1.0][00-conductor] Integrate phase 3.1.0 host-provisioning fleet`
- Worker lanes:
  - `[3.1.0][01-atom-stack] Provision containerized AtoM host stack and shared env contract`
  - `[3.1.0][02-bootstrap] Automate first-run bootstrap (admin/user/plugin enablement + baseline data)`
  - `[3.1.0][03-plugin-runtime-bind] Bind tracker plugin runtime to hosted AtoM routes and auth context`
  - `[3.1.0][04-workbench-host-shell] Deliver first integrated workbench surfaces inside AtoM host shell`
  - `[3.1.0][05-verification-runbook] Add end-to-end verification and local/CI runbook gates`
- Dependency edges:
  - `[3.1.0][02-bootstrap]` depends on `[3.1.0][01-atom-stack]`
  - `[3.1.0][03-plugin-runtime-bind]` depends on `[3.1.0][01-atom-stack]` and can progress in parallel with `[3.1.0][02-bootstrap]` once base services are reachable
  - `[3.1.0][04-workbench-host-shell]` depends on `[3.1.0][03-plugin-runtime-bind]`
  - `[3.1.0][05-verification-runbook]` runs after lanes `01` through `04` merge on `phase/3.1.0`

Generalize the participant model into a core Event–Actor–Role ontology. Introduce annotation events with configurable profiles, role-based claims, and prepare for AtoM plugin integration.

- [x] **2.0.x — Event-Actor-Role Core Schema**
  - [x] Design and implement core entities
    - [x] `annotation_event`: events with datetime modes (exact/approx/unknown), location, profile reference
    - [x] `actor`: generalized entity with canonical labels, aliases, identifiers
    - [x] `event_actor_role`: link events to actors with role vocabulary (Victim, Perpetrator, Witness, Reporter, etc.)
    - [x] `schema_profile`, `schema_field`, `schema_constraint`: configurable profile registry
  - [x] Implement backward-compatibility mapping
    - [x] Migrate/resolve existing victim/perpetrator records into actor-compatible integration payloads
    - [x] Preserve legacy participant/victim/perpetrator semantics
  - [x] Add role-based claims and evidence
    - [x] `claim`: assertions on actors/roles with confidence and source evidence
    - [x] `claim_evidence`: link claims to article mentions with coder metadata
- [x] **2.1.x — Multi-Domain Profile Support**
  - [x] Implement admin UI for profile definition
  - [x] Support homicide (preloaded default) + custom domains
  - [x] Role-based field visibility and validation
  - [x] Support role-specific attributes (e.g., "conviction" shows for Perpetrator; "contact" for Witness)
  - [x] Support searchable news outlet selection with add-new matching behavior
- [x] **2.2.x — Identity Resolution & Merge at Scale**
  - [x] Reuse alias + promotion logic for actors
  - [x] Enhance duplicate matching for multi-field scoring
  - [x] Provide explainability for candidate scoring
  - [x] Build actor merge queue and promotion UI

---

### **Phase 3: AtoM Plugin & Workbench Deployment (Promoted)**

Promoted from former Phase 4 so the host integration is built first. Objective: the plugin should merge into AtoM UI patterns so users experience a single cohesive application.

Runtime contract note: this phase now explicitly includes delivering a runnable AtoM host environment from this repository (developer-local and CI-ready), not only plugin artifacts.

- [x] **3.0.x — AtoM Plugin Backend (Symfony)** (promoted from former `4.0.x`)
  - [x] Create AtoM plugin scaffold (access-homicide-tracker)
  - [x] Implement plugin routes for CRUD on events, actors, roles, claims, evidence, merges, graph
  - [x] Integrate with AtoM ACL and user management
  - [x] Publish annotation layer API contract
- [x] **3.1.x — Workbench UI in AtoM** (promoted from former `4.1.x`)
  - [x] 3.1.0: Provision runnable AtoM host stack from this repository (containerized local runtime + bootstrap scripts + runbook) — **merged to origin/main 2026-04-28**
  - [x] 3.1.1: AtoM stack readiness and bootstrap automation with memory limit fix — **completed locally, bootstrap ready for production**
  - [x] 3.1.2: Embedded plugin capture foundation (field ownership contract + form extension hooks + lifecycle sync bridge + e2e verification) — **merged to origin/main 2026-05-06**
  - [ ] 3.1.3+: Build workbench event/actor annotation pages and integrate with AtoM record views (pending 3.1.2 completion; scope TBD)
- [<] **3.2.x — Targeted PWA & Offline Sync** (promoted from former `4.2.x`)
  - [ ] Implement service worker for workbench routes only (not full-site offline)
  - [ ] Cache manifest, vocabularies, recent records, and mutation queue
  - [ ] Use IndexedDB for offline queue with idempotency keys, ordered replay, and conflict handling
  - [ ] Implement sync endpoint: `/api/workbench/sync/batch`
- [<] **3.3.x — Plugin Hardening & Pilot** (promoted from former `4.3.x`)
  - [ ] Run pilot with historical homicide data
  - [ ] Test offline reliability, merge quality, analysis consistency
  - [ ] Gather user feedback on workbench workflows
  - [ ] Prepare for production deployment

---

### **Phase 4: Graph Visualization & Statistical Reproducibility (Re-scoped)**

Demoted from former Phase 3 so advanced features are built against the plugin-native host boundary.

Dependency note: Phase 4 now assumes promoted Phase 3 AtoM integration is complete.

Merged from former `1.3.x` scope (tracked under graph explorer line):

- [>] **4.0.x — Graph Explorer** (re-scoped from former `3.0.x`)
  - [ ] Implement graph backend: article–event–actor–role–claim edges
  - [ ] Build graph visualization UI
  - [ ] Support filtering and traversal by role, profile, confidence
  - [ ] Perpetrator "unknown" input as checkbox
  - [ ] Victim-perpetrator relationship "other" option with custom text
  - [ ] Perpetrator sentencing: support multiple sentences
  - [ ] Add final review step before submission
- [>] **4.1.x — Statistical Reproducibility** (re-scoped from former `3.1.x`)
  - [ ] Provide export modes: mention-level raw, actor-resolved, diff metadata
  - [ ] Document merge lineage and reversibility
  - [ ] Support audit trail for coder decisions and merge rationale

---

### **Phase 5: Migration & Sustainability**

Complete migration from standalone HMT. Archive legacy system. Establish ongoing plugin maintenance.

- [ ] **5.0.x — Data Migration from Current System**
  - [ ] Map articles → AtoM information objects
  - [ ] Map victims/perpetrators/events → actor + event_actor_role + claims
  - [ ] Preserve source URLs and article provenance
  - [ ] Support bulk ingest and reconciliation
- [ ] **5.1.x — Legacy Archive & Deprecation**
  - [ ] Archive current Next.js HMT as historical baseline
  - [ ] Migrate user research artifacts to AtoM plugin
  - [ ] Provide read-only access to legacy data during transition
- [ ] **5.2.x — Ongoing Maintenance & Extensibility**
  - [ ] Support additional research domains (trafficking, corruption, etc.)
  - [ ] Extend plugin with community-contributed profile templates
  - [ ] Maintain plugin compatibility with AtoM versions

---

## Participant Merge & Alias Promotion Contract (frozen)

Contract version: `2026-04-18`

- Contract source: `lib/contracts/participant-merge.ts`
- Published endpoint: `GET /api/participants/contract`
- Frozen operation endpoints:
  - `POST /api/participants/merge`
  - `POST /api/participants/alias-promotion`

### Merge request fields

- `sourceParticipantId`
- `targetParticipantId`
- `sourceRole` (`participant | victim | perpetrator`)
- `targetRole` (`participant | victim | perpetrator`)
- `reason` (optional)

### Alias promotion request fields

- `participantId`
- `role` (`participant | victim | perpetrator`)
- `aliasToPromote`

### Alias promotion result fields

- `participantId`

---

## Participant Form Contract

Contract version: `2026-04-19`

- Contract source: `lib/contracts/participant-form.ts`
- Published endpoint: `GET /api/participants/form-contract`
- Supported participant types:
  - `victim`
  - `perpetrator`
  - `other`
- `role`
- `newPrimaryName`
- `demotedPrimaryAlias`

The Homicide Media Tracker is designed for research teams to:

- Collect structured homicide data from media articles
- Detect duplicates across sources
- Support multi-user research workflows with optional remote sync
- Operate offline using a local LibSQL/SQLite database and optionally sync to a remote server
- Visualise and export data for analysis

## Quick Start (development)

Prerequisites: Node.js (>=14), npm (>=7) — see `package.json` `devEngines`.

Install dependencies:

```bash
npm install
```

Run in development (Next dev server + Electron):

```bash
# Start Next.js dev server
npm run dev

# In another terminal, start Electron connected to the dev server
npm run dev:electron

# Or run both together
npm start
```

The Next dev server runs on `http://localhost:3000` by default.

## Build & Package (production)

1. Build Next.js standalone server:

```bash
npm run build
```

2. Build Electron assets (main + preload) and prepare the app:

```bash
npm run build:electron
```

3. Package installers (platform-specific):

```bash
npm run package       # builds for all targets configured
npm run package:all   # runs build:electron then package
```

Note: Packaging requires proper code signing and platform-specific entitlements — avoid changing `build` fields without maintainers' approval.

## Architecture Summary

- Frontend: Next.js app lives in `app/` (App Router, Next 14). API routes are under `app/api/*/route.ts`.
- Electron main: `src/main/main.ts` handles app lifecycle, spawns or connects to the Next.js server, registers IPC handlers, and initialises the local database.
- Preload: `src/main/preload.ts` exposes a safe IPC bridge to the renderer.
- Database: Local LibSQL (via `@libsql/client`) and Drizzle ORM live in `lib/database/*`. The singleton `databaseManager` centralises connections, migrations, backup and sync logic.
- Packaging: `electron-builder` config lives in `package.json` `build` section. Packaged app includes `.next/standalone/server.js` and uses `release/app` files.

See `src/main/main.ts` and `lib/database/connection.ts` for the concrete implementations of server management and DB behaviours.

## Important Runtime Details (discoverable patterns)

- Dev vs Production server: In dev the main process expects `http://localhost:3000`. In production the main process finds an available port and spawns the standalone server (`.next/standalone/server.js`) with `PORT` set.
- Next.js server startup: `src/main/main.ts` implements `waitForServer()` with retries; failures in dev log actionable messages.
- Asset paths: Use `app.isPackaged` and `process.resourcesPath` when accessing `assets/` from the main process.
- IPC surface: `ipcMain.handle` handlers include `get-app-version`, `get-platform`, `get-server-port`, `database-status`, `database-sync`, `database-backup`, and `show-message-box`. Update `src/main/preload.ts` when changing these.
- Database init: `databaseManager.initialiseLocal()` is invoked during window creation; in packaged mode DB failures are tolerated (app runs without DB), while in development such failures rethrow to aid debugging.

## Developer Workflows & Commands

- `npm run dev` — Next.js development server
- `npm run dev:electron` — Launch Electron in development mode (requires Next dev server)
- `npm start` — Run both dev server and Electron concurrently
- `npm run build` — Next.js build (standalone output)
- `npm run build:electron` — Build Electron main & preload bundles and run `prepare-app` script
- `npm run prepare:electron` — Install native app dependencies; runs `scripts/check-native-dep.js` then `electron-builder install-app-deps`
- `npm run package` / `npm run package:all` — Create installers
- `npm run test` — Run Jest tests
- `npm run lint` / `npm run lint:fix` — Linting

## Database Patterns

- The `databaseManager` singleton in `lib/database/connection.ts` exposes methods:
  - `initialiseLocal()` — creates LibSQL client, initialises Drizzle, runs migrations
  - `configureRemote(url, authToken?)` — sets up remote LibSQL client and enables sync
  - `syncWithRemote()` — simplified sync routine called by `database-sync` IPC
  - `createBackup()` — copies local DB file and returns backup path
  - `getConfig()` / `updateConfig()` — access and change runtime config
  - `close()` — close local/remote clients and stop auto-sync

- Migrations are executed programmatically in `runMigrations()` and use `CREATE TABLE IF NOT EXISTS` — new migrations must be idempotent.

## API Routes & Conventions

- Use `app/api/*/route.ts` with named `GET`, `POST` exports returning `NextResponse`. Example: `app/api/health/route.ts`.
- Server-side logic (duplicate detection, heavy processing) lives in API routes so it runs inside the Next.js server (standalone or dev).

## Troubleshooting Notes (from backup README)

- Database errors during development: remove or re-create the DB if migrations fail. Example SQL approach from older docs referenced `newdatabase.sql` — proceed section-by-section.
- Default password mentioned in older docs (for deleting DB): `1234` — treat as legacy; do not hardcode secrets in code.
- Safari quirks: older notes mention Safari compatibility issues for web client; prefer Chrome during testing.

## Useful Files to Inspect When Changing Behaviour

- `src/main/main.ts` — server lifecycle, spawning logic, IPC handlers
- `src/main/preload.ts` — renderer-safe IPC exposure
- `lib/database/connection.ts` — DB manager, migration and backup logic
- `app/api/*/route.ts` — API route examples (health, sync, homicides, articles)
- `webpack.main.config.js`, `webpack.preload.config.js` — bundling config for main/preload processes
- `scripts/*` — packaging helpers (`prepare-app.js`, `check-native-dep.js`)

## Contribution Notes & Safety

- Avoid changing `build` packaging config without consultation (code signing, entitlements are platform-specific).
- When adding native modules, update `scripts/check-native-dep.js` and run `npm run prepare:electron` locally.

## Frequently Asked / Open Questions (from project notes)

- How should case IDs be structured? (URL + title + author hashing is used historically)
- Should homicides be primary entities with articles as supplementary? The codebase currently uses an article-centric approach but supports both.
- How to handle unidentified suspects? Consider restricting name fields until identification is confirmed.

If you'd like, I can:

- add a short developer checklist for PR reviewers (migrations, packaging, IPC changes),
- expand IPC examples with the exact `preload.ts` calls and a small renderer snippet,
- or add the virtualenv / runtime cache instructions from `.github/copilot/README.md` into a `CONTRIBUTING.md`.
