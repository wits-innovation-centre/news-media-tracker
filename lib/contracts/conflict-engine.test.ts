import { describe, expect, it } from '@jest/globals';
import {
  CONFLICT_ENGINE_CONTRACT,
  CONFLICT_ENGINE_CONTRACT_VERSION,
} from './conflict-engine';

describe('conflict engine contract', () => {
  it('publishes a pinned contract version', () => {
    expect(CONFLICT_ENGINE_CONTRACT.version).toBe(
      CONFLICT_ENGINE_CONTRACT_VERSION,
    );
  });

  it('documents auto-merge and conflict-record policies', () => {
    expect(CONFLICT_ENGINE_CONTRACT.rules).toEqual({
      autoMerge: 'non_overlapping_fields_only',
      overlapPolicy: 'create_conflict_record',
    });
  });

  it('includes auditable conflict decision metadata fields', () => {
    expect(CONFLICT_ENGINE_CONTRACT.conflictRecordFields).toEqual([
      'conflictId',
      'method',
      'endpoint',
      'requestId',
      'queueId',
      'overlappingFields',
      'winnerOperation',
      'conflictingOperation',
      'decision',
      'decisionMetadata',
    ]);
    expect(CONFLICT_ENGINE_CONTRACT.decisionMetadataFields).toEqual([
      'engineVersion',
      'reason',
      'detectedAt',
    ]);
  });
});
