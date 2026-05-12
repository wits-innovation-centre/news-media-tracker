import { describe, expect, it } from '@jest/globals';
import { createOperationLogStore } from './operation-log';

describe('operation log store', () => {
  it('appends entries in order and returns copies from list()', () => {
    const store = createOperationLogStore();
    store.append(
      {
        requestId: 'req-1',
        method: 'POST',
        endpoint: '/api/events',
        baseVersion: 1,
      },
      { status: 'replayed' },
    );
    store.append(
      {
        requestId: 'req-2',
        method: 'PATCH',
        endpoint: '/api/events/event-1',
      },
      {
        status: 'failed',
        divergence: {
          code: 'STALE_BASE_VERSION',
          deterministicKey: 'PATCH:/api/events/event-1:req-2:1:2',
          baseVersion: 1,
          currentVersion: 2,
        },
      },
    );

    const entries = store.list();
    expect(entries).toHaveLength(2);
    expect(entries[0].sequence).toBe(1);
    expect(entries[1].sequence).toBe(2);
    expect(entries[1].divergence?.code).toBe('STALE_BASE_VERSION');

    entries.pop();
    expect(store.list()).toHaveLength(2);
  });
});
