- Active update (2026-05-06): Phase 3.1.2 embedded-capture foundation merged to origin/main
  - Completed:
    - ✅ 3.1.2 fleet merged to origin/main with all lanes (01-04) integrated
    - ✅ Field ownership contract finalized: AtoM-native vs plugin-owned vs linked-by-id field matrix
    - ✅ Plugin form-extension hooks implemented for event/case and participant-adjacent AtoM capture views with style/token parity
    - ✅ AtoM lifecycle-to-plugin sync bridge wired: create/update hooks trigger deterministic plugin persistence writes
    - ✅ End-to-end embedded capture path verified: AtoM form entry → hook fire → plugin write → plugin retrieval
    - ✅ Regression check confirmed existing workbench fallback routes remain intact
    - ✅ UX parity validated: injected plugin controls match AtoM visual language
  - Next phase: Phase 3.2.0 planning (PWA offline-sync for workbench routes) — approve contract and launch fleet
  - Risks / follow-ups:
    - Plugin route mount at `/plugins/homicide-tracker/*` remains unresolved; embedded runtime continues to use hosted fallback at `/api/workbench/[[...pluginPath]]`
    - Phase 3.2.0 should prioritize offline queue and IndexedDB extensions for workbench routes before graph explorer work

- Completed update (2026-05-06): AtoM-first embedded plugin capture model architecture decision
  - Decision confirmed:
    - AtoM remains the primary application and source-of-truth capture workflow.
    - The homicide tracker plugin extends existing AtoM capture surfaces instead of operating as a parallel standalone capture flow.
    - Plugin APIs remain a bridge/integration surface, but the target UX is in-form and in-workflow augmentation inside AtoM.
  - Scope boundaries:
    - Avoid direct core-file patching in AtoM; use plugin extension points and route bindings.
    - Keep plugin-owned fields/entities isolated (schema + services) while linking to AtoM record identifiers.
    - Preserve backward compatibility for existing workbench/offline flows during migration.
    - Treat AtoM visual and interaction parity as a first-class requirement for embedded plugin UI surfaces.
  - Planned integration checkpoints:
    - Define canonical mapping of AtoM-native capture fields vs plugin-owned homicide fields.
    - Add plugin form-extension hooks to relevant AtoM data-entry views (event/case and participant-adjacent flows).
    - Implement lifecycle sync hooks so AtoM create/update events trigger plugin persistence updates.
    - Verify end-to-end capture from AtoM UI through plugin persistence and retrieval contracts.
  - Risks / follow-ups:
    - Plugin route mount in current local stack is still unresolved (host returns HTML 404 at `/plugins/homicide-tracker/*`), so embedded runtime validation currently relies on hosted fallback routes.
    - Field ownership boundaries must be finalized before lane delegation to avoid dual-write and schema drift.

## Phase 3.1.2 Planning (AtoM-Embedded Capture Foundation)

### Phase contract

- Phase name: AtoM-embedded capture integration foundation
- Planned version: `3.1.2`
- Version rationale: additive alignment of capture ownership and extension hooks before `3.2.0` offline-sync implementation
- Allowed change class: minor (integration contracts, extension wiring, lifecycle sync hooks, verification)
- Scope guardrail: no full offline queue redesign; no graph explorer or pilot hardening scope
- Target merge: `origin/main` after integrated verification on `phase/3.1.2`
- UX/style priority: embedded plugin UI must match AtoM design language (layout, typography, spacing, controls, validation messaging, and interaction behavior) unless an explicit divergence is approved.

### Fleet-oriented lane decomposition (completed)

- `[3.1.2][00-conductor]` Integrate phase 3.1.2 embedded-capture fleet
  - Owned surface: `phase/3.1.2` governance, semver/scope enforcement, merge sequencing, final PR to `origin/main`
- `[3.1.2][01-field-ownership-contract]` Publish AtoM-vs-plugin field ownership matrix
  - Owned surface: ownership contract docs, DTO boundary definitions, persistence ownership rules
- `[3.1.2][02-form-extension-hooks]` Implement plugin extension hooks for target AtoM capture views
  - Owned surface: plugin hook registration and view-level injection points for event/case and participant-adjacent capture, including AtoM style/token alignment for injected controls
- `[3.1.2][03-lifecycle-sync-bridge]` Add AtoM lifecycle-to-plugin sync hook wiring
  - Owned surface: create/update hook handlers, id-linking policy, sync event contracts
- `[3.1.2][04-contract-verification]` Verify embedded capture path end-to-end
  - Owned surface: integration checks from AtoM form submit through plugin persistence and retrieval contracts

### Dependency and merge notes

