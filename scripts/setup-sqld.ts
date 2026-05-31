/* eslint-disable no-console */
/**
 * setup-sqld.ts
 *
 * Connects to a running sqld (libSQL) server, applies all schema migrations,
 * and inserts idempotent sample data.
 *
 * Usage:
 *   pnpm run seed.sqld
 *   LIBSQL_URL=http://localhost:8080 SQLD_AUTH_TOKEN=<token> pnpm run seed.sqld
 *
 * Defaults:
 *   LIBSQL_URL  — http://localhost:8080
 *   SQLD_AUTH_TOKEN — (empty — suitable for unauthenticated local sqld)
 */

import { createClient } from '@libsql/client';
import { migrations } from '../lib/db/schema';

const ROLE_VOCAB_KEY = 'event_actor_role';

const url = process.env.LIBSQL_URL ?? 'http://localhost:8080';
const authToken = process.env.SQLD_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? undefined;

const client = createClient({ url, authToken });

// ─── helpers ──────────────────────────────────────────────────────────────────

const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await client.execute({
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        args: [tableName],
    });
    return Array.isArray(result.rows) && result.rows.length > 0;
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

// ─── main ─────────────────────────────────────────────────────────────────────

const run = async () => {
    console.log(`Connecting to sqld at ${url} …`);

    // 1. Run migrations
    console.log(`\nRunning ${migrations.length} migrations …`);
    let migrationErrors = 0;
    for (const sql of migrations) {
        try {
            await client.execute(sql);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Idempotent DDL (ALTER TABLE adding a column that already exists) is OK
            const isAlterDuplicate =
                sql.startsWith('ALTER TABLE') &&
                msg.toLowerCase().includes('duplicate column name');
            if (!isAlterDuplicate) {
                console.warn(`  migration warning: ${msg.slice(0, 120)}`);
                migrationErrors++;
            }
        }
    }
    if (migrationErrors === 0) {
        console.log('  migrations complete (no unexpected errors)');
    } else {
        console.warn(`  migrations complete with ${migrationErrors} warning(s)`);
    }

    // 2. Check table availability
    const availability: Record<string, boolean> = {};
    for (const table of TABLES) {
        availability[table] = await tableExists(table);
    }
    const missing = TABLES.filter((t) => !availability[t]);
    if (missing.length > 0) {
        console.warn('\nSkipping unavailable tables:', missing.join(', '));
    }

    // 3. Seed data
    console.log('\nSeeding sample data …');
    await client.execute('BEGIN TRANSACTION');

    try {
        if (availability['users']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO users (user_id, username, email, role, is_active, last_login_at)
              VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-user-owner', 'seed.owner', 'owner@example.org', 'admin', 1, '2026-05-13T08:00:00.000Z',
                    'seed-user-researcher', 'seed.researcher', 'researcher@example.org', 'researcher', 1, '2026-05-14T09:15:00.000Z',
                ],
            });
        }

        if (availability['repository']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO repository (id, name, description, visibility, owner_id, created_by)
              VALUES (?, ?, ?, ?, ?, ?)`,
                args: ['seed-repo-main', 'Homicide Coverage Dataset', 'Sample workspace seeded for local analytics and UI demos.', 'private', 'seed-user-owner', 'seed-user-owner'],
            });
        }

        if (availability['membership']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO membership (id, repository_id, user_id, role, invited_by)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-membership-owner', 'seed-repo-main', 'seed-user-owner', 'owner', 'seed-user-owner',
                    'seed-membership-researcher', 'seed-repo-main', 'seed-user-researcher', 'editor', 'seed-user-owner',
                ],
            });
        }

        if (availability['permission_grant']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO permission_grant (
                id, repository_id, grantee_user_id, resource_type, resource_id, action, granted_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-permission-export', 'seed-repo-main', 'seed-user-researcher', 'repository', 'seed-repo-main', 'export', 'seed-user-owner',
                    'seed-permission-annotate', 'seed-repo-main', 'seed-user-researcher', 'annotation', null, 'write', 'seed-user-owner',
                ],
            });
        }

        if (availability['app_config']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO app_config (key, value, value_type, description)
              VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
                args: [
                    'seed.last_run', '2026-05-14T12:00:00.000Z', 'string', 'Last time development sample data was seeded.',
                    'seed.mode', 'demo', 'string', 'Current sample data profile.',
                ],
            });
        }

        if (availability['articles']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO articles (
                id, news_report_id, news_report_url, news_report_headline, date_of_publication,
                author, wire_service, language, type_of_source, news_report_platform, notes
              ) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-article-001', 'NR-2026-0001', 'https://example.org/reports/metro-homicide-1', 'Police investigate overnight shooting in central district', '2026-05-10', 'A. Reporter', 'Local Wire', 'English', 'newspaper', 'web', 'Primary narrative source for Event A.',
                    'seed-article-002', 'NR-2026-0002', 'https://example.org/reports/community-witnesses', 'Witnesses describe timeline before fatal incident', '2026-05-11', 'B. Journalist', 'City Press', 'English', 'news site', 'web', 'Contains witness timeline and location clarifications.',
                    'seed-article-003', 'NR-2026-0003', 'https://example.org/reports/court-appearance', 'Suspect appears in court as charges are outlined', '2026-05-13', 'C. Correspondent', 'Regional Desk', 'English', 'court record digest', 'print', 'Follow-up coverage for legal process and charges.',
                ],
            });
        }

        if (availability['participants']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO participants (id, role, details) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
                args: [
                    'seed-participant-victim-001', 'victim', JSON.stringify({ name: 'N. Dlamini', age: 29 }),
                    'seed-participant-perpetrator-001', 'perpetrator', JSON.stringify({ name: 'T. Maseko', arrested: true }),
                    'seed-participant-witness-001', 'witness', JSON.stringify({ name: 'Witness A', statementCount: 2 }),
                    'seed-participant-officer-001', 'investigator', JSON.stringify({ unit: 'SAPS Metro Unit', badge: '4821' }),
                ],
            });
        }

        if (availability['events']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO events (id, event_types, article_ids, participant_ids, details) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-event-001',
                    JSON.stringify(['homicide', 'shooting']),
                    JSON.stringify(['seed-article-001', 'seed-article-002']),
                    JSON.stringify(['seed-participant-victim-001', 'seed-participant-perpetrator-001', 'seed-participant-witness-001']),
                    JSON.stringify({ location: 'Central District', incidentTime: '2026-05-09T23:40:00.000Z' }),
                    'seed-event-002',
                    JSON.stringify(['court_proceeding']),
                    JSON.stringify(['seed-article-003']),
                    JSON.stringify(['seed-participant-perpetrator-001']),
                    JSON.stringify({ court: 'Johannesburg Magistrates Court', hearingType: 'first appearance' }),
                ],
            });
        }

        if (availability['report_annotations']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO report_annotations (id, source_article_id, target_article_id, relation_type, notes)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-annotation-report-001', 'seed-article-001', 'seed-article-002', 'follow_up', 'Second report contributes witness details and corrected timing.',
                    'seed-annotation-report-002', 'seed-article-001', 'seed-article-003', 'legal_update', 'Third report tracks judicial progression of same incident.',
                ],
            });
        }

        if (availability['victims']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO victims (
                id, article_id, victim_name, victim_alias, victim_aliases, date_of_death,
                date_of_death_mode, place_of_death_province, place_of_death_town,
                type_of_location, police_station, gender_of_victim, race_of_victim,
                nationality, age_of_victim, age_range_of_victim, age_descriptor,
                mode_of_death_specific, mode_of_death_general, type_of_murder
              ) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-victim-001', 'seed-article-001', 'Nomsa Dlamini', 'N. Dlamini', JSON.stringify(['Nomsa D.', 'N. Dlamini']),
                    '2026-05-09', 'EXACT', 'Gauteng', 'Johannesburg', 'street', 'Hillbrow SAPS',
                    'female', 'Black African', 'South African', 29, '25-34', 'adult',
                    'gunshot wound', 'shooting', 'single-victim homicide',
                    // Intentional near-duplicate to exercise merge flow in dev.
                    'seed-victim-002', 'seed-article-002', 'Nomsa Dlamini', 'Nomsa D.', JSON.stringify(['N. Dlamini', 'Nomsa D.']),
                    '2026-05-09', 'EXACT', 'Gauteng', 'Johannesburg', 'residential area', 'Hillbrow SAPS',
                    'female', 'Black African', 'South African', 30, '25-34', 'adult',
                    'gunshot wound', 'shooting', 'single-victim homicide',
                ],
            });
        }

        if (availability['perpetrators']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO perpetrators (
                id, article_id, perpetrator_name, perpetrator_alias, suspect_aliases,
                perpetrator_relationship_to_victim, suspect_identified, suspect_arrested,
                suspect_charged, charges, conviction, sentence
              ) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-perpetrator-001', 'seed-article-003', 'Thabo Maseko', 'T. Maseko',
                    JSON.stringify(['TM', 'Thabo M.']), 'acquaintance', 'yes', 'yes', 'yes',
                    'Murder and illegal firearm possession', 'pending', null,
                    // Intentional near-duplicate to exercise merge flow in dev.
                    'seed-perpetrator-002', 'seed-article-002', 'Thabo Maseko', 'Thabo M.',
                    JSON.stringify(['T. Maseko', 'TM']), 'acquaintance', 'yes', 'yes', 'no',
                    'Murder under investigation', 'pending', null,
                ],
            });
        }

        if (availability['schema_profile']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO schema_profile (id, name, entity_level, description) VALUES (?, ?, ?, ?)`,
                args: ['default', 'Homicide default', 'event', 'Default homicide event schema profile'],
            });
        }

        if (availability['schema_field']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO schema_field (profile_id, entity_type, field_key, field_type, field_config)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'default', 'event', 'event_type', 'string', JSON.stringify({}),
                    'default', 'actor', 'occupation', 'string', JSON.stringify({ nullable: true }),
                ],
            });
        }

        if (availability['schema_vocab_term']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO schema_vocab_term (vocab_key, term_key, label, description, is_system)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    ROLE_VOCAB_KEY, 'victim', 'Victim', null, 1,
                    ROLE_VOCAB_KEY, 'perpetrator', 'Perpetrator', null, 1,
                    ROLE_VOCAB_KEY, 'witness', 'Witness', null, 1,
                ],
            });
        }

        if (availability['annotation_event']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO annotation_event (
                id, profile_id, event_type, datetime_mode, event_date, start_date, end_date,
                location_point, location_fallback, location_type, notes, confidence, created_by
              ) VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    'seed-annotation-event-exact', 'default', 'homicide', 'EXACT', '2026-05-09', null, null,
                    JSON.stringify({ lat: -26.2041, lng: 28.0473 }), 'Central District', JSON.stringify(['urban', 'street']),
                    'Exact-date event representation.', 92, 'seed-user-researcher',
                    'seed-annotation-event-range', 'default', 'investigation', 'RANGE', null, '2026-05-10', '2026-05-13',
                    null, 'Johannesburg CBD', JSON.stringify(['urban']), 'Range-based investigative timeline.', 78, 'seed-user-researcher',
                    'seed-annotation-event-unknown', 'default', 'prior_threat', 'UNKNOWN', null, null, null,
                    null, 'Unknown location', JSON.stringify(['unknown']), 'Unknown date used for sparse-source evidence.', 45, 'seed-user-researcher',
                ],
            });
        }

        if (availability['actor']) {
            await client.execute({
                sql: `INSERT OR IGNORE INTO actor (id, canonical_label, actor_kind, status, schema_profile_id)
              VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
                args: [
                    'seed-actor-victim-001', 'Nomsa Dlamini', 'person', 'active', 'default',
                    'seed-actor-perpetrator-001', 'Thabo Maseko', 'person', 'active', 'default',
                    'seed-actor-witness-001', 'Witness A', 'person', 'active', 'default',
                ],
            });
        }

        await client.execute('COMMIT');
        console.log('  sample data seeded successfully');
    } catch (err) {
        await client.execute('ROLLBACK');
        throw err;
    } finally {
        client.close();
    }

    console.log('\nDone. sqld is ready at', url);
    console.log('\nTo query it:');
    console.log(`  curl -s ${url}/v2/pipeline \\`);
    console.log(`    -H 'Content-Type: application/json' \\`);
    console.log(`    -d '{"requests":[{"type":"execute","stmt":{"sql":"SELECT name FROM sqlite_master WHERE type=\\'table\\'"}},{"type":"close"}]}'`);
};

run().catch((err) => {
    console.error('\nSetup failed:', err);
    process.exit(1);
});
