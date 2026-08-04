import { useState } from "react"
import { Download, FileDown, FileUp, Settings } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DocumentSchema, DocumentSchemaGroup, SpecificationDefinition, SpecificationStore, WorkspaceRecord } from "@/lib/types"
import { SchemaManager } from "@/components/ui/custom/schema-manager"
import { SpecificationsManager } from "@/components/ui/custom/specifications-manager"
import { ImportDataModal } from "@/components/ui/custom/import-data-modal"

interface SettingsModalProps {
    trigger?: React.ReactElement
    groups: DocumentSchemaGroup[]
    specificationRegistry: SpecificationDefinition[]
    specifications: SpecificationStore
    onDeleteSchema: (id: string) => void
    onExportToObsidian: (options: { includeTutorial: boolean }) => Promise<void>
    onExportToCsv: () => Promise<void>
    onExportToXlsx: () => Promise<void>
    onImportCompleted: (summary: string) => void
    workspaces: WorkspaceRecord[]
    activeWorkspaceId: string
    onSwitchWorkspace: (workspaceId: string) => Promise<void>
    onCreateWorkspace: (name: string, description?: string) => Promise<void>
    onRenameWorkspace: (workspaceId: string, name: string, description?: string) => Promise<void>
    onDeleteWorkspace: (workspaceId: string) => Promise<void>
    onSetWorkspaceTemplateGroup: (workspaceId: string, templateGroupId?: string) => Promise<void>
    onSaveSchema: (schema: DocumentSchema) => void
    onSaveGroup: (group: DocumentSchemaGroup) => void
    onDeleteGroup: (groupId: string) => void
    onSaveSpecifications: (nextRegistry: SpecificationDefinition[], nextValues: SpecificationStore) => Promise<void>
    workspaceId?: string
    defaultIncludeTutorial?: boolean
}

