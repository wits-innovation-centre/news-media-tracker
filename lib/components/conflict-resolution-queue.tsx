'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Row,
  Spinner,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
  buildResolveConflictRequest,
  getOpenConflicts,
  hasResolveCapability,
  type ConflictQueuePayload,
  type ConflictRecord,
  type ConflictResolutionDecision,
} from './conflict-resolution-queue.utils';

interface ConflictResolutionQueueProps {
  onBack: () => void;
}

const jsonLabel = (value: unknown) => {
  if (value === null || typeof value === 'undefined') {
    return 'None';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseApiPayload = async (
  response: Response,
  parseErrorMessage: string,
): Promise<Record<string, unknown>> => {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    return payload;
  } catch {
    throw new Error(parseErrorMessage);
  }
};

const formatDetectedDate = (value?: string): string => {
  if (!value) {
    return 'Unknown date';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleString();
};

const ConflictResolutionQueue: React.FC<ConflictResolutionQueueProps> = ({
  onBack,
}) => {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyConflictId, setBusyConflictId] = useState<string | null>(null);
  const [expandedConflictId, setExpandedConflictId] = useState<string | null>(
    null,
  );
  const [canResolve, setCanResolve] = useState(false);

  const openConflicts = useMemo(() => getOpenConflicts(conflicts), [conflicts]);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/sync/conflicts');
      const payload = await parseApiPayload(
        response,
        'Invalid response format from server',
      );
      if (!response.ok || !payload.success) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Failed to load conflict queue',
        );
      }

      const data = (payload.data as ConflictQueuePayload | undefined) ?? {};
      setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
      setCanResolve(hasResolveCapability(data));
    } catch (loadError) {
      setConflicts([]);
      setCanResolve(false);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load conflict queue',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  const resolveConflict = async (
    conflictId: string,
    resolution: ConflictResolutionDecision,
  ) => {
    setBusyConflictId(conflictId);
    try {
      const request = buildResolveConflictRequest(conflictId, resolution);
      const response = await fetch(request.url, request.init);
      const payload = await parseApiPayload(
        response,
        'Invalid response format when resolving conflict',
      );
      if (!response.ok || !payload.success) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Failed to resolve conflict',
        );
      }
      toast.success('Conflict resolved.');
      await loadConflicts();
    } catch (resolveError) {
      const message =
        resolveError instanceof Error
          ? resolveError.message
          : 'Failed to resolve conflict';
      setError(message);
      toast.error(message);
    } finally {
      setBusyConflictId(null);
    }
  };

  return (
    <Container fluid className="py-4">
      <Row>
        <Col>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>Conflict Resolution Queue</h2>
            <div>
              <Button
                variant="outline-primary"
                className="me-2"
                onClick={loadConflicts}
                disabled={loading || Boolean(busyConflictId)}
              >
                Refresh
              </Button>
              <Button variant="outline-secondary" onClick={onBack}>
                Back to Home
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="danger">
              <strong>Error:</strong> {error}
            </Alert>
          )}

          {!canResolve && !loading && (
            <Alert variant="warning">
              You can review conflicts, but resolving requires the
              <code className="ms-1">resolve_conflicts</code> capability.
            </Alert>
          )}

          <Card className="mb-4">
            <Card.Body>
              <div className="d-flex flex-wrap gap-4">
                <div>
                  <strong>Open Conflicts:</strong> {openConflicts.length}
                </div>
                <div>
                  <strong>Resolution Access:</strong>{' '}
                  <Badge bg={canResolve ? 'success' : 'secondary'}>
                    {canResolve ? 'Authorized' : 'Read-only'}
                  </Badge>
                </div>
              </div>
            </Card.Body>
          </Card>

          {loading ? (
            <Card>
              <Card.Body className="text-center py-4">
                <Spinner animation="border" size="sm" className="me-2" />
                Loading conflict queue...
              </Card.Body>
            </Card>
          ) : openConflicts.length === 0 ? (
            <Alert variant="info">No open conflicts.</Alert>
          ) : (
            openConflicts.map((conflict) => {
              const isExpanded = expandedConflictId === conflict.id;
              const isBusy = busyConflictId === conflict.id;
              return (
                <Card key={conflict.id} className="mb-3">
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{conflict.summary || 'Conflict detected'}</strong>
                      <div className="small text-muted">
                        {conflict.recordType || 'record'}:{' '}
                        {conflict.recordId || 'unknown'} • ID: {conflict.id}
                      </div>
                    </div>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() =>
                        setExpandedConflictId(isExpanded ? null : conflict.id)
                      }
                    >
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </Button>
                  </Card.Header>
                  {isExpanded && (
                    <Card.Body>
                      <Row className="mb-3">
                        <Col md={6}>
                          <p className="mb-1">
                            <strong>Local value:</strong>
                          </p>
                          <code>{jsonLabel(conflict.localValue)}</code>
                        </Col>
                        <Col md={6}>
                          <p className="mb-1">
                            <strong>Remote value:</strong>
                          </p>
                          <code>{jsonLabel(conflict.remoteValue)}</code>
                        </Col>
                      </Row>
                      <p className="mb-1">
                        <strong>Affected fields:</strong>{' '}
                        {(conflict.fields || []).join(', ') || 'Unknown'}
                      </p>
                      {conflict.createdAt && (
                        <p className="mb-0 small text-muted">
                          Detected: {formatDetectedDate(conflict.createdAt)}
                        </p>
                      )}
                    </Card.Body>
                  )}
                  <Card.Footer className="d-flex gap-2 justify-content-end">
                    <Button
                      size="sm"
                      variant="outline-primary"
                      aria-label={`Keep local value for ${conflict.summary || 'this conflict'}`}
                      onClick={() => resolveConflict(conflict.id, 'keep_local')}
                      disabled={!canResolve || isBusy}
                    >
                      Keep Local
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      aria-label={`Keep remote value for ${conflict.summary || 'this conflict'}`}
                      onClick={() => resolveConflict(conflict.id, 'keep_remote')}
                      disabled={!canResolve || isBusy}
                    >
                      Keep Remote
                    </Button>
                  </Card.Footer>
                </Card>
              );
            })
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default ConflictResolutionQueue;
