import './App.css';
import { useEffect, useMemo, useState } from "react";

import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Capture } from "@/components/ui/custom/capture";
import { LedgerBadge } from "@/components/ui/custom/ledger-badge";
import Layout from "@/components/ui/custom/layout";
import { MergeQueueView } from "@/components/ui/custom/merge-queue-view";
import { SettingsModal } from "@/components/ui/custom/settings-modal";
import { WaybackArchiveStatus } from "@/components/ui/custom/wayback-archive-status";

import {
    approveMergeProposal,
    loadCapturedDocuments,
    loadLedgerRecordByNoteId,
    loadPendingProposals,
    loadWaybackArchiveRecordByArticleId,
    loadActiveSchemas,
    loadSpecificationRegistry,
    loadSpecifications,
    loadSchemaGroups,
    rejectMergeProposal,
    saveCapturedNote,
    saveWaybackArchiveRequest,
    saveSpecificationRegistry,
    saveSpecificationsStore,
    saveSpecificationValues,
    saveSchemaWorkspace,
} from "@/lib/db/utils";
import {
    exportWorkspaceAsObsidianVault,
    exportWorkspaceAsSpreadsheetBundle,
} from "@/lib/export-import";
import {
    DEFAULT_SCHEMA_TEMPLATES,
    createSchemaGroupFromTemplate,
} from "@/lib/schema-registry";
import { upsertReportPendingAnchor } from "@/lib/archive/utils";
import { detectPotentialDuplicatesForDocument, detectPotentialDuplicatesForWorkspace } from "@/lib/duplicates";
import { getOrCreateUserId } from "@/lib/provenance";
import { SYNC_SERVER_URL, synchronizeWorkspace } from "@/lib/sync/client";
import type {
    ArchivalLedgerRecord,
    DocumentNode,
    DocumentSchema,
    DocumentSchemaGroup,
    FieldDefinition,
    MergeProposal,
    MergeResolutionPayload,
    SpecificationDefinition,
    SpecificationStore,
    StoredDocument,
} from "@/lib/types";
import { useWorkspace } from "@/contexts/workspace-context";

const MERGE_QUEUE_PATH = "/merge-queue";
const OBSIDIAN_TUTORIAL_EXPORT_KEY = "obsidian-export-tutorial-dismissed";

const getCurrentPath = () => (typeof window !== "undefined" && window.location.pathname === MERGE_QUEUE_PATH ? MERGE_QUEUE_PATH : "/");

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
};

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

