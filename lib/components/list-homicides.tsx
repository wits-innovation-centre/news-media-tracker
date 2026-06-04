'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Container,
  Card,
  Table,
  Button,
  Alert,
  Form,
  Row,
  Col,
  Badge,
  Modal,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import { getApiUrl, getBaseUrl } from '../platform';
import type { Article, Event, Victim, Perpetrator } from '../db/schema';
import {
  type AnnotationSyncStatusFilter,
  compareCasesByParticipantType,
  getCaseParticipantTypes,
  isCompletedSyncStatus,
  isDraftedSyncStatus,
  matchesParticipantTypeFilter,
  participantTypeBadge,
  participantTypeLabel,
  type ParticipantTypeFilter,
  type ParticipantTypeSort,
} from './list-homicides.utils';

interface ListHomicidesProps {
  onBack?: () => void;
  embedded?: boolean;
  selectedCaseIds?: string[];
  onSelectedCaseIdsChange?: (caseIds: string[]) => void;
  onCasesLoaded?: (cases: DetailedEvent[]) => void;
  externalSearchTerm?: string;
  syncStatusFilter?: AnnotationSyncStatusFilter;
}

export interface DetailedEvent
  extends Omit<
    Event,
    'participantIds' | 'articleIds' | 'eventTypes' | 'details'
  > {
  articleData: Article | null;
  victims: Victim[];
  perpetrators: Perpetrator[];
  typeOfMurder: string;
}

interface EventsApiPayload {
  events: Event[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EventsApiResponse {
  success: boolean;
  data?: EventsApiPayload | Event | null;
  error?: string;
  message?: string;
}

interface OfflineListResponse<T> {
  success: boolean;
  data?: T[] | T | null;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  error?: string;
  message?: string;
}

const isEventsPayload = (value: unknown): value is EventsApiPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as Record<string, unknown>;
  return Array.isArray(data.events) && typeof data.total === 'number';
};

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      // ignore parse errors
    }
  }
  return [];
}

function toDetailsObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function extractArrayData<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === 'object') {
    return [payload as T];
  }
  return [];
}

