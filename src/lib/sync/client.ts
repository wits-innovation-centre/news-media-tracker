// src/lib/sync/client.ts

import { dbClient } from "@/lib/db/client";
import { deleteWorkspace, getActiveWorkspaceId } from "@/lib/db/utils";
import { ensureWorkspaceOwnerSession } from "@/lib/auth/invites";
import { defaultTransport, type SyncTransport } from "./transport";

export const SYNC_SERVER_URL = import.meta.env.DEV
  ? "http://localhost:8787"
  : import.meta.env.VITE_SYNC_SERVER_URL;

export async function synchronizeWorkspace(
  workspaceId: string = getActiveWorkspaceId(),
  transport: SyncTransport = defaultTransport
) {
  if (!navigator.onLine) return;

  // Ensure an active session token exists for this workspace before syncing
  await ensureWorkspaceOwnerSession(workspaceId);

  try {
    const unsyncedNotes = await dbClient.query(
      "SELECT * FROM notes WHERE workspace_id = ? AND synced_at IS NULL",
      [workspaceId]
    );
    const unsyncedProposals = await dbClient.query(
      "SELECT * FROM merge_queue WHERE workspace_id = ? AND synced_at IS NULL",
      [workspaceId]
    );
    const unsyncedArchives = await dbClient.query(
      "SELECT * FROM archival_records WHERE workspace_id = ? AND synced_at IS NULL",
      [workspaceId]
    );

    const now = Date.now();

    // 1. PUSH local changes using the Transport interface
    if (unsyncedNotes.length > 0 || unsyncedProposals.length > 0 || unsyncedArchives.length > 0) {
      const success = await transport.push({
        workspace_id: workspaceId,
        notes: unsyncedNotes,
        proposals: unsyncedProposals,
        archives: unsyncedArchives,
      });

      if (success) {
        await dbClient.execute(
          "UPDATE notes SET synced_at = ? WHERE workspace_id = ? AND synced_at IS NULL",
          [now, workspaceId]
        );
        await dbClient.execute(
          "UPDATE merge_queue SET synced_at = ? WHERE workspace_id = ? AND synced_at IS NULL",
          [now, workspaceId]
        );
        await dbClient.execute(
          "UPDATE archival_records SET synced_at = ? WHERE workspace_id = ? AND synced_at IS NULL",
          [now, workspaceId]
        );
      }
    }

    // 2. PULL remote changes using the Transport interface
    const lastSyncKey = `last_sync_${workspaceId}`;
    const lastSyncTimestamp = parseInt(localStorage.getItem(lastSyncKey) ?? "0", 10);

    const data = await transport.pull(workspaceId, lastSyncTimestamp);

    if (data) {
      for (const remoteNote of data.notes) {
        await dbClient.execute(
          `INSERT INTO notes (
             id, workspace_id, schema_id, parent_id, title, frontmatter, body, 
             created_by, updated_by, deleted_by, user_id, device_id, created_at, updated_at, is_deleted, synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             is_deleted = excluded.is_deleted,
             synced_at = excluded.synced_at
           WHERE excluded.updated_at > notes.updated_at`,
          [
            remoteNote.id,
            remoteNote.workspace_id,
            remoteNote.schema_id,
            remoteNote.parent_id,
            remoteNote.title,
            remoteNote.frontmatter,
            remoteNote.body,
            remoteNote.created_by,
            remoteNote.updated_by,
            remoteNote.deleted_by,
            remoteNote.user_id,
            remoteNote.device_id,
            remoteNote.created_at,
            remoteNote.updated_at,
            remoteNote.is_deleted,
            data.timestamp,
          ]
        );
      }

      for (const remoteProp of data.proposals) {
        await dbClient.execute(
          `INSERT INTO merge_queue (
             id, workspace_id, document_id, secondary_document_id, author_id, user_id, device_id, action,
             source_id, target_id, entity_type, similarity_score,
             base_frontmatter, base_body, secondary_base_frontmatter, secondary_base_body,
             proposed_title, proposed_frontmatter, proposed_body, metadata, status, 
             reviewed_by, review_comment, created_at, updated_at, synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             updated_at = excluded.updated_at,
             synced_at = excluded.synced_at
           WHERE excluded.updated_at > merge_queue.updated_at`,
          [
            remoteProp.id,
            remoteProp.workspace_id,
            remoteProp.document_id,
            remoteProp.secondary_document_id,
            remoteProp.author_id,
            remoteProp.user_id,
            remoteProp.device_id,
            remoteProp.action,
            remoteProp.source_id,
            remoteProp.target_id,
            remoteProp.entity_type,
            remoteProp.similarity_score,
            remoteProp.base_frontmatter,
            remoteProp.base_body,
            remoteProp.secondary_base_frontmatter,
            remoteProp.secondary_base_body,
            remoteProp.proposed_title,
            remoteProp.proposed_frontmatter,
            remoteProp.proposed_body,
            remoteProp.metadata,
            remoteProp.status,
            remoteProp.reviewed_by,
            remoteProp.review_comment,
            remoteProp.created_at,
            remoteProp.updated_at,
            data.timestamp,
          ]
        );
      }

      for (const remoteArchive of data.archives) {
        await dbClient.execute(
          `INSERT INTO archival_records (
             id, article_id, workspace_id, archive_type, sha256_hash,
             ipfs_cid, torrent_infohash, uri_or_path, file_size_bytes, device_id,
             last_verified_at, health_status, sync_status, blockchain_tx_hash,
             blockchain_network, ots_proof_payload, anchored_at,
             created_at, updated_at, is_deleted, synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             is_deleted = excluded.is_deleted,
             synced_at = excluded.synced_at
           WHERE excluded.updated_at > archival_records.updated_at`,
          [
            remoteArchive.id,
            remoteArchive.article_id,
            remoteArchive.workspace_id,
            remoteArchive.archive_type,
            remoteArchive.sha256_hash,
            remoteArchive.ipfs_cid ?? null,
            remoteArchive.torrent_infohash ?? null,
            remoteArchive.uri_or_path ?? null,
            remoteArchive.file_size_bytes ?? null,
            remoteArchive.device_id,
            remoteArchive.last_verified_at ?? null,
            remoteArchive.health_status,
            remoteArchive.sync_status ?? "PENDING_ANCHOR",
            remoteArchive.blockchain_tx_hash ?? null,
            remoteArchive.blockchain_network ?? null,
            remoteArchive.ots_proof_payload ?? null,
            remoteArchive.anchored_at ?? null,
            remoteArchive.created_at,
            remoteArchive.updated_at,
            remoteArchive.is_deleted,
            data.timestamp,
          ]
        );
      }

      localStorage.setItem(lastSyncKey, data.timestamp.toString());
    }
  } catch (error: any) {
    if (
      error?.status === 404 ||
      error?.message === "WORKSPACE_DELETED" ||
      error?.data?.error === "WORKSPACE_DELETED"
    ) {
      console.warn(`Parent workspace ${workspaceId} was deleted on remote host. Cleaning up locally...`);
      await handleRemoteWorkspaceDeletion(workspaceId);
      return;
    }

    console.error("Synchronization failed:", error);
  }
}

async function handleRemoteWorkspaceDeletion(workspaceId: string) {
  localStorage.removeItem(`last_sync_${workspaceId}`);
  const result = await deleteWorkspace(workspaceId);
  localStorage.setItem("active_workspace_id", result.activeWorkspaceId);

  if (typeof window !== "undefined") {
    window.location.reload();
  }
}