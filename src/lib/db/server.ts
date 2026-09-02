import { drizzle } from 'drizzle-orm/d1';
import { eq, and, gt, sql, asc } from 'drizzle-orm';
import * as schema from './schema';
import { anchorPendingRecords } from "../ledger-cron/worker";
import { WAYBACK_ARCHIVE_TYPE, WAYBACK_SYNC_STATUS, saveWaybackSnapshotUrl } from "../archive/utils";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string; // Set this in your wrangler.toml or Worker Secrets
}

// ==========================================
// CRYPTO HELPERS (Web Crypto API)
// ==========================================

async function hashSha256(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBuf = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, sigBuf, new TextEncoder().encode(`${header}.${payload}`));
    
    if (!isValid) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

async function verifyMemberAccess(request: Request, env: Env, targetWorkspaceId: string) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const secret = env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod";
  const decoded = await verifyJwt(token, secret);

  if (!decoded || decoded.workspaceId !== targetWorkspaceId) return null;

  // Verify member record status in D1
  const db = drizzle(env.DB, { schema });
  const member = await db.select()
    .from(schema.workspaceMembers)
    .where(and(
      eq(schema.workspaceMembers.workspaceId, targetWorkspaceId),
      eq(schema.workspaceMembers.deviceId, decoded.deviceId),
      eq(schema.workspaceMembers.status, 'ACTIVE')
    ))
    .get();

  if (!member) return null;
  if (member.expiresAt && member.expiresAt < Date.now()) return null;

  return member;
}

