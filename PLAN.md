# Homicide Media Tracker Plan

## Active update (2026-05-29)

## Active update (2026-06-01)

## Active update (2026-06-02)

- Completed: launched dependency-audit fleet contract for `3.3.1` focused on dependency currency with strict functionality preservation gates.
- Completed: created conductor manifest at `.github/fleet/3.3.1/manifest.yaml` with lane ownership, merge policy, and escalation rules.
- Completed: mapped current Dependabot branch inputs into the fleet manifest for npm, GitHub Actions, and Docker/devcontainer ecosystems.
- Remaining: open worker lanes and merge into `phase/3.3.1` after each lane reports green verification.
- Risk/follow-up: large-major dependency jumps (notably framework/runtime/toolchain upgrades) may require phased rollouts if integrated verification fails.

- Completed: document pane now renders structured frontmatter as editable form fields (Obsidian-style properties) instead of raw markdown frontmatter text editing.
- Completed: document pane keeps a separate free-text Notes editor beneath the properties block to preserve the frontmatter + narrative document model.
- Completed: article rows in the side tree now support explicit right-side caret collapse/expand behavior for child event/participant pointers.
- Completed: child-creation controls under each article are consolidated into a single `+ Add` action that opens event vs participant choices.
- Completed: participant draft flow now starts from the unified add action and defers subtype choice (`victim` or `perpetrator`) to the properties form.
- Completed: removed duplicate add buttons and replaced them with hover-only insertion controls rendered between document rows across the tree.
- Completed: insertion controls are context-aware: global separators create articles, and separators under an article also allow linked event/participant creation for that article.
- Completed: document header empty-state action now shows `Add New Article` instead of a disabled `Save Document`, and automatically transitions back to active save controls once the created document loads.
- Completed: migrated legacy field taxonomy and dropdown semantics into the unified document properties editor for article/event/victim/perpetrator forms.
- Completed: participant draft forms now include legacy-style victim/perpetrator dropdown fields (murder type, demographics, relationship, suspect status) rather than only minimal text inputs.
- Completed: date field normalization now converts ISO timestamps to `YYYY-MM-DD` for correct date-input rendering in the new editor flow.
- Completed: added a document-level `Delete` action in the header for persisted documents (article/event/victim/perpetrator), with confirmation and post-delete workspace refresh.
- Completed: article deletion now applies linked-document reconciliation server-side: linked events are deleted when no remaining article links exist, otherwise event links are reduced to undeleted articles, and directly article-linked victim/perpetrator records are deleted.
- Completed: restored API-backed news platform suggestions in the unified article properties form, including add-new-outlet persistence via the outlets vocabulary endpoint.
- Completed: restored legacy multi-author editing behavior in the unified article properties form, including special undefined-style author modes (`Undisclosed`, `Anonymous`, `Unknown`).
- Completed: restored reveal-on-select perpetrator field behavior in unified forms (suspect arrested/charged and downstream fields now appear conditionally based on selected status flow).
- Completed: audited legacy article/victim/perpetrator forms against unified document properties and added missing victim/perpetrator form elements (aliases, date-mode/end-date, nationality, additional location/death detail fields, suspect aliases).
- Completed: participant draft properties now expose the expanded legacy victim/perpetrator element set so create flows and edit flows share the same field coverage.
- Completed: victim/perpetrator API coercion now persists newly represented properties (`victimAliases`, `dateOfDeathMode`, `dateOfDeathEnd`, `nationality`, `ageDescriptor`, `suspectAliases`) instead of dropping them during save.
- Completed: event document properties now use name-first multi-select checkbox dropdowns for linked articles and linked participants (invite-style picker UX), while preserving ID storage for API payloads.
- Verification: static diagnostics reported no errors in `app/page.tsx` and `app/globals.css` after refactor.
- Remaining: execute interactive browser smoke validation for sidebar add-menu behavior, article expand/collapse state, and draft create/save round-trips.
- Risk/follow-up: advanced perpetrator charge/sentencing sub-field UI is still represented as raw persisted `charges`/`conviction`/`sentence` properties rather than the full card-based microflow used in the legacy dedicated perpetrator form.

## Active update (2026-05-31)

