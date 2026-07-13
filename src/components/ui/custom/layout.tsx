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
  onDeleteDocument: (documentId: string) => void;
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
  onDeleteDocument,
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
        onDeleteDocument={onDeleteDocument}
      />
      <div className="flex-1">{children}</div>
    </SidebarProvider>
  );
}