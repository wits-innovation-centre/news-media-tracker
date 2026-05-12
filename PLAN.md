# Homicide Media Tracker Plan

## Active update (2026-05-12)

- Direction confirmed: web-first, offline-first, and single-user-first.
- Electron packaging is deprioritized for now; runtime assumptions should not depend on Electron-specific paths.
- Primary near-term target: one user can run the full workflow reliably offline and sync on reconnect.
- Verification update: latest phase-gate artifacts are published and the conductor merge gate status is tracked in the fleet manifest.
- pnpm shared-store policy is present in `.npmrc`, and local permission validation now passes with no EACCES failures.
- The primary persistence strategy is:
	1. Durable local storage and offline queueing in the browser/PWA.
	2. A user-installable local server with persistent on-disk database.
	3. An external server profile in the Docker stack for team/hosted sync.
	4. Optional upstream multi-user synchronization after single-user reliability is complete.

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

- `3.3.x` sync hardening and pilot reliability.
- `4.0.x` graph explorer.
- `4.1.x` statistical reproducibility.

## Archived context note

- Historical planning from the previously deleted plan file has been intentionally condensed here and de-scoped from service-specific integration tracks.
- Earlier roadmap records included multiple completed fleet orchestration cycles across `2.0.0`, `2.1.0`, and `2.2.0`, which remain acknowledged as completed in this document.
- The active planning baseline is now the web-first, offline-first local-server strategy captured above.
