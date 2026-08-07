import { Fragment, useMemo, useState, useRef, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FolderTree, GitMerge, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sidebar as BaseSidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { resolveIcon } from "@/lib/icon-registry";
import type { DocumentNode, DocumentSchema, WorkspaceRecord } from "@/lib/types";

interface SidebarProps {
  footerContent?: ReactNode;
  schemas: DocumentSchema[];
  documents: DocumentNode[];
  workspaces: WorkspaceRecord[];
  activePath: string;
  mergeQueueCount: number;
  activeWorkspaceId: string;
  activeSchemaId?: string;
  activeDocumentId?: string;
  onNavigate: (path: string) => void;
  onSwitchWorkspace: (workspaceId: string) => void | Promise<void>;
  onSelectSchema: (schemaId: string) => void;
  onSelectDocument: (documentId: string, schemaId: string) => void;
  onCreateDocument: (schema: DocumentSchema, parentId?: string) => void;
  onDeleteDocument: (documentId: string) => void;
}

interface InsertSlot {
  key: string;
  schema: DocumentSchema;
  parentId?: string;
  depth: number;
}

function Sidebar({
  footerContent,
  schemas,
  documents,
  workspaces,
  activePath,
  mergeQueueCount,
  activeWorkspaceId,
  activeDocumentId,
  onNavigate,
  onSwitchWorkspace,
  onSelectSchema,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
}: SidebarProps) {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const isIconCollapsed = state === "collapsed";
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // Resizable sidebar width handling
  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const isResizingRef = useRef(false);

  const handleStartResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.min(Math.max(moveEvent.clientX, 180), 480);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleDocumentClick = (docId: string, schemaId: string) => {
    onNavigate("/");
    onSelectDocument(docId, schemaId);
    onSelectSchema(schemaId);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const toggleCollapse = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const schemaById = useMemo(() => {
    return new Map(schemas.map((schema) => [schema.id, schema]));
  }, [schemas]);

  const rootSchemas = useMemo(() => schemas.filter((s) => !s.parentSchemaId), [schemas]);

  const documentsById = useMemo(() => {
    return new Map(documents.map((doc) => [doc.id, doc]));
  }, [documents]);

  const visibleDocumentIds = useMemo(() => {
    if (!searchQuery.trim()) {
      return new Set(documents.map((doc) => doc.id));
    }

    const query = searchQuery.toLowerCase();
    const visibleIds = new Set<string>();

    documents.forEach((doc) => {
      const schemaName = schemaById.get(doc.schemaId)?.name ?? doc.schemaId;
      const matches =
        doc.label.toLowerCase().includes(query) ||
        schemaName.toLowerCase().includes(query);

      if (!matches) return;

      visibleIds.add(doc.id);
      let cursor: DocumentNode | undefined = doc;
      while (cursor?.parentId) {
        visibleIds.add(cursor.parentId);
        cursor = documentsById.get(cursor.parentId);
      }
    });

    return visibleIds;
  }, [documents, documentsById, schemaById, searchQuery]);

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => visibleDocumentIds.has(doc.id));
  }, [documents, visibleDocumentIds]);

  const getChildDocuments = (parentId: string) => {
    return visibleDocuments.filter((doc) => doc.parentId === parentId);
  };

  const rootDocuments = useMemo(() => {
    return visibleDocuments.filter((doc) => !doc.parentId);
  }, [visibleDocuments]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  }, [activeWorkspaceId, workspaces]);

  const getDocDepth = (docId: string): number => {
    let depth = 0;
    let curr = documentsById.get(docId);
    while (curr?.parentId) {
      depth++;
      curr = documentsById.get(curr.parentId);
    }
    return depth;
  };

  const getInsertSlotsForNode = (doc: DocumentNode, docDepth: number): InsertSlot[] => {
    const slots: InsertSlot[] = [];
    const seenKeys = new Set<string>();

    // 1. Child Slot (Level docDepth + 1)
    const childSchemas = schemas.filter((s) => s.parentSchemaId === doc.schemaId);
    for (const schema of childSchemas) {
      const key = `child:${schema.id}:${doc.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        slots.push({
          key,
          schema,
          parentId: doc.id,
          depth: docDepth + 1,
        });
      }
    }

    // 2. Sibling Slot (Level docDepth)
    if (doc.parentId) {
      const parentDoc = documentsById.get(doc.parentId);
      if (parentDoc) {
        const siblingSchemas = schemas.filter((s) => s.parentSchemaId === parentDoc.schemaId);
        for (const schema of siblingSchemas) {
          const key = `sibling:${schema.id}:${doc.parentId}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            slots.push({
              key,
              schema,
              parentId: doc.parentId,
              depth: docDepth,
            });
          }
        }
      }
    } else {
      for (const schema of rootSchemas) {
        const key = `root:${schema.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          slots.push({
            key,
            schema,
            parentId: undefined,
            depth: 0,
          });
        }
      }
    }

    // 3. Ancestor / Root Slots (Level < docDepth)
    let currParentId = doc.parentId;
    while (currParentId) {
      const currDoc = documentsById.get(currParentId);
      if (!currDoc) break;

      const ancestorParentId = currDoc.parentId;
      const ancestorDepth = ancestorParentId ? getDocDepth(ancestorParentId) + 1 : 0;

      if (ancestorParentId) {
        const ancestorParentDoc = documentsById.get(ancestorParentId);
        if (ancestorParentDoc) {
          const ancestorSchemas = schemas.filter((s) => s.parentSchemaId === ancestorParentDoc.schemaId);
          for (const schema of ancestorSchemas) {
            const key = `ancestor:${schema.id}:${ancestorParentId}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              slots.push({
                key,
                schema,
                parentId: ancestorParentId,
                depth: ancestorDepth,
              });
            }
          }
        }
      } else {
        for (const schema of rootSchemas) {
          const key = `root-ancestor:${schema.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            slots.push({
              key,
              schema,
              parentId: undefined,
              depth: 0,
            });
          }
        }
      }

      currParentId = currDoc.parentId;
    }

    return slots.sort((a, b) => b.depth - a.depth);
  };

  const renderInsertZone = (doc: DocumentNode, docDepth: number) => {
    const slots = getInsertSlotsForNode(doc, docDepth);
    if (slots.length === 0) return null;

    return (
      <div className="group/insert relative my-0.5 min-h-2 py-0.5 transition-all">
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 border-t border-dashed border-primary/20 opacity-0 transition-opacity group-hover/insert:opacity-100 pointer-events-none" />
        <div className="relative flex flex-col gap-1 opacity-0 transition-all duration-150 group-hover/insert:opacity-100">
          {slots.map((slot) => {
            const SchemaIcon = resolveIcon(slot.schema.icon);
            return (
              <button
                key={slot.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateDocument(slot.schema, slot.parentId);
                  if (isMobile) setOpenMobile(false);
                }}
                style={{ marginLeft: `${slot.depth * 14}px` }}
                className="group/slot flex items-center gap-1.5 rounded-md border border-dashed border-primary/60 bg-primary/5 px-2 py-1 text-xs text-primary transition-all hover:border-primary hover:bg-primary/15 hover:shadow-xs focus-visible:outline-none"
                title={`Create new ${slot.schema.name}`}
              >
                <Plus className="h-3 w-3 shrink-0 opacity-70 group-hover/slot:opacity-100" />
                <SchemaIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="truncate text-[11px] font-medium">
                  New {slot.schema.name}...
                </span>
                {slot.depth === 0 && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-primary/60">
                    Root
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDocumentNode = (document: DocumentNode, depth = 0) => {
    const schema = schemaById.get(document.schemaId);
    const SchemaIcon = resolveIcon(schema?.icon);
    const children = getChildDocuments(document.id);
    const canExpand = children.length > 0;
    const isCollapsed = !!collapsedNodes[document.id];
    const isActive = activeDocumentId === document.id;

    const showChildren = canExpand && !isCollapsed;

    return (
      <Fragment key={document.id}>
        <div className="group my-1" style={{ marginLeft: `${depth * 14}px` }}>
          <div
            onClick={() => handleDocumentClick(document.id, document.schemaId)}
            className={`relative flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-all ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {canExpand ? (
                <button
                  type="button"
                  onClick={(e) => toggleCollapse(document.id, e)}
                  className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              ) : (
                <div className="w-4" />
              )}
              <SchemaIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{document.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${document.label}"? This cannot be undone.`)) {
                    onDeleteDocument(document.id);
                  }
                }}
                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                title="Delete document"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {renderInsertZone(document, depth)}
        {showChildren && children.map((child) => renderDocumentNode(child, depth + 1))}
      </Fragment>
    );
  };

  return (
    <BaseSidebar
      collapsible="icon"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <SidebarHeader className="border-b border-border px-4 py-3 space-y-3">
        <div className={`flex items-center gap-2 ${isIconCollapsed ? "justify-center" : "justify-between"}`}>
          {!isIconCollapsed ? <p className="text-sm font-semibold text-foreground">Vault Explorer</p> : null}
          <SidebarTrigger className="h-7 w-7" title={isIconCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {isIconCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            <span className="sr-only">{isIconCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
          </SidebarTrigger>
        </div>

        {!isIconCollapsed ? (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-muted/50 py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent className="pt-1">
        <SidebarGroup className="py-0">
          <div className="px-1 pb-1">
            <div className={`gap-1 ${isIconCollapsed ? "grid grid-cols-1" : "grid grid-cols-2 rounded-full border border-border bg-muted/30 p-1"}`}>
              <button
                type="button"
                className={`flex w-full items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs transition-all ${
                  activePath === "/" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                onClick={() => {
                  onNavigate("/");
                  if (isMobile) setOpenMobile(false);
                }}
                title="Document Tree"
              >
                {isIconCollapsed ? <FolderTree className="h-4 w-4" /> : <span>Document Tree</span>}
              </button>
              <button
                type="button"
                className={`flex w-full items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs transition-all ${
                  activePath === "/merge-queue" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                onClick={() => {
                  onNavigate("/merge-queue");
                  if (isMobile) setOpenMobile(false);
                }}
                title="Merge Queue"
              >
                {isIconCollapsed ? (
                  <span className="relative inline-flex h-4 w-4 items-center justify-center">
                    <GitMerge className="h-4 w-4" />
                    {mergeQueueCount > 0 ? (
                      <span className="absolute -right-2 -top-2 rounded-full border border-background bg-primary px-1 text-[9px] leading-none text-primary-foreground">
                        {mergeQueueCount}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <>
                    <span>Merge Queue</span>
                    <span className="rounded border border-current/30 px-1 py-0.5 text-[10px]">{mergeQueueCount}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          {isIconCollapsed ? (
            <div className="flex flex-col items-center gap-1 px-1">
              {rootDocuments.length === 0 ? (
                <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">No docs</p>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  {rootDocuments.slice(0, 8).map((document) => {
                    const isActive = activeDocumentId === document.id;
                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => handleDocumentClick(document.id, document.schemaId)}
                        title={document.label}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold uppercase transition ${
                          isActive
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent"
                        }`}
                      >
                        {document.label.slice(0, 1) || "?"}
                      </button>
                    );
                  })}
                  {rootDocuments.length > 8 ? (
                    <span className="text-[10px] text-muted-foreground">+{rootDocuments.length - 8}</span>
                  ) : null}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const defaultSchema = rootSchemas[0];
                  if (!defaultSchema) return;
                  onCreateDocument(defaultSchema);
                  onNavigate("/");
                  if (isMobile) setOpenMobile(false);
                }}
                disabled={rootSchemas.length === 0}
                title={rootSchemas[0] ? `Add ${rootSchemas[0].name}` : "No root schema available"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              {rootDocuments.length === 0 ? (
                <div className="space-y-1 p-2">
                  <p className="text-xs text-muted-foreground">No matching documents.</p>
                  {rootSchemas.map((schema) => {
                    const SchemaIcon = resolveIcon(schema.icon);
                    return (
                      <button
                        key={schema.id}
                        type="button"
                        onClick={() => {
                          onCreateDocument(schema);
                          if (isMobile) setOpenMobile(false);
                        }}
                        className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-primary/60 bg-primary/5 px-2 py-1.5 text-xs text-primary transition hover:bg-primary/15"
                      >
                        <Plus className="h-3 w-3 shrink-0" />
                        <SchemaIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">New {schema.name}...</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-1">
                  {rootDocuments.map((doc) => renderDocumentNode(doc))}
                </div>
              )}
            </>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-border px-3 py-3 space-y-3">
        {isIconCollapsed ? (
          <div className="flex items-center justify-center rounded-md border border-border/70 bg-background/70 p-1.5">
            {footerContent}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-2">
            <Select
              value={activeWorkspaceId}
              onValueChange={(nextWorkspaceId) => {
                if (!nextWorkspaceId) return;
                void onSwitchWorkspace(nextWorkspaceId);
              }}
            >
              <SelectTrigger className="h-auto min-h-0 flex-1 border-0 bg-transparent px-0 py-0 text-left shadow-none hover:bg-transparent focus-visible:ring-0">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
                  <span data-slot="select-value" className="flex flex-1 truncate text-left text-xs text-foreground">
                    {activeWorkspace?.name ?? "My Workspace"}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {footerContent}
          </div>
        )}
      </SidebarFooter>

      {/* Interactive Resizing Handle */}
      <SidebarRail
        onMouseDown={handleStartResizing}
        className="hover:bg-primary/30 transition-colors cursor-col-resize active:bg-primary"
      />
    </BaseSidebar>
  );
}

export { Sidebar };