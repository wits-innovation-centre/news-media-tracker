import { dbClient } from "@/lib/db/client"
import { getMutationActor } from "@/lib/provenance"
import { saveWaybackArchiveRequest } from "@/lib/archive/utils"
import type {
  ArchivalLedgerRecord,
  DuplicateDetectionMetadata,
  DocumentSchema,
  DocumentSchemaGroup,
  FieldDefinition,
  MergeResolutionPayload,
  MergeProposal,
  SpecificationDefinition,
  SpecificationStore,
  StoredDocument,
  WorkspaceRecord
} from "@/lib/types"
import { DEFAULT_WORKSPACE_ICON } from '../icon/registry'

const DEFAULT_WORKSPACE_ID = "default"
const normalizeWorkspaceId = (workspaceId?: string) => workspaceId?.trim() || DEFAULT_WORKSPACE_ID

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

const mapMergeProposalRecord = (row: Record<string, any>): MergeProposal => ({
  id: String(row.id),
  workspace_id: String(row.workspace_id ?? DEFAULT_WORKSPACE_ID),
  document_id: String(row.document_id),
  secondary_document_id: row.secondary_document_id ? String(row.secondary_document_id) : null,
  author_id: String(row.author_id),
  user_id: row.user_id ? String(row.user_id) : null,
  device_id: row.device_id ? String(row.device_id) : null,
  action: String(row.action) as MergeProposal["action"],
  source_id: row.source_id ? String(row.source_id) : null,
  target_id: row.target_id ? String(row.target_id) : null,
  entity_type: row.entity_type ? String(row.entity_type) : null,
  similarity_score: typeof row.similarity_score === "number" ? row.similarity_score : row.similarity_score ? Number(row.similarity_score) : null,
  base_frontmatter: row.base_frontmatter ? String(row.base_frontmatter) : null,
  base_body: row.base_body ? String(row.base_body) : null,
  secondary_base_frontmatter: row.secondary_base_frontmatter ? String(row.secondary_base_frontmatter) : null,
  secondary_base_body: row.secondary_base_body ? String(row.secondary_base_body) : null,
  proposed_title: String(row.proposed_title ?? ""),
  proposed_frontmatter: String(row.proposed_frontmatter ?? "{}"),
  proposed_body: String(row.proposed_body ?? ""),
  metadata: row.metadata ? String(row.metadata) : null,
  status: String(row.status) as MergeProposal["status"],
  reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
  review_comment: row.review_comment ? String(row.review_comment) : null,
  created_at: Number(row.created_at),
  updated_at: Number(row.updated_at),
  synced_at: typeof row.synced_at === "number" ? row.synced_at : null,
})

// ==========================================
// WORKSPACE MANAGEMENT
// ==========================================

async function ensureDefaultWorkspace(): Promise<WorkspaceRecord> {
  const now = Date.now()
  await dbClient.execute(
    `INSERT OR IGNORE INTO workspaces (id, name, description, icon_path, template_group_id, created_at, last_accessed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [DEFAULT_WORKSPACE_ID, "Homicide Tracker", "Default workspace set up to track reported incidents of homicide.", DEFAULT_WORKSPACE_ICON, "homicide-tracker", now, now]
  )

  const rows = await dbClient.query(`SELECT id, name, description, icon_path, template_group_id, created_at, last_accessed_at FROM workspaces WHERE id = ? LIMIT 1`, [DEFAULT_WORKSPACE_ID])
  const row = rows[0]
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    icon_path: row.icon_path ? String(row.icon_path) : DEFAULT_WORKSPACE_ICON,
    template_group_id: row.template_group_id ? String(row.template_group_id) : undefined,
    created_at: Number(row.created_at),
    last_accessed_at: Number(row.last_accessed_at),
  }
}

async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  await ensureDefaultWorkspace()
  const rows = await dbClient.query(`SELECT id, name, description, icon_path, template_group_id, created_at, last_accessed_at FROM workspaces ORDER BY last_accessed_at DESC, created_at ASC`)
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    icon_path: row.icon_path ? String(row.icon_path) : undefined,
    template_group_id: row.template_group_id ? String(row.template_group_id) : undefined,
    created_at: Number(row.created_at),
    last_accessed_at: Number(row.last_accessed_at),
  }))
}

async function createWorkspace(name: string, description?: string, iconPath?: string): Promise<WorkspaceRecord> {
  const now = Date.now()
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error("Workspace name is required.")

  const id = `ws-${crypto.randomUUID()}`
  const finalIcon = iconPath?.trim() || undefined
  await dbClient.execute(`INSERT INTO workspaces (id, name, description, icon_path, template_group_id, created_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, trimmedName, description?.trim() || null, finalIcon || null, null, now, now])

  return { id, name: trimmedName, description: description?.trim() || undefined, icon_path: finalIcon, template_group_id: undefined, created_at: now, last_accessed_at: now }
}