- Lanes 01 and 02 can run in parallel (contract definition and UI hook scaffolding on non-overlapping surfaces).
- Lane 03 depends on lane 01 (ownership contract required before lifecycle write behavior is finalized).
- Lane 04 depends on lanes 02 and 03 (verification after hooks and lifecycle wiring are merged).
- Conductor lane governs merge order and opens the final PR to `origin/main`.

### Immediate launch checklist

- Approve `3.1.2` semver contract and scope guardrail for fleet launch.
- Create `phase/3.1.2` branch and publish manifest.
- Delegate lanes 01-04 with owned-surface boundaries exactly as listed above.
- Track plugin mount readiness as a parallel risk item; do not block 01/02 on host-route mount restoration.
- Gate final merge on 04 verification sign-off and no unresolved ownership conflicts.

### Fleet launch plan (completed)

- Fleet identity token: 3.1.2
- Approval state: merged to origin/main
- Phase branch: phase/3.1.2 (merged)
- Manifest path: .github/fleet/3.1.2/manifest.yaml (deleted post-merge)
- Merge policy: eager-after-green into phase/3.1.2, then one final PR to origin/main
- Allowed change class enforcement:
  - Accept: additive integration contracts, extension hooks, lifecycle sync, verification artifacts
  - Reject: offline queue redesign, broad PWA scope expansion, graph/pilot features

### Lane identity matrix

- [3.1.2][00-conductor] Integrate phase 3.1.2 embedded-capture fleet
  - Branch: lane/3.1.2/00-conductor (operates on phase/3.1.2 governance)
  - PR title prefix: [3.1.2][00-conductor]
- [3.1.2][01-field-ownership-contract] Publish AtoM-vs-plugin field ownership matrix
  - Branch: lane/3.1.2/01-field-ownership-contract
  - PR title prefix: [3.1.2][01-field-ownership-contract]
- [3.1.2][02-form-extension-hooks] Implement plugin extension hooks
  - Branch: lane/3.1.2/02-form-extension-hooks
  - PR title prefix: [3.1.2][02-form-extension-hooks]
- [3.1.2][03-lifecycle-sync-bridge] Implement lifecycle sync bridge
  - Branch: lane/3.1.2/03-lifecycle-sync-bridge
  - PR title prefix: [3.1.2][03-lifecycle-sync-bridge]
- [3.1.2][04-contract-verification] Verify embedded capture flow
  - Branch: lane/3.1.2/04-contract-verification
  - PR title prefix: [3.1.2][04-contract-verification]

### Acceptance gates per lane

- 01-field-ownership-contract:
  - Field ownership matrix finalized with no unresolved dual-write fields
  - DTO/persistence boundary rules documented and approved
- 02-form-extension-hooks:
  - Hook insertion points compile and render for targeted AtoM capture views
  - No direct core AtoM patching introduced
  - Injected plugin controls match AtoM visual language and form interaction conventions
- 03-lifecycle-sync-bridge:
  - Create/update lifecycle hooks emit deterministic plugin persistence actions
  - Id-linking behavior documented and tested for create and update paths
- 04-contract-verification:
  - End-to-end capture scenario passes from AtoM form entry to plugin retrieval
  - Regression check confirms existing workbench fallback behavior remains intact
  - UX parity check passes for embedded plugin surfaces against baseline AtoM form patterns

### Conductor merge sequence

1. Conductor creates phase/3.1.2 and publishes .github/fleet/3.1.2/manifest.yaml.
2. Merge 01 and 02 in either order after green checks.
3. Merge 03 after 01 is merged and contract boundaries are stable.
4. Merge 04 after 02 and 03 are merged.
5. Conductor records structured summary in final PR body and deletes manifest before opening final PR to origin/main.

- Active update (2026-04-28): 3.1.1 AtoM stack readiness check
  - Completed:
    - Replaced the missing qubit/atom image pull with a source build from Artefactual AtoM stable/2.10.x in [docker-compose.yml](docker-compose.yml) and [srvc.atom/infrastructure/atom-stack/docker-compose.yml](srvc.atom/infrastructure/atom-stack/docker-compose.yml).
    - Added a baked nginx host image in [srvc.atom/infrastructure/atom-stack/nginx/Dockerfile](srvc.atom/infrastructure/atom-stack/nginx/Dockerfile) so atom-host no longer depends on a fragile file bind mount for default.conf.
    - Verified the atom image can build successfully with the classic Docker builder.
  - Remaining:
    - Align the local stack with upstream AtoM runtime dependencies (at minimum Elasticsearch, Memcached, Gearmand, and any required worker/service wiring).
    - Add the required AtoM environment contract so the atom container stops restarting (currently missing ATOM_ELASTICSEARCH_HOST and related service configuration).
    - Re-run the hosted plugin endpoint verification and confirm JSON responses replace the current stub path.
  - Risks / follow-ups:
    - 3.1.1 is not yet releasable; the current stack topology is still incomplete relative to upstream AtoM compose expectations.
    - The existing Redis-backed atom-cache service does not match upstream AtoM's documented Memcached dependency and may need redesign rather than incremental patching.

