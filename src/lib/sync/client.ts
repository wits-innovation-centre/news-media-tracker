import { dbClient } from "@/lib/db/client";

interface SyncPullResponse {
  timestamp: number;
  notes: Array<{
    id: string;
    workspace_id: string;
    schema_id: string;
    parent_id?: string | null;
    title: string;
    frontmatter: string;
    body: string;
    created_by?: string | null;
    updated_by?: string | null;
    deleted_by?: string | null;
    created_at: number;
    updated_at: number;
    is_deleted: number;
  }>;
  proposals: Array<{
    id: string;
    workspace_id: string;
    document_id: string;
    secondary_document_id?: string | null;
    author_id: string;
    action: string;
    base_frontmatter?: string | null;
    base_body?: string | null;
    secondary_base_frontmatter?: string | null;
    secondary_base_body?: string | null;
    proposed_title: string;
    proposed_frontmatter: string;
    proposed_body: string;
    metadata?: string | null;
    status: string;
    reviewed_by?: string | null;
    review_comment?: string | null;
    created_at: number;
    updated_at: number;
  }>;
}

// Vite replaces `import.meta.env.DEV` at build time.
// In production, the local URL string is completely tree-shaken away.
const SYNC_SERVER_URL = import.meta.env.DEV
  ? "http://localhost:8787"
  : import.meta.env.VITE_SYNC_SERVER_URL;

export async function synchronizeWorkspace(workspaceId: string = "default") {
  if (!navigator.onLine) return;

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

    // 1. PUSH local changes (Notes, Proposals, Archives)
    if (
      unsyncedNotes.length > 0 ||
      unsyncedProposals.length > 0 ||
      unsyncedArchives.length > 0
    ) {
      const pushResponse = await fetch(`${SYNC_SERVER_URL}/api/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          notes: unsyncedNotes,
          proposals: unsyncedProposals,
          archives: unsyncedArchives
        })
      });

      if (pushResponse.ok) {
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

    // 2. PULL remote changes
    const lastSyncKey = `last_sync_${workspaceId}`;
    const lastSyncTimestamp = parseInt(localStorage.getItem(lastSyncKey) ?? "0", 10);

    const pullResponse = await fetch(
      `${SYNC_SERVER_URL}/api/sync/pull?workspace_id=${workspaceId}&since=${lastSyncTimestamp}`
    );

    if (pullResponse.ok) {
      const data = (await pullResponse.json()) as SyncPullResponse;

      for (const remoteNote of data.notes) {
        await dbClient.execute(
          `INSERT INTO notes (
             id, workspace_id, schema_id, parent_id, title, frontmatter, body, 
             created_by, updated_by, deleted_by, created_at, updated_at, is_deleted, synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             frontmatter = excluded.frontmatter,
             body = excluded.body,
             updated_by = excluded.updated_by,
             deleted_by = excluded.deleted_by,
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
            remoteNote.created_at,
            remoteNote.updated_at,
            remoteNote.is_deleted,
            data.timestamp
          ]
        );
      }

      for (const remoteProp of data.proposals) {
        await dbClient.execute(
          `INSERT INTO merge_queue (
             id, workspace_id, document_id, secondary_document_id, author_id, action, 
             base_frontmatter, base_body, secondary_base_frontmatter, secondary_base_body,
             proposed_title, proposed_frontmatter, proposed_body, metadata, status, 
             reviewed_by, review_comment, created_at, updated_at, synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
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
            remoteProp.action,
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
            data.timestamp
          ]
        );
      }

      localStorage.setItem(lastSyncKey, data.timestamp.toString());
    }
  } catch (error) {
    console.error("Synchronization failed:", error);
  }
}