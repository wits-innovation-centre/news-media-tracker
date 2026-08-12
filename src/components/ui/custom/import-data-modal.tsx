import { useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload, ChevronDown } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import {
    SPREADSHEET_SPECIAL_FIELDS,
    importSpreadsheetSheet,
    importVaultZip,
    inspectSpreadsheetFile,
    type ParsedSpreadsheetSheet,
    type SpreadsheetImportMapping,
} from "@/lib/export-import"
import type { DocumentSchema, DocumentSchemaGroup } from "@/lib/types"
import { createSchemaFromSheet } from "@/lib/schema/utils"
import { toast } from "sonner"

interface SheetImportConfig {
    sheetName: string
    enabled: boolean
    schemaId: string
    mapping: SpreadsheetImportMapping
}

interface ImportDataModalProps {
    children: React.ReactElement
    workspaceId?: string
    schemaGroup?: DocumentSchemaGroup
    schemaId?: string
    onImportCompleted: (summary: string) => void
    onCreateSchema?: (schema: DocumentSchema) => void
}

const SPECIAL_MAPPING_FIELDS = [...SPREADSHEET_SPECIAL_FIELDS]

const canonicalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")

const guessTargetField = (header: string, availableFields: string[]) => {
    const normalized = canonicalize(header)
    if (normalized === "parentid" || normalized === "eventid" || normalized === "event") return "parent_id"
    if (normalized === "body" || normalized === "markdown" || normalized === "notes" || normalized === "description") return "body"
    if (normalized === "id") return "id"
    if (normalized === "title" || normalized === "name") return "title"

    for (const field of availableFields) {
        if (canonicalize(field) === normalized) {
            return field
        }
    }
    return ""
}