- Completed: replaced the previous Form/Graph/Table split workspace with a persistent side-panel + main-pane structure inspired by Obsidian-style navigation.
- Completed: side panel now renders a tree of document pointers grouped by article, with nested event and participant pointers opening editable document views.
- Completed: document filtering in the side panel now drives the hidden case-loader query and therefore propagates to graph and table projections.
- Completed: main table mode now renders an expanded pointer table (article + linked event + linked participant) with click-to-open document behavior.
- Completed: document editor now uses Markdown-style files with YAML-like front-matter (`field: value`) plus free-text notes below the front-matter block.
- Completed: article-first creation flow is now explicit in the side panel (`+ Article`, then `+ Event` / `+ Victim` / `+ Perp` under article nodes), enforcing linked-child creation from the workspace.
- Completed: server APIs now validate article linkage on event and participant create/update operations; orphaned linked records are rejected.
- Completed: victim/perpetrator records now persist free-text notes in dedicated `notes` fields (with additive migrations for existing databases).
- Remaining: add dedicated structured editors per document type (article/event/participant) to complement the current JSON editor for richer in-place editing UX.
- Risk/follow-up: merged participant pointer persistence currently depends on whichever participant records are returned by the loaded case projection; consider an include-merged pointer mode for explicit post-merge lineage visibility.

- Completed: fixed external-browser blank-screen regression caused by stale service-worker-cached Next.js chunks during development.
- Completed: `lib/components/boot-pwa.ts` now disables service-worker registration in development and proactively unregisters old workers and clears caches.
- Completed: `public/service-worker.js` now bypasses caching for `/_next/*` and HMR/debug asset requests to prevent stale chunk graph hydration failures.
- Completed: `app/layout.tsx` now injects a dev-only pre-hydration cleanup script that unregisters service workers and clears Cache Storage before React bootstraps.
- Completed: `next.config.js` now applies development-only no-cache response headers to prevent stale HTML/chunk manifests from persisting across browser reloads/restarts.
- Remaining: validate in an external browser profile that previously cached state now recovers after one reload.
- Risk/follow-up: if users still have persistent stale registrations from older builds, a one-time hard refresh or manual "Unregister service worker" may still be needed.

- Completed: added a named volume mount for workspace-root `node_modules` (`/workspace/node_modules`) in both workspace-level devcontainer profiles to prevent root-ownership drift on shared monorepo dependencies.
- Completed: updated README reset instructions to include the new workspace-root dependency volume.
- Remaining: rebuild/reopen container and verify `npm`/`pnpm` runs do not recreate root-owned entries under `/workspace/node_modules`.

- Completed: moved dependency volume-mount strategy from app-local `.devcontainer/` to workspace-root devcontainer configs under `/workspace/.devcontainer/`.
- Completed: updated both `/workspace/.devcontainer/devcontainer.json` and `/workspace/.devcontainer/apps.news-media-tracker/devcontainer.json` to mount app `node_modules` and pnpm store as named volumes.
- Completed: removed recursive ownership-repair command from workspace-root `postStartCommand` to avoid long startup-time `chown -R` sweeps.
- Completed: deleted app-local `apps/news-media-tracker/.devcontainer/devcontainer.json` override so root-owned configuration is the single source of truth.
- Remaining: rebuild/reopen the devcontainer to apply the updated mount definitions.

- Completed: added a repository-local devcontainer config that mounts app `node_modules` and pnpm store as named Docker volumes, and enables UID/GID synchronization for the `node` user.
- Completed: documented the new devcontainer dependency-mount workflow in `README.md`, including rebuild and volume-reset steps.
- Remaining: validate in the host superproject devcontainer that opening this app directly uses `.devcontainer/devcontainer.json` as intended.

- Completed: reviewed the pnpm ownership validation flow to identify shorter alternatives to full recursive ownership repair for root-owned path drift.
- Completed: confirmed the current guard already uses a bounded scan and recommends recursive `chown` as the default remediation, but repo-level shorter options remain available depending on desired safety.
- Remaining: if workflow friction remains high, choose whether to optimize around targeted repair, user-owned stores/install paths, or a relaxed validation mode.

- Completed: installed `ripgrep` in the live dev container and added it to the shared `Dockerfile` base stage so all build/runtime stages include `rg`.
- Completed: implemented explicit connected-graph model utilities with three node classes (`article`, `event`, `participant`) and participant subtypes (`victim`, `perpetrator`).
- Completed: graph model now emits hard edges for capture links (article->event and event->participant) and soft edges for merge/dedup suggestions (participant similarity, article headline/url similarity, event-level participant overlap).
- Completed: participant merge queue candidate generation now supports similarity-based matches (not exact-name only) and records `similarity` + `matchReason` metadata.
- Completed: graph and merge UIs now surface soft-link evidence to support merge confirmation and dedup workflows.
- Verification: focused utility suites were executed during implementation; one assertion threshold mismatch was fixed (`>= 0.9` for near-name match), and graph utility tests passed in the latest reported run.
- Remaining: rerun focused utility suites once more after final UI-related edits to capture a fresh all-green verification output in one run.
- Risk/follow-up: current participant subtype modeling is role-based (`victim`/`perpetrator`) and can be extended to richer participant-type taxonomy if schema-level participant kinds are introduced.

