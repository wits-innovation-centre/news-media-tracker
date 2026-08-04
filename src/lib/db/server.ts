export interface Env {
  DB: D1Database;
}

import { anchorPendingRecords } from "../ledger-cron/worker";
import {
  WAYBACK_ARCHIVE_TYPE,
  WAYBACK_SYNC_STATUS,
  buildWaybackArchiveSeed,
  saveWaybackSnapshotUrl,
} from "../archive/utils";

interface PushPayload {
  workspace_id: string;
  notes: any[];
  proposals: any[];
  archives: any[];
}

interface WaybackRequestPayload {
  workspace_id?: string;
  article_id: string;
  url: string;
  process_now?: boolean;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(anchorPendingRecords(env));
    ctx.waitUntil(processPendingWaybackArchives(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers setup
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };

    // 1. PUSH: Client sends un-synced notes, proposals and archives to D1
    if (url.pathname === "/api/sync/push" && request.method === "POST") {
      const { workspace_id, notes, proposals, archives } = (await request.json()) as PushPayload;
      const batchStatements: D1PreparedStatement[] = [];

      if (Array.isArray(notes)) {
        for (const note of notes) {
          let frontmatter: Record<string, any> | undefined;
          if (typeof note.frontmatter === "string") {
            try {
              frontmatter = JSON.parse(note.frontmatter);
            } catch {
              frontmatter = undefined;
            }
          } else if (note.frontmatter && typeof note.frontmatter === "object") {
            frontmatter = note.frontmatter;
          }

          batchStatements.push(
            env.DB.prepare(`
              INSERT INTO notes (
                id, workspace_id, schema_id, parent_id, title, frontmatter, body, 
                created_by, updated_by, deleted_by, user_id, device_id, created_at, updated_at, is_deleted
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                schema_id = excluded.schema_id,
                parent_id = excluded.parent_id,
                title = excluded.title,
                frontmatter = excluded.frontmatter,
                body = excluded.body,
                updated_by = excluded.updated_by,
                deleted_by = excluded.deleted_by,
                user_id = excluded.user_id,
                device_id = excluded.device_id,
                updated_at = excluded.updated_at,
                is_deleted = excluded.is_deleted
              WHERE excluded.updated_at > notes.updated_at
            `).bind(
              note.id, workspace_id, note.schema_id, note.parent_id ?? null,
              note.title, note.frontmatter, note.body,
              note.created_by ?? null, note.updated_by ?? null, note.deleted_by ?? null,
              note.user_id ?? note.updated_by ?? note.created_by ?? null,
              note.device_id ?? null,
              note.created_at, note.updated_at, note.is_deleted
            )
          );

          if (frontmatter?.url && typeof frontmatter.url === "string" && frontmatter.url.trim()) {
            const waybackSeed = await buildWaybackArchiveSeed(note.id, frontmatter.url, workspace_id);
            batchStatements.push(
              env.DB.prepare(`
                INSERT INTO archival_records (
                  id, article_id, workspace_id, archive_type, sha256_hash,
                  uri_or_path, file_size_bytes, device_id, last_verified_at,
                  health_status, sync_status, blockchain_tx_hash, blockchain_network,
                  ots_proof_payload, anchored_at, created_at, updated_at, is_deleted, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'UNCHECKED', ?, NULL, NULL, NULL, NULL, ?, ?, 0, NULL)
                ON CONFLICT(id) DO UPDATE SET
                  article_id = excluded.article_id,
                  workspace_id = excluded.workspace_id,
                  archive_type = excluded.archive_type,
                  sha256_hash = excluded.sha256_hash,
                  uri_or_path = excluded.uri_or_path,
                  health_status = excluded.health_status,
                  sync_status = excluded.sync_status,
                  updated_at = excluded.updated_at,
                  is_deleted = 0,
                  synced_at = NULL
              `).bind(
                waybackSeed.id,
                note.id,
                workspace_id,
                WAYBACK_ARCHIVE_TYPE,
                waybackSeed.sha256Hash,
                waybackSeed.sourceUrl,
                "wayback-worker",
                WAYBACK_SYNC_STATUS.pending,
                waybackSeed.createdAt,
                waybackSeed.updatedAt
              )
            );
          }
        }
      }

      if (Array.isArray(proposals)) {
        for (const prop of proposals) {
          batchStatements.push(
            env.DB.prepare(`
              INSERT INTO merge_queue (
                id, workspace_id, document_id, secondary_document_id, author_id, user_id, device_id, action,
                source_id, target_id, entity_type, similarity_score,
                base_frontmatter, base_body, secondary_base_frontmatter, secondary_base_body,
                proposed_title, proposed_frontmatter, proposed_body, metadata, status, 
                reviewed_by, review_comment, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                document_id = excluded.document_id,
                secondary_document_id = excluded.secondary_document_id,
                source_id = excluded.source_id,
                target_id = excluded.target_id,
                entity_type = excluded.entity_type,
                similarity_score = excluded.similarity_score,
                proposed_title = excluded.proposed_title,
                proposed_frontmatter = excluded.proposed_frontmatter,
                proposed_body = excluded.proposed_body,
                metadata = excluded.metadata,
                status = excluded.status,
                reviewed_by = excluded.reviewed_by,
                review_comment = excluded.review_comment,
                updated_at = excluded.updated_at
              WHERE excluded.updated_at > merge_queue.updated_at
            `).bind(
              prop.id, workspace_id, prop.document_id, prop.secondary_document_id ?? null, prop.author_id,
              prop.user_id ?? prop.author_id ?? null, prop.device_id ?? null, prop.action,
              prop.source_id ?? prop.secondary_document_id ?? null,
              prop.target_id ?? prop.document_id,
              prop.entity_type ?? null,
              prop.similarity_score ?? null,
              prop.base_frontmatter ?? null, prop.base_body ?? null,
              prop.secondary_base_frontmatter ?? null, prop.secondary_base_body ?? null,
              prop.proposed_title, prop.proposed_frontmatter, prop.proposed_body,
              prop.metadata ?? null, prop.status, prop.reviewed_by ?? null, prop.review_comment ?? null,
              prop.created_at, prop.updated_at
            )
          );
        }
      }

      if (Array.isArray(archives)) {
        for (const archive of archives) {
          batchStatements.push(
            env.DB.prepare(`
              INSERT INTO archival_records (
                id, article_id, workspace_id, archive_type, sha256_hash,
                ipfs_cid, torrent_infohash, uri_or_path, file_size_bytes, device_id,
                last_verified_at, health_status, sync_status, blockchain_tx_hash,
                blockchain_network, ots_proof_payload, anchored_at,
                created_at, updated_at, is_deleted
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                article_id = excluded.article_id,
                archive_type = excluded.archive_type,
                sha256_hash = excluded.sha256_hash,
                ipfs_cid = excluded.ipfs_cid,
                torrent_infohash = excluded.torrent_infohash,
                uri_or_path = excluded.uri_or_path,
                file_size_bytes = excluded.file_size_bytes,
                device_id = excluded.device_id,
                last_verified_at = excluded.last_verified_at,
                health_status = excluded.health_status,
                sync_status = excluded.sync_status,
                blockchain_tx_hash = excluded.blockchain_tx_hash,
                blockchain_network = excluded.blockchain_network,
                ots_proof_payload = excluded.ots_proof_payload,
                anchored_at = excluded.anchored_at,
                updated_at = excluded.updated_at,
                is_deleted = excluded.is_deleted
              WHERE excluded.updated_at > archival_records.updated_at
            `).bind(
              archive.id,
              archive.article_id,
              workspace_id,
              archive.archive_type,
              archive.sha256_hash,
              archive.ipfs_cid ?? null,
              archive.torrent_infohash ?? null,
              archive.uri_or_path ?? null,
              archive.file_size_bytes ?? null,
              archive.device_id,
              archive.last_verified_at ?? null,
              archive.health_status ?? "UNCHECKED",
              archive.sync_status ?? "PENDING_ANCHOR",
              archive.blockchain_tx_hash ?? null,
              archive.blockchain_network ?? null,
              archive.ots_proof_payload ?? null,
              archive.anchored_at ?? null,
              archive.created_at,
              archive.updated_at,
              archive.is_deleted ?? 0
            )
          );
        }
      }

      if (batchStatements.length > 0) {
        await env.DB.batch(batchStatements);
      }

      return new Response(JSON.stringify({ success: true, timestamp: Date.now() }), { headers });
    }

    // 2. PULL: Return remote updates to client
    if (url.pathname === "/api/sync/pull" && request.method === "GET") {
      const workspace_id = url.searchParams.get("workspace_id") ?? "default";
      const since = parseInt(url.searchParams.get("since") ?? "0", 10);

      const notes = await env.DB.prepare(
        "SELECT * FROM notes WHERE workspace_id = ? AND updated_at > ?"
      ).bind(workspace_id, since).all();

      const proposals = await env.DB.prepare(
        "SELECT * FROM merge_queue WHERE workspace_id = ? AND updated_at > ?"
      ).bind(workspace_id, since).all();

      const archives = await env.DB.prepare(
        "SELECT * FROM archival_records WHERE workspace_id = ? AND updated_at > ?"
      ).bind(workspace_id, since).all();

      return new Response(JSON.stringify({
        timestamp: Date.now(),
        notes: notes.results,
        proposals: proposals.results,
        archives: archives.results,
      }), { headers });
    }

    if (url.pathname === "/api/archive/wayback/request" && request.method === "POST") {
      const payload = (await request.json()) as WaybackRequestPayload;
      const workspaceId = payload.workspace_id ?? "default";
      const seed = await buildWaybackArchiveSeed(payload.article_id, payload.url, workspaceId);
      const now = Date.now();

      await env.DB.prepare(
        `INSERT INTO archival_records (
           id, article_id, workspace_id, archive_type, sha256_hash,
           uri_or_path, file_size_bytes, device_id, last_verified_at,
           health_status, sync_status, blockchain_tx_hash, blockchain_network,
           ots_proof_payload, anchored_at, created_at, updated_at, is_deleted, synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'UNCHECKED', ?, NULL, NULL, NULL, NULL, ?, ?, 0, NULL)
         ON CONFLICT(id) DO UPDATE SET
           article_id = excluded.article_id,
           workspace_id = excluded.workspace_id,
           archive_type = excluded.archive_type,
           sha256_hash = excluded.sha256_hash,
           uri_or_path = excluded.uri_or_path,
           health_status = excluded.health_status,
           sync_status = excluded.sync_status,
           updated_at = excluded.updated_at,
           is_deleted = 0,
           synced_at = NULL`
      ).bind(
        seed.id,
        payload.article_id,
        workspaceId,
        WAYBACK_ARCHIVE_TYPE,
        seed.sha256Hash,
        seed.sourceUrl,
        "wayback-worker",
        WAYBACK_SYNC_STATUS.pending,
        seed.createdAt,
        now
      ).run();

      if (!payload.process_now) {
        return new Response(JSON.stringify({
          success: true,
          queued: true,
          record_id: seed.id,
          status: WAYBACK_SYNC_STATUS.pending,
        }), { headers });
      }

      try {
        const snapshotUrl = await saveWaybackSnapshotUrl(seed.sourceUrl);
        const verifiedAt = Date.now();
        await env.DB.prepare(
          `UPDATE archival_records
           SET uri_or_path = ?,
               sync_status = 'SYNCED',
               health_status = 'HEALTHY',
               last_verified_at = ?,
               updated_at = ?
           WHERE id = ?`
        ).bind(snapshotUrl, verifiedAt, verifiedAt, seed.id).run();

        return new Response(JSON.stringify({
          success: true,
          queued: true,
          record_id: seed.id,
          status: WAYBACK_SYNC_STATUS.synced,
          uri_or_path: snapshotUrl,
          last_verified_at: verifiedAt,
        }), { headers });
      } catch (error) {
        console.error("Wayback request failed", error);
        const failedAt = Date.now();
        await env.DB.prepare(
          `UPDATE archival_records
           SET sync_status = 'FAILED',
               updated_at = ?
           WHERE id = ?`
        ).bind(failedAt, seed.id).run();

        return new Response(JSON.stringify({
          success: false,
          queued: true,
          record_id: seed.id,
          status: WAYBACK_SYNC_STATUS.failed,
        }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/archive/wayback/process" && request.method === "POST") {
      const result = await processPendingWaybackArchives(env);
      return new Response(JSON.stringify(result), { headers });
    }

    // Optional manual trigger for immediate anchoring
    if (url.pathname === "/api/ledger/anchor" && request.method === "POST") {
      const result = await anchorPendingRecords(env);
      return new Response(JSON.stringify(result), { headers });
    }

    return new Response("Not Found", { status: 404, headers });
  }
};

async function processPendingWaybackArchives(env: Env, limit = 25) {
  const { results } = await env.DB.prepare(
    `SELECT id, article_id, workspace_id, uri_or_path, updated_at
     FROM archival_records
     WHERE archive_type = ?
       AND sync_status = ?
       AND is_deleted = 0
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(WAYBACK_ARCHIVE_TYPE, WAYBACK_SYNC_STATUS.pending, limit).all<{
    id: string;
    article_id: string;
    workspace_id: string;
    uri_or_path: string | null;
    updated_at: number;
  }>();

  if (!results || results.length === 0) {
    return { status: "NO_PENDING_RECORDS", processed: 0 };
  }

  const processed: Array<{ id: string; status: string; uri_or_path?: string | null }> = [];

  for (const record of results) {
    try {
      const originalUrl = record.uri_or_path?.trim();
      if (!originalUrl) {
        throw new Error("Wayback archival record does not have a source URL.");
      }

      const snapshotUrl = await saveWaybackSnapshotUrl(originalUrl);
      const verifiedAt = Date.now();
      await env.DB.prepare(
        `UPDATE archival_records
         SET uri_or_path = ?,
             sync_status = 'SYNCED',
             health_status = 'HEALTHY',
             last_verified_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).bind(snapshotUrl, verifiedAt, verifiedAt, record.id).run();

      processed.push({ id: record.id, status: WAYBACK_SYNC_STATUS.synced, uri_or_path: snapshotUrl });
    } catch (error) {
      console.error(`Wayback archival failed for ${record.id}:`, error);
      const failedAt = Date.now();
      await env.DB.prepare(
        `UPDATE archival_records
         SET sync_status = 'FAILED',
             updated_at = ?
         WHERE id = ?`
      ).bind(failedAt, record.id).run();

      processed.push({ id: record.id, status: WAYBACK_SYNC_STATUS.failed, uri_or_path: record.uri_or_path });
    }
  }

  return { status: "SUCCESS", processed: processed.length, records: processed };
}