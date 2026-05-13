'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Col,
  Form,
  InputGroup,
  Nav,
  Row,
  Spinner,
} from 'react-bootstrap';
import InputHomicide from '@/lib/components/input-homicide';
import ListHomicides, { type DetailedEvent } from '@/lib/components/list-homicides';
import ConnectedGraphWorkspace from '@/lib/components/connected-graph-workspace';
import ArticleQueue, { type QueueArticle } from '@/lib/components/article-queue';
import SettingsPanel from '@/lib/components/settings-panel';
import {
  OFFLINE_SYNC_TAG,
  readOfflineQueueCount,
  hasSyncManager,
} from '@/lib/utils/cache-manager';

type MainView = 'form' | 'graph' | 'table';
type ThemeMode = 'light' | 'dark';

export default function Home() {
  const [mainView, setMainView] = useState<MainView>('form');
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [loadedCases, setLoadedCases] = useState<DetailedEvent[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedQueueArticle, setSelectedQueueArticle] =
    useState<QueueArticle | null>(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [useSystemTheme, setUseSystemTheme] = useState(true);

  // Search/filter state shared between graph and table views
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');

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

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('workspace-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setThemeMode(savedTheme);
      setUseSystemTheme(false);
      return;
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setThemeMode(prefersDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (!useSystemTheme) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setThemeMode(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [useSystemTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    if (useSystemTheme) {
      window.localStorage.removeItem('workspace-theme');
    } else {
      window.localStorage.setItem('workspace-theme', themeMode);
    }
  }, [themeMode, useSystemTheme]);

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

  const handleSelectQueueArticle = useCallback((article: QueueArticle) => {
    setSelectedQueueArticle(article);
    setMainView('form');
  }, []);

  const handleAnnotationSubmitted = useCallback(() => {
    setSelectedQueueArticle(null);
    setQueueRefreshKey((k) => k + 1);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(pendingSearch);
  };

  const viewLabel: Record<MainView, string> = {
    form: 'Form',
    graph: 'Graph',
    table: 'Table',
  };
  const nextThemeMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';

  return (
    <div className="app-shell d-flex flex-column vh-100">
      {/* Minimal top navbar */}
      <header className="app-topbar d-flex align-items-center px-3 py-2 border-bottom">
        <span className="app-topbar-brand fw-bold me-4">
          News Report Tracker
        </span>
        <div className="me-auto" />

        {/* Search/filter — affects graph and table */}
        {(mainView === 'graph' || mainView === 'table') && (
          <Form
            className="d-flex me-3"
            onSubmit={handleSearchSubmit}
            style={{ maxWidth: '320px' }}
            role="search"
            aria-label="Filter events"
          >
            <InputGroup size="sm">
              <Form.Control
                type="search"
                placeholder="Search events…"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                aria-label="Search events"
              />
              <Button type="submit" variant="outline-secondary" size="sm">
                <i className="bi bi-search" />
              </Button>
              {searchTerm && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    setPendingSearch('');
                    setSearchTerm('');
                  }}
                  aria-label="Clear search"
                >
                  <i className="bi bi-x" />
                </Button>
              )}
            </InputGroup>
          </Form>
        )}

        {/* Status indicators */}
        <div className="d-flex align-items-center gap-2">
          {!isOnline && (
            <Badge bg="danger" className="px-2 py-1">
              <i className="bi bi-wifi-off me-1" />
              Offline
            </Badge>
          )}
          {isOnline && replaying && (
            <Badge bg="info" className="px-2 py-1">
              <Spinner
                animation="border"
                size="sm"
                className="me-1"
                style={{ width: '0.7rem', height: '0.7rem' }}
              />
              Syncing
            </Badge>
          )}
          {isOnline && !replaying && queueCount > 0 && (
            <Button
              variant="warning"
              size="sm"
              className="py-0 px-2"
              onClick={handleNavSync}
              title={`${queueCount} operation${queueCount !== 1 ? 's' : ''} queued — click to sync`}
            >
              <i className="bi bi-cloud-arrow-up me-1" />
              {queueCount} queued
            </Button>
          )}

          <Button
            variant="outline-secondary"
            size="sm"
            className="topbar-icon-button py-1 px-2"
            onClick={() => {
              if (useSystemTheme) setUseSystemTheme(false);
              setThemeMode(nextThemeMode);
            }}
            title={`Switch to ${nextThemeMode} theme`}
            aria-label={`Switch to ${nextThemeMode} theme`}
          >
            <i className={`bi ${themeMode === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} />
          </Button>

          {/* Settings gear */}
          <Button
            variant="outline-secondary"
            size="sm"
            className="topbar-icon-button py-1 px-2"
            onClick={() => setShowSettings(true)}
            title="Configuration &amp; Administration"
            aria-label="Open settings"
          >
            <i className="bi bi-gear" />
          </Button>
        </div>
      </header>

      {/* View tabs */}
      <div className="app-view-tabs border-bottom px-3">
        <Nav
          className="view-toggle"
          as="nav"
          role="tablist"
          aria-label="Form | Graph | Table workspace"
        >
          {(['form', 'graph', 'table'] as MainView[]).map((view) => (
            <Nav.Link
              key={view}
              as="button"
              type="button"
              role="tab"
              className={`view-toggle-link${mainView === view ? ' active' : ''}`}
              onClick={() => setMainView(view)}
              aria-selected={mainView === view}
              aria-controls={`workspace-panel-${view}`}
            >
              {viewLabel[view]}
            </Nav.Link>
          ))}
        </Nav>
      </div>

      {/* Main content area */}
      <div className="app-body d-flex flex-grow-1 overflow-hidden">
        {/* Sidebar — article queue */}
        <aside className="app-sidebar border-end d-flex flex-column">
          <ArticleQueue
            key={queueRefreshKey}
            onSelectArticle={handleSelectQueueArticle}
            selectedArticleId={selectedQueueArticle?.id ?? null}
          />
        </aside>

        {/* Primary content panel */}
        <main className="app-main flex-grow-1 overflow-auto">
          {mainView === 'form' && (
            <div className="p-3" id="workspace-panel-form" role="tabpanel">
              <InputHomicide
                embedded
                existingArticle={selectedQueueArticle}
                onSubmitSuccess={handleAnnotationSubmitted}
              />
            </div>
          )}

          {mainView === 'graph' && (
            <Row className="g-0 h-100" id="workspace-panel-graph" role="tabpanel">
              <Col lg={5} className="h-100 border-end overflow-auto p-3">
                <ListHomicides
                  embedded
                  selectedCaseIds={selectedCaseIds}
                  onSelectedCaseIdsChange={setSelectedCaseIds}
                  onCasesLoaded={setLoadedCases}
                  externalSearchTerm={searchTerm}
                />
              </Col>
              <Col lg={7} className="h-100 overflow-auto p-3">
                {/* Connected Graph workspace — shows relationships between events */}
                <ConnectedGraphWorkspace
                  cases={loadedCases}
                  selectedCaseIds={selectedCaseIds}
                  onSelectedCaseIdsChange={setSelectedCaseIds}
                />
              </Col>
            </Row>
          )}

          {mainView === 'table' && (
            <div className="p-3" id="workspace-panel-table" role="tabpanel">
              <ListHomicides
                embedded
                selectedCaseIds={selectedCaseIds}
                onSelectedCaseIdsChange={setSelectedCaseIds}
                onCasesLoaded={setLoadedCases}
                externalSearchTerm={searchTerm}
              />
            </div>
          )}
        </main>
      </div>

      {/* Settings modal */}
      <SettingsPanel
        show={showSettings}
        onHide={() => setShowSettings(false)}
      />
    </div>
  );
}
