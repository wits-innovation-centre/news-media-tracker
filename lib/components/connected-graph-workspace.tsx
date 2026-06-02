'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Form, Modal } from 'react-bootstrap';
import type { DetailedEvent } from './list-homicides';
import {
  GRAPH_SCALE_STEP,
  type GraphEdge,
  type GraphNode,
  buildConnectedGraphModel,
  clampGraphScale,
  nextGraphSelection,
} from './connected-graph-workspace.utils';

const GRAPH_VIEW_WIDTH = 1200;
const GRAPH_VIEW_HEIGHT = 720;
const GRAPH_TOP_PADDING = 88;

type GraphPoint = { x: number; y: number };

const hashSeed = (value: string): number => {
  return value.split('').reduce((acc, char) => acc * 31 + char.charCodeAt(0), 17);
};

const jitter = (seed: number, amplitude: number): number => {
  return (((seed % 1000) / 1000) * 2 - 1) * amplitude;
};

const distributeNodeLane = (
  nodeIds: string[],
  centerX: number,
): Array<{ id: string; position: GraphPoint }> => {
  if (nodeIds.length === 0) {
    return [];
  }

  const availableHeight = GRAPH_VIEW_HEIGHT - GRAPH_TOP_PADDING * 2;
  const spacing = nodeIds.length > 1 ? availableHeight / (nodeIds.length - 1) : 0;

  return nodeIds.map((id, index) => {
    const seed = hashSeed(id);
    return {
      id,
      position: {
        x: centerX + jitter(seed, 26),
        y:
          GRAPH_TOP_PADDING +
          index * spacing +
          jitter(seed >> 4, Math.min(22, spacing * 0.2 || 22)),
      },
    };
  });
};

const buildCurvedEdgePath = (source: GraphPoint, target: GraphPoint): string => {
  const direction = target.x >= source.x ? 1 : -1;
  const arcStrength = Math.max(48, Math.abs(target.x - source.x) * 0.28);
  const cx1 = source.x + direction * arcStrength;
  const cx2 = target.x - direction * arcStrength;
  return `M ${source.x} ${source.y} C ${cx1} ${source.y}, ${cx2} ${target.y}, ${target.x} ${target.y}`;
};

interface ConnectedGraphWorkspaceProps {
  cases: DetailedEvent[];
  selectedCaseIds: string[];
  onSelectedCaseIdsChange: (caseIds: string[]) => void;
  onCasesReconciled?: (cases: DetailedEvent[]) => void;
  onArticlesReconciled?: (payload: {
    mergedId: string;
    sourceIds: string[];
    mergedArticle: Record<string, unknown>;
  }) => void;
}

type MergeKind = 'article' | 'event' | 'participant';
type MergeSide = 'left' | 'right';
type MergeDecision = 'rejected' | 'merged';

interface GraphResolutionRecord {
  edgeId: string;
  decision: MergeDecision;
  resolvedAt: string;
  sourceId: string;
  targetId: string;
  reason: string;
  winnerId?: string;
  loserId?: string;
}

interface GraphAuditEntry {
  id: string;
  edgeId: string;
  decision: MergeDecision;
  timestamp: string;
  sourceLabel: string;
  targetLabel: string;
  reason: string;
  winnerId?: string;
  loserId?: string;
}

interface PersistedGraphMergeState {
  resolutions: Record<string, GraphResolutionRecord>;
  audit: GraphAuditEntry[];
}

interface MergeFieldChoice {
  key: string;
  leftValue: unknown;
  rightValue: unknown;
}

interface MergeModalState {
  edge: GraphEdge;
  kind: MergeKind;
  leftNode: GraphNode;
  rightNode: GraphNode;
  leftEntity: Record<string, unknown>;
  rightEntity: Record<string, unknown>;
  leftId: string;
  rightId: string;
  participantRole?: 'victim' | 'perpetrator';
}

const PARTICIPANT_NODE_REGEX = /^participant:(victim|perpetrator):(.*)$/;
const GRAPH_MERGE_PERSIST_KEY = 'nmt.graph.merge-resolutions.v1';
const GRAPH_AUDIT_LIMIT = 80;

const ARTICLE_MERGEABLE_FIELDS = new Set([
  'newsReportHeadline',
  'newsReportUrl',
  'dateOfPublication',
  'author',
  'wireService',
  'language',
  'typeOfSource',
  'newsReportPlatform',
  'notes',
]);

