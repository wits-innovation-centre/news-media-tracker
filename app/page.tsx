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
import ListHomicides from '@/lib/components/list-homicides';
import ParticipantMergeQueue from '@/lib/components/participant-merge-queue';
import SchemaProfileAdmin from '@/lib/components/schema-profile-admin';
import SysInfo from '@/lib/components/system-information';
import {
  OFFLINE_SYNC_TAG,
  readOfflineQueueCount,
} from '@/lib/utils/cache-manager';

type Views = 'home' | 'input' | 'list' | 'merge' | 'profiles' | 'info';

/** Minimal typing for the Background Sync API extension on ServiceWorkerRegistration. */
interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
  sync: { register: (tag: string) => Promise<void> };
}

const hasSyncManager = (
  reg: ServiceWorkerRegistration,
): reg is ServiceWorkerRegistrationWithSync =>
  'sync' in reg &&
  typeof (reg as ServiceWorkerRegistrationWithSync).sync?.register === 'function';

export default function Home() {
  const [currentView, setCurrentView] = useState<Views>('home');
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [replaying, setReplaying] = useState(false);

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
                      onClick={() => setCurrentView('input')}
                    >
                      Input New Event
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="lg"
                      onClick={() => setCurrentView('list')}
                    >
                      View Events
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="lg"
                      onClick={() => setCurrentView('merge')}
                    >
                      Manage Participant Merge Queue
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

    if (currentView === 'input') {
      return <InputHomicide onBack={() => setCurrentView('home')} />;
    }

    if (currentView === 'list') {
      return <ListHomicides onBack={() => setCurrentView('home')} />;
    }

    if (currentView === 'merge') {
      return <ParticipantMergeQueue onBack={() => setCurrentView('home')} />;
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
                onClick={() => setCurrentView('input')}
                className={currentView === 'input' ? 'active' : ''}
              >
                Input Event
              </Nav.Link>
              <Nav.Link
                href="#"
                onClick={() => setCurrentView('list')}
                className={currentView === 'list' ? 'active' : ''}
              >
                View All Events
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
