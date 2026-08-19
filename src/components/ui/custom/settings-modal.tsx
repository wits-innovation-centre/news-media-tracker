import { useEffect, useMemo, useState } from "react"
import {
    Download,
    FileDown,
    FileUp,
    Settings,
    Plus,
    Layers,
    FileCode2,
    ChevronRight,
} from "lucide-react"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DocumentSchema, DocumentSchemaGroup, SpecificationDefinition, SpecificationStore, WorkspaceRecord } from "@/lib/types"
import { SchemaManager } from "@/components/ui/custom/schema-manager"
import { SpecificationsManager } from "@/components/ui/custom/specifications-manager"
import { ImportDataView } from "@/components/ui/custom/import-data-view"
import { useModalStack } from "@/hooks/use-modal-stack"
import { ModalStackHeader } from "@/components/ui/custom/modal-stack-header"

export interface SettingsModalProps {
    trigger?: React.ReactNode
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

interface SettingsMainContentProps extends SettingsModalProps {
    onOpenSchemasPage: () => void
    onOpenSpecificationsPage: () => void
    onOpenImportPage: () => void
}

function SettingsMainContent({
    groups,
    specificationRegistry,
    onExportToObsidian,
    onExportToCsv,
    onExportToXlsx,
    workspaces,
    activeWorkspaceId,
    onSwitchWorkspace,
    onCreateWorkspace,
    onRenameWorkspace,
    onDeleteWorkspace,
    onSetWorkspaceTemplateGroup,
    defaultIncludeTutorial = false,
    onOpenSchemasPage,
    onOpenSpecificationsPage,
    onOpenImportPage,
}: SettingsMainContentProps) {
    const [isExporting, setIsExporting] = useState(false)
    const [isCsvExporting, setIsCsvExporting] = useState(false)
    const [isXlsxExporting, setIsXlsxExporting] = useState(false)
    const [isSavingTemplateGroup, setIsSavingTemplateGroup] = useState(false)
    const [includeTutorial, setIncludeTutorial] = useState(defaultIncludeTutorial)

    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
    const [selectedTemplateGroupId, setSelectedTemplateGroupId] = useState<string>(() => activeWorkspace?.template_group_id ?? "__none__")

    useEffect(() => { console.log(activeWorkspace) }, [activeWorkspace]);

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
                selectedTemplateGroupId === "__none__" ? undefined : selectedTemplateGroupId
            )
        } finally {
            setIsSavingTemplateGroup(false)
        }
    }

    const totalSchemas = useMemo(() => groups.reduce((acc, g) => acc + (g.documents?.length || 0), 0), [groups])

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            {/* Feature Modules Routing Cards */}
            <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Settings Modules</h3>
                <div className="grid gap-4 md:grid-cols-2">
                    <Card
                        className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm"
                        onClick={onOpenSchemasPage}
                    >
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        <Layers className="h-5 w-5" />
                                    </div>
                                    <CardTitle className="text-sm font-semibold">Schema Workspace</CardTitle>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <CardDescription className="text-xs">
                                Manage schema groups, entity templates, and field properties ({groups.length} groups, {totalSchemas} schemas).
                            </CardDescription>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm"
                        onClick={onOpenSpecificationsPage}
                    >
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        <FileCode2 className="h-5 w-5" />
                                    </div>
                                    <CardTitle className="text-sm font-semibold">Specifications Manager</CardTitle>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <CardDescription className="text-xs">
                                Configure specification definitions and values ({specificationRegistry.length} registered specs).
                            </CardDescription>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Workspace Settings */}
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Workspace Management</h3>

                <div className="rounded-lg border p-4 space-y-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Active Workspace</Label>
                            <p className="text-xs text-muted-foreground">Switch or configure active workspace data.</p>
                        </div>
                        <Select
                            value={activeWorkspaceId}
                            onValueChange={(value) => {
                                if (!value) return
                                void onSwitchWorkspace(value)
                                const nextWorkspace = workspaces.find((workspace) => workspace.id === value)
                                setSelectedTemplateGroupId(nextWorkspace?.template_group_id ?? "__none__")
                            }}
                        >
                            <SelectTrigger className="w-56 text-xs h-8">
                                <SelectValue placeholder="Select workspace" />
                            </SelectTrigger>
                            <SelectContent>
                                {workspaces.map((workspace) => (
                                    <SelectItem key={workspace.id} value={workspace.id} className="text-xs">
                                        {workspace.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 border-t">
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleCreateWorkspace()} className="text-xs">
                            Create Workspace
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleRenameWorkspace()} disabled={!activeWorkspace} className="text-xs">
                            Rename
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={!activeWorkspace || activeWorkspace.id === "default"}
                            onClick={() => void handleDeleteWorkspace()}
                            className="text-xs"
                        >
                            Delete
                        </Button>
                    </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3 bg-card">
                    <div className="space-y-0.5">
                        <Label className="text-xs font-semibold">Workspace Template Group</Label>
                        <p className="text-xs text-muted-foreground">
                            Choose which schema group is treated as default for this workspace.
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <Select
                            value={selectedTemplateGroupId}
                            onValueChange={(value) => setSelectedTemplateGroupId(value ?? "__none__")}
                        >
                            <SelectTrigger className="flex-1 text-xs h-8">
                                <SelectValue placeholder="Select template group" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__" className="text-xs">No default template group</SelectItem>
                                {groups.map((group) => (
                                    <SelectItem key={group.id} value={group.id} className="text-xs">
                                        {group.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleSaveTemplateGroup()} disabled={isSavingTemplateGroup || !activeWorkspace} className="text-xs">
                            {isSavingTemplateGroup ? "Saving..." : "Save Default"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Export & Import Hub */}
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Import & Export Hub</h3>

                <div className="space-y-4 rounded-lg border border-dashed p-5 bg-card">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Download className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold">Export and import workspace data</h4>
                            <p className="text-xs text-muted-foreground">
                                Export Obsidian markdown vaults, CSV bundles, and XLSX workbooks, or run schema imports.
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                        <Button onClick={handleExport} disabled={isExporting} size="sm" className="w-full justify-start gap-2 text-xs">
                            <FileDown className="h-3.5 w-3.5" />
                            {isExporting ? "Exporting vault..." : "Export Obsidian Vault"}
                        </Button>
                        <Button onClick={handleCsvExport} disabled={isCsvExporting} variant="outline" size="sm" className="w-full justify-start gap-2 text-xs">
                            <FileDown className="h-3.5 w-3.5" />
                            {isCsvExporting ? "Exporting CSV..." : "Export CSV Bundle"}
                        </Button>
                        <Button onClick={handleXlsxExport} disabled={isXlsxExporting} variant="outline" size="sm" className="w-full justify-start gap-2 text-xs">
                            <FileDown className="h-3.5 w-3.5" />
                            {isXlsxExporting ? "Exporting XLSX..." : "Export XLSX Workbook"}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={onOpenImportPage} className="w-full justify-start gap-2 text-xs">
                            <FileUp className="h-3.5 w-3.5" />
                            Import Files & Data
                        </Button>
                    </div>

                    <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-start gap-2.5">
                            <Checkbox
                                checked={includeTutorial}
                                onCheckedChange={(nextValue) => setIncludeTutorial(nextValue === true)}
                                aria-label="Include Obsidian tutorial"
                                className="mt-0.5"
                            />
                            <div className="space-y-0.5">
                                <Label className="text-xs font-medium">Include Obsidian tutorial and getting-started note</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Bundles schema templates and specifications for initial vault exports.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

interface CreateSchemaViewProps {
    sheetName: string
    groups?: DocumentSchemaGroup[]
    onSchemaCreated: () => void
    onCreateSchema?: (schema: DocumentSchema) => void
}

function CreateSchemaView({ sheetName, groups = [], onSchemaCreated, onCreateSchema }: CreateSchemaViewProps) {
    const [schemaName, setSchemaName] = useState(sheetName)
    const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id || "")

    const handleCreate = () => {
        if (onCreateSchema) {
            onCreateSchema({
                id: `schema-${Date.now()}`,
                name: schemaName || sheetName,
                groupId: selectedGroupId || undefined,
                titleField: "title",
                fields: [],
            })
        }
        onSchemaCreated()
    }

    return (
        <div className="p-6 space-y-4 max-w-md">
            <div className="space-y-1">
                <h3 className="text-base font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    Create New Schema for "{sheetName}"
                </h3>
                <p className="text-xs text-muted-foreground">
                    Define name and group for the schema.
                </p>
            </div>

            <div className="space-y-3 text-xs">
                <div className="space-y-1">
                    <Label className="text-xs">Schema Name</Label>
                    <Input value={schemaName} onChange={(e) => setSchemaName(e.target.value)} />
                </div>

                {groups.length > 0 && (
                    <div className="space-y-1">
                        <Label className="text-xs">Group Assignment</Label>
                        <Select value={selectedGroupId} onValueChange={(val) => setSelectedGroupId(val ?? "")}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select group" />
                            </SelectTrigger>
                            <SelectContent>
                                {groups.map((g) => (
                                    <SelectItem key={g.id} value={g.id} className="text-xs">
                                        {g.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={onSchemaCreated}>
                    Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleCreate}>
                    Create Schema
                </Button>
            </div>
        </div>
    )
}

export function SettingsModal(props: SettingsModalProps) {
    const [open, setOpen] = useState(false)

    const activeWorkspace = props.workspaces.find((w) => w.id === props.activeWorkspaceId)
    const activeSchemaGroup = useMemo<DocumentSchemaGroup>(() => {
        const selectedGroup = props.groups.find((group) => group.id === activeWorkspace?.template_group_id)
        if (selectedGroup) return selectedGroup

        return {
            id: "workspace-schemas",
            name: "Workspace Schemas",
            documents: props.groups.flatMap((group) => group.documents),
        }
    }, [props.groups, activeWorkspace]);

    useEffect(() => { console.log(activeWorkspace) }, [activeWorkspace]);

    const primaryScreen = {
        id: "settings",
        title: "Workspace Settings",
        content: (
            <SettingsMainContent
                {...props}
                onOpenSchemasPage={() => {
                    modalStack.push({
                        id: "schema-manager",
                        title: "Schema Workspace",
                        content: (
                            <div className="p-6 h-full overflow-auto">
                                <SchemaManager
                                    groups={props.groups}
                                    specificationRegistry={props.specificationRegistry}
                                    onSaveGroup={props.onSaveGroup}
                                    onDeleteGroup={props.onDeleteGroup}
                                    onSaveSchema={props.onSaveSchema}
                                    onDeleteSchema={props.onDeleteSchema}
                                />
                            </div>
                        ),
                    })
                }}
                onOpenSpecificationsPage={() => {
                    modalStack.push({
                        id: "specifications-manager",
                        title: "Specifications Manager",
                        content: (
                            <div className="p-6 h-full overflow-auto">
                                <SpecificationsManager
                                    registry={props.specificationRegistry}
                                    specifications={props.specifications}
                                    onSave={props.onSaveSpecifications}
                                />
                            </div>
                        ),
                    })
                }}
                onOpenImportPage={() => {
                    modalStack.push({
                        id: "import-files",
                        title: "Import Files & Data",
                        content: (
                            <ImportDataView
                                workspaceId={props.workspaceId ?? props.activeWorkspaceId}
                                schemaGroup={activeSchemaGroup}
                                groups={props.groups}
                                specificationRegistry={props.specificationRegistry}
                                onImportCompleted={props.onImportCompleted}
                                onCloseModal={() => setOpen(false)}
                                onRequestCreateSchema={(sheetName) => {
                                    modalStack.push({
                                        id: "create-schema",
                                        title: `New Schema (${sheetName})`,
                                        content: (
                                            <CreateSchemaView
                                                sheetName={sheetName}
                                                groups={props.groups}
                                                onCreateSchema={props.onSaveSchema}
                                                onSchemaCreated={() => modalStack.pop()}
                                            />
                                        ),
                                    })
                                }}
                            />
                        ),
                    })
                }}
            />
        ),
    }

    const modalStack = useModalStack(primaryScreen)

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen)
        if (!nextOpen) {
            modalStack.reset()
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger>
                {props.trigger ?? (
                    <Button variant="ghost" size="icon">
                        <Settings className="h-5 w-5" />
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="flex h-[92vh] w-[95vw] sm:max-w-7xl flex-col overflow-hidden p-0 [&>button.absolute]:hidden">
                <ModalStackHeader
                    stack={modalStack.stack}
                    onBack={modalStack.pop}
                    onClose={() => handleOpenChange(false)}
                />

                <div className="flex-1 overflow-auto">
                    {modalStack.currentScreen.content}
                </div>
            </DialogContent>
        </Dialog>
    )
}