import { dbClient } from "@/lib/db/client"
import type { 
  DocumentSchema, 
  DocumentSchemaGroup, 
  FieldDefinition, 
  MergeProposal, 
  SpecificationDefinition, 
  SpecificationStore, 
  StoredDocument 
} from "@/lib/types"

// ==========================================
// SCHEMAS & GROUPS
// ==========================================

export async function loadSchemaGroups() {
  const records = await dbClient.query("SELECT * FROM schema_groups WHERE is_deleted = 0 ORDER BY name")
  return records.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    documents: [],
  })) as DocumentSchemaGroup[]
}

export async function loadActiveSchemas() {
  const records = await dbClient.query("SELECT * FROM schemas WHERE is_deleted = 0")
  return records.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    parentSchemaId: row.parentSchemaId ?? undefined,
    groupId: row.groupId ?? undefined,
    groupName: row.groupName ?? undefined,
    fields: JSON.parse(row.fields) as FieldDefinition[],
    subtypeFields: row.subtypeFields ? JSON.parse(row.subtypeFields) : undefined,
  })) as DocumentSchema[]
}

export async function saveSchemaWorkspace(groups: DocumentSchemaGroup[]) {
  await dbClient.execute("DELETE FROM schemas")
  await dbClient.execute("DELETE FROM schema_groups")

  for (const group of groups) {
    await dbClient.execute(
      "INSERT INTO schema_groups (id, name, description) VALUES (?, ?, ?)",
      [group.id, group.name, group.description ?? null]
    )

    for (const schema of group.documents) {
      await dbClient.execute(
        "INSERT INTO schemas (id, name, description, parentSchemaId, groupId, groupName, subtypeFields, fields) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          schema.id,
          schema.name,
          schema.description ?? null,
          schema.parentSchemaId ?? null,
          group.id,
          group.name,
          schema.subtypeFields ? JSON.stringify(schema.subtypeFields) : null,
          JSON.stringify(schema.fields),
        ]
      )
    }
  }
}

export async function updateCapturedNoteSchema(noteId: string, schemaId: string) {
  await dbClient.execute(
    "UPDATE notes SET schema_id = ? WHERE id = ?",
    [schemaId, noteId]
  )
}

// ==========================================
// SPECIFICATIONS & REGISTRY
// ==========================================

export async function loadSpecifications(): Promise<SpecificationStore> {
  const rows = await dbClient.query("SELECT kind, value FROM specifications ORDER BY kind, value")
  const byId: SpecificationStore = {}

  rows.forEach((row) => {
    const specificationId = String(row.kind)
    if (!byId[specificationId]) {
      byId[specificationId] = []
    }
    byId[specificationId].push(String(row.value))
  })

  return byId
}

export async function loadSpecificationRegistry(): Promise<SpecificationDefinition[]> {
  const rows = await dbClient.query("SELECT id, name, description FROM specification_registry ORDER BY name")
  const byId = new Map<string, SpecificationDefinition>()

  rows.forEach((row) => {
    byId.set(String(row.id), {
      id: String(row.id),
      name: String(row.name),
      description: row.description ? String(row.description) : undefined,
    })
  })

  return [...byId.values()]
}

export async function saveSpecificationRegistry(registry: SpecificationDefinition[]) {
  await dbClient.execute("DELETE FROM specification_registry")

  const normalized = new Map<string, SpecificationDefinition>()
  registry.forEach((item) => {
    const id = item.id.trim()
    if (!id) return
    normalized.set(id, {
      id,
      name: item.name.trim() || id,
      description: item.description?.trim() || undefined,
    })
  })

  for (const item of normalized.values()) {
    await dbClient.execute(
      "INSERT OR REPLACE INTO specification_registry (id, name, description) VALUES (?, ?, ?)",
      [item.id, item.name, item.description ?? null]
    )
  }
}

export async function saveSpecificationValues(specificationId: string, values: string[]) {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  await dbClient.execute("DELETE FROM specifications WHERE kind = ?", [specificationId])

  for (const value of normalized) {
    await dbClient.execute(
      "INSERT INTO specifications (kind, value) VALUES (?, ?)",
      [specificationId, value]
    )
  }
}

