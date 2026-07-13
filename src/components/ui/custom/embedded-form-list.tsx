import { useState } from "react";
import { ChevronDown, ChevronRight, FilePlus2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentSchema } from "@/lib/types";

interface EmbeddedFormListProps {
    _fieldName: string;
    fieldLabel: string;
    childSchema: DocumentSchema;
    linkedDocuments: { id: string; title: string; data: Record<string, any> }[];
    onCreateDocument: (title: string, data: Record<string, any>) => void;
    _onUpdateDocument: (documentId: string, data: Record<string, any>) => void;
    onDeleteDocument: (documentId: string) => void;
    onNavigateToDocument?: (documentId: string) => void;
}

interface ExpandedDocument {
    id: string;
    isExpanded: boolean;
    isEditing: boolean;
}

export function EmbeddedFormList({
    fieldLabel,
    childSchema,
    linkedDocuments,
    onCreateDocument,
    onDeleteDocument,
    onNavigateToDocument,
}: Omit<EmbeddedFormListProps, "_fieldName" | "_onUpdateDocument">) {
    const [expandedDocs, setExpandedDocs] = useState<Record<string, ExpandedDocument>>({});
    const [isCreating, setIsCreating] = useState(false);
    const [newDocTitle, setNewDocTitle] = useState("");

    const toggleExpand = (docId: string) => {
        setExpandedDocs((prev) => ({
            ...prev,
            [docId]: {
                ...(prev[docId] || { id: docId, isExpanded: false, isEditing: false }),
                isExpanded: !(prev[docId]?.isExpanded ?? false),
            },
        }));
    };

    const handleCreateNewDoc = () => {
        if (!newDocTitle.trim()) return;
        onCreateDocument(newDocTitle, {});
        setNewDocTitle("");
        setIsCreating(false);
    };

    const handleDeleteDoc = (docId: string) => {
        if (confirm("Delete this document? This cannot be undone.")) {
            onDeleteDocument(docId);
        }
    };

    return (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{fieldLabel}</h3>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsCreating(!isCreating)}
                    className="h-6"
                >
                    <Plus className="h-3 w-3 mr-1" />
                    Add {childSchema.name}
                </Button>
            </div>

            {isCreating && (
                <div className="flex gap-2 rounded-md bg-background p-2">
                    <input
                        type="text"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        placeholder={`New ${childSchema.name} title...`}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateNewDoc();
                            if (e.key === "Escape") setIsCreating(false);
                        }}
                    />
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateNewDoc}
                        className="h-7"
                    >
                        Create
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setIsCreating(false);
                            setNewDocTitle("");
                        }}
                        className="h-7"
                    >
                        Cancel
                    </Button>
                </div>
            )}

            {linkedDocuments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                    No {childSchema.name} documents yet. Add one to get started.
                </p>
            ) : (
                <div className="space-y-1">
                    {linkedDocuments.map((doc) => {
                        const isExpanded = expandedDocs[doc.id]?.isExpanded ?? false;

                        return (
                            <div
                                key={doc.id}
                                className="rounded-md border border-border/40 bg-background p-2"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(doc.id)}
                                        className="flex flex-1 items-center gap-2 text-left hover:text-accent-foreground"
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4 shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 shrink-0" />
                                        )}
                                        <FilePlus2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                        <span className="truncate text-sm font-medium">
                                            {doc.title || `Untitled ${childSchema.name}`}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (onNavigateToDocument) {
                                                onNavigateToDocument(doc.id);
                                            }
                                        }}
                                        className="rounded px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
                                        title="Open in full view"
                                    >
                                        →
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleDeleteDoc(doc.id)}
                                        className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                                        title="Delete document"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
                                        {Object.entries(doc.data || {}).map(([key, value]) => (
                                            <div key={key} className="text-xs">
                                                <div className="font-medium text-muted-foreground">
                                                    {key}
                                                </div>
                                                <div className="text-foreground">
                                                    {typeof value === "string" ? value : JSON.stringify(value)}
                                                </div>
                                            </div>
                                        ))}
                                        {Object.keys(doc.data || {}).length === 0 && (
                                            <p className="text-xs italic text-muted-foreground">
                                                No data yet
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
