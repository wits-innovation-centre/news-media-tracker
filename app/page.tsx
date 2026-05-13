'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Badge,
  Button,
  Form,
  InputGroup,
  Nav,
  Spinner,
} from 'react-bootstrap';
import InputHomicide from '@/lib/components/input-homicide';
import ListHomicides, { type DetailedEvent } from '@/lib/components/list-homicides';
import {
  isCompletedSyncStatus,
  isDraftedSyncStatus,
} from '@/lib/components/list-homicides.utils';
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
type AnnotationStatusFilter = 'all' | 'completed' | 'drafted' | 'queued';

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
  const [annotationsRefreshKey, setAnnotationsRefreshKey] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [useSystemTheme, setUseSystemTheme] = useState(true);

  // Search/filter state shared between graph and table views
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [annotationStatusFilter, setAnnotationStatusFilter] =
    useState<AnnotationStatusFilter>('all');

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
    setUseSystemTheme(true);
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

  const handleMainViewChange = useCallback(
    (view: MainView) => {
      setMainView(view);
      if (view !== 'form' && annotationStatusFilter === 'queued') {
        setAnnotationStatusFilter('all');
      }
    },
    [annotationStatusFilter],
  );

  const cycleAnnotationStatusFilter = useCallback(() => {
    const filterSequence: AnnotationStatusFilter[] =
      mainView === 'form'
        ? ['all', 'completed', 'drafted', 'queued']
        : ['all', 'completed', 'drafted'];
    const currentIndex = filterSequence.indexOf(annotationStatusFilter);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % filterSequence.length : 0;
    setAnnotationStatusFilter(filterSequence[nextIndex]);
  }, [annotationStatusFilter, mainView]);

  const listStatusFilter = useMemo(() => {
    if (annotationStatusFilter === 'completed') {
      return 'completed' as const;
    }
    if (annotationStatusFilter === 'drafted') {
      return 'drafted' as const;
    }
    return 'all' as const;
  }, [annotationStatusFilter]);

  const graphCases = useMemo(() => {
    if (listStatusFilter === 'completed') {
      return loadedCases.filter((case_) => isCompletedSyncStatus(case_.syncStatus));
    }
    if (listStatusFilter === 'drafted') {
      return loadedCases.filter((case_) => isDraftedSyncStatus(case_.syncStatus));
    }
    return loadedCases;
  }, [listStatusFilter, loadedCases]);
  const handleRefreshQueueAndAnnotations = () => {
    setQueueRefreshKey((k) => k + 1);
    setAnnotationsRefreshKey((k) => k + 1);
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

      {/* Main content area */}
      <div className="app-body d-flex flex-grow-1 overflow-hidden">
        {mainView !== 'table' && (
          <aside className="app-sidebar border-end d-flex flex-column">
            <div className="annotation-sidebar-tools border-bottom p-3">
              <Form
                onSubmit={handleSearchSubmit}
                role="search"
                aria-label="Filter annotations"
              >
                <div className="d-flex align-items-center gap-2">
                  <InputGroup size="sm">
                    <Form.Control
                      type="search"
                      placeholder="Search"
                      value={pendingSearch}
                      onChange={(e) => setPendingSearch(e.target.value)}
                      aria-label="Search"
                    />
                    <Button type="submit" variant="outline-secondary" size="sm">
                      <i className="bi bi-search" />
                    </Button>
                  </InputGroup>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    size="sm"
                    className="px-2"
                    onClick={cycleAnnotationStatusFilter}
                    aria-label="Cycle annotation filter"
                    title={`Annotation filter: ${annotationStatusFilter}`}
                  >
                    <i className="bi bi-funnel" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    size="sm"
                    className="px-2"
                    onClick={handleRefreshQueueAndAnnotations}
                    aria-label="Refresh sidebar data"
                    title="Refresh queue and annotation data"
                  >
                    <i className="bi bi-arrow-clockwise" />
                  </Button>
                </div>
              </Form>
            </div>
            <ArticleQueue
              key={queueRefreshKey}
              onSelectArticle={handleSelectQueueArticle}
              selectedArticleId={selectedQueueArticle?.id ?? null}
            />
          </aside>
        )}

        {/* Primary content panel */}
        <main className="app-main flex-grow-1 overflow-hidden d-flex flex-column">
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
                  onClick={() => handleMainViewChange(view)}
                  aria-selected={mainView === view}
                  aria-controls={`workspace-panel-${view}`}
                >
                  {viewLabel[view]}
                </Nav.Link>
              ))}
            </Nav>
          </div>

          {(mainView === 'form' || mainView === 'graph') && (
            <div className="d-none" aria-hidden key={annotationsRefreshKey}>
              <ListHomicides
                embedded
                selectedCaseIds={selectedCaseIds}
                onSelectedCaseIdsChange={setSelectedCaseIds}
                onCasesLoaded={setLoadedCases}
                externalSearchTerm={searchTerm}
                syncStatusFilter={listStatusFilter}
              />
            </div>
          )}

          {mainView === 'form' && (
            <div
              className="p-3 overflow-auto"
              id="workspace-panel-form"
              role="tabpanel"
            >
              <InputHomicide
                embedded
                existingArticle={selectedQueueArticle}
                onSubmitSuccess={handleAnnotationSubmitted}
              />
            </div>
          )}

          {mainView === 'graph' && (
            <div
              className="p-3 h-100 overflow-auto"
              id="workspace-panel-graph"
              role="tabpanel"
            >
              {/* Connected Graph workspace — shows relationships between events */}
              <ConnectedGraphWorkspace
                cases={graphCases}
                selectedCaseIds={selectedCaseIds}
                onSelectedCaseIdsChange={setSelectedCaseIds}
              />
            </div>
          )}

          {mainView === 'table' && (
            <div
              className="p-3 h-100 overflow-auto"
              id="workspace-panel-table"
              role="tabpanel"
            >
              <ListHomicides
                key={annotationsRefreshKey}
                embedded
                selectedCaseIds={selectedCaseIds}
                onSelectedCaseIdsChange={setSelectedCaseIds}
                onCasesLoaded={setLoadedCases}
                externalSearchTerm={searchTerm}
                syncStatusFilter={listStatusFilter}
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
