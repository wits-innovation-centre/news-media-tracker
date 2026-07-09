import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Sidebar } from "@/components/ui/custom/sidebar";
import type { DocumentSchema } from "@/lib/types";

interface LayoutProps {
  children: React.ReactNode
  schemas: DocumentSchema[]
  onSelectSchema: (schemaId: string) => void
  onCreateChildSchema: (schema: DocumentSchema) => void
}

function Layout({ children, schemas, onSelectSchema, onCreateChildSchema }: LayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar
        schemas={schemas}
        onSelectSchema={onSelectSchema}
        onCreateChildSchema={onCreateChildSchema}
      />
      <main className="w-full p-4">
        <SidebarTrigger />
        <div className="mt-4">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}

export default Layout;