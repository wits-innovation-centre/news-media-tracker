'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge, Button, Spinner } from 'react-bootstrap';
import { getBaseUrl } from '../platform';
import type { Article } from '../db/schema';
import type { ArticleFormValues } from './article-form';

export interface QueueArticle {
  id: string;
  headline: string | null;
  platform: string | null;
  dateOfPublication: string | null;
  author: string | null;
  formValues: Partial<ArticleFormValues>;
}

interface ArticleQueueProps {
  onSelectArticle: (article: QueueArticle) => void;
  selectedArticleId?: string | null;
  onCountChange?: (count: number) => void;
}

interface OfflineListResponse<T> {
  success: boolean;
  data?: T[] | T | null;
  pagination?: { total: number; limit: number; offset: number; hasMore: boolean };
  error?: string;
  message?: string;
}

interface EventRecord {
  id?: string;
  articleIds?: unknown;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      // ignore
    }
  }
  return [];
}

function toQueueArticle(article: Article): QueueArticle {
  return {
    id: article.id,
    headline: article.newsReportHeadline ?? null,
    platform: article.newsReportPlatform ?? null,
    dateOfPublication: article.dateOfPublication ?? null,
    author: article.author ?? null,
    formValues: {
      newsReportUrl: article.newsReportUrl ?? '',
      newsReportHeadline: article.newsReportHeadline ?? '',
      dateOfPublication: article.dateOfPublication ?? '',
      author: article.author ?? '',
      wireService: article.wireService ?? '',
      language: article.language ?? '',
      typeOfSource: article.typeOfSource ?? '',
      newsReportPlatform: article.newsReportPlatform ?? '',
      notes: article.notes ?? '',
    },
  };
}

const ArticleQueue: React.FC<ArticleQueueProps> = ({
  onSelectArticle,
  selectedArticleId,
  onCountChange,
}) => {
  const [unannotated, setUnannotated] = useState<QueueArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { get: getArticles } = (await import(
        '@/app/api/articles/offline'
      )) as { get: (req: Request) => Promise<OfflineListResponse<Article>> };
      const articlesReq = new Request(
        `${getBaseUrl()}?limit=200`,
      );
      const articlesRes = await getArticles(articlesReq);

      const allArticles: Article[] = [];
      if (articlesRes.success && articlesRes.data) {
        if (Array.isArray(articlesRes.data)) {
          allArticles.push(...articlesRes.data);
        } else {
          allArticles.push(articlesRes.data as Article);
        }
      }

      const { get: getEvents } = (await import(
        '@/app/api/events/offline'
      )) as {
        get: (req: Request) => Promise<{
          success: boolean;
          data?: { events?: EventRecord[] } | EventRecord | null;
        }>;
      };
      const eventsReq = new Request(`${getBaseUrl()}?limit=1000`);
      const eventsRes = await getEvents(eventsReq);

      const annotatedIds = new Set<string>();
      if (eventsRes.success && eventsRes.data) {
        const payload = eventsRes.data;
        const eventList: EventRecord[] =
          'events' in (payload as object) &&
          Array.isArray((payload as { events?: unknown }).events)
            ? ((payload as { events: EventRecord[] }).events)
            : Array.isArray(payload)
              ? (payload as EventRecord[])
              : [];

        for (const event of eventList) {
          const ids = parseStringArray(event.articleIds);
          for (const id of ids) annotatedIds.add(id);
        }
      }

      const queue = allArticles
        .filter((a) => !annotatedIds.has(a.id))
        .map(toQueueArticle);

      setUnannotated(queue);
      onCountChange?.(queue.length);
    } catch (err) {
      setError('Failed to load article queue');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
  };

  return (
    <div className="article-queue d-flex flex-column h-100">
      <div className="article-queue-header d-flex align-items-center justify-content-between px-3 py-2">
        <span className="fw-semibold small text-uppercase letter-spacing-wide">
          Article Queue
        </span>
        <div className="d-flex align-items-center gap-2">
          {unannotated.length > 0 && (
            <Badge bg="warning" text="dark" pill>
              {unannotated.length}
            </Badge>
          )}
          <Button
            variant="link"
            size="sm"
            className="p-0 text-secondary"
            onClick={fetchQueue}
            disabled={loading}
            title="Refresh queue"
            aria-label="Refresh article queue"
          >
            <i className={`bi bi-arrow-clockwise${loading ? ' spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="article-queue-body flex-grow-1 overflow-auto">
        {loading && unannotated.length === 0 ? (
          <div className="d-flex justify-content-center align-items-center py-5">
            <Spinner animation="border" size="sm" variant="secondary" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center">
            <p className="small text-danger mb-2">{error}</p>
            <Button variant="outline-secondary" size="sm" onClick={fetchQueue}>
              Retry
            </Button>
          </div>
        ) : unannotated.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <i className="bi bi-check2-circle text-success fs-3 d-block mb-2" />
            <p className="small text-muted mb-0">All articles annotated</p>
          </div>
        ) : (
          <ul className="list-unstyled mb-0">
            {unannotated.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  className={`article-queue-item w-100 text-start px-3 py-2 border-0 border-bottom${
                    selectedArticleId === article.id
                      ? ' article-queue-item--active'
                      : ''
                  }`}
                  onClick={() => onSelectArticle(article)}
                >
                  <div
                    className="small fw-medium text-truncate"
                    title={article.headline ?? undefined}
                  >
                    {article.headline || (
                      <span className="text-muted fst-italic">No headline</span>
                    )}
                  </div>
                  <div className="d-flex gap-2 mt-1">
                    {article.platform && (
                      <span className="article-queue-meta">{article.platform}</span>
                    )}
                    {article.dateOfPublication && (
                      <span className="article-queue-meta text-muted">
                        {formatDate(article.dateOfPublication)}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ArticleQueue;