async function renameWorkspace(workspaceId: string, name: string, description?: string, iconPath?: string): Promise<void> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error("Workspace name is required.")
  await dbClient.execute(`UPDATE workspaces SET name = ?, description = ?, icon_path = COALESCE(?, icon_path) WHERE id = ?`, [trimmedName, description?.trim() || null, iconPath?.trim() || null, scopedWorkspaceId])
}

async function setWorkspaceTemplateGroup(workspaceId: string, templateGroupId?: string): Promise<void> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  await dbClient.execute(`UPDATE workspaces SET template_group_id = ? WHERE id = ?`, [templateGroupId?.trim() || null, scopedWorkspaceId])
}

async function touchWorkspace(workspaceId: string): Promise<void> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  await dbClient.execute(`UPDATE workspaces SET last_accessed_at = ? WHERE id = ?`, [Date.now(), scopedWorkspaceId])
}

async function deleteWorkspace(workspaceId: string): Promise<void> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  if (scopedWorkspaceId === DEFAULT_WORKSPACE_ID) throw new Error("Default workspace cannot be deleted.")

  await dbClient.execute("DELETE FROM notes WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM merge_queue WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM archival_records WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM schemas WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM schema_metadata WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM schema_groups WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM specifications WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM specification_registry WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM workspaces WHERE id = ?", [scopedWorkspaceId])
}

export {
  ensureDefaultWorkspace,
  listWorkspaces,
  createWorkspace,
  renameWorkspace,
  setWorkspaceTemplateGroup,
  touchWorkspace,
  deleteWorkspace,
  DEFAULT_WORKSPACE_ICON
}

// ==========================================
// SCHEMAS & SPECIFICATIONS
// ==========================================

async function loadSchemaGroups(workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const records = await dbClient.query("SELECT * FROM schema_groups WHERE workspace_id = ? AND is_deleted = 0 ORDER BY name", [scopedWorkspaceId])
  return records.map((row) => ({ id: row.id, name: row.name, description: row.description ?? undefined, documents: [] })) as DocumentSchemaGroup[]
}

async function loadActiveSchemas(workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const records = await dbClient.query("SELECT * FROM schemas WHERE workspace_id = ? AND is_deleted = 0", [scopedWorkspaceId])
  const metadataRows = await dbClient.query("SELECT schema_id, metadata FROM schema_metadata WHERE workspace_id = ?", [scopedWorkspaceId])
  const metadataBySchemaId = new Map<string, { archivable?: boolean }>()
  metadataRows.forEach((row) => metadataBySchemaId.set(String(row.schema_id), safeJsonParse<{ archivable?: boolean }>(row.metadata, {})))

  return records.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    metadata: metadataBySchemaId.get(String(row.id)) ?? undefined,
    parentSchemaId: row.parentSchemaId ?? undefined,
    groupId: row.groupId ?? undefined,
    groupName: row.groupName ?? undefined,
    fields: JSON.parse(row.fields) as FieldDefinition[],
    subtypeFields: row.subtypeFields ? JSON.parse(row.subtypeFields) : undefined,
  })) as DocumentSchema[]
}

async function saveSchemaWorkspace(groups: DocumentSchemaGroup[], workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  await dbClient.execute("DELETE FROM schemas WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM schema_metadata WHERE workspace_id = ?", [scopedWorkspaceId])
  await dbClient.execute("DELETE FROM schema_groups WHERE workspace_id = ?", [scopedWorkspaceId])

  for (const group of groups) {
    await dbClient.execute("INSERT INTO schema_groups (id, workspace_id, name, description) VALUES (?, ?, ?, ?)", [group.id, scopedWorkspaceId, group.name, group.description ?? null])
    for (const schema of group.documents) {
      await dbClient.execute(
        "INSERT INTO schemas (id, workspace_id, name, description, parentSchemaId, groupId, groupName, subtypeFields, fields) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [schema.id, scopedWorkspaceId, schema.name, schema.description ?? null, schema.parentSchemaId ?? null, group.id, group.name, schema.subtypeFields ? JSON.stringify(schema.subtypeFields) : null, JSON.stringify(schema.fields)]
      )
      if (schema.metadata) {
        await dbClient.execute("INSERT INTO schema_metadata (schema_id, workspace_id, metadata) VALUES (?, ?, ?)", [schema.id, scopedWorkspaceId, JSON.stringify(schema.metadata)])
      }
    }
  }
}

