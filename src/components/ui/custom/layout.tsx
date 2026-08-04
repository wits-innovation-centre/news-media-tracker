import { SidebarProvider } from "@/components/ui/sidebar";
import { Sidebar } from "./sidebar";
import type { DocumentNode, DocumentSchema, WorkspaceRecord } from "@/lib/types";

interface LayoutProps {
  children: React.ReactNode;
  footerContent?: React.ReactNode;
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
  onSelectSchema: (id: string) => void;
  onSelectDocument: (documentId: string, schemaId: string) => void;
  onCreateDocument: (schema: DocumentSchema, parentId?: string) => void;
  onDeleteDocument: (documentId: string) => void;
}

export default function Layout({
  children,
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
}: LayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar
        footerContent={footerContent}
        schemas={schemas}
        documents={documents}
        workspaces={workspaces}
        activePath={activePath}
        mergeQueueCount={mergeQueueCount}
        activeWorkspaceId={activeWorkspaceId}
        activeSchemaId={activeSchemaId}
        activeDocumentId={activeDocumentId}
        onNavigate={onNavigate}
        onSwitchWorkspace={onSwitchWorkspace}
        onSelectSchema={onSelectSchema}
        onSelectDocument={onSelectDocument}
        onCreateDocument={onCreateDocument}
        onDeleteDocument={onDeleteDocument}
      />
      <div className="flex-1">{children}</div>
    </SidebarProvider>
  );
}