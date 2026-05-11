import {
  normalizeReplayOperations,
  replayOfflineOperations,
} from './replay';
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
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
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
});
