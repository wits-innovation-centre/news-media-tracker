/**
 * Sync bridge endpoint contract tests.
 *
 * Verifies the stable API shapes consumed by UI and server-track consumers:
 * - GET  /api/sync – syncStatus derivation and pendingCount forwarding
 * - POST /api/sync – conflictResolution applied to config
 * - PATCH /api/sync – syncStatus in replay and queue-flush responses
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock next/server to avoid Web API dependencies unavailable in jsdom.
// ---------------------------------------------------------------------------
jest.mock('next/server', () => {
  const NextResponse = {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  };
  class NextRequest {
    private _body: string;
    readonly nextUrl: { origin: string };
    readonly headers: { get: (key: string) => string | null };

    constructor(url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
      this._body = init.body ?? '';
      this.nextUrl = { origin: new URL(url).origin };
      const h = init.headers ?? {};
      this.headers = { get: (key: string) => h[key] ?? h[key.toLowerCase()] ?? null };
    }

    async json() {
      return JSON.parse(this._body || '{}');
    }
  }
  return { NextResponse, NextRequest };
});

// ---------------------------------------------------------------------------
// Mock lib/db/server so Node-only fs/path imports are never loaded in jsdom.
// ---------------------------------------------------------------------------
jest.mock('../../../lib/db/server', () => {
  class DatabaseManagerServer {
    ensureDatabaseInitialised = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    getConfig = jest.fn<() => object>();
    getSyncQueue = jest.fn<() => Promise<unknown[]>>();
    processSyncQueue = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    updateConfig = jest.fn<(updates: object) => void>();
    configureRemote = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    persistSyncConflictRecords = jest.fn<(records: object[]) => Promise<void>>().mockResolvedValue(undefined);
  }
  return {
    DatabaseManagerServer,
    // dbm must be an instance of the class so that `instanceof` checks pass.
    dbm: new DatabaseManagerServer(),
  };
});

// ---------------------------------------------------------------------------
// Mock ./replay so the PATCH replay path is controlled independently.
// ---------------------------------------------------------------------------
jest.mock('./replay', () => ({
  normalizeReplayOperations: jest.fn<(input: unknown) => unknown[]>(),
  replayOfflineOperations: jest.fn<() => Promise<object>>(),
}));

// Import AFTER mocks are registered.
import { GET, POST, PATCH, DELETE } from './route';
import { dbm, DatabaseManagerServer } from '../../../lib/db/server';
import {
  normalizeReplayOperations,
  replayOfflineOperations,
} from './replay';

// Cast mocked dbm methods so TypeScript knows they are jest spies.
const mockDbm = dbm as jest.Mocked<InstanceType<typeof DatabaseManagerServer>>;
const mockNormalize = normalizeReplayOperations as jest.MockedFunction<typeof normalizeReplayOperations>;
const mockReplay = replayOfflineOperations as jest.MockedFunction<typeof replayOfflineOperations>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeRequest = any;

function buildRequest(
  url: string,
  method: string,
  body?: object,
  headers?: Record<string, string>,
): FakeRequest {
  const { NextRequest } = jest.requireMock('next/server') as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-shadow
    NextRequest: new (url: string, init: object) => any;
  };
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jsonBody(response: any): Promise<unknown> {
  return response.json();
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('GET /api/sync – syncStatus and pendingCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbm.ensureDatabaseInitialised.mockResolvedValue(undefined);
  });

  it('returns syncStatus=disabled and pendingCount=0 when sync is off', async () => {
    mockDbm.getConfig.mockReturnValue({
      sync: { enabled: false, conflictResolution: 'local' },
      local: { path: '/tmp/test.db' },
    });

    const response = await GET();
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        syncStatus: 'disabled',
        pendingCount: 0,
      }),
    });
    expect(mockDbm.getSyncQueue).not.toHaveBeenCalled();
  });

  it('returns syncStatus=idle and pendingCount=0 when sync is on but queue is empty', async () => {
    mockDbm.getConfig.mockReturnValue({
      sync: { enabled: true, conflictResolution: 'local' },
      local: { path: '/tmp/test.db' },
      remote: { url: 'https://sync.example', syncInterval: 15 },
    });
    mockDbm.getSyncQueue.mockResolvedValue([]);

    const response = await GET();
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        syncStatus: 'idle',
        pendingCount: 0,
      }),
    });
  });

  it('returns syncStatus=pending when there are queued items', async () => {
    mockDbm.getConfig.mockReturnValue({
      sync: { enabled: true, conflictResolution: 'local' },
      local: { path: '/tmp/test.db' },
      remote: { url: 'https://sync.example', syncInterval: 15 },
    });
    mockDbm.getSyncQueue.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const response = await GET();
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        syncStatus: 'pending',
        pendingCount: 2,
      }),
    });
  });
});

describe('POST /api/sync – conflictResolution forwarded to config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbm.configureRemote.mockResolvedValue(undefined);
    mockDbm.updateConfig.mockReturnValue(undefined);
  });

  it('applies conflictResolution=remote when supplied', async () => {
    const req = buildRequest('http://localhost:3000/api/sync', 'POST', {
      remoteUrl: 'https://sync.example',
      authToken: 'tok',
      syncInterval: 30,
      conflictResolution: 'remote',
    });

    const response = await POST(req);
    const body = await jsonBody(response);
    expect(body).toMatchObject({ success: true });

    const updateCall = mockDbm.updateConfig.mock.calls[0][0] as {
      sync?: { conflictResolution?: string };
    };
    expect(updateCall?.sync?.conflictResolution).toBe('remote');
  });

  it('defaults conflictResolution=local when omitted', async () => {
    const req = buildRequest('http://localhost:3000/api/sync', 'POST', {
      remoteUrl: 'https://sync.example',
    });

    await POST(req);

    const updateCall = mockDbm.updateConfig.mock.calls[0][0] as {
      sync?: { conflictResolution?: string };
    };
    expect(updateCall?.sync?.conflictResolution).toBe('local');
  });

  it('returns 400 when remoteUrl is missing', async () => {
    const req = buildRequest('http://localhost:3000/api/sync', 'POST', {});
    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await jsonBody(response);
    expect(body).toMatchObject({ success: false });
  });
});

describe('PATCH /api/sync – syncStatus in responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns syncStatus=idle when replay batch has no failures', async () => {
    mockNormalize.mockReturnValue([
      { queueId: 1, requestId: 'r1', method: 'POST', endpoint: '/api/events', body: {} },
    ]);
    mockReplay.mockResolvedValue({
      ackedQueueIds: [1],
      results: [
        { queueId: 1, requestId: 'r1', method: 'POST', endpoint: '/api/events', status: 'replayed', statusCode: 200 },
      ],
    });
    mockDbm.getConfig.mockReturnValue({
      sync: { enabled: true, conflictResolution: 'local' },
      local: { path: '/tmp/test.db' },
    });

    const req = buildRequest(
      'http://localhost:3000/api/sync',
      'PATCH',
      { operations: [{ queueId: 1, requestId: 'r1', method: 'POST', endpoint: '/api/events', body: {} }] },
    );
    const response = await PATCH(req);
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      success: true,
      syncStatus: 'idle',
      counts: { replayed: 1, duplicate: 0, failed: 0 },
    });
  });

  it('returns syncStatus=error when replay batch has failures', async () => {
    mockNormalize.mockReturnValue([
      { queueId: 5, requestId: 'r5', method: 'POST', endpoint: '/api/events', body: {} },
    ]);
    mockReplay.mockResolvedValue({
      ackedQueueIds: [],
      results: [
        { queueId: 5, requestId: 'r5', method: 'POST', endpoint: '/api/events', status: 'failed', statusCode: 503 },
      ],
    });
    mockDbm.getConfig.mockReturnValue({
      sync: { enabled: true, conflictResolution: 'local' },
      local: { path: '/tmp/test.db' },
    });

    const req = buildRequest(
      'http://localhost:3000/api/sync',
      'PATCH',
      { operations: [{ queueId: 5, requestId: 'r5', method: 'POST', endpoint: '/api/events', body: {} }] },
    );
    const response = await PATCH(req);
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      success: false,
      syncStatus: 'error',
      counts: { replayed: 0, duplicate: 0, failed: 1 },
    });
  });

  it('persists auditable conflict metadata when replay reports overlap conflicts', async () => {
    mockNormalize.mockReturnValue([
      { queueId: 8, requestId: 'r8', method: 'PATCH', endpoint: '/api/events/e1', body: { status: 'draft' } },
      { queueId: 9, requestId: 'r9', method: 'PATCH', endpoint: '/api/events/e1', body: { status: 'published' } },
    ]);
    mockReplay.mockImplementation(async (_operations, context) => {
      await context.persistConflictRecords?.([
        {
          conflictId: 'conflict:PATCH:/api/events/e1:r9:status',
          method: 'PATCH',
          endpoint: '/api/events/e1',
          requestId: 'r9',
          queueId: 9,
          overlappingFields: ['status'],
          winnerOperation: { requestId: 'r8', queueId: 8 },
          conflictingOperation: { requestId: 'r9', queueId: 9 },
          decision: 'manual',
          decisionMetadata: {
            engineVersion: '3.3.0',
            reason: 'overlapping_field_edits',
            detectedAt: '2026-05-11T13:00:00.000Z',
          },
        },
      ]);
      return {
        ackedQueueIds: [8],
        results: [
          { queueId: 8, requestId: 'r8', method: 'PATCH', endpoint: '/api/events/e1', status: 'replayed', statusCode: 200 },
          { queueId: 9, requestId: 'r9', method: 'PATCH', endpoint: '/api/events/e1', status: 'failed', statusCode: 409 },
        ],
      };
    });
    mockDbm.getConfig.mockReturnValue({
      sync: { enabled: true, conflictResolution: 'manual' },
      local: { path: '/tmp/test.db' },
    });

    const req = buildRequest('http://localhost:3000/api/sync', 'PATCH', {
      operations: [
        { queueId: 8, requestId: 'r8', method: 'PATCH', endpoint: '/api/events/e1', body: { status: 'draft' } },
        { queueId: 9, requestId: 'r9', method: 'PATCH', endpoint: '/api/events/e1', body: { status: 'published' } },
      ],
    });
    const response = await PATCH(req);
    const body = await jsonBody(response);

    expect(mockDbm.persistSyncConflictRecords).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'conflict:PATCH:/api/events/e1:r9:status',
        endpoint: '/api/events/e1',
        decision: 'manual',
      }),
    ]);
    expect(body).toMatchObject({
      success: false,
      syncStatus: 'error',
      counts: { replayed: 1, duplicate: 0, failed: 1, conflicts: 1 },
    });
  });

  it('returns syncStatus=idle and processed count when no replay operations provided', async () => {
    mockNormalize.mockReturnValue([]);
    mockDbm.getSyncQueue.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockDbm.processSyncQueue.mockResolvedValue(undefined);

    const req = buildRequest('http://localhost:3000/api/sync', 'PATCH', {});
    const response = await PATCH(req);
    const body = await jsonBody(response);
    expect(body).toMatchObject({
      success: true,
      syncStatus: 'idle',
      counts: { processed: 2 },
    });
    expect(mockDbm.processSyncQueue).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/sync – disables sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbm.updateConfig.mockReturnValue(undefined);
  });

  it('returns success and calls updateConfig to disable sync', async () => {
    const response = await DELETE();
    const body = await jsonBody(response);
    expect(body).toMatchObject({ success: true });
    expect(mockDbm.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({ enabled: false }),
      }),
    );
  });
});