async function fetchArticleById(articleId: string): Promise<Article | null> {
  if (!articleId) {
    return null;
  }
  try {
    const { get: getArticle } = (await import(
      '@/app/api/articles/offline'
    )) as {
      get: (req: Request) => Promise<OfflineListResponse<Article>>;
    };
    const req = new Request(`${getBaseUrl()}?id=${articleId}`);
    const offline = await getArticle(req);
    if (!offline.success || !offline.data) {
      return null;
    }
    return Array.isArray(offline.data)
      ? (offline.data[0] ?? null)
      : (offline.data as Article);
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function fetchVictimsByArticle(articleId: string): Promise<Victim[]> {
  if (!articleId) {
    return [];
  }
  try {
    const { get: getVictims } = (await import('@/app/api/victims/offline')) as {
      get: (req: Request) => Promise<OfflineListResponse<Victim>>;
    };
    const req = new Request(`${getBaseUrl()}?articleId=${articleId}`);
    const offline = await getVictims(req);
    return extractArrayData<Victim>(offline.data);
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function fetchPerpetratorsByArticle(
  articleId: string,
): Promise<Perpetrator[]> {
  if (!articleId) {
    return [];
  }
  try {
    const { get: getPerpetrators } = (await import(
      '@/app/api/perpetrators/offline'
    )) as {
      get: (req: Request) => Promise<OfflineListResponse<Perpetrator>>;
    };
    const req = new Request(`${getBaseUrl()}?articleId=${articleId}`);
    const offline = await getPerpetrators(req);
    return extractArrayData<Perpetrator>(offline.data);
  } catch (error) {
    console.error(error);
    return [];
  }
}

const ListHomicides: React.FC<ListHomicidesProps> = ({
  onBack,
  embedded = false,
  selectedCaseIds,
  onSelectedCaseIdsChange,
  onCasesLoaded,
  externalSearchTerm,
  syncStatusFilter = 'all',
}) => {
  const [cases, setCases] = useState<DetailedEvent[]>([]);
  const getVictimsLength = (case_: DetailedEvent) =>
    Array.isArray(case_?.victims) ? case_.victims.length : 0;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(externalSearchTerm ?? '');
  const [participantTypeFilter, setParticipantTypeFilter] =
    useState<ParticipantTypeFilter>('all');
  const [participantTypeSort, setParticipantTypeSort] =
    useState<ParticipantTypeSort>('none');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCases, setTotalCases] = useState(0);
  const [selectedCase, setSelectedCase] = useState<DetailedEvent | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Sync internal search term when external search term changes
  useEffect(() => {
    if (externalSearchTerm !== undefined) {
      setSearchTerm(externalSearchTerm);
      setCurrentPage(1);
    }
  }, [externalSearchTerm]);

  const selectedCaseIdSet = useMemo(
    () => new Set(selectedCaseIds ?? []),
    [selectedCaseIds],
  );

  const toggleCaseSelection = useCallback(
    (caseId: string) => {
      if (!onSelectedCaseIdsChange) {
        return;
      }
      const activeSelection = selectedCaseIds ?? [];
      if (activeSelection.includes(caseId)) {
        onSelectedCaseIdsChange(activeSelection.filter((id) => id !== caseId));
        return;
      }
      onSelectedCaseIdsChange([...activeSelection, caseId]);
    },
    [onSelectedCaseIdsChange, selectedCaseIds],
  );

  const itemsPerPage = 10;

  const hydrateOfflineFromHttp = useCallback(
    async (params: URLSearchParams) => {
      try {
        const response = await fetch(`${getApiUrl('/api/events')}?${params.toString()}`);
        const payload = (await response.json().catch(() => null)) as
          | EventsApiResponse
          | null;

        if (!response.ok || !payload?.success || !payload.data) {
          return;
        }

        const eventData = payload.data;
        const eventsToHydrate = isEventsPayload(eventData)
          ? eventData.events
          : [eventData as Event];

        if (eventsToHydrate.length === 0) {
          return;
        }

        const { dbm, DatabaseManagerClient } = await import('@/lib/db/client');
        if (!(dbm instanceof DatabaseManagerClient)) {
          return;
        }

        await dbm.ensureDatabaseInitialised();
        const db = dbm.getLocal();

        const normalizedEvents = eventsToHydrate.map((event) => ({
          ...event,
          eventTypes: toStringArray(event.eventTypes),
          articleIds: toStringArray(event.articleIds),
          participantIds: toStringArray(event.participantIds),
          details: toDetailsObject(event.details),
        }));

        await db.events.bulkPut(normalizedEvents);

        const articleIds = Array.from(
          new Set(
            normalizedEvents.flatMap((event) => toStringArray(event.articleIds)),
          ),
        );

        if (articleIds.length === 0) {
          return;
        }

        const articleResults = await Promise.all(
          articleIds.map(async (articleId) => {
            try {
              const articleResponse = await fetch(
                `${getApiUrl('/api/articles')}?id=${encodeURIComponent(articleId)}`,
              );
              const articlePayload = (await articleResponse
                .json()
                .catch(() => null)) as OfflineListResponse<Article> | null;
              const article = articlePayload?.success
                ? Array.isArray(articlePayload.data)
                  ? (articlePayload.data[0] ?? null)
                  : (articlePayload.data as Article | null)
                : null;

              const [victimsResponse, perpetratorsResponse] = await Promise.all([
                fetch(
                  `${getApiUrl('/api/victims')}?articleId=${encodeURIComponent(articleId)}&limit=2000&offset=0&includeMerged=true`,
                ),
                fetch(
                  `${getApiUrl('/api/perpetrators')}?articleId=${encodeURIComponent(articleId)}&limit=2000&offset=0&includeMerged=true`,
                ),
              ]);

              const victimsPayload = (await victimsResponse
                .json()
                .catch(() => null)) as OfflineListResponse<Victim> | null;
              const perpetratorsPayload = (await perpetratorsResponse
                .json()
                .catch(() => null)) as OfflineListResponse<Perpetrator> | null;

              return {
                article,
                victims: extractArrayData<Victim>(victimsPayload?.data),
                perpetrators: extractArrayData<Perpetrator>(
                  perpetratorsPayload?.data,
                ),
              };
            } catch (requestError) {
              console.error(requestError);
              return { article: null, victims: [], perpetrators: [] };
            }
          }),
        );

        const articlesToPut = articleResults
          .map((result) => result.article)
          .filter((article): article is Article => Boolean(article));
        const victimsToPut = articleResults.flatMap((result) => result.victims);
        const perpetratorsToPut = articleResults.flatMap(
          (result) => result.perpetrators,
        );

        if (articlesToPut.length > 0) {
          await db.articles.bulkPut(articlesToPut);
        }
        if (victimsToPut.length > 0) {
          await db.victims.bulkPut(victimsToPut);
        }
        if (perpetratorsToPut.length > 0) {
          await db.perpetrators.bulkPut(perpetratorsToPut);
        }
      } catch (hydrateError) {
        // Best effort only: list can still render current offline state.
        console.error(hydrateError);
      }
    },
    [],
  );

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Sync utility approach: hydrate offline storage from HTTP API first,
    // then read cases from offline storage.
    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: itemsPerPage.toString(),
      ...(searchTerm && { search: searchTerm }),
    });

    await hydrateOfflineFromHttp(params);

    let result: EventsApiResponse | null = null;
    try {
      const { get: getEvents } = await import('@/app/api/events/offline');
      const req = new Request(`${getBaseUrl()}?${params}`);
      result = await getEvents(req);
    } catch (err) {
      console.error(err);
    }

    if (result && result.success && result.data) {
      const payload = result.data;
      const events = isEventsPayload(payload)
        ? payload.events
        : [payload as Event];
      // For each event, fetch related data and assemble full case
      const assembledCases = await Promise.all(
        events.map(async (event) => {
          const articleIds = toStringArray(event.articleIds);
          const primaryArticleId = articleIds[0];

          const articleData = primaryArticleId
            ? await fetchArticleById(primaryArticleId)
            : null;

          const victims = articleData?.id
            ? await fetchVictimsByArticle(articleData.id)
            : [];

          const perpetrators = articleData?.id
            ? await fetchPerpetratorsByArticle(articleData.id)
            : [];

          const details = toDetailsObject(event.details);
          const typeOfMurder =
            typeof details.typeOfMurder === 'string'
              ? (details.typeOfMurder as string)
              : '';

          return {
            id: event.id,
            articleData,
            victims,
            perpetrators,
            syncStatus: event.syncStatus,
            failureCount: event.failureCount,
            typeOfMurder,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          };
        }),
      );
      setCases(assembledCases);
      onCasesLoaded?.(assembledCases);
      const resolvedTotalPages = isEventsPayload(payload)
        ? payload.totalPages
        : 1;
      const resolvedTotalCases = isEventsPayload(payload)
        ? payload.total
        : assembledCases.length;
      setTotalPages(resolvedTotalPages || 1);
      setTotalCases(resolvedTotalCases ?? assembledCases.length);
    } else {
      setError(result?.error || 'Failed to fetch homicide cases');
      toast.error('Failed to load homicide cases');
      onCasesLoaded?.([]);
    }
    setLoading(false);
  }, [currentPage, hydrateOfflineFromHttp, onCasesLoaded, searchTerm]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchCases();
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!window.confirm('Are you sure you want to delete this case?')) {
      return;
    }

    try {
      const response = await fetch(`/api/events?id=${caseId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete case');
      }

      toast.success('Case deleted successfully');
      fetchCases();
    } catch (err) {
      toast.error('Failed to delete case');
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) {
      return 'N/A';
    }
    const date = new Date(dateString);
    return Number.isNaN(date.getTime())
      ? 'Invalid date'
      : date.toLocaleDateString();
  };

  const showCaseDetails = (case_: DetailedEvent) => {
    setSelectedCase(case_);
    setShowDetailModal(true);
  };

  const visibleCases = useMemo(() => {
    const filtered = cases.filter((case_) => {
      if (!matchesParticipantTypeFilter(case_, participantTypeFilter)) {
        return false;
      }
      if (syncStatusFilter === 'all') {
        return true;
      }
      if (syncStatusFilter === 'completed') {
        return isCompletedSyncStatus(case_.syncStatus);
      }
      return isDraftedSyncStatus(case_.syncStatus);
    });
    if (participantTypeSort === 'none') {
      return filtered;
    }
    return [...filtered].sort((a, b) =>
      compareCasesByParticipantType(a, b, participantTypeSort),
    );
  }, [cases, participantTypeFilter, participantTypeSort, syncStatusFilter]);
  const isParticipantTypeFilterActive = participantTypeFilter !== 'all';
  const hasActiveFilters = Boolean(searchTerm) || isParticipantTypeFilterActive;
  const listCountSummaryParts = [
    `Showing ${visibleCases.length} of ${cases.length} loaded cases`,
  ];
  if (isParticipantTypeFilterActive) {
    listCountSummaryParts.push('with participant type filter applied');
  }
  if (totalCases > cases.length) {
    listCountSummaryParts.push(`(${totalCases} total cases)`);
  }
  const listCountSummary = listCountSummaryParts.join(' ');

  return (
    <Container fluid className={embedded ? 'py-0' : 'py-4'}>
      <Row>
        <Col>
          {!embedded && (
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2>Homicide Records</h2>
              <Button variant="outline-secondary" onClick={onBack}>
                Back to Home
              </Button>
            </div>
          )}

          {/* Search and Stats */}
          <Card className="mb-4">
            <Card.Body>
              <Form onSubmit={handleSearch}>
                <Row className="g-2">
                  <Col md={8}>
                    <Form.Control
                      type="text"
                      placeholder="Search cases by headline, source, victim name, province, or murder type..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </Col>
                  <Col md={4}>
                    <Button type="submit" variant="primary" disabled={loading}>
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      className="ms-2"
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                        fetchCases();
                      }}
                    >
                      Clear
                    </Button>
                  </Col>
                </Row>
                <Row className="g-2 mt-2">
                  <Col md={6}>
                    <Form.Group controlId="participantTypeFilter">
                      <Form.Label className="small mb-1">
                        Participant Type Filter
                      </Form.Label>
                      <Form.Select
                        size="sm"
                        value={participantTypeFilter}
                        onChange={(event) => {
                          setParticipantTypeFilter(
                            event.target.value as ParticipantTypeFilter,
                          );
                        }}
                      >
                        <option value="all">All Types</option>
                        <option value="victim">Victim</option>
                        <option value="perpetrator">Perpetrator</option>
                        <option value="other">Other</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="participantTypeSort">
                      <Form.Label className="small mb-1">
                        Participant Type Sort
                      </Form.Label>
                      <Form.Select
                        size="sm"
                        value={participantTypeSort}
                        onChange={(event) => {
                          setParticipantTypeSort(
                            event.target.value as ParticipantTypeSort,
                          );
                        }}
                      >
                        <option value="none">Default Order</option>
                        <option value="asc">
                          Type (Victim to Perpetrator to Other)
                        </option>
                        <option value="desc">
                          Type (Other to Perpetrator to Victim)
                        </option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
              </Form>
              <div className="mt-3">
                <small className="text-muted">{listCountSummary}</small>
              </div>
            </Card.Body>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert variant="danger" className="mb-4">
              <strong>Error:</strong> {error}
              <Button
                variant="outline-danger"
                size="sm"
                className="ms-2"
                onClick={fetchCases}
              >
                Retry
              </Button>
            </Alert>
          )}

          {/* Cases Table */}
          <Card>
            <Card.Header>
              <h5 className="mb-0">Homicide Cases</h5>
            </Card.Header>
            <Card.Body>
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-2">Loading cases...</p>
                </div>
              ) : visibleCases.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted">
                    {hasActiveFilters
                      ? 'No cases found matching your filters.'
                      : 'No homicide cases recorded yet.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <Table striped hover>
                      <thead>
                        <tr>
                          {onSelectedCaseIdsChange && <th>Select</th>}
                          <th>Date</th>
                          <th>Headline</th>
                          <th>Source</th>
                          <th>Victims</th>
                          <th>Participant Types</th>
                          <th>Murder Type</th>
                          <th>Province</th>
                          <th>Sync Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(visibleCases) &&
                          visibleCases.map((case_) => (
                            <tr key={case_.id}>
                              {onSelectedCaseIdsChange && (
                                <td>
                                  <Form.Check
                                    aria-label={`Select case ${case_.id}`}
                                    checked={
                                      Boolean(case_.id) &&
                                      selectedCaseIdSet.has(case_.id as string)
                                    }
                                    onChange={() =>
                                      case_.id && toggleCaseSelection(case_.id)
                                    }
                                  />
                                </td>
                              )}
                              <td>
                                {case_.articleData &&
                                  case_.articleData.dateOfPublication ? (
                                  formatDate(
                                    case_.articleData.dateOfPublication,
                                  )
                                ) : (
                                  <span className="text-muted">N/A</span>
                                )}
                              </td>
                              <td>
                                <div
                                  className="text-truncate"
                                  style={{ maxWidth: '200px' }}
                                >
                                  {case_.articleData &&
                                    case_.articleData.newsReportHeadline ? (
                                    case_.articleData.newsReportHeadline
                                  ) : (
                                    <span className="text-muted">N/A</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {case_.articleData &&
                                  case_.articleData.newsReportPlatform ? (
                                  case_.articleData.newsReportPlatform
                                ) : (
                                  <span className="text-muted">N/A</span>
                                )}
                              </td>
                              <td>
                                <Badge bg="info">
                                  {getVictimsLength(case_)}
                                </Badge>
                                {getVictimsLength(case_) === 1 &&
                                  Array.isArray(case_.victims) && (
                                    <div className="small text-muted">
                                      {case_.victims[0]?.victimName}
                                    </div>
                                  )}
                              </td>
                              <td>
                                {getCaseParticipantTypes(case_).map((type) => (
                                  <Badge
                                    key={`${case_.id}-${type}`}
                                    bg={participantTypeBadge[type]}
                                    className="me-1"
                                  >
                                    {participantTypeLabel[type]}
                                  </Badge>
                                ))}
                              </td>
                              <td>
                                <Badge bg="secondary" className="small">
                                  {case_.typeOfMurder}
                                </Badge>
                              </td>
                              <td>
                                {getVictimsLength(case_) > 0 &&
                                  Array.isArray(case_.victims) &&
                                  case_.victims[0]?.placeOfDeathProvince}
                              </td>
                              <td>
                                {typeof case_.syncStatus === 'string' ? (
                                  case_.syncStatus === 'failed' ? (
                                    <Badge bg="danger">Failed</Badge>
                                  ) : case_.syncStatus === 'pending' ? (
                                    <Badge bg="warning">Pending</Badge>
                                  ) : (
                                    <Badge bg="success">Synced</Badge>
                                  )
                                ) : (
                                  <Badge bg="secondary">Unknown</Badge>
                                )}
                                {typeof case_.failureCount === 'number' &&
                                  case_.failureCount >= 1 && (
                                    <span className="ms-2 small text-danger">
                                      {case_.failureCount} failed
                                    </span>
                                  )}
                              </td>
                              <td>
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  className="me-1"
                                  onClick={() => showCaseDetails(case_)}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => handleDeleteCase(case_.id!)}
                                >
                                  Delete
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="d-flex justify-content-center mt-4">
                      <Button
                        variant="outline-primary"
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className="me-2"
                      >
                        Previous
                      </Button>
                      <span className="align-self-center mx-3">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline-primary"
                        onClick={() =>
                          setCurrentPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="ms-2"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Detail Modal */}
      <Modal
        show={showDetailModal}
        onHide={() => setShowDetailModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Case Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedCase && (
            <div>
              {/* Sync Status & Actions */}
              <div className="mb-3">
                <strong>Sync Status:</strong>{' '}
                {selectedCase.syncStatus === 'failed' ? (
                  <Badge bg="danger">Failed</Badge>
                ) : selectedCase.syncStatus === 'pending' ? (
                  <Badge bg="warning">Pending</Badge>
                ) : (
                  <Badge bg="success">Synced</Badge>
                )}
                {typeof selectedCase.failureCount === 'number' &&
                  selectedCase.failureCount >= 1 && (
                    <span className="ms-2 small text-danger">
                      {selectedCase.failureCount} failed
                    </span>
                  )}
              </div>
              {selectedCase.syncStatus === 'failed' && (
                <Alert variant="danger" className="mt-2">
                  <strong>Sync Failed:</strong>{' '}
                  {selectedCase.syncStatus || 'Unknown error'}
                  <br />
                  <span>
                    Attempts:{' '}
                    {typeof selectedCase.failureCount === 'number'
                      ? selectedCase.failureCount
                      : 0}
                  </span>
                  <div className="mt-2">
                    {/* TODO: Implement retrySync and deleteSyncEntry handlers */}
                    <Button variant="outline-primary" size="sm" disabled>
                      Retry Sync
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      className="ms-2"
                      disabled
                    >
                      Delete Sync Entry
                    </Button>
                  </div>
                </Alert>
              )}
              {/* ...existing case details UI... */}
              <h5>Article Information</h5>
              <p>
                <strong>Headline:</strong>{' '}
                {selectedCase?.articleData?.newsReportHeadline}
              </p>
              <p>
                <strong>Source:</strong>{' '}
                {selectedCase?.articleData?.newsReportPlatform}
              </p>
              <p>
                <strong>Date:</strong>{' '}
                {selectedCase?.articleData?.dateOfPublication &&
                  formatDate(selectedCase.articleData.dateOfPublication)}
              </p>
              <p>
                <strong>URL:</strong>{' '}
                {selectedCase?.articleData?.newsReportUrl ? (
                  <a
                    href={selectedCase.articleData.newsReportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Article
                  </a>
                ) : (
                  <span className="text-muted">N/A</span>
                )}
              </p>
              {selectedCase?.articleData?.author && (
                <p>
                  <strong>Author:</strong> {selectedCase.articleData.author}
                </p>
              )}
              <h5 className="mt-4">
                Victims (
                {Array.isArray(selectedCase?.victims)
                  ? selectedCase.victims.length
                  : 0}
                )
              </h5>
              {Array.isArray(selectedCase?.victims) &&
                selectedCase.victims.map((victim, index) => (
                  <Card key={index} className="mb-2">
                    <Card.Body>
                      <h6>{victim.victimName}</h6>
                      <p className="mb-1">
                        <strong>Gender:</strong> {victim.genderOfVictim}
                      </p>
                      <p className="mb-1">
                        <strong>Age:</strong>{' '}
                        {victim.ageOfVictim || victim.ageRangeOfVictim}
                      </p>
                      <p className="mb-1">
                        <strong>Location:</strong> {victim.placeOfDeathTown},{' '}
                        {victim.placeOfDeathProvince}
                      </p>
                      {victim.dateOfDeath && (
                        <p className="mb-1">
                          <strong>Date of Death:</strong>{' '}
                          {formatDate(victim.dateOfDeath)}
                        </p>
                      )}
                      {victim.modeOfDeathGeneral && (
                        <p className="mb-1">
                          <strong>Mode of Death:</strong>{' '}
                          {victim.modeOfDeathGeneral}
                        </p>
                      )}
                    </Card.Body>
                  </Card>
                ))}
              <h5 className="mt-4">
                Perpetrators (
                {Array.isArray(selectedCase?.perpetrators)
                  ? selectedCase.perpetrators.length
                  : 0}
                )
              </h5>
              {Array.isArray(selectedCase?.perpetrators) &&
                selectedCase.perpetrators.map((perpetrator, index) => (
                  <Card key={index} className="mb-2">
                    <Card.Body>
                      <h6>{perpetrator.perpetratorName}</h6>
                      {perpetrator.perpetratorRelationshipToVictim && (
                        <p className="mb-1">
                          <strong>Relationship:</strong>{' '}
                          {perpetrator.perpetratorRelationshipToVictim}
                        </p>
                      )}
                      <p className="mb-1">
                        <strong>Arrested:</strong>{' '}
                        {perpetrator.suspectArrested || 'Unknown'}
                      </p>
                      <p className="mb-1">
                        <strong>Charged:</strong>{' '}
                        {perpetrator.suspectCharged || 'Unknown'}
                      </p>
                      {perpetrator.conviction && (
                        <p className="mb-1">
                          <strong>Conviction:</strong> {perpetrator.conviction}
                        </p>
                      )}
                      {perpetrator.sentence && (
                        <p className="mb-1">
                          <strong>Sentence:</strong> {perpetrator.sentence}
                        </p>
                      )}
                    </Card.Body>
                  </Card>
                ))}
              <h5 className="mt-4">Case Information</h5>
              <p>
                <strong>Type of Murder:</strong> {selectedCase?.typeOfMurder}
              </p>
              <p>
                <strong>Created:</strong>{' '}
                {selectedCase?.createdAt && formatDate(selectedCase.createdAt)}
              </p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" disabled>
            Edit
          </Button>
          <Button variant="secondary" onClick={() => setShowDetailModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default ListHomicides;
