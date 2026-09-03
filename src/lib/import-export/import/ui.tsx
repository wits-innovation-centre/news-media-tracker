import { useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, ChevronDown, FileUp, FolderPlus, Loader2, Plus, Settings, Sparkles, Upload } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
} from "@/lib/import-export/fn"
import {
    DATA_TO_INPUT,
    type DocumentSchema,
    type DocumentSchemaGroup,
    type FieldDefinition,
    type FieldDataType,
    type FieldInputType,
    type SpecificationDefinition,
} from "@/lib/types"
import { toast } from "sonner"
import { getActiveWorkspaceId } from "@/lib/db/utils"

interface CustomSchemaFieldConfig {
    header: string
    ignored: boolean
    name: string
    label: string
    dataType: FieldDataType
    inputType: FieldInputType
    required: boolean
    description: string
    optionsText: string
    specification?: string
    tooltipKind: "help" | "warn" | "info"
    tooltipMessage: string
    tooltipUseIcon: boolean
}

interface SheetImportConfig {
    sheetName: string
    enabled: boolean
    schemaId: string
    mapping: SpreadsheetImportMapping
    isNewSchema?: boolean
    schemaName?: string
    groupId?: string
    customFields?: Record<string, CustomSchemaFieldConfig>
}

interface ImportDataViewProps {
    workspaceId?: string
    initialSchemaId?: string
    schemaGroup?: DocumentSchemaGroup
    groups?: DocumentSchemaGroup[]
    specificationRegistry?: SpecificationDefinition[]
    onImportCompleted: (summary: string) => void
    onRequestCreateSchema: (sheetName: string) => void
    onCreateSchema?: (schema: DocumentSchema) => void
    onCreateGroup?: (group: DocumentSchemaGroup) => void
    onCloseModal: () => void
}

const SPECIAL_MAPPING_FIELDS = [...SPREADSHEET_SPECIAL_FIELDS]
const DATA_TYPES: FieldDataType[] = ["string", "array", "hierarchical-select", "select", "number", "boolean", "date", "date-range", "markdown", "form"]

const canonicalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")

const sanitizeFieldKey = (header: string) => {
    return header.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "field"
}

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

