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
    loadSpecificationRegistry,
    loadSpecifications,
    loadSchemaGroups,
    saveCapturedNote,
    saveSpecificationRegistry,
    saveSpecificationsStore,
    saveSpecificationValues,
    saveSchemaWorkspace,
    updateCapturedNoteSchema,
} from "@/lib/db/utils";
import {
    DEFAULT_SCHEMA_TEMPLATES,
    createSchemaGroupFromTemplate,
} from "@/lib/schema-registry";
import { exportSqliteToObsidianWorkspace } from "@/lib/utils";
import type {
    DocumentNode,
    DocumentSchema,
    DocumentSchemaGroup,
    FieldDefinition,
    SpecificationDefinition,
    SpecificationStore,
    StoredDocument,
} from "@/lib/types";

const extractSpecificationDefaults = (groups: DocumentSchemaGroup[]): SpecificationStore => {
    const schemas = groups.flatMap((group) => group.documents);
    const allFields = schemas.flatMap((schema) => schema.fields);

    const byId: SpecificationStore = {};
    allFields.forEach((field) => {
        const specificationId = field.specification?.trim();
        if (!specificationId || !Array.isArray(field.options)) return;

        const seeded = (field.options as string[]).map((value) => value.trim()).filter(Boolean);
        byId[specificationId] = [...new Set([...(byId[specificationId] ?? []), ...seeded])];
    });

    return byId;
};

const extractSpecificationRegistryDefaults = (groups: DocumentSchemaGroup[]): SpecificationDefinition[] => {
    const schemas = groups.flatMap((group) => group.documents);
    const ids = [...new Set(schemas.flatMap((schema) => schema.fields.map((field) => field.specification?.trim()).filter(Boolean) as string[]))];
    return ids.map((id) => ({ id, name: id.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) }));
};

const mergeSpecificationStore = (
    stored: SpecificationStore,
    defaults: SpecificationStore,
    registry: SpecificationDefinition[]
): SpecificationStore => {
    const next: SpecificationStore = {};
    registry.forEach((item) => {
        const storedValues = stored[item.id] ?? [];
        const defaultValues = defaults[item.id] ?? [];
        next[item.id] = storedValues.length > 0
            ? [...new Set(storedValues.map((value) => value.trim()).filter(Boolean))]
            : [...new Set(defaultValues.map((value) => value.trim()).filter(Boolean))];
    });
    return next;
};

const applySpecificationsToGroups = (
    groups: DocumentSchemaGroup[],
    specifications: SpecificationStore
): DocumentSchemaGroup[] => {
    const patchField = (field: FieldDefinition): FieldDefinition => {
        if (!field.specification) return field;
        const specificationValues = specifications[field.specification];
        if (!specificationValues) return field;
        return { ...field, options: specificationValues };
    };

    return groups.map((group) => ({
        ...group,
        documents: group.documents.map((schema) => ({
            ...schema,
            fields: schema.fields.map(patchField),
        })),
    }));
};

const createDefaultSchemaGroups = () =>
    DEFAULT_SCHEMA_TEMPLATES.map((template) =>
        createSchemaGroupFromTemplate(template, undefined, { preserveTemplateIds: true })
    );

const TEMPLATE_SCHEMA_IDS = new Set(
    DEFAULT_SCHEMA_TEMPLATES.flatMap((group) => group.documents.map((schema) => schema.id))
);

const normalizeLegacySchemaId = (schemaId: string, availableSchemaIds: Set<string>): string => {
    if (availableSchemaIds.has(schemaId)) return schemaId;

    for (const templateSchemaId of TEMPLATE_SCHEMA_IDS) {
        if (schemaId.startsWith(`${templateSchemaId}-`) && availableSchemaIds.has(templateSchemaId)) {
            return templateSchemaId;
        }
    }

    return schemaId;
};

