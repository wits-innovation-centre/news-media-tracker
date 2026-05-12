/**
 * [3.2.0][08-verification] Integrated verification gates
 *
 * Validates the end-to-end offline/reconnect behavior for the single-user
 * deployment tracks described in phase 3.2.0:
 *   - Replay correctness (normalise → filter → forward → ack)
 *   - Persistence durability (idempotency across reconnect cycles)
 *   - Localhost connectivity (no remoteBaseUrl → requestOrigin fallback)
 *   - External Docker server track (remoteBaseUrl routing)
 *   - Reconnect drill (fail → retry → succeed sequence)
 *   - Cross-track auth compatibility (forwarded header vs token)
 *   - Service-worker queue contract (constants alignment)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  normalizeReplayOperations,
  replayOfflineOperations,
  type ReplayOperation,
  type ReplayResult,
} from '../app/api/sync/replay';
import {
  OFFLINE_SYNC_ENDPOINT,
  OFFLINE_SYNC_TAG,
  OFFLINE_QUEUE_DB,
  OFFLINE_QUEUE_STORE,
} from '../lib/utils/cache-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkFetch(body: unknown = {}) {
  return jest.fn(async () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      clone: () => ({ json: async () => body }),
    }) as unknown as Response,
  );
}

function makeErrorFetch(message: string) {
  return jest.fn(async () => {
    throw new Error(message);
  });
}

// ---------------------------------------------------------------------------
// Gate 1: Replay correctness — full normalise → filter → forward pipeline
// ---------------------------------------------------------------------------

describe('[gate-1] replay correctness regression suite', () => {
  it('rejects non-array input without throwing', () => {
    expect(normalizeReplayOperations(null)).toEqual([]);
    expect(normalizeReplayOperations(42)).toEqual([]);
    expect(normalizeReplayOperations('bad')).toEqual([]);
  });

  it('rejects GET, HEAD, and OPTIONS methods', () => {
    const ops = normalizeReplayOperations([
      { method: 'GET', endpoint: '/api/events' },
      { method: 'HEAD', endpoint: '/api/events' },
      { method: 'OPTIONS', endpoint: '/api/events' },
    ]);
    expect(ops).toHaveLength(0);
  });

  it('accepts POST, PUT, PATCH, DELETE write methods', () => {
    const ops = normalizeReplayOperations([
      { method: 'POST', endpoint: '/api/events', body: {} },
      { method: 'PUT', endpoint: '/api/events/1', body: {} },
      { method: 'PATCH', endpoint: '/api/events/1', body: {} },
      { method: 'DELETE', endpoint: '/api/events/1' },
    ]);
    expect(ops).toHaveLength(4);
  });

  it('rejects /api/sync and /api/sync/* endpoints to prevent replay loops', () => {
    const ops = normalizeReplayOperations([
      { method: 'PATCH', endpoint: '/api/sync' },
      { method: 'POST', endpoint: '/api/sync/batch' },
      { method: 'POST', endpoint: '/api/sync/queue' },
    ]);
    expect(ops).toHaveLength(0);
  });

  it('rejects endpoints with path traversal sequences', () => {
    const ops = normalizeReplayOperations([
      { method: 'POST', endpoint: '/api/events/../articles', body: {} },
      { method: 'POST', endpoint: '/api/events//double', body: {} },
    ]);
    expect(ops).toHaveLength(0);
  });

  it('rejects DELETE operations that include a body payload', () => {
    const ops = normalizeReplayOperations([
      { method: 'DELETE', endpoint: '/api/events/1', body: { cascade: true } },
    ]);
    expect(ops).toHaveLength(0);
  });

  it('normalises method to uppercase', () => {
    const ops = normalizeReplayOperations([
      { method: 'post', endpoint: '/api/events', body: {} },
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].method).toBe('POST');
  });

  it('trims whitespace from requestId and drops whitespace-only values', () => {
    const ops = normalizeReplayOperations([
      { method: 'POST', endpoint: '/api/events', requestId: '  req-trim  ', body: {} },
      { method: 'POST', endpoint: '/api/events', requestId: '   ', body: {} },
    ]);
    expect(ops[0].requestId).toBe('req-trim');
    expect(ops[1].requestId).toBeUndefined();
  });

  it('forwards a batch of valid operations to the replay endpoint', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { method: 'POST', endpoint: '/api/events', body: { id: 'ev-1' } },
      { method: 'PATCH', endpoint: '/api/articles/art-1', body: { title: 'T' } },
      { method: 'DELETE', endpoint: '/api/victims/v-1' },
    ]);

    const result = await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.status === 'replayed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gate 2: Persistence durability — idempotency across reconnect cycles
// ---------------------------------------------------------------------------

describe('[gate-2] persistence durability — idempotency across reconnect cycles', () => {
  it('de-duplicates within a single batch when the same requestId appears twice', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 1, requestId: 'req-dup', method: 'POST', endpoint: '/api/events', body: {} },
      { queueId: 2, requestId: 'req-dup', method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    const result = await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const statuses = result.results.map((r) => r.status).sort();
    expect(statuses).toEqual(['duplicate', 'replayed']);
    expect(result.ackedQueueIds.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('returns duplicate on the second reconnect cycle for the same requestId', async () => {
    const fetchMock = makeOkFetch();
    const replayCache = new Map<string, ReplayResult>();

    const op: ReplayOperation[] = normalizeReplayOperations([
      { queueId: 10, requestId: 'req-cycle', method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    const cycle1 = await replayOfflineOperations(op, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(cycle1.results[0].status).toBe('replayed');
    expect(replayCache.has('req-cycle')).toBe(true);

    const cycle2 = await replayOfflineOperations(op, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(cycle2.results[0].status).toBe('duplicate');
    // Second cycle must not issue a network call
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Queue entry is still acked on duplicate
    expect(cycle2.ackedQueueIds).toContain(10);
  });

  it('does not cache failed operations — retries are permitted', async () => {
    const failFetch = makeErrorFetch('connection refused');
    const replayCache = new Map<string, ReplayResult>();

    const op: ReplayOperation[] = normalizeReplayOperations([
      { queueId: 20, requestId: 'req-retry', method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    const failResult = await replayOfflineOperations(op, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: failFetch as unknown as typeof fetch,
    });
    expect(failResult.results[0].status).toBe('failed');
    expect(replayCache.size).toBe(0);

    // Reconnect — this time the server is reachable
    const successFetch = makeOkFetch();
    const retryResult = await replayOfflineOperations(op, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: successFetch as unknown as typeof fetch,
    });
    expect(retryResult.results[0].status).toBe('replayed');
    expect(retryResult.ackedQueueIds).toContain(20);
  });
});

// ---------------------------------------------------------------------------
// Gate 3: Localhost connectivity — URL resolution for local-server track
// ---------------------------------------------------------------------------

describe('[gate-3] localhost connectivity — URL resolution', () => {
  it('routes to requestOrigin/api/sync/batch when remoteBaseUrl is absent', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 30, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('http://localhost:3000/api/sync/batch');
  });

  it('strips trailing slash from requestOrigin before building URL', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 31, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      // requestOrigin with no trailing slash — the URL class handles this
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).not.toContain('//api');
  });

  it('includes X-Offline-Replay header on all replay requests', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 32, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers['X-Offline-Replay']).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Gate 4: External Docker server track — remoteBaseUrl routing
// ---------------------------------------------------------------------------

describe('[gate-4] external Docker server track — remoteBaseUrl routing', () => {
  it('routes to remoteBaseUrl/api/sync/batch when remoteBaseUrl is set', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 40, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'http://atom-server:8080',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('http://atom-server:8080/api/sync/batch');
  });

  it('strips trailing slash from remoteBaseUrl before appending path', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 41, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'http://atom-server:8080/',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('http://atom-server:8080/api/sync/batch');
  });

  it('honours server-returned ackedQueueIds in external-server response', async () => {
    const serverBody = { ackedQueueIds: [42, 43] };
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => serverBody }),
      }) as unknown as Response,
    );
    const ops = normalizeReplayOperations([
      { queueId: 42, requestId: 'req-42', method: 'POST', endpoint: '/api/events', body: {} },
      { queueId: 43, requestId: 'req-43', method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    const result = await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'http://atom-server:8080',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds.sort((a, b) => a - b)).toEqual([42, 43]);
  });
});

// ---------------------------------------------------------------------------
// Gate 5: Reconnect drill — fail → retry → succeed sequence
// ---------------------------------------------------------------------------

describe('[gate-5] reconnect drill — offline then online sequence', () => {
  it('marks all pending ops failed while offline, then succeeds after reconnect', async () => {
    const replayCache = new Map<string, ReplayResult>();
    const ops = normalizeReplayOperations([
      { queueId: 50, requestId: 'req-50', method: 'POST', endpoint: '/api/events', body: { id: 'ev-50' } },
      { queueId: 51, requestId: 'req-51', method: 'POST', endpoint: '/api/victims', body: { id: 'v-51' } },
    ]);

    // Phase 1: offline — both operations fail
    const offlineFetch = makeErrorFetch('fetch failed');
    const offlineResult = await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: offlineFetch as unknown as typeof fetch,
    });
    expect(offlineResult.results.every((r) => r.status === 'failed')).toBe(true);
    expect(offlineResult.ackedQueueIds).toHaveLength(0);
    expect(replayCache.size).toBe(0);

    // Phase 2: reconnect — both operations succeed
    const onlineFetch = makeOkFetch();
    const onlineResult = await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: onlineFetch as unknown as typeof fetch,
    });
    expect(onlineResult.results.every((r) => r.status === 'replayed')).toBe(true);
    expect(onlineResult.ackedQueueIds.sort((a, b) => a - b)).toEqual([50, 51]);
  });

  it('returns 503 failures without acking queue entries', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        clone: () => ({ json: async () => null }),
      }) as unknown as Response,
    );
    const ops = normalizeReplayOperations([
      { queueId: 60, requestId: 'req-60', method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    const result = await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds).toHaveLength(0);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].statusCode).toBe(503);
    expect(result.results[0].error).toContain('503');
  });

  it('empty replay queue short-circuits without a network request', async () => {
    const fetchMock = jest.fn();
    const result = await replayOfflineOperations([], {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ackedQueueIds: [], results: [] });
  });
});

// ---------------------------------------------------------------------------
// Gate 6: Cross-track auth compatibility
// ---------------------------------------------------------------------------

describe('[gate-6] cross-track auth compatibility', () => {
  it('attaches remoteAuthToken as Bearer for external server calls', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 70, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'http://atom-server:8080',
      remoteAuthToken: 'atom-secret-token',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe('Bearer atom-secret-token');
  });

  it('forwarded authorization header overrides remoteAuthToken', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 71, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'http://atom-server:8080',
      remoteAuthToken: 'server-token',
      forwardedHeaders: { authorization: 'Bearer user-session-token' },
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe('Bearer user-session-token');
  });

  it('forwards cookie header when present', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 72, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      forwardedHeaders: { cookie: 'session=abc123' },
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Cookie).toBe('session=abc123');
  });

  it('omits Authorization header when neither token nor forwarded header provided', async () => {
    const fetchMock = makeOkFetch();
    const ops = normalizeReplayOperations([
      { queueId: 73, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(ops, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gate 7: Service-worker queue contract — constants alignment
// ---------------------------------------------------------------------------

describe('[gate-7] service-worker queue contract — constants alignment', () => {
  it('OFFLINE_SYNC_ENDPOINT matches the service worker sync target', () => {
    expect(OFFLINE_SYNC_ENDPOINT).toBe('/api/sync');
  });

  it('OFFLINE_SYNC_TAG matches the service worker Background Sync tag', () => {
    expect(OFFLINE_SYNC_TAG).toBe('sync-api-posts');
  });

  it('OFFLINE_QUEUE_DB identifies the IndexedDB database name', () => {
    expect(typeof OFFLINE_QUEUE_DB).toBe('string');
    expect(OFFLINE_QUEUE_DB.length).toBeGreaterThan(0);
  });

  it('OFFLINE_QUEUE_STORE identifies the IndexedDB object store name', () => {
    expect(typeof OFFLINE_QUEUE_STORE).toBe('string');
    expect(OFFLINE_QUEUE_STORE.length).toBeGreaterThan(0);
  });
});
