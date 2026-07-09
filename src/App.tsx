import './App.css';
import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
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
  DEFAULT_SCHEMA_TEMPLATES,
  createSchemaFromTemplate,
  createSchemaGroupFromTemplate,
  buildFieldDefinitionsForParent
} from "@/lib/schema-registry";
import { exportSqliteToObsidianWorkspace } from "@/lib/utils";
import type { DocumentSchema, DocumentSchemaGroup, FieldDefinition } from "@/lib/types";

function App() {
  const [schemaGroups, setSchemaGroups] = useState<DocumentSchemaGroup[]>(() =>
    DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaGroupFromTemplate(template))
  );
  const [activeSchemaId, setActiveSchemaId] = useState<string>();
  const [isDbReady, setIsDbReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Local workspace ready");

  useEffect(() => {
    void (async () => {
      try {
        await initializeDatabase();
        const storedSchemas = await loadActiveSchemas();
        const defaultGroups = DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaGroupFromTemplate(template));

        const hydratedGroups = storedSchemas.length > 0
          ? [
            {
              id: "custom-documents",
              name: "Custom Documents",
              description: "User-created schema documents",
              documents: storedSchemas,
            },
            ...defaultGroups,
          ]
          : defaultGroups;

        setSchemaGroups(hydratedGroups);
        setActiveSchemaId(hydratedGroups[0]?.documents[0]?.id ?? undefined);
        setIsDbReady(true);
      } catch (error) {
        console.error("Failed preparing database", error);
        setStatusMessage("Database initialization failed; using in-memory scaffolding");
      }
    })();
  }, []);

  useEffect(() => {
    toast(statusMessage);
  }, [statusMessage]);

  const schemas = useMemo(
    () => schemaGroups.flatMap((group) => group.documents),
    [schemaGroups]
  );

  const activeSchema = useMemo(() => {
    const match = schemas.find((schema) => schema.id === activeSchemaId)
    return match ?? schemas[0]
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
      fields,
    }
    await saveCustomSchema(schema.id, schema.name, schema.fields)
    setSchemaGroups((current) => {
      const next = [...current]
      const customGroupIndex = next.findIndex((group) => group.id === "custom-documents")
      if (customGroupIndex === -1) {
        next.push({ id: "custom-documents", name: "Custom Documents", description: "User-created schema documents", documents: [schema] })
      } else {
        next[customGroupIndex] = {
          ...next[customGroupIndex],
          documents: [...next[customGroupIndex].documents, schema],
        }
      }
      return next
    })
    setActiveSchemaId(schema.id)
    setStatusMessage(`Schema ${name} added. You can create a new document from it now.`)
  }

  const handleDeleteSchema = async (id: string) => {
    await deleteCustomSchema(id)
    setSchemaGroups((current) =>
      current
        .map((group) => ({ ...group, documents: group.documents.filter((schema) => schema.id !== id) }))
        .filter((group) => group.documents.length > 0)
    )
    if (activeSchemaId === id) {
      const fallback = schemas.find((schema) => schema.id !== id)
      setActiveSchemaId(fallback?.id ?? undefined)
    }
  }

  const handleCreateChildSchema = async (parentSchema: DocumentSchema) => {
    const childSchema = createSchemaFromTemplate({
      ...parentSchema,
      id: `${parentSchema.id}-child`,
      name: `${parentSchema.name} Child`,
      description: `Child of ${parentSchema.name}`,
      fields: [],
      parentSchemaId: parentSchema.id,
    })
    const combinedFields = buildFieldDefinitionsForParent(parentSchema, childSchema)
    const schemaToSave: DocumentSchema = {
      ...childSchema,
      fields: combinedFields,
    }
    await saveCustomSchema(schemaToSave.id, schemaToSave.name, schemaToSave.fields)
    setSchemaGroups((current) => {
      const next = [...current]
      const customGroupIndex = next.findIndex((group) => group.id === "custom-documents")
      if (customGroupIndex === -1) {
        next.push({ id: "custom-documents", name: "Custom Documents", description: "User-created schema documents", documents: [schemaToSave] })
      } else {
        next[customGroupIndex] = {
          ...next[customGroupIndex],
          documents: [...next[customGroupIndex].documents, schemaToSave],
        }
      }
      return next
    })
    setActiveSchemaId(schemaToSave.id)
    setStatusMessage(`Nested document scaffold created for ${parentSchema.name}`)
  }

  return (
    <Layout
      schemas={schemas}
      activeSchemaId={activeSchemaId}
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
          <Capture
            fields={activeSchema.fields}
            onSubmit={handleCaptureSubmit}
          />
        </main>
      </div>
    </Layout>
  );
};

export default App;