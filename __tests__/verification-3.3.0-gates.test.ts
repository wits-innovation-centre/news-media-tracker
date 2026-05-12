/**
 * [3.3.0][07-verification] Integrated verification gates
 *
 * Verification-only harness for permission enforcement, divergence handling,
 * conflict candidate generation, and Stitch-aligned workspace behavior checks.
 */

import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { resolveVisibleFieldGroups } from '../lib/components/role-visibility';
import { buildMergeQueueCandidates } from '../lib/components/participant-merge-queue.utils';
import {
  normalizeReplayOperations,
  replayOfflineOperations,
} from '../app/api/sync/replay';

describe('[gate-1] sharing permission enforcement', () => {
  it('restricts viewer role field visibility to core identity', () => {
    expect(resolveVisibleFieldGroups('victim', { role: 'viewer' })).toEqual([
      'coreIdentity',
    ]);
    expect(resolveVisibleFieldGroups('perpetrator', { role: 'viewer' })).toEqual([
      'coreIdentity',
    ]);
  });

  it('grants broader field visibility to editor role than viewer role', () => {
    expect(resolveVisibleFieldGroups('perpetrator', { role: 'editor' })).toEqual([
      'coreIdentity',
      'relationship',
      'suspectStatus',
    ]);
  });
});

describe('[gate-2] operation-log divergence handling', () => {
  it('de-duplicates duplicate request IDs within a replay batch', async () => {
    const fetchMock = jest.fn(async () =>
      ({ ok: true, status: 200, statusText: 'OK' }) as Response,
    );

    const operations = normalizeReplayOperations([
      {
        queueId: 1,
        requestId: 'req-duplicate',
        method: 'POST',
        endpoint: '/api/events',
        body: { id: 'event-1' },
      },
      {
        queueId: 2,
        requestId: 'req-duplicate',
        method: 'POST',
        endpoint: '/api/events',
        body: { id: 'event-1' },
      },
    ]);

    const result = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache: new Map(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.results.map((item) => item.status).sort()).toEqual([
      'duplicate',
      'replayed',
    ]);
    expect(result.ackedQueueIds.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('retries previously failed operations while preserving successful replay cache entries', async () => {
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
            results: [
              { requestId: 'req-ok', status: 'replayed' },
              { requestId: 'req-fail', status: 'failed' },
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
            results: [{ requestId: 'req-fail', status: 'replayed' }],
          };
        },
      } as unknown as Response);

    const replayCache = new Map();
    const operations = normalizeReplayOperations([
      {
        queueId: 10,
        requestId: 'req-ok',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
      {
        queueId: 11,
        requestId: 'req-fail',
        method: 'POST',
        endpoint: '/api/events',
        body: {},
      },
    ]);

    const firstReplay = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(firstReplay.ackedQueueIds).toEqual([10]);

    const secondReplay = await replayOfflineOperations(operations, {
      requestOrigin: 'http://localhost:3000',
      replayCache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondReplay.ackedQueueIds.sort((a, b) => a - b)).toEqual([
      10,
      11,
    ]);
  });
});

describe('[gate-3] conflict generation outcomes', () => {
  it('creates merge-queue candidates for same-role records that share canonical values', () => {
    const queue = buildMergeQueueCandidates([
      {
        id: 'v1',
        role: 'victim',
        articleId: 'a1',
        primaryName: 'Jane Doe',
        alias: 'JD',
      },
      {
        id: 'v2',
        role: 'victim',
        articleId: 'a2',
        primaryName: 'JD',
        alias: null,
      },
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('v1::v2');
    expect(queue[0].sharedValue).toBe('JD');
  });

  it('does not create conflict candidates for cross-role pairings', () => {
    const queue = buildMergeQueueCandidates([
      {
        id: 'v1',
        role: 'victim',
        articleId: 'a1',
        primaryName: 'Shared Name',
        alias: null,
      },
      {
        id: 'p1',
        role: 'perpetrator',
        articleId: 'a2',
        primaryName: 'Shared Name',
        alias: null,
      },
    ]);

    expect(queue).toHaveLength(0);
  });
});

describe('[gate-4] Stitch workspace UI and accessibility checks', () => {
  const readRootFile = (relativePath: string) =>
    fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('detects current absence of Form|Graph switching and graph controls (blocker signal)', () => {
    const pageSource = readRootFile('app/page.tsx');
    const inputSource = readRootFile('lib/components/input-homicide.tsx');
    const globalCss = readRootFile('app/globals.css');

    const modeLabelPattern = /Form\s*\|\s*Graph|Workspace Mode/i;
    const tablistPattern = /role=['"]tablist['"]/i;
    const modeAriaLabelPattern =
      /aria-label=['"][^'"]*(Form|Graph|Workspace Mode)[^'"]*['"]/i;
    const graphPattern = /Connected Graph|graph workspace|graph legend|graph controls/i;
    const keyboardPattern = /ArrowLeft|ArrowRight|onKeyDown|aria-controls/i;

    const combinedSource = `${pageSource}\n${inputSource}\n${globalCss}`;

    const hasModeToggleContract =
      modeLabelPattern.test(combinedSource) ||
      tablistPattern.test(combinedSource) ||
      modeAriaLabelPattern.test(combinedSource);
    const hasGraphWorkspaceContract = graphPattern.test(combinedSource);
    const hasKeyboardA11yContract = keyboardPattern.test(combinedSource);

    // Lane 06 UI implementation has landed — these contracts are now present.
    expect(hasModeToggleContract).toBe(true);
    expect(hasGraphWorkspaceContract).toBe(true);
    expect(hasKeyboardA11yContract).toBe(true);
  });
});
