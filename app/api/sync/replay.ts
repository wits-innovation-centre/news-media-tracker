import {
  buildReplayDispatchPlan,
  type ReplayConflictRecord,
} from './conflict-engine';

type ReplayStatus = 'replayed' | 'duplicate' | 'failed';

export type ReplayOperation = {
  queueId?: number;
  requestId?: string;
  method: string;
  endpoint: string;
  body?: unknown;
};

export type ReplayResult = {
  queueId?: number;
  requestId?: string;
  method: string;
  endpoint: string;
  status: ReplayStatus;
  statusCode?: number;
  error?: string;
};

// Preserve the original normalized position so filtered/deduplicated batches
// can still return results in the same order the caller supplied them.
type IndexedReplayOperation = ReplayOperation & {
  index: number;
};

type ReplayContext = {
  requestOrigin: string;
  remoteBaseUrl?: string;
  remoteAuthToken?: string;
  forwardedHeaders?: Record<string, string | undefined>;
  replayCache: Map<string, ReplayResult>;
  persistConflictRecords?: (
    records: ReplayConflictRecord[],
  ) => Promise<void> | void;
  fetchImpl?: typeof fetch;
};

const PLUGIN_SYNC_BATCH_PATH = '/api/sync/batch';
// Keep a bounded in-memory cache of recent replay ids to prevent duplicate writes.
const MAX_REPLAY_CACHE_ENTRIES = 500;
const REPLAYABLE_ENDPOINT_PREFIXES = [
  '/api/articles',
  '/api/events',
  '/api/victims',
  '/api/perpetrators',
  '/api/annotations',
  '/api/participants',
  '/api/actors',
  '/api/roles',
  '/api/users',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function trimReplayCache(cache: Map<string, ReplayResult>): void {
  while (cache.size > MAX_REPLAY_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) {
      return;
    }
    cache.delete(firstKey);
  }
}

function toSafeMethod(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const method = value.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }
  return method;
}

function toSafeEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (
    !value.startsWith('/api/') ||
    value === '/api/sync' ||
    value.startsWith('/api/sync/') ||
    value.includes('..') ||
    value.includes('//')
  ) {
    return null;
  }

  const isAllowedReplayEndpoint = REPLAYABLE_ENDPOINT_PREFIXES.some((prefix) =>
    value.startsWith(prefix),
  );

  if (!isAllowedReplayEndpoint) {
    return null;
  }

  return value;
}

export function normalizeReplayOperations(input: unknown): ReplayOperation[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const method = toSafeMethod(item.method);
    const endpoint = toSafeEndpoint(item.endpoint);

    if (!method || !endpoint) {
      return [];
    }

    // Keep DELETE payload semantics explicit for replay safety.
    if (method === 'DELETE' && item.body != null) {
      return [];
    }

    return [
      {
        queueId: typeof item.queueId === 'number' ? item.queueId : undefined,
        requestId:
          typeof item.requestId === 'string' && item.requestId.trim()
            ? item.requestId.trim()
            : undefined,
        method,
        endpoint,
        body: item.body,
      },
    ];
  });
}

function resolveReplayUrl(
  requestOrigin: string,
  remoteBaseUrl?: string,
): string {
  if (remoteBaseUrl) {
    const base = remoteBaseUrl.replace(/\/+$/, '');
    return `${base}${PLUGIN_SYNC_BATCH_PATH}`;
  }
  return new URL(PLUGIN_SYNC_BATCH_PATH, requestOrigin).toString();
}

function toBooleanReplayStatus(value: unknown): boolean | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.toLowerCase();
  if (['replayed', 'duplicate', 'success', 'applied'].includes(normalized)) {
    return true;
  }
  if (['failed', 'error', 'rejected'].includes(normalized)) {
    return false;
  }
  return null;
}

function collectAckedQueueIds(results: ReplayResult[]): number[] {
  return Array.from(
    new Set(
      results.flatMap((result) =>
        result.status !== 'failed' && typeof result.queueId === 'number'
          ? [result.queueId]
          : [],
      ),
    ),
  );
}