function App() {
    const [schemaGroups, setSchemaGroups] = useState<DocumentSchemaGroup[]>(() =>
        createDefaultSchemaGroups()
    );
    const [documents, setDocuments] = useState<DocumentNode[]>([]);
    const [storedDocuments, setStoredDocuments] = useState<Record<string, StoredDocument>>({});
    const [specificationRegistry, setSpecificationRegistry] = useState<SpecificationDefinition[]>([]);
    const [specifications, setSpecifications] = useState<SpecificationStore>({});
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
                const loadedDocuments = await loadCapturedDocuments();
                const storedRegistry = await loadSpecificationRegistry();
                const storedSpecifications = await loadSpecifications();
                const defaultGroups = createDefaultSchemaGroups();

                const hydratedGroups =
                    storedGroups.length > 0 || storedSchemas.length > 0
                        ? storedGroups.map((group) => ({
                            ...group,
                            documents: storedSchemas.filter((schema) => schema.groupId === group.id),
                        }))
                        : defaultGroups;

                const specDefaults = extractSpecificationDefaults(hydratedGroups);
                const registryDefaults = extractSpecificationRegistryDefaults(hydratedGroups);
                const combinedIds = [...new Set([
                    ...storedRegistry.map((item) => item.id),
                    ...registryDefaults.map((item) => item.id),
                    ...Object.keys(storedSpecifications),
                    ...Object.keys(specDefaults),
                ])];

                const normalizedRegistry: SpecificationDefinition[] = combinedIds.map((id) => {
                    const storedEntry = storedRegistry.find((item) => item.id === id);
                    if (storedEntry) return storedEntry;
                    const defaultEntry = registryDefaults.find((item) => item.id === id);
                    if (defaultEntry) return defaultEntry;
                    return {
                        id,
                        name: id.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
                    };
                });

                const normalizedSpecs = mergeSpecificationStore(storedSpecifications, specDefaults, normalizedRegistry);

                const availableSchemaIds = new Set(hydratedGroups.flatMap((group) => group.documents.map((schema) => schema.id)));
                const normalizedDocuments = loadedDocuments.map((record) => {
                    const nextSchemaId = normalizeLegacySchemaId(record.schema_id, availableSchemaIds);
                    if (nextSchemaId === record.schema_id) return record;
                    return { ...record, schema_id: nextSchemaId };
                });
                const migratedSchemaRecords = normalizedDocuments.filter((record, index) => record.schema_id !== loadedDocuments[index].schema_id);

                if (migratedSchemaRecords.length > 0) {
                    await Promise.all(
                        migratedSchemaRecords.map((record) => updateCapturedNoteSchema(record.id, record.schema_id))
                    );
                }

                if (storedRegistry.length === 0 && normalizedRegistry.length > 0) {
                    await saveSpecificationRegistry(normalizedRegistry);
                }

                if (Object.keys(storedSpecifications).length === 0 && Object.keys(normalizedSpecs).length > 0) {
                    await saveSpecificationsStore(normalizedSpecs);
                }

                setSchemaGroups(hydratedGroups);
                setSpecificationRegistry(normalizedRegistry);
                setSpecifications(normalizedSpecs);
                setDocuments(
                    normalizedDocuments.map((record) => ({
                        id: record.id,
                        schemaId: record.schema_id,
                        label: record.title,
                        parentId: record.parent_id,
                    }))
                );
                setStoredDocuments(Object.fromEntries(normalizedDocuments.map((record) => [record.id, record])));
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
        () => applySpecificationsToGroups(schemaGroups, specifications).flatMap((group) => group.documents),
        [schemaGroups, specifications]
    );

    const groupsWithSpecifications = useMemo(
        () => applySpecificationsToGroups(schemaGroups, specifications),
        [schemaGroups, specifications]
    );

    const activeSchema = useMemo(() => {
        const match = schemas.find((schema) => schema.id === activeSchemaId);
        return match;
    }, [activeSchemaId, schemas]);

    const activeDocument = useMemo(
        () => documents.find((document) => document.id === activeDocumentId),
        [activeDocumentId, documents]
    );

    const activeInitialValues = useMemo(() => {
        if (!activeDocumentId || !activeSchema) return undefined;

        if (drafts[activeDocumentId]) return drafts[activeDocumentId];

        const stored = storedDocuments[activeDocumentId];
        if (!stored) return undefined;

        const markdownFields = activeSchema.fields.filter((field) => field.type.data === "markdown");
        const values: Record<string, any> = { ...stored.frontmatter };
        markdownFields.forEach((field) => {
            values[field.name] = stored.body;
        });
        return values;
    }, [activeDocumentId, activeSchema, drafts, storedDocuments]);

    const persistSchemaGroups = async (nextGroups: DocumentSchemaGroup[]) => {
        setSchemaGroups(nextGroups);
        await saveSchemaWorkspace(nextGroups);
    };

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (!activeDocumentId && !activeSchemaId) return;

            setActiveDocumentId(undefined);
            setActiveSchemaId(undefined);
            setStatusMessage("Selection cleared. Current values remain saved as a draft.");
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [activeDocumentId, activeSchemaId]);

    const handleCaptureSubmit = async (frontmatter: Record<string, any>, body: string) => {
        if (!activeSchema || !activeDocument) return;

        const documentTitle =
            (frontmatter.title as string) ||
            (frontmatter.name as string) ||
            (frontmatter.id as string) ||
            `Untitled_${Date.now()}`;
        if (!isDbReady) {
            setStatusMessage("Database not ready yet; document saved to local shell only");
            return;
        }

        const noteId = await saveCapturedNote(
            activeDocument.id,
            activeSchema.id,
            documentTitle,
            frontmatter,
            body,
            activeDocument.parentId
        );

        setDocuments((current) => {
            return current.map((doc) =>
                doc.id === activeDocument.id ? { ...doc, label: documentTitle, schemaId: activeSchema.id } : doc
            );
        });
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
        }));
        setDrafts((current) => {
            const next = { ...current };
            delete next[noteId];
            return next;
        });
        setStatusMessage(`Stored ${documentTitle} in the local OPFS-backed workspace`);
    };

    const triggerObsidianVaultExport = async () => {
        const notes = await (await import("@/lib/db/utils")).getNotesForWorkspaceExport();
        await exportSqliteToObsidianWorkspace(notes);
    };

    const handleSaveGroup = async (group: DocumentSchemaGroup) => {
        const nextGroups = (() => {
            const existing = schemaGroups.find((current) => current.id === group.id);
            if (!existing) return [...schemaGroups, group];
            return schemaGroups.map((current) =>
                current.id === group.id ? { ...current, ...group, documents: current.documents } : current
            );
        })();

        await persistSchemaGroups(nextGroups);
        setStatusMessage(`Saved group ${group.name}.`);
    };

    const handleDeleteGroup = async (groupId: string) => {
        const nextGroups = schemaGroups.filter((group) => group.id !== groupId);
        await persistSchemaGroups(nextGroups);
        if (activeSchema?.groupId === groupId) {
            setActiveSchemaId(undefined);
            setActiveDocumentId(undefined);
        }
        setStatusMessage("Schema group deleted.");
    };

    const handleSaveSchema = async (schema: DocumentSchema) => {
        const nextGroups = schemaGroups.map((group) => {
            const withoutSchema = group.documents.filter((current) => current.id !== schema.id);
            if (group.id !== schema.groupId) {
                return { ...group, documents: withoutSchema };
            }

            const existing = group.documents.find((current) => current.id === schema.id);
            return {
                ...group,
                documents: existing ? [...withoutSchema, schema] : [...withoutSchema, schema],
            };
        });

        await persistSchemaGroups(nextGroups);
        setActiveSchemaId(schema.id);
        setStatusMessage(`Schema ${schema.name} saved.`);
    };

    const handleSaveSpecifications = async (nextRegistry: SpecificationDefinition[], nextValues: SpecificationStore) => {
        await saveSpecificationRegistry(nextRegistry);
        await saveSpecificationsStore(nextValues);
        setSpecificationRegistry(nextRegistry);
        setSpecifications(nextValues);
        setStatusMessage("Specifications saved to local backend store.");
    };

    const handleAddSpecification = async (specificationId: string, value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;

        const nextValues = [...new Set([...(specifications[specificationId] ?? []), trimmed])].sort((left, right) =>
            left.localeCompare(right)
        );
        await saveSpecificationValues(specificationId, nextValues);
        setSpecifications((current) => ({
            ...current,
            [specificationId]: nextValues,
        }));
        setStatusMessage(`Added ${trimmed} to ${specificationId}.`);
    };

    const handleDeleteSchema = async (id: string) => {
        const nextGroups = schemaGroups.map((group) => ({
            ...group,
            documents: group.documents.filter((schema) => schema.id !== id),
        }));
        await persistSchemaGroups(nextGroups);
        if (activeSchemaId === id) {
            setActiveSchemaId(undefined);
            setActiveDocumentId(undefined);
        }
        setStatusMessage("Schema deleted.");
    };

    const handleCreateDocument = (schema: DocumentSchema, parentId?: string) => {
        const siblingCount = documents.filter(
            (doc) => doc.schemaId === schema.id && doc.parentId === parentId
        ).length;

        const node: DocumentNode = {
            id: crypto.randomUUID(),
            schemaId: schema.id,
            parentId,
            label: `${schema.name} ${siblingCount + 1}`,
        };

        setDocuments((current) => [...current, node]);
        setActiveDocumentId(node.id);
        setActiveSchemaId(schema.id);
    };

    const handleSelectDocument = (documentId: string, schemaId: string) => {
        setActiveDocumentId(documentId);
        setActiveSchemaId(schemaId);
    };

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
                    groups={groupsWithSpecifications}
                    specificationRegistry={specificationRegistry}
                    specifications={specifications}
                    onSaveSchema={handleSaveSchema}
                    onSaveGroup={handleSaveGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onDeleteSchema={handleDeleteSchema}
                    onSaveSpecifications={handleSaveSpecifications}
                    onExportToObsidian={triggerObsidianVaultExport}
                />

                <main className="max-w-2xl mx-auto w-full space-y-4">
                    {activeSchema && activeDocumentId ? (
                        <Capture
                            fields={activeSchema.fields}
                            initialValues={activeInitialValues}
                            specifications={specifications}
                            onValuesChange={(values) => {
                                if (!activeDocumentId) return;
                                setDrafts((current) => ({ ...current, [activeDocumentId]: values }));
                            }}
                            onAddSpecification={handleAddSpecification}
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
