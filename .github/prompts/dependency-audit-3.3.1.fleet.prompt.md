```
@cloud You are [3.3.1][00-conductor] Integrate dependency-audit fleet.

Repository lock directive:

- Hard scope:
  - Repository owner/name: wits-research-office-development/news-media-tracker
  - Working directory: /workspace/apps/news-media-tracker
  - Allowed branches: phase/3.3.1, lane/3.3.1/\*
  - Target branch for worker PRs: phase/3.3.1
  - Final merge target: origin/main
- Forbidden:
  - No branch creation in sibling repositories.
  - No file edits outside /workspace/apps/news-media-tracker.
- Startup gate:
  1. Print `git remote -v` and `git branch --show-current`.
  2. If active branch is not `phase/3.3.1`, record a warning and continue on the current branch.
  3. Continue after working-directory and repository checks pass.
- PR gate:
  - Worker PR base must be `phase/3.3.1`.
  - Worker PR title must start with lane prefix.
  - Final PR base must be `main`.

Lane identity:

- Branch: phase/3.3.1
- Target branch: main
- PR title prefix: [3.3.1][00-conductor]

Fleet contract:

- Planned version: 3.3.1
- Allowed change class: patch
- Merge policy: barrier-after-green
- Dependency: merge lanes 01, 02, 03 first; lane 04 after those merges

Task:

- Initialize/update `.github/fleet/3.3.1/manifest.yaml` lane status as worker PRs progress.
- Merge only green worker PRs into `phase/3.3.1`.
- Run integration verification after lanes 01-04 merge.
- Open one final PR from `phase/3.3.1` to `main` with verification summary.

Owned surface:

- `.github/fleet/3.3.1/manifest.yaml`
- phase/3.3.1 merge governance
- final PR body and verification summary

Required outputs:

- Final PR to `main`
- Verification summary covering: `pnpm install --frozen-lockfile`, `npm run lint`, `npm run test`, `npm run verify.integrated`, `npm run build`
- Manifest status updates for each lane

Stop conditions:

- Worker lane changes another lane's owned surface.
- Integrated verification fails and no bounded fix is identified.
- Scope expands beyond dependency audit / app functionality preservation.
```
@cloud You are [3.3.1][01-npm-audit-upgrade] Upgrade npm/pnpm dependencies to latest workable versions.

Repository lock directive:

- Hard scope:
  - Repository owner/name: wits-research-office-development/news-media-tracker
  - Working directory: /workspace/apps/news-media-tracker
  - Allowed branches: phase/3.3.1, lane/3.3.1/01-npm-audit-upgrade
  - Target branch for worker PRs: phase/3.3.1
  - Final merge target: origin/main
- Forbidden:
  - No branch creation in sibling repositories.
  - No file edits outside /workspace/apps/news-media-tracker.
- Startup gate:
  1. Print `git remote -v` and `git branch --show-current`.
  2. If active branch is not `lane/3.3.1/01-npm-audit-upgrade`, record a warning and continue on the current branch.
  3. Continue after working-directory and repository checks pass.
- PR gate:
  - PR base must be `phase/3.3.1`.
  - PR title must start with `[3.3.1][01-npm-audit-upgrade]`.
  - Include dependency upgrade table and verification summary.

Lane identity:

- Branch: lane/3.3.1/01-npm-audit-upgrade
- Target branch: phase/3.3.1
- PR title prefix: [3.3.1][01-npm-audit-upgrade]

Fleet contract:

- Planned version: 3.3.1
- Allowed change class: patch
- Merge policy: barrier-after-green
- Dependency: none

Task:

- Pull current Dependabot npm branches and reconcile them into one cohesive dependency upgrade.
- Upgrade dependencies in `package.json` and `pnpm-lock.yaml` as far as possible while keeping app behavior functional.
- Apply minimal code/config compatibility fixes required by upgraded packages.
- Explicitly document any package deferred due to failing functional verification.

Owned surface:

- `package.json`
- `pnpm-lock.yaml`
- npm-related compatibility touches in app/runtime/build config

Required outputs:

- One PR to `phase/3.3.1`
- Verification summary: `pnpm install --frozen-lockfile`, `npm run lint`, `npm run test`, `npm run build`
- Manifest status update with blockers/deferred packages

Stop conditions:

- Changes required outside dependency-audit scope.
- Functional regressions remain unresolved.
- Required edits collide with owned surfaces for lanes 02 or 03.

@cloud You are [3.3.1][02-actions-upgrade] Upgrade GitHub Actions dependencies and workflow compatibility.

Repository lock directive:

- Hard scope:
  - Repository owner/name: wits-research-office-development/news-media-tracker
  - Working directory: /workspace/apps/news-media-tracker
  - Allowed branches: phase/3.3.1, lane/3.3.1/02-actions-upgrade
  - Target branch for worker PRs: phase/3.3.1
  - Final merge target: origin/main
- Forbidden:
  - No branch creation in sibling repositories.
  - No file edits outside /workspace/apps/news-media-tracker.
- Startup gate:
  1. Print `git remote -v` and `git branch --show-current`.
  2. If active branch is not `lane/3.3.1/02-actions-upgrade`, record a warning and continue on the current branch.
  3. Continue after working-directory and repository checks pass.
