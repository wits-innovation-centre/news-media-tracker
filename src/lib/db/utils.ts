import { dbClient } from "@/lib/db/client"
import type { DocumentSchema, FieldDefinition } from "@/lib/types"

export async function loadActiveSchemas() {
  const records = await dbClient.query("SELECT * FROM schemas")
  return records.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    kind: row.kind ?? "custom",
    parentSchemaId: row.parentSchemaId ?? undefined,
    fields: JSON.parse(row.fields) as FieldDefinition[]
  })) as DocumentSchema[]
}

export async function saveCustomSchema(id: string, name: string, fields: FieldDefinition[], description?: string, kind: "template" | "custom" = "custom", parentSchemaId?: string) {
  await dbClient.execute(
    "INSERT OR REPLACE INTO schemas (id, name, description, kind, parentSchemaId, fields) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, description ?? null, kind, parentSchemaId ?? null, JSON.stringify(fields)]
  )
}

export async function deleteCustomSchema(id: string) {
  await dbClient.execute("DELETE FROM schemas WHERE id = ?", [id])
}

export async function insertCapturedNote(schemaId: string, title: string, frontmatter: Record<string, any>, body: string) {
  const noteId = crypto.randomUUID()
  await dbClient.execute(
    "INSERT INTO notes (id, schema_id, title, frontmatter, body) VALUES (?, ?, ?, ?, ?)",
    [noteId, schemaId, title, JSON.stringify(frontmatter), body]
  )
}

export async function getNotesForWorkspaceExport() {
  return await dbClient.query("SELECT title, frontmatter, body FROM notes")
}