- Active update (2026-04-28): Devcontainer startup no longer pulls AtoM image
  - Completed:
    - Removed AtoM services (`atom-db`, `atom-cache`, `atom-host`) from `runServices` in root, app, and service devcontainer configs so VS Code startup does not attempt to pull `qubit/atom`.
    - Preserved explicit AtoM lifecycle via stack scripts (`atom.stack.up` / `workspace.service.stack.up`) for users who need the hosted stack.
  - Remaining:
    - Reopen in container and confirm startup completes from all three entry points (superproject, app submodule, service submodule).
  - Risks / follow-ups:
    - If the AtoM stack is required locally, `ATOM_APP_IMAGE` must resolve to an accessible image (public tag or authenticated/private registry).

- Active update (2026-04-27): Submodule topology preparation + devcontainer path fix
  - Completed:
    - Replaced the earlier multi-file devcontainer compose wiring with a single root `docker-compose.yml` that defines the superproject workspace, app workspace, service workspace, and hosted AtoM stack dependencies.
    - Added app/service split as superproject submodules and created `.gitmodules` entries for `app.news-media-tracker` and `srvc.atom`.
    - Added submodule-scoped devcontainers for `app.news-media-tracker` and `srvc.atom`, plus a root superproject devcontainer that all point to the same compose file.
    - Transferred service-owned assets into `srvc.atom` (plugin, AtoM stack, bootstrap/runtime scripts, verification runbook).
    - Transferred app-owned assets into `app.news-media-tracker` (tracker source, build configuration, packaging/test scripts).
    - Removed duplicate root-owned app/service implementation trees so the root repository is orchestration-only.
    - Updated root orchestration scripts, CI install flow, and repository guidance to execute against the submodules.
  - Remaining:
    - Update any remaining archival docs or agent prompts that still discuss former root-owned implementation paths in present tense.
    - Decide whether generated or domain-reference assets in `data/` and `docs/` should stay at the superproject or move into one of the submodules.
  - Risks / follow-ups:
    - Until recursive submodule checkout is enforced in CI and local clone docs, builds may fail with missing directories.
    - Submodule pointer updates require explicit commits in the superproject; release process should define who owns version bump cadence for app vs service.

- Active update (2026-04-28): Phase 3.1.0 host provisioning merged to origin/main + next phase planning
  - Completed:
    - ✅ 3.1.0 fleet merged to origin/main with all lanes (01-05) integrated
    - ✅ AtoM host stack definition, bootstrap automation, plugin runtime binding, workbench host-shell slice, and verification runbook all delivered
    - ✅ Fixed SQLite migration syntax errors (invalid IF NOT EXISTS in ALTER TABLE)
    - ✅ Enhanced AtoM plugin API client error diagnostics for non-JSON responses
    - ✅ SSH agent forwarding configured for devcontainer submodule access
  - Remaining:
    - Plan and scope 3.2.0 phase (PWA/offline sync for workbench routes)
    - Open 3.2.0 fleet orchestration and lane decomposition
  - Risks / follow-ups:
    - Phase 3 plugin foundation is stable; Phase 4 (graph explorer, reproducibility) depends on 3.2.0 offline-sync completion
    - Submodule pointer updates require explicit commits in superproject; ensure release process owns version bump cadence

## Phase 3.2.0 Planning (PWA/Offline Sync for Workbench)

### Phase contract (draft)

- Phase name: PWA offline-sync bridge for workbench routes
- Planned version: `3.2.0`
- Version rationale: additive offline support for workbench plugin-backed routes (perpetrators, victims, events); builds on stable 3.1.0 plugin foundation
- Allowed change class: minor (offline queue/replay, IndexedDB extensions, sync bridge endpoints)
- Scope guardrail: restrict to workbench offline state management; defer full-app sync policy to 3.3.x
- Target merge: `origin/main` after phase/3.2.0 verification

### Preliminary lane decomposition (requires contractor review/approval)

- `[3.2.0][00-conductor]` Integrate phase 3.2.0 offline-sync fleet
  - Owned surface: `phase/3.2.0` governance, manifest, merge policy, final PR
