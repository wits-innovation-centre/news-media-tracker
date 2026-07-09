import './App.css';
import { useEffect, useMemo, useState } from "react";

import { Capture } from "@/components/ui/custom/capture";
import Layout from "@/components/ui/custom/layout";
import { SettingsModal } from "@/components/ui/custom/settings-modal";

import { initializeDatabase } from "@/lib/db/client";
import { 
  deleteCustomSchema, 
  insertCapturedNote, 
  loadActiveSchemas, 
  saveCustomSchema 
} from "@/lib/db/utils";
import {
  DEFAULT_HOMICIDE_TEMPLATE, 
  DEFAULT_SCHEMA_TEMPLATES, 
  createSchemaFromTemplate, 
  buildFieldDefinitionsForParent 
} from "@/lib/schema-registry";
import { exportSqliteToObsidianWorkspace } from "@/lib/utils";
import type { DocumentSchema, FieldDefinition } from "@/lib/types";

function App() {
  const [schemas, setSchemas] = useState<DocumentSchema[]>([DEFAULT_HOMICIDE_TEMPLATE])
  const [activeSchemaId, setActiveSchemaId] = useState<string>(DEFAULT_HOMICIDE_TEMPLATE.id)
  const [isDbReady, setIsDbReady] = useState(false)
  const [statusMessage, setStatusMessage] = useState("Local workspace ready")

  useEffect(() => {
    void (async () => {
      try {
        await initializeDatabase()
        const storedSchemas = await loadActiveSchemas()
        const hydratedSchemas = storedSchemas.length > 0
          ? storedSchemas
          : DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaFromTemplate(template))
        setSchemas(hydratedSchemas)
        setActiveSchemaId(hydratedSchemas[0]?.id ?? DEFAULT_HOMICIDE_TEMPLATE.id)
        setIsDbReady(true)
      } catch (error) {
        console.error("Failed preparing database", error)
        setStatusMessage("Database initialization failed; using in-memory scaffolding")
      }
    })()
  }, [])

  const activeSchema = useMemo(() => {
    const match = schemas.find((schema) => schema.id === activeSchemaId)
    return match ?? schemas[0] ?? DEFAULT_HOMICIDE_TEMPLATE
  }, [activeSchemaId, schemas])

  const handleCaptureSubmit = async (frontmatter: Record<string, any>, body: string) => {
    const documentTitle = (frontmatter.title as string) || `Untitled_${Date.now()}`
    if (!isDbReady) {
      setStatusMessage("Database not ready yet; document saved to local shell only")
      return
    }

    await insertCapturedNote(activeSchema.id, documentTitle, frontmatter, body)
    setStatusMessage(`Stored ${documentTitle} in the local OPFS-backed workspace`)
  }

  const triggerObsidianVaultExport = async () => {
    const notes = await (await import("@/lib/db/utils")).getNotesForWorkspaceExport()
    await exportSqliteToObsidianWorkspace(notes)
  }

  const handleSaveSchema = async (name: string, fields: FieldDefinition[]) => {
    const schema: DocumentSchema = {
      id: crypto.randomUUID(),
      name,
      kind: "custom",
      fields,
    }
    await saveCustomSchema(schema.id, schema.name, schema.fields)
    setSchemas((current) => [...current, schema])
    setActiveSchemaId(schema.id)
    setStatusMessage(`Schema ${name} added. You can create a new document from it now.`)
  }

  const handleDeleteSchema = async (id: string) => {
    await deleteCustomSchema(id)
    setSchemas((current) => current.filter((schema) => schema.id !== id))
    if (activeSchemaId === id) {
      const fallback = schemas.find((schema) => schema.id !== id)
      setActiveSchemaId(fallback?.id ?? DEFAULT_HOMICIDE_TEMPLATE.id)
    }
  }

  const handleCreateChildSchema = async (parentSchema: DocumentSchema) => {
    const childSchema = createSchemaFromTemplate({
      ...parentSchema,
      id: `${parentSchema.id}-child`,
      name: `${parentSchema.name} Child`,
      description: `Child of ${parentSchema.name}`,
      kind: "custom",
      fields: [],
      parentSchemaId: parentSchema.id,
    })
    const combinedFields = buildFieldDefinitionsForParent(parentSchema, childSchema)
    const schemaToSave: DocumentSchema = {
      ...childSchema,
      fields: combinedFields,
    }
    await saveCustomSchema(schemaToSave.id, schemaToSave.name, schemaToSave.fields)
    setSchemas((current) => [...current, schemaToSave])
    setActiveSchemaId(schemaToSave.id)
    setStatusMessage(`Nested document scaffold created for ${parentSchema.name}`)
  }

  return (
    <Layout
      schemas={schemas}
      onSelectSchema={(schemaId) => setActiveSchemaId(schemaId)}
      onCreateChildSchema={handleCreateChildSchema}
    >
      <div className="relative min-h-screen bg-background text-foreground flex p-8">
        <SettingsModal
          userSchemas={schemas}
          onSaveSchema={handleSaveSchema}
          onDeleteSchema={handleDeleteSchema}
          onExportToObsidian={triggerObsidianVaultExport}
          onCreateChildSchema={handleCreateChildSchema}
        />

        <main className="max-w-2xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Capture Engine</h1>
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
            <div className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
              {activeSchema.name}
            </div>
          </div>

          <Capture
            fields={activeSchema.fields}
            onSubmit={handleCaptureSubmit}
          />
        </main>
      </div>
    </Layout>
  )
};

export default App;