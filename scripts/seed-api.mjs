/* eslint-disable no-console */
/**
 * seed-api.mjs
 *
 * Seeds local sample data through the app's HTTP API endpoints.
 * Requires the Next.js dev server to be running (default: http://localhost:3000).
 *
 * Usage:
 *   node scripts/seed-api.mjs
 *   APP_BASE_URL=http://localhost:3000 node scripts/seed-api.mjs
 *
 * Idempotent: existing records are detected via GET before POST — already-present
 * records are skipped rather than duplicated.  Re-running is safe.
 */

const BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

// ─── helpers ──────────────────────────────────────────────────────────────────

const api = async (method, path, body) => {
    const url = `${BASE_URL}${path}`;
    const init = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
        init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body: json };
};

const post = (path, body) => api('POST', path, body);
const get = (path) => api('GET', path);

const log = {
    created: (kind, label) => console.log(`  ✓ created   ${kind}: ${label}`),
    skipped: (kind, label) => console.log(`  · skipped   ${kind}: ${label} (already exists)`),
    conflict: (kind, label) => console.log(`  ~ conflict  ${kind}: ${label} (duplicate detected — skipped)`),
    warn: (kind, detail) => console.log(`  ! warning   ${kind}: ${detail}`),
    failed: (kind, label, detail) => console.error(`  ✗ failed    ${kind}: ${label} — ${detail}`),
};

/**
 * Try to POST a record.  If the server returns 409 (duplicate) treat it as a
 * skip rather than a failure.
 */
const tryCreate = async (kind, label, path, payload) => {
    const res = await post(path, payload);
    if (res.ok && res.body?.success) {
        log.created(kind, label);
        return res.body.data;
    }
    if (res.status === 409) {
        log.conflict(kind, label);
        // Article duplicate responses include the matched ID; keep it for dependent seeds.
        if (kind === 'article' && typeof res.body?.id === 'string' && res.body.id) {
            return { id: res.body.id };
        }
        return null;
    }
    log.failed(kind, label, res.body?.error ?? res.body?.message ?? `HTTP ${res.status}`);
    return null;
};

/**
 * Fetch all existing records from a list endpoint and return a Set of
 * values for a chosen key so we can skip before POSTing.
 */
const existingSet = async (path, keyFn) => {
    const res = await get(path);
    const rows = res.body?.data ?? [];
    return new Set(Array.isArray(rows) ? rows.map(keyFn) : []);
};

// ─── seed definitions ─────────────────────────────────────────────────────────

const ARTICLES = [
    {
        newsReportUrl: 'https://example.org/reports/metro-homicide-seed-1',
        newsReportHeadline: 'Police investigate overnight shooting in central district',
        author: 'A. Reporter',
        dateOfPublication: '2026-05-10',
        wireService: 'Local Wire',
        language: 'English',
        typeOfSource: 'newspaper',
        newsReportPlatform: 'web',
        notes: 'Primary narrative source for seed Event A.',
    },
    {
        newsReportUrl: 'https://example.org/reports/community-witnesses-seed-2',
        newsReportHeadline: 'Witnesses describe timeline before fatal incident',
        author: 'B. Journalist',
        dateOfPublication: '2026-05-11',
        wireService: 'City Press',
        language: 'English',
        typeOfSource: 'news site',
        newsReportPlatform: 'web',
        notes: 'Contains witness timeline and location clarifications.',
    },
    {
        newsReportUrl: 'https://example.org/reports/court-appearance-seed-3',
        newsReportHeadline: 'Suspect appears in court as charges are outlined',
        author: 'C. Correspondent',
        dateOfPublication: '2026-05-13',
        wireService: 'Regional Desk',
        language: 'English',
        typeOfSource: 'court record digest',
        newsReportPlatform: 'print',
        notes: 'Follow-up coverage for legal process and charges.',
    },
];

