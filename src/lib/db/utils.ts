import { dbClient } from "@/lib/db/client"
import type { DocumentSchema, DocumentSchemaGroup, FieldDefinition, StoredDocument } from "@/lib/types"

export async function loadSchemaGroups() {
  const records = await dbClient.query("SELECT * FROM schema_groups ORDER BY name")
  return records.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    documents: [],
  })) as DocumentSchemaGroup[]
}

export async function loadActiveSchemas() {
  const records = await dbClient.query("SELECT * FROM schemas")
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

export async function saveCapturedNote(id: string, schemaId: string, title: string, frontmatter: Record<string, any>, body: string, parentId?: string) {
  await dbClient.execute(
    "INSERT OR REPLACE INTO notes (id, schema_id, parent_id, title, frontmatter, body) VALUES (?, ?, ?, ?, ?, ?)",
    [id, schemaId, parentId ?? null, title, JSON.stringify(frontmatter), body]
  )
  return id
}

export async function loadCapturedDocuments() {
  const records = await dbClient.query(
    "SELECT id, schema_id, title, frontmatter, body, created_at FROM notes ORDER BY created_at DESC"
  )

  return records.map((row) => ({
    id: row.id,
    schema_id: row.schema_id,
    title: row.title,
    frontmatter: JSON.parse(row.frontmatter),
    body: row.body,
    parent_id: row.parent_id ?? undefined,
    created_at: row.created_at,
  })) as StoredDocument[]
}

export async function getNotesForWorkspaceExport() {
  return await dbClient.query("SELECT title, frontmatter, body FROM notes")
}