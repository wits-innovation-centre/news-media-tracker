import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { dbm, DatabaseManagerServer } from '../../../lib/db/server';
import {
  articles,
  events,
  type Event,
  type NewEvent,
} from '../../../lib/db/schema';

const ensureServerDatabase = async () => {
  if (!(dbm instanceof DatabaseManagerServer)) {
    throw new TypeError(
      'Online API called with local database manager. This endpoint must run in a server context.',
    );
  }
  await dbm.ensureDatabaseInitialised();
  return dbm.getLocal();
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
};

const parseDetails = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
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
};

const normalizeEvent = (event: Event): Event => ({
  ...event,
  eventTypes: parseStringArray(event.eventTypes),
  articleIds: parseStringArray(event.articleIds),
  participantIds: parseStringArray(event.participantIds),
  details: parseDetails(event.details),
});

export async function GET(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Number.parseInt(url.searchParams.get('limit') || '10', 10);
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();

    if (id) {
      const existing = await db
        .select()
        .from(events)
        .where(eq(events.id, id))
        .limit(1);
      return NextResponse.json({
        success: true,
        data: existing[0] ? normalizeEvent(existing[0] as Event) : null,
      });
    }

    let all = (await db.select().from(events)) as Event[];
    all = all.map(normalizeEvent);

    if (search) {
      all = all.filter((event) => {
        const eventTypes = parseStringArray(event.eventTypes);
        const details = parseDetails(event.details);
        return (
          eventTypes.some((type) => type.toLowerCase().includes(search)) ||
          Object.values(details).some(
            (value) => typeof value === 'string' && value.toLowerCase().includes(search),
          )
        );
      });
    }

    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
    const startIndex = (safePage - 1) * safeLimit;
    const paginatedEvents = all.slice(startIndex, startIndex + safeLimit);
    const total = all.length;

    return NextResponse.json({
      success: true,
      data: {
        events: paginatedEvents,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    });
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve events' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const body = (await request.json()) as Record<string, unknown>;
    const eventTypes = parseStringArray(body.eventTypes);
    const articleIds = parseStringArray(body.articleIds);
    const participantIds = parseStringArray(body.participantIds);
    const details = parseDetails(body.details);

    if (eventTypes.length === 0 || articleIds.length === 0 || !body.details) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: 'eventTypes, articleIds, participantIds, and details are required',
        },
        { status: 400 },
      );
    }

    const linkedArticles = await db
      .select({ id: articles.id })
      .from(articles)
      .where(inArray(articles.id, articleIds));
    const linkedArticleIds = new Set(linkedArticles.map((article) => article.id));
    const hasMissingArticle = articleIds.some((articleId) => !linkedArticleIds.has(articleId));
    if (hasMissingArticle) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more linked articles were not found',
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const newEvent: NewEvent = {
      id:
        typeof body.eventId === 'string' && body.eventId
          ? body.eventId
          : typeof body.id === 'string' && body.id
            ? body.id
            : uuidv4(),
      eventTypes,
      articleIds,
      participantIds,
      details,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'synced',
      failureCount: 0,
    };

    const inserted = await db.insert(events).values(newEvent).returning();
    const created = inserted[0] as Event | undefined;

    return NextResponse.json(
      {
        success: true,
        data: created ? normalizeEvent(created) : normalizeEvent(newEvent as Event),
        message: 'Event created successfully',
      },
      { status: 201 },
    );
  } catch (error) {
    const isConstraintError =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';

    if (isConstraintError) {
      return NextResponse.json(
        { success: false, error: 'An event with this ID already exists' },
        { status: 409 },
      );
    }

    console.error('Failed to create event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create event' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const body = (await request.json()) as Record<string, unknown>;
    const id =
      typeof body.id === 'string' && body.id
        ? body.id
        : typeof body.eventId === 'string' && body.eventId
          ? body.eventId
          : '';

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Event ID is required' },
        { status: 400 },
      );
    }

    const existing = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const nextEventTypes =
      body.eventTypes === undefined
        ? parseStringArray(existing[0].eventTypes)
        : parseStringArray(body.eventTypes);
    const nextArticleIds =
      body.articleIds === undefined
        ? parseStringArray(existing[0].articleIds)
        : parseStringArray(body.articleIds);
    const nextParticipantIds =
      body.participantIds === undefined
        ? parseStringArray(existing[0].participantIds)
        : parseStringArray(body.participantIds);
    const nextDetails =
      body.details === undefined ? parseDetails(existing[0].details) : parseDetails(body.details);

    if (nextArticleIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one article ID is required' },
        { status: 400 },
      );
    }

    const linkedArticles = await db
      .select({ id: articles.id })
      .from(articles)
      .where(inArray(articles.id, nextArticleIds));
    const linkedArticleIds = new Set(linkedArticles.map((article) => article.id));
    const hasMissingArticle = nextArticleIds.some(
      (articleId) => !linkedArticleIds.has(articleId),
    );
    if (hasMissingArticle) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more linked articles were not found',
        },
        { status: 400 },
      );
    }

    const updated = await db
      .update(events)
      .set({
        eventTypes: nextEventTypes,
        articleIds: nextArticleIds,
        participantIds: nextParticipantIds,
        details: nextDetails,
        updatedAt: now,
        syncStatus: 'synced',
        failureCount: existing[0].failureCount ?? 0,
      })
      .where(eq(events.id, id))
      .returning();

    const updatedEvent = updated[0] as Event | undefined;

    return NextResponse.json({
      success: true,
      data: updatedEvent
        ? normalizeEvent(updatedEvent)
        : normalizeEvent({ ...existing[0], updatedAt: now } as Event),
      message: 'Event updated successfully',
    });
  } catch (error) {
    console.error('Failed to update event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update event' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Event ID is required' },
        { status: 400 },
      );
    }

    const existing = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 },
      );
    }

    await db.delete(events).where(and(eq(events.id, id)));
    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Failed to delete event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete event' },
      { status: 500 },
    );
  }
}
