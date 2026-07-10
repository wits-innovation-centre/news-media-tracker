import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FilePlus2, Plus, Search, X } from "lucide-react";

import { Sidebar as BaseSidebar, SidebarContent, SidebarGroup, SidebarHeader } from "@/components/ui/sidebar";
import type { DocumentNode, DocumentSchema } from "@/lib/types";

interface SidebarProps {
  schemas: DocumentSchema[];
  documents: DocumentNode[];
  activeSchemaId?: string;
  activeDocumentId?: string;
  onSelectSchema: (schemaId: string) => void;
  onSelectDocument: (documentId: string, schemaId: string) => void;
  onCreateDocument: (schema: DocumentSchema, parentId?: string) => void;
}

function Sidebar({ schemas, documents, activeSchemaId, activeDocumentId, onSelectSchema, onSelectDocument, onCreateDocument }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [menuOpenAnchor, setMenuOpenAnchor] = useState<string | null>(null);

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
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

  const renderAddMenu = (anchorId: string, parentDocument?: DocumentNode) => {
    const options = getAvailableSchemasForAnchor(parentDocument);
    if (options.length === 0) return null;

    const isOpen = menuOpenAnchor === anchorId;

    return (
      <div className="group relative my-1">
        <button
          type="button"
          onClick={() => toggleAddMenu(anchorId)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:border-primary hover:text-foreground group-hover:opacity-100"
          title={parentDocument ? `Add document under ${parentDocument.label}` : "Add top-level document"}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>

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
      </div>
    );
  };

  const renderDocumentNode = (document: DocumentNode, depth = 0) => {
    const schema = schemaById.get(document.schemaId);
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
              <FilePlus2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{document.label}</span>
            </div>
            <span className="truncate rounded border border-border/70 px-1 py-0.5 text-[10px] text-muted-foreground">
              {schema?.name ?? document.schemaId}
            </span>
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
    <BaseSidebar>
      <SidebarHeader className="px-4 py-3 border-b border-border space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Vault Explorer</p>
        </div>

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
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Document Tree
          </div>

          {renderAddMenu("tree-start")}

          {rootDocuments.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">No matching documents.</p>
          ) : (
            <div className="space-y-1 px-1">{rootDocuments.map((doc) => renderDocumentNode(doc))}</div>
          )}
        </SidebarGroup>
      </SidebarContent>
    </BaseSidebar>
  );
}

export { Sidebar };