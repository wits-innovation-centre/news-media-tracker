// lib/archive/auxiliary.ts
import { dbClient } from "@/lib/db/client";
import { archiveClient, getOrCreateDeviceId } from "./client";

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
    deviceId
  });

  const now = Date.now();

  // 2. Persist archival record to SQLite via dbClient
  await dbClient.execute(
    `INSERT INTO archival_records (
      id, article_id, workspace_id, archive_type, sha256_hash, 
      uri_or_path, file_size_bytes, device_id, last_verified_at, 
      health_status, created_at, updated_at, is_deleted, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
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
      now,
      now
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