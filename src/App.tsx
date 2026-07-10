import './App.css';
import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
import { Capture } from "@/components/ui/custom/capture";
import Layout from "@/components/ui/custom/layout";
import { SettingsModal } from "@/components/ui/custom/settings-modal";

import { initializeDatabase } from "@/lib/db/client";
import {
  loadCapturedDocuments,
  loadActiveSchemas,
  loadSchemaGroups,
  saveCapturedNote,
  saveSchemaWorkspace,
} from "@/lib/db/utils";
import {
  DEFAULT_SCHEMA_TEMPLATES,
  createSchemaGroupFromTemplate,
} from "@/lib/schema-registry";
import { exportSqliteToObsidianWorkspace } from "@/lib/utils";
import type { DocumentNode, DocumentSchema, DocumentSchemaGroup, StoredDocument } from "@/lib/types";

function App() {
  const [schemaGroups, setSchemaGroups] = useState<DocumentSchemaGroup[]>(() =>
    DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaGroupFromTemplate(template))
  );
  const [documents, setDocuments] = useState<DocumentNode[]>([]);
  const [storedDocuments, setStoredDocuments] = useState<Record<string, StoredDocument>>({});
  const [drafts, setDrafts] = useState<Record<string, Record<string, any>>>({});
  const [activeSchemaId, setActiveSchemaId] = useState<string>();
  const [activeDocumentId, setActiveDocumentId] = useState<string>();
  const [isDbReady, setIsDbReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Local workspace ready");

  useEffect(() => {
    void (async () => {
      try {
        await initializeDatabase();
        const storedGroups = await loadSchemaGroups();
        const storedSchemas = await loadActiveSchemas();
        const storedDocuments = await loadCapturedDocuments();
        const defaultGroups = DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaGroupFromTemplate(template));

        const hydratedGroups = storedGroups.length > 0 || storedSchemas.length > 0
          ? storedGroups.map((group) => ({
            ...group,
            documents: storedSchemas.filter((schema) => schema.groupId === group.id),
          }))
          : defaultGroups;

        setSchemaGroups(hydratedGroups);
        setDocuments(storedDocuments.map((record) => ({
          id: record.id,
          schemaId: record.schema_id,
          label: record.title,
          parentId: record.parent_id,
        })));
        setStoredDocuments(Object.fromEntries(storedDocuments.map((record) => [record.id, record])));
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
    return match
  }, [activeSchemaId, schemas])

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId),
    [activeDocumentId, documents]
  )

  const activeInitialValues = useMemo(() => {
    if (!activeDocumentId || !activeSchema) return undefined

    if (drafts[activeDocumentId]) return drafts[activeDocumentId]

    const stored = storedDocuments[activeDocumentId]
    if (!stored) return undefined

    const markdownFields = activeSchema.fields.filter((field) => field.type.data === "markdown")
    const values: Record<string, any> = { ...stored.frontmatter }
    markdownFields.forEach((field) => {
      values[field.name] = stored.body
    })
    return values
  }, [activeDocumentId, activeSchema, drafts, storedDocuments])

  const persistSchemaGroups = async (nextGroups: DocumentSchemaGroup[]) => {
    setSchemaGroups(nextGroups)
    await saveSchemaWorkspace(nextGroups)
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (!activeDocumentId && !activeSchemaId) return

      setActiveDocumentId(undefined)
      setActiveSchemaId(undefined)
      setStatusMessage("Selection cleared. Current values remain saved as a draft.")
    }

    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [activeDocumentId, activeSchemaId])

  const handleCaptureSubmit = async (frontmatter: Record<string, any>, body: string) => {
    if (!activeSchema || !activeDocument) return

    const documentTitle =
      (frontmatter.title as string) ||
      (frontmatter.name as string) ||
      (frontmatter.id as string) ||
      `Untitled_${Date.now()}`
    if (!isDbReady) {
      setStatusMessage("Database not ready yet; document saved to local shell only")
      return
    }

    const noteId = await saveCapturedNote(activeDocument.id, activeSchema.id, documentTitle, frontmatter, body, activeDocument.parentId)

    setDocuments((current) => {
      return current.map((doc) =>
        doc.id === activeDocument.id ? { ...doc, label: documentTitle, schemaId: activeSchema.id } : doc
      )
    })
    setStoredDocuments((current) => ({
      ...current,
      [noteId]: {
        id: noteId,
        schema_id: activeSchema.id,
        title: documentTitle,
        frontmatter,
        body,
        parent_id: activeDocument.parentId,
      },
    }))
    setDrafts((current) => {
      const next = { ...current }
      delete next[noteId]
      return next
    })
    setStatusMessage(`Stored ${documentTitle} in the local OPFS-backed workspace`)
  }

  const triggerObsidianVaultExport = async () => {
    const notes = await (await import("@/lib/db/utils")).getNotesForWorkspaceExport()
    await exportSqliteToObsidianWorkspace(notes)
  }

  const handleSaveGroup = async (group: DocumentSchemaGroup) => {
    const nextGroups = (() => {
      const existing = schemaGroups.find((current) => current.id === group.id)
      if (!existing) return [...schemaGroups, group]
      return schemaGroups.map((current) => current.id === group.id ? { ...current, ...group, documents: current.documents } : current)
    })()

    await persistSchemaGroups(nextGroups)
    setStatusMessage(`Saved group ${group.name}.`)
  }

  const handleDeleteGroup = async (groupId: string) => {
    const nextGroups = schemaGroups.filter((group) => group.id !== groupId)
    await persistSchemaGroups(nextGroups)
    if (activeSchema?.groupId === groupId) {
      setActiveSchemaId(undefined)
      setActiveDocumentId(undefined)
    }
    setStatusMessage("Schema group deleted.")
  }

  const handleSaveSchema = async (schema: DocumentSchema) => {
    const nextGroups = schemaGroups.map((group) => {
      const withoutSchema = group.documents.filter((current) => current.id !== schema.id)
      if (group.id !== schema.groupId) {
        return { ...group, documents: withoutSchema }
      }

      const existing = group.documents.find((current) => current.id === schema.id)
      return {
        ...group,
        documents: existing ? [...withoutSchema, schema] : [...withoutSchema, schema],
      }
    })

    await persistSchemaGroups(nextGroups)
    setActiveSchemaId(schema.id)
    setStatusMessage(`Schema ${schema.name} saved.`)
  }

  const handleDeleteSchema = async (id: string) => {
    const nextGroups = schemaGroups
      .map((group) => ({ ...group, documents: group.documents.filter((schema) => schema.id !== id) }))
    await persistSchemaGroups(nextGroups)
    if (activeSchemaId === id) {
      setActiveSchemaId(undefined)
      setActiveDocumentId(undefined)
    }
    setStatusMessage("Schema deleted.")
  }

  const handleCreateDocument = (schema: DocumentSchema, parentId?: string) => {
    const siblingCount = documents.filter(
      (doc) => doc.schemaId === schema.id && doc.parentId === parentId
    ).length

    const node: DocumentNode = {
      id: crypto.randomUUID(),
      schemaId: schema.id,
      parentId,
      label: `${schema.name} ${siblingCount + 1}`,
    }

    setDocuments((current) => [...current, node])
    setActiveDocumentId(node.id)
    setActiveSchemaId(schema.id)
  }

  const handleSelectDocument = (documentId: string, schemaId: string) => {
    setActiveDocumentId(documentId)
    setActiveSchemaId(schemaId)
  }

  return (
    <Layout
      schemas={schemas}
      documents={documents}
      activeSchemaId={activeSchemaId}
      activeDocumentId={activeDocumentId}
      onSelectSchema={(schemaId) => setActiveSchemaId(schemaId)}
      onSelectDocument={handleSelectDocument}
      onCreateDocument={handleCreateDocument}
    >
      <div className="relative min-h-screen bg-background text-foreground flex p-8">
        <SettingsModal
          groups={schemaGroups}
          onSaveSchema={handleSaveSchema}
          onSaveGroup={handleSaveGroup}
          onDeleteGroup={handleDeleteGroup}
          onDeleteSchema={handleDeleteSchema}
          onExportToObsidian={triggerObsidianVaultExport}
        />

        <main className="max-w-2xl mx-auto w-full space-y-4">
          {activeSchema && activeDocumentId ? (
            <Capture
              fields={activeSchema.fields}
              initialValues={activeInitialValues}
              onValuesChange={(values) => {
                if (!activeDocumentId) return
                setDrafts((current) => ({ ...current, [activeDocumentId]: values }))
              }}
              onSubmit={handleCaptureSubmit}
            />
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No active document selected. Create one from the sidebar, or press the settings button to edit schema groups and schemas.
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
}

export default App;