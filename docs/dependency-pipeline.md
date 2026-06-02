# Dependency Upgrade Pipeline

> **Scope:** `app.news-media-tracker` (submodule).  
> **Strategy:** Incremental version laddering — never skip two major versions in one phase; align shared dependencies to the *next highest* version present across submodules before targeting latest.  
> **Execution model:** Each phase maps to a fleet lane. Every phase must pass its verification gate before the next phase opens.

---

## 1. Cross-Submodule Alignment Strategy

When the same package appears in multiple submodules at different versions, the upgrade target for any one submodule is **the lowest version higher than its current one that already exists elsewhere in the monorepo** — not the global latest. This eliminates large, untested jumps and ensures at least one submodule has already validated the intermediate version.

**Decision table (populate with actual values from each submodule `package.json` before launching a root fleet):**

| Package | `app.news-media-tracker` (current) | `srvc.atom` (current) | Root / shared | Phase target (this app) | Ultimate target |
|---|---|---|---|---|---|
| `next` | 14.x | — | — | 15.x | 16.x (phase after) |
| `electron` | 38.x | — | — | 40.x | 42.x (phase after) |
| `uuid` | 9.x | — | — | 11.x | 14.x (phase after) |
| `css-loader` | 6.x | — | — | 7.x | 7.x (done) |
| `style-loader` | 3.x | — | — | 4.x | 4.x (done) |
| `detect-port` | 1.x | — | — | 2.x | 2.x (done) |
| `cross-env` | 7.x | — | — | 10.x | 10.x (done) |
| `eslint-plugin-jest` | 27.x | — | — | 28.x | 28.x (done) |
| `eslint-plugin-promise` | 6.x | — | — | 7.x | 7.x (done) |
| `actions/checkout` | 5 | — | — | 6 | 6 (done) |

> **Root fleet instruction:** Before generating lane prompts, query each submodule's `package.json` and fill in the `srvc.atom` and shared columns. If `srvc.atom` already has a higher intermediate version, that becomes the phase target for this app.

---

## 2. Current Dependency Inventory — `app.news-media-tracker`

### 2a. Production dependencies

| Package | Current | Dependabot PR | Notes |
|---|---|---|---|
| `@libsql/client` | ^0.5.6 | #29 (group) | Minor/patch |
| `bootstrap-icons` | 1.13.1 | #29 (group) | Minor/patch |
| `dexie` | ^4.2.0 | #29 (group) | Minor/patch |
| `drizzle-orm` | ^0.30.10 | #29 (group) | Minor/patch |
| `localtunnel` | ^2.0.2 | — | No open PR |
| `next` | ^14.2.32 | #12 | **Major** — see Phase 5 |
| `react` | ^18.3.1 | — | Stable |
| `react-dom` | ^18.3.1 | — | Stable |
| `react-router-dom` | ^6.21.2 | #29 (group) | Minor/patch |
| `zod` | ^3.23.8 | #29 (group) | Minor/patch |

### 2b. Dev dependencies with open major-bump PRs

