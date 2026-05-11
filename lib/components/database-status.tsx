/**
 * Database Status Component for Homicide Media Tracker
 *
 * This component displays the current database status, sync capabilities,
 * and provides controls for database operations like backup and sync.
 * It also shows offline connectivity state and the number of queued
 * operations waiting to be replayed.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
  OFFLINE_QUEUE_DB,
  OFFLINE_QUEUE_STORE,
  OFFLINE_SYNC_TAG,
  readOfflineQueueCount,
  hasSyncManager,
} from '@/lib/utils/cache-manager';

interface DatabaseStatus {
  isInitialised: boolean;
  syncEnabled: boolean;
  localPath: string;
  remoteUrl: string | null;
  error?: string;
}

interface ElectronDatabaseAPI {
  getStatus: () => Promise<DatabaseStatus>;
  sync: () => Promise<{ success: boolean; error?: string }>;
  createBackup: () => Promise<{
    success: boolean;
    backupPath?: string;
    error?: string;
  }>;
}

const getElectronDatabase = (): ElectronDatabaseAPI | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const bridge = window.electron;
  if (
    bridge &&
    typeof bridge === 'object' &&
    'database' in bridge &&
    bridge.database
  ) {
    return bridge.database as ElectronDatabaseAPI;
  }
  return null;
};

interface QueuedOperation {
  id: number;
  requestId?: string;
  method: string;
  endpoint: string;
  body?: unknown;
}

/**
 * Replay queued offline operations directly against the PATCH /api/sync
 * endpoint (fallback for when the Background Sync API is unavailable).
 *
 * Reads all pending entries from the IndexedDB offline queue, submits them
 * as a batch to `/api/sync` (PATCH), and deletes the acknowledged entries
 * from the store. Any IndexedDB or network error resolves silently so the
 * UI always regains control — the queue is preserved for the next attempt.
 */
const replayQueueDirect = (): Promise<void> => {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    try {
      const open = window.indexedDB.open(OFFLINE_QUEUE_DB);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(OFFLINE_QUEUE_STORE);
        const getAll = store.getAll();
        getAll.onsuccess = async () => {
          const posts: QueuedOperation[] = (getAll.result as QueuedOperation[]).sort(
            (a, b) => a.id - b.id,
          );
          if (posts.length === 0) {
            db.close();
            resolve();
            return;
          }
          try {
            const response = await fetch('/api/sync', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                operations: posts.map((post) => ({
                  queueId: post.id,
                  requestId: post.requestId,
                  method: post.method,
                  endpoint: post.endpoint,
                  body: post.body,
                })),
              }),
            });
            if (response.ok) {
              const result = await response.json().catch(() => null);
              const ackedQueueIds: number[] = Array.isArray(
                result?.ackedQueueIds,
              )
                ? (result.ackedQueueIds as number[])
                : [];
              const deleteTx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
              const deleteStore = deleteTx.objectStore(OFFLINE_QUEUE_STORE);
              for (const queueId of ackedQueueIds) {
                deleteStore.delete(queueId);
              }
              deleteTx.oncomplete = () => {
                db.close();
                resolve();
              };
              deleteTx.onerror = () => {
                db.close();
                resolve();
              };
            } else {
              db.close();
              resolve();
            }
          } catch {
            db.close();
            resolve();
          }
        };
        getAll.onerror = () => {
          db.close();
          resolve();
        };
      };
      open.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
};

