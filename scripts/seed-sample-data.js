/* eslint-disable no-console */
// Idempotent sample-data seeding for local development and demos.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const ROLE_VOCAB_KEY = 'event_actor_role';

const resolveDatabasePath = () => {
    if (process.env.DB_PATH && process.env.DB_PATH.trim().length > 0) {
        return process.env.DB_PATH.trim();
    }

    const localDataPath =
        process.env.LOCAL_DATA_PATH && process.env.LOCAL_DATA_PATH.trim().length > 0
            ? process.env.LOCAL_DATA_PATH.trim()
            : path.join(process.cwd(), 'data');

    return path.join(localDataPath, 'news-report-tracker.db');
};

const TABLES = [
    'users',
    'repository',
    'membership',
    'permission_grant',
    'app_config',
    'articles',
    'participants',
    'events',
    'report_annotations',
    'victims',
    'perpetrators',
    'schema_profile',
    'schema_field',
    'schema_vocab_term',
    'annotation_event',
    'actor',
    'actor_alias',
    'actor_identifier',
    'event_actor_role',
    'claim',
    'claim_evidence',
    'sync_queue',
    'sync_conflict_record',
];

const tableExists = async (client, tableName) => {
    const result = await client.execute({
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        args: [tableName],
    });

    return Array.isArray(result.rows) && result.rows.length > 0;
};

const findNumericIdByTermKey = async (client, termKey) => {
    const row = await client.execute({
        sql: `SELECT id FROM schema_vocab_term WHERE vocab_key = ? AND term_key = ? ORDER BY id LIMIT 1`,
        args: [ROLE_VOCAB_KEY, termKey],
    });

    if (!Array.isArray(row.rows) || row.rows.length === 0) {
        return null;
    }

    const first = row.rows[0];
    if (!first || typeof first !== 'object' || !(('id' in first))) {
        return null;
    }

    return Number(first.id);
};