| Package | Current | Target (PR) | Risk |
|---|---|---|---|
| `electron` | ^38.0.0 | 42.x (#20) | High — IPC, Node compat |
| `uuid` | ^9.0.1 | 14.x (#13) | High — ESM only in v14 |
| `css-loader` | ^6.8.1 | 7.x (#17) | Medium — webpack config API |
| `style-loader` | ^3.3.3 | 4.x (#19) | Medium — webpack config API |
| `detect-port` | ^1.5.1 | 2.x (#18) | Medium — API changed, used in `main.ts` |
| `cross-env` | ^7.0.3 | 10.x (#15) | Low-medium — script runner |
| `eslint-plugin-jest` | ^27.4.0 | 28.x (#14) | Low — lint rules only |
| `eslint-plugin-promise` | ^6.1.1 | 7.x (#16) | Low — lint rules only |

### 2c. CI actions with open PRs

| Action | Current | Target (PR) | Risk |
|---|---|---|---|
| `actions/checkout` | 5 | 6 (#10) | None |

---

## 3. Phased Upgrade Pipeline

Each phase is a fleet unit. Phases must be executed in order. Within a phase, listed tasks are parallel-safe unless marked sequential.

---

### Phase A — Zero-risk immediate merges
**Semver contract:** no app code changes; CI and grouped minor/patch only.  
**Verification gate:** CI passes on merged branch; no test regression.

| Lane | PR | Action |
|---|---|---|
| A-01 | #10 | Merge `actions/checkout` v5 → v6 directly |
| A-02 | #29 | Merge grouped npm minor/patch (13 packages) |

**Acceptance criteria:** `pnpm test` passes on merged branch. No build errors.

---

### Phase B — Lint toolchain
**Semver contract:** `devDependencies` only; no runtime or build pipeline change.  
**Verification gate:** `pnpm run lint` passes with zero new errors introduced.

| Lane | PR | Action | Known blockers |
|---|---|---|---|
| B-01 | #14 | `eslint-plugin-jest` 27 → 28 | New rules may flag test files; fix violations in same PR |
| B-02 | #16 | `eslint-plugin-promise` 6 → 7 | Same; fix rule violations inline |

**Acceptance criteria:** `pnpm run lint` exits 0. All existing test files still parseable.

---

### Phase C — Script/toolchain runtime
**Semver contract:** build scripts and process utilities only; no webpack pipeline, no renderer.  
**Verification gate:** dev server starts; `pnpm start` reaches ready state.

| Lane | PR | Action | Known blockers |
|---|---|---|---|
| C-01 | #15 | `cross-env` 7 → 10 | Audit all `package.json` scripts using `cross-env`; v10 dropped Node <12 support (no impact) |
| C-02 | #18 | `detect-port` 1 → 2 | `src/main/main.ts` port-discovery call — v2 is ESM-first; check import style and callback vs promise API |

> **`detect-port` note:** In `main.ts`, locate the `detectPort` / `detect-port` call. v2 uses `export default` instead of `module.exports`. If using `require()`, switch to `import` or use `createRequire`. Verify `waitForServer` logic still works after change.

**Acceptance criteria:** `pnpm run dev` starts Next.js dev server and Electron window without port errors.

---

### Phase D — Webpack pipeline
**Semver contract:** webpack loaders only; no renderer component changes.  
**Verification gate:** `pnpm run build` (Next.js) and `pnpm run build:main` + `build:preload` (Electron) all succeed.

| Lane | PR | Action | Known blockers |
|---|---|---|---|
| D-01 | #17 | `css-loader` 6 → 7 | `webpack.main.config.js` — check `modules` option shape; v7 changed `localIdentName` placement |
| D-02 | #19 | `style-loader` 3 → 4 | Same webpack configs — v4 dropped `injectType: 'singletonStyleTag'` option; audit usages |

> These two can be done in a single lane if webpack configs are touched together, since they affect the same files.

**Acceptance criteria:** Full production build completes. CSS modules resolve correctly in packaged output.

---

### Phase E — UUID ESM migration
**Semver contract:** `uuid` import style only; no logic changes.  
**Verification gate:** all `uuid` import sites compile; unit tests pass.

| Lane | PR | Action | Known blockers |
|---|---|---|---|
| E-01 | #13 | `uuid` 9 → 14 | v14 is ESM-only. Steps: (1) search all `import`/`require` of `uuid`; (2) ensure all are named ESM imports `import { v4 as uuidv4 } from 'uuid'`; (3) check jest transform config handles ESM |

> **Search pattern:** `grep -r "from 'uuid'\|require('uuid')" app/ lib/ src/`  
> **Jest note:** `uuid` v14 may require `transformIgnorePatterns` update in `jest.config.js` to include `uuid` in the transform set.

**Acceptance criteria:** `pnpm test` passes. No `ERR_REQUIRE_ESM` at runtime.

---

### Phase F — Next.js 14 → 15
**Semver contract:** framework upgrade; expect caching and async-API behaviour changes.  
**Verification gate:** full test suite + manual smoke test of all API routes and page renders.

| Lane | PR / action | Known breaking changes |
|---|---|---|
| F-01 | Upgrade `next` 14 → 15 (not #12 directly — #12 targets 16; create intermediate branch) | `fetch` caching default flipped to `no-store`; `cookies()`/`headers()` now async in server components; `params` in route handlers now a Promise |
| F-02 | Update `eslint-config-next` to match Next 15 | Peer dep; currently pinned to `14.2.5` — bump to `^15.x` |

> **PR #12 targets 16 directly.** Do not merge it in this phase. Create a new branch at 15.x, land it, then run Phase G to go 15 → 16.

**API routes to audit (`app/api/*/route.ts`):**
- Any `export const revalidate` or `export const dynamic` — revalidation semantics changed.
- Any `cookies()` or `headers()` calls not awaited — now async in Next 15.
- Any `generateStaticParams` that relied on `fetch` caching.

**Acceptance criteria:** All `app/api/` routes return expected responses. `pnpm build` completes without deprecation errors.

---

### Phase G — Next.js 15 → 16
**Semver contract:** framework upgrade, second hop.  
**Verification gate:** same as Phase F plus any new 16.x breaking change checklist (populate from Next 16 migration guide at launch time).

| Lane | Action |
|---|---|
| G-01 | Merge or re-target #12 against Phase F branch; apply Next 16 migration guide diff |

---

### Phase H — Electron 38 → 40 (intermediate hop)
**Semver contract:** Electron major upgrade, first hop to intermediate version.  
**Verification gate:** packaged app opens; IPC handlers respond; DB initialises.

| Lane | Action | Known blockers |
|---|---|---|
| H-01 | Upgrade `electron` 38 → 40 | Node version bundled in Electron 40 — check `@libsql/client` native bindings compatibility; rebuild native deps with `electron-rebuild` |

> **Files to touch:** `src/main/main.ts`, `webpack.main.config.js` (Electron target version), `package.json` build config.  
> **Do not upgrade `electron-builder` in the same phase** — isolate the Electron runtime change.

**Acceptance criteria:** `npm run dev:electron` opens a window. All IPC handlers (`database-status`, `database-sync`, `database-backup`, `show-message-box`) respond correctly.

---

### Phase I — Electron 40 → 42
**Semver contract:** Electron major upgrade, second hop. PR #20 targets this.  
**Verification gate:** same as Phase H.

| Lane | Action |
|---|---|
| I-01 | Merge or re-target #20 against Phase H branch |

---

## 4. Root Fleet Coordination Protocol

When this pipeline is managed from the monorepo root:

1. **Before generating lane prompts:** the root conductor reads `app.news-media-tracker/package.json` and `srvc.atom/package.json` (and any root `package.json` / `devcontainer` base image) and fills in the cross-submodule alignment table in §1 above.

2. **Shared dependency rule:** if a package appears in both submodules and the target versions differ, the phase target for each submodule is the *lowest of the two higher versions* — not independently set. This means both submodules reach the same version at the end of the phase.

3. **Integration gate:** after each phase lands in all submodules, the root conductor runs `npm run verify.integrated` before opening the phase summary PR.

4. **Fleet file location (root):** `prompts/fleet/<planned-version>/` at the monorepo root. Each lane file references its owned submodule path explicitly so there is no ambiguity about which `package.json` is being modified.

5. **Semver of the fleet phases themselves:** each phase (A through I) corresponds to a `3.x.y` patch version on the app. Phases A–B → `3.3.2`, Phases C–D → `3.3.3`, Phase E → `3.3.4`, Phases F–G → `3.4.0`, Phases H–I → `3.5.0`.

---

## 5. Open Dependabot PR Disposition

| PR | Disposition | Phase |
|---|---|---|
| #10 | Merge in Phase A | A |
| #29 | Merge in Phase A | A |
| #14 | Merge in Phase B (with lint fixes) | B |
| #16 | Merge in Phase B (with lint fixes) | B |
| #15 | Merge in Phase C | C |
| #18 | Merge in Phase C (with API fix in `main.ts`) | C |
| #17 | Merge in Phase D | D |
| #19 | Merge in Phase D | D |
| #13 | Merge in Phase E (with import sweep) | E |
| #12 | **Do not merge directly** — re-target against Phase F intermediate (14→15) then Phase G (15→16) | F/G |
| #20 | **Do not merge directly** — re-target against Phase H branch (38→40) then Phase I (40→42) | H/I |