const EVENT_MERGEABLE_FIELDS = new Set([
  'eventTypes',
  'typeOfMurder',
  'location',
  'incidentTime',
  'court',
  'hearingType',
  'notes',
]);

const VICTIM_MERGEABLE_FIELDS = new Set([
  'victimName',
  'victimAlias',
  'victimAliases',
  'dateOfDeath',
  'dateOfDeathMode',
  'dateOfDeathEnd',
  'placeOfDeathProvince',
  'placeOfDeathTown',
  'typeOfLocation',
  'policeStation',
  'sexualAssault',
  'genderOfVictim',
  'raceOfVictim',
  'nationality',
  'ageOfVictim',
  'ageRangeOfVictim',
  'ageDescriptor',
  'modeOfDeathGeneral',
  'modeOfDeathSpecific',
  'typeOfMurder',
  'notes',
]);

const PERPETRATOR_MERGEABLE_FIELDS = new Set([
  'perpetratorName',
  'perpetratorAlias',
  'suspectAliases',
  'perpetratorRelationshipToVictim',
  'suspectIdentified',
  'suspectArrested',
  'suspectCharged',
  'charges',
  'conviction',
  'sentence',
  'notes',
]);

const isPrimitive = (value: unknown): boolean =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

const isMergeableField = (
  kind: MergeKind,
  key: string,
  participantRole?: 'victim' | 'perpetrator',
): boolean => {
  if (key === 'id' || key.endsWith('At') || key === 'syncStatus' || key === 'failureCount') {
    return false;
  }

  if (kind === 'article') {
    return ARTICLE_MERGEABLE_FIELDS.has(key);
  }
  if (kind === 'event') {
    return EVENT_MERGEABLE_FIELDS.has(key);
  }

  if (participantRole === 'victim') {
    return VICTIM_MERGEABLE_FIELDS.has(key);
  }
  return PERPETRATOR_MERGEABLE_FIELDS.has(key);
};