// ==========================================
// WORKER ENTRYPOINT
// ==========================================

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(anchorPendingRecords(env)); 
    ctx.waitUntil(processPendingWaybackArchives(env)); 
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.DB, { schema }); 
    const url = new URL(request.url); 

    if (request.method === "OPTIONS") { 
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }; 
    const secret = env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod";

    // 1. CREATE INVITE ENDPOINT
    if (url.pathname === "/api/invites/create" && request.method === "POST") {
      const { workspace_id, invite_type, password, role = "EDITOR", expires_in_hours = 24 } = await request.json() as any;

      const inviteId = crypto.randomUUID();
      const rawToken = crypto.randomUUID();
      const tokenHash = await hashSha256(rawToken);
      const passwordHash = await hashSha256(password);
      const expiresAt = Date.now() + (expires_in_hours * 3600 * 1000);

      await db.insert(schema.workspaceInvites).values({
        id: inviteId,
        workspaceId: workspace_id,
        tokenHash,
        passwordHash,
        inviteType: invite_type, // 'SESSION' | 'SHARE'
        assignedRole: role,
        expiresAt,
      });

      return new Response(JSON.stringify({ inviteId, rawToken }), { headers });
    }

    // 2. REDEEM INVITE ENDPOINT (Single-Use Atomic Burn)
    if (url.pathname === "/api/invites/redeem" && request.method === "POST") {
      const { inviteId, rawToken, password, deviceId } = await request.json() as any;
      const tokenHash = await hashSha256(rawToken);
      const passwordHash = await hashSha256(password);
      const now = Date.now();

      // Atomically mark used_at if matching and unexpired
      const result = await env.DB.prepare(
        `UPDATE workspace_invites 
         SET used_at = ? 
         WHERE id = ? 
           AND token_hash = ? 
           AND password_hash = ? 
           AND used_at IS NULL 
           AND expires_at > ?`
      ).bind(now, inviteId, tokenHash, passwordHash, now).run();

      if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: "Invalid, expired, or previously redeemed invite link." }), { status: 400, headers });
      }

      // Fetch invite details
      const invite = await db.select()
        .from(schema.workspaceInvites)
        .where(eq(schema.workspaceInvites.id, inviteId))
        .get();

      if (!invite) return new Response(JSON.stringify({ error: "Invite not found." }), { status: 404, headers });

      // Add device to workspace_members
      await db.insert(schema.workspaceMembers).values({
        workspaceId: invite.workspaceId,
        deviceId,
        role: invite.assignedRole,
        expiresAt: invite.inviteType === 'SESSION' ? null : invite.expiresAt,
        status: 'ACTIVE',
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.deviceId],
        set: { role: invite.assignedRole, status: 'ACTIVE', updatedAt: now }
      });

      // Issue signed capability token
      const sessionToken = await signJwt({
        workspaceId: invite.workspaceId,
        deviceId,
        role: invite.assignedRole,
      }, secret);

      return new Response(JSON.stringify({ sessionToken, workspaceId: invite.workspaceId }), { headers });
    }

    // 3. PUSH API Endpoint (Protected)
    if (url.pathname === "/api/sync/push" && request.method === "POST") { 
      const body = await request.json() as any;
      const { workspace_id, notes, proposals, archives } = body; 

      const member = await verifyMemberAccess(request, env, workspace_id);
      if (!member || member.role === 'VIEWER') {
        return new Response(JSON.stringify({ error: "Forbidden: Read-only or unauthorized device." }), { status: 403, headers });
      }

      if (Array.isArray(notes)) { 
        for (const note of notes) { 
          const frontmatterStr = typeof note.frontmatter === "object" ? JSON.stringify(note.frontmatter) : note.frontmatter; 
          await db.insert(schema.notes).values({ 
            id: note.id,
            workspaceId: workspace_id,
            schemaId: note.schema_id,
            parentId: note.parent_id ?? null,
            title: note.title,
            frontmatter: frontmatterStr,
            body: note.body,
            createdBy: note.created_by ?? null,
            updatedBy: note.updated_by ?? null,
            deletedBy: note.deleted_by ?? null,
            userId: note.user_id ?? note.updated_by ?? note.created_by ?? null,
            deviceId: note.device_id ?? null,
            createdAt: note.created_at,
            updatedAt: note.updated_at,
            isDeleted: note.is_deleted ? 1 : 0,
          }).onConflictDoUpdate({ 
            target: schema.notes.id,
            set: {
              schemaId: note.schema_id,
              parentId: note.parent_id ?? null,
              title: note.title,
              frontmatter: frontmatterStr,
              body: note.body,
              updatedBy: note.updated_by ?? null,
              deletedBy: note.deleted_by ?? null,
              userId: note.user_id ?? note.updated_by ?? note.created_by ?? null,
              deviceId: note.device_id ?? null,
              updatedAt: note.updated_at,
              isDeleted: note.is_deleted ? 1 : 0,
            },
            where: sql`excluded.updated_at > notes.updated_at`
          });
        }
      }

      if (Array.isArray(proposals)) { 
        for (const prop of proposals) { 
          await db.insert(schema.mergeQueue).values({ 
            id: prop.id,
            workspaceId: workspace_id,
            documentId: prop.document_id,
            secondaryDocumentId: prop.secondary_document_id ?? null,
            authorId: prop.author_id,
            userId: prop.user_id ?? prop.author_id ?? null,
            deviceId: prop.device_id ?? null,
            action: prop.action,
            sourceId: prop.source_id ?? prop.secondary_document_id ?? null,
            targetId: prop.target_id ?? prop.document_id,
            entityType: prop.entity_type ?? null,
            similarityScore: prop.similarity_score ?? null,
            baseFrontmatter: prop.base_frontmatter ?? null,
            baseBody: prop.base_body ?? null,
            secondaryBaseFrontmatter: prop.secondary_base_frontmatter ?? null,
            secondaryBaseBody: prop.secondary_base_body ?? null,
            proposedTitle: prop.proposed_title,
            proposedFrontmatter: prop.proposed_frontmatter,
            proposedBody: prop.proposed_body,
            metadata: prop.metadata ?? null,
            status: prop.status,
            reviewedBy: prop.reviewed_by ?? null,
            reviewComment: prop.review_comment ?? null,
            createdAt: prop.created_at,
            updatedAt: prop.updated_at,
          }).onConflictDoUpdate({ 
            target: schema.mergeQueue.id,
            set: {
              documentId: prop.document_id,
              secondaryDocumentId: prop.secondary_document_id ?? null,
              proposedTitle: prop.proposed_title,
              proposedFrontmatter: prop.proposed_frontmatter,
              proposedBody: prop.proposed_body,
              status: prop.status,
              updatedAt: prop.updated_at,
            },
            where: sql`excluded.updated_at > merge_queue.updated_at`
          });
        }
      }

      if (Array.isArray(archives)) { 
        for (const archive of archives) { 
          await db.insert(schema.archivalRecords).values({ 
            id: archive.id,
            articleId: archive.article_id,
            workspaceId: workspace_id,
            archiveType: archive.archive_type,
            sha256Hash: archive.sha256_hash,
            ipfsCid: archive.ipfs_cid ?? null,
            torrentInfohash: archive.torrent_infohash ?? null,
            uriOrPath: archive.uri_or_path ?? null,
            fileSizeBytes: archive.file_size_bytes ?? null,
            deviceId: archive.device_id,
            lastVerifiedAt: archive.last_verified_at ?? null,
            healthStatus: archive.health_status ?? "UNCHECKED",
            syncStatus: archive.sync_status ?? "PENDING_ANCHOR",
            blockchainTxHash: archive.blockchain_tx_hash ?? null,
            blockchainNetwork: archive.blockchain_network ?? null,
            otsProofPayload: archive.ots_proof_payload ?? null,
            anchoredAt: archive.anchored_at ?? null,
            createdAt: archive.created_at,
            updatedAt: archive.updated_at,
            isDeleted: archive.is_deleted ?? 0,
          }).onConflictDoUpdate({ 
            target: schema.archivalRecords.id,
            set: {
              healthStatus: archive.health_status,
              syncStatus: archive.sync_status,
              updatedAt: archive.updated_at,
            },
            where: sql`excluded.updated_at > archival_records.updated_at`
          });
        }
      }

      return new Response(JSON.stringify({ success: true, timestamp: Date.now() }), { headers }); 
    }

    // 4. PULL API Endpoint (Protected)
    if (url.pathname === "/api/sync/pull" && request.method === "GET") { 
      const workspace_id = url.searchParams.get("workspace_id") ?? "default"; 
      const since = parseInt(url.searchParams.get("since") ?? "0", 10); 

      const member = await verifyMemberAccess(request, env, workspace_id);
      if (!member) {
        return new Response(JSON.stringify({ error: "Unauthorized access to workspace." }), { status: 403, headers });
      }

      const notesRes = await db.select().from(schema.notes).where(and(eq(schema.notes.workspaceId, workspace_id), gt(schema.notes.updatedAt, since))); 
      const proposalsRes = await db.select().from(schema.mergeQueue).where(and(eq(schema.mergeQueue.workspaceId, workspace_id), gt(schema.mergeQueue.updatedAt, since))); 
      const archivesRes = await db.select().from(schema.archivalRecords).where(and(eq(schema.archivalRecords.workspaceId, workspace_id), gt(schema.archivalRecords.updatedAt, since))); 

      return new Response(JSON.stringify({ 
        timestamp: Date.now(),
        notes: notesRes,
        proposals: proposalsRes,
        archives: archivesRes,
      }), { headers }); 
    }

    return new Response("Not Found", { status: 404, headers }); 
  }
};