- `[3.2.0][01-indexeddb-extension]` Extend IndexedDB cache for plugin-backed routes
  - Owned surface: data model extensions, cache layer schema updates
- `[3.2.0][02-offline-queue]` Implement offline action queue and replay logic
  - Owned surface: queue persistence, replay state machine, conflictresolution stubs
- `[3.2.0][03-sync-bridge]` Add plugin sync bridge endpoints and status
  - Owned surface: plugin sync routes, status reporting, queuedaction polling
- `[3.2.0][04-workbench-offline]` Integrate offline UI indicators and queue status
  - Owned surface: workbench offline mode UI, sync status display, manual sync triggers
- `[3.2.0][05-verification]` Verify offline queue, sync replay, and bridge behavior
  - Owned surface: offline scenario tests, sync bridge contract tests, integration smoke checks

### Dependency notes

- Lanes 01-02 can run in parallel (both IndexedDB/queue infrastructure)
- Lane 03 depends on lanes 01-02 (sync bridge routes need IndexedDB + queue)
- Lane 04 depends on lane 03 (UI needs bridge endpoints)
- Lane 05 runs after all worker lanes merged

### Next steps

- Obtain explicit approval on lane scope and decomposition
- Create `phase/3.2.0` branch and publish manifest
- Delegate lanes to cloud agents

- Phase 3 lane closeout status (archived snapshot):
  - Completed: event_actor_role, claim, and claim_evidence tables added with FK wiring; default event-role vocabulary seeding added; basic event-role and role-claim CRUD endpoints implemented.
  - Remaining (historical note): `2.0.0/00-conductor` integration wiring and any stricter domain-level predicate/role policy decisions if product required them.
  - Blockers: none for backend schema/API delivery; current implementation supports free-form claim predicates and flexible selector_json evidence formats.

- Completed baseline: participant alias support and merge/promotion infrastructure are already implemented and must remain unchanged.
- Remaining scope: form contract publication first, then post-merge integration wiring and verification only.
- Phase 2a integration slice (archived): publish unified participant form contract, define visibility/editability defaults, and track integration readiness/risk.

## Phase 2a contract (archived, legacy alias: Hotel) — Published

### 1) Type selector contract

- Field key: `participantType`
- UI control: single-select dropdown
- Allowed values (persisted):
  - `victim`
  - `perpetrator`
  - `participant` (display label: `Other`)
- Default type for new rows: `victim`
- New-entry behavior: selecting `Other` (`participant`) is allowed during create flow in this phase.
- Backward compatibility mapping:
  - Existing `victims` records load as `participantType = victim`
  - Existing `perpetrators` records load as `participantType = perpetrator`
- Persistence method:
  - `victim` rows continue using victim payload shape and victim persistence route(s)
  - `perpetrator` rows continue using perpetrator payload shape and perpetrator persistence route(s)
  - `participant` rows persist only shared identity fields in this phase
  - Existing merge/alias plumbing remains unchanged and continues to apply to current victim/perpetrator merge flows

### 2) Field visibility contract by type

- Shared fields (all types):
  - Name
  - Alias
- Victim-only fields:
  - `dateOfDeath`, `placeOfDeathProvince`, `placeOfDeathTown`, `typeOfLocation`, `policeStation`
  - `sexualAssault`, `genderOfVictim`, `raceOfVictim`, `ageOfVictim`, `ageRangeOfVictim`
  - `modeOfDeathGeneral`, `modeOfDeathSpecific`
- Perpetrator-only fields:
  - `perpetratorRelationshipToVictim`, `suspectIdentified`, `suspectArrested`, `suspectCharged`
  - `conviction`, `sentence`
- Other (`participant`) type fields in this phase:
  - Shared fields only (Name + Alias)

### 3) Profile editability scope

- **Phase 2a scope decision:** user-editable (not admin-only)
- Rationale: current app flow has no enforced admin-only profile edit gate in participant input paths.

## Integration checkpoints (archived, executed after `1.2.1` worker lane merge)

- Wire unified participant form submission to validation endpoints.
- Verify list UI renders participant type labels correctly.
- Verify backward compatibility for legacy victim/perpetrator records.
- Verify all lanes use the exact `participantType` key (`victim` | `perpetrator` | `participant`) with no naming drift.
- Run end-to-end scenario:
  1. Create participant as victim
  2. Change type to perpetrator
  3. Confirm merge controls still work unchanged

## Fleet orchestration schema (canonical)

### Checklist marker convention

- `[x]` completed in the scoped release line
- `[ ]` planned and not yet completed
- `[>]` deferred/re-scoped to another semver target (no standalone release at original line)
- `[<]` promoted/re-sequenced from a later roadmap line into an earlier active line