function ImportDataModal({
    children,
    workspaceId = "default",
    schemaGroup, schemaId:
    initialSchemaId,
    onImportCompleted,
    onCreateSchema
}: ImportDataModalProps) {
    const [open, setOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<"vault" | "spreadsheet">("vault")
    const [vaultFile, setVaultFile] = useState<File | null>(null)
    const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null)
    const [spreadsheetPreview, setSpreadsheetPreview] = useState<{ fileName: string; sheetNames: string[]; sheets: ParsedSpreadsheetSheet[] } | null>(null)
    const [expandedSheets, setExpandedSheets] = useState<Record<string, boolean>>({})

    // Per-sheet configuration state
    const [sheetConfigs, setSheetConfigs] = useState<Record<string, SheetImportConfig>>({})
    const [isImporting, setIsImporting] = useState(false)

    const vaultInputRef = useRef<HTMLInputElement | null>(null)
    const spreadsheetInputRef = useRef<HTMLInputElement | null>(null)

    const availableSchemas = useMemo<DocumentSchema[]>(() => {
        if (schemaGroup?.documents && schemaGroup.documents.length > 0) {
            return schemaGroup.documents
        }
        return [{ id: initialSchemaId || "general", name: initialSchemaId || "general", titleField: "title", fields: [] }]
    }, [schemaGroup, initialSchemaId])

    const inferSchemaIdFromSheetName = (sheetName: string): string => {
        if (!schemaGroup) return initialSchemaId || "general"
        const canonicalName = canonicalize(sheetName)
        const match = schemaGroup.documents.find(
            (doc: DocumentSchema) => canonicalize(doc.name) === canonicalName || canonicalize(doc.id) === canonicalName
        )
        return match?.id || availableSchemas[0]?.id || "general"
    }

    const buildColumnMapping = (headers: string[], schemaId: string) => {
        const schemaObj = availableSchemas.find((s) => s.id === schemaId) ?? availableSchemas[0]
        const schemaFields = schemaObj?.fields.map((f) => f.name) ?? []
        const availableFields = [...new Set([...SPECIAL_MAPPING_FIELDS, ...schemaFields])]

        const nextMapping: SpreadsheetImportMapping = {}
        headers.forEach((header) => {
            nextMapping[header] = guessTargetField(header, availableFields)
        })
        return nextMapping
    }

    // Dependency Validation: Detect if child schemas are enabled without their parent schemas
    const dependencyWarnings = useMemo(() => {
        const warnings: string[] = []
        const activeSchemaIds = new Set(
            Object.values(sheetConfigs)
                .filter((config) => config.enabled)
                .map((config) => config.schemaId)
        )

        Object.values(sheetConfigs).forEach((config) => {
            if (!config.enabled) return
            const schema = availableSchemas.find((s) => s.id === config.schemaId)
            if (!schema?.parentSchemaId) return

            const parentSchema = availableSchemas.find((s) => s.id === schema.parentSchemaId)
            if (parentSchema && !activeSchemaIds.has(parentSchema.id)) {
                warnings.push(`Sheet "${config.sheetName}" (${schema.name}) depends on parent entity "${parentSchema.name}", which is not selected for import.`)
            }
        })

        return warnings
    }, [sheetConfigs, availableSchemas])

    const resetState = () => {
        setVaultFile(null)
        setSpreadsheetFile(null)
        setSpreadsheetPreview(null)
        setSheetConfigs({})
        setExpandedSheets({})
    }

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen)
        if (!nextOpen) {
            resetState()
            setActiveTab("vault")
        }
    }

    const handleSpreadsheetFileSelect = async (file: File | null) => {
        setSpreadsheetFile(file)
        if (!file) {
            setSpreadsheetPreview(null)
            setSheetConfigs({})
            setExpandedSheets({})
            return
        }

        const preview = await inspectSpreadsheetFile(file)
        setSpreadsheetPreview(preview)

        const initialConfigs: Record<string, SheetImportConfig> = {}
        const initialExpanded: Record<string, boolean> = {}
        preview.sheets.forEach((sheet) => {
            const schemaId = inferSchemaIdFromSheetName(sheet.name)
            initialConfigs[sheet.name] = {
                sheetName: sheet.name,
                enabled: true,
                schemaId,
                mapping: buildColumnMapping(sheet.headers, schemaId),
            }
            initialExpanded[sheet.name] = true
        })
        setSheetConfigs(initialConfigs)
        setExpandedSheets(initialExpanded)
    }

    const handleSheetToggle = (sheetName: string, enabled: boolean) => {
        setSheetConfigs((prev) => ({
            ...prev,
            [sheetName]: { ...prev[sheetName], enabled },
        }))
    }

    const toggleSheetExpand = (sheetName: string) => {
        setExpandedSheets((prev) => ({
            ...prev,
            [sheetName]: !prev[sheetName],
        }))
    }

    const handleSchemaChange = (sheetName: string, schemaId: string | null) => {
        if (!schemaId) return
        const sheet = spreadsheetPreview?.sheets.find((s) => s.name === sheetName)
        if (!sheet) return

        let targetSchemaId = schemaId

        if (schemaId === "__create_new__") {
            const newSchema = createSchemaFromSheet(sheet, schemaGroup?.id, schemaGroup?.name)
            if (onCreateSchema) {
                onCreateSchema(newSchema)
            }
            targetSchemaId = newSchema.id
        }

        setSheetConfigs((prev) => ({
            ...prev,
            [sheetName]: {
                ...prev[sheetName],
                schemaId: targetSchemaId,
                mapping: buildColumnMapping(sheet.headers, targetSchemaId),
            },
        }))
    }

    const handleMappingChange = (sheetName: string, header: string, targetField: string | null) => {
        const val = targetField === "__ignore__" || !targetField ? "" : targetField
        setSheetConfigs((prev) => ({
            ...prev,
            [sheetName]: {
                ...prev[sheetName],
                mapping: {
                    ...prev[sheetName].mapping,
                    [header]: val,
                },
            },
        }))
    }

    const handleVaultImport = async () => {
        if (!vaultFile) return
        setIsImporting(true)
        try {
            const summary = await importVaultZip(vaultFile, workspaceId)
            onImportCompleted(`Imported ${summary.recordsUpserted} vault records from ${summary.filesProcessed} files.`)
            handleOpenChange(false)
        } catch (error) {
            console.error("Vault import failed", error)
            toast.error("Vault import failed.")
        } finally {
            setIsImporting(false)
        }
    }

    // Topological sort of configs to ensure parent schemas import before child schemas
    const getOrderedImportConfigs = (configs: SheetImportConfig[]) => {
        const configMap = new Map(configs.map((c) => [c.schemaId, c]))
        const visited = new Set<string>()
        const ordered: SheetImportConfig[] = []

        const visit = (config: SheetImportConfig) => {
            if (visited.has(config.sheetName)) return
            visited.add(config.sheetName)

            const schema = availableSchemas.find((s) => s.id === config.schemaId)
            if (schema?.parentSchemaId) {
                const parentConfig = configMap.get(schema.parentSchemaId)
                if (parentConfig) visit(parentConfig)
            }
            ordered.push(config)
        }

        configs.forEach((config) => visit(config))
        return ordered
    }

    const handleBatchSpreadsheetImport = async () => {
        if (!spreadsheetPreview || !spreadsheetFile) return

        const activeConfigs = Object.values(sheetConfigs).filter((c) => c.enabled)
        if (activeConfigs.length === 0) {
            toast.error("Select at least one sheet to import.")
            return
        }

        setIsImporting(true)
        let totalUpserted = 0
        const orderedConfigs = getOrderedImportConfigs(activeConfigs)

        try {
            for (const config of orderedConfigs) {
                const sheet = spreadsheetPreview.sheets.find((s) => s.name === config.sheetName)
                if (!sheet) continue

                const summary = await importSpreadsheetSheet({
                    schemaId: config.schemaId,
                    sheet,
                    mapping: config.mapping,
                    workspaceId,
                })
                totalUpserted += summary.recordsUpserted
            }

            onImportCompleted(`Imported ${totalUpserted} total rows across ${orderedConfigs.length} sheet(s).`)
            handleOpenChange(false)
        } catch (error) {
            console.error("Spreadsheet import failed", error)
            toast.error("Spreadsheet import failed during batch processing.")
        } finally {
            setIsImporting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger render={children} />

            <DialogContent className="flex h-[92vh] w-[96vw] max-w-5xl flex-col overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle>Import workspace files</DialogTitle>
                    <DialogDescription>
                        Import Obsidian archives or spreadsheets with multi-sheet dependency ordering and custom schema mapping.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "vault" | "spreadsheet")} className="flex min-h-0 flex-1 flex-col px-6 pb-6">
                    <TabsList className="grid w-full max-w-xl grid-cols-2">
                        <TabsTrigger value="vault">Vault ZIP</TabsTrigger>
                        <TabsTrigger value="spreadsheet">CSV / XLSX</TabsTrigger>
                    </TabsList>

                    <TabsContent value="vault" className="mt-4 min-h-0 flex-1 overflow-auto">
                        <div className="space-y-4 rounded-2xl border border-dashed p-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <FileUp className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold">Obsidian vault archive</h3>
                                    <p className="text-sm text-muted-foreground">Upload a ZIP archive containing markdown files.</p>
                                </div>
                            </div>

                            <input
                                ref={vaultInputRef}
                                type="file"
                                accept=".zip"
                                className="hidden"
                                onChange={(e) => setVaultFile(e.target.files?.[0] ?? null)}
                            />

                            <div className="space-y-2 rounded-xl border bg-background/60 p-4">
                                <div className="text-sm font-medium">Selected file</div>
                                <div className="text-sm text-muted-foreground">{vaultFile ? vaultFile.name : "No zip selected yet."}</div>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" onClick={() => vaultInputRef.current?.click()}>Choose ZIP</Button>
                                    <Button type="button" onClick={handleVaultImport} disabled={!vaultFile || isImporting}>
                                        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        <span className="ml-2">Import vault</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="spreadsheet" className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="flex flex-1 flex-col gap-4 overflow-auto rounded-2xl border border-dashed p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        <FileUp className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold">Spreadsheet Import</h3>
                                        <p className="text-sm text-muted-foreground">Select sheets to import, assign entity schemas, and verify field mappings.</p>
                                    </div>
                                </div>
                                <Button type="button" variant="outline" onClick={() => spreadsheetInputRef.current?.click()}>
                                    {spreadsheetFile ? "Change file" : "Choose spreadsheet"}
                                </Button>
                            </div>

                            <input
                                ref={spreadsheetInputRef}
                                type="file"
                                accept=".csv,.xlsx"
                                className="hidden"
                                onChange={(e) => handleSpreadsheetFileSelect(e.target.files?.[0] ?? null)}
                            />

                            {dependencyWarnings.length > 0 && (
                                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive space-y-2">
                                    <div className="flex items-center gap-2 font-semibold">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>Dependency Warning</span>
                                    </div>
                                    <ul className="list-disc pl-5 text-xs space-y-1">
                                        {dependencyWarnings.map((warning, idx) => (
                                            <li key={idx}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {spreadsheetPreview && (
                                <div className="flex-1 overflow-auto space-y-4">
                                    <div className="w-full space-y-3">
                                        {spreadsheetPreview.sheets.map((sheet) => {
                                            const config = sheetConfigs[sheet.name]
                                            if (!config) return null

                                            const currentSchema = availableSchemas.find((s) => s.id === config.schemaId) ?? availableSchemas[0]
                                            const availableFields = [...new Set([...SPECIAL_MAPPING_FIELDS, ...(currentSchema?.fields.map((f) => f.name) ?? [])])]
                                            const isExpanded = expandedSheets[sheet.name] ?? true

                                            return (
                                                <div key={sheet.name} className="border rounded-xl px-4 bg-background/60">
                                                    <div className="flex items-center gap-3 py-3">
                                                        <Checkbox
                                                            checked={config.enabled}
                                                            onCheckedChange={(checked) => handleSheetToggle(sheet.name, Boolean(checked))}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSheetExpand(sheet.name)}
                                                            className="flex flex-1 items-center justify-between text-left hover:opacity-80"
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <span className="font-semibold">{sheet.name}</span>
                                                                <span className="text-xs text-muted-foreground">({sheet.headers.length} columns)</span>
                                                            </div>
                                                            <ChevronDown className={`h-4 w-4 transform transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                        </button>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="pt-2 pb-4 space-y-4 border-t">
                                                            <div className="max-w-xs space-y-1">
                                                                <Label className="text-xs">Target Entity Schema</Label>
                                                                <Select value={config.schemaId} onValueChange={(val) => handleSchemaChange(sheet.name, val)}>
                                                                    <SelectTrigger>
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {availableSchemas.map((schema) => (
                                                                            <SelectItem key={schema.id} value={schema.id}>
                                                                                {schema.name || schema.id} {schema.parentSchemaId ? `(Child of ${schema.parentSchemaId})` : ""}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            <div className="space-y-2">
                                                                <Label className="text-xs font-semibold">Column Mappings</Label>
                                                                <div className="grid gap-2">
                                                                    {sheet.headers.map((header) => (
                                                                        <div key={header} className="grid grid-cols-2 gap-4 items-center">
                                                                            <span className="text-xs truncate font-mono bg-muted/50 p-2 rounded">{header}</span>
                                                                            <Select
                                                                                value={config.mapping[header] || "__ignore__"}
                                                                                onValueChange={(val) => handleMappingChange(sheet.name, header, val)}
                                                                            >
                                                                                <SelectTrigger className="h-8 text-xs">
                                                                                    <SelectValue placeholder="Ignore field" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="__ignore__">Ignore field</SelectItem>
                                                                                    {availableFields.map((field) => (
                                                                                        <SelectItem key={field} value={field}>
                                                                                            {field}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {spreadsheetPreview && (
                                <div className="pt-4 border-t flex justify-end">
                                    <Button
                                        type="button"
                                        onClick={handleBatchSpreadsheetImport}
                                        disabled={isImporting || Object.values(sheetConfigs).every((c) => !c.enabled)}
                                    >
                                        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        <span className="ml-2">Import Selected Sheets</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

export { ImportDataModal }