async function updateCapturedNoteSchema(noteId: string, schemaId: string, workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  await dbClient.execute("UPDATE notes SET schema_id = ? WHERE workspace_id = ? AND id = ?", [schemaId, scopedWorkspaceId, noteId])
}

async function loadSpecifications(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<SpecificationStore> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const rows = await dbClient.query("SELECT kind, value FROM specifications WHERE workspace_id = ? ORDER BY kind, value", [scopedWorkspaceId])
  const byId: SpecificationStore = {}
  rows.forEach((row) => {
    const specificationId = String(row.kind)
    if (!byId[specificationId]) byId[specificationId] = []
    byId[specificationId].push(String(row.value))
  })
  return byId
}

async function loadSpecificationRegistry(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<SpecificationDefinition[]> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const rows = await dbClient.query("SELECT id, name, description FROM specification_registry WHERE workspace_id = ? ORDER BY name", [scopedWorkspaceId])
  return rows.map((row) => ({ id: String(row.id), name: String(row.name), description: row.description ? String(row.description) : undefined }))
}

async function saveSpecificationRegistry(registry: SpecificationDefinition[], workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  await dbClient.execute("DELETE FROM specification_registry WHERE workspace_id = ?", [scopedWorkspaceId])
  for (const item of registry) {
    const id = item.id.trim()
    if (!id) continue
    await dbClient.execute("INSERT OR REPLACE INTO specification_registry (id, workspace_id, name, description) VALUES (?, ?, ?, ?)", [id, scopedWorkspaceId, item.name.trim() || id, item.description?.trim() || null])
  }
}