export async function saveSpecificationsStore(store: SpecificationStore) {
  await dbClient.execute("DELETE FROM specifications")

  const entries = Object.entries(store)
  for (const [specificationId, values] of entries) {
    const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
    for (const value of normalized) {
      await dbClient.execute(
        "INSERT INTO specifications (kind, value) VALUES (?, ?)",
        [specificationId, value]
      )
    }
  }
}

// ==========================================
// NOTES & CAPTURED DOCUMENTS
// ==========================================

export async function saveCapturedNote(
  id: string, 
  schemaId: string, 
  title: string, 
  frontmatter: Record<string, any>, 
  body: string, 
  userId: string = "system-user",
  parentId?: string,
  workspaceId: string = "default"
) {
  const now = Date.now()
  await dbClient.execute(
    `INSERT INTO notes (
       id, workspace_id, schema_id, parent_id, title, frontmatter, body, 
       created_by, updated_by, created_at, updated_at, is_deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
     ON CONFLICT(id) DO UPDATE SET
       schema_id = excluded.schema_id,
       parent_id = excluded.parent_id,
       title = excluded.title,
       frontmatter = excluded.frontmatter,
       body = excluded.body,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at,
       is_deleted = 0,
       synced_at = NULL`,
    [id, workspaceId, schemaId, parentId ?? null, title, JSON.stringify(frontmatter), body, userId, userId, now, now]
  )
  return id
}

export async function softDeleteCapturedNote(id: string, userId: string = "system-user") {
  const now = Date.now()
  await dbClient.execute(
    `UPDATE notes 
     SET is_deleted = 1, deleted_by = ?, updated_by = ?, updated_at = ?, synced_at = NULL 
     WHERE id = ?`,
    [userId, userId, now, id]
  )
}

export async function loadCapturedDocuments(workspaceId: string = "default") {
  const records = await dbClient.query(
    `SELECT id, schema_id, parent_id, title, frontmatter, body, created_at, created_by, updated_by 
     FROM notes 
     WHERE workspace_id = ? AND is_deleted = 0 
     ORDER BY created_at DESC`,
    [workspaceId]
  )

  return records.map((row) => ({
    id: row.id,
    schema_id: row.schema_id,
    title: row.title,
    frontmatter: JSON.parse(row.frontmatter),
    body: row.body,
    parent_id: row.parent_id ?? undefined,
    created_at: typeof row.created_at === "number" ? new Date(row.created_at).toISOString() : row.created_at,
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined
  })) as StoredDocument[]
}

export async function loadDeletedDocumentsForReview(workspaceId: string = "default") {
  return await dbClient.query(
    `SELECT id, schema_id, title, created_by, deleted_by, updated_at 
     FROM notes 
     WHERE workspace_id = ? AND is_deleted = 1 
     ORDER BY updated_at DESC`,
    [workspaceId]
  )
}

export async function restoreDeletedNote(id: string, userId: string = "system-user") {
  const now = Date.now()
  await dbClient.execute(
    `UPDATE notes 
     SET is_deleted = 0, deleted_by = NULL, updated_by = ?, updated_at = ?, synced_at = NULL 
     WHERE id = ?`,
    [userId, now, id]
  )
}

export async function getNotesForWorkspaceExport() {
  return await dbClient.query("SELECT title, frontmatter, body FROM notes WHERE is_deleted = 0")
}

// ==========================================
// MERGE QUEUE & PROPOSALS
// ==========================================

