'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Button, Card } from 'react-bootstrap';
import type { DetailedEvent } from './list-homicides';
import {
  GRAPH_SCALE_STEP,
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
}

const ConnectedGraphWorkspace: React.FC<ConnectedGraphWorkspaceProps> = ({
  cases,
  selectedCaseIds,
  onSelectedCaseIdsChange,
}) => {
  const [scale, setScale] = useState(1);
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
  const hardEdges = useMemo(
    () => graphModel.edges.filter((edge) => edge.style === 'hard'),
    [graphModel.edges],
  );
  const softEdges = useMemo(
    () => graphModel.edges.filter((edge) => edge.style === 'soft'),
    [graphModel.edges],
  );

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
          x: base.x + subtypeOffset,
          y: base.y,
        },
      };
    });
  }, [graphModel.nodes]);

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
          className="graph-canvas"
          tabIndex={0}
          role="region"
          aria-label="Connected graph canvas"
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
            <div className="graph-scene" role="list" aria-label="Graph entity nodes">
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
                {graphModel.edges.map((edge) => {
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
            suggestions from similarity scoring.
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
      </Card.Body>
    </Card>
  );
};

export default ConnectedGraphWorkspace;
