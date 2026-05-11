export type ConflictResolutionDecision = 'keep_local' | 'keep_remote';

export interface ConflictRecord {
  id: string;
  summary?: string;
  recordType?: string;
  recordId?: string;
  fields?: string[];
  localValue?: unknown;
  remoteValue?: unknown;
  createdAt?: string;
  status?: 'open' | 'resolved';
}

export interface ConflictQueuePayload {
  conflicts?: ConflictRecord[];
  capabilities?: string[];
  permissions?: string[];
  canResolveConflicts?: boolean;
  role?: string;
}

export const hasResolveCapability = (payload: ConflictQueuePayload): boolean => {
  if (typeof payload.canResolveConflicts === 'boolean') {
    return payload.canResolveConflicts;
  }

  const capabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities
    : [];
  if (capabilities.includes('resolve_conflicts')) {
    return true;
  }

  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions
    : [];
  if (permissions.includes('resolve_conflicts')) {
    return true;
  }

  return payload.role === 'owner' || payload.role === 'admin';
};

export const getOpenConflicts = (conflicts: ConflictRecord[]): ConflictRecord[] =>
  conflicts.filter((item) => item.status !== 'resolved');

export const buildResolveConflictRequest = (
  conflictId: string,
  resolution: ConflictResolutionDecision,
): { url: string; init: RequestInit } => ({
  url: `/api/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`,
  init: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution }),
  },
});
