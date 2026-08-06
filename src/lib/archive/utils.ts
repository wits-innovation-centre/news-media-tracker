import { dbClient } from "@/lib/db/client";
import { archiveClient, getOrCreateDeviceId } from "./client";
import {
  buildCanonicalReportPayload,
  hashStringToSha256Hex,
} from "../ledger-cron/utils";

export const WAYBACK_ARCHIVE_TYPE = "WAYBACK_MACHINE" as const;

export const WAYBACK_SYNC_STATUS = {
  pending: "PENDING_SYNC",
  synced: "SYNCED",
  failed: "FAILED",
} as const;

export interface WaybackArchiveSeed {
  id: string;
  articleId: string;
  workspaceId: string;
  archiveType: typeof WAYBACK_ARCHIVE_TYPE;
  sha256Hash: string;
  sourceUrl: string;
  createdAt: number;
  updatedAt: number;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeWaybackSourceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A source URL is required to queue a Wayback snapshot.");
  }

  return trimmed;
}

export async function hashWaybackSourceUrl(value: string): Promise<string> {
  const normalized = normalizeWaybackSourceUrl(value);
  const encoded = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(digest);
}

export async function buildWaybackArchiveSeed(
  articleId: string,
  sourceUrl: string,
  workspaceId: string = "default"
): Promise<WaybackArchiveSeed> {
  const normalizedUrl = normalizeWaybackSourceUrl(sourceUrl);
  const sha256Hash = await hashWaybackSourceUrl(normalizedUrl);
  const now = Date.now();

  return {
    id: `wayback-${articleId}-${sha256Hash}`,
    articleId,
    workspaceId,
    archiveType: WAYBACK_ARCHIVE_TYPE,
    sha256Hash,
    sourceUrl: normalizedUrl,
    createdAt: now,
    updatedAt: now,
  };
}

export async function extractWaybackSnapshotUrl(response: Response): Promise<string | null> {
  const location = response.headers.get("location") ?? response.headers.get("content-location");
  if (location) {
    try {
      return new URL(location, "https://web.archive.org").toString();
    } catch {
      return null;
    }
  }

  const body = await response.text();
  const match = body.match(/https:\/\/web\.archive\.org\/web\/[^\s"'<>]+/i);
  if (match) {
    return match[0];
  }

  if (response.url.includes("/web/")) {
    return response.url;
  }

  return null;
}

export async function saveWaybackSnapshotUrl(sourceUrl: string, maxAttempts = 5): Promise<string> {
  const normalizedUrl = normalizeWaybackSourceUrl(sourceUrl);
  const saveUrl = `https://web.archive.org/save/${encodeURIComponent(normalizedUrl)}`;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(saveUrl, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; Wayback sync worker)",
        },
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds = Number.parseInt(retryAfterHeader ?? "", 10);
        const backoffMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!response.ok && response.status !== 302 && response.status !== 303 && response.status !== 307) {
        throw new Error(`Wayback Save API returned ${response.status}`);
      }

      const snapshotUrl = await extractWaybackSnapshotUrl(response);
      if (!snapshotUrl) {
        throw new Error("Wayback Save API did not return a snapshot URL.");
      }

      return snapshotUrl;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        const backoffMs = 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to archive the provided URL on the Wayback Machine.");
}

/**
 * Persists or updates a Wayback Machine archival record in SQLite.
 */
export async function saveWaybackArchiveRequest(
  articleId: string,
  sourceUrl: string,
  workspaceId: string = "default",
  syncStatus: string = WAYBACK_SYNC_STATUS.pending,
  snapshotUrl?: string | null,
  lastVerifiedAt?: number | null
) {
  const seed = await buildWaybackArchiveSeed(articleId, sourceUrl, workspaceId);
  const now = Date.now();

  await dbClient.execute(
    `INSERT INTO archival_records (
       id, article_id, workspace_id, archive_type, sha256_hash,
       uri_or_path, file_size_bytes, device_id, last_verified_at,
       health_status, sync_status, blockchain_tx_hash, blockchain_network,
       ots_proof_payload, anchored_at, created_at, updated_at, is_deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, 0, NULL)
     ON CONFLICT(id) DO UPDATE SET
       article_id = excluded.article_id,
       workspace_id = excluded.workspace_id,
       archive_type = excluded.archive_type,
       sha256_hash = excluded.sha256_hash,
       uri_or_path = excluded.uri_or_path,
       last_verified_at = excluded.last_verified_at,
       health_status = excluded.health_status,
       sync_status = excluded.sync_status,
       updated_at = excluded.updated_at,
       is_deleted = 0,
       synced_at = NULL`,
    [
      seed.id,                         // 1: id
      articleId,                       // 2: article_id
      workspaceId,                     // 3: workspace_id
      WAYBACK_ARCHIVE_TYPE,            // 4: archive_type
      seed.sha256Hash,                 // 5: sha256_hash
      snapshotUrl ?? seed.sourceUrl,   // 6: uri_or_path
      getOrCreateDeviceId(),           // 7: device_id
      lastVerifiedAt ?? null,          // 8: last_verified_at
      "UNCHECKED",                     // 9: health_status
      syncStatus,                      // 10: sync_status
      seed.createdAt,                  // 11: created_at
      now,                             // 12: updated_at
    ]
  );

  return {
    ...seed,
    uriOrPath: snapshotUrl ?? seed.sourceUrl,
    syncStatus,
    lastVerifiedAt: lastVerifiedAt ?? null,
  };
}

