import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/ui/custom/sidebar";
import type { DocumentSchema } from "@/lib/types";

interface LayoutProps {
  children: React.ReactNode
  schemas: DocumentSchema[]
  onSelectSchema: (schemaId: string) => void
  onCreateChildSchema: (schema: DocumentSchema) => void
  activeSchemaId?: string
}

function Layout({ children, schemas, onSelectSchema, onCreateChildSchema, activeSchemaId }: LayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar
        schemas={schemas}
        onSelectSchema={onSelectSchema}
        onCreateChildSchema={onCreateChildSchema}
        activeSchemaId={activeSchemaId}
      />
      <main className="w-full p-4">
        <div className="flex items-start gap-4">
          <SidebarTrigger className="mt-2" />
          <div className="min-w-0 flex-1">
            {children}
          </div>
        </div>
      </main>
      <Toaster />
    </SidebarProvider>
  )
}

export default Layout;