### Canonical identity and naming

- Fleet identity token: approved planned version (semver)
- Conductor lane id: `00`
- Worker lane ids: `01+` (zero-padded)
- Lane name format: `[<planned-version>][<agent-id>-<short-name>] <task-description>`
- Phase branch: `phase/<planned-version>`
- Worker branch: `lane/<planned-version>/<agent-id>-<short-name>`

### Historical alias policy

- Legacy phonetic lane labels (for example Lima/India/Juliet/Kilo) are archived-only references.
- All active planning, delegation, and review uses canonical semver lane ids only.

## Fleet execution record (completed)

### Fleet contract record

- Proposed planned version: `2.1.0`
- Version rationale: additive support for multi-domain profiles and role-based field visibility following completed `2.0.x` schema merge.
- Approval state: approved and completed (fleet initiated and closed 2026-04-20).
- Allowed change class: additive profile and validation features only; no breaking schema removals.
- Phase branch: `phase/2.1.0`
- Merge policy: eager merge into the phase branch after required verification, followed by one final PR to `origin/main`.

### Fleet completion status

- Launch state: closed
- Final PR: `#17` merged to `origin/main` at `b3d147b`
- Conductor lane completed: `[2.1.0][00-conductor]`
- Worker lanes completed: `[2.1.0][01-profile-admin-ui]`, `[2.1.0][02-role-visibility]`, `[2.1.0][03-domain-seed-support]`
- Verification lane completed: `[2.1.0][04-regression-verification]`
- Branch cleanup completed: remaining `origin/copilot/*` worker refs deleted after final merge

### Completed lane decomposition

- `[2.1.0][00-conductor] Integrate phase 2.1.0 fleet`
  - Owned surface: phase branch governance, manifest updates, merge policy enforcement, final PR to `origin/main`.
- `[2.1.0][01-profile-admin-ui] Build schema profile administration UI`
  - Owned surface: profile management UI, profile route handlers, and profile DTO validation.
- `[2.1.0][02-role-visibility] Implement role-based field visibility and constraints`
  - Owned surface: field visibility rules, form rendering gates, and role constraint evaluation.
- `[2.1.0][03-domain-seed-support] Add homicide default + custom domain seed lifecycle`
  - Owned surface: seed loaders, migration-safe seed routines, and domain registration APIs.
- `[2.1.0][04-regression-verification] Validate backward compatibility and integration`
  - Owned surface: regression tests, compatibility assertions, and end-to-end role/profile workflows.

### Coordination state

- Manifest path: `.github/fleet/2.1.0/manifest.yaml`
- Required lane state fields: lane id, branch, PR status, owned surface, readiness, blockers, and verification summary.
- Final manifest state: PR merged, cleanup complete, conductor complete.

### Merge order record

1. `[2.1.0][00-conductor]` created `phase/2.1.0` and published the manifest.
2. `[2.1.0][01-profile-admin-ui]`, `[2.1.0][02-role-visibility]`, and `[2.1.0][03-domain-seed-support]` merged into the phase branch.
3. `[2.1.0][04-regression-verification]` verified integrated behavior and signed off.
4. `[2.1.0][00-conductor]` opened the final PR to `origin/main` and completed post-merge cleanup.

## Milestone status

### Completed

- `2.1.0` multi-domain profile support fleet completed and merged.
- Final integrated verification passed: lint + test green on integrated branch.
- Post-merge branch cleanup completed for remaining `origin/copilot/*` worker branches.
- `2.2.0` Phase 2 closeout fleet completed and merged.
- Integrated closeout verification passed: regression readiness sign-off plus full lint/test baseline on merged phase content.
- Manifest cleanup completed per fleet policy before the final PR.
- Post-merge branch cleanup completed for remaining `origin/copilot/220-*` worker branches.

### Next candidates

- Promoted Phase 3 plugin-first track:
  - `[<] 3.0.x` AtoM plugin backend scaffold and bridge contract
  - `[<] 3.1.x` workbench UI integration into AtoM with single-application UX objective, including in-repo AtoM host provisioning (no external instance assumed)
  - `[<] 3.2.x` targeted PWA/offline sync for workbench routes
  - `[<] 3.3.x` plugin hardening and pilot
- Re-scoped Phase 4 feature track (after promoted Phase 3):
  - `[>] 4.0.x` graph explorer
  - `[>] 4.1.x` statistical reproducibility

## Fleet execution record (Promoted Phase 3 plugin integration)

### Fleet execution record (Phase 3.1 host provisioning integration)

