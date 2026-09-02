import React, { useMemo } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Sidebar } from "./sidebar";
import type { DocumentNode, DocumentSchema, WorkspaceRecord } from "@/lib/types";
import { Menu } from "lucide-react";
import { WorkspaceIcon } from "@/lib/icon/components/workspace";

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
  onOpenInvite: () => void;
}

function MainContent({
  children,
  activeDocument,
  activeWorkspace
}: {
  children: React.ReactNode;
  activeDocument?: DocumentNode;
  activeWorkspace?: WorkspaceRecord;
}) {
  return (
    <div className="flex flex-1 flex-col min-w-0 h-full">
      {/* Mobile-Friendly Top Navigation Header */}
      <header className="flex md:hidden items-center justify-between border-b border-border bg-background px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="h-8 w-8 shrink-0">
            <Menu className="h-4 w-4" />
          </SidebarTrigger>
          <div className="flex items-center gap-1.5 min-w-0">
            <WorkspaceIcon src={activeWorkspace?.icon_path} />
            <span className="font-semibold text-foreground">{activeWorkspace?.name ?? "Vault Explorer"}</span>
            {activeDocument && (
              <span className="text-muted-foreground truncate font-medium">
                / {activeDocument.label}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
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
  onOpenInvite
}: LayoutProps) {
  const activeDocument = documents.find((doc) => doc.id === activeDocumentId);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  }, [activeWorkspaceId, workspaces]);

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
        onOpenInvite={onOpenInvite}
      />
      <MainContent activeDocument={activeDocument} activeWorkspace={activeWorkspace}>{children}</MainContent>
    </SidebarProvider>
  );
}