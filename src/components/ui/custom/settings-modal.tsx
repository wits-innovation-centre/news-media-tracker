import { useState } from "react"
import { Settings, Plus, Trash2, Download, FolderTree } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DocumentSchema, FieldDefinition } from "@/lib/types"
import { DEFAULT_SCHEMA_TEMPLATES } from "@/lib/schema-registry"

interface SettingsModalProps {
    userSchemas: DocumentSchema[]
    onSaveSchema: (name: string, fields: FieldDefinition[]) => void
    onDeleteSchema: (id: string) => void
    onExportToObsidian: () => Promise<void>
    onCreateChildSchema: (schema: DocumentSchema) => void
}

function SettingsModal({ userSchemas, onSaveSchema, onDeleteSchema, onExportToObsidian, onCreateChildSchema }: SettingsModalProps) {
    const [isExporting, setIsExporting] = useState(false)

    const handleExport = async () => {
        setIsExporting(true)
        try {
            await onExportToObsidian()
        } catch (error) {
            console.error("Export failed", error)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <Dialog>
            <DialogTrigger
                render={
                    <Button variant="ghost" size="icon" className="fixed top-4 right-4 z-50" />
                }
            >
                <Button variant="ghost" size="icon" className="fixed top-4 right-4 z-50">
                    <Settings className="h-5 w-5" />
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-150 max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Workspace Settings</DialogTitle>
                    <DialogDescription>
                        Configure your local document types, choose metadata schemas, and export your vault.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="schemas" className="w-full mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="schemas">Document Schemas</TabsTrigger>
                        <TabsTrigger value="export">Data Vault Actions</TabsTrigger>
                    </TabsList>

                    <TabsContent value="schemas" className="space-y-4 pt-4">
                        <div>
                            <h4 className="text-sm font-medium mb-2">Available Templates</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {DEFAULT_SCHEMA_TEMPLATES.map((templateGroup) => {
                                    const primaryDocument = templateGroup.documents[0]
                                    return (
                                        <Button
                                            key={templateGroup.id}
                                            variant="outline"
                                            className="justify-start text-left"
                                            onClick={() => onSaveSchema(primaryDocument.name.replace(/[^a-zA-Z ]/g, "").trim(), primaryDocument.fields as FieldDefinition[])}
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            <span className="flex flex-col items-start">
                                                <span>{templateGroup.name}</span>
                                                <span className="text-xs text-muted-foreground">{templateGroup.documents.length} documents</span>
                                            </span>
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <hr className="my-4 border-muted" />

                        <div>
                            <h4 className="text-sm font-medium mb-2">Your Active Active Document Schemas</h4>
                            {userSchemas.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No custom schemas built yet. Pick a template above or create one.</p>
                            ) : (
                                <div className="space-y-2">
                                    {userSchemas.map((schema) => (
                                        <div key={schema.id} className="flex items-center justify-between p-3 border rounded-lg bg-card text-card-foreground">
                                            <div>
                                                <p className="font-medium text-sm">{schema.name}</p>
                                                <p className="text-xs text-muted-foreground">{schema.fields.length} tracking fields defined</p>
                                                {schema.parentSchemaId ? <p className="text-[11px] text-muted-foreground">Child of {schema.parentSchemaId}</p> : null}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => onCreateChildSchema(schema)} className="text-primary hover:bg-primary/10" title="Create child schema">
                                                    <FolderTree className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => onDeleteSchema(schema.id)} className="text-destructive hover:bg-destructive/10">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="export" className="space-y-4 pt-4">
                        <div className="rounded-lg border border-dashed p-6 text-center space-y-4">
                            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Download className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-md font-semibold">Compile to Obsidian Vault</h4>
                                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                    This compiles all stored entries in your local SQLite engine into physical markdown documents with fully structured YAML frontmatter.
                                </p>
                            </div>
                            <Button onClick={handleExport} disabled={isExporting} className="w-full sm:w-auto">
                                {isExporting ? "Compiling Environment..." : "Export Workspace Data"}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

export {
    SettingsModal
}