/**
 * Sync Configuration Component for Homicide Media Tracker
 *
 * This component allows users to configure remote LibSQL database
 * synchronization for when network connectivity is available.
 * It also provides a localhost connector so users can point the app
 * at a local server endpoint and verify reachability via health checks.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Form, Alert, Spinner, Modal, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';

const LOCAL_SERVER_URL_KEY = 'hmt.local-server-url';
const HEALTH_CHECK_TIMEOUT_MS = 5000;

interface SyncConfig {
  enabled: boolean;
  remoteUrl: string | null;
  conflictResolution: 'local' | 'remote' | 'manual';
  syncInterval: number;
  lastSync: string | null;
}

type LocalServerStatus = 'idle' | 'checking' | 'reachable' | 'unreachable';

interface LocalServerDiagnostics {
  latencyMs: number | null;
  statusCode: number | null;
  checkedAt: string | null;
  error: string | null;
}

const SyncConfiguration: React.FC = () => {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [remoteUrl, setRemoteUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [syncInterval, setSyncInterval] = useState(15);
  const [conflictResolution, setConflictResolution] = useState<
    'local' | 'remote' | 'manual'
  >('local');

  // Localhost connector state
  const [localServerUrl, setLocalServerUrl] = useState('http://localhost:8080');
  const [localServerUrlInput, setLocalServerUrlInput] = useState('http://localhost:8080');
  const [localServerStatus, setLocalServerStatus] = useState<LocalServerStatus>('idle');
  const [localServerDiag, setLocalServerDiag] = useState<LocalServerDiagnostics>({
    latencyMs: null,
    statusCode: null,
    checkedAt: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/sync');
      if (!response.ok) {
        throw new Error('Failed to fetch sync configuration');
      }
      const data = await response.json();

      if (data.success) {
        setConfig(data.data);
        // Update form state
        setRemoteUrl(data.data.remoteUrl || '');
        setSyncInterval(data.data.syncInterval);
        setConflictResolution(data.data.conflictResolution);
      }
    } catch (error) {
      console.error('Failed to fetch sync config:', error);
      toast.error('Failed to load sync configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remoteUrl,
          authToken: authToken || undefined,
          syncInterval,
          conflictResolution,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Sync configuration saved successfully');
        setShowModal(false);
        await fetchConfig(); // Refresh config
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Save config error:', error);
      toast.error('Failed to save sync configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDisableSync = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/sync', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Sync disabled successfully');
        await fetchConfig(); // Refresh config
      } else {
        toast.error(data.error || 'Failed to disable sync');
      }
    } catch (error) {
      console.error('Disable sync error:', error);
      toast.error('Failed to disable sync');
    } finally {
      setSaving(false);
    }
  };

  // ── Localhost connector helpers ─────────────────────────────────────────────

  const loadSavedLocalServerUrl = () => {
    try {
      const saved = localStorage.getItem(LOCAL_SERVER_URL_KEY);
      if (saved) {
        setLocalServerUrl(saved);
        setLocalServerUrlInput(saved);
      }
    } catch {
      // localStorage may be unavailable (SSR, private browsing, etc.)
    }
  };

  const handleSaveLocalServerUrl = () => {
    const trimmed = localServerUrlInput.trim();
    if (!trimmed) return;
    setLocalServerUrl(trimmed);
    try {
      localStorage.setItem(LOCAL_SERVER_URL_KEY, trimmed);
    } catch {
      // ignore storage errors
    }
    toast.success('Local server URL saved');
  };

  const handleCheckLocalServer = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    setLocalServerStatus('checking');
    setLocalServerDiag({ latencyMs: null, statusCode: null, checkedAt: null, error: null });

    const t0 = Date.now();
    try {
      const response = await fetch(localServerUrl, {
        signal: controller.signal,
        method: 'GET',
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;
      setLocalServerStatus('reachable');
      setLocalServerDiag({
        latencyMs,
        statusCode: response.status,
        checkedAt: new Date().toISOString(),
        error: null,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;
      const isTimeout =
        err instanceof DOMException && err.name === 'AbortError';
      setLocalServerStatus('unreachable');
      setLocalServerDiag({
        latencyMs,
        statusCode: null,
        checkedAt: new Date().toISOString(),
        error: isTimeout
          ? `Connection timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`
          : err instanceof Error
            ? err.message
            : 'Unknown error',
      });
    }
  };

  useEffect(() => {
    fetchConfig();
    loadSavedLocalServerUrl();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <Card.Body className="d-flex align-items-center">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading sync configuration...
        </Card.Body>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Card.Header>
          <h5 className="mb-0">
            <i className="bi bi-cloud-arrow-up me-2"></i>
            Remote Sync Configuration
          </h5>
        </Card.Header>
        <Card.Body>
          {config?.enabled ? (
            <div>
              <Alert variant="success">
                <strong>Sync Enabled:</strong> This database is configured to
                sync with a remote server.
              </Alert>

              <div className="row">
                <div className="col-md-8">
                  <div className="mb-2">
                    <strong>Remote URL:</strong> <code>{config.remoteUrl}</code>
                  </div>
                  <div className="mb-2">
                    <strong>Sync Interval:</strong> {config.syncInterval}{' '}
                    minutes
                  </div>
                  <div className="mb-2">
                    <strong>Conflict Resolution:</strong>{' '}
                    <span className="badge bg-info">
                      {config.conflictResolution}
                    </span>
                  </div>
                  {config.lastSync && (
                    <div className="mb-2">
                      <strong>Last Sync:</strong>{' '}
                      {new Date(config.lastSync).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="col-md-4">
                  <div className="d-grid gap-2">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setShowModal(true)}
                    >
                      <i className="bi bi-gear me-1"></i>
                      Configure
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={handleDisableSync}
                      disabled={saving}
                    >
                      <i className="bi bi-x-circle me-1"></i>
                      Disable Sync
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Alert variant="warning">
                <strong>Sync Disabled:</strong> This database is operating in
                local-only mode.
              </Alert>
              <p className="text-muted">
                Enable sync to connect with a remote LibSQL server for data
                sharing and backup. This is useful when network connectivity is
                available and you want to share data with other researchers or
                backup to a central server.
              </p>
              <Button variant="primary" onClick={() => setShowModal(true)}>
                <i className="bi bi-cloud-plus me-1"></i>
                Configure Remote Sync
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Localhost Connector */}
      <Card className="mt-3">
        <Card.Header>
          <h5 className="mb-0">
            <i className="bi bi-hdd-network me-2"></i>
            Local Server Connectivity
          </h5>
        </Card.Header>
        <Card.Body>
          <p className="text-muted small mb-3">
            Configure and verify connectivity to a local server endpoint (e.g.
            a locally-running AtoM instance or a development API server).
          </p>

          {/* URL configuration row */}
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Local Server URL</Form.Label>
            <div className="d-flex gap-2">
              <Form.Control
                type="url"
                value={localServerUrlInput}
                onChange={(e) => setLocalServerUrlInput(e.target.value)}
                placeholder="http://localhost:8080"
              />
              <Button
                variant="outline-secondary"
                onClick={handleSaveLocalServerUrl}
                disabled={!localServerUrlInput.trim()}
              >
                Save
              </Button>
            </div>
            <Form.Text className="text-muted">
              The base URL of the local server (protocol + host + port).
            </Form.Text>
          </Form.Group>

          {/* Health check row */}
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleCheckLocalServer}
              disabled={localServerStatus === 'checking' || !localServerUrl}
            >
              {localServerStatus === 'checking' ? (
                <>
                  <Spinner animation="border" size="sm" className="me-1" />
                  Checking&hellip;
                </>
              ) : (
                <>
                  <i className="bi bi-activity me-1"></i>
                  Check Connection
                </>
              )}
            </Button>

            {localServerStatus === 'idle' && (
              <Badge bg="secondary">Not checked</Badge>
            )}
            {localServerStatus === 'checking' && (
              <Badge bg="warning" text="dark">Checking&hellip;</Badge>
            )}
            {localServerStatus === 'reachable' && (
              <Badge bg="success">
                <i className="bi bi-check-circle me-1"></i>
                Reachable
              </Badge>
            )}
            {localServerStatus === 'unreachable' && (
              <Badge bg="danger">
                <i className="bi bi-x-circle me-1"></i>
                Unreachable
              </Badge>
            )}
          </div>

          {/* Diagnostics panel */}
          {localServerDiag.checkedAt && (
            <div className="mt-3 p-2 border rounded bg-light small">
              <div className="fw-semibold mb-1">Connection Diagnostics</div>
              <div>
                <strong>Endpoint:</strong> <code>{localServerUrl}</code>
              </div>
              {localServerDiag.statusCode !== null && (
                <div>
                  <strong>HTTP Status:</strong>{' '}
                  <span
                    className={
                      localServerDiag.statusCode >= 200 &&
                      localServerDiag.statusCode < 300
                        ? 'text-success'
                        : 'text-warning'
                    }
                  >
                    {localServerDiag.statusCode}
                  </span>
                </div>
              )}
              {localServerDiag.latencyMs !== null && (
                <div>
                  <strong>Latency:</strong> {localServerDiag.latencyMs} ms
                </div>
              )}
              <div>
                <strong>Checked at:</strong>{' '}
                {new Date(localServerDiag.checkedAt).toLocaleString()}
              </div>
              {localServerDiag.error && (
                <Alert variant="danger" className="mt-2 mb-0 py-1 px-2">
                  {localServerDiag.error}
                </Alert>
              )}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Configuration Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Configure Remote Sync</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSaveConfig}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Remote LibSQL URL *</Form.Label>
              <Form.Control
                type="url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="libsql://your-database-url.turso.io"
                required
              />
              <Form.Text className="text-muted">
                The URL of your remote LibSQL/Turso database
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Auth Token</Form.Label>
              <Form.Control
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Optional authentication token"
              />
              <Form.Text className="text-muted">
                Leave empty if your database doesn&rsquo;t require
                authentication
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Sync Interval (minutes)</Form.Label>
              <Form.Control
                type="number"
                value={syncInterval}
                onChange={(e) => setSyncInterval(parseInt(e.target.value))}
                min="5"
                max="1440"
              />
              <Form.Text className="text-muted">
                How often to automatically sync with the remote database
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Conflict Resolution</Form.Label>
              <Form.Select
                value={conflictResolution}
                onChange={(e) =>
                  setConflictResolution(
                    e.target.value as 'local' | 'remote' | 'manual',
                  )
                }
              >
                <option value="local">Local wins (keep local changes)</option>
                <option value="remote">
                  Remote wins (accept remote changes)
                </option>
                <option value="manual">Manual resolution required</option>
              </Form.Select>
              <Form.Text className="text-muted">
                How to handle conflicts when the same data is modified locally
                and remotely
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (
                <>
                  <Spinner animation="border" size="sm" className="me-1" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

export default SyncConfiguration;
