'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Button,
  Row,
  Col,
  Navbar,
  Nav,
  Badge,
  Spinner,
} from 'react-bootstrap';
import InputHomicide from '@/lib/components/input-homicide';
import ListHomicides, { type DetailedEvent } from '@/lib/components/list-homicides';
import ConnectedGraphWorkspace from '@/lib/components/connected-graph-workspace';
import ParticipantMergeQueue from '@/lib/components/participant-merge-queue';
import ConflictResolutionQueue from '@/lib/components/conflict-resolution-queue';
import SchemaProfileAdmin from '@/lib/components/schema-profile-admin';
import SysInfo from '@/lib/components/system-information';
import {
  OFFLINE_SYNC_TAG,
  readOfflineQueueCount,
  hasSyncManager,
} from '@/lib/utils/cache-manager';

type Views =
  | 'home'
  | 'workspace'
  | 'merge'
  | 'conflicts'
  | 'profiles'
  | 'info';
type WorkspaceMode = 'form' | 'graph';

export default function Home() {
  const [currentView, setCurrentView] = useState<Views>('home');
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('form');
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [loadedCases, setLoadedCases] = useState<DetailedEvent[]>([]);

  useEffect(() => {
    readOfflineQueueCount().then(setQueueCount);

    const handleOnline = async () => {
      setIsOnline(true);
      setQueueCount(await readOfflineQueueCount());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(async () => {
      setQueueCount(await readOfflineQueueCount());
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  /**
   * Trigger a Background Sync registration so the service worker drains the
   * offline queue. No-ops when offline or already replaying. Errors are
   * swallowed intentionally — the service worker will retry automatically
   * when conditions allow.
   */
  const handleNavSync = async () => {
    if (!isOnline || replaying) return;
    setReplaying(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (hasSyncManager(reg)) {
          await reg.sync.register(OFFLINE_SYNC_TAG);
        }
      }
      setQueueCount(await readOfflineQueueCount());
    } catch {
      // ignore — sync will retry automatically
    } finally {
      setReplaying(false);
    }
  };

  const renderContent = () => {
    if (currentView === 'home') {
      return (
        <div className="text-center py-5">
          <div className="mb-4">
            <h1 className="display-3 fw-bold text-primary mb-3">
              NEWS REPORT TRACKER
            </h1>
            <p className="lead text-muted">
              Research tool for tracking and analysing news reports
            </p>
          </div>

          <Row className="justify-content-center">
            <Col md={8}>
              <Card className="shadow-sm">
                <Card.Body className="p-4">
                  <h3 className="mb-3">Quick Actions</h3>
                  <div className="d-grid gap-3">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => {
                        setWorkspaceMode('form');
                        setCurrentView('workspace');
                      }}
                    >
                      Open Entry Workspace
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="lg"
                      onClick={() => {
                        setWorkspaceMode('graph');
                        setCurrentView('workspace');
                      }}
                    >
                      Open Event Ledger + Graph
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="lg"
                      onClick={() => setCurrentView('merge')}
                    >
                      Manage Participant Merge Queue
                    </Button>
                    <Button
                      variant="outline-warning"
                      size="lg"
                      onClick={() => setCurrentView('conflicts')}
                    >
                      Resolve Sync Conflicts
                    </Button>
                    <Button
                      variant="outline-dark"
                      size="lg"
                      onClick={() => setCurrentView('profiles')}
                    >
                      Manage Schema Profiles
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>
      );
    }

    if (currentView === 'workspace') {
      return (
        <section className="workspace-shell">
          <div className="workspace-header">
            <div>
              <h2 className="workspace-title">Homicide Workspace</h2>
              <p className="workspace-subtitle mb-0">
                Stitch-aligned entry, ledger, and connected graph workflow
              </p>
            </div>
            <Button
              variant="outline-secondary"
              onClick={() => setCurrentView('home')}
              className="workspace-back-button"
            >
              Back to Home
            </Button>
          </div>

          <div
            className="workspace-mode-switch"
            role="tablist"
            aria-label="Workspace mode"
            onKeyDown={(event) => {
              if (!(event.target instanceof HTMLButtonElement)) {
                return;
              }
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                setWorkspaceMode((previousMode) =>
                  previousMode === 'form' ? 'graph' : 'form',
                );
              }
            }}
          >
            <Button
              role="tab"
              aria-selected={workspaceMode === 'form'}
              variant={workspaceMode === 'form' ? 'primary' : 'outline-primary'}
              onClick={() => setWorkspaceMode('form')}
            >
              Form
            </Button>
            <Button
              role="tab"
              aria-selected={workspaceMode === 'graph'}
              variant={workspaceMode === 'graph' ? 'primary' : 'outline-primary'}
              onClick={() => setWorkspaceMode('graph')}
            >
              Graph
            </Button>
          </div>

          <Row className="g-3 align-items-stretch">
            <Col lg={workspaceMode === 'form' ? 8 : 7}>
              <Card className="workspace-surface h-100">
                <Card.Header className="workspace-surface-header">
                  <h3 className="workspace-surface-title mb-0">
                    {workspaceMode === 'form'
                      ? 'Entry Workspace'
                      : 'Event Ledger'}
                  </h3>
                </Card.Header>
                <Card.Body>
                  {workspaceMode === 'form' ? (
                    <InputHomicide embedded />
                  ) : (
                    <ListHomicides
                      embedded
                      selectedCaseIds={selectedCaseIds}
                      onSelectedCaseIdsChange={setSelectedCaseIds}
                      onCasesLoaded={setLoadedCases}
                    />
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col lg={workspaceMode === 'form' ? 4 : 5}>
              {workspaceMode === 'form' ? (
                <Card className="workspace-surface h-100">
                  <Card.Header className="workspace-surface-header">
                    <h3 className="workspace-surface-title mb-0">
                      Workspace Queue
                    </h3>
                  </Card.Header>
                  <Card.Body className="d-flex flex-column gap-3">
                    <div className="workspace-queue-item">
                      <strong>Offline Sync Queue</strong>
                      <Badge bg="warning" text="dark">
                        {queueCount}
                      </Badge>
                    </div>
                    <div className="workspace-queue-item">
                      <strong>Selection Queue</strong>
                      <Badge bg="dark">{selectedCaseIds.length}</Badge>
                    </div>
                    <Button
                      variant="outline-primary"
                      onClick={() => setWorkspaceMode('graph')}
                    >
                      Go to Graph Mode
                    </Button>
                  </Card.Body>
                </Card>
              ) : (
                <ConnectedGraphWorkspace
                  cases={loadedCases}
                  selectedCaseIds={selectedCaseIds}
                  onSelectedCaseIdsChange={setSelectedCaseIds}
                />
              )}
            </Col>
          </Row>
        </section>
      );
    }

    if (currentView === 'merge') {
      return <ParticipantMergeQueue onBack={() => setCurrentView('home')} />;
    }

    if (currentView === 'conflicts') {
      return <ConflictResolutionQueue onBack={() => setCurrentView('home')} />;
    }

    if (currentView === 'profiles') {
      return <SchemaProfileAdmin onBack={() => setCurrentView('home')} />;
    }

    if (currentView === 'info') {
      return <SysInfo onBack={() => setCurrentView('home')} />;
    }
  };

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-0">
        <Container>
          <Navbar.Brand href="#" onClick={() => setCurrentView('home')}>
            News Report Tracker
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse>
            <Nav className="me-auto">
              <Nav.Link
                href="#"
                onClick={() => setCurrentView('home')}
                className={currentView === 'home' ? 'active' : ''}
              >
                Home
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => {
                  setWorkspaceMode('form');
                  setCurrentView('workspace');
                }}
                className={
                  currentView === 'workspace' && workspaceMode === 'form'
                    ? 'active'
                    : ''
                }
              >
                Entry Workspace
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => {
                  setWorkspaceMode('graph');
                  setCurrentView('workspace');
                }}
                className={
                  currentView === 'workspace' && workspaceMode === 'graph'
                    ? 'active'
                    : ''
                }
              >
                Event Ledger + Graph
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => setCurrentView('merge')}
                className={currentView === 'merge' ? 'active' : ''}
              >
                Merge Queue
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => setCurrentView('conflicts')}
                className={currentView === 'conflicts' ? 'active' : ''}
              >
                Conflict Queue
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => setCurrentView('profiles')}
                className={currentView === 'profiles' ? 'active' : ''}
              >
                Schema Profiles
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => setCurrentView('info')}
                className={currentView === 'info' ? 'active' : ''}
              >
                System Information
              </Nav.Link>
            </Nav>

            {/* Offline / sync status indicator */}
            <Nav className="ms-auto align-items-center">
              {!isOnline && (
                <Nav.Item className="me-2">
                  <Badge bg="danger" className="px-2 py-1">
                    <i className="bi bi-wifi-off me-1"></i>Offline
                  </Badge>
                </Nav.Item>
              )}
              {isOnline && replaying && (
                <Nav.Item className="me-2">
                  <Badge bg="info" className="px-2 py-1">
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-1"
                      style={{ width: '0.7rem', height: '0.7rem' }}
                    />
                    Syncing
                  </Badge>
                </Nav.Item>
              )}
              {isOnline && !replaying && queueCount > 0 && (
                <Nav.Item className="me-2">
                  <Button
                    variant="warning"
                    size="sm"
                    className="py-0 px-2"
                    onClick={handleNavSync}
                    title={`${queueCount} operation${queueCount !== 1 ? 's' : ''} queued — click to sync`}
                  >
                    <i className="bi bi-cloud-arrow-up me-1"></i>
                    {queueCount} queued
                  </Button>
                </Nav.Item>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="py-4">{renderContent()}</Container>
    </>
  );
}