export async function replayOfflineOperations(
  operations: ReplayOperation[],
  context: ReplayContext,
): Promise<{ ackedQueueIds: number[]; results: ReplayResult[] }> {
  const fetchImpl = context.fetchImpl ?? fetch;
  const orderedResults: Array<ReplayResult | undefined> = new Array(
    operations.length,
  );
  const pendingOperations: IndexedReplayOperation[] = [];
  const seenRequestIds = new Set<string>();

  for (const [index, operation] of operations.entries()) {
    const { queueId, requestId, method, endpoint, body } = operation;

    if (requestId) {
      const cachedResult = context.replayCache.get(requestId);
      if (cachedResult) {
        orderedResults[index] = {
          ...cachedResult,
          queueId,
          requestId,
          status: 'duplicate',
        };
        continue;
      }

      if (seenRequestIds.has(requestId)) {
        orderedResults[index] = {
          queueId,
          requestId,
          method,
          endpoint,
          status: 'duplicate',
        };
        continue;
      }
      seenRequestIds.add(requestId);
    }

    pendingOperations.push({
      index,
      queueId,
      requestId,
      method,
      endpoint,
      body,
    });
  }

  if (pendingOperations.length === 0) {
    const results = orderedResults.filter(
      (result): result is ReplayResult => typeof result !== 'undefined',
    );
    return {
      ackedQueueIds: collectAckedQueueIds(results),
      results,
    };
  }

  const {
    dispatchGroups,
    conflictedOperations,
    conflictRecords,
  } = buildReplayDispatchPlan(pendingOperations);

  for (const conflictedOperation of conflictedOperations) {
    orderedResults[conflictedOperation.index] = {
      queueId: conflictedOperation.queueId,
      requestId: conflictedOperation.requestId,
      method: conflictedOperation.method,
      endpoint: conflictedOperation.endpoint,
      status: 'failed',
      statusCode: 409,
      error: 'Conflict detected: overlapping edits require manual resolution',
    };
  }

  if (conflictRecords.length > 0 && context.persistConflictRecords) {
    try {
      await context.persistConflictRecords(conflictRecords);
    } catch {
      // Best effort persistence only; replay should continue for mergeable operations.
    }
  }

  if (dispatchGroups.length === 0) {
    const results = orderedResults.filter(
      (result): result is ReplayResult => typeof result !== 'undefined',
    );
    return {
      ackedQueueIds: collectAckedQueueIds(results),
      results,
    };
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Offline-Replay': '1',
  };

  if (context.forwardedHeaders?.authorization) {
    requestHeaders.Authorization = context.forwardedHeaders.authorization;
  } else if (context.remoteAuthToken) {
    requestHeaders.Authorization = `Bearer ${context.remoteAuthToken}`;
  }

  if (context.forwardedHeaders?.cookie) {
    requestHeaders.Cookie = context.forwardedHeaders.cookie;
  }

  try {
    const replayUrl = resolveReplayUrl(
      context.requestOrigin,
      context.remoteBaseUrl,
    );
    const response = await fetchImpl(replayUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
          operations: dispatchGroups.map((group) => ({
            requestId: group.sourceOperations[0]?.requestId,
            method: group.method,
            endpoint: group.endpoint,
            body: group.body,
          })),
        }),
      });

    let replayBody: unknown = null;
    try {
      replayBody = await response.clone().json();
    } catch {
      replayBody = null;
    }

    const ackedQueueIdSet = new Set<number>();
    const ackedRequestIdSet = new Set<string>();
    const perRequestStatus = new Map<string, boolean>();

    if (isRecord(replayBody)) {
      if (Array.isArray(replayBody.ackedQueueIds)) {
        for (const queueId of replayBody.ackedQueueIds) {
          if (typeof queueId === 'number') {
            ackedQueueIdSet.add(queueId);
          }
        }
      }
      if (Array.isArray(replayBody.ackedRequestIds)) {
        for (const requestId of replayBody.ackedRequestIds) {
          if (typeof requestId === 'string' && requestId) {
            ackedRequestIdSet.add(requestId);
          }
        }
      }
      if (Array.isArray(replayBody.results)) {
        for (const entry of replayBody.results) {
          if (!isRecord(entry)) {
            continue;
          }
          const requestId =
            typeof entry.requestId === 'string' && entry.requestId
              ? entry.requestId
              : null;
          const status = toBooleanReplayStatus(entry.status);
          if (requestId && status !== null) {
            perRequestStatus.set(requestId, status);
          }
        }
      }
    }

    for (const group of dispatchGroups) {
      const primaryOperation = group.sourceOperations[0];
      if (!primaryOperation) {
        continue;
      }
      const explicitStatusFromBody =
        primaryOperation.requestId && perRequestStatus.has(primaryOperation.requestId)
          ? perRequestStatus.get(primaryOperation.requestId)
          : null;
      const replayed =
        explicitStatusFromBody ??
        (typeof primaryOperation.queueId === 'number' &&
        ackedQueueIdSet.has(primaryOperation.queueId)
          ? true
          : null) ??
        (primaryOperation.requestId && ackedRequestIdSet.has(primaryOperation.requestId)
          ? true
          : null) ??
        response.ok;

      for (const operation of group.sourceOperations) {
        const replayResult: ReplayResult = {
          queueId: operation.queueId,
          requestId: operation.requestId,
          method: operation.method,
          endpoint: operation.endpoint,
          status: replayed ? 'replayed' : 'failed',
          statusCode: response.status,
          error: replayed ? undefined : `${response.status} ${response.statusText}`,
        };

        orderedResults[operation.index] = replayResult;

        if (replayed && operation.requestId) {
          context.replayCache.set(operation.requestId, replayResult);
          trimReplayCache(context.replayCache);
        }
      }
    }
  } catch (error) {
    for (const group of dispatchGroups) {
      for (const operation of group.sourceOperations) {
        orderedResults[operation.index] = {
          queueId: operation.queueId,
          requestId: operation.requestId,
          method: operation.method,
          endpoint: operation.endpoint,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const results = orderedResults.filter(
    (result): result is ReplayResult => typeof result !== 'undefined',
  );
  const ackedQueueIds = collectAckedQueueIds(results);

  return { ackedQueueIds, results };
}