function ImportDataView({
    workspaceId = getActiveWorkspaceId(),
    initialSchemaId,
    schemaGroup,
    groups: passedGroups = [],
    specificationRegistry = [],
    onImportCompleted,
    onRequestCreateSchema,
    onCreateSchema,
    onCreateGroup,
    onCloseModal,
}: ImportDataViewProps) {
    const [activeTab, setActiveTab] = useState<"vault" | "spreadsheet">("vault")
    const [vaultFile, setVaultFile] = useState<File | null>(null)
    const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null)
    const [spreadsheetPreview, setSpreadsheetPreview] = useState<{ fileName: string; sheetNames: string[]; sheets: ParsedSpreadsheetSheet[] } | null>(null)
    const [expandedSheets, setExpandedSheets] = useState<Record<string, boolean>>({})

    const [localGroups, setLocalGroups] = useState<DocumentSchemaGroup[]>([])

    const [sheetConfigs, setSheetConfigs] = useState<Record<string, SheetImportConfig>>({})
    const [isImporting, setIsImporting] = useState(false)

    const [expandedNewSchemaFields, setExpandedNewSchemaFields] = useState<Record<string, boolean>>({})

    const [newSchemaModalSheet, setNewSchemaModalSheet] = useState<string | null>(null)
    const [newSchemaName, setNewSchemaName] = useState("")
    const [selectedGroupIdForNewSchema, setSelectedGroupIdForNewSchema] = useState<string>("")
    const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
    const [newGroupName, setNewGroupName] = useState("")
    const [newGroupDescription, setNewGroupDescription] = useState("")

    const vaultInputRef = useRef<HTMLInputElement | null>(null)
    const spreadsheetInputRef = useRef<HTMLInputElement | null>(null)

    const allGroups = useMemo<DocumentSchemaGroup[]>(() => {
        const combined = [...passedGroups, ...localGroups]
        if (combined.length > 0) return combined
        if (schemaGroup) return [schemaGroup]
        return []
    }, [passedGroups, localGroups, schemaGroup])

    const availableSchemas = useMemo<DocumentSchema[]>(() => {
        const schemas: DocumentSchema[] = []
        allGroups.forEach((g) => schemas.push(...g.documents))

        Object.values(sheetConfigs).forEach((config) => {
            if (config.isNewSchema && !schemas.some((s) => s.id === config.schemaId)) {
                schemas.push({
                    id: config.schemaId,
                    name: config.schemaName || config.sheetName,
                    groupId: config.groupId,
                    titleField: "title",
                    fields: [],
                })
            }
        })

        if (schemas.length > 0) return schemas
        return [{ id: initialSchemaId || "general", name: initialSchemaId || "general", titleField: "title", fields: [] }]
    }, [allGroups, sheetConfigs, initialSchemaId])

    const inferSchemaIdFromSheetName = (sheetName: string): string => {
        const canonicalName = canonicalize(sheetName)
        const match = availableSchemas.find(
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

    const dependencyWarnings = useMemo(() => {
        const warnings: string[] = []
        const activeSchemaIds = new Set(
            Object.values(sheetConfigs)
                .filter((config) => config.enabled)
                .map((config) => config.schemaId)
        )

        Object.values(sheetConfigs).forEach((config) => {
            if (!config.enabled || config.isNewSchema) return
            const schema = availableSchemas.find((s) => s.id === config.schemaId)
            if (!schema?.parentSchemaId) return

            const parentSchema = availableSchemas.find((s) => s.id === schema.parentSchemaId)
            if (parentSchema && !activeSchemaIds.has(parentSchema.id)) {
                warnings.push(`Sheet "${config.sheetName}" (${schema.name}) depends on parent entity "${parentSchema.name}", which is not selected for import.`)
            }
        })

        return warnings
    }, [sheetConfigs, availableSchemas])

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

        if (schemaId === "__create_new__") {
            onRequestCreateSchema(sheetName)
            return
        }

        const sheet = spreadsheetPreview?.sheets.find((s) => s.name === sheetName)
        if (!sheet) return

        setSheetConfigs((prev) => ({
            ...prev,
            [sheetName]: {
                ...prev[sheetName],
                schemaId,
                isNewSchema: false,
                mapping: buildColumnMapping(sheet.headers, schemaId),
            },
        }))
    }

    const handleConfirmCreateNewSchema = () => {
        if (!newSchemaModalSheet || !spreadsheetPreview) return
        const sheet = spreadsheetPreview.sheets.find((s) => s.name === newSchemaModalSheet)
        if (!sheet) return

        let targetGroupId = selectedGroupIdForNewSchema

        if (isCreatingNewGroup) {
            if (!newGroupName.trim()) {
                toast.error("Please enter a schema group name.")
                return
            }

            const newGroup: DocumentSchemaGroup = {
                id: `group-${Date.now()}`,
                name: newGroupName.trim(),
                description: newGroupDescription.trim() || undefined,
                documents: [],
            }

            if (onCreateGroup) {
                onCreateGroup(newGroup)
            }
            setLocalGroups((prev) => [...prev, newGroup])
            targetGroupId = newGroup.id
        }

        const newSchemaId = `schema-${Date.now()}`
        const initialCustomFields: Record<string, CustomSchemaFieldConfig> = {}

        sheet.headers.forEach((header) => {
            initialCustomFields[header] = {
                header,
                ignored: false,
                name: sanitizeFieldKey(header),
                label: header,
                dataType: "string",
                inputType: "text",
                required: false,
                description: "",
                optionsText: "",
                tooltipKind: "info",
                tooltipMessage: "",
                tooltipUseIcon: true,
            }
        })

        setSheetConfigs((prev) => ({
            ...prev,
            [newSchemaModalSheet]: {
                ...prev[newSchemaModalSheet],
                schemaId: newSchemaId,
                isNewSchema: true,
                schemaName: newSchemaName.trim() || newSchemaModalSheet,
                groupId: targetGroupId,
                customFields: initialCustomFields,
            },
        }))

        setNewSchemaModalSheet(null)
        toast.success(`Configured new schema for sheet "${newSchemaModalSheet}".`)
    }

    const updateCustomField = (sheetName: string, header: string, updates: Partial<CustomSchemaFieldConfig>) => {
        setSheetConfigs((prev) => {
            const config = prev[sheetName]
            if (!config || !config.customFields) return prev

            const currentField = config.customFields[header]
            if (!currentField) return prev

            return {
                ...prev,
                [sheetName]: {
                    ...config,
                    customFields: {
                        ...config.customFields,
                        [header]: {
                            ...currentField,
                            ...updates,
                        },
                    },
                },
            }
        })
    }

    const toggleNewSchemaFieldExpand = (sheetName: string, header: string) => {
        const key = `${sheetName}-${header}`
        setExpandedNewSchemaFields((prev) => ({
            ...prev,
            [key]: !prev[key],
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
            onCloseModal()
        } catch (error) {
            console.error("Vault import failed", error)
            toast.error("Vault import failed.")
        } finally {
            setIsImporting(false)
        }
    }

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

                let targetSchemaId = config.schemaId
                let mapping = config.mapping

                if (config.isNewSchema && config.customFields) {
                    const activeFields = Object.values(config.customFields).filter((f) => !f.ignored)

                    const generatedSchema: DocumentSchema = {
                        id: config.schemaId,
                        name: config.schemaName || config.sheetName,
                        groupId: config.groupId,
                        titleField: activeFields[0]?.name || "title",
                        fields: activeFields.map((f) => {
                            let parsedOptions: any = undefined
                            if (f.optionsText.trim()) {
                                const trimmed = f.optionsText.trim()
                                if (trimmed.startsWith("[")) {
                                    try {
                                        parsedOptions = JSON.parse(trimmed)
                                    } catch (_) {
                                        parsedOptions = trimmed.split("\n").map((s) => s.trim()).filter(Boolean)
                                    }
                                } else {
                                    parsedOptions = trimmed.split("\n").map((s) => s.trim()).filter(Boolean)
                                }
                            }

                            return {
                                name: f.name.trim() || f.header,
                                label: f.label.trim() || f.header,
                                type: { data: f.dataType, input: f.inputType },
                                required: f.required,
                                description: f.description.trim() || undefined,
                                options: parsedOptions,
                                specification: f.specification || undefined,
                                tooltip: f.tooltipMessage.trim()
                                    ? {
                                        kind: f.tooltipKind,
                                        useIcon: f.tooltipUseIcon,
                                        message: f.tooltipMessage.trim(),
                                    }
                                    : undefined,
                            } as FieldDefinition
                        }),
                    }

                    if (onCreateSchema) {
                        onCreateSchema(generatedSchema)
                    }

                    const dynamicMapping: SpreadsheetImportMapping = {}
                    sheet.headers.forEach((header) => {
                        const custom = config.customFields?.[header]
                        if (custom && !custom.ignored) {
                            dynamicMapping[header] = custom.name.trim() || custom.header
                        } else {
                            dynamicMapping[header] = ""
                        }
                    })
                    mapping = dynamicMapping
                }

                const summary = await importSpreadsheetSheet({
                    schemaId: targetSchemaId,
                    sheet,
                    mapping,
                    workspaceId,
                })
                totalUpserted += summary.recordsUpserted
            }

            onImportCompleted(`Imported ${totalUpserted} total rows across ${orderedConfigs.length} sheet(s).`)
            onCloseModal()
        } catch (error) {
            console.error("Spreadsheet import failed", error)
            toast.error("Spreadsheet import failed during batch processing.")
        } finally {
            setIsImporting(false)
        }
    }

    return (
        <div className="flex flex-1 flex-col overflow-hidden p-6">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "vault" | "spreadsheet")} className="flex min-h-0 flex-1 flex-col pb-6">
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
                                        const isNewSchema = Boolean(config.isNewSchema)

                                        const assignedGroup = allGroups.find((g) => g.id === config.groupId)

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
                                                                    <SelectItem value="__create_new__" className="font-semibold text-primary">
                                                                        + Create New Schema
                                                                    </SelectItem>
                                                                    {availableSchemas.map((schema) => (
                                                                        <SelectItem key={schema.id} value={schema.id}>
                                                                            {schema.name || schema.id} {schema.parentSchemaId ? `(Child of ${schema.parentSchemaId})` : ""}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        {isNewSchema ? (
                                                            <div className="space-y-3">
                                                                <div className="rounded-lg border bg-primary/5 p-3 flex items-center justify-between">
                                                                    <div className="flex items-center gap-2 text-xs">
                                                                        <Sparkles className="h-4 w-4 text-primary" />
                                                                        <span>
                                                                            New Schema: <strong className="font-semibold">{config.schemaName}</strong>
                                                                            {assignedGroup ? ` (Group: ${assignedGroup.name})` : ""}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-[11px] text-muted-foreground">
                                                                        Configure schema field options below or ignore unmatched columns.
                                                                    </span>
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <Label className="text-xs font-semibold">Column Configurations</Label>
                                                                    <div className="grid gap-2">
                                                                        {sheet.headers.map((header) => {
                                                                            const fieldCfg = config.customFields?.[header]
                                                                            if (!fieldCfg) return null

                                                                            const fieldKey = `${sheet.name}-${header}`
                                                                            const isOptionsExpanded = expandedNewSchemaFields[fieldKey] ?? false
                                                                            const isIgnored = fieldCfg.ignored
                                                                            const allowedInputs = DATA_TO_INPUT[fieldCfg.dataType] || []

                                                                            return (
                                                                                <div
                                                                                    key={header}
                                                                                    className={`rounded-xl border p-3 transition-colors ${isIgnored ? "bg-muted/30 border-dashed opacity-60" : "bg-card"
                                                                                        }`}
                                                                                >
                                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                        <div className="flex items-center gap-2 flex-1 min-w-55">
                                                                                            <span className="text-xs font-mono font-semibold bg-muted px-2 py-1 rounded text-muted-foreground truncate max-w-37.5">
                                                                                                {header}
                                                                                            </span>
                                                                                            <span className="text-xs text-muted-foreground">➔</span>
                                                                                            {!isIgnored ? (
                                                                                                <Input
                                                                                                    value={fieldCfg.label}
                                                                                                    onChange={(e) =>
                                                                                                        updateCustomField(sheet.name, header, {
                                                                                                            label: e.target.value,
                                                                                                            name: sanitizeFieldKey(e.target.value),
                                                                                                        })
                                                                                                    }
                                                                                                    placeholder="Field Label"
                                                                                                    className="h-8 text-xs font-medium max-w-xs"
                                                                                                />
                                                                                            ) : (
                                                                                                <span className="text-xs italic text-muted-foreground">
                                                                                                    Unmatched / Ignored
                                                                                                </span>
                                                                                            )}
                                                                                        </div>

                                                                                        <div className="flex items-center gap-3">
                                                                                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                                                                                                <Checkbox
                                                                                                    checked={isIgnored}
                                                                                                    onCheckedChange={(checked) =>
                                                                                                        updateCustomField(sheet.name, header, {
                                                                                                            ignored: Boolean(checked),
                                                                                                        })
                                                                                                    }
                                                                                                />
                                                                                                <span>Ignore column</span>
                                                                                            </label>

                                                                                            {!isIgnored && (
                                                                                                <Button
                                                                                                    type="button"
                                                                                                    variant="outline"
                                                                                                    size="sm"
                                                                                                    className="h-8 px-2 text-xs flex items-center gap-1"
                                                                                                    onClick={() => toggleNewSchemaFieldExpand(sheet.name, header)}
                                                                                                >
                                                                                                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                                                                                                    <span>Options</span>
                                                                                                    <ChevronDown
                                                                                                        className={`h-3.5 w-3.5 transform transition-transform ${isOptionsExpanded ? "rotate-180" : ""
                                                                                                            }`}
                                                                                                    />
                                                                                                </Button>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>

                                                                                    {!isIgnored && isOptionsExpanded && (
                                                                                        <div className="mt-3 pt-3 border-t space-y-3 bg-muted/20 p-3 rounded-lg text-xs">
                                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                                                <div className="space-y-1">
                                                                                                    <Label className="text-xs text-muted-foreground">Field Key</Label>
                                                                                                    <Input
                                                                                                        value={fieldCfg.name}
                                                                                                        onChange={(e) => updateCustomField(sheet.name, header, { name: e.target.value })}
                                                                                                        placeholder="field_key"
                                                                                                        className="h-8 text-xs font-mono"
                                                                                                    />
                                                                                                </div>
                                                                                                <div className="space-y-1">
                                                                                                    <Label className="text-xs text-muted-foreground">Description</Label>
                                                                                                    <Input
                                                                                                        value={fieldCfg.description}
                                                                                                        onChange={(e) => updateCustomField(sheet.name, header, { description: e.target.value })}
                                                                                                        placeholder="Field usage description"
                                                                                                        className="h-8 text-xs"
                                                                                                    />
                                                                                                </div>
                                                                                            </div>

                                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                                                <div className="space-y-1">
                                                                                                    <Label className="text-xs text-muted-foreground">Data Type</Label>
                                                                                                    <Select
                                                                                                        value={fieldCfg.dataType}
                                                                                                        onValueChange={(val) => {
                                                                                                            const newDataType = val as FieldDataType
                                                                                                            const validInputs = DATA_TO_INPUT[newDataType] || []
                                                                                                            const nextInput = validInputs.includes(fieldCfg.inputType)
                                                                                                                ? fieldCfg.inputType
                                                                                                                : validInputs[0] ?? "text"

                                                                                                            updateCustomField(sheet.name, header, {
                                                                                                                dataType: newDataType,
                                                                                                                inputType: nextInput,
                                                                                                            })
                                                                                                        }}
                                                                                                    >
                                                                                                        <SelectTrigger className="h-8 text-xs">
                                                                                                            <SelectValue />
                                                                                                        </SelectTrigger>
                                                                                                        <SelectContent>
                                                                                                            {DATA_TYPES.map((type) => (
                                                                                                                <SelectItem key={type} value={type} className="text-xs">
                                                                                                                    {type}
                                                                                                                </SelectItem>
                                                                                                            ))}
                                                                                                        </SelectContent>
                                                                                                    </Select>
                                                                                                </div>
                                                                                                <div className="space-y-1">
                                                                                                    <Label className="text-xs text-muted-foreground">Input Component</Label>
                                                                                                    <Select
                                                                                                        value={fieldCfg.inputType}
                                                                                                        onValueChange={(val) => updateCustomField(sheet.name, header, { inputType: val as FieldInputType })}
                                                                                                    >
                                                                                                        <SelectTrigger className="h-8 text-xs">
                                                                                                            <SelectValue />
                                                                                                        </SelectTrigger>
                                                                                                        <SelectContent>
                                                                                                            {allowedInputs.map((type) => (
                                                                                                                <SelectItem key={type} value={type} className="text-xs">
                                                                                                                    {type}
                                                                                                                </SelectItem>
                                                                                                            ))}
                                                                                                        </SelectContent>
                                                                                                    </Select>
                                                                                                </div>
                                                                                            </div>

                                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                                                <div className="space-y-1">
                                                                                                    <Label className="text-xs text-muted-foreground">Options (one per line or JSON)</Label>
                                                                                                    <Textarea
                                                                                                        value={fieldCfg.optionsText}
                                                                                                        onChange={(e) => updateCustomField(sheet.name, header, { optionsText: e.target.value })}
                                                                                                        placeholder="Option 1&#10;Option 2"
                                                                                                        className="min-h-16 text-xs"
                                                                                                    />
                                                                                                </div>

                                                                                                <div className="space-y-2">
                                                                                                    {fieldCfg.inputType === "search-select-input" && specificationRegistry.length > 0 && (
                                                                                                        <div className="space-y-1">
                                                                                                            <Label className="text-xs text-muted-foreground">Specification Source</Label>
                                                                                                            <Select
                                                                                                                value={fieldCfg.specification || "__none__"}
                                                                                                                onValueChange={(val) =>
                                                                                                                    updateCustomField(sheet.name, header, {
                                                                                                                        specification: val === "__none__" || !val ? undefined : val,
                                                                                                                    })
                                                                                                                }
                                                                                                            >
                                                                                                                <SelectTrigger className="h-8 text-xs">
                                                                                                                    <SelectValue placeholder="Select specification" />
                                                                                                                </SelectTrigger>
                                                                                                                <SelectContent>
                                                                                                                    <SelectItem value="__none__" className="text-xs">
                                                                                                                        None
                                                                                                                    </SelectItem>
                                                                                                                    {specificationRegistry.map((spec) => (
                                                                                                                        <SelectItem key={spec.id} value={spec.id} className="text-xs">
                                                                                                                            {spec.name}
                                                                                                                        </SelectItem>
                                                                                                                    ))}
                                                                                                                </SelectContent>
                                                                                                            </Select>
                                                                                                        </div>
                                                                                                    )}

                                                                                                    <div className="space-y-1">
                                                                                                        <Label className="text-xs text-muted-foreground">Tooltip Message</Label>
                                                                                                        <Input
                                                                                                            value={fieldCfg.tooltipMessage}
                                                                                                            onChange={(e) => updateCustomField(sheet.name, header, { tooltipMessage: e.target.value })}
                                                                                                            placeholder="Help message"
                                                                                                            className="h-8 text-xs"
                                                                                                        />
                                                                                                    </div>

                                                                                                    <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1 cursor-pointer">
                                                                                                        <Checkbox
                                                                                                            checked={fieldCfg.required}
                                                                                                            onCheckedChange={(checked) =>
                                                                                                                updateCustomField(sheet.name, header, {
                                                                                                                    required: Boolean(checked),
                                                                                                                })
                                                                                                            }
                                                                                                        />
                                                                                                        <span>Required field</span>
                                                                                                    </label>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
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
                                                        )}
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

            <Dialog open={Boolean(newSchemaModalSheet)} onOpenChange={(o) => !o && setNewSchemaModalSheet(null)}>
                <DialogContent className="max-w-md space-y-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" />
                            Create New Schema
                        </DialogTitle>
                        <DialogDescription>
                            Configure a new schema for sheet <strong>"{newSchemaModalSheet}"</strong> and assign it to a group.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 text-xs">
                        <div className="space-y-1">
                            <Label className="text-xs">Schema Name</Label>
                            <Input value={newSchemaName} onChange={(e) => setNewSchemaName(e.target.value)} placeholder="Schema Name" />
                        </div>

                        <div className="space-y-2 border-t pt-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold">Schema Group Assignment</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px] text-primary"
                                    onClick={() => setIsCreatingNewGroup((prev) => !prev)}
                                >
                                    {isCreatingNewGroup ? "Select Existing Group" : "+ New Schema Group"}
                                </Button>
                            </div>

                            {isCreatingNewGroup ? (
                                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                    <div className="flex items-center gap-2 font-medium text-xs text-primary">
                                        <FolderPlus className="h-4 w-4" />
                                        <span>Create New Schema Group</span>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Group Name</Label>
                                        <Input
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            placeholder="e.g. Incident Reports"
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Group Description (optional)</Label>
                                        <Textarea
                                            value={newGroupDescription}
                                            onChange={(e) => setNewGroupDescription(e.target.value)}
                                            placeholder="Description of this schema group"
                                            className="min-h-16 text-xs"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <Select value={selectedGroupIdForNewSchema} onValueChange={(val) => setSelectedGroupIdForNewSchema(val ?? "")}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Schema Group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allGroups.map((group) => (
                                            <SelectItem key={group.id} value={group.id}>
                                                {group.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => setNewSchemaModalSheet(null)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleConfirmCreateNewSchema}>
                            Configure Schema
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export { ImportDataView }