async function saveSpecificationValues(specificationId: string, values: string[], workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const normalized = [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  await dbClient.execute("DELETE FROM specifications WHERE workspace_id = ? AND kind = ?", [scopedWorkspaceId, specificationId])
  for (const value of normalized) {
    await dbClient.execute("INSERT INTO specifications (kind, value, workspace_id) VALUES (?, ?, ?)", [specificationId, value, scopedWorkspaceId])
  }
}

async function saveSpecificationsStore(store: SpecificationStore, workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  await dbClient.execute("DELETE FROM specifications WHERE workspace_id = ?", [scopedWorkspaceId])
  for (const [specificationId, values] of Object.entries(store)) {
    const normalized = [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    for (const value of normalized) {
      await dbClient.execute("INSERT INTO specifications (kind, value, workspace_id) VALUES (?, ?, ?)", [specificationId, value, scopedWorkspaceId])
    }
  }
}

export {
  loadSchemaGroups,
  loadActiveSchemas,
  saveSchemaWorkspace,
  updateCapturedNoteSchema,
  loadSpecifications,
  loadSpecificationRegistry,
  saveSpecificationRegistry,
  saveSpecificationValues,
  saveSpecificationsStore
}

// ==========================================
// NOTES & CAPTURED DOCUMENTS
// ==========================================

async function saveCapturedNote(id: string, schemaId: string, title: string, frontmatter: Record<string, any>, body: string, userId?: string, parentId?: string, workspaceId: string = "default", deviceId?: string) {
  const actor = getMutationActor({ userId, deviceId })
  const now = Date.now()
  await dbClient.execute(
    `INSERT INTO notes (id, workspace_id, schema_id, parent_id, title, frontmatter, body, created_by, updated_by, user_id, device_id, created_at, updated_at, is_deleted, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
     ON CONFLICT(id) DO UPDATE SET schema_id = excluded.schema_id, parent_id = excluded.parent_id, title = excluded.title, frontmatter = excluded.frontmatter, body = excluded.body, updated_by = excluded.updated_by, user_id = excluded.user_id, device_id = excluded.device_id, updated_at = excluded.updated_at, is_deleted = 0, synced_at = NULL`,
    [id, workspaceId, schemaId, parentId ?? null, title, JSON.stringify(frontmatter), body, actor.userId, actor.userId, actor.userId, actor.deviceId, now, now]
  )
  if (typeof frontmatter.url === "string" && frontmatter.url.trim()) {
    await saveWaybackArchiveRequest(id, frontmatter.url, workspaceId)
  }
  return id
}

async function loadWaybackArchiveRecordByArticleId(articleId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<ArchivalLedgerRecord | null> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const rows = await dbClient.query(
    `SELECT * FROM archival_records WHERE workspace_id = ? AND article_id = ? AND archive_type = 'WAYBACK_MACHINE' AND is_deleted = 0 ORDER BY updated_at DESC LIMIT 1`,
    [scopedWorkspaceId, articleId]
  )
  if (rows.length === 0) return null
  const row = rows[0]
  return { id: String(row.id), article_id: String(row.article_id), workspace_id: row.workspace_id ? String(row.workspace_id) : undefined, archive_type: String(row.archive_type), sha256_hash: String(row.sha256_hash), uri_or_path: row.uri_or_path ? String(row.uri_or_path) : null, file_size_bytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null, device_id: row.device_id ? String(row.device_id) : undefined, last_verified_at: typeof row.last_verified_at === "number" ? row.last_verified_at : null, health_status: row.health_status ? String(row.health_status) : undefined, sync_status: row.sync_status ? String(row.sync_status) : undefined, blockchain_tx_hash: row.blockchain_tx_hash ? String(row.blockchain_tx_hash) : null, blockchain_network: row.blockchain_network ? String(row.blockchain_network) : null, ots_proof_payload: row.ots_proof_payload ? String(row.ots_proof_payload) : null, anchored_at: row.anchored_at ? String(row.anchored_at) : null, created_at: typeof row.created_at === "number" ? row.created_at : undefined, updated_at: typeof row.updated_at === "number" ? row.updated_at : undefined }
}

async function softDeleteCapturedNote(id: string, userId?: string, workspaceId: string = DEFAULT_WORKSPACE_ID, deviceId?: string) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const actor = getMutationActor({ userId, deviceId })
  const now = Date.now()
  await dbClient.execute(`UPDATE notes SET is_deleted = 1, deleted_by = ?, updated_by = ?, user_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [actor.userId, actor.userId, actor.userId, actor.deviceId, now, scopedWorkspaceId, id])
}

async function loadCapturedDocuments(workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const records = await dbClient.query(`SELECT id, workspace_id, schema_id, parent_id, title, frontmatter, body, created_at, created_by, updated_by, user_id, device_id, updated_at FROM notes WHERE workspace_id = ? AND is_deleted = 0 ORDER BY created_at DESC`, [scopedWorkspaceId])
  return records.map((row) => ({ id: row.id, workspace_id: row.workspace_id, schema_id: row.schema_id, title: row.title, frontmatter: JSON.parse(row.frontmatter), body: row.body, parent_id: row.parent_id ?? undefined, created_at: typeof row.created_at === "number" ? new Date(row.created_at).toISOString() : row.created_at, created_by: row.created_by ?? undefined, updated_by: row.updated_by ?? undefined, user_id: row.user_id ?? undefined, device_id: row.device_id ?? undefined, updated_at: typeof row.updated_at === "number" ? row.updated_at : undefined })) as StoredDocument[]
}

async function loadDeletedDocumentsForReview(workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  return await dbClient.query(`SELECT id, schema_id, title, created_by, deleted_by, updated_at FROM notes WHERE workspace_id = ? AND is_deleted = 1 ORDER BY updated_at DESC`, [scopedWorkspaceId])
}

async function restoreDeletedNote(id: string, userId?: string, workspaceId: string = DEFAULT_WORKSPACE_ID, deviceId?: string) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const actor = getMutationActor({ userId, deviceId })
  const now = Date.now()
  await dbClient.execute(`UPDATE notes SET is_deleted = 0, deleted_by = NULL, updated_by = ?, user_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [actor.userId, actor.userId, actor.deviceId, now, scopedWorkspaceId, id])
}

async function getNotesForWorkspaceExport(workspaceId: string = DEFAULT_WORKSPACE_ID) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  return await dbClient.query("SELECT title, frontmatter, body FROM notes WHERE workspace_id = ? AND is_deleted = 0", [scopedWorkspaceId])
}

