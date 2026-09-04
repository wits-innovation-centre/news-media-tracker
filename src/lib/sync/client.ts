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
      for (const rawNote of data.notes) {
        const note = rawNote as Record<string, any>;
        const noteId = note.id;
        const noteWorkspaceId = note.workspace_id ?? note.workspaceId ?? workspaceId;
        const noteSchemaId = note.schema_id ?? note.schemaId ?? "report";

        if (!noteId || !noteWorkspaceId) {
          console.warn("[Sync] Skipping remote note missing critical ID keys:", note);
          continue;
        }

        const frontmatterStr =
          typeof note.frontmatter === "object" && note.frontmatter !== null
            ? JSON.stringify(note.frontmatter)
            : (note.frontmatter ?? "{}");

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
            noteId,
            noteWorkspaceId,
            noteSchemaId,
            note.parent_id ?? note.parentId ?? null,
            note.title ?? "",
            frontmatterStr,
            note.body ?? "",
            note.created_by ?? note.createdBy ?? null,
            note.updated_by ?? note.updatedBy ?? null,
            note.deleted_by ?? note.deletedBy ?? null,
            note.user_id ?? note.userId ?? null,
            note.device_id ?? note.deviceId ?? null,
            note.created_at ?? note.createdAt ?? now,
            note.updated_at ?? note.updatedAt ?? now,
            note.is_deleted || note.isDeleted ? 1 : 0,
            data.timestamp,
          ]
        );
      }

      for (const rawProp of data.proposals) {
        const prop = rawProp as Record<string, any>;
        const propId = prop.id;
        const propWorkspaceId = prop.workspace_id ?? prop.workspaceId ?? workspaceId;

        if (!propId || !propWorkspaceId) continue;

        const stringifyObj = (val: any) =>
          typeof val === "object" && val !== null ? JSON.stringify(val) : (val ?? null);

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
            propId,
            propWorkspaceId,
            prop.document_id ?? prop.documentId ?? null,
            prop.secondary_document_id ?? prop.secondaryDocumentId ?? null,
            prop.author_id ?? prop.authorId ?? null,
            prop.user_id ?? prop.userId ?? null,
            prop.device_id ?? prop.deviceId ?? null,
            prop.action ?? "MERGE",
            prop.source_id ?? prop.sourceId ?? null,
            prop.target_id ?? prop.targetId ?? null,
            prop.entity_type ?? prop.entityType ?? null,
            prop.similarity_score ?? prop.similarityScore ?? null,
            stringifyObj(prop.base_frontmatter ?? prop.baseFrontmatter),
            prop.base_body ?? prop.baseBody ?? null,
            stringifyObj(prop.secondary_base_frontmatter ?? prop.secondaryBaseFrontmatter),
            prop.secondary_base_body ?? prop.secondaryBaseBody ?? null,
            prop.proposed_title ?? prop.proposedTitle ?? null,
            stringifyObj(prop.proposed_frontmatter ?? prop.proposedFrontmatter),
            prop.proposed_body ?? prop.proposedBody ?? null,
            stringifyObj(prop.metadata),
            prop.status ?? "PENDING",
            prop.reviewed_by ?? prop.reviewedBy ?? null,
            prop.review_comment ?? prop.reviewComment ?? null,
            prop.created_at ?? prop.createdAt ?? now,
            prop.updated_at ?? prop.updatedAt ?? now,
            data.timestamp,
          ]
        );
      }

      for (const rawArchive of data.archives) {
        const archive = rawArchive as Record<string, any>;
        const archiveId = archive.id;
        const archiveWorkspaceId = archive.workspace_id ?? archive.workspaceId ?? workspaceId;

        if (!archiveId || !archiveWorkspaceId) continue;

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
            archiveId,
            archive.article_id ?? archive.articleId ?? null,
            archiveWorkspaceId,
            archive.archive_type ?? archive.archiveType ?? "WAYBACK",
            archive.sha256_hash ?? archive.sha256Hash ?? "",
            archive.ipfs_cid ?? archive.ipfsCid ?? null,
            archive.torrent_infohash ?? archive.torrentInfohash ?? null,
            archive.uri_or_path ?? archive.uriOrPath ?? null,
            archive.file_size_bytes ?? archive.fileSizeBytes ?? null,
            archive.device_id ?? archive.deviceId ?? "",
            archive.last_verified_at ?? archive.lastVerifiedAt ?? null,
            archive.health_status ?? archive.healthStatus ?? "UNKNOWN",
            archive.sync_status ?? archive.syncStatus ?? "PENDING_ANCHOR",
            archive.blockchain_tx_hash ?? archive.blockchainTxHash ?? null,
            archive.blockchain_network ?? archive.blockchainNetwork ?? null,
            archive.ots_proof_payload ?? archive.otsProofPayload ?? null,
            archive.anchored_at ?? archive.anchoredAt ?? null,
            archive.created_at ?? archive.createdAt ?? now,
            archive.updated_at ?? archive.updatedAt ?? now,
            archive.is_deleted || archive.isDeleted ? 1 : 0,
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