#### Fleet contract block

- Phase name: Phase 3.1 host provisioning integration
- Planned version: `3.1.0`
- Allowed change class: major
- Approval status: approved and integrated on `phase/3.1.0` (2026-04-22)
- Merge policy: eager-after-green
- Scope guardrail: refuse drift into `3.2.x` offline-sync or broader product expansion
- Manifest lifecycle: `.github/fleet/3.1.0/manifest.yaml` published for coordination and deleted before final PR to `main`

#### Lane merge record

- Conductor lane: `[3.1.0][00-conductor]` (PR `#50`)
- Worker lanes merged into `phase/3.1.0` in dependency order:
  1. `[3.1.0][01-atom-stack]` (PR `#51`, merge commit `f035fe7`)
  2. `[3.1.0][02-bootstrap]` (PR `#52`, merge commit `a8b84cf`)
  3. `[3.1.0][03-plugin-runtime-bind]` (PR `#53`, merge commit `58f4a54`)
  4. `[3.1.0][04-workbench-host-shell]` (PR `#54`, merge commit `4ccc5f7`)
  5. `[3.1.0][05-verification-runbook]` (PR `#55`, merge commit `0be6d5f`)

#### Final PR body summary (phase/3.1.0 -> main)

- Semver: `3.1.0` (major)
- Owned surfaces: host provisioning, bootstrap, plugin runtime binding, first host-shell slice, verification
- Blockers resolved: none
- Verification summary:
  - integrated lane merge order completed on `phase/3.1.0`
  - scope audit found no `3.2.x` offline-sync expansion in merged worker lane diffs
  - plugin route smoke checks passed:
    - `npm run test -- plugin/tests/plugin-api-contract.integration.test.ts lib/workbench/plugin-api-client.test.ts __tests__/phase-3-regression-migration.test.ts`
  - lint/test gates passed on integrated branch:
    - `npm run lint`
    - `npm run test`

### Fleet contract block

- Phase name: Promoted Phase 3 plugin integration
- Planned version: `3.0.0`
- Version rationale: move host integration first so subsequent graph/repro features are built directly against AtoM plugin boundaries.
- Allowed change class: major
- Approval status: approved and completed (merged 2026-04-22)
- Final merge PR: `#46`
- Final merge commit on `main`: `9579fe0`
- Manifest lifecycle: `.github/fleet/3.0.0/manifest.yaml` deleted before final merge per fleet policy
- Escalation rule: if scope expands into Phase 4 feature delivery (graph/repro UI), split into `3.1.0+` follow-on phase rather than broadening `3.0.0` foundation scope.

### Parallel-safe lane decomposition

- `[3.0.0][00-conductor] Integrate phase 3.0.0 plugin-foundation fleet`
  - Owned surface: `phase/3.0.0` governance, `.github/fleet/3.0.0/manifest.yaml`, merge policy, final PR.
- `[3.0.0][01-electron-debloat] Retire Electron runtime wiring from strategic app path`
  - Owned surface: Electron main/preload runtime surfaces, IPC dependency removal shims, desktop-only integration path retirement.
- `[3.0.0][02-plugin-scaffold] Create AtoM plugin scaffold and bridge bootstrap`
  - Owned surface: plugin skeleton, route registration, plugin config/bootstrap, health endpoint.
- `[3.0.0][03-backend-domain-port] Port domain persistence/services to plugin backend`
  - Owned surface: plugin-side actor/event/claim/profile persistence and domain services.
- `[3.0.0][04-plugin-api-contract] Publish plugin API routes aligned to existing contracts`
  - Owned surface: plugin controllers/routes and API contract mapping.
- `[3.0.0][05-workbench-bridge] Repoint workbench integration to plugin/API boundary`
  - Owned surface: workbench data adapters and API clients; remove remaining Electron assumptions in workbench path.
- `[3.0.0][06-acl-record-linkage] Integrate AtoM ACL and record linkage entry points`
  - Owned surface: AtoM permission integration, user-context enforcement, record-linked launch points.
- `[3.0.0][07-offline-sync-bridge] Add targeted workbench offline/sync bridge`
  - Owned surface: workbench offline queue/replay and plugin sync bridge endpoints.
- `[3.0.0][08-regression-migration] Run regression, migration rehearsal, and cutover checks`
  - Owned surface: compatibility testing, migration rehearsal artifacts, cutover readiness report.

### Dependency edges