function SettingsModal({
    trigger,
    groups,
    specificationRegistry,
    specifications,
    onDeleteSchema,
    onExportToObsidian,
    onExportToCsv,
    onExportToXlsx,
    onImportCompleted,
    workspaces,
    activeWorkspaceId,
    onSwitchWorkspace,
    onCreateWorkspace,
    onRenameWorkspace,
    onDeleteWorkspace,
    onSetWorkspaceTemplateGroup,
    onSaveSchema,
    onSaveGroup,
    onDeleteGroup,
    onSaveSpecifications,
    workspaceId = "default",
    defaultIncludeTutorial = false,
}: SettingsModalProps) {
    const [isExporting, setIsExporting] = useState(false)
    const [isCsvExporting, setIsCsvExporting] = useState(false)
    const [isXlsxExporting, setIsXlsxExporting] = useState(false)
    const [isSavingTemplateGroup, setIsSavingTemplateGroup] = useState(false)
    const [includeTutorial, setIncludeTutorial] = useState(defaultIncludeTutorial)

    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
    const [selectedTemplateGroupId, setSelectedTemplateGroupId] = useState<string>(() => activeWorkspace?.template_group_id ?? "__none")

    const handleExport = async () => {
        setIsExporting(true)
        try {
            await onExportToObsidian({ includeTutorial })
            setIncludeTutorial(false)
        } catch (error) {
            console.error("Export failed", error)
        } finally {
            setIsExporting(false)
        }
    }

    const handleCsvExport = async () => {
        setIsCsvExporting(true)
        try {
            await onExportToCsv()
        } catch (error) {
            console.error("CSV export failed", error)
        } finally {
            setIsCsvExporting(false)
        }
    }

    const handleXlsxExport = async () => {
        setIsXlsxExporting(true)
        try {
            await onExportToXlsx()
        } catch (error) {
            console.error("XLSX export failed", error)
        } finally {
            setIsXlsxExporting(false)
        }
    }

    const handleCreateWorkspace = async () => {
        const name = window.prompt("Workspace name")
        if (!name || !name.trim()) return
        const description = window.prompt("Description (optional)") ?? undefined
        await onCreateWorkspace(name.trim(), description?.trim() || undefined)
    }

    const handleRenameWorkspace = async () => {
        if (!activeWorkspace) return
        const name = window.prompt("Rename workspace", activeWorkspace.name)
        if (!name || !name.trim()) return
        const description = window.prompt("Description (optional)", activeWorkspace.description ?? "") ?? undefined
        await onRenameWorkspace(activeWorkspace.id, name.trim(), description?.trim() || undefined)
    }

    const handleDeleteWorkspace = async () => {
        if (!activeWorkspace || activeWorkspace.id === "default") return
        const confirmed = window.confirm(`Delete workspace "${activeWorkspace.name}"? This removes all workspace data.`)
        if (!confirmed) return
        await onDeleteWorkspace(activeWorkspace.id)
    }

    const handleSaveTemplateGroup = async () => {
        if (!activeWorkspace) return
        setIsSavingTemplateGroup(true)
        try {
            await onSetWorkspaceTemplateGroup(
                activeWorkspace.id,
                selectedTemplateGroupId === "__none" ? undefined : selectedTemplateGroupId
            )
        } finally {
            setIsSavingTemplateGroup(false)
        }
    }

    return (
        <Dialog>
            <DialogTrigger render={trigger ?? <Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button>} />

            <DialogContent className="flex h-[94vh] w-[96vw] max-w-375 flex-col overflow-hidden p-0 sm:max-w-375">
                <DialogHeader>
                    <DialogTitle className="px-6 pt-6">Workspace Settings</DialogTitle>
                    <DialogDescription>
                        <span className="px-6 pb-2 block">Configure your local document types, choose metadata schemas, and export your vault.</span>
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="workspace" className="mt-2 flex min-h-0 flex-1 flex-col px-6 pb-6">
                    <TabsList className="grid w-full max-w-xl grid-cols-3">
                        <TabsTrigger value="workspace">Workspace</TabsTrigger>
                        <TabsTrigger value="schemas">Schema Workspace</TabsTrigger>
                        <TabsTrigger value="specifications">Specifications</TabsTrigger>
                    </TabsList>

                    <TabsContent value="workspace" className="mt-4 min-h-0 flex-1 overflow-auto space-y-4">
                        <div className="rounded-lg border p-4 space-y-3">
                            <h4 className="text-sm font-semibold">Workspace Management</h4>
                            <div className="space-y-2">
                                <Label>Active Workspace</Label>
                                <Select
                                    value={activeWorkspaceId}
                                    onValueChange={(value) => {
                                        if (!value) return
                                        void onSwitchWorkspace(value)
                                        const nextWorkspace = workspaces.find((workspace) => workspace.id === value)
                                        setSelectedTemplateGroupId(nextWorkspace?.template_group_id ?? "__none")
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select workspace" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {workspaces.map((workspace) => (
                                            <SelectItem key={workspace.id} value={workspace.id}>
                                                {workspace.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Button type="button" variant="outline" onClick={() => void handleCreateWorkspace()}>Create</Button>
                                <Button type="button" variant="outline" onClick={() => void handleRenameWorkspace()} disabled={!activeWorkspace}>Rename</Button>
                                <Button type="button" variant="outline" onClick={handleExport} disabled={isExporting}>
                                    {isExporting ? "Exporting..." : "Export"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={!activeWorkspace || activeWorkspace.id === "default"}
                                    onClick={() => void handleDeleteWorkspace()}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                            <h4 className="text-sm font-semibold">Workspace Template Group</h4>
                            <p className="text-xs text-muted-foreground">
                                Choose which schema group should be treated as the default template group for this workspace.
                            </p>
                            <Select
                                value={selectedTemplateGroupId}
                                onValueChange={(value) => setSelectedTemplateGroupId(value ?? "__none")}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select template group" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">No default template group</SelectItem>
                                    {groups.map((group) => (
                                        <SelectItem key={group.id} value={group.id}>
                                            {group.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" onClick={() => void handleSaveTemplateGroup()} disabled={isSavingTemplateGroup || !activeWorkspace}>
                                {isSavingTemplateGroup ? "Saving..." : "Save Template Group"}
                            </Button>
                        </div>

                        <div className="space-y-4 rounded-lg border border-dashed p-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <Download className="h-6 w-6" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-md font-semibold">Export and import workspace data</h4>
                                    <p className="text-sm text-muted-foreground max-w-2xl">
                                        Create Obsidian-style markdown vaults, or export the active workspace as CSV and XLSX spreadsheets.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button onClick={handleExport} disabled={isExporting} className="w-full justify-start gap-2">
                                    <FileDown className="h-4 w-4" />
                                    {isExporting ? "Exporting vault..." : "Export Obsidian Vault"}
                                </Button>
                                <Button onClick={handleCsvExport} disabled={isCsvExporting} variant="outline" className="w-full justify-start gap-2">
                                    <FileDown className="h-4 w-4" />
                                    {isCsvExporting ? "Exporting CSV..." : "Export CSV Bundle"}
                                </Button>
                                <Button onClick={handleXlsxExport} disabled={isXlsxExporting} variant="outline" className="w-full justify-start gap-2">
                                    <FileDown className="h-4 w-4" />
                                    {isXlsxExporting ? "Exporting XLSX..." : "Export XLSX Workbook"}
                                </Button>
                                <ImportDataModal workspaceId={workspaceId} onImportCompleted={onImportCompleted}>
                                    <Button variant="secondary" className="w-full justify-start gap-2">
                                        <FileUp className="h-4 w-4" />
                                        Import Files
                                    </Button>
                                </ImportDataModal>
                            </div>

                            <div className="rounded-xl border bg-background/60 p-4">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        checked={includeTutorial}
                                        onCheckedChange={(nextValue) => setIncludeTutorial(nextValue === true)}
                                        aria-label="Include Obsidian tutorial"
                                    />
                                    <div className="space-y-1">
                                        <Label className="text-sm font-medium">Include Obsidian tutorial and getting-started note</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Enabled by default for the first vault export only. The export also bundles schema templates and specifications for reference.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="schemas" className="mt-4 min-h-0 flex-1 overflow-hidden">
                        <div className="h-full overflow-auto pr-2">
                            <SchemaManager
                                groups={groups}
                                specificationRegistry={specificationRegistry}
                                onSaveGroup={onSaveGroup}
                                onDeleteGroup={onDeleteGroup}
                                onSaveSchema={onSaveSchema}
                                onDeleteSchema={onDeleteSchema}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="specifications" className="mt-4 min-h-0 flex-1 overflow-auto">
                        <SpecificationsManager
                            registry={specificationRegistry}
                            specifications={specifications}
                            onSave={onSaveSpecifications}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

export {
    SettingsModal
}