function App() {
    const {
        activeWorkspace,
        workspaces,
        isReady: isWorkspaceReady,
        createWorkspace,
        renameWorkspace,
        setWorkspaceTemplateGroup,
        switchWorkspace,
        deleteWorkspace,
    } = useWorkspace();
    const [currentUserId] = useState(() => getOrCreateUserId());
    const [activePath, setActivePath] = useState<string>(() => getCurrentPath());
    const [schemaGroups, setSchemaGroups] = useState<DocumentSchemaGroup[]>(() =>
        DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaGroupFromTemplate(template))
    );
    const [documents, setDocuments] = useState<DocumentNode[]>([]);
    const [storedDocuments, setStoredDocuments] = useState<Record<string, StoredDocument>>({});
    const [specificationRegistry, setSpecificationRegistry] = useState<SpecificationDefinition[]>([]);
    const [specifications, setSpecifications] = useState<SpecificationStore>({});
    const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
    const [nestedSelectionBySchema, setNestedSelectionBySchema] = useState<Record<string, string>>({});
    const [nestedOpenBySchema, setNestedOpenBySchema] = useState<Record<string, boolean>>({});
    const [activeSchemaId, setActiveSchemaId] = useState<string>();
    const [activeDocumentId, setActiveDocumentId] = useState<string>();
    const [activeLedgerRecord, setActiveLedgerRecord] = useState<ArchivalLedgerRecord | null>(null);
    const [activeWaybackRecord, setActiveWaybackRecord] = useState<ArchivalLedgerRecord | null>(null);
    const [mergeQueue, setMergeQueue] = useState<MergeProposal[]>([]);
    const [isRequestingWayback, setIsRequestingWayback] = useState(false);
    const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
    const [isDbReady, setIsDbReady] = useState(false);
    const [statusMessage, setStatusMessage] = useState("Local workspace ready");
    const [shouldDefaultTutorialExport, setShouldDefaultTutorialExport] = useState<boolean>(() => {
        if (typeof window === "undefined") {
            return true;
        }

        return window.localStorage.getItem(OBSIDIAN_TUTORIAL_EXPORT_KEY) !== "true";
    });
    const activeWorkspaceId = activeWorkspace.id;

    const navigateTo = (path: string) => {
        if (typeof window !== "undefined" && window.location.pathname !== path) {
            window.history.pushState({}, "", path);
        }
        setActivePath(path);
    };

    const refreshMergeQueue = async () => {
        const proposals = await loadPendingProposals(activeWorkspaceId);
        setMergeQueue(proposals.filter((proposal) => proposal.action === "MERGE_DUPLICATE"));
    };

    const refreshDocumentState = async () => {
        const loadedDocuments = await loadCapturedDocuments(activeWorkspaceId);

        setDocuments(
            loadedDocuments.map((record) => ({
                id: record.id,
                schemaId: record.schema_id,
                label: record.title,
                parentId: record.parent_id,
            }))
        );
        setStoredDocuments(Object.fromEntries(loadedDocuments.map((record) => [record.id, record])));

        return loadedDocuments;
    };

    useEffect(() => {
        const handlePopState = () => setActivePath(getCurrentPath());
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    useEffect(() => {
        if (!isWorkspaceReady) {
            return;
        }

        queueMicrotask(() => {
            setIsDbReady(false);
            setActiveDocumentId(undefined);
            setActiveSchemaId(undefined);
            setDrafts({});
        });

        void (async () => {
            try {
                const storedGroups = await loadSchemaGroups(activeWorkspaceId);
                const storedSchemas = await loadActiveSchemas(activeWorkspaceId);
                const loadedDocuments = await loadCapturedDocuments(activeWorkspaceId);
                const storedRegistry = await loadSpecificationRegistry(activeWorkspaceId);
                const storedSpecifications = await loadSpecifications(activeWorkspaceId);
                const defaultGroups = DEFAULT_SCHEMA_TEMPLATES.map((template) => createSchemaGroupFromTemplate(template));

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

                if (storedRegistry.length === 0 && normalizedRegistry.length > 0) {
                    await saveSpecificationRegistry(normalizedRegistry, activeWorkspaceId);
                }

                if (Object.keys(storedSpecifications).length === 0 && Object.keys(normalizedSpecs).length > 0) {
                    await saveSpecificationsStore(normalizedSpecs, activeWorkspaceId);
                }

                setSchemaGroups(hydratedGroups);
                setSpecificationRegistry(normalizedRegistry);
                setSpecifications(normalizedSpecs);
                setDocuments(
                    loadedDocuments.map((record) => ({
                        id: record.id,
                        schemaId: record.schema_id,
                        label: record.title,
                        parentId: record.parent_id,
                    }))
                );
                setStoredDocuments(Object.fromEntries(loadedDocuments.map((record) => [record.id, record])));
                await refreshMergeQueue();
                setIsDbReady(true);
            } catch (error) {
                console.error("Failed preparing database", error);
                setStatusMessage("Database initialization failed; using in-memory scaffolding");
            }
        })();
    }, [activeWorkspaceId, isWorkspaceReady]);

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

    const isArchivableActiveSchema = activeSchema
        ? Boolean(activeSchema.metadata?.archivable)
        : false;

    const activeInitialValues = useMemo(() => {
        if (!activeDocumentId || !activeSchema) return undefined;

        if (drafts[activeDocumentId]) return drafts[activeDocumentId];

        const stored = storedDocuments[activeDocumentId];
        if (!stored) return undefined;

        const markdownFields = activeSchema.fields.filter((field) => field.type.data === "markdown");
        const values: Record<string, unknown> = { ...stored.frontmatter };
        markdownFields.forEach((field) => {
            values[field.name] = stored.body;
        });
        return values;
    }, [activeDocumentId, activeSchema, drafts, storedDocuments]);

    const getInitialValuesForDocument = (documentId: string, schema: DocumentSchema) => {
        if (drafts[documentId]) return drafts[documentId];

        const stored = storedDocuments[documentId];
        if (!stored) return undefined;

        const markdownFields = schema.fields.filter((field) => field.type.data === "markdown");
        const values: Record<string, unknown> = { ...stored.frontmatter };
        markdownFields.forEach((field) => {
            values[field.name] = stored.body;
        });

        return values;
    };

    const getReportActorMentions = (reportDocumentId: string): string[] => {
        const draftValue = drafts[reportDocumentId]?.__actor_mentions;
        if (Array.isArray(draftValue)) return toStringArray(draftValue);

        const storedValue = storedDocuments[reportDocumentId]?.frontmatter?.actor_mentions;
        return toStringArray(storedValue);
    };

    const updateReportActorMentions = (reportDocumentId: string, actorDocumentId: string, checked: boolean) => {
        setDrafts((current) => {
            const currentDraft = current[reportDocumentId] ?? {};
            const existingMentions = getReportActorMentions(reportDocumentId);
            const nextMentions = checked
                ? [...new Set([...existingMentions, actorDocumentId])]
                : existingMentions.filter((id) => id !== actorDocumentId);

            return {
                ...current,
                [reportDocumentId]: {
                    ...currentDraft,
                    __actor_mentions: nextMentions,
                },
            };
        });
    };

    const saveDocumentCapture = async (
        schema: DocumentSchema,
        document: DocumentNode,
        frontmatterInput: Record<string, unknown>,
        body: string
    ) => {
        const frontmatter: Record<string, unknown> = { ...frontmatterInput };
        if (schema.id === "report") {
            const mentions = getReportActorMentions(document.id);
            if (mentions.length > 0) {
                frontmatter.actor_mentions = mentions;
            } else {
                delete frontmatter.actor_mentions;
            }
        }

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
            document.id,
            schema.id,
            documentTitle,
            frontmatter,
            body,
            currentUserId,
            document.parentId,
            activeWorkspaceId
        );

        await upsertReportPendingAnchor(noteId, frontmatter, body);
        const refreshedLedgerRecord = await loadLedgerRecordByNoteId(noteId, activeWorkspaceId);
        const refreshedWaybackRecord = await loadWaybackArchiveRecordByArticleId(noteId, activeWorkspaceId);
        setActiveLedgerRecord(refreshedLedgerRecord);
        setActiveWaybackRecord(refreshedWaybackRecord);

        setDocuments((current) => {
            return current.map((doc) =>
                doc.id === document.id ? { ...doc, label: documentTitle, schemaId: schema.id } : doc
            );
        });
        setStoredDocuments((current) => ({
            ...current,
            [noteId]: {
                id: noteId,
                workspace_id: activeWorkspaceId,
                schema_id: schema.id,
                title: documentTitle,
                frontmatter,
                body,
                parent_id: document.parentId,
                user_id: currentUserId,
                updated_at: Date.now(),
            },
        }));
        setDrafts((current) => {
            const next = { ...current };
            delete next[noteId];
            return next;
        });

        const duplicateResult = await detectPotentialDuplicatesForDocument(noteId, activeWorkspaceId);
        await refreshMergeQueue();

        setStatusMessage(
            duplicateResult.flagged > 0
                ? `Stored ${documentTitle} and queued ${duplicateResult.flagged} duplicate review candidate(s).`
                : `Stored ${documentTitle} in the local OPFS-backed workspace`
        );
    };

    const childSchemasForActiveSchema = useMemo(() => {
        if (!activeSchema) return [];
        return schemas.filter((schema) => schema.parentSchemaId === activeSchema.id);
    }, [activeSchema, schemas]);

    const persistSchemaGroups = async (nextGroups: DocumentSchemaGroup[]) => {
        setSchemaGroups(nextGroups);
        await saveSchemaWorkspace(nextGroups, activeWorkspaceId);
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

    useEffect(() => {
        if (!isDbReady || !activeDocumentId || !isArchivableActiveSchema) {
            queueMicrotask(() => {
                setActiveLedgerRecord(null);
                setActiveWaybackRecord(null);
            });
            return;
        }

        let isCancelled = false;

        const refreshLedger = async () => {
            const record = await loadLedgerRecordByNoteId(activeDocumentId, activeWorkspaceId);
            if (!isCancelled) {
                setActiveLedgerRecord(record);
            }
        };

        const refreshWayback = async () => {
            const record = await loadWaybackArchiveRecordByArticleId(activeDocumentId, activeWorkspaceId);
            if (!isCancelled) {
                setActiveWaybackRecord(record);
            }
        };

        void refreshLedger();
        void refreshWayback();
        const intervalId = window.setInterval(() => {
            void refreshLedger();
            void refreshWayback();
        }, 15000);

        return () => {
            isCancelled = true;
            window.clearInterval(intervalId);
        };
    }, [activeDocumentId, activeWorkspaceId, isArchivableActiveSchema, isDbReady]);

    const handleCaptureSubmit = async (frontmatter: Record<string, unknown>, body: string) => {
        if (!activeSchema || !activeDocument) return;

        await saveDocumentCapture(activeSchema, activeDocument, frontmatter, body);
    };

    const handleRequestWaybackSnapshot = async () => {
        if (!activeDocumentId || !activeInitialValues) return;

        const sourceUrl = typeof activeInitialValues.url === "string" ? activeInitialValues.url.trim() : "";
        if (!sourceUrl) {
            setStatusMessage("Add a News Report URL before requesting a Wayback snapshot.");
            return;
        }

        setIsRequestingWayback(true);

        try {
            await saveWaybackArchiveRequest(activeDocumentId, sourceUrl, activeWorkspaceId);
            setActiveWaybackRecord(await loadWaybackArchiveRecordByArticleId(activeDocumentId, activeWorkspaceId));

            if (!navigator.onLine) {
                setStatusMessage("Queued the Wayback snapshot locally; it will sync when the device is online.");
                return;
            }

            const response = await fetch(`${SYNC_SERVER_URL}/api/archive/wayback/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspace_id: activeWorkspaceId,
                    article_id: activeDocumentId,
                    url: sourceUrl,
                    process_now: true,
                }),
            });

            let payload: { status?: string; uri_or_path?: string; last_verified_at?: number } = {};
            try {
                payload = (await response.json()) as typeof payload;
            } catch {
                payload = {};
            }

            const nextStatus = response.ok && payload.status === "SYNCED" ? "SYNCED" : response.ok ? "PENDING_SYNC" : "FAILED";
            await saveWaybackArchiveRequest(
                activeDocumentId,
                sourceUrl,
                activeWorkspaceId,
                nextStatus,
                payload.uri_or_path ?? undefined,
                payload.last_verified_at ?? null
            );

            setActiveWaybackRecord(await loadWaybackArchiveRecordByArticleId(activeDocumentId, activeWorkspaceId));
            setStatusMessage(
                nextStatus === "SYNCED"
                    ? "Wayback snapshot archived successfully."
                    : nextStatus === "FAILED"
                        ? "Wayback snapshot failed; the local queue remains saved for retry."
                        : "Wayback snapshot request queued."
            );

            if (nextStatus === "SYNCED") {
                await synchronizeWorkspace(activeWorkspaceId);
            }
        } catch (error) {
            console.error("Wayback request failed", error);
            setStatusMessage("Unable to request the Wayback snapshot right now. The local queue remains saved.");
        } finally {
            setIsRequestingWayback(false);
        }
    };

    const triggerObsidianVaultExport = async (options?: { includeTutorial: boolean }) => {
        const { includeTutorial = shouldDefaultTutorialExport } = options ?? {};
        await exportWorkspaceAsObsidianVault(
            Object.values(storedDocuments),
            `obsidian_vault_${Date.now()}.zip`,
            {
                includeTutorial,
                workspaceId: activeWorkspaceId,
                workspaceName: activeWorkspace.name,
                schemaGroups: groupsWithSpecifications,
                specificationRegistry,
                specifications,
            }
        );

        if (typeof window !== "undefined") {
            window.localStorage.setItem(OBSIDIAN_TUTORIAL_EXPORT_KEY, "true");
        }

        setShouldDefaultTutorialExport(false);
    };

    const triggerCsvExport = async () => {
        await exportWorkspaceAsSpreadsheetBundle(Object.values(storedDocuments), "csv");
    };

    const triggerXlsxExport = async () => {
        await exportWorkspaceAsSpreadsheetBundle(Object.values(storedDocuments), "xlsx");
    };

    const handleImportCompleted = async (summary: string) => {
        try {
            await refreshDocumentState();
            setStatusMessage(summary);
        } catch (error) {
            console.error("Failed to refresh workspace after import", error);
            setStatusMessage(summary);
        }
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
        await saveSpecificationRegistry(nextRegistry, activeWorkspaceId);
        await saveSpecificationsStore(nextValues, activeWorkspaceId);
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
        await saveSpecificationValues(specificationId, nextValues, activeWorkspaceId);
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

    const createDocumentNode = (schema: DocumentSchema, parentId?: string, activate = true) => {
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
        if (activate) {
            setActiveDocumentId(node.id);
            setActiveSchemaId(schema.id);
            setNestedSelectionBySchema({});
            setNestedOpenBySchema({});
        }

        return node;
    };

    const handleCreateDocument = (schema: DocumentSchema, parentId?: string) => {
        createDocumentNode(schema, parentId, true);
    };

    const handleSelectDocument = (documentId: string, schemaId: string) => {
        setActiveDocumentId(documentId);
        setActiveSchemaId(schemaId);
        setNestedSelectionBySchema({});
        setNestedOpenBySchema({});
    };

    const handleSwitchWorkspace = async (workspaceId: string) => {
        await switchWorkspace(workspaceId);
        const nextWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
        setStatusMessage(`Switched to workspace ${nextWorkspace?.name ?? workspaceId}.`);
    };

    const handleCreateWorkspace = async (name: string, description?: string) => {
        const created = await createWorkspace(name, description);
        setStatusMessage(`Created workspace ${created.name}.`);
    };

    const handleRenameWorkspace = async (workspaceId: string, name: string, description?: string) => {
        await renameWorkspace(workspaceId, name, description);
        setStatusMessage(`Workspace renamed to ${name}.`);
    };

    const handleDeleteWorkspace = async (workspaceId: string) => {
        await deleteWorkspace(workspaceId);
        setStatusMessage("Workspace deleted.");
    };

    const sidebarFooterContent = (
        <SettingsModal
            key={activeWorkspaceId}
            groups={groupsWithSpecifications}
            specificationRegistry={specificationRegistry}
            specifications={specifications}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSwitchWorkspace={handleSwitchWorkspace}
            onCreateWorkspace={handleCreateWorkspace}
            onRenameWorkspace={handleRenameWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onSetWorkspaceTemplateGroup={setWorkspaceTemplateGroup}
            onSaveSchema={handleSaveSchema}
            onSaveGroup={handleSaveGroup}
            onDeleteGroup={handleDeleteGroup}
            onDeleteSchema={handleDeleteSchema}
            onSaveSpecifications={handleSaveSpecifications}
            onExportToObsidian={triggerObsidianVaultExport}
            onExportToCsv={triggerCsvExport}
            onExportToXlsx={triggerXlsxExport}
            onImportCompleted={handleImportCompleted}
            workspaceId={activeWorkspaceId}
            defaultIncludeTutorial={shouldDefaultTutorialExport}
            trigger={
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                    <Settings className="h-4 w-4" />
                    <span className="sr-only">Open settings</span>
                </Button>
            }
        />
    );

    const handleApproveMerge = async (proposalId: string, resolution: MergeResolutionPayload) => {
        await approveMergeProposal(proposalId, currentUserId, activeWorkspaceId, resolution);
        await refreshDocumentState();
        await refreshMergeQueue();
        setStatusMessage("Merge proposal approved and duplicate reconciled.");
    };

    const handleRejectMerge = async (proposalId: string) => {
        const comment = window.prompt("Reject reason", "Insufficient confidence for merge")?.trim();
        if (!comment) return;

        await rejectMergeProposal(proposalId, currentUserId, comment, activeWorkspaceId);
        await refreshMergeQueue();
        setStatusMessage("Merge proposal rejected.");
    };

    const handleScanWorkspaceDuplicates = async () => {
        setIsScanningDuplicates(true);
        try {
            const result = await detectPotentialDuplicatesForWorkspace(activeWorkspaceId);
            await refreshMergeQueue();
            setStatusMessage(
                result.flagged > 0
                    ? `Queued ${result.flagged} duplicate candidate(s) from ${result.inspected} comparisons.`
                    : `Scanned ${result.inspected} document comparison(s); no new duplicate candidates were found.`
            );
            navigateTo(MERGE_QUEUE_PATH);
        } finally {
            setIsScanningDuplicates(false);
        }
    };

    return (
        <Layout
            footerContent={sidebarFooterContent}
            schemas={schemas}
            documents={documents}
            workspaces={workspaces}
            activePath={activePath}
            mergeQueueCount={mergeQueue.length}
            activeWorkspaceId={activeWorkspaceId}
            activeSchemaId={activeSchemaId}
            activeDocumentId={activeDocumentId}
            onNavigate={navigateTo}
            onSwitchWorkspace={handleSwitchWorkspace}
            onSelectSchema={(schemaId) => setActiveSchemaId(schemaId)}
            onSelectDocument={(documentId, schemaId) => {
                navigateTo("/");
                handleSelectDocument(documentId, schemaId);
            }}
            onCreateDocument={handleCreateDocument}
        >
            <div className="relative min-h-screen bg-background text-foreground flex p-8">
                <main className="mx-auto w-full max-w-5xl space-y-4">
                    {activePath === MERGE_QUEUE_PATH ? (
                        <MergeQueueView
                            proposals={mergeQueue}
                            documents={storedDocuments}
                            onApprove={handleApproveMerge}
                            onReject={handleRejectMerge}
                            onScanWorkspace={handleScanWorkspaceDuplicates}
                            isScanning={isScanningDuplicates}
                        />
                    ) : activeSchema && activeDocumentId ? (
                        <>
                            <Capture
                                fields={activeSchema.fields}
                                initialValues={activeInitialValues}
                                specifications={specifications}
                                onValuesChange={(values) => {
                                    if (!activeDocumentId) return;
                                    setDrafts((current) => ({
                                        ...current,
                                        [activeDocumentId]: {
                                            ...(current[activeDocumentId] ?? {}),
                                            ...values,
                                        },
                                    }));
                                }}
                                onAddSpecification={handleAddSpecification}
                                onSubmit={handleCaptureSubmit}
                            />

                            {activeSchema.id === "event" && activeDocument ? (
                                <section className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-medium">Linked Document Capture</div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Capture child records inside the event, then expand any item into full capture when needed.
                                            </p>
                                        </div>
                                    </div>

                                    {childSchemasForActiveSchema.map((childSchema) => {
                                        const childDocuments = documents.filter(
                                            (document) => document.parentId === activeDocument.id && document.schemaId === childSchema.id
                                        );
                                        const selectedChildDocumentId =
                                            nestedSelectionBySchema[childSchema.id] ?? childDocuments[0]?.id;
                                        const selectedChildDocument = childDocuments.find((document) => document.id === selectedChildDocumentId);
                                        const isOpen = nestedOpenBySchema[childSchema.id] ?? true;

                                        return (
                                            <div key={childSchema.id} className="rounded-xl border border-border/70 bg-background/70 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <div className="text-sm font-medium capitalize">{childSchema.name}</div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {childDocuments.length} linked document(s)
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                                                            onClick={() => {
                                                                const created = createDocumentNode(childSchema, activeDocument.id, false);
                                                                setNestedSelectionBySchema((current) => ({ ...current, [childSchema.id]: created.id }));
                                                                setNestedOpenBySchema((current) => ({ ...current, [childSchema.id]: true }));
                                                            }}
                                                        >
                                                            Add {childSchema.name}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                                                            onClick={() => setNestedOpenBySchema((current) => ({
                                                                ...current,
                                                                [childSchema.id]: !(current[childSchema.id] ?? true),
                                                            }))}
                                                        >
                                                            {isOpen ? "Collapse" : "Expand"}
                                                        </button>
                                                    </div>
                                                </div>

                                                {childDocuments.length > 0 ? (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {childDocuments.map((document) => (
                                                            <button
                                                                key={document.id}
                                                                type="button"
                                                                className={`rounded-full border px-2 py-1 text-xs ${selectedChildDocumentId === document.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                                                                onClick={() => setNestedSelectionBySchema((current) => ({ ...current, [childSchema.id]: document.id }))}
                                                            >
                                                                {document.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-xs text-muted-foreground">No linked documents yet.</p>
                                                )}

                                                {isOpen && selectedChildDocument ? (
                                                    <div className="mt-3 space-y-3 rounded-lg border border-border/60 p-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                Inline capture for {selectedChildDocument.label}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                                                                onClick={() => {
                                                                    setActiveDocumentId(selectedChildDocument.id);
                                                                    setActiveSchemaId(childSchema.id);
                                                                }}
                                                            >
                                                                Open full capture
                                                            </button>
                                                        </div>

                                                        {childSchema.id === "report" ? (
                                                            <section className="rounded-lg border border-border/70 bg-card/50 p-3">
                                                                <div className="text-xs font-medium">Mentioned Participants</div>
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    Persist actor mentions linked to this report.
                                                                </p>
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    {documents
                                                                        .filter((document) => document.parentId === activeDocument.id && document.schemaId === "actor")
                                                                        .map((actorDocument) => {
                                                                            const selectedMentions = getReportActorMentions(selectedChildDocument.id);
                                                                            const checked = selectedMentions.includes(actorDocument.id);
                                                                            const actorLabel =
                                                                                (storedDocuments[actorDocument.id]?.frontmatter?.name as string) ||
                                                                                storedDocuments[actorDocument.id]?.title ||
                                                                                actorDocument.label;

                                                                            return (
                                                                                <button
                                                                                    key={`mention-${selectedChildDocument.id}-${actorDocument.id}`}
                                                                                    type="button"
                                                                                    className={`rounded-full border px-2 py-1 text-xs ${checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                                                                                    onClick={() => updateReportActorMentions(selectedChildDocument.id, actorDocument.id, !checked)}
                                                                                >
                                                                                    {actorLabel}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                </div>
                                                            </section>
                                                        ) : null}

                                                        <Capture
                                                            fields={childSchema.fields}
                                                            initialValues={getInitialValuesForDocument(selectedChildDocument.id, childSchema)}
                                                            specifications={specifications}
                                                            onValuesChange={(values) => {
                                                                setDrafts((current) => ({
                                                                    ...current,
                                                                    [selectedChildDocument.id]: {
                                                                        ...(current[selectedChildDocument.id] ?? {}),
                                                                        ...values,
                                                                    },
                                                                }));
                                                            }}
                                                            onAddSpecification={handleAddSpecification}
                                                            onSubmit={(frontmatter, body) => void saveDocumentCapture(childSchema, selectedChildDocument, frontmatter, body)}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </section>
                            ) : null}

                            {activeSchema.id === "report" && activeDocument?.parentId ? (
                                <section className="rounded-xl border border-border/70 bg-card/40 p-4">
                                    <div className="text-sm font-medium">Mentioned Participants</div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Persist actor mentions linked to this report.
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {documents
                                            .filter((document) => document.parentId === activeDocument.parentId && document.schemaId === "actor")
                                            .map((actorDocument) => {
                                                const selectedMentions = getReportActorMentions(activeDocument.id);
                                                const checked = selectedMentions.includes(actorDocument.id);
                                                const actorLabel =
                                                    (storedDocuments[actorDocument.id]?.frontmatter?.name as string) ||
                                                    storedDocuments[actorDocument.id]?.title ||
                                                    actorDocument.label;

                                                return (
                                                    <button
                                                        key={`mention-${activeDocument.id}-${actorDocument.id}`}
                                                        type="button"
                                                        className={`rounded-full border px-2 py-1 text-xs ${checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                                                        onClick={() => updateReportActorMentions(activeDocument.id, actorDocument.id, !checked)}
                                                    >
                                                        {actorLabel}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </section>
                            ) : null}

                            <section className="rounded-xl border border-border/70 bg-card/40 p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium">Record Utilities</div>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Duplicate review and archive tooling are grouped here to keep capture flow focused.
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-3">
                                    <section className="rounded-lg border border-border/70 bg-background/70 p-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-medium">Duplicate Monitoring</div>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {mergeQueue.length > 0
                                                        ? `${mergeQueue.length} duplicate review item(s) currently need attention.`
                                                        : "No duplicate candidates are currently queued."}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
                                                    onClick={() => void handleScanWorkspaceDuplicates()}
                                                    disabled={isScanningDuplicates}
                                                >
                                                    {isScanningDuplicates ? "Scanning..." : "Scan for Duplicates"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
                                                    onClick={() => navigateTo(MERGE_QUEUE_PATH)}
                                                >
                                                    Open Merge Queue
                                                </button>
                                            </div>
                                        </div>
                                    </section>

                                    {isArchivableActiveSchema ? (
                                        <>
                                            <section className="rounded-lg border border-border/70 bg-background/70 p-3">
                                                <div className="mb-2 text-sm font-medium">Public Ledger Proof-of-Existence</div>
                                                <LedgerBadge
                                                    blockchainTxHash={activeLedgerRecord?.blockchain_tx_hash}
                                                    otsProofPayload={activeLedgerRecord?.ots_proof_payload}
                                                    proofFileName={`${activeDocumentId}.ots`}
                                                />
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {activeLedgerRecord?.anchored_at
                                                        ? `Anchored at ${new Date(activeLedgerRecord.anchored_at).toLocaleString()}`
                                                        : "Awaiting scheduled OpenTimestamps anchoring."}
                                                </p>
                                            </section>

                                            <section className="rounded-lg border border-border/70 bg-background/70 p-3">
                                                <div className="mb-2 text-sm font-medium">Web Archive Snapshot</div>
                                                <WaybackArchiveStatus
                                                    sourceUrl={typeof activeInitialValues?.url === "string" ? activeInitialValues.url : undefined}
                                                    record={activeWaybackRecord}
                                                    onRequestSnapshot={handleRequestWaybackSnapshot}
                                                    isRequesting={isRequestingWayback}
                                                />
                                            </section>
                                        </>
                                    ) : null}
                                </div>
                            </section>
                        </>
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