- `[3.0.0][02-plugin-scaffold]` depends on `[3.0.0][01-electron-debloat]` baseline de-bloat decisions.
- `[3.0.0][03-backend-domain-port]` depends on `[3.0.0][02-plugin-scaffold]` plugin bootstrap.
- `[3.0.0][04-plugin-api-contract]` depends on `[3.0.0][03-backend-domain-port]` services and schemas.
- `[3.0.0][05-workbench-bridge]` depends on `[3.0.0][04-plugin-api-contract]` stable route contracts.
- `[3.0.0][06-acl-record-linkage]` depends on `[3.0.0][04-plugin-api-contract]` and can run in parallel with `[3.0.0][05-workbench-bridge]` once API auth hooks are stable.
- `[3.0.0][07-offline-sync-bridge]` depends on `[3.0.0][05-workbench-bridge]` and `[3.0.0][06-acl-record-linkage]`.
- `[3.0.0][08-regression-migration]` runs after lanes `01` through `07` are merged on `phase/3.0.0`.

### Merge order block

- Baseline branch: `origin/main`
- Phase branch: `phase/3.0.0`
- Ordered merge sequence:
  1. `[3.0.0][01-electron-debloat]`
  2. `[3.0.0][02-plugin-scaffold]`
  3. `[3.0.0][03-backend-domain-port]`
  4. `[3.0.0][04-plugin-api-contract]`
  5. `[3.0.0][05-workbench-bridge]`
  6. `[3.0.0][06-acl-record-linkage]`
  7. `[3.0.0][07-offline-sync-bridge]`
  8. `[3.0.0][08-regression-migration]`
  9. `[3.0.0][00-conductor]` opens one final PR from `phase/3.0.0` to `origin/main`

## Fleet manifest status (Phase 3.1.0 workbench host shell)

- Lane id: `[3.1.0][04-workbench-host-shell]`
- Branch: `lane/3.1.0/04-workbench-host-shell`
- Target branch: `phase/3.1.0`
- PR status: in progress on `copilot/310-04-workbench-host-shell`
- PR metadata:
  - Required title prefix: `[3.1.0][04-workbench-host-shell]`
  - Merge policy: eager-after-green
- Owned surface:
  - Host-shell integration entry points
  - Initial embedded workbench pages/views mounted within AtoM host shell
  - Navigation integration surfaces for the first integrated vertical slice
  - Minimal host-facing UI glue for access to the bound plugin runtime
- Readiness: ready for targeted validation and hosted-shell walkthrough evidence
- Blockers:
  - `phase/3.1.0` branch ref is not present in this clone's remote refs (implementation proceeds on lane branch)
- Verification summary:
  - Users can navigate to `/workbench`, `/workbench/events/new`, and `/workbench/events` from the app shell and exercise the integrated hosted slice.

## Fleet execution record (Phase 2 closeout completed)

### Fleet contract block

- Phase name: Phase 2 closeout
- Planned version: `2.2.0`
- Version rationale: closes all remaining `2.x` roadmap items (identity resolution, merge-at-scale UX, role-specific attributes, and outlet combobox) before opening Phase 3 implementation.
- Allowed change class: minor
- Approval status: approved and completed (closed 2026-04-21)
- Escalation rule: if breaking API/schema migration is required, stop lane and split into `2.3.0` or re-contract as major.

### Execution record (conductor update: 2026-04-21)

- Final PR: `#22` merged to `origin/main` at `67cedec`
- Phase branch: `phase/2.2.0`
- Manifest lifecycle: `.github/fleet/2.2.0/manifest.yaml` deleted before the final PR per fleet policy
- Lane merge record:
  - `[2.2.0][01-identity-core]` merged into the phase branch at `c3141f7`
  - `[2.2.0][02-scoring-explainability]` merged into the phase branch at `08e1956`
  - `[2.2.0][03-merge-queue-ui]` merged into the phase branch at `60280e0`
  - `[2.2.0][04-role-attrs-outlet]` merged into the phase branch at `dd0d07a`
  - `[2.2.0][05-regression-verification]` merged into the phase branch at `34c1e33`
- Integrated closeout evidence:
  - `npm run lint` passed on the integrated phase branch
  - `npm run test` passed on the integrated phase branch (`23` suites, `72` tests)
  - Regression readiness report recorded no blocker in the owned verification surface
- Post-merge cleanup evidence:
  - no remaining `origin/copilot/220-*` refs detected in local remote-tracking view

### Parallel-safe lane decomposition

- `[2.2.0][00-conductor] Integrate phase 2.2.0 closeout fleet`
  - Owned surface: `phase/2.2.0` governance, `.github/fleet/2.2.0/manifest.yaml`, final PR body, merge policy enforcement.
- `[2.2.0][01-identity-core] Reuse alias/promotion logic for actors and add multi-field duplicate scoring`
  - Owned surface: actor identity core logic, duplicate scoring services, merge candidate model internals.
