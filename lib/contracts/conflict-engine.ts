export const CONFLICT_ENGINE_CONTRACT_VERSION = '3.3.0';

export const CONFLICT_ENGINE_CONTRACT = {
  version: CONFLICT_ENGINE_CONTRACT_VERSION,
  rules: {
    autoMerge: 'non_overlapping_fields_only',
    overlapPolicy: 'create_conflict_record',
  },
  conflictRecordFields: [
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
  ],
  decisionMetadataFields: ['engineVersion', 'reason', 'detectedAt'],
} as const;