export async function submitNoteProposal(
  documentId: string,
  _schemaId: string,
  proposedTitle: string,
  proposedFrontmatter: Record<string, any>,
  proposedBody: string,
  authorId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  existingNote?: StoredDocument,
  workspaceId: string = "default"
) {
  const proposalId = `prop-${crypto.randomUUID()}`
  const now = Date.now()

  await dbClient.execute(
    `INSERT INTO merge_queue (
      id, workspace_id, document_id, author_id, action,
      base_frontmatter, base_body,
      proposed_title, proposed_frontmatter, proposed_body,
      status, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
    [
      proposalId,
      workspaceId,
      documentId,
      authorId,
      action,
      existingNote ? JSON.stringify(existingNote.frontmatter) : null,
      existingNote ? existingNote.body : null,
      proposedTitle,
      JSON.stringify(proposedFrontmatter),
      proposedBody,
      now,
      now
    ]
  )

  return proposalId
}

export async function loadPendingProposals(workspaceId: string = "default") {
  const records = await dbClient.query(
    `SELECT * FROM merge_queue WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at ASC`,
    [workspaceId]
  )
  return records as MergeProposal[]
}

export async function approveMergeProposal(proposalId: string, reviewerId: string) {
  const [proposal] = await dbClient.query("SELECT * FROM merge_queue WHERE id = ?", [proposalId])
  if (!proposal || proposal.status !== "pending") {
    throw new Error("Proposal is invalid or already processed.")
  }

  const now = Date.now()

  if (proposal.action === "DELETE") {
    await dbClient.execute(
      `UPDATE notes 
       SET is_deleted = 1, deleted_by = ?, updated_by = ?, updated_at = ?, synced_at = NULL 
       WHERE id = ?`,
      [proposal.author_id, reviewerId, now, proposal.document_id]
    )
  } else if (proposal.action === "MERGE_DUPLICATE") {
    await dbClient.execute(
      `UPDATE notes 
       SET is_deleted = 1, deleted_by = ?, updated_by = ?, updated_at = ?, synced_at = NULL 
       WHERE id = ?`,
      [proposal.author_id, reviewerId, now, proposal.secondary_document_id]
    )

    await dbClient.execute(
      `UPDATE notes 
       SET title = ?, frontmatter = ?, body = ?, updated_by = ?, updated_at = ?, synced_at = NULL 
       WHERE id = ?`,
      [
        proposal.proposed_title,
        proposal.proposed_frontmatter,
        proposal.proposed_body,
        reviewerId,
        now,
        proposal.document_id
      ]
    )
  } else {
    await dbClient.execute(
      `INSERT INTO notes (
         id, workspace_id, schema_id, parent_id, title, frontmatter, body, 
         created_by, updated_by, created_at, updated_at, is_deleted, synced_at
       ) VALUES (?, ?, 'event', NULL, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         frontmatter = excluded.frontmatter,
         body = excluded.body,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at,
         is_deleted = 0,
         synced_at = NULL`,
      [
        proposal.document_id,
        proposal.workspace_id,
        proposal.proposed_title,
        proposal.proposed_frontmatter,
        proposal.proposed_body,
        proposal.author_id,
        reviewerId,
        now,
        now
      ]
    )
  }

  await dbClient.execute(
    `UPDATE merge_queue 
     SET status = 'approved', reviewed_by = ?, updated_at = ?, synced_at = NULL 
     WHERE id = ?`,
    [reviewerId, now, proposalId]
  )
}

export async function rejectMergeProposal(proposalId: string, reviewerId: string, comment: string) {
  const now = Date.now()
  await dbClient.execute(
    `UPDATE merge_queue 
     SET status = 'rejected', reviewed_by = ?, review_comment = ?, updated_at = ?, synced_at = NULL 
     WHERE id = ?`,
    [reviewerId, comment, now, proposalId]
  )
}

export async function proposeDuplicateMerge(
  primaryDoc: StoredDocument,
  duplicateDoc: StoredDocument,
  mergedTitle: string,
  mergedFrontmatter: Record<string, any>,
  mergedBody: string,
  authorId: string = "system:duplicate-detector",
  detectionMetadata: { similarityScore: number; matchReasons: string[] }
) {
  const proposalId = `dup-${crypto.randomUUID()}`
  const now = Date.now()

  await dbClient.execute(
    `INSERT INTO merge_queue (
      id, workspace_id, document_id, secondary_document_id, author_id, action,
      base_frontmatter, base_body,
      secondary_base_frontmatter, secondary_base_body,
      proposed_title, proposed_frontmatter, proposed_body,
      metadata, status, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, 'MERGE_DUPLICATE', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
    [
      proposalId,
      primaryDoc.workspace_id ?? "default",
      primaryDoc.id,
      duplicateDoc.id,
      authorId,
      JSON.stringify(primaryDoc.frontmatter),
      primaryDoc.body,
      JSON.stringify(duplicateDoc.frontmatter),
      duplicateDoc.body,
      mergedTitle,
      JSON.stringify(mergedFrontmatter),
      mergedBody,
      JSON.stringify(detectionMetadata),
      now,
      now
    ]
  )

  return proposalId
}