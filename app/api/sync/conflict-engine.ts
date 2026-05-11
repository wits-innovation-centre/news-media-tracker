export type ConflictEngineOperation = {
  index: number;
  queueId?: number;
  requestId?: string;
  method: string;
  endpoint: string;
  body?: unknown;
};

export type ReplayConflictRecord = {
  conflictId: string;
  method: string;
  endpoint: string;
  requestId?: string;
  queueId?: number;
  overlappingFields: string[];
  winnerOperation: {
    requestId?: string;
    queueId?: number;
  };
  conflictingOperation: {
    requestId?: string;
    queueId?: number;
  };
  decision: 'manual';
  decisionMetadata: {
    engineVersion: '3.3.0';
    reason: 'overlapping_field_edits';
    detectedAt: string;
  };
};

export type ReplayDispatchGroup = {
  method: string;
  endpoint: string;
  body?: unknown;
  sourceOperations: ConflictEngineOperation[];
};

type MergeableReplayGroup = ReplayDispatchGroup & {
  mergeable: true;
  mergedBody: Record<string, unknown>;
  mergedKeys: Set<string>;
  fieldOwners: Map<string, ConflictEngineOperation>;
};

type DispatchPlan = {
  dispatchGroups: ReplayDispatchGroup[];
  conflictedOperations: ConflictEngineOperation[];
  conflictRecords: ReplayConflictRecord[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function createNonMergeGroup(
  operation: ConflictEngineOperation,
): ReplayDispatchGroup {
  return {
    method: operation.method,
    endpoint: operation.endpoint,
    body: operation.body,
    sourceOperations: [operation],
  };
}

function createMergeGroup(operation: ConflictEngineOperation): MergeableReplayGroup {
  const mergedBody = { ...(operation.body as Record<string, unknown>) };
  const mergedKeys = new Set<string>(Object.keys(mergedBody));
  const fieldOwners = new Map<string, ConflictEngineOperation>();
  for (const key of mergedKeys) {
    fieldOwners.set(key, operation);
  }
  return {
    method: operation.method,
    endpoint: operation.endpoint,
    body: mergedBody,
    sourceOperations: [operation],
    mergeable: true,
    mergedBody,
    mergedKeys,
    fieldOwners,
  };
}

function createConflictRecord(
  operation: ConflictEngineOperation,
  winner: ConflictEngineOperation,
  overlappingFields: string[],
): ReplayConflictRecord {
  const idPart = operation.requestId ?? `queue-${operation.queueId ?? operation.index}`;
  return {
    conflictId: `conflict:${operation.method}:${operation.endpoint}:${idPart}:${overlappingFields.join(',')}`,
    method: operation.method,
    endpoint: operation.endpoint,
    requestId: operation.requestId,
    queueId: operation.queueId,
    overlappingFields,
    winnerOperation: {
      requestId: winner.requestId,
      queueId: winner.queueId,
    },
    conflictingOperation: {
      requestId: operation.requestId,
      queueId: operation.queueId,
    },
    decision: 'manual',
    decisionMetadata: {
      engineVersion: '3.3.0',
      reason: 'overlapping_field_edits',
      detectedAt: new Date().toISOString(),
    },
  };
}

export function buildReplayDispatchPlan(
  operations: ConflictEngineOperation[],
): DispatchPlan {
  const dispatchGroups: ReplayDispatchGroup[] = [];
  const mergeGroupsByKey = new Map<string, MergeableReplayGroup>();
  const conflictedOperations: ConflictEngineOperation[] = [];
  const conflictRecords: ReplayConflictRecord[] = [];

  for (const operation of operations) {
    const isMergeCandidate =
      (operation.method === 'PATCH' || operation.method === 'PUT') &&
      isPlainObject(operation.body);

    if (!isMergeCandidate) {
      dispatchGroups.push(createNonMergeGroup(operation));
      continue;
    }

    const mergeKey = `${operation.method}:${operation.endpoint}`;
    const existingGroup = mergeGroupsByKey.get(mergeKey);

    if (!existingGroup) {
      const group = createMergeGroup(operation);
      mergeGroupsByKey.set(mergeKey, group);
      dispatchGroups.push(group);
      continue;
    }

    const incomingBody = operation.body as Record<string, unknown>;
    const overlappingFields = Object.keys(incomingBody).filter((field) => {
      if (!existingGroup.mergedKeys.has(field)) {
        return false;
      }
      return !areValuesEqual(existingGroup.mergedBody[field], incomingBody[field]);
    });

    if (overlappingFields.length > 0) {
      const winner =
        existingGroup.fieldOwners.get(overlappingFields[0]) ??
        existingGroup.sourceOperations[existingGroup.sourceOperations.length - 1];
      conflictRecords.push(
        createConflictRecord(operation, winner, overlappingFields),
      );
      conflictedOperations.push(operation);
      continue;
    }

    for (const [field, value] of Object.entries(incomingBody)) {
      existingGroup.mergedBody[field] = value;
      existingGroup.mergedKeys.add(field);
      existingGroup.fieldOwners.set(field, operation);
    }

    existingGroup.sourceOperations.push(operation);
  }

  return {
    dispatchGroups,
    conflictedOperations,
    conflictRecords,
  };
}
