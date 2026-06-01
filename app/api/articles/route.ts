import { NextResponse } from 'next/server';
import { and, eq, like, sql, type SQL } from 'drizzle-orm';
import { dbm, DatabaseManagerServer } from '../../../lib/db/server';
import {
  articles,
  events,
  perpetrators,
  victims,
  type Article,
  type NewArticle,
} from '../../../lib/db/schema';
import { prepareArticlePayload } from '../../../lib/utils/transformers';
import {
  detectDuplicates,
  generateArticleId,
} from '../../../lib/components/utils';
import { coerceArticle, mapDuplicateMatchDtos } from './utils';

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

export async function GET(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const search = url.searchParams.get('search') || '';
    const parsedLimit = Number.parseInt(
      url.searchParams.get('limit') || '50',
      10,
    );
    const parsedOffset = Number.parseInt(
      url.searchParams.get('offset') || '0',
      10,
    );
    const limit = Number.isNaN(parsedLimit) ? 50 : parsedLimit;
    const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;

    if (id) {
      const existing = await db
        .select()
        .from(articles)
        .where(eq(articles.id, id))
        .limit(1);
      return NextResponse.json({ success: true, data: existing[0] ?? null });
    }

    const whereConditions: SQL[] = [];

    if (search) {
      const wildcard = `%${search}%`;
      const searchConditions = [
        like(articles.newsReportHeadline, wildcard),
        like(articles.author, wildcard),
        like(articles.notes, wildcard),
      ];

      const [firstCondition, ...remaining] = searchConditions;
      if (firstCondition) {
        const combined = remaining.reduce<SQL>(
          (acc, condition) => sql`${acc} OR ${condition}`,
          firstCondition,
        );
        whereConditions.push(combined);
      }
    }

    const condition = (() => {
      if (whereConditions.length === 0) return undefined;
      if (whereConditions.length === 1) return whereConditions[0];
      return and(...whereConditions);
    })();

    const baseQuery = db.select().from(articles);
    const data = condition
      ? await baseQuery.where(condition).limit(limit).offset(offset)
      : await baseQuery.limit(limit).offset(offset);

    const countColumn = sql<number>`count(*)`.as('count');
    const totalResult = condition
      ? await db.select({ count: countColumn }).from(articles).where(condition)
      : await db.select({ count: countColumn }).from(articles);
    const total = totalResult[0]?.count ?? 0;

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Failed to fetch articles:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve articles',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const payload = await request.json();
    const { data: articlePayload, validation } = prepareArticlePayload(payload);

    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 },
      );
    }

    const coerced = coerceArticle(articlePayload);
    const id = generateArticleId(
      coerced.newsReportUrl ?? '',
      coerced.author ?? '',
      coerced.newsReportHeadline ?? '',
    );

    const existingArticles = await db.select().from(articles);
    const duplicates = detectDuplicates(coerced, existingArticles);
    const duplicateDtos = mapDuplicateMatchDtos(duplicates);

    if (duplicates.length > 0 && duplicates[0].confidence === 'high') {
      return NextResponse.json(
        {
          success: false,
          error: 'Potential duplicate article detected',
          duplicates: duplicateDtos.slice(0, 3),
          id: duplicates[0].id,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const newArticle: NewArticle = {
      id,
      ...coerced,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'synced',
      failureCount: 0,
      lastSyncAt: now,
    };

    let created: Article | undefined;
    try {
      const inserted = await db.insert(articles).values(newArticle).returning();
      created = inserted[0] as Article | undefined;
    } catch (error) {
      const isConstraintError =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';

      if (isConstraintError) {
        return NextResponse.json(
          {
            success: false,
            error: 'An article with this ID already exists',
          },
          { status: 409 },
        );
      }

      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: created ?? (newArticle as Article),
        message: 'Article created successfully',
        warnings: validation.warnings,
        duplicates: duplicateDtos.slice(0, 3),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create article:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create article',
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const payload = await request.json();
    const articleIdFromPayload =
      typeof payload?.articleId === 'string' && payload.articleId
        ? payload.articleId
        : undefined;
    const id =
      articleIdFromPayload ??
      (typeof payload?.id === 'string' && payload.id ? payload.id : '');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Article ID is required' },
        { status: 400 },
      );
    }

    const { data: articlePayload, validation } = prepareArticlePayload(payload);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 },
      );
    }

    const existing = await db
      .select()
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 },
      );
    }

    const coercedUpdate = coerceArticle(articlePayload, existing[0]);
    const now = new Date().toISOString();
    const updated = await db
      .update(articles)
      .set({
        ...coercedUpdate,
        updatedAt: now,
        syncStatus: 'synced',
        failureCount: existing[0].failureCount ?? 0,
        lastSyncAt: now,
      })
      .where(eq(articles.id, id))
      .returning();

    const updatedArticle = updated[0] as Article | undefined;

    return NextResponse.json({
      success: true,
      data: updatedArticle ?? { ...existing[0], ...coercedUpdate },
      message: 'Article updated successfully',
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error('Failed to update article:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update article',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await ensureServerDatabase();
    const url = new URL(request.url);
    const id =
      url.searchParams.get('articleId') || url.searchParams.get('id') || '';

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Article ID is required' },
        { status: 400 },
      );
    }

    const existing = await db
      .select()
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 },
      );
    }

    const deletionSummary = await db.transaction(async (tx) => {
      const now = new Date().toISOString();

      const linkedVictims = await tx
        .select({ id: victims.id })
        .from(victims)
        .where(eq(victims.articleId, id));
      const linkedPerpetrators = await tx
        .select({ id: perpetrators.id })
        .from(perpetrators)
        .where(eq(perpetrators.articleId, id));

      const participantIdsToDelete = new Set<string>([
        ...linkedVictims.map((entry) => entry.id),
        ...linkedPerpetrators.map((entry) => entry.id),
      ]);

      const allEvents = await tx.select().from(events);
      const eventsLinkedToArticle = allEvents.filter((event) => {
        const articleIds = parseStringArray(event.articleIds);
        return articleIds.includes(id);
      });

      let deletedEventCount = 0;
      let updatedEventCount = 0;

      for (const event of eventsLinkedToArticle) {
        const articleIds = parseStringArray(event.articleIds);
        const participantIds = parseStringArray(event.participantIds);

        const remainingArticleIds = articleIds.filter((articleId) => articleId !== id);
        const remainingParticipantIds = participantIds.filter(
          (participantId) => !participantIdsToDelete.has(participantId),
        );

        if (remainingArticleIds.length === 0) {
          await tx.delete(events).where(eq(events.id, event.id));
          deletedEventCount += 1;
          continue;
        }

        const articleLinksChanged = remainingArticleIds.length !== articleIds.length;
        const participantLinksChanged = remainingParticipantIds.length !== participantIds.length;

        if (articleLinksChanged || participantLinksChanged) {
          await tx
            .update(events)
            .set({
              articleIds: remainingArticleIds,
              participantIds: remainingParticipantIds,
              updatedAt: now,
              syncStatus: 'synced',
              failureCount: event.failureCount ?? 0,
            })
            .where(eq(events.id, event.id));
          updatedEventCount += 1;
        }
      }

      if (linkedVictims.length > 0) {
        await tx.delete(victims).where(eq(victims.articleId, id));
      }

      if (linkedPerpetrators.length > 0) {
        await tx.delete(perpetrators).where(eq(perpetrators.articleId, id));
      }

      await tx.delete(articles).where(eq(articles.id, id));

      return {
        deletedEvents: deletedEventCount,
        updatedEvents: updatedEventCount,
        deletedVictims: linkedVictims.length,
        deletedPerpetrators: linkedPerpetrators.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: 'Article deleted successfully',
      summary: deletionSummary,
    });
  } catch (error) {
    console.error('Failed to delete article:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete article',
      },
      { status: 500 },
    );
  }
}