async function loadLedgerRecordByArticleId(articleId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<ArchivalLedgerRecord | null> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const rows = await dbClient.query(`SELECT * FROM archival_records WHERE workspace_id = ? AND article_id = ? AND is_deleted = 0 ORDER BY CASE WHEN archive_type = 'REPORT_CONTENT' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`, [scopedWorkspaceId, articleId])
  if (rows.length === 0) return null
  const row = rows[0]
  return { id: String(row.id), article_id: String(row.article_id), workspace_id: row.workspace_id ? String(row.workspace_id) : undefined, archive_type: String(row.archive_type), sha256_hash: String(row.sha256_hash), uri_or_path: row.uri_or_path ? String(row.uri_or_path) : null, file_size_bytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null, device_id: row.device_id ? String(row.device_id) : undefined, last_verified_at: typeof row.last_verified_at === "number" ? row.last_verified_at : null, health_status: row.health_status ? String(row.health_status) : undefined, sync_status: row.sync_status ? String(row.sync_status) : undefined, blockchain_tx_hash: row.blockchain_tx_hash ? String(row.blockchain_tx_hash) : null, blockchain_network: row.blockchain_network ? String(row.blockchain_network) : null, ots_proof_payload: row.ots_proof_payload ? String(row.ots_proof_payload) : null, anchored_at: row.anchored_at ? String(row.anchored_at) : null, created_at: typeof row.created_at === "number" ? row.created_at : undefined, updated_at: typeof row.updated_at === "number" ? row.updated_at : undefined }
}

