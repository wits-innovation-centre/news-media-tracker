export type MergeParticipantRole = 'victim' | 'perpetrator';

export interface MergeParticipantRecord {
  id: string;
  role: MergeParticipantRole;
  articleId: string;
  primaryName: string | null;
  alias: string | null;
}

export interface MergeQueueCandidate {
  id: string;
  sharedValue: string;
  similarity: number;
  matchReason: 'exact-name' | 'alias-overlap' | 'name-similarity';
  left: MergeParticipantRecord;
  right: MergeParticipantRecord;
}

export type MergeQueueRoleFilter = 'all' | MergeParticipantRole;
export type MergeQueueSortOrder =
  | 'shared-value-asc'
  | 'shared-value-desc'
  | 'role-asc'
  | 'role-desc';

const NAME_DELIMITER = /[,;|]+/;
const MERGE_SIMILARITY_THRESHOLD = 0.9;

export const normaliseName = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const splitAliasValues = (alias: string | null | undefined): string[] =>
  typeof alias === 'string' && alias.trim()
    ? alias
        .split(NAME_DELIMITER)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const uniqueNames = (names: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  names.forEach((name) => {
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      values.push(trimmed);
    }
  });
  return values;
};

const candidateNames = (participant: MergeParticipantRecord): string[] => {
  return uniqueNames([participant.primaryName, ...splitAliasValues(participant.alias)]);
};

const calculateSimilarity = (sourceValue: string, targetValue: string): number => {
  const source = normaliseName(sourceValue);
  const target = normaliseName(targetValue);

  if (!source || !target) {
    return 0;
  }

  if (source === target) {
    return 1;
  }

  const matrix: number[][] = [];
  for (let rowIndex = 0; rowIndex <= source.length; rowIndex += 1) {
    matrix[rowIndex] = [rowIndex];
  }
  for (let columnIndex = 0; columnIndex <= target.length; columnIndex += 1) {
    matrix[0][columnIndex] = columnIndex;
  }

  for (let rowIndex = 1; rowIndex <= source.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= target.length; columnIndex += 1) {
      const substitutionCost =
        source[rowIndex - 1] === target[columnIndex - 1] ? 0 : 1;
      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + substitutionCost,
      );
    }
  }

  const maxLength = Math.max(source.length, target.length);
  return 1 - matrix[source.length][target.length] / maxLength;
};

const buildSimilarityMatch = (
  left: MergeParticipantRecord,
  right: MergeParticipantRecord,
): MergeQueueCandidate | null => {
  const leftNames = candidateNames(left);
  const rightNames = candidateNames(right);

  let bestMatch:
    | {
        sharedValue: string;
        similarity: number;
        matchReason: MergeQueueCandidate['matchReason'];
      }
    | null = null;

  for (const leftName of leftNames) {
    const leftIsAlias =
      normaliseName(left.primaryName) !== normaliseName(leftName);
    for (const rightName of rightNames) {
      const rightIsAlias =
        normaliseName(right.primaryName) !== normaliseName(rightName);
      const similarity = calculateSimilarity(leftName, rightName);

      if (similarity < MERGE_SIMILARITY_THRESHOLD) {
        continue;
      }

      const exactMatch = normaliseName(leftName) === normaliseName(rightName);
      const matchReason: MergeQueueCandidate['matchReason'] = exactMatch
        ? leftIsAlias || rightIsAlias
          ? 'alias-overlap'
          : 'exact-name'
        : 'name-similarity';
      const sharedValue = exactMatch ? leftName : `${leftName} ~ ${rightName}`;

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = {
          sharedValue,
          similarity,
          matchReason,
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    id: [left.id, right.id].sort().join('::'),
    left,
    right,
    sharedValue: bestMatch.sharedValue,
    similarity: bestMatch.similarity,
    matchReason: bestMatch.matchReason,
  };
};

export const buildMergeQueueCandidates = (
  participants: MergeParticipantRecord[],
): MergeQueueCandidate[] => {
  const candidates: MergeQueueCandidate[] = [];
  for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < participants.length;
      rightIndex += 1
    ) {
      const left = participants[leftIndex];
      const right = participants[rightIndex];
      if (left.role !== right.role) continue;
      const candidate = buildSimilarityMatch(left, right);
      if (!candidate) continue;
      candidates.push(candidate);
    }
  }
  return candidates;
};

