import { dbClient } from "@/lib/db/client"
import { type FieldDefinition } from "@/components/ui/custom/capture"

export async function loadActiveSchemas() {
  const records = await dbClient.query("SELECT * FROM schemas")
  return records.map(row => ({
    id: row.id,
    name: row.name,
    fields: JSON.parse(row.fields) as FieldDefinition[]
  }))
}

export async function saveCustomSchema(id: string, name: string, fields: FieldDefinition[]) {
  await dbClient.execute(
    "INSERT OR REPLACE INTO schemas (id, name, fields) VALUES (?, ?, ?)",
    [id, name, JSON.stringify(fields)]
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