async function loadLedgerRecordByNoteId(noteId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<ArchivalLedgerRecord | null> {
  return loadLedgerRecordByArticleId(noteId, workspaceId)
}

export {
  saveCapturedNote,
  saveWaybackArchiveRequest,
  loadWaybackArchiveRecordByArticleId,
  softDeleteCapturedNote,
  loadCapturedDocuments,
  loadDeletedDocumentsForReview,
  restoreDeletedNote,
  getNotesForWorkspaceExport,
  loadLedgerRecordByArticleId,
  loadLedgerRecordByNoteId
}

// ==========================================
// MERGE QUEUE & PROPOSALS
// ==========================================

async function submitNoteProposal(documentId: string, schemaId: string, proposedTitle: string, proposedFrontmatter: Record<string, any>, proposedBody: string, authorId: string, action: "CREATE" | "UPDATE" | "DELETE", existingNote?: StoredDocument, workspaceId: string = "default") {
  const proposalId = `prop-${crypto.randomUUID()}`
  const now = Date.now()
  await dbClient.execute(
    `INSERT INTO merge_queue (id, workspace_id, document_id, author_id, action, base_frontmatter, base_body, proposed_title, proposed_frontmatter, proposed_body, metadata, status, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
    [proposalId, workspaceId, documentId, authorId, action, existingNote ? JSON.stringify(existingNote.frontmatter) : null, existingNote ? existingNote.body : null, proposedTitle, JSON.stringify(proposedFrontmatter), proposedBody, JSON.stringify({ schemaId }), now, now]
  )
  return proposalId
}

async function loadPendingProposals(workspaceId: string = "default") {
  const records = await dbClient.query(`SELECT * FROM merge_queue WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at ASC`, [workspaceId])
  return records.map((row) => mapMergeProposalRecord(row as Record<string, any>))
}

async function approveMergeProposal(proposalId: string, reviewerId?: string, workspaceId: string = DEFAULT_WORKSPACE_ID, resolution?: MergeResolutionPayload, reviewerDeviceId?: string) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const actor = getMutationActor({ userId: reviewerId, deviceId: reviewerDeviceId })
  const [proposal] = await dbClient.query("SELECT * FROM merge_queue WHERE workspace_id = ? AND id = ?", [scopedWorkspaceId, proposalId])
  if (!proposal || proposal.status !== "pending") throw new Error("Proposal is invalid or already processed.")

  const now = Date.now()
  const resolvedTitle = resolution?.title ?? String(proposal.proposed_title ?? "")
  const resolvedFrontmatter = JSON.stringify(resolution?.frontmatter ?? safeJsonParse<Record<string, unknown>>(proposal.proposed_frontmatter, {}))
  const resolvedBody = resolution?.body ?? String(proposal.proposed_body ?? "")
  const proposalMetadata = safeJsonParse<Record<string, unknown>>(proposal.metadata, {})
  const proposalSchemaId = typeof proposalMetadata.schemaId === "string" ? proposalMetadata.schemaId : "event"

  if (proposal.action === "DELETE") {
    await dbClient.execute(`UPDATE notes SET is_deleted = 1, deleted_by = ?, updated_by = ?, user_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [actor.userId, actor.userId, actor.userId, actor.deviceId, now, scopedWorkspaceId, proposal.document_id])
  } else if (proposal.action === "MERGE_DUPLICATE") {
    await dbClient.execute(`UPDATE notes SET parent_id = ?, updated_by = ?, user_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND parent_id = ?`, [proposal.document_id, actor.userId, actor.userId, actor.deviceId, now, scopedWorkspaceId, proposal.secondary_document_id])
    await dbClient.execute(`UPDATE archival_records SET article_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND article_id = ?`, [proposal.document_id, actor.deviceId, now, scopedWorkspaceId, proposal.secondary_document_id])
    await dbClient.execute(`UPDATE notes SET is_deleted = 1, deleted_by = ?, updated_by = ?, user_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [actor.userId, actor.userId, actor.userId, actor.deviceId, now, scopedWorkspaceId, proposal.secondary_document_id])
    await dbClient.execute(`UPDATE notes SET title = ?, frontmatter = ?, body = ?, updated_by = ?, user_id = ?, device_id = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [resolvedTitle, resolvedFrontmatter, resolvedBody, actor.userId, actor.userId, actor.deviceId, now, scopedWorkspaceId, proposal.document_id])
  } else {
    await dbClient.execute(
      `INSERT INTO notes (id, workspace_id, schema_id, parent_id, title, frontmatter, body, created_by, updated_by, user_id, device_id, created_at, updated_at, is_deleted, synced_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
       ON CONFLICT(id) DO UPDATE SET schema_id = excluded.schema_id, title = excluded.title, frontmatter = excluded.frontmatter, body = excluded.body, updated_by = excluded.updated_by, user_id = excluded.user_id, device_id = excluded.device_id, updated_at = excluded.updated_at, is_deleted = 0, synced_at = NULL`,
      [proposal.document_id, proposal.workspace_id, proposalSchemaId, resolvedTitle, resolvedFrontmatter, resolvedBody, actor.userId, actor.userId, actor.userId, actor.deviceId, now, now]
    )
  }

  await dbClient.execute(`UPDATE merge_queue SET proposed_title = ?, proposed_frontmatter = ?, proposed_body = ?, status = 'approved', reviewed_by = ?, review_comment = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [resolvedTitle, resolvedFrontmatter, resolvedBody, actor.userId, "Merged from review UI", now, scopedWorkspaceId, proposalId])
}

async function rejectMergeProposal(proposalId: string, reviewerId: string, comment: string, workspaceId: string = DEFAULT_WORKSPACE_ID, deviceId?: string) {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId)
  const actor = getMutationActor({ userId: reviewerId, deviceId })
  const now = Date.now()
  await dbClient.execute(`UPDATE merge_queue SET status = 'rejected', reviewed_by = ?, review_comment = ?, updated_at = ?, synced_at = NULL WHERE workspace_id = ? AND id = ?`, [actor.userId, comment, now, scopedWorkspaceId, proposalId])
}

async function proposeDuplicateMerge(primaryDoc: StoredDocument, duplicateDoc: StoredDocument, mergedTitle: string, mergedFrontmatter: Record<string, any>, mergedBody: string, authorId: string = "system:duplicate-detector", detectionMetadata: DuplicateDetectionMetadata, entityType: string = "documents", deviceId?: string) {
  const proposalId = `dup-${crypto.randomUUID()}`
  const now = Date.now()
  const actor = getMutationActor({ userId: authorId, deviceId })
  await dbClient.execute(
    `INSERT INTO merge_queue (id, workspace_id, document_id, secondary_document_id, author_id, user_id, device_id, action, source_id, target_id, entity_type, similarity_score, base_frontmatter, base_body, secondary_base_frontmatter, secondary_base_body, proposed_title, proposed_frontmatter, proposed_body, metadata, status, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'MERGE_DUPLICATE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
    [proposalId, primaryDoc.workspace_id ?? "default", primaryDoc.id, duplicateDoc.id, authorId, actor.userId, actor.deviceId, duplicateDoc.id, primaryDoc.id, entityType, detectionMetadata.similarityScore, JSON.stringify(primaryDoc.frontmatter), primaryDoc.body, JSON.stringify(duplicateDoc.frontmatter), duplicateDoc.body, mergedTitle, JSON.stringify(mergedFrontmatter), mergedBody, JSON.stringify(detectionMetadata), now, now]
  )
  return proposalId
}

export {
  submitNoteProposal,
  loadPendingProposals,
  approveMergeProposal,
  rejectMergeProposal,
  proposeDuplicateMerge
}
