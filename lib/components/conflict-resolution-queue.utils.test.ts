import {
  buildResolveConflictRequest,
  getOpenConflicts,
  hasResolveCapability,
  type ConflictRecord,
} from './conflict-resolution-queue.utils';

describe('conflict resolution queue utils', () => {
  it('builds queue state with open conflicts for read-only users', () => {
    const conflicts: ConflictRecord[] = [
      { id: 'c1', status: 'open', summary: 'Name mismatch' },
      { id: 'c2', status: 'resolved', summary: 'Alias mismatch' },
    ];

    const openConflicts = getOpenConflicts(conflicts);
    const canResolve = hasResolveCapability({ capabilities: ['read'] });

    expect(openConflicts).toEqual([{ id: 'c1', status: 'open', summary: 'Name mismatch' }]);
    expect(canResolve).toBe(false);
  });

  it('allows resolve actions for resolve_conflicts capability and builds request payload', () => {
    expect(
      hasResolveCapability({ capabilities: ['read', 'resolve_conflicts'] }),
    ).toBe(true);

    const request = buildResolveConflictRequest('c1', 'keep_local');
    expect(request).toEqual({
      url: '/api/sync/conflicts/c1/resolve',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'keep_local' }),
      },
    });
  });
});