const DatabaseStatus: React.FC = () => {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backing, setBacking] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const refreshQueueCount = useCallback(async () => {
    const count = await readOfflineQueueCount();
    setQueueCount(count);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      // Check if we're in Electron environment
      const electronDatabase = getElectronDatabase();
      if (electronDatabase) {
        const dbStatus = await electronDatabase.getStatus();
        setStatus(dbStatus);
      } else {
        // Fallback for web environment - database is managed by API routes
        setStatus({
          isInitialised: true,
          syncEnabled: false,
          localPath: 'API Routes',
          remoteUrl: null,
        });
      }
    } catch (error) {
      console.error('Failed to fetch database status:', error);
      setStatus({
        isInitialised: false,
        syncEnabled: false,
        localPath: '',
        remoteUrl: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
    await refreshQueueCount();
  }, [refreshQueueCount]);

  const handleSync = async () => {
    const electronDatabase = getElectronDatabase();
    if (!electronDatabase) {
      toast.warn('Sync is only available in desktop mode');
      return;
    }

    setSyncing(true);
    try {
      const result = await electronDatabase.sync();
      if (result.success) {
        toast.success('Database synchronised successfully');
        await fetchStatus(); // Refresh status
      } else {
        toast.error(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Sync operation failed');
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  /** Trigger replay of offline-queued operations for the web environment. */
  const handleWebSync = async () => {
    setReplaying(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (hasSyncManager(reg)) {
          await reg.sync.register(OFFLINE_SYNC_TAG);
          toast.info('Sync scheduled — queued data will be sent automatically');
        } else {
          // Fallback: replay directly without Background Sync API
          await replayQueueDirect();
          toast.success('Queued data replayed successfully');
        }
      } else {
        await replayQueueDirect();
        toast.success('Queued data replayed successfully');
      }
      await refreshQueueCount();
    } catch (error) {
      toast.error('Failed to trigger sync');
      console.error('Web sync error:', error);
    } finally {
      setReplaying(false);
    }
  };

  const handleBackup = async () => {
    const electronDatabase = getElectronDatabase();
    if (!electronDatabase) {
      toast.warn('Backup is only available in desktop mode');
      return;
    }

    setBacking(true);
    try {
      const result = await electronDatabase.createBackup();
      if (result.success) {
        toast.success(`Backup created: ${result.backupPath}`);
      } else {
        toast.error(`Backup failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Backup operation failed');
      console.error('Backup error:', error);
    } finally {
      setBacking(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const handleOnline = async () => {
      setIsOnline(true);
      await refreshQueueCount();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Refresh status and queue count every 30 seconds
    const interval = setInterval(fetchStatus, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [fetchStatus, refreshQueueCount]);

  if (loading) {
    return (
      <Card>
        <Card.Body className="d-flex align-items-center">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading database status...
        </Card.Body>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <Card.Body>
          <Alert variant="danger">Failed to load database status</Alert>
        </Card.Body>
      </Card>
    );
  }

  const isElectronMode = !!getElectronDatabase();

  return (
    <Card>
      <Card.Header>
        <h5 className="mb-0">
          <i className="bi bi-database me-2"></i>
          Database Status
        </h5>
      </Card.Header>
      <Card.Body>
        <div className="row">
          <div className="col-md-8">
            <div className="mb-3">
              <strong>Connection:</strong>{' '}
              {isOnline ? (
                <Badge bg="success">
                  <i className="bi bi-wifi me-1"></i>Connected
                </Badge>
              ) : (
                <Badge bg="danger">
                  <i className="bi bi-wifi-off me-1"></i>Offline
                </Badge>
              )}
              {replaying && (
                <Badge bg="info" className="ms-2">
                  <Spinner animation="border" size="sm" className="me-1" />
                  Replaying
                </Badge>
              )}
              {!replaying && queueCount > 0 && (
                <Badge bg="warning" text="dark" className="ms-2">
                  <i className="bi bi-hourglass-split me-1"></i>
                  {queueCount} queued
                </Badge>
              )}
            </div>

            <div className="mb-3">
              <strong>Status:</strong>{' '}
              {status.isInitialised ? (
                <Badge bg="success">Initialised</Badge>
              ) : (
                <Badge bg="danger">Not Initialised</Badge>
              )}
            </div>

            <div className="mb-3">
              <strong>Local Database:</strong>{' '}
              <code className="small">{status.localPath}</code>
            </div>

            <div className="mb-3">
              <strong>Remote Sync:</strong>{' '}
              {status.syncEnabled ? (
                <>
                  <Badge bg="success">Enabled</Badge>
                  <div className="mt-1">
                    <small className="text-muted">
                      Remote: {status.remoteUrl || 'Not configured'}
                    </small>
                  </div>
                </>
              ) : (
                <Badge bg="secondary">Disabled</Badge>
              )}
            </div>

            {status.error && (
              <Alert variant="warning" className="small">
                {status.error}
              </Alert>
            )}
          </div>

          <div className="col-md-4">
            <div className="d-grid gap-2">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={fetchStatus}
                disabled={loading}
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                Refresh
              </Button>

              {status.syncEnabled && isElectronMode && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-cloud-arrow-up me-1"></i>
                      Sync Now
                    </>
                  )}
                </Button>
              )}

              {!isElectronMode && (
                <Button
                  variant={queueCount > 0 ? 'warning' : 'outline-secondary'}
                  size="sm"
                  onClick={handleWebSync}
                  disabled={replaying || !isOnline}
                  title={
                    !isOnline
                      ? 'Cannot sync while offline'
                      : queueCount > 0
                        ? `Replay ${queueCount} queued operation${queueCount !== 1 ? 's' : ''}`
                        : 'No queued operations'
                  }
                >
                  {replaying ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" />
                      Replaying...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-cloud-arrow-up me-1"></i>
                      Sync Queued Data
                      {queueCount > 0 && (
                        <Badge bg="dark" className="ms-1">
                          {queueCount}
                        </Badge>
                      )}
                    </>
                  )}
                </Button>
              )}

              <Button
                variant="outline-secondary"
                size="sm"
                onClick={handleBackup}
                disabled={backing || !status.isInitialised}
              >
                {backing ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Creating...
                  </>
                ) : (
                  <>
                    <i className="bi bi-file-earmark-arrow-down me-1"></i>
                    Backup
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default DatabaseStatus;
