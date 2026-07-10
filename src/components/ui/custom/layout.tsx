import { SidebarProvider } from "@/components/ui/sidebar";
import { Sidebar } from "./sidebar";
import type { DocumentNode, DocumentSchema } from "@/lib/types";

interface LayoutProps {
  children: React.ReactNode;
  schemas: DocumentSchema[];
  documents: DocumentNode[];
  activeSchemaId?: string;
  activeDocumentId?: string;
  onSelectSchema: (id: string) => void;
  onSelectDocument: (documentId: string, schemaId: string) => void;
  onCreateDocument: (schema: DocumentSchema, parentId?: string) => void;
}

export default function Layout({
  children,
  schemas,
  documents,
  activeSchemaId,
  activeDocumentId,
  onSelectSchema,
  onSelectDocument,
  onCreateDocument,
}: LayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar
        schemas={schemas}
        documents={documents}
        activeSchemaId={activeSchemaId}
        activeDocumentId={activeDocumentId}
        onSelectSchema={onSelectSchema}
        onSelectDocument={onSelectDocument}
        onCreateDocument={onCreateDocument}
      />
      <div className="flex-1">{children}</div>
    </SidebarProvider>
  );
}