const candidateMatchesSearch = (
  candidate: MergeQueueCandidate,
  searchTerm: string,
): boolean => {
  if (!searchTerm) return true;
  const values = [
    candidate.sharedValue,
    candidate.left.primaryName,
    candidate.left.alias,
    candidate.right.primaryName,
    candidate.right.alias,
    candidate.matchReason,
    candidate.left.id,
    candidate.right.id,
  ];
  return values.some((value) => normaliseName(value).includes(searchTerm));
};

export const filterAndSortMergeQueueCandidates = (
  queue: MergeQueueCandidate[],
  options: {
    roleFilter: MergeQueueRoleFilter;
    searchText: string;
    sortOrder: MergeQueueSortOrder;
  },
): MergeQueueCandidate[] => {
  const searchTerm = normaliseName(options.searchText);
  const filtered = queue.filter((candidate) => {
    if (
      options.roleFilter !== 'all' &&
      candidate.left.role !== options.roleFilter
    ) {
      return false;
    }
    return candidateMatchesSearch(candidate, searchTerm);
  });

  return filtered.sort((left, right) => {
    if (options.sortOrder === 'role-asc' || options.sortOrder === 'role-desc') {
      const direction = options.sortOrder === 'role-asc' ? 1 : -1;
      const roleCompare = left.left.role.localeCompare(right.left.role);
      if (roleCompare !== 0) return roleCompare * direction;
      const sharedCompare = normaliseName(left.sharedValue).localeCompare(
        normaliseName(right.sharedValue),
      );
      if (sharedCompare !== 0) return sharedCompare * direction;
      return left.id.localeCompare(right.id) * direction;
    }

    const direction = options.sortOrder === 'shared-value-asc' ? 1 : -1;
    const sharedCompare = normaliseName(left.sharedValue).localeCompare(
      normaliseName(right.sharedValue),
    );
    if (sharedCompare !== 0) return sharedCompare * direction;
    return left.id.localeCompare(right.id) * direction;
  });
};

export interface AliasPromotionResult {
  primaryName: string;
  alias: string | null;
}

export const buildAliasPromotionResult = (
  participant: MergeParticipantRecord,
  promotedName: string,
): AliasPromotionResult => {
  const nextPrimary = promotedName.trim();
  if (!nextPrimary) {
    throw new Error('Select an alias value to promote.');
  }
  if (normaliseName(nextPrimary) === normaliseName(participant.primaryName)) {
    throw new Error('Selected alias already matches the primary name.');
  }

  const aliases = splitAliasValues(participant.alias);
  const aliasLookup = new Set(aliases.map((item) => item.toLowerCase()));
  if (!aliasLookup.has(nextPrimary.toLowerCase())) {
    throw new Error('Selected value must be an existing alias.');
  }

  const nextAliasValues = uniqueNames([
    participant.primaryName,
    ...aliases.filter((alias) => alias.toLowerCase() !== nextPrimary.toLowerCase()),
  ]).filter((name) => normaliseName(name) !== normaliseName(nextPrimary));

  return {
    primaryName: nextPrimary,
    alias: nextAliasValues.length > 0 ? nextAliasValues.join(', ') : null,
  };
};

export interface MergeResult {
  primaryName: string | null;
  alias: string | null;
}

export const buildMergeResult = (
  participantToKeep: MergeParticipantRecord,
  participantToRemove: MergeParticipantRecord,
): MergeResult => {
  const keepPrimary = participantToKeep.primaryName?.trim() || null;
  const aliases = uniqueNames([
    ...splitAliasValues(participantToKeep.alias),
    ...splitAliasValues(participantToRemove.alias),
    participantToKeep.primaryName,
    participantToRemove.primaryName,
  ]);
  const filteredAliases = aliases.filter(
    (name) => normaliseName(name) !== normaliseName(keepPrimary),
  );
  return {
    primaryName: keepPrimary,
    alias: filteredAliases.length > 0 ? filteredAliases.join(', ') : null,
  };
};