async function processPendingWaybackArchives(env: Env, limit = 25) { 
  const db = drizzle(env.DB, { schema }); 
  const pending = await db.select() 
    .from(schema.archivalRecords) 
    .where(and( 
      eq(schema.archivalRecords.archiveType, WAYBACK_ARCHIVE_TYPE), 
      eq(schema.archivalRecords.syncStatus, WAYBACK_SYNC_STATUS.pending), 
      eq(schema.archivalRecords.isDeleted, 0) 
    ))
    .orderBy(asc(schema.archivalRecords.updatedAt)) 
    .limit(limit); 

  if (!pending || pending.length === 0) return { status: "NO_PENDING_RECORDS", processed: 0 }; 

  const processed = []; 
  for (const record of pending) { 
    try {
      if (!record.uriOrPath) throw new Error("Missing source URL."); 
      const snapshotUrl = await saveWaybackSnapshotUrl(record.uriOrPath.trim()); 
      const verifiedAt = Date.now(); 
      await db.update(schema.archivalRecords) 
        .set({ uriOrPath: snapshotUrl, syncStatus: 'SYNCED', healthStatus: 'HEALTHY', lastVerifiedAt: verifiedAt, updatedAt: verifiedAt }) 
        .where(eq(schema.archivalRecords.id, record.id)); 
      processed.push({ id: record.id, status: WAYBACK_SYNC_STATUS.synced, uri_or_path: snapshotUrl }); 
    } catch (err) {
      await db.update(schema.archivalRecords) 
        .set({ syncStatus: 'FAILED', updatedAt: Date.now() }) 
        .where(eq(schema.archivalRecords.id, record.id)); 
      processed.push({ id: record.id, status: WAYBACK_SYNC_STATUS.failed, uri_or_path: record.uriOrPath }); 
    }
  }

  return { status: "SUCCESS", processed: processed.length, records: processed }; 
}