export type LoggedMutationOperation = {
  queueId?: number;
  requestId?: string;
  method: string;
  endpoint: string;
  baseVersion?: number;
};

export type LoggedMutationResult = {
  status: 'replayed' | 'duplicate' | 'failed';
  statusCode?: number;
  error?: string;
  divergence?: {
    code: string;
    deterministicKey: string;
    baseVersion: number | null;
    currentVersion: number | null;
  };
};

export type MutationOperationLogEntry = LoggedMutationOperation &
  LoggedMutationResult & {
    sequence: number;
    recordedAt: string;
  };

export type MutationOperationLogStore = {
  append: (
    operation: LoggedMutationOperation,
    result: LoggedMutationResult,
  ) => MutationOperationLogEntry;
  list: () => MutationOperationLogEntry[];
};

export function createOperationLogStore(): MutationOperationLogStore {
  let sequence = 0;
  const entries: MutationOperationLogEntry[] = [];

  return {
    append(operation, result) {
      const entry: MutationOperationLogEntry = {
        ...operation,
        ...result,
        sequence: ++sequence,
        recordedAt: new Date().toISOString(),
      };
      entries.push(entry);
      return entry;
    },
    list() {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}
