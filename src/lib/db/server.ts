export interface Env {
  DB: D1Database;
}

interface PushPayload {
  workspace_id: string;
  notes: any[];
  proposals: any[];
}

export default {
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

    // 1. PUSH: Client sends un-synced notes and proposals to D1
    if (url.pathname === "/api/sync/push" && request.method === "POST") {
      const { workspace_id, notes, proposals } = (await request.json()) as PushPayload;
      const batchStatements: D1PreparedStatement[] = [];

      if (Array.isArray(notes)) {
        for (const note of notes) {
          batchStatements.push(
            env.DB.prepare(`
              INSERT INTO notes (
                id, workspace_id, schema_id, parent_id, title, frontmatter, body, 
                created_by, updated_by, deleted_by, created_at, updated_at, is_deleted
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                frontmatter = excluded.frontmatter,
                body = excluded.body,
                updated_by = excluded.updated_by,
                deleted_by = excluded.deleted_by,
                updated_at = excluded.updated_at,
                is_deleted = excluded.is_deleted
              WHERE excluded.updated_at > notes.updated_at
            `).bind(
              note.id, workspace_id, note.schema_id, note.parent_id ?? null,
              note.title, note.frontmatter, note.body,
              note.created_by ?? null, note.updated_by ?? null, note.deleted_by ?? null,
              note.created_at, note.updated_at, note.is_deleted
            )
          );
        }
      }

      if (Array.isArray(proposals)) {
        for (const prop of proposals) {
          batchStatements.push(
            env.DB.prepare(`
              INSERT INTO merge_queue (
                id, workspace_id, document_id, secondary_document_id, author_id, action, 
                base_frontmatter, base_body, secondary_base_frontmatter, secondary_base_body,
                proposed_title, proposed_frontmatter, proposed_body, metadata, status, 
                reviewed_by, review_comment, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                reviewed_by = excluded.reviewed_by,
                review_comment = excluded.review_comment,
                updated_at = excluded.updated_at
              WHERE excluded.updated_at > merge_queue.updated_at
            `).bind(
              prop.id, workspace_id, prop.document_id, prop.secondary_document_id ?? null, prop.author_id, prop.action,
              prop.base_frontmatter ?? null, prop.base_body ?? null,
              prop.secondary_base_frontmatter ?? null, prop.secondary_base_body ?? null,
              prop.proposed_title, prop.proposed_frontmatter, prop.proposed_body,
              prop.metadata ?? null, prop.status, prop.reviewed_by ?? null, prop.review_comment ?? null,
              prop.created_at, prop.updated_at
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

      return new Response(JSON.stringify({
        timestamp: Date.now(),
        notes: notes.results,
        proposals: proposals.results
      }), { headers });
    }

    return new Response("Not Found", { status: 404, headers });
  }
};