const buildVictims = (articleIds) => [
    {
        articleId: articleIds[0],
        victimName: 'Nomsa Dlamini',
        victimAlias: 'N. Dlamini',
        dateOfDeath: '2026-05-09',
        placeOfDeathProvince: 'Gauteng',
        placeOfDeathTown: 'Johannesburg',
        typeOfLocation: 'street',
        policeStation: 'Hillbrow SAPS',
        genderOfVictim: 'female',
        raceOfVictim: 'Black African',
        nationality: 'South African',
        ageOfVictim: 29,
        ageRangeOfVictim: '25-34',
        ageDescriptor: 'adult',
        modeOfDeathSpecific: 'gunshot wound',
        modeOfDeathGeneral: 'shooting',
        typeOfMurder: 'single-victim homicide',
    },
    // Intentional near-duplicate to exercise merge/dedup flows.
    {
        articleId: articleIds[1],
        victimName: 'Nomsa Dlamini',
        victimAlias: 'Nomsa D.',
        dateOfDeath: '2026-05-09',
        placeOfDeathProvince: 'Gauteng',
        placeOfDeathTown: 'Johannesburg',
        typeOfLocation: 'residential area',
        policeStation: 'Hillbrow SAPS',
        genderOfVictim: 'female',
        raceOfVictim: 'Black African',
        nationality: 'South African',
        ageOfVictim: 30,
        ageRangeOfVictim: '25-34',
        ageDescriptor: 'adult',
        modeOfDeathSpecific: 'gunshot wound',
        modeOfDeathGeneral: 'shooting',
        typeOfMurder: 'single-victim homicide',
    },
];

const buildPerpetrators = (articleIds) => [
    {
        articleId: articleIds[2],
        perpetratorName: 'Thabo Maseko',
        perpetratorAlias: 'T. Maseko',
        perpetratorRelationshipToVictim: 'acquaintance',
        suspectIdentified: 'yes',
        suspectArrested: 'yes',
        suspectCharged: 'yes',
        conviction: 'pending',
    },
    // Intentional near-duplicate.
    {
        articleId: articleIds[1],
        perpetratorName: 'Thabo Maseko',
        perpetratorAlias: 'Thabo M.',
        perpetratorRelationshipToVictim: 'acquaintance',
        suspectIdentified: 'yes',
        suspectArrested: 'yes',
        suspectCharged: 'no',
        conviction: 'pending',
    },
];

const buildEvents = (articleIds) => [
    {
        eventTypes: ['homicide', 'shooting'],
        articleIds: [articleIds[0], articleIds[1]],
        participantIds: [],
        details: {
            location: 'Central District',
            incidentTime: '2026-05-09T23:40:00.000Z',
            typeOfMurder: 'single-victim homicide',
        },
    },
    {
        eventTypes: ['court_proceeding'],
        articleIds: [articleIds[2]],
        participantIds: [],
        details: {
            court: 'Johannesburg Magistrates Court',
            hearingType: 'first appearance',
            typeOfMurder: 'Unknown/Other',
        },
    },
];

// ─── seeding phases ───────────────────────────────────────────────────────────

const seedArticles = async () => {
    console.log('\n── Articles ──');
    const existing = await existingSet('/api/articles?limit=2000&offset=0', (r) => r.newsReportUrl);
    const createdIds = [];

    for (const article of ARTICLES) {
        if (existing.has(article.newsReportUrl)) {
            // Fetch its ID so we can reference it for victims/perpetrators/events.
            const check = await get(`/api/articles?search=${encodeURIComponent(article.newsReportHeadline)}&limit=2000&offset=0`);
            const match = (check.body?.data ?? []).find(
                (r) => r.newsReportUrl === article.newsReportUrl,
            );
            if (match?.id) {
                log.skipped('article', article.newsReportHeadline);
                createdIds.push(match.id);
                continue;
            }
        }
        const result = await tryCreate('article', article.newsReportHeadline, '/api/articles', article);
        createdIds.push(result?.id ?? null);
    }

    return createdIds;
};