const seedSampleData = async () => {
    const databasePath = resolveDatabasePath();
    const databaseDir = path.dirname(databasePath);
    if (!fs.existsSync(databaseDir)) {
        fs.mkdirSync(databaseDir, { recursive: true });
    }

    const client = createClient({
        url: `file:${databasePath}`,
    });

    try {
        const availability = {};
        for (const table of TABLES) {
            availability[table] = await tableExists(client, table);
        }

        const missingTables = TABLES.filter((table) => !availability[table]);
        if (missingTables.length > 0) {
            console.warn('Skipping unavailable tables:', missingTables.join(', '));
            console.warn('Tip: run the app once to ensure migrations are applied.');
        }

        await client.execute('BEGIN TRANSACTION');

        if (availability.users) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO users (user_id, username, email, role, is_active, last_login_at)
              VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-user-owner',
                    'seed.owner',
                    'owner@example.org',
                    'admin',
                    1,
                    '2026-05-13T08:00:00.000Z',
                    'seed-user-researcher',
                    'seed.researcher',
                    'researcher@example.org',
                    'researcher',
                    1,
                    '2026-05-14T09:15:00.000Z',
                ],
            });
        }

        if (availability.repository) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO repository (id, name, description, visibility, owner_id, created_by)
              VALUES (?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-repo-main',
                    'Homicide Coverage Dataset',
                    'Sample workspace seeded for local analytics and UI demos.',
                    'private',
                    'seed-user-owner',
                    'seed-user-owner',
                ],
            });
        }

        if (availability.membership) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO membership (id, repository_id, user_id, role, invited_by)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-membership-owner',
                    'seed-repo-main',
                    'seed-user-owner',
                    'owner',
                    'seed-user-owner',
                    'seed-membership-researcher',
                    'seed-repo-main',
                    'seed-user-researcher',
                    'editor',
                    'seed-user-owner',
                ],
            });
        }

        if (availability.permission_grant) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO permission_grant (
              id, repository_id, grantee_user_id, resource_type, resource_id, action, granted_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-permission-export',
                    'seed-repo-main',
                    'seed-user-researcher',
                    'repository',
                    'seed-repo-main',
                    'export',
                    'seed-user-owner',
                    'seed-permission-annotate',
                    'seed-repo-main',
                    'seed-user-researcher',
                    'annotation',
                    null,
                    'write',
                    'seed-user-owner',
                ],
            });
        }

        if (availability.app_config) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO app_config (key, value, value_type, description)
              VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
                args: [
                    'seed.last_run',
                    '2026-05-14T12:00:00.000Z',
                    'string',
                    'Last time development sample data was seeded.',
                    'seed.mode',
                    'demo',
                    'string',
                    'Current sample data profile.',
                ],
            });
        }

        if (availability.articles) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO articles (
              id, news_report_id, news_report_url, news_report_headline, date_of_publication,
              author, wire_service, language, type_of_source, news_report_platform, notes
            ) VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-article-001',
                    'NR-2026-0001',
                    'https://example.org/reports/metro-homicide-1',
                    'Police investigate overnight shooting in central district',
                    '2026-05-10',
                    'A. Reporter',
                    'Local Wire',
                    'English',
                    'newspaper',
                    'web',
                    'Primary narrative source for Event A.',
                    'seed-article-002',
                    'NR-2026-0002',
                    'https://example.org/reports/community-witnesses',
                    'Witnesses describe timeline before fatal incident',
                    '2026-05-11',
                    'B. Journalist',
                    'City Press',
                    'English',
                    'news site',
                    'web',
                    'Contains witness timeline and location clarifications.',
                    'seed-article-003',
                    'NR-2026-0003',
                    'https://example.org/reports/court-appearance',
                    'Suspect appears in court as charges are outlined',
                    '2026-05-13',
                    'C. Correspondent',
                    'Regional Desk',
                    'English',
                    'court record digest',
                    'print',
                    'Follow-up coverage for legal process and charges.',
                ],
            });
        }

        if (availability.participants) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO participants (id, role, details)
              VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
                args: [
                    'seed-participant-victim-001',
                    'victim',
                    JSON.stringify({ name: 'N. Dlamini', age: 29 }),
                    'seed-participant-perpetrator-001',
                    'perpetrator',
                    JSON.stringify({ name: 'T. Maseko', arrested: true }),
                    'seed-participant-witness-001',
                    'witness',
                    JSON.stringify({ name: 'Witness A', statementCount: 2 }),
                    'seed-participant-officer-001',
                    'investigator',
                    JSON.stringify({ unit: 'SAPS Metro Unit', badge: '4821' }),
                ],
            });
        }

        if (availability.events) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO events (id, event_types, article_ids, participant_ids, details)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-event-001',
                    JSON.stringify(['homicide', 'shooting']),
                    JSON.stringify(['seed-article-001', 'seed-article-002']),
                    JSON.stringify([
                        'seed-participant-victim-001',
                        'seed-participant-perpetrator-001',
                        'seed-participant-witness-001',
                    ]),
                    JSON.stringify({
                        location: 'Central District',
                        incidentTime: '2026-05-09T23:40:00.000Z',
                    }),
                    'seed-event-002',
                    JSON.stringify(['court_proceeding']),
                    JSON.stringify(['seed-article-003']),
                    JSON.stringify(['seed-participant-perpetrator-001']),
                    JSON.stringify({
                        court: 'Johannesburg Magistrates Court',
                        hearingType: 'first appearance',
                    }),
                ],
            });
        }

        if (availability.report_annotations) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO report_annotations (
              id, source_article_id, target_article_id, relation_type, notes
            ) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-annotation-report-001',
                    'seed-article-001',
                    'seed-article-002',
                    'follow_up',
                    'Second report contributes witness details and corrected timing.',
                    'seed-annotation-report-002',
                    'seed-article-001',
                    'seed-article-003',
                    'legal_update',
                    'Third report tracks judicial progression of same incident.',
                ],
            });
        }

        if (availability.victims) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO victims (
              id, article_id, victim_name, victim_alias, victim_aliases, date_of_death,
              date_of_death_mode, place_of_death_province, place_of_death_town,
              type_of_location, police_station, gender_of_victim, race_of_victim,
              nationality, age_of_victim, age_range_of_victim, age_descriptor,
              mode_of_death_specific, mode_of_death_general, type_of_murder
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-victim-001',
                    'seed-article-001',
                    'Nomsa Dlamini',
                    'N. Dlamini',
                    JSON.stringify(['Nomsa D.', 'N. Dlamini']),
                    '2026-05-09',
                    'EXACT',
                    'Gauteng',
                    'Johannesburg',
                    'street',
                    'Hillbrow SAPS',
                    'female',
                    'Black African',
                    'South African',
                    29,
                    '25-34',
                    'adult',
                    'gunshot wound',
                    'shooting',
                    'single-victim homicide',
                ],
            });
        }

        if (availability.perpetrators) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO perpetrators (
              id, article_id, perpetrator_name, perpetrator_alias, suspect_aliases,
              perpetrator_relationship_to_victim, suspect_identified, suspect_arrested,
              suspect_charged, charges, conviction, sentence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-perpetrator-001',
                    'seed-article-003',
                    'Thabo Maseko',
                    'T. Maseko',
                    JSON.stringify(['TM', 'Thabo M.']),
                    'acquaintance',
                    'yes',
                    'yes',
                    'yes',
                    'Murder and illegal firearm possession',
                    'pending',
                    null,
                ],
            });
        }

        if (availability.schema_profile) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO schema_profile (id, name, entity_level, description)
              VALUES (?, ?, ?, ?)`,
                args: [
                    'default',
                    'Homicide default',
                    'event',
                    'Default homicide event schema profile',
                ],
            });
        }

        if (availability.schema_field) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO schema_field (profile_id, entity_type, field_key, field_type, field_config)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'default',
                    'event',
                    'event_type',
                    'string',
                    JSON.stringify({}),
                    'default',
                    'actor',
                    'occupation',
                    'string',
                    JSON.stringify({ nullable: true }),
                ],
            });
        }

        if (availability.schema_vocab_term) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO schema_vocab_term (vocab_key, term_key, label, description, is_system)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    ROLE_VOCAB_KEY,
                    'victim',
                    'Victim',
                    null,
                    1,
                    ROLE_VOCAB_KEY,
                    'perpetrator',
                    'Perpetrator',
                    null,
                    1,
                    ROLE_VOCAB_KEY,
                    'witness',
                    'Witness',
                    null,
                    1,
                ],
            });
        }

        if (availability.annotation_event) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO annotation_event (
              id, profile_id, event_type, datetime_mode, event_date, start_date, end_date,
              location_point, location_fallback, location_type, notes, confidence, created_by
            ) VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-annotation-event-exact',
                    'default',
                    'homicide',
                    'EXACT',
                    '2026-05-09',
                    null,
                    null,
                    JSON.stringify({ lat: -26.2041, lng: 28.0473 }),
                    'Central District',
                    JSON.stringify(['urban', 'street']),
                    'Exact-date event representation.',
                    92,
                    'seed-user-researcher',
                    'seed-annotation-event-range',
                    'default',
                    'investigation',
                    'RANGE',
                    null,
                    '2026-05-10',
                    '2026-05-13',
                    null,
                    'Johannesburg CBD',
                    JSON.stringify(['urban']),
                    'Range-based investigative timeline.',
                    78,
                    'seed-user-researcher',
                    'seed-annotation-event-unknown',
                    'default',
                    'prior_threat',
                    'UNKNOWN',
                    null,
                    null,
                    null,
                    null,
                    'Unknown location',
                    JSON.stringify(['unknown']),
                    'Unknown date used for sparse-source evidence.',
                    45,
                    'seed-user-researcher',
                ],
            });
        }

        if (availability.actor) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO actor (id, canonical_label, actor_kind, status, schema_profile_id)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-actor-victim-001',
                    'Nomsa Dlamini',
                    'person',
                    'active',
                    'default',
                    'seed-actor-perpetrator-001',
                    'Thabo Maseko',
                    'person',
                    'active',
                    'default',
                    'seed-actor-witness-001',
                    'Witness A',
                    'person',
                    'active',
                    'default',
                ],
            });
        }

        if (availability.actor_alias) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO actor_alias (id, actor_id, alias_value, alias_normalized, is_primary)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-actor-alias-001',
                    'seed-actor-victim-001',
                    'N. Dlamini',
                    'n dlamini',
                    1,
                    'seed-actor-alias-002',
                    'seed-actor-perpetrator-001',
                    'T. Maseko',
                    't maseko',
                    1,
                    'seed-actor-alias-003',
                    'seed-actor-witness-001',
                    'Witness A',
                    'witness a',
                    1,
                ],
            });
        }

        if (availability.actor_identifier) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO actor_identifier (id, actor_id, namespace, value, is_primary)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-actor-ident-001',
                    'seed-actor-victim-001',
                    'internal',
                    'victim-0001',
                    1,
                    'seed-actor-ident-002',
                    'seed-actor-perpetrator-001',
                    'internal',
                    'suspect-0001',
                    1,
                ],
            });
        }

        let victimRoleTermId = null;
        let perpetratorRoleTermId = null;
        let witnessRoleTermId = null;
        if (availability.schema_vocab_term) {
            victimRoleTermId = await findNumericIdByTermKey(client, 'victim');
            perpetratorRoleTermId = await findNumericIdByTermKey(client, 'perpetrator');
            witnessRoleTermId = await findNumericIdByTermKey(client, 'witness');
        }

        if (
            availability.event_actor_role &&
            availability.annotation_event &&
            availability.actor &&
            victimRoleTermId &&
            perpetratorRoleTermId &&
            witnessRoleTermId
        ) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO event_actor_role (
              id, event_id, actor_id, role_term_id, role_scope,
              confidence, certainty, is_primary_role
            ) VALUES
              (?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-ear-001',
                    'seed-annotation-event-exact',
                    'seed-actor-victim-001',
                    victimRoleTermId,
                    'incident',
                    95,
                    'known',
                    1,
                    'seed-ear-002',
                    'seed-annotation-event-exact',
                    'seed-actor-perpetrator-001',
                    perpetratorRoleTermId,
                    'incident',
                    83,
                    'suspected',
                    1,
                    'seed-ear-003',
                    'seed-annotation-event-range',
                    'seed-actor-witness-001',
                    witnessRoleTermId,
                    'investigation',
                    67,
                    'known',
                    0,
                ],
            });
        }

        if (availability.claim) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO claim (
              id, subject_type, subject_id, predicate_key, value_json,
              value_type, confidence, asserted_by, schema_field_id
            ) VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-claim-001',
                    'actor',
                    'seed-actor-perpetrator-001',
                    'occupation',
                    JSON.stringify('security guard'),
                    'string',
                    62,
                    'seed-user-researcher',
                    null,
                    'seed-claim-002',
                    'event_actor_role',
                    'seed-ear-002',
                    'was_armed',
                    JSON.stringify(true),
                    'boolean',
                    70,
                    'seed-user-researcher',
                    null,
                    'seed-claim-003',
                    'actor',
                    'seed-actor-victim-001',
                    'age',
                    JSON.stringify(29),
                    'integer',
                    90,
                    'seed-user-researcher',
                    null,
                    'seed-claim-004',
                    'event_actor_role',
                    'seed-ear-001',
                    'date_of_death',
                    JSON.stringify('2026-05-09'),
                    'date',
                    96,
                    'seed-user-researcher',
                    null,
                ],
            });
        }

        if (availability.claim_evidence) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO claim_evidence (
              id, claim_id, source_record_id, excerpt_text, selector_json, coder_note, evidence_strength
            ) VALUES
              (?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-claim-evidence-001',
                    'seed-claim-001',
                    'seed-article-003',
                    'Court record notes suspect worked as a private security contractor.',
                    JSON.stringify({ section: 'paragraph_4' }),
                    'Role needs further source corroboration.',
                    'moderate',
                    'seed-claim-evidence-002',
                    'seed-claim-002',
                    'seed-article-001',
                    'Witnesses heard multiple shots and saw a handgun.',
                    JSON.stringify({ section: 'paragraph_2' }),
                    null,
                    'strong',
                    'seed-claim-evidence-003',
                    'seed-claim-004',
                    'seed-article-001',
                    'The report places the fatal incident late on Friday night.',
                    JSON.stringify({ section: 'paragraph_1' }),
                    'Date is inferred from publication narrative.',
                    'weak',
                ],
            });
        }

        if (availability.sync_queue) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO sync_queue (
              id, method, endpoint, body, sync_status, queued_at, failure_count, last_error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    9001,
                    'POST',
                    '/api/articles',
                    JSON.stringify({ id: 'seed-article-001' }),
                    'pending',
                    '2026-05-14T10:00:00.000Z',
                    0,
                    null,
                    9002,
                    'PATCH',
                    '/api/victims/seed-victim-001',
                    JSON.stringify({ ageOfVictim: 29 }),
                    'failed',
                    '2026-05-14T10:05:00.000Z',
                    2,
                    '409 conflict: overlapping update',
                ],
            });
        }

        if (availability.sync_conflict_record) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO sync_conflict_record (
              id, method, endpoint, request_id, queue_id, overlapping_fields,
              winner_operation, conflicting_operation, decision, decision_metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-conflict-001',
                    'PATCH',
                    '/api/victims/seed-victim-001',
                    'seed-request-002',
                    9002,
                    JSON.stringify(['age_of_victim', 'age_descriptor']),
                    JSON.stringify({ requestId: 'seed-request-001', queueId: 9001 }),
                    JSON.stringify({ requestId: 'seed-request-002', queueId: 9002 }),
                    'manual',
                    JSON.stringify({
                        rationale: 'Age update collides with curated victim profile edits.',
                        reviewer: 'seed.researcher',
                    }),
                ],
            });
        }

        await client.execute('COMMIT');

        const seededCounts = [
            ['articles', "id LIKE 'seed-%'"],
            ['victims', "id LIKE 'seed-%'"],
            ['perpetrators', "id LIKE 'seed-%'"],
            ['participants', "id LIKE 'seed-%'"],
            ['events', "id LIKE 'seed-%'"],
            ['report_annotations', "id LIKE 'seed-%'"],
            ['annotation_event', "id LIKE 'seed-%'"],
            ['actor', "id LIKE 'seed-%'"],
            ['claim', "id LIKE 'seed-%'"],
            ['claim_evidence', "id LIKE 'seed-%'"],
            ['repository', "id LIKE 'seed-%'"],
            ['permission_grant', "id LIKE 'seed-%'"],
            ['sync_conflict_record', "id LIKE 'seed-%'"],
            ['users', "user_id LIKE 'seed-%'"],
        ];

        console.log(`Seed complete at ${databasePath}`);
        for (const [table, whereClause] of seededCounts) {
            if (!availability[table]) {
                continue;
            }
            const countResult = await client.execute({
                sql: `SELECT COUNT(*) AS count FROM ${table} WHERE ${whereClause}`,
            });
            const first = Array.isArray(countResult.rows) ? countResult.rows[0] : null;
            const count = first && typeof first === 'object' && 'count' in first
                ? Number(first.count)
                : 0;
            console.log(`  ${table}: ${count}`);
        }
    } catch (error) {
        try {
            await client.execute('ROLLBACK');
        } catch {
            // Ignore rollback errors when transaction did not start.
        }
        throw error;
    } finally {
        await client.close();
    }
};

seedSampleData().catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
});
