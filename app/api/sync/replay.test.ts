import {
  normalizeReplayOperations,
  replayOfflineOperations,
} from './replay';
import { createOperationLogStore } from './operation-log';
import { describe, expect, it, jest } from '@jest/globals';

describe('sync replay bridge', () => {
  it('filters invalid replay operations', () => {
    const operations = normalizeReplayOperations([
      { method: 'POST', endpoint: '/api/events', body: { id: '1' } },
      { method: 'GET', endpoint: '/api/events' },
      { method: 'POST', endpoint: '/api/sync' },
      { method: 'DELETE', endpoint: '/api/events/event-1', body: { force: true } },
      'invalid',
    ]);

    expect(operations).toEqual([
      { method: 'POST', endpoint: '/api/events', body: { id: '1' } },
    ]);
  });

  it('replays queued operations once and de-duplicates repeat request ids', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
      }) as Response,
    );
    const replayCache = new Map();
    const operations = normalizeReplayOperations([
      {
        queueId: 1,
        requestId: 'req-1',
        method: 'POST',
        endpoint: '/api/events',
        body: { id: 'event-1' },
      },
      {
        queueId: 2,
        requestId: 'req-1',
        method: 'POST',
        endpoint: '/api/events',
        body: { id: 'event-1' },
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'https://plugin.example',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://plugin.example/api/sync/batch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Offline-Replay': '1',
        }),
        body: JSON.stringify({
          operations: [
            {
              requestId: 'req-1',
              method: 'POST',
              endpoint: '/api/events',
              body: { id: 'event-1' },
            },
          ],
        }),
      }),
    );
    expect(result.ackedQueueIds).toEqual([1, 2]);
    expect(result.results).toEqual([
      expect.objectContaining({
        queueId: 1,
        requestId: 'req-1',
        status: 'replayed',
      }),
      expect.objectContaining({
        queueId: 2,
        requestId: 'req-1',
        status: 'duplicate',
      }),
    ]);
  });

  it('applies forwarded authorization to replayed requests', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 204,
        statusText: 'No Content',
      }) as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 1,
        requestId: 'req-auth',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
        body: { summary: 'updated' },
      },
    ]);

    await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      forwardedHeaders: {
        authorization: 'Bearer lane-06-acl-token',
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/sync/batch',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer lane-06-acl-token',
        }),
      }),
    );
  });

  it('retains failures and replays only not-yet-successful operations later', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 207,
        statusText: 'Multi-Status',
        clone() {
          return this;
        },
        async json() {
          return {
            ackedRequestIds: ['req-1'],
            results: [
              { requestId: 'req-1', status: 'replayed' },
              { requestId: 'req-2', status: 'failed' },
            ],
          };
        },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone() {
          return this;
        },
        async json() {
          return {
            ackedRequestIds: ['req-2'],
            results: [{ requestId: 'req-2', status: 'replayed' }],
          };
        },
      } as unknown as Response);

    const replayCache = new Map();
    const operations = normalizeReplayOperations([
      {
        queueId: 1,
        requestId: 'req-1',
        method: 'POST',
        endpoint: '/api/events',
        body: { id: 'event-1' },
      },
      {
        queueId: 2,
        requestId: 'req-2',
        method: 'POST',
        endpoint: '/api/events',
        body: { id: 'event-2' },
      },
    ]);

    const firstReplay = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(firstReplay.ackedQueueIds).toEqual([1]);
    expect(firstReplay.results).toEqual([
      expect.objectContaining({
        queueId: 1,
        requestId: 'req-1',
        status: 'replayed',
      }),
      expect.objectContaining({
        queueId: 2,
        requestId: 'req-2',
        status: 'failed',
      }),
    ]);

    const secondReplay = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondReplayCallOptions = fetchMock.mock.calls[1][1];
    expect(secondReplayCallOptions).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          operations: [
            {
              requestId: 'req-2',
              method: 'POST',
              endpoint: '/api/events',
              body: { id: 'event-2' },
            },
          ],
        }),
      }),
    );
    expect(secondReplay.ackedQueueIds).toEqual([1, 2]);
    expect(secondReplay.results).toEqual([
      expect.objectContaining({
        queueId: 1,
        requestId: 'req-1',
        status: 'duplicate',
      }),
      expect.objectContaining({
        queueId: 2,
        requestId: 'req-2',
        status: 'replayed',
      }),
    ]);
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] Replay correctness — server ack paths
  // -----------------------------------------------------------------------

  it('honours ackedQueueIds from server response body', async () => {
    const serverBody = { ackedQueueIds: [10, 11], ackedRequestIds: [] };
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({
          json: async () => serverBody,
        }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 10,
        requestId: 'req-10',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
      {
        queueId: 11,
        requestId: 'req-11',
        method: 'POST',
        endpoint: '/api/victims',
        body: {},
      },
      {
        queueId: 12,
        requestId: 'req-12',
        method: 'POST',
        endpoint: '/api/articles',
        body: {},
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds).toEqual(expect.arrayContaining([10, 11]));
    expect(result.ackedQueueIds).toContain(12);

    const statuses = result.results.map((entry) => entry.status);
    expect(statuses.every((status) => status === 'replayed')).toBe(true);
  });

  it('honours ackedRequestIds from server response body', async () => {
    const serverBody = { ackedQueueIds: [], ackedRequestIds: ['req-ack'] };
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({
          json: async () => serverBody,
        }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 20,
        requestId: 'req-ack',
        method: 'PUT',
        endpoint: '/api/events/ev-1',
        body: {},
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds).toContain(20);
    expect(result.results[0].status).toBe('replayed');
  });

  it('uses per-request status from server results array to override response.ok', async () => {
    const serverBody = {
      results: [
        { requestId: 'req-ok', status: 'replayed' },
        { requestId: 'req-fail', status: 'failed' },
      ],
    };
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({
          json: async () => serverBody,
        }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 30,
        requestId: 'req-ok',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
      {
        queueId: 31,
        requestId: 'req-fail',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const okResult = result.results.find((entry) => entry.requestId === 'req-ok');
    const failResult = result.results.find((entry) => entry.requestId === 'req-fail');
    expect(okResult?.status).toBe('replayed');
    expect(failResult?.status).toBe('failed');
    expect(result.ackedQueueIds).toContain(30);
    expect(result.ackedQueueIds).not.toContain(31);
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] Replay correctness — failure paths
  // -----------------------------------------------------------------------

  it('marks all operations failed on network error and does not cache them', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('Network unreachable');
    });
    const replayCache = new Map();
    const operations = normalizeReplayOperations([
      {
        queueId: 40,
        requestId: 'req-40',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds).toHaveLength(0);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toContain('Network unreachable');
    expect(replayCache.size).toBe(0);
  });

  it('marks operations failed when server returns a non-ok status', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        clone: () => ({ json: async () => null }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 50,
        requestId: 'req-50',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds).toHaveLength(0);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].statusCode).toBe(503);
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] Localhost connectivity — URL resolution
  // -----------------------------------------------------------------------

  it('falls back to requestOrigin when no remoteBaseUrl is configured', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => ({}) }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      { queueId: 60, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/sync/batch',
      expect.anything(),
    );
  });

  it('uses remoteBaseUrl when configured — external server track', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => ({}) }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      { queueId: 61, method: 'POST', endpoint: '/api/events', body: {} },
    ]);

    await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      remoteBaseUrl: 'https://atom.example.org',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://atom.example.org/api/sync/batch',
      expect.anything(),
    );
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] Persistence durability — idempotency via cache
  // -----------------------------------------------------------------------

  it('returns duplicate status on a second replay call for the same requestId', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => ({}) }),
      }) as unknown as Response,
    );
    const replayCache = new Map();
    const operations = normalizeReplayOperations([
      {
        queueId: 70,
        requestId: 'req-70',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    const first = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(first.results[0].status).toBe('replayed');

    const second = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(second.results[0].status).toBe('duplicate');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] Auth — remoteAuthToken bearer injection
  // -----------------------------------------------------------------------

  it('injects remoteAuthToken as Bearer when no forwarded authorization header', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => ({}) }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 80,
        requestId: 'req-80',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      remoteAuthToken: 'server-side-token-xyz',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-side-token-xyz',
        }),
      }),
    );
  });

  it('prefers forwarded authorization header over remoteAuthToken', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => ({}) }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 81,
        requestId: 'req-81',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      remoteAuthToken: 'should-not-use-this',
      forwardedHeaders: { authorization: 'Bearer user-forwarded-token' },
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> }
    ];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer user-forwarded-token',
    );
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] normalizeReplayOperations — edge cases
  // -----------------------------------------------------------------------

  it('accepts DELETE without a body payload', () => {
    const operations = normalizeReplayOperations([
      { method: 'DELETE', endpoint: '/api/events/event-del' },
    ]);
    expect(operations).toHaveLength(1);
    expect(operations[0].method).toBe('DELETE');
    expect(operations[0].body).toBeUndefined();
  });

  it('accepts all replayable endpoint prefixes', () => {
    const replayableEndpoints = [
      '/api/articles/1',
      '/api/events/2',
      '/api/victims/3',
      '/api/perpetrators/4',
      '/api/annotations/5',
      '/api/participants/6',
      '/api/actors/7',
      '/api/roles/8',
      '/api/users/9',
    ];
    const input = replayableEndpoints.map((endpoint) => ({
      method: 'POST',
      endpoint,
      body: {},
    }));
    const operations = normalizeReplayOperations(input);
    expect(operations).toHaveLength(replayableEndpoints.length);
  });

  it('strips requestId when it is whitespace-only', () => {
    const operations = normalizeReplayOperations([
      { method: 'POST', endpoint: '/api/events', requestId: '   ', body: {} },
    ]);
    expect(operations).toHaveLength(1);
    expect(operations[0].requestId).toBeUndefined();
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeReplayOperations(null)).toEqual([]);
    expect(normalizeReplayOperations({})).toEqual([]);
    expect(normalizeReplayOperations('string')).toEqual([]);
    expect(normalizeReplayOperations(undefined)).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // [3.2.0][08-verification] Reconnect drill — empty queue fast-path
  // -----------------------------------------------------------------------

  it('returns empty results without calling fetch when operations list is empty', async () => {
    const fetchMock = jest.fn();
    const result = await replayOfflineOperations([], {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ackedQueueIds).toHaveLength(0);
    expect(result.results).toHaveLength(0);
  });

  it('marks operation failed with deterministic divergence when baseVersion is stale', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({
          json: async () => ({
            results: [
              {
                requestId: 'req-stale',
                status: 'replayed',
                currentVersion: 4,
              },
            ],
          }),
        }),
      }) as unknown as Response,
    );
    const operations = normalizeReplayOperations([
      {
        queueId: 90,
        requestId: 'req-stale',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
        baseVersion: 3,
        body: { summary: 'outdated edit' },
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ackedQueueIds).toEqual([]);
    expect(result.results[0]).toMatchObject({
      status: 'failed',
      divergence: {
        code: 'STALE_BASE_VERSION',
        deterministicKey:
          'PATCH:/api/events/event-1:req-stale:3:4',
      },
    });
  });

  it('writes replay outcomes into append-only operation log entries', async () => {
    const fetchMock = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: () => ({ json: async () => ({}) }),
      }) as unknown as Response,
    );
    const operationLog = createOperationLogStore();
    const operations = normalizeReplayOperations([
      {
        queueId: 91,
        requestId: 'req-log',
        method: 'POST',
        endpoint: '/api/events',
        baseVersion: 0,
        body: { id: 'event-1' },
      },
      {
        queueId: 92,
        requestId: 'req-log',
        method: 'POST',
        endpoint: '/api/events',
        baseVersion: 0,
        body: { id: 'event-1' },
      },
    ]);

    await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      operationLog,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const entries = operationLog.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sequence: 1,
      requestId: 'req-log',
      status: 'replayed',
      baseVersion: 0,
    });
    expect(entries[1]).toMatchObject({
      sequence: 2,
      requestId: 'req-log',
      status: 'duplicate',
      baseVersion: 0,
    });
  });
});