## Active update (2026-05-12)

## Active update (2026-05-29)

- Completed: reverted unintended `ripgrep` install changes in root `Dockerfile` used for app/runtime images.
- Completed: added `ripgrep` installation to `.devcontainer/Dockerfile`, which is the image used to build this development container.
- Completed: moved GHCR/runtime Docker assets to `.ghcr/` and updated path references in compose, workflow, scripts, and docs.
- Completed: updated auth guidance in `.env`, `.env.example`, and `README.md` to be algorithm-agnostic (HS256 shown as example only).
- Remaining: rebuild/reopen devcontainer so the updated image provisions `ripgrep` automatically for future sessions.
- Risk/follow-up: existing running container will not pick up `.devcontainer/Dockerfile` changes until rebuild.

- Direction confirmed: web-first, offline-first, and single-user-first.
- Electron packaging is deprioritized for now; runtime assumptions should not depend on Electron-specific paths.
- Primary near-term target: one user can run the full workflow reliably offline and sync on reconnect.
- Verification update: latest phase-gate artifacts are published and the conductor merge gate status is tracked in the fleet manifest.
- pnpm shared-store policy is present in `.npmrc`, and local permission validation now passes with no EACCES failures.
- UI direction update: app-specific DESIGN.md now reflects the queue-first workspace and dark-mode brand rules for News Media Tracker.
- Stitch update: the dark-mode design-system session for the active project has been started; if the session propagation lags, refresh the project record before treating it as final.
- The primary persistence strategy is:
  1.  Durable local storage and offline queueing in the browser/PWA.
  2.  A user-installable local server with persistent on-disk database.
  3.  An external server profile in the Docker stack for team/hosted sync.
  4.  Optional upstream multi-user synchronization after single-user reliability is complete.

## Active update (2026-05-29)

- Completed: Docker tooling (`docker`, `docker-compose`) was installed in the active development container via apt.
- Completed: `.devcontainer/Dockerfile` now installs `docker.io` and `docker-compose`, so rebuilt development containers include Docker tooling.
- Remaining: if compose v2 (`docker compose`) is required specifically, add Docker's official apt repository and install `docker-compose-plugin` in a follow-up.
- Risk/follow-up: Debian package `docker-compose` is compose v1; scripts expecting v2 subcommand syntax may need adaptation or plugin installation.

## Active update (2026-05-27)

- Completed: added workspace-level VS Code settings at `apps/news-media-tracker/.vscode/settings.json` to force npm scripts integration to use `pnpm` and to exclude `.wiki` from watcher/search indexing.
- Completed: mitigation targets scripts-panel reload stalls after `package.json` edits by reducing watcher pressure and avoiding npm/pnpm provider ambiguity.
- Remaining: validate that the npm scripts panel refreshes immediately after `package.json` edits without requiring `pnpm install`.

- Completed: pnpm permission guardrails are now enforced before local dev/start via script hooks, and validation includes root-ownership drift checks for critical paths and workspace node_modules trees.
- Completed: ownership scanning logic in `scripts/validate-pnpm-permissions.js` was optimized to a bounded top-level scan so validation does not stall on large dependency trees.
- Verification: `node scripts/validate-pnpm-permissions.js` now completes successfully with all checks passing.
- Remaining: monitor during stash re-apply to confirm no additional workflow-specific paths need to be added to critical ownership checks.
- Risk/follow-up: bounded node_modules scan targets the high-probability drift locations (root + top-level + scoped package level) and may not detect deeply nested root-owned files created by unusual toolchains.

## Active update (2026-05-28)

- Completed: added GHCR publishing workflow at `.github/workflows/publish-ghcr.yml` for a minimal app container delivery path.
- Completed: optimized `.ghcr/Dockerfile` runner stage to use production-only dependencies (`prod-deps` stage) to reduce final image size.
- Completed: added `.ghcr/docker-compose.yml` for pull-and-run deployment from GHCR without local image build.
- Completed: documented GHCR publish/deploy steps in `README.md`.
- Remaining: optional follow-up to add authenticated pull guidance for private packages or organization package visibility defaults.
- Risk/follow-up: current GHCR compose file is app-only by design; deployments needing sqld must continue to use `docker-compose.yml` external-server profile.