const seedVictims = async (articleIds) => {
    console.log('\n── Victims ──');
    const victims = buildVictims(articleIds.filter(Boolean));
    const existingVictimsRes = await get('/api/victims?limit=2000&offset=0&includeMerged=true');
    const existingVictimKeys = new Set(
        (existingVictimsRes.body?.data ?? []).map((row) => `${row.articleId || ''}::${(row.victimName || '').toLowerCase()}`),
    );
    for (const victim of victims) {
        if (!victim.articleId) {
            log.failed('victim', victim.victimName, 'no article ID available — skipped');
            continue;
        }
        const victimKey = `${victim.articleId}::${(victim.victimName || '').toLowerCase()}`;
        if (existingVictimKeys.has(victimKey)) {
            log.skipped('victim', victim.victimName);
            continue;
        }
        await tryCreate('victim', victim.victimName, '/api/victims', victim);
        existingVictimKeys.add(victimKey);
    }
};

const seedPerpetrators = async (articleIds) => {
    console.log('\n── Perpetrators ──');
    const perpetrators = buildPerpetrators(articleIds.filter(Boolean));
    const existingPerpsRes = await get('/api/perpetrators?limit=2000&offset=0&includeMerged=true');
    const existingPerpKeys = new Set(
        (existingPerpsRes.body?.data ?? []).map((row) => `${row.articleId || ''}::${(row.perpetratorName || '').toLowerCase()}`),
    );
    for (const perp of perpetrators) {
        if (!perp.articleId) {
            log.failed('perpetrator', perp.perpetratorName, 'no article ID available — skipped');
            continue;
        }
        const perpKey = `${perp.articleId}::${(perp.perpetratorName || '').toLowerCase()}`;
        if (existingPerpKeys.has(perpKey)) {
            log.skipped('perpetrator', perp.perpetratorName);
            continue;
        }
        await tryCreate('perpetrator', perp.perpetratorName, '/api/perpetrators', perp);
        existingPerpKeys.add(perpKey);
    }
};

const seedEvents = async (articleIds) => {
    console.log('\n── Events ──');
    const usableArticleIds = articleIds.filter(Boolean);
    if (usableArticleIds.length === 0) {
        log.failed('event', 'seed events', 'no article IDs available — skipped');
        return;
    }

    const existingRes = await get('/api/events?limit=2000&page=1');
    const existingEvents = existingRes.body?.data?.events ?? [];
    const existingDetails = new Set(
        existingEvents.map((e) => JSON.stringify(typeof e.details === 'string' ? JSON.parse(e.details) : e.details)),
    );

    for (const event of buildEvents(usableArticleIds)) {
        const detailKey = JSON.stringify(event.details);
        if (existingDetails.has(detailKey)) {
            log.skipped('event', event.details.typeOfMurder ?? event.eventTypes.join(','));
            continue;
        }

        const created = await tryCreate(
            'event',
            event.details.typeOfMurder ?? event.eventTypes.join(','),
            '/api/events',
            event,
        );

        if (created?.details) {
            existingDetails.add(
                JSON.stringify(typeof created.details === 'string' ? JSON.parse(created.details) : created.details),
            );
        } else {
            existingDetails.add(detailKey);
        }
    }
};

// ─── health check ─────────────────────────────────────────────────────────────

const waitForServer = async () => {
    const MAX_ATTEMPTS = 10;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const res = await get('/api/health');
            if (res.ok) return true;
        } catch {
            // not ready yet
        }
        if (attempt < MAX_ATTEMPTS) {
            console.log(`  Server not ready (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in 2s …`);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    return false;
};

// ─── main ─────────────────────────────────────────────────────────────────────

const run = async () => {
    console.log(`\nAPI seed — targeting ${BASE_URL}`);
    console.log('Checking server …');

    const ready = await waitForServer();
    if (!ready) {
        console.error(`\nServer at ${BASE_URL} did not respond after retries.`);
        console.error('Start the dev server first:  pnpm run dev');
        process.exit(1);
    }
    console.log('Server ready.\n');

    const articleIds = await seedArticles();
    await seedVictims(articleIds);
    await seedPerpetrators(articleIds);
    await seedEvents(articleIds);

    console.log('\nDone.\n');
};

run().catch((err) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
});
