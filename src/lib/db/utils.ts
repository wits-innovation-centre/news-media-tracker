import { dbClient } from "@/lib/db/client"
import type { DocumentSchema, DocumentSchemaGroup, FieldDefinition, SpecificationDefinition, SpecificationStore, StoredDocument } from "@/lib/types"

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