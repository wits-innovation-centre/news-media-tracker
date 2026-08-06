import { Fragment, useMemo, useState, type MouseEvent, type ReactNode } from "react";
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

function Sidebar({
  footerContent,
  schemas,
  documents,
  workspaces,
  activePath,
  mergeQueueCount,
  activeWorkspaceId,
  activeSchemaId,
  activeDocumentId,
  onNavigate,
  onSwitchWorkspace,
  onSelectSchema,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
}: SidebarProps) {
  const { state } = useSidebar();
  const isIconCollapsed = state === "collapsed";
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [menuOpenAnchor, setMenuOpenAnchor] = useState<string | null>(null);

  const toggleCollapse = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const schemaById = useMemo(() => {
    return new Map(schemas.map((schema) => [schema.id, schema]));
  }, [schemas]);

  const rootSchemas = useMemo(() => schemas.filter((s) => !s.parentSchemaId), [schemas]);

  const getChildSchemaOptions = (parentSchemaId: string) => {
    return schemas.filter((schema) => schema.parentSchemaId === parentSchemaId);
  };

  const toggleAddMenu = (anchorId: string) => {
    setMenuOpenAnchor((prev) => (prev === anchorId ? null : anchorId));
  };

  const getAvailableSchemasForAnchor = (parentDocument?: DocumentNode) => {
    if (!parentDocument) {
      return rootSchemas;
    }

    return getChildSchemaOptions(parentDocument.schemaId);
  };

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

  const renderAddMenu = (anchorId: string, parentDocument?: DocumentNode) => {
    const options = getAvailableSchemasForAnchor(parentDocument);
    if (options.length === 0) return null;

    const isOpen = menuOpenAnchor === anchorId;

    return (
      <div className="group relative my-1">
        {isOpen ? (
          <div className="absolute left-0 z-20 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg">
            {options.map((schema) => (
              <button
                type="button"
                key={`${anchorId}-${schema.id}`}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-popover-foreground hover:bg-accent"
                onClick={() => {
                  onCreateDocument(schema, parentDocument?.id)
                  setMenuOpenAnchor(null)
                }}
              >
                <span className="capitalize">{schema.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {parentDocument ? "child" : "root"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => toggleAddMenu(anchorId)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:border-primary hover:text-foreground group-hover:opacity-100"
          title={parentDocument ? `Add document under ${parentDocument.label}` : "Add top-level document"}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
    );
  };

  const renderDocumentNode = (document: DocumentNode, depth = 0) => {
    const schema = schemaById.get(document.schemaId);
    const SchemaIcon = resolveIcon(schema?.icon);
    const children = getChildDocuments(document.id);
    const childSchemaOptions = getChildSchemaOptions(document.schemaId);
    const canExpand = children.length > 0;
    const isCollapsed = !!collapsedNodes[document.id];
    const isActive = activeDocumentId === document.id || activeSchemaId === document.schemaId;

    return (
      <Fragment key={document.id}>
        <div className="group" style={{ marginLeft: `${depth * 14}px` }}>
          <div
            onClick={() => {
              onNavigate("/");
              onSelectDocument(document.id, document.schemaId);
              onSelectSchema(document.schemaId);
            }}
            className={`relative flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-all ${isActive
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
          {renderAddMenu(`after-${document.id}`, document)}
        </div>

        {!isCollapsed && children.map((child) => renderDocumentNode(child, depth + 1))}

        {!isCollapsed && childSchemaOptions.length > 0 && children.length === 0 ? (
          <div style={{ marginLeft: `${(depth + 1) * 14}px` }} className="text-[11px] text-muted-foreground/80">
            No child documents yet.
          </div>
        ) : null}
      </Fragment>
    );
  };

  return (
    <BaseSidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3 border-b border-border space-y-3">
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
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted/50 border border-input rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground placeholder:text-muted-foreground"
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

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <div className="px-1 pb-3">
            <div className={`gap-1 ${isIconCollapsed ? "grid grid-cols-1" : "grid grid-cols-2 rounded-full border border-border bg-muted/30 p-1"}`}>
              <button
                type="button"
                className={`flex w-full items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs transition-all ${activePath === "/" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"}`}
                onClick={() => onNavigate("/")}
                title="Document Tree"
              >
                {isIconCollapsed ? <FolderTree className="h-4 w-4" /> : <span>Document Tree</span>}
              </button>
              <button
                type="button"
                className={`flex w-full items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs transition-all ${activePath === "/merge-queue" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"}`}
                onClick={() => onNavigate("/merge-queue")}
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

        <SidebarGroup>
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
                        onClick={() => {
                          onNavigate("/");
                          onSelectDocument(document.id, document.schemaId);
                          onSelectSchema(document.schemaId);
                        }}
                        title={document.label}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold uppercase transition ${isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent"}`}
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
              {renderAddMenu("tree-start")}
              {rootDocuments.length === 0 ? (
                <p className="px-2 py-4 text-xs text-muted-foreground">No matching documents.</p>
              ) : (
                <div className="space-y-1 px-1">{rootDocuments.map((doc) => renderDocumentNode(doc))}</div>
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
                  <span data-slot="select-value" className="flex flex-1 text-left truncate text-xs text-foreground">
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

      <SidebarRail />
    </BaseSidebar>
  );
}

export { Sidebar };