import { useMemo, useRef, useState } from "react"
import { FileUp, Loader2, Upload } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    SPREADSHEET_SPECIAL_FIELDS,
    importSpreadsheetSheet,
    importVaultZip,
    inspectSpreadsheetFile,
    type ParsedSpreadsheetSheet,
    type SpreadsheetImportMapping,
} from "@/lib/export-import"
import { toast } from "sonner"

export interface DocumentSchemaField {
    name: string
    label?: string
    type?: string
}

export interface DocumentSchema {
    id: string
    name: string
    titleField?: string
    fields: DocumentSchemaField[]
}

export interface DocumentSchemaGroup {
    id?: string
    name?: string
    documents: DocumentSchema[]
}

interface ImportDataModalProps {
    children: React.ReactElement
    workspaceId?: string
    schemaGroup?: DocumentSchemaGroup
    schemaId?: string
    onImportCompleted: (summary: string) => void
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

function ImportDataModal({ children, workspaceId = "default", schemaGroup, schemaId: initialSchemaId, onImportCompleted }: ImportDataModalProps) {
    const [open, setOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<"vault" | "spreadsheet">("vault")
    const [vaultFile, setVaultFile] = useState<File | null>(null)
    const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null)
    const [spreadsheetPreview, setSpreadsheetPreview] = useState<{ fileName: string; sheetNames: string[]; sheets: ParsedSpreadsheetSheet[] } | null>(null)
    const [selectedSheetName, setSelectedSheetName] = useState<string>("")
    const [selectedSchemaId, setSelectedSchemaId] = useState<string>(initialSchemaId || schemaGroup?.documents[0]?.id || "general")
    const [columnMapping, setColumnMapping] = useState<SpreadsheetImportMapping>({})
    const [isImporting, setIsImporting] = useState(false)

    const vaultInputRef = useRef<HTMLInputElement | null>(null)
    const spreadsheetInputRef = useRef<HTMLInputElement | null>(null)

    const availableSchemas = useMemo<DocumentSchema[]>(() => {
        if (schemaGroup?.documents && schemaGroup.documents.length > 0) {
            return schemaGroup.documents
        }
        return [{ id: selectedSchemaId, name: selectedSchemaId, titleField: "title", fields: [] }]
    }, [schemaGroup, selectedSchemaId])

    const currentSchema = useMemo<DocumentSchema>(() => {
        return availableSchemas.find((s: DocumentSchema) => s.id === selectedSchemaId) ?? availableSchemas[0]
    }, [availableSchemas, selectedSchemaId])

    const availableFields = useMemo<string[]>(() => {
        const schemaFields = currentSchema?.fields.map((f: DocumentSchemaField) => f.name) ?? []
        return [...new Set([...SPECIAL_MAPPING_FIELDS, ...schemaFields])]
    }, [currentSchema])

    const mappingOptions = useMemo(() => {
        return availableFields.map((field) => ({ value: field, label: field }))
    }, [availableFields])

    const buildColumnMapping = (headers: string[], fields: string[]) => {
        const nextMapping: SpreadsheetImportMapping = {}
        headers.forEach((header) => {
            nextMapping[header] = guessTargetField(header, fields)
        })
        return nextMapping
    }

    const inferSchemaIdFromSheetName = (sheetName: string): string => {
        if (!schemaGroup) return selectedSchemaId
        const canonicalName = canonicalize(sheetName)
        const match = schemaGroup.documents.find(
            (doc: DocumentSchema) => canonicalize(doc.name) === canonicalName || canonicalize(doc.id) === canonicalName
        )
        return match?.id || selectedSchemaId
    }

    const selectedSheet = useMemo(() => {
        if (!spreadsheetPreview) return null
        return spreadsheetPreview.sheets.find((sheet) => sheet.name === selectedSheetName) ?? spreadsheetPreview.sheets[0] ?? null
    }, [selectedSheetName, spreadsheetPreview])

    const resetState = () => {
        setVaultFile(null)
        setSpreadsheetFile(null)
        setSpreadsheetPreview(null)
        setSelectedSheetName("")
        setSelectedSchemaId(initialSchemaId || schemaGroup?.documents[0]?.id || "general")
        setColumnMapping({})
    }

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen)
        if (!nextOpen) {
            resetState()
            setActiveTab("vault")
        }
    }

    const handleVaultPick = async () => {
        vaultInputRef.current?.click()
    }

    const handleSpreadsheetPick = async () => {
        spreadsheetInputRef.current?.click()
    }

    const handleVaultImport = async () => {
        if (!vaultFile) {
            toast.error("Choose a zip archive before importing.")
            return
        }

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

    const handleSpreadsheetImport = async () => {
        if (!selectedSheet || !spreadsheetFile) {
            toast.error("Choose a spreadsheet file first.")
            return
        }

        setIsImporting(true)
        try {
            const summary = await importSpreadsheetSheet({
                schemaId: selectedSchemaId,
                sheet: selectedSheet,
                mapping: columnMapping,
                workspaceId,
            })
            onImportCompleted(`Imported ${summary.recordsUpserted} rows from ${selectedSheet.name}.`)
            handleOpenChange(false)
        } catch (error) {
            console.error("Spreadsheet import failed", error)
            toast.error("Spreadsheet import failed.")
        } finally {
            setIsImporting(false)
        }
    }

    const selectedSchemaLabel = currentSchema?.name || selectedSchemaId

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger render={children} />

            <DialogContent className="flex h-[92vh] w-[96vw] max-w-5xl flex-col overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle>Import workspace files</DialogTitle>
                    <DialogDescription>
                        Bring data in from Obsidian vault archives or spreadsheet files, then map the columns that need manual review.
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
                                    <p className="text-sm text-muted-foreground">Upload a zip archive containing markdown files.</p>
                                </div>
                            </div>

                            <input
                                ref={vaultInputRef}
                                type="file"
                                accept=".zip"
                                className="hidden"
                                onChange={(event) => setVaultFile(event.target.files?.[0] ?? null)}
                            />

                            <div className="space-y-2 rounded-xl border bg-background/60 p-4">
                                <div className="text-sm font-medium">Selected file</div>
                                <div className="text-sm text-muted-foreground">{vaultFile ? vaultFile.name : "No zip selected yet."}</div>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" onClick={handleVaultPick}>Choose ZIP</Button>
                                    <Button type="button" onClick={handleVaultImport} disabled={!vaultFile || isImporting}>
                                        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        <span className="ml-2">Import vault</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="spreadsheet" className="mt-4 min-h-0 flex-1 overflow-auto">
                        <div className="space-y-4 rounded-2xl border border-dashed p-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <FileUp className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold">Spreadsheet import</h3>
                                    <p className="text-sm text-muted-foreground">Upload a CSV or XLSX file, pick a sheet, and map the columns into {selectedSchemaLabel} fields.</p>
                                </div>
                            </div>

                            <input
                                ref={spreadsheetInputRef}
                                type="file"
                                accept=".csv,.xlsx"
                                className="hidden"
                                onChange={async (event) => {
                                    const file = event.target.files?.[0] ?? null
                                    setSpreadsheetFile(file)
                                    if (!file) {
                                        setSpreadsheetPreview(null)
                                        return
                                    }

                                    const preview = await inspectSpreadsheetFile(file)
                                    setSpreadsheetPreview(preview)
                                    const firstSheet = preview.sheets[0]
                                    const sheetName = preview.sheetNames[0] ?? ""
                                    const nextSchemaId = firstSheet ? inferSchemaIdFromSheetName(firstSheet.name) : selectedSchemaId
                                    setSelectedSchemaId(nextSchemaId)
                                    setSelectedSheetName(sheetName)
                                    if (firstSheet) {
                                        const schemaObj = availableSchemas.find((s: DocumentSchema) => s.id === nextSchemaId) ?? availableSchemas[0]
                                        const fields = [...new Set([...SPECIAL_MAPPING_FIELDS, ...(schemaObj?.fields.map((f: DocumentSchemaField) => f.name) ?? [])])]
                                        setColumnMapping(buildColumnMapping(firstSheet.headers, fields))
                                    }
                                }}
                            />

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2 rounded-xl border bg-background/60 p-4">
                                    <div className="text-sm font-medium">File</div>
                                    <div className="text-sm text-muted-foreground">{spreadsheetFile ? spreadsheetFile.name : "No spreadsheet selected yet."}</div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" onClick={handleSpreadsheetPick}>Choose spreadsheet</Button>
                                    </div>
                                </div>

                                <div className="space-y-2 rounded-xl border bg-background/60 p-4">
                                    <Label htmlFor="sheet-select">Sheet</Label>
                                    <Select
                                        value={selectedSheetName}
                                        onValueChange={(value) => {
                                            const nextSheetName = value ?? ""
                                            setSelectedSheetName(nextSheetName)
                                            const nextSheet = spreadsheetPreview?.sheets.find((sheet) => sheet.name === nextSheetName)
                                            const nextSchemaId = inferSchemaIdFromSheetName(nextSheetName)
                                            setSelectedSchemaId(nextSchemaId)
                                            const schemaObj = availableSchemas.find((s: DocumentSchema) => s.id === nextSchemaId) ?? availableSchemas[0]
                                            const fields = [...new Set([...SPECIAL_MAPPING_FIELDS, ...(schemaObj?.fields.map((f: DocumentSchemaField) => f.name) ?? [])])]
                                            setColumnMapping(buildColumnMapping(nextSheet?.headers ?? [], fields))
                                        }}
                                        disabled={!spreadsheetPreview}
                                    >
                                        <SelectTrigger id="sheet-select">
                                            <SelectValue placeholder="Choose a sheet" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {spreadsheetPreview?.sheetNames.map((sheetName) => (
                                                <SelectItem key={sheetName} value={sheetName}>
                                                    {sheetName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Label htmlFor="schema-select">Schema / Target Entity</Label>
                                    <Select
                                        value={selectedSchemaId}
                                        onValueChange={(value) => {
                                            const nextSchemaId = value ?? "general"
                                            setSelectedSchemaId(nextSchemaId)
                                            if (!selectedSheet) return
                                            const schemaObj = availableSchemas.find((s: DocumentSchema) => s.id === nextSchemaId) ?? availableSchemas[0]
                                            const fields = [...new Set([...SPECIAL_MAPPING_FIELDS, ...(schemaObj?.fields.map((f: DocumentSchemaField) => f.name) ?? [])])]
                                            setColumnMapping(buildColumnMapping(selectedSheet.headers, fields))
                                        }}
                                    >
                                        <SelectTrigger id="schema-select">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableSchemas.map((schema: DocumentSchema) => (
                                                <SelectItem key={schema.id} value={schema.id}>
                                                    {schema.name || schema.id}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {selectedSheet ? (
                                <div className="space-y-3 rounded-xl border bg-background/60 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium">Column mapping</div>
                                            <div className="text-sm text-muted-foreground">Map each input column to a database field or ignore it.</div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{selectedSheet.headers.length} columns detected</div>
                                    </div>

                                    <div className="grid gap-3">
                                        {selectedSheet.headers.map((header) => (
                                            <div key={header} className="grid gap-2 md:grid-cols-[1fr_1.2fr] md:items-center">
                                                <div className="rounded-lg border px-3 py-2 text-sm">
                                                    <div className="font-medium">{header}</div>
                                                </div>
                                                <Select
                                                    value={columnMapping[header] ?? ""}
                                                    onValueChange={(value) =>
                                                        setColumnMapping((current: SpreadsheetImportMapping) => ({
                                                            ...current,
                                                            [header]: value ?? "",
                                                        }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Ignore column" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="">Ignore column</SelectItem>
                                                        {mappingOptions.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" onClick={handleSpreadsheetImport} disabled={!selectedSheet || !spreadsheetFile || isImporting}>
                                            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                            <span className="ml-2">Import sheet</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

export { ImportDataModal }