- PR gate:
  - PR base must be `phase/3.3.1`.
  - PR title must start with `[3.3.1][02-actions-upgrade]`.
  - Include workflow verification summary.

Lane identity:

- Branch: lane/3.3.1/02-actions-upgrade
- Target branch: phase/3.3.1
- PR title prefix: [3.3.1][02-actions-upgrade]

Fleet contract:

- Planned version: 3.3.1
- Allowed change class: patch
- Merge policy: barrier-after-green
- Dependency: none

Task:

- Pull Dependabot GitHub Actions branches and update workflow action versions.
- Preserve existing permissions and security posture unless required for compatibility.
- Ensure workflow syntax and referenced actions remain valid.

Owned surface:

- `.github/workflows/*`

Required outputs:

- One PR to `phase/3.3.1`
- Verification summary: workflow lint/validation and rationale for any permission changes
- Manifest status update with readiness/blockers

Stop conditions:

- Workflow updates require non-workflow code changes.
- Security posture regresses without explicit justification.

@cloud You are [3.3.1][03-docker-upgrade] Upgrade Docker and devcontainer dependency surfaces.

Repository lock directive:

- Hard scope:
  - Repository owner/name: wits-research-office-development/news-media-tracker
  - Working directory: /workspace/apps/news-media-tracker
  - Allowed branches: phase/3.3.1, lane/3.3.1/03-docker-upgrade
  - Target branch for worker PRs: phase/3.3.1
  - Final merge target: origin/main
- Forbidden:
  - No branch creation in sibling repositories.
  - No file edits outside /workspace/apps/news-media-tracker.
- Startup gate:
  1. Print `git remote -v` and `git branch --show-current`.
  2. If active branch is not `lane/3.3.1/03-docker-upgrade`, record a warning and continue on the current branch.
  3. Continue after working-directory and repository checks pass.
- PR gate:
  - PR base must be `phase/3.3.1`.
  - PR title must start with `[3.3.1][03-docker-upgrade]`.
  - Include compose/build verification summary.

Lane identity:

- Branch: lane/3.3.1/03-docker-upgrade
- Target branch: phase/3.3.1
- PR title prefix: [3.3.1][03-docker-upgrade]

Fleet contract:

- Planned version: 3.3.1
- Allowed change class: patch
- Merge policy: barrier-after-green
- Dependency: none

Task:

- Pull Dependabot Docker branches and update Docker image tags/bases.
- Reconcile root and `.ghcr` Docker surfaces with devcontainer expectations.
- Verify compose configs and image build behavior remain functional.

Owned surface:

- `Dockerfile`
- `.ghcr/Dockerfile`
- `docker-compose.yml`
- `.ghcr/docker-compose.yml`
- `.devcontainer/*`

Required outputs:

- One PR to `phase/3.3.1`
- Verification summary: `docker compose config`, targeted build checks
- Manifest status update with readiness/blockers

Stop conditions:

- Docker updates require broad app refactors outside this lane.
- Runtime functionality is degraded without a bounded fix.

@cloud You are [3.3.1][04-functional-verification] Validate integrated functionality after dependency upgrades.

Repository lock directive:

- Hard scope:
  - Repository owner/name: wits-research-office-development/news-media-tracker
  - Working directory: /workspace/apps/news-media-tracker
  - Allowed branches: phase/3.3.1, lane/3.3.1/04-functional-verification
  - Target branch for worker PRs: phase/3.3.1
  - Final merge target: origin/main
- Forbidden:
  - No branch creation in sibling repositories.
  - No file edits outside /workspace/apps/news-media-tracker.
- Startup gate:
  1. Print `git remote -v` and `git branch --show-current`.
  2. If active branch is not `lane/3.3.1/04-functional-verification`, record a warning and continue on the current branch.
  3. Continue after working-directory and repository checks pass.
- PR gate:
  - PR base must be `phase/3.3.1`.
  - PR title must start with `[3.3.1][04-functional-verification]`.
  - Include full verification matrix and pass/fail details.

Lane identity:

- Branch: lane/3.3.1/04-functional-verification
- Target branch: phase/3.3.1
- PR title prefix: [3.3.1][04-functional-verification]

Fleet contract:

- Planned version: 3.3.1
- Allowed change class: patch
- Merge policy: barrier-after-green
- Dependency: start only after lanes 01, 02, and 03 are merged into `phase/3.3.1`

Task:

- Execute full integrated verification of upgraded dependency state.
- Add/adjust dependency-upgrade verification assertions only if required by legitimate behavior shifts.
- Produce explicit pass/fail summary for app functionality requirement.

Owned surface:

- `__tests__/integrated-verification-gates.test.ts`
- `__tests__/verification-3.3.0-gates.test.ts`
- `docs/verification-3.3.0-sync-governance.md`

Required outputs:

- One PR to `phase/3.3.1`
- Verification summary: `npm run lint`, `npm run test`, `npm run verify.integrated`, `npm run build`
- Manifest status update with final gate status

Stop conditions:

- Found regressions without a reproducible bounded fix.
- Required fixes spill into another lane's owned surface without coordination.
