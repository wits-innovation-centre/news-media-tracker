import { describe, expect, it } from '@jest/globals';
import { buildReplayDispatchPlan } from './conflict-engine';

describe('conflict engine dispatch plan', () => {
  it('auto-merges non-overlapping edits on the same record', () => {
    const plan = buildReplayDispatchPlan([
      {
        index: 0,
        queueId: 1,
        requestId: 'req-1',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
        body: { summary: 'Updated summary' },
      },
      {
        index: 1,
        queueId: 2,
        requestId: 'req-2',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
        body: { status: 'verified' },
      },
    ]);

    expect(plan.dispatchGroups).toHaveLength(1);
    expect(plan.dispatchGroups[0]).toMatchObject({
      method: 'PATCH',
      endpoint: '/api/events/event-1',
      body: {
        summary: 'Updated summary',
        status: 'verified',
      },
    });
    expect(plan.dispatchGroups[0].sourceOperations).toHaveLength(2);
    expect(plan.conflictedOperations).toHaveLength(0);
    expect(plan.conflictRecords).toHaveLength(0);
  });

  it('generates a conflict record when edits overlap on the same field', () => {
    const plan = buildReplayDispatchPlan([
      {
        index: 0,
        queueId: 11,
        requestId: 'req-a',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
        body: { status: 'draft' },
      },
      {
        index: 1,
        queueId: 12,
        requestId: 'req-b',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
        body: { status: 'published' },
      },
    ]);

    expect(plan.dispatchGroups).toHaveLength(1);
    expect(plan.dispatchGroups[0].sourceOperations).toHaveLength(1);
    expect(plan.conflictedOperations).toEqual([
      expect.objectContaining({
        requestId: 'req-b',
      }),
    ]);
    expect(plan.conflictRecords).toEqual([
      expect.objectContaining({
        requestId: 'req-b',
        overlappingFields: ['status'],
        decision: 'manual',
        decisionMetadata: expect.objectContaining({
          engineVersion: '3.3.0',
          reason: 'overlapping_field_edits',
        }),
      }),
    ]);
  });
});