## Active update (2026-05-28b)

- Completed: deterministic deploy-path repair for GHCR by aligning `package.json` and `pnpm-lock.yaml` so `pnpm install --prod --frozen-lockfile` succeeds.
- Completed: Docker install steps now explicitly use `--ignore-workspace` to prevent parent monorepo workspace detection from affecting this app's image build.
- Verification: `pnpm install --ignore-workspace --prod --frozen-lockfile` passes locally after lockfile regeneration.
- Remaining: run GHCR publish workflow again to confirm remote build parity.
- Risk/follow-up: if cross-platform prebuilt libsql optional packages are required later, reintroduce them with a lockfile/tooling strategy that preserves frozen-lockfile integrity.

## Current architecture decisions

### 1) Local-first source of truth

- Keep local capture fully functional while offline.
- Treat browser-side queue/cache as a resilience buffer, not the long-term source of truth.
- Use deterministic replay and idempotency keys for queued writes.

### 2) Local server mode (user-installable)

- Provide a local server bundle that users can side-load and run on localhost.
- Local server owns persistent on-disk database files and serves sync endpoints.
- The web app connects to localhost exactly like a remote endpoint.

### 3) Hosted sync mode (optional)

- Users can configure a hosted database endpoint for shared collaboration and backup.
- Sync policy remains offline-safe: local writes first, upstream replication when available.

## Phase 3.2.0 plan (offline sync and local server readiness)

### Phase contract

- Phase name: Offline sync bridge and single-user deployment readiness.
- Planned version: `3.2.0`.
- Approval state: approved (orchestration launch requested 2026-05-11).
- Allowed change class: minor.
- Phase branch: `phase/3.2.0`.
- Scope guardrail:
  - Include offline queue, replay, status UX, and single-user deployment surfaces.
  - Include both deployment tracks: Docker external server profile and packaged local server.
  - Exclude graph/reproducibility feature expansion and advanced multi-user governance features.
- Target merge: `origin/main` after integrated verification.

### Lane decomposition

- `[3.2.0][00-conductor]` Integrate phase 3.2.0 fleet
  - Owned surface: `phase/3.2.0` governance, manifest, final PR orchestration.
- `[3.2.0][01-persistence-hardening]` Harden durable local persistence
  - Owned surface: browser storage durability policy, quota/persist handling, fallback behavior.
- `[3.2.0][02-offline-queue]` Implement robust offline queue and replay
  - Owned surface: queue state machine, retry backoff, idempotency, conflict-resolution stubs.
- `[3.2.0][03-sync-bridge]` Finalize sync bridge endpoints and status
  - Owned surface: sync/replay API behavior, status reporting, queue acknowledgment contract.
- `[3.2.0][04-local-server-connectivity]` Add localhost connector and config UX
  - Owned surface: local endpoint configuration, health checks, connection diagnostics.
- `[3.2.0][05-external-server-stack]` Add external server profile to Docker stack
  - Owned surface: docker-compose services, persistent volume defaults, env contract, startup docs.
- `[3.2.0][06-local-server-packaging]` Ship packaged local-server runtime
  - Owned surface: install/run scripts, local data path defaults, health-check command, update path.
- `[3.2.0][07-workbench-offline-ux]` Integrate offline indicators and manual sync controls
  - Owned surface: sync status UI, pending-queue surfaces, manual retry triggers.
- `[3.2.0][08-verification]` Verify single-user offline and reconnect behavior across both deployment tracks
  - Owned surface: integration tests, replay correctness tests, local-server/external-server recovery drills.

### Dependency notes

- Lanes 01 and 02 can run in parallel.
- Lane 03 depends on lanes 01 and 02.
- Lane 04 depends on lane 03.
- Lanes 05 and 06 can run in parallel once lane 03 sync contracts are stable.
- Lane 07 depends on lanes 03, 04, 05, and 06.
- Lane 08 runs after all worker lanes merge.

### Immediate checklist

- Approve phase 3.2.0 scope and lane decomposition with single-user-first priority.
- Remove/disable Electron-path assumptions in server DB path resolution.
- Add external-server Docker profile and document one-command startup.
- Publish packaged local-server deployment docs with localhost defaults and persistent volume locations.
- Add verification gate for offline -> reconnect -> replay -> consistency checks across both server tracks.

## Historical completed records (retained)

- `2.2.0` closeout fleet completed and merged.
- `2.1.0` multi-domain profile support fleet completed and merged.
- `2.0.0` event-actor-role integration completed and merged.

## Phase 3.3.x plan (sync governance and controlled sharing)