const createMergedEntityId = (kind: MergeKind, participantRole?: 'victim' | 'perpetrator'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const rolePart = participantRole ? `${participantRole}-` : '';
  return `merged-${kind}-${rolePart}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const isBlankValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
};

const formatFieldValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'empty';
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

const uniqueById = <T extends { id?: string | null }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  items.forEach((item) => {
    const id = item.id ?? '';
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    deduped.push(item);
  });
  return deduped;
};

const formatAuditTimestamp = (isoValue: string): string => {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return isoValue;
  }
  return parsed.toLocaleString();
};

const loadPersistedGraphMergeState = (): PersistedGraphMergeState => {
  if (typeof window === 'undefined') {
    return { resolutions: {}, audit: [] };
  }

  try {
    const raw = window.localStorage.getItem(GRAPH_MERGE_PERSIST_KEY);
    if (!raw) {
      return { resolutions: {}, audit: [] };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedGraphMergeState> | null;
    const resolutions =
      parsed?.resolutions && typeof parsed.resolutions === 'object'
        ? (parsed.resolutions as Record<string, GraphResolutionRecord>)
        : {};
    const audit = Array.isArray(parsed?.audit)
      ? (parsed?.audit as GraphAuditEntry[])
      : [];
    return { resolutions, audit };
  } catch {
    return { resolutions: {}, audit: [] };
  }
};

const ConnectedGraphWorkspace: React.FC<ConnectedGraphWorkspaceProps> = ({
  cases,
  selectedCaseIds,
  onSelectedCaseIdsChange,
  onCasesReconciled,
  onArticlesReconciled,
}) => {
  const [scale, setScale] = useState(1);
  const [nodePositionOverrides, setNodePositionOverrides] = useState<Record<string, GraphPoint>>({});
  const [resolutionRecords, setResolutionRecords] = useState<Record<string, GraphResolutionRecord>>({});
  const [mergeAudit, setMergeAudit] = useState<GraphAuditEntry[]>([]);
  const [mergeModalState, setMergeModalState] = useState<MergeModalState | null>(null);
  const [primaryMergeSide, setPrimaryMergeSide] = useState<MergeSide>('left');
  const [fieldChoices, setFieldChoices] = useState<Record<string, MergeSide>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const caseIds = useMemo(
    () => cases.map((case_) => case_.id).filter(Boolean) as string[],
    [cases],
  );
  const selectedSet = useMemo(
    () => new Set(selectedCaseIds),
    [selectedCaseIds],
  );

  const activeCases = cases;
  const graphModel = useMemo(
    () => buildConnectedGraphModel(activeCases),
    [activeCases],
  );

  useEffect(() => {
    const persisted = loadPersistedGraphMergeState();
    setResolutionRecords(persisted.resolutions);
    setMergeAudit(persisted.audit);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: PersistedGraphMergeState = {
      resolutions: resolutionRecords,
      audit: mergeAudit,
    };
    window.localStorage.setItem(GRAPH_MERGE_PERSIST_KEY, JSON.stringify(payload));
  }, [mergeAudit, resolutionRecords]);

  const dismissedSoftEdgeIds = useMemo(
    () =>
      new Set(
        Object.values(resolutionRecords)
          .map((record) => record.edgeId)
          .filter(Boolean),
      ),
    [resolutionRecords],
  );

  const visibleEdges = useMemo(
    () => graphModel.edges.filter((edge) => !dismissedSoftEdgeIds.has(edge.id)),
    [dismissedSoftEdgeIds, graphModel.edges],
  );

  const graphNodesById = useMemo(
    () => new Map(graphModel.nodes.map((node) => [node.id, node])),
    [graphModel.nodes],
  );

  const hardEdges = useMemo(
    () => visibleEdges.filter((edge) => edge.style === 'hard'),
    [visibleEdges],
  );
  const softEdges = useMemo(
    () => visibleEdges.filter((edge) => edge.style === 'soft'),
    [visibleEdges],
  );

  const resolveParticipantEntity = useMemo(() => {
    return (role: 'victim' | 'perpetrator', id: string): Record<string, unknown> | null => {
      for (const case_ of cases) {
        if (role === 'victim') {
          const match = case_.victims.find((victim) => victim.id === id);
          if (match) {
            return match as unknown as Record<string, unknown>;
          }
          continue;
        }

        const match = case_.perpetrators.find((perpetrator) => perpetrator.id === id);
        if (match) {
          return match as unknown as Record<string, unknown>;
        }
      }
      return null;
    };
  }, [cases]);

  const resolveArticleEntity = useMemo(() => {
    return (id: string): Record<string, unknown> | null => {
      const match = cases.find((case_) => case_.articleData?.id === id)?.articleData;
      return match ? (match as unknown as Record<string, unknown>) : null;
    };
  }, [cases]);

  const resolveEventEntity = useMemo(() => {
    return (id: string): Record<string, unknown> | null => {
      const match = cases.find((case_) => case_.id === id);
      if (!match) {
        return null;
      }

      const editable = Object.entries(match).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (key === 'id' || key === 'articleData' || key === 'victims' || key === 'perpetrators') {
          return acc;
        }
        if (isPrimitive(value)) {
          acc[key] = value;
        }
        return acc;
      }, {});

      return editable;
    };
  }, [cases]);

  const mergeFieldChoices = useMemo<MergeFieldChoice[]>(() => {
    if (!mergeModalState) {
      return [];
    }

    const keys = new Set<string>();
    Object.keys(mergeModalState.leftEntity).forEach((key) => {
      if (
        isPrimitive(mergeModalState.leftEntity[key]) &&
        isMergeableField(mergeModalState.kind, key, mergeModalState.participantRole)
      ) {
        keys.add(key);
      }
    });
    Object.keys(mergeModalState.rightEntity).forEach((key) => {
      if (
        isPrimitive(mergeModalState.rightEntity[key]) &&
        isMergeableField(mergeModalState.kind, key, mergeModalState.participantRole)
      ) {
        keys.add(key);
      }
    });

    return Array.from(keys)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => ({
        key,
        leftValue: mergeModalState.leftEntity[key],
        rightValue: mergeModalState.rightEntity[key],
      }));
  }, [mergeModalState]);

  const positionedNodes = useMemo(() => {
    const articles = graphModel.nodes
      .filter((node) => node.kind === 'article')
      .map((node) => node.id);
    const events = graphModel.nodes
      .filter((node) => node.kind === 'event')
      .map((node) => node.id);
    const participants = graphModel.nodes
      .filter((node) => node.kind === 'participant')
      .map((node) => node.id);

    const laneNodes = [
      ...distributeNodeLane(articles, 220),
      ...distributeNodeLane(events, 600),
      ...distributeNodeLane(participants, 980),
    ];

    const positionMap = new Map<string, GraphPoint>();
    laneNodes.forEach((entry) => positionMap.set(entry.id, entry.position));

    return graphModel.nodes.map((node) => {
      const base = positionMap.get(node.id) ?? { x: 600, y: GRAPH_VIEW_HEIGHT / 2 };
      const subtypeOffset =
        node.kind === 'participant'
          ? node.subtype === 'victim'
            ? -42
            : node.subtype === 'perpetrator'
              ? 42
              : 0
          : 0;
      return {
        ...node,
        position: {
          x: nodePositionOverrides[node.id]?.x ?? base.x + subtypeOffset,
          y: nodePositionOverrides[node.id]?.y ?? base.y,
        },
      };
    });
  }, [graphModel.nodes, nodePositionOverrides]);

  const positionsById = useMemo(() => {
    return new Map(positionedNodes.map((node) => [node.id, node.position]));
  }, [positionedNodes]);

  const zoomIn = () => setScale((prev) => clampGraphScale(prev + GRAPH_SCALE_STEP));
  const zoomOut = () =>
    setScale((prev) => clampGraphScale(prev - GRAPH_SCALE_STEP));
  const resetView = () => setScale(1);

  const stepSelection = (direction: 'next' | 'prev') => {
    onSelectedCaseIdsChange(nextGraphSelection(caseIds, selectedCaseIds, direction));
  };

  const recordResolution = (
    edge: GraphEdge,
    decision: MergeDecision,
    payload?: { winnerId?: string; loserId?: string },
  ) => {
    const now = new Date().toISOString();
    const leftNode = graphNodesById.get(edge.sourceId);
    const rightNode = graphNodesById.get(edge.targetId);

    const record: GraphResolutionRecord = {
      edgeId: edge.id,
      decision,
      resolvedAt: now,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      reason: edge.reason,
      winnerId: payload?.winnerId,
      loserId: payload?.loserId,
    };

    setResolutionRecords((current) => ({
      ...current,
      [edge.id]: record,
    }));

    const auditEntry: GraphAuditEntry = {
      id: `${edge.id}:${now}`,
      edgeId: edge.id,
      decision,
      timestamp: now,
      sourceLabel: leftNode?.label || edge.sourceId,
      targetLabel: rightNode?.label || edge.targetId,
      reason: edge.reason,
      winnerId: payload?.winnerId,
      loserId: payload?.loserId,
    };

    setMergeAudit((current) => [auditEntry, ...current].slice(0, GRAPH_AUDIT_LIMIT));
  };

  const restoreRejectedResolution = (edgeId: string) => {
    setResolutionRecords((current) => {
      const existing = current[edgeId];
      if (!existing || existing.decision !== 'rejected') {
        return current;
      }

      const next = { ...current };
      delete next[edgeId];
      return next;
    });
  };

  const openMergeManager = (edge: GraphEdge) => {
    if (edge.style !== 'soft') {
      return;
    }

    const leftNode = graphNodesById.get(edge.sourceId);
    const rightNode = graphNodesById.get(edge.targetId);
    if (!leftNode || !rightNode || leftNode.kind !== rightNode.kind) {
      return;
    }

    if (leftNode.kind === 'participant') {
      const leftMatch = edge.sourceId.match(PARTICIPANT_NODE_REGEX);
      const rightMatch = edge.targetId.match(PARTICIPANT_NODE_REGEX);
      if (!leftMatch || !rightMatch) {
        return;
      }

      const participantRole = leftMatch[1] as 'victim' | 'perpetrator';
      if (participantRole !== (rightMatch[1] as 'victim' | 'perpetrator')) {
        return;
      }

      const leftId = leftMatch[2];
      const rightId = rightMatch[2];
      const leftEntity = resolveParticipantEntity(participantRole, leftId);
      const rightEntity = resolveParticipantEntity(participantRole, rightId);
      if (!leftEntity || !rightEntity) {
        return;
      }

      setMergeModalState({
        edge,
        kind: 'participant',
        leftNode,
        rightNode,
        leftEntity,
        rightEntity,
        leftId,
        rightId,
        participantRole,
      });
      setPrimaryMergeSide('left');
      return;
    }

    if (leftNode.kind === 'article') {
      const leftId = edge.sourceId.slice('article:'.length);
      const rightId = edge.targetId.slice('article:'.length);
      const leftEntity = resolveArticleEntity(leftId);
      const rightEntity = resolveArticleEntity(rightId);
      if (!leftEntity || !rightEntity) {
        return;
      }

      setMergeModalState({
        edge,
        kind: 'article',
        leftNode,
        rightNode,
        leftEntity,
        rightEntity,
        leftId,
        rightId,
      });
      setPrimaryMergeSide('left');
      return;
    }

    if (leftNode.kind === 'event') {
      const leftId = edge.sourceId.slice('event:'.length);
      const rightId = edge.targetId.slice('event:'.length);
      const leftEntity = resolveEventEntity(leftId);
      const rightEntity = resolveEventEntity(rightId);
      if (!leftEntity || !rightEntity) {
        return;
      }

      setMergeModalState({
        edge,
        kind: 'event',
        leftNode,
        rightNode,
        leftEntity,
        rightEntity,
        leftId,
        rightId,
      });
      setPrimaryMergeSide('left');
    }
  };

  const closeMergeManager = () => {
    setMergeModalState(null);
    setFieldChoices({});
    setPrimaryMergeSide('left');
  };

  const applyMerge = () => {
    if (!mergeModalState) {
      return;
    }

    const leftId = mergeModalState.leftId;
    const rightId = mergeModalState.rightId;
    const mergedId = createMergedEntityId(mergeModalState.kind, mergeModalState.participantRole);

    const winnerEntity = primaryMergeSide === 'left'
      ? mergeModalState.leftEntity
      : mergeModalState.rightEntity;
    const loserEntity = primaryMergeSide === 'left'
      ? mergeModalState.rightEntity
      : mergeModalState.leftEntity;

    const mergedEntity = mergeFieldChoices.reduce<Record<string, unknown>>(
      (acc, field) => {
        const chosenSide = fieldChoices[field.key] ?? primaryMergeSide;
        const value = chosenSide === 'left' ? field.leftValue : field.rightValue;
        acc[field.key] = value;
        return acc;
      },
      {
        ...winnerEntity,
      },
    );

    if (mergeModalState.kind === 'participant' && mergeModalState.participantRole) {
      const mergedParticipant = {
        ...loserEntity,
        ...winnerEntity,
        ...mergedEntity,
        id: mergedId,
      };

      const nextCases = cases.map((case_) => {
        if (mergeModalState.participantRole === 'victim') {
          const updatedVictims = case_.victims.map((victim) => {
            if (victim.id === leftId || victim.id === rightId) {
              return mergedParticipant as typeof victim;
            }
            return victim;
          });

          return {
            ...case_,
            victims: uniqueById(updatedVictims),
          };
        }

        const updatedPerpetrators = case_.perpetrators.map((perpetrator) => {
          if (perpetrator.id === leftId || perpetrator.id === rightId) {
            return mergedParticipant as typeof perpetrator;
          }
          return perpetrator;
        });

        return {
          ...case_,
          perpetrators: uniqueById(updatedPerpetrators),
        };
      });

      onCasesReconciled?.(nextCases);
    }

    if (mergeModalState.kind === 'article') {
      const mergedArticle = {
        ...loserEntity,
        ...winnerEntity,
        ...mergedEntity,
        id: mergedId,
      };

      const nextCases = cases.map((case_) => {
        if (!case_.articleData || (case_.articleData.id !== leftId && case_.articleData.id !== rightId)) {
          return case_;
        }

        return {
          ...case_,
          articleData: mergedArticle as typeof case_.articleData,
        };
      });

      onCasesReconciled?.(nextCases);
      onArticlesReconciled?.({ mergedId, sourceIds: [leftId, rightId], mergedArticle });
    }

    if (mergeModalState.kind === 'event') {
      const eventMergedFields = {
        ...loserEntity,
        ...winnerEntity,
        ...mergedEntity,
      };

      const mergedEventRows = cases
        .map((case_) => {
          if (case_.id !== leftId && case_.id !== rightId) {
            return case_;
          }

          return {
            ...case_,
            ...eventMergedFields,
            id: mergedId,
          };
        })
        .reduce<Map<string, DetailedEvent>>((acc, case_) => {
          const articleId = case_.articleData?.id ?? '';
          const key = `${case_.id}::${articleId}`;
          const existing = acc.get(key);
          if (!existing) {
            acc.set(key, case_);
            return acc;
          }

          acc.set(key, {
            ...existing,
            ...eventMergedFields,
            id: mergedId,
            victims: uniqueById([...existing.victims, ...case_.victims]),
            perpetrators: uniqueById([...existing.perpetrators, ...case_.perpetrators]),
          });
          return acc;
        }, new Map());

      const nextCases = Array.from(mergedEventRows.values());
      onCasesReconciled?.(nextCases);

      const nextSelection = new Set(
        selectedCaseIds.map((id) => (id === leftId || id === rightId ? mergedId : id)),
      );
      onSelectedCaseIdsChange(
        Array.from(nextSelection).filter((id) =>
          nextCases.some((case_) => case_.id === id),
        ),
      );
    }

    recordResolution(mergeModalState.edge, 'merged', {
      winnerId: mergedId,
      loserId: `${leftId},${rightId}`,
    });
    closeMergeManager();
  };

  const rejectMerge = () => {
    if (!mergeModalState) {
      return;
    }
    recordResolution(mergeModalState.edge, 'rejected');
    closeMergeManager();
  };

  const onScenePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (!canvasRef.current) {
      return;
    }

    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: canvasRef.current.scrollLeft,
      scrollTop: canvasRef.current.scrollTop,
    };
    setIsPanning(true);
  };

  const onCanvasPointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (draggingNodeId && sceneRef.current) {
      const rect = sceneRef.current.getBoundingClientRect();
      const rawX = (event.clientX - rect.left) / scale;
      const rawY = (event.clientY - rect.top) / scale;
      setNodePositionOverrides((current) => ({
        ...current,
        [draggingNodeId]: {
          x: Math.max(80, Math.min(GRAPH_VIEW_WIDTH - 80, rawX)),
          y: Math.max(56, Math.min(GRAPH_VIEW_HEIGHT - 56, rawY)),
        },
      }));
      return;
    }

    if (isPanning && panStartRef.current && canvasRef.current) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      canvasRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      canvasRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    }
  };

  const onCanvasPointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    setDraggingNodeId(null);
    setIsPanning(false);
    panStartRef.current = null;
  };

  const onCanvasWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? GRAPH_SCALE_STEP : -GRAPH_SCALE_STEP;
    setScale((prev) => clampGraphScale(prev + delta));
  };

  React.useEffect(() => {
    if (!mergeModalState) {
      return;
    }

    const nextChoices = mergeFieldChoices.reduce<Record<string, MergeSide>>((acc, field) => {
      if (!isBlankValue(field.leftValue) && isBlankValue(field.rightValue)) {
        acc[field.key] = 'left';
      } else if (isBlankValue(field.leftValue) && !isBlankValue(field.rightValue)) {
        acc[field.key] = 'right';
      } else {
        acc[field.key] = primaryMergeSide;
      }
      return acc;
    }, {});

    setFieldChoices(nextChoices);
  }, [mergeFieldChoices, mergeModalState, primaryMergeSide]);

  return (
    <Card className="workspace-surface h-100">
      <Card.Header className="workspace-surface-header d-flex justify-content-between align-items-center">
        <div>
          <h3 className="workspace-surface-title mb-1">Connected Graph</h3>
          <small className="graph-muted-text">Cases and participant relationships</small>
        </div>
        <Badge bg="dark">{selectedCaseIds.length} selected</Badge>
      </Card.Header>
      <Card.Body className="d-flex flex-column gap-3">
        <div className="d-flex flex-wrap gap-2" aria-label="Primary graph controls">
          <Button
            size="sm"
            variant="outline-primary"
            onClick={zoomIn}
            aria-label="Zoom in graph"
          >
            Zoom In
          </Button>
          <Button
            size="sm"
            variant="outline-primary"
            onClick={zoomOut}
            aria-label="Zoom out graph"
          >
            Zoom Out
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={resetView}
            aria-label="Reset graph view"
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="outline-dark"
            onClick={() => stepSelection('prev')}
            aria-label="Select previous graph case"
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline-dark"
            onClick={() => stepSelection('next')}
            aria-label="Select next graph case"
          >
            Next
          </Button>
          <Button
            size="sm"
            variant="outline-warning"
            onClick={() => onSelectedCaseIdsChange([])}
            aria-label="Show all graph nodes"
            disabled={selectedCaseIds.length === 0}
          >
            Show All Nodes
          </Button>
        </div>

        <div
          ref={canvasRef}
          className="graph-canvas"
          style={{ cursor: isPanning ? 'grabbing' : undefined }}
          tabIndex={0}
          role="region"
          aria-label="Connected graph canvas"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          onWheel={onCanvasWheel}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              stepSelection('next');
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              stepSelection('prev');
            } else if (event.key === '+') {
              event.preventDefault();
              zoomIn();
            } else if (event.key === '-') {
              event.preventDefault();
              zoomOut();
            } else if (event.key === '0') {
              event.preventDefault();
              resetView();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onSelectedCaseIdsChange([]);
            }
          }}
        >
          <div
            className="graph-canvas-inner"
            style={{ transform: `scale(${scale})` }}
            role="presentation"
          >
            <div
              ref={sceneRef}
              className={`graph-scene${isPanning ? ' is-panning' : ''}`}
              role="list"
              aria-label="Graph entity nodes"
              onPointerDown={onScenePointerDown}
            >
              <svg
                className="graph-edges"
                viewBox={`0 0 ${GRAPH_VIEW_WIDTH} ${GRAPH_VIEW_HEIGHT}`}
                aria-hidden
              >
                <defs>
                  <linearGradient id="graph-hard-edge" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.74" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.76" />
                  </linearGradient>
                  <linearGradient id="graph-soft-edge" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#facc15" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#fb7185" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                {visibleEdges.map((edge) => {
                  const source = positionsById.get(edge.sourceId);
                  const target = positionsById.get(edge.targetId);
                  if (!source || !target) {
                    return null;
                  }

                  const strokeColor =
                    edge.style === 'hard' ? 'url(#graph-hard-edge)' : 'url(#graph-soft-edge)';

                  return (
                    <path
                      key={edge.id}
                      d={buildCurvedEdgePath(source, target)}
                      className={`graph-edge graph-edge-${edge.style}`}
                      stroke={strokeColor}
                      style={{ pointerEvents: edge.style === 'soft' ? 'stroke' : 'none' }}
                      onClick={() => openMergeManager(edge)}
                    />
                  );
                })}
              </svg>

              {positionedNodes.map((node) => {
                const eventId = node.id.startsWith('event:') ? node.id.slice(6) : null;
                const isSelectedEvent = eventId ? selectedSet.has(eventId) : false;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`graph-entity-node graph-kind-${node.kind} ${isSelectedEvent ? 'is-selected' : ''
                      }`}
                    style={{
                      left: `${node.position.x}px`,
                      top: `${node.position.y}px`,
                    }}
                    role="listitem"
                    aria-label={`${node.kind} node ${node.label}. ${node.detail}`}
                    onClick={() => {
                      if (eventId) {
                        if (
                          selectedCaseIds.length === 1 &&
                          selectedCaseIds[0] === eventId
                        ) {
                          onSelectedCaseIdsChange([]);
                          return;
                        }
                        onSelectedCaseIdsChange([eventId]);
                      }
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDraggingNodeId(node.id);
                    }}
                  >
                    <span className="graph-node-kind">
                      {node.kind}
                      {node.subtype ? `:${node.subtype}` : ''}
                    </span>
                    <strong className="graph-node-label">{node.label}</strong>
                    <small className="graph-node-detail">{node.detail}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="d-flex flex-column gap-2" aria-label="Graph edge summary">
          <small className="graph-muted-text">
            Solid edges are hard capture links. Dashed edges are merge/dedup
            suggestions from similarity scoring. Click a dashed line to open Merge Manager.
          </small>
          <div className="d-flex flex-wrap gap-2">
            <Badge bg="dark">Solid (hard): {hardEdges.length}</Badge>
            <Badge bg="warning" text="dark">
              Dashed (soft): {softEdges.length}
            </Badge>
          </div>
          {softEdges.slice(0, 8).map((edge) => (
            <div key={edge.id} className="graph-edge-note">
              <small className="graph-edge-note-text">
                <strong>Dashed:</strong> {edge.reason}
                {typeof edge.confidence === 'number'
                  ? ` (${Math.round(edge.confidence * 100)}%)`
                  : ''}
              </small>
            </div>
          ))}
        </div>

        <div className="d-flex flex-column gap-2" aria-label="Graph merge audit log">
          <small className="graph-muted-text">Merge Audit</small>
          {mergeAudit.length === 0 ? (
            <small className="text-muted">No merge decisions recorded yet.</small>
          ) : (
            mergeAudit.slice(0, 10).map((entry) => (
              <div key={entry.id} className="graph-audit-note">
                <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                  <small className="graph-audit-note-text">
                    <strong>{entry.decision === 'merged' ? 'Merged' : 'Rejected'}:</strong>{' '}
                    {entry.sourceLabel}{' -> '}{entry.targetLabel}
                    {entry.winnerId
                      ? ` (winner ${entry.winnerId}${entry.loserId ? `, retired ${entry.loserId}` : ''})`
                      : ''}
                  </small>
                  {entry.decision === 'rejected' && (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => restoreRejectedResolution(entry.edgeId)}
                    >
                      Restore link
                    </Button>
                  )}
                </div>
                <small className="graph-audit-note-meta">
                  {formatAuditTimestamp(entry.timestamp)} - {entry.reason}
                </small>
              </div>
            ))
          )}
        </div>
      </Card.Body>

      <Modal
        show={Boolean(mergeModalState)}
        onHide={closeMergeManager}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Merge Manager</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {mergeModalState && (
            <div className="d-flex flex-column gap-3">
              <p className="mb-0 text-muted">
                Resolve the dashed link between <strong>{mergeModalState.leftNode.label}</strong> and{' '}
                <strong>{mergeModalState.rightNode.label}</strong>.
              </p>

              <div className="d-flex flex-wrap gap-3">
                <Form.Check
                  type="radio"
                  id="merge-side-left"
                  name="merge-primary-side"
                  label={`Keep left as primary (${mergeModalState.leftNode.label})`}
                  checked={primaryMergeSide === 'left'}
                  onChange={() => setPrimaryMergeSide('left')}
                />
                <Form.Check
                  type="radio"
                  id="merge-side-right"
                  name="merge-primary-side"
                  label={`Keep right as primary (${mergeModalState.rightNode.label})`}
                  checked={primaryMergeSide === 'right'}
                  onChange={() => setPrimaryMergeSide('right')}
                />
              </div>

              {mergeFieldChoices.length > 0 && (
                <div className="d-flex flex-column gap-2">
                  {mergeFieldChoices.map((field) => (
                    <div key={field.key} className="border rounded p-2">
                      <strong className="d-block mb-2">{field.key}</strong>
                      <div className="d-flex flex-wrap gap-3">
                        <Form.Check
                          type="radio"
                          id={`merge-field-${field.key}-left`}
                          name={`merge-field-${field.key}`}
                          label={`Left: ${formatFieldValue(field.leftValue)}`}
                          checked={(fieldChoices[field.key] ?? primaryMergeSide) === 'left'}
                          onChange={() =>
                            setFieldChoices((current) => ({
                              ...current,
                              [field.key]: 'left',
                            }))
                          }
                        />
                        <Form.Check
                          type="radio"
                          id={`merge-field-${field.key}-right`}
                          name={`merge-field-${field.key}`}
                          label={`Right: ${formatFieldValue(field.rightValue)}`}
                          checked={(fieldChoices[field.key] ?? primaryMergeSide) === 'right'}
                          onChange={() =>
                            setFieldChoices((current) => ({
                              ...current,
                              [field.key]: 'right',
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <small className="text-muted">
                Rejecting marks this dashed link invalid and removes it from the graph.
                Merging removes the dashed link and reconciles connected links onto the kept entity.
              </small>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeMergeManager}>
            Cancel
          </Button>
          <Button variant="outline-danger" onClick={rejectMerge}>
            Reject Merge
          </Button>
          <Button variant="primary" onClick={applyMerge}>
            Merge with Cherry-Pick
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
};

export default ConnectedGraphWorkspace;
