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

  const selectedCases = cases.filter(
    (case_) => case_.id && selectedSet.has(case_.id),
  );
  const activeCases = selectedCases.length > 0 ? selectedCases : cases;
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
          <small className="text-muted">Cases and participant relationships</small>
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
            }
          }}
        >
          <div
            className="graph-canvas-inner"
            style={{ transform: `scale(${scale})` }}
            role="list"
            aria-label="Graph entity nodes"
          >
            {graphModel.nodes.map((node) => {
              return (
                <div
                  key={node.id}
                  className={`graph-node ${node.kind === 'event' ? 'is-active' : ''}`}
                  role="listitem"
                  aria-label={`${node.kind} node ${node.label}`}
                >
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <Badge
                      bg={
                        node.kind === 'article'
                          ? 'primary'
                          : node.kind === 'event'
                            ? 'success'
                            : 'secondary'
                      }
                    >
                      {node.kind}
                      {node.subtype ? `:${node.subtype}` : ''}
                    </Badge>
                    <strong>{node.label}</strong>
                  </div>
                  <small>{node.detail}</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="d-flex flex-column gap-2" aria-label="Graph edge summary">
          <small className="text-muted">
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
            <div key={edge.id} className="border rounded px-2 py-1 bg-light-subtle">
              <small>
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