### Objective

- Establish repository-level sharing with clear permissions and merge authority.
- Support collaborative editing where multiple users can create or modify the same logical record.
- Keep transfer and sync paths aligned so local-server handoff and multi-user sync use the same contracts.
- Align sync-governance UX with Stitch-approved workspace patterns, including the in-place Form/Graph workspace mode switch.

### Role model

- Global roles:
  - `admin`
  - `standard`
- Repository membership permissions:
  - `read`
  - `write`
  - `share`
  - `resolve_conflicts`
  - `manage_members`
- Baseline policy:
  - Repository owner can delegate conflict resolution without granting full administrative control.
  - Conflict decisions are limited to users with `resolve_conflicts` (or equivalent owner/admin override).

### Data and sync model

- Treat each repository as a collaborative data boundary.
- Track record mutations as operations (append-only) with actor and version metadata.
- Detect divergence using stale base-version checks during replay/sync.
- Auto-merge only non-overlapping field edits; otherwise open explicit conflict records.
- Maintain an auditable trail for conflict decisions and resolution outcomes.

### Planned deliverables

- Schema additions for repositories, memberships, permission grants, operation log, and conflict records.
- API contracts for share/invite flows and conflict-resolution actions.
- Minimal conflict queue UI for authorized users.
- Policy checks in sync/replay endpoints to enforce repository permissions.
- UI sync implementation against Stitch designs for Entry Workspace, Event Ledger, and Connected Graph interactions.

### Suggested lane decomposition (draft)

- `[3.3.x][00-conductor]` Integrate sync-governance fleet.
- `[3.3.x][01-repository-membership-schema]` Add repository and membership data model.
- `[3.3.x][02-sharing-permissions]` Implement invite/share and grant management APIs.
- `[3.3.x][03-operation-log]` Add operation-based mutation log and base-version checks.
- `[3.3.x][04-conflict-engine]` Implement auto-merge rules and conflict record generation.
- `[3.3.x][05-conflict-resolution-ui]` Ship manual conflict resolution queue and actions.
- `[3.3.x][06-ui-sync-implementation]` Implement UI/UX alignment to Stitch designs (UI/UX implementarian lane).
- `[3.3.x][07-verification]` Validate permission enforcement, UI behavior, and merge outcomes.

### UI sync lane contract (next phase)

- Dedicated lane: `[3.3.x][06-ui-sync-implementation]`.
- Role: UI/UX implementarian to Stitch's designer (consume approved Stitch screens and map to shipped components).
- Owned surface:
  - `app/page.tsx` navigation/view shell behavior.
  - `lib/components/input-homicide.tsx` entry workspace composition and mode toggle integration.
  - `lib/components/list-homicides.tsx` Event Ledger table-mode alignment.
  - New graph workspace component(s) under `lib/components/` for in-place Graph mode.
  - `app/globals.css` style token application needed for Stitch alignment.
- Non-owned surface:
  - Schema and permission engine code owned by lanes 01-04.
  - Conflict policy enforcement logic owned by lanes 03-05.
- Acceptance criteria:
  - Entry Workspace supports in-place `Form | Graph` switching without route changes.
  - Queue/selection state persists across workspace mode switches.
  - Event Ledger and Connected Graph states follow Stitch layout hierarchy and token usage.
  - Keyboard accessibility for mode toggles and primary graph controls.

### Phase dependency notes (3.3.x)

- Lanes 01 and 02 can run in parallel.
- Lane 03 depends on lane 01.
- Lane 04 depends on lane 03.
- Lane 05 depends on lanes 02 and 04.
- Lane 06 can start after baseline routes/components are stable and should merge after lane 05 API contracts are finalized.
- Lane 07 runs after all worker lanes merge.

### Priority note

- This phase is important but not a blocker for current 3.2.x offline/local-server readiness.
- Current priority remains durable offline capture plus reliable replay and connectivity to local/hosted sync targets.

## Roadmap candidates after 3.2.x

- `3.3.1` dependency audit and upgrade stabilization (maintenance fleet with functionality gates).
- `3.3.x` sync hardening and pilot reliability.
- `4.0.x` graph explorer.
- `4.1.x` statistical reproducibility.

## Archived context note

- Historical planning from the previously deleted plan file has been intentionally condensed here and de-scoped from service-specific integration tracks.
- Earlier roadmap records included multiple completed fleet orchestration cycles across `2.0.0`, `2.1.0`, and `2.2.0`, which remain acknowledged as completed in this document.
- The active planning baseline is now the web-first, offline-first local-server strategy captured above.