export async function ingestDocumentArchive(
  articleId: string,
  file: File,
  archiveType: string = "LOCAL_OPFS",
  workspaceId: string = "default"
) {
  const recordId = `arch-${crypto.randomUUID()}`;
  const deviceId = getOrCreateDeviceId();
  const buffer = await file.arrayBuffer();

  // 1. Offload hashing and OPFS storage to Archive Worker
  const result = await archiveClient.saveAndHashArchive({
    recordId,
    articleId,
    fileBuffer: buffer,
    fileName: file.name,
    archiveType,
    deviceId,
  });

  const now = Date.now();

  // 2. Persist archival record to SQLite via dbClient
  await dbClient.execute(
    `INSERT INTO archival_records (
      id, article_id, workspace_id, archive_type, sha256_hash, 
      uri_or_path, file_size_bytes, device_id, last_verified_at, 
      health_status, sync_status, created_at, updated_at, is_deleted, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    [
      result.recordId,
      articleId,
      workspaceId,
      archiveType,
      result.sha256Hash,
      result.storagePath,
      result.fileSizeBytes,
      deviceId,
      result.lastVerifiedAt,
      result.healthStatus,
      "PENDING_ANCHOR",
      now,
      now,
    ]
  );

  return result;
}

/**
 * Runs a background health check across all locally stored OPFS documents
 */
export async function runLocalHealthCheck(workspaceId: string = "default") {
  const records = await dbClient.query(
    `SELECT id, sha256_hash, uri_or_path 
     FROM archival_records 
     WHERE workspace_id = ? AND archive_type = 'LOCAL_OPFS' AND is_deleted = 0`,
    [workspaceId]
  );

  for (const record of records) {
    const healthResult = await archiveClient.verifyArchiveHealth(
      record.id,
      record.uri_or_path,
      record.sha256_hash
    );

    const now = Date.now();
    await dbClient.execute(
      `UPDATE archival_records 
       SET health_status = ?, last_verified_at = ?, updated_at = ?, synced_at = NULL 
       WHERE id = ?`,
      [healthResult.healthStatus, healthResult.lastVerifiedAt, now, record.id]
    );
  }
}

/**
 * Hashes report content and upserts a pending anchor record so the server-side
 * ledger job can batch it into an OpenTimestamps proof.
 */
export async function upsertReportPendingAnchor(
  articleId: string,
  frontmatter: Record<string, unknown>,
  body: string,
  workspaceId: string = "default"
) {
  const payload = buildCanonicalReportPayload(frontmatter, body);
  const sha256Hash = await hashStringToSha256Hex(payload);
  const now = Date.now();
  const recordId = `rep-${articleId}`;
  const deviceId = getOrCreateDeviceId();

  await dbClient.execute(
    `INSERT INTO archival_records (
      id, article_id, workspace_id, archive_type, sha256_hash,
      uri_or_path, file_size_bytes, device_id, last_verified_at,
      health_status, sync_status, blockchain_tx_hash, blockchain_network,
      ots_proof_payload, anchored_at, created_at, updated_at, is_deleted, synced_at
    ) VALUES (?, ?, ?, 'REPORT_CONTENT', ?, ?, NULL, ?, ?, 'HEALTHY', 'PENDING_ANCHOR', NULL, NULL, NULL, NULL, ?, ?, 0, NULL)
    ON CONFLICT(id) DO UPDATE SET
      sha256_hash = excluded.sha256_hash,
      uri_or_path = excluded.uri_or_path,
      health_status = 'HEALTHY',
      sync_status = 'PENDING_ANCHOR',
      blockchain_tx_hash = NULL,
      blockchain_network = NULL,
      ots_proof_payload = NULL,
      anchored_at = NULL,
      updated_at = excluded.updated_at,
      synced_at = NULL`,
    [
      recordId,
      articleId,
      workspaceId,
      sha256Hash,
      `note:${articleId}`,
      deviceId,
      now,
      now,
      now,
    ]
  );

  return {
    recordId,
    sha256Hash,
    syncStatus: "PENDING_ANCHOR" as const,
  };
}