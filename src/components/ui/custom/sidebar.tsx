import { useState, useMemo } from "react";
import { FilePlus2, FolderTree, Search, X } from "lucide-react";

import {
  Sidebar as BaseSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { DocumentSchema } from "@/lib/types";

interface SidebarProps {
  schemas: DocumentSchema[];
  activeSchemaId?: string; 
  onSelectSchema: (schemaId: string) => void;
  onCreateChildSchema?: (schema: DocumentSchema) => void;
}

function Sidebar({ schemas, activeSchemaId, onSelectSchema, onCreateChildSchema }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSchemas = useMemo(() => {
    if (!searchQuery.trim()) return schemas;
    return schemas.filter(
      (schema) =>
        schema.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        schema.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [schemas, searchQuery]);

  const rootSchemas = useMemo(() => {
    return schemas.filter((s) => !s.parentSchemaId);
  }, [schemas]);

  const activeSchema = useMemo(() => {
    return schemas.find((s) => s.id === activeSchemaId);
  }, [schemas, activeSchemaId]);

  const validChildSchemasForContext = useMemo(() => {
    if (!activeSchema) return [];
    return schemas.filter((s) => s.parentSchemaId === activeSchema.id);
  }, [schemas, activeSchema]);

  return (
    <BaseSidebar>
      <SidebarHeader className="px-4 py-3 border-b border-border space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Document Workspace</p>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter document schemas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted/50 border border-input rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground text-foreground"
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

      <SidebarContent className="space-y-4 pt-3">
        <SidebarGroup className="px-2">
          <div className="border border-border/80 bg-muted/20 rounded-lg p-2 space-y-3">
            
            <div>
              <div className="space-y-1">
                {rootSchemas.map((schema) => (
                  <button
                    key={schema.id}
                    onClick={() => onSelectSchema(schema.id)}
                    className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md flex items-center gap-2 font-medium transition-all ${
                      activeSchemaId === schema.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-background border border-border/50 hover:bg-accent hover:text-accent-foreground text-foreground"
                    }`}
                  >
                    <FilePlus2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Add {schema.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-border/60">
              {activeSchema ? (
                validChildSchemasForContext.length > 0 ? (
                  <div className="space-y-1">
                    {validChildSchemasForContext.map((schema) => (
                      <button
                        key={schema.id}
                        onClick={() => onSelectSchema(schema.id)}
                        className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md flex items-center gap-2 font-medium transition-all ${
                          activeSchemaId === schema.id
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-background border border-border/50 hover:bg-accent hover:text-accent-foreground text-foreground"
                        }`}
                      >
                        <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">Nest {schema.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic px-1 pt-0.5">
                    "{activeSchema.name}" defines no sub-tier relationships.
                  </p>
                )
              ) : (
                <div className="bg-muted/40 border border-dashed border-border rounded-md p-2 text-center">
                  <p className="text-[11px] text-muted-foreground italic">
                    Select an active top-tier document above to unlock nesting options.
                  </p>
                </div>
              )}
            </div>
          </div>
        </SidebarGroup>

        <SidebarGroup>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            All Workspace Schemas {searchQuery && `(Filtered)`}
          </div>
          <SidebarMenu>
            {filteredSchemas.map((schema) => (
              <SidebarMenuItem key={schema.id}>
                <SidebarMenuButton
                  onClick={() => onSelectSchema(schema.id)}
                  isActive={activeSchemaId === schema.id}
                  className="justify-between group"
                >
                  <span className="flex items-center gap-2 truncate">
                    {schema.parentSchemaId ? (
                      <FolderTree className="h-3.5 w-3.5 text-muted-foreground group-data-[active=true]:text-primary-foreground" />
                    ) : (
                      <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground group-data-[active=true]:text-primary-foreground" />
                    )}
                    <span className="truncate font-medium">{schema.name}</span>
                  </span>
                  {schema.parentSchemaId ? (
                    <span className="text-[9px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground border group-data-[active=true]:bg-primary-foreground/20 group-data-[active=true]:text-primary-foreground group-data-[active=true]:border-transparent">
                      Child
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary font-semibold rounded-full group-data-[active=true]:bg-primary-foreground/20 group-data-[active=true]:text-primary-foreground">
                      Root
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {filteredSchemas.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4 italic">
                No matching templates found.
              </p>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </BaseSidebar>
  );
}

export { Sidebar };