- `[2.2.0][02-scoring-explainability] Add candidate scoring explainability surfaces and API outputs`
  - Owned surface: explainability DTOs/contracts, score breakdown API payloads, endpoint response mapping.
- `[2.2.0][03-merge-queue-ui] Build actor merge queue and promotion workflow UI`
  - Owned surface: merge queue views/components, promotion action UX, queue-level filters/sorting.
- `[2.2.0][04-role-attrs-outlet] Complete role-specific attributes and ship outlet searchable combobox`
  - Owned surface: role-specific attribute rendering/validation and outlet-combobox UI/API data path.
- `[2.2.0][05-regression-verification] Verify integrated closeout behavior`
  - Owned surface: cross-lane regression tests, integrated verification checklist, final readiness report.

### Dependency edges

- `[2.2.0][02-scoring-explainability]` depends on `[2.2.0][01-identity-core]` scoring outputs.
- `[2.2.0][03-merge-queue-ui]` depends on `[2.2.0][01-identity-core]` merge candidates and can absorb explainability detail after `[2.2.0][02-scoring-explainability]` lands.
- `[2.2.0][04-role-attrs-outlet]` is parallel-safe and independent of identity-core internals.
- `[2.2.0][05-regression-verification]` runs after worker merges on `phase/2.2.0`.

### Merge order block

- Baseline branch: `origin/main`
- Phase branch: `phase/2.2.0`
- Ordered merge sequence:
  1. `[2.2.0][01-identity-core]`
  2. `[2.2.0][02-scoring-explainability]`
  3. `[2.2.0][03-merge-queue-ui]`
  4. `[2.2.0][04-role-attrs-outlet]`
  5. `[2.2.0][05-regression-verification]`
  6. `[2.2.0][00-conductor]` opened the final PR from `phase/2.2.0` to `origin/main` and merged PR `#22`

### Residual risks / notes

- Last known build risk remains external to fleet closure: sandbox font fetch and existing module-resolution issue in `app/api/participants/form-contract/route.ts` were previously noted.
- Roadmap sequencing rule: under the current architecture, `2.2.x` should precede `3.0.x`/`3.1.x` because graph and reproducibility features depend on stable identity resolution, actor merge explainability, and merge-aware exports.
- Historical CI note from closeout readiness: workflow run `24563387714` failed on `main` due to missing npm script `package` in workflow configuration, not due to the `2.2.0` lane code changes.

## Phase 3 Lima — Event-Actor-Role Integration (Completed, merged to origin/main)

### Merge record (2026-04-20)

- ✅ `[2.0.0][00-conductor]` final integration merged: PR #13 (`featlima-integration`) at `99c0f60` on `origin/main`.
- ✅ `[2.0.0][01-event-schema]` merged: PR #14 (`featindia-event-schema`) at `5fc380b` on `origin/main`.
- ✅ `[2.0.0][02-actor-generalization]` and `[2.0.0][03-role-claims]` integrated via conductor merge commits (`f8dc54c`, `ca65f90`) and resolved in final integration.
- Historical aliases: `00-conductor=Lima`, `01-event-schema=India`, `02-actor-generalization=Juliet`, `03-role-claims=Kilo`.
- ✅ Contract remains frozen at `GET /api/events/contract` with event, actor, event_actor_role, and claim payload keys.

### Completed in this integration branch

- Published Phase 3 contract freeze endpoint: `GET /api/events/contract`.
- Added integrated event read endpoint: `GET /api/events/:id`.
- Added backward-compatible actor projection from legacy `victims` and `perpetrators` records.
- Added default role projection (`victim` / `perpetrator`) with explicit detail-payload override support.
- Added claim projection support from event details payload.
- Added focused tests for contract freeze and integration payload mapping.

### Verification status

- ✅ `npm run lint`
- ✅ `npm run test`
- ⚠️ `npm run build` blocked in sandbox by external font fetch (`fonts.googleapis.com`) and an existing unrelated module-resolution error in `app/api/participants/form-contract/route.ts`.

### Phase 3 closeout status

- ✅ Final India/Juliet/Kilo payloads were merged and aligned with the frozen contract shape.
- ✅ Integration branch conflicts were resolved before merge.
- ✅ Phase 3 implementation merge is complete.

### Next slice

- Continue with Phase 3 graph/exploration roadmap items (graph explorer + statistical reproducibility exports).
- Run the self-contained news outlet searchable combobox feature lane (`feat/november-outlet-combobox`) in parallel, since it has no India/Juliet/Kilo dependency.
