import { useState } from "react"
import { Settings, Download } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DocumentSchema, DocumentSchemaGroup } from "@/lib/types"
import { SchemaManager } from "@/components/ui/custom/schema-manager"

interface SettingsModalProps {
    groups: DocumentSchemaGroup[]
    onDeleteSchema: (id: string) => void
    onExportToObsidian: () => Promise<void>
    onSaveSchema: (schema: DocumentSchema) => void
    onSaveGroup: (group: DocumentSchemaGroup) => void
    onDeleteGroup: (groupId: string) => void
}

function SettingsModal({ groups, onDeleteSchema, onExportToObsidian, onSaveSchema, onSaveGroup, onDeleteGroup }: SettingsModalProps) {
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

            <DialogContent className="flex h-[94vh] w-[96vw] max-w-375 flex-col overflow-hidden p-0 sm:max-w-375">
                <DialogHeader>
                    <DialogTitle className="px-6 pt-6">Workspace Settings</DialogTitle>
                    <DialogDescription>
                        <span className="px-6 pb-2 block">Configure your local document types, choose metadata schemas, and export your vault.</span>
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="schemas" className="mt-2 flex min-h-0 flex-1 flex-col px-6 pb-6">
                    <TabsList className="grid w-full max-w-sm grid-cols-2">
                        <TabsTrigger value="schemas">Schema Workspace</TabsTrigger>
                        <TabsTrigger value="export">Data Vault Actions</TabsTrigger>
                    </TabsList>

                    <TabsContent value="schemas" className="mt-4 min-h-0 flex-1 overflow-hidden">
                        <div className="h-full overflow-auto pr-2">
                            <SchemaManager
                                groups={groups}
                                onSaveGroup={onSaveGroup}
                                onDeleteGroup={onDeleteGroup}
                                onSaveSchema={onSaveSchema}
                                onDeleteSchema={onDeleteSchema}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="export" className="mt-4 min-h-0 flex-1 overflow-auto">
                        <div className="space-y-4 rounded-lg border border-dashed p-6 text-center">
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