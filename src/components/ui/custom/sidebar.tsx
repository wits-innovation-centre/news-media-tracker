import { FilePlus2, FolderTree, Sparkles } from "lucide-react";

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
  schemas: DocumentSchema[]
  onSelectSchema: (schemaId: string) => void
  onCreateChildSchema: (schema: DocumentSchema) => void
}

function Sidebar({ schemas, onSelectSchema, onCreateChildSchema }: SidebarProps) {
  return (
    <BaseSidebar>
      <SidebarHeader className="px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Document Workspace</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <div className="px-2 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            New document
          </div>
          <SidebarMenu>
            {schemas.map((schema) => (
              <SidebarMenuItem key={schema.id}>
                <SidebarMenuButton onClick={() => onSelectSchema(schema.id)} className="justify-between">
                  <span className="flex items-center gap-2">
                    <FilePlus2 className="h-4 w-4" />
                    {schema.name}
                  </span>
                  {schema.parentSchemaId ? <FolderTree className="h-3.5 w-3.5" /> : null}
                </SidebarMenuButton>
                {schema.kind !== "template" ? (
                  <SidebarMenuButton onClick={() => onCreateChildSchema(schema)} className="pl-8 text-xs text-muted-foreground">
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    Add child schema
                  </SidebarMenuButton>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </BaseSidebar>
  )
};

export {
  Sidebar
};