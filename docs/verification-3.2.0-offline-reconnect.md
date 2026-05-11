# [3.2.0][08-verification] Offline/Reconnect Verification Summary

**Phase:** 3.2.0 — Offline sync bridge and single-user deployment readiness  
**Lane:** 08-verification  
**Owned surfaces:** `app/api/sync/replay.test.ts`, `__tests__/`, `docs/`  
**Date:** 2026-05-11  
**Status:** ✅ All gates green

---

## Scope

This document records the verification evidence for the single-user offline and reconnect behavior delivered across all worker lanes in phase 3.2.0. The verification is **read-only** — no feature code was changed as part of this lane.

---

## Integrated regression suite

The integrated gate suite lives in `__tests__/integrated-verification-gates.test.ts` and is invoked with:

```
npm run verify.integrated
```

### Gate results

| Gate | Description | Tests | Status |
|------|-------------|-------|--------|
| Gate 1 | Replay correctness regression suite | 9 | ✅ |
| Gate 2 | Persistence durability — idempotency across reconnect cycles | 3 | ✅ |
| Gate 3 | Localhost connectivity — URL resolution | 3 | ✅ |
| Gate 4 | External Docker server track — remoteBaseUrl routing | 3 | ✅ |
| Gate 5 | Reconnect drill — offline then online sequence | 3 | ✅ |
| Gate 6 | Cross-track auth compatibility | 4 | ✅ |
| Gate 7 | Service-worker queue contract — constants alignment | 4 | ✅ |
| **Total** | | **29** | **✅** |

---

## Recovery drill evidence

The reconnect drill (Gate 5) exercises the following three-phase scenario:

1. **Offline phase** — `replayOfflineOperations` is called with a mock that throws `Error('fetch failed')`. All queued operations are returned with `status: 'failed'`, no queue IDs are acked, and nothing is written to the replay cache.

2. **Reconnect phase** — The same operations are submitted again (simulating the service-worker `BackgroundSync` retrigger via the `online` event). The mock now returns `200 OK`. All operations are successfully replayed and their queue IDs are acked.

3. **Idempotency assertion** — If the same `requestId` is submitted a third time (e.g. duplicate delivery from the offline queue), the replay cache intercepts it and returns `status: 'duplicate'` without issuing a second network request.

This matches the flow in `public/service-worker.js`:
- `storePostRequest()` captures the queued operation with a `requestId` from `crypto.randomUUID()`.
- `syncQueuedPosts()` submits all queued entries to `PATCH /api/sync` on reconnect.
- `route.ts` normalises the payload through `normalizeReplayOperations()` and calls `replayOfflineOperations()` with the module-level `replayCache`.

---

## Cross-track compatibility checks

Two deployment tracks are verified:

### Track A: Packaged local server (localhost)

- `remoteBaseUrl` is `undefined` → replay URL resolves to `requestOrigin + /api/sync/batch`.
- Verified in Gate 3: URL is exactly `http://localhost:3000/api/sync/batch`.
- `X-Offline-Replay: 1` header is present on every replay request.

### Track B: External Docker server

- `remoteBaseUrl` is set (e.g. `http://atom-server:8080`) → replay URL resolves to `remoteBaseUrl + /api/sync/batch`.
- Trailing slashes on `remoteBaseUrl` are stripped before path concatenation.
- Server-returned `ackedQueueIds` in the response body are correctly parsed and returned.
- Verified in Gate 4.

---

## Replay.test.ts unit coverage

The unit test file `app/api/sync/replay.test.ts` was expanded from 3 tests to 18 tests covering:

| Scenario | Test count |
|----------|-----------|
| Original baseline (filter, deduplicate, forwarded auth) | 3 |
| Server ack paths (`ackedQueueIds`, `ackedRequestIds`, per-request `results`) | 3 |
| Failure paths (network error, non-ok status) | 2 |
| Localhost URL resolution | 2 |
| Persistence (cross-call idempotency via cache) | 1 |
| Auth injection (`remoteAuthToken`, header precedence) | 2 |
| `normalizeReplayOperations` edge cases (DELETE, all prefixes, whitespace, non-array) | 4 |
| Empty queue fast-path | 1 |
| **Total** | **18** |

---

## Owned-surface confirmation

| Surface | Changed | Notes |
|---------|---------|-------|
| `app/api/sync/replay.test.ts` | ✅ Yes | Expanded from 3 → 18 tests; no production code changed |
| `__tests__/integrated-verification-gates.test.ts` | ✅ Yes | Created; 29 integrated gates |
| `docs/verification-3.2.0-offline-reconnect.md` | ✅ Yes | This document |
| `app/api/sync/replay.ts` | ❌ No | Production source unchanged |
| `app/api/sync/route.ts` | ❌ No | Production source unchanged |
| `public/service-worker.js` | ❌ No | Production source unchanged |
| `lib/utils/cache-manager.ts` | ❌ No | Production source unchanged |

---

## Blockers / stop conditions

None triggered. All implementation lanes were verifiable without requiring feature edits. No scope drift into 3.3.x multi-user governance was detected.

---

## Manifest status

See `.github/fleet/3.2.0/manifest.yaml` — lane `08-verification` updated to `readiness: ready`.
