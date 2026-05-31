import type { DetailedEvent } from './list-homicides';
import {
  buildMergeQueueCandidates,
  type MergeParticipantRecord,
} from './participant-merge-queue.utils';

export const GRAPH_MIN_SCALE = 0.6;
export const GRAPH_MAX_SCALE = 1.6;
export const GRAPH_SCALE_STEP = 0.1;

const ARTICLE_SIMILARITY_THRESHOLD = 0.88;
const EVENT_SIMILARITY_THRESHOLD = 0.92;

export type GraphNodeKind = 'article' | 'event' | 'participant';
export type GraphEdgeStyle = 'hard' | 'soft';
export type GraphParticipantSubtype = MergeParticipantRecord['role'];

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  subtype?: GraphParticipantSubtype;
  label: string;
  detail: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  style: GraphEdgeStyle;
  reason: string;
  confidence?: number;
}

export interface ConnectedGraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const normaliseGraphValue = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';

const calculateSimilarity = (sourceValue: string, targetValue: string): number => {
  const source = normaliseGraphValue(sourceValue);
  const target = normaliseGraphValue(targetValue);

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

const formatConfidence = (value: number): number => Number(value.toFixed(2));

const eventLabel = (case_: DetailedEvent): string => {
  return case_.typeOfMurder || case_.articleData?.newsReportHeadline || 'Unnamed event';
};

const eventDetail = (case_: DetailedEvent): string => {
  return `${case_.victims.length} victim(s) and ${case_.perpetrators.length} perpetrator(s)`;
};

const participantLabel = (participant: MergeParticipantRecord): string =>
  participant.primaryName || participant.alias || `Unnamed ${participant.role}`;

const participantDetail = (participant: MergeParticipantRecord): string =>
  participant.alias ? `Aliases: ${participant.alias}` : `Subtype: ${participant.role}`;

const toParticipantRecords = (case_: DetailedEvent): MergeParticipantRecord[] => [
  ...case_.victims.map((victim) => ({
    id: victim.id,
    role: 'victim' as const,
    articleId: victim.articleId,
    primaryName: victim.victimName,
    alias: victim.victimAlias,
  })),
  ...case_.perpetrators.map((perpetrator) => ({
    id: perpetrator.id,
    role: 'perpetrator' as const,
    articleId: perpetrator.articleId,
    primaryName: perpetrator.perpetratorName,
    alias: perpetrator.perpetratorAlias,
  })),
];

const articleSoftEdge = (
  leftCase: DetailedEvent,
  rightCase: DetailedEvent,
): GraphEdge | null => {
  const leftArticle = leftCase.articleData;
  const rightArticle = rightCase.articleData;
  if (!leftArticle?.id || !rightArticle?.id || leftArticle.id === rightArticle.id) {
    return null;
  }

  const leftUrl = normaliseGraphValue(leftArticle.newsReportUrl);
  const rightUrl = normaliseGraphValue(rightArticle.newsReportUrl);
  if (leftUrl && rightUrl && leftUrl === rightUrl) {
    return {
      id: `soft:article:${[leftArticle.id, rightArticle.id].sort().join('::')}`,
      sourceId: `article:${leftArticle.id}`,
      targetId: `article:${rightArticle.id}`,
      style: 'soft',
      reason: 'Matching article URL suggests a duplicate report.',
      confidence: 1,
    };
  }

  const headlineSimilarity = calculateSimilarity(
    leftArticle.newsReportHeadline ?? '',
    rightArticle.newsReportHeadline ?? '',
  );
  if (headlineSimilarity < ARTICLE_SIMILARITY_THRESHOLD) {
    return null;
  }

  return {
    id: `soft:article:${[leftArticle.id, rightArticle.id].sort().join('::')}`,
    sourceId: `article:${leftArticle.id}`,
    targetId: `article:${rightArticle.id}`,
    style: 'soft',
    reason: 'Headline similarity suggests these article nodes may deduplicate.',
    confidence: formatConfidence(headlineSimilarity),
  };
};

const eventSoftEdge = (leftCase: DetailedEvent, rightCase: DetailedEvent): GraphEdge | null => {
  if (!leftCase.id || !rightCase.id || leftCase.id === rightCase.id) {
    return null;
  }

  const leftParticipants = toParticipantRecords(leftCase);
  const rightParticipants = toParticipantRecords(rightCase);
  const crossCandidates = buildMergeQueueCandidates([
    ...leftParticipants,
    ...rightParticipants,
  ]).filter((candidate) => {
    const leftIds = new Set(leftParticipants.map((participant) => participant.id));
    const rightIds = new Set(rightParticipants.map((participant) => participant.id));
    return (
      leftIds.has(candidate.left.id) !== leftIds.has(candidate.right.id) &&
      rightIds.has(candidate.left.id) !== rightIds.has(candidate.right.id)
    );
  });

  const strongestCandidate = crossCandidates.sort(
    (left, right) => right.similarity - left.similarity,
  )[0];

  if (!strongestCandidate || strongestCandidate.similarity < EVENT_SIMILARITY_THRESHOLD) {
    return null;
  }

  return {
    id: `soft:event:${[leftCase.id, rightCase.id].sort().join('::')}`,
    sourceId: `event:${leftCase.id}`,
    targetId: `event:${rightCase.id}`,
    style: 'soft',
    reason: `Participant similarity (${strongestCandidate.sharedValue}) suggests a duplicate event.`,
    confidence: formatConfidence(strongestCandidate.similarity),
  };
};

export function buildConnectedGraphModel(cases: DetailedEvent[]): ConnectedGraphModel {
  const nodesById = new Map<string, GraphNode>();
  const edgesById = new Map<string, GraphEdge>();
  const participants: MergeParticipantRecord[] = [];

  cases.forEach((case_) => {
    if (!case_.id) {
      return;
    }

    const eventNodeId = `event:${case_.id}`;
    nodesById.set(eventNodeId, {
      id: eventNodeId,
      kind: 'event',
      label: eventLabel(case_),
      detail: eventDetail(case_),
    });

    if (case_.articleData?.id) {
      const articleNodeId = `article:${case_.articleData.id}`;
      nodesById.set(articleNodeId, {
        id: articleNodeId,
        kind: 'article',
        label:
          case_.articleData.newsReportHeadline?.trim() ||
          case_.articleData.newsReportUrl ||
          'Untitled article',
        detail: case_.articleData.newsReportUrl || 'Article linked through capture form',
      });
      edgesById.set(`hard:${articleNodeId}:${eventNodeId}`, {
        id: `hard:${articleNodeId}:${eventNodeId}`,
        sourceId: articleNodeId,
        targetId: eventNodeId,
        style: 'hard',
        reason: 'Article reports the event.',
      });
    }

    toParticipantRecords(case_).forEach((participant) => {
      participants.push(participant);
      const participantNodeId = `participant:${participant.role}:${participant.id}`;
      nodesById.set(participantNodeId, {
        id: participantNodeId,
        kind: 'participant',
        subtype: participant.role,
        label: participantLabel(participant),
        detail: participantDetail(participant),
      });
      edgesById.set(`hard:${eventNodeId}:${participantNodeId}`, {
        id: `hard:${eventNodeId}:${participantNodeId}`,
        sourceId: eventNodeId,
        targetId: participantNodeId,
        style: 'hard',
        reason: 'Participant is involved in the event.',
      });
    });
  });

  buildMergeQueueCandidates(participants).forEach((candidate) => {
    const sourceId = `participant:${candidate.left.role}:${candidate.left.id}`;
    const targetId = `participant:${candidate.right.role}:${candidate.right.id}`;
    edgesById.set(`soft:${sourceId}:${targetId}`, {
      id: `soft:${sourceId}:${targetId}`,
      sourceId,
      targetId,
      style: 'soft',
      reason: `Potential merge candidate via ${candidate.matchReason.replace('-', ' ')}: ${candidate.sharedValue}.`,
      confidence: formatConfidence(candidate.similarity),
    });
  });

  for (let leftIndex = 0; leftIndex < cases.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cases.length; rightIndex += 1) {
      const articleEdge = articleSoftEdge(cases[leftIndex], cases[rightIndex]);
      if (articleEdge) {
        edgesById.set(articleEdge.id, articleEdge);
      }

      const duplicateEventEdge = eventSoftEdge(cases[leftIndex], cases[rightIndex]);
      if (duplicateEventEdge) {
        edgesById.set(duplicateEventEdge.id, duplicateEventEdge);
      }
    }
  }

  return {
    nodes: Array.from(nodesById.values()),
    edges: Array.from(edgesById.values()),
  };
}

export function clampGraphScale(value: number): number {
  return Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, value));
}

export function nextGraphSelection(
  caseIds: string[],
  selectedCaseIds: string[],
  direction: 'next' | 'prev',
): string[] {
  if (caseIds.length === 0) {
    return [];
  }

  const selectedId = selectedCaseIds[0];
  if (!selectedId) {
    return [caseIds[0]];
  }

  const currentIndex = caseIds.indexOf(selectedId);
  const fallbackIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex =
    direction === 'next'
      ? Math.min(caseIds.length - 1, fallbackIndex + 1)
      : Math.max(0, fallbackIndex - 1);
  return [caseIds[nextIndex]];
}
