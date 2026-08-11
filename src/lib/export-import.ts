import JSZip from "jszip"
import * as XLSX from "xlsx"
import YAML from "yaml"

import { dbClient } from "@/lib/db/client"
import type {
    DocumentSchemaGroup,
    SpecificationDefinition,
    SpecificationStore,
    StoredDocument,
} from "@/lib/types"

// ==========================================
// CONSTANTS & TYPES
// ==========================================

export const SPECIFICATION_SHEET_NAME = "__SPECIFICATIONS__"

export const SYSTEM_FIELDS = [
    "id",
    "title",
    "parent_id",
    "body",
    "workspace_id",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
    "is_deleted",
] as const

export type WorkspaceEntityKey = "event" | "article" | "participant"

export type SpreadsheetImportMapping = Record<string, string>

export const SPREADSHEET_SPECIAL_FIELDS = ["parent_id", "notes"] as const

export const ENTITY_CONFIG: Record<WorkspaceEntityKey, { sheetName: string; columns: string[] }> = {
    event: {
        sheetName: "Events",
        columns: ["title", "date", "location", "notes", "parent_id"],
    },
    article: {
        sheetName: "Articles",
        columns: ["title", "author", "publication", "notes", "parent_id"],
    },
    participant: {
        sheetName: "Participants",
        columns: ["title", "role", "organization", "email", "notes", "parent_id"],
    },
}

export interface ParsedSpreadsheetSheet {
    name: string
    headers: string[]
    rows: Record<string, string>[]
}

export interface SpreadsheetInspectionResult {
    fileName: string
    sheetNames: string[]
    sheets: ParsedSpreadsheetSheet[]
    hasSpecificationSheet: boolean
    specifications: SpecificationStore
}

export interface SchemaGroupMatchResult {
    matchedGroup: DocumentSchemaGroup | null
    confidence: number // 0 to 1
    scoreDetails: Array<{
        groupId: string
        groupName: string
        confidence: number
        matchedSheets: string[]
        missingSheets: string[]
        fieldMatchRatio: number
    }>
    inferredSchemaGroup: DocumentSchemaGroup
    schemaGroupDiffs: Record<string, {
        missingFields: Record<string, string[]>
        extraHeaders: Record<string, string[]>
    }>
}

export interface ExcelExportOptions {
    workspaceId?: string
    schemaGroup: DocumentSchemaGroup
    specifications?: SpecificationStore
}

export interface ExcelImportOptions {
    workspaceId?: string
    schemaGroup: DocumentSchemaGroup
    inspection: SpreadsheetInspectionResult
}

export interface ObsidianExportOptions {
    includeTutorial?: boolean
    workspaceId?: string
    workspaceName?: string
    schemaGroups?: DocumentSchemaGroup[]
    specificationRegistry?: SpecificationDefinition[]
    specifications?: SpecificationStore
}

export interface VaultImportSummary {
    filesProcessed: number
    recordsUpserted: number
    relationshipsResolved: number
}

export interface SpreadsheetImportSummary {
    rowsProcessed: number
    recordsUpserted: number
    specificationsImported: number
}

export interface ImportSpreadsheetSheetOptions {
    entityKey: WorkspaceEntityKey
    sheet: ParsedSpreadsheetSheet
    mapping: SpreadsheetImportMapping
    workspaceId?: string
}

// ==========================================
// UTILITY HELPERS
// ==========================================

const canonicalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const safeSheetName = (name: string): string => {
    const cleaned = name.replace(/[:\\/?*\[\]]/g, "_").trim()
    return cleaned.slice(0, 31) || "Sheet"
}

const splitFrontmatter = (markdown: string) => {
    const trimmed = markdown.replace(/^\uFEFF/, "")
    if (!trimmed.startsWith("---")) {
        return { frontmatter: {}, body: markdown.trimStart() }
    }

    const newlineIndex = trimmed.indexOf("\n")
    if (newlineIndex < 0) return { frontmatter: {}, body: markdown }

    const remainder = trimmed.slice(newlineIndex + 1)
    const closingIndex = remainder.indexOf("\n---")
    if (closingIndex < 0) return { frontmatter: {}, body: markdown }

    const frontmatterSource = remainder.slice(0, closingIndex)
    const body = remainder.slice(closingIndex + 4).replace(/^\r?\n/, "")

    try {
        const parsed = YAML.parse(frontmatterSource)
        return { frontmatter: isPlainObject(parsed) ? parsed : {}, body }
    } catch {
        return { frontmatter: {}, body }
    }
}

export const extractWikiLinkTargets = (value: unknown): string[] => {
    const tokens = new Set<string>()

    const visit = (input: unknown) => {
        if (typeof input === "string") {
            const matches = input.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) ?? []
            matches.forEach((match) => {
                const inner = match.slice(2, -2)
                const [target] = inner.split("|")
                if (target?.trim()) tokens.add(target.trim())
            })
            return
        }
        if (Array.isArray(input)) input.forEach(visit)
    }

    visit(value)
    return [...tokens]
}

export const buildWikiLink = (value: string) => `[[${value.replace(/\]\]/g, "").trim()}]]`

export function inferEntityKeyFromSheetName(sheetName: string): WorkspaceEntityKey | null {
    const normalized = sheetName.toLowerCase().trim()
    if (normalized.includes("event")) return "event"
    if (normalized.includes("article")) return "article"
    if (normalized.includes("participant")) return "participant"
    return null
}

const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

// ==========================================
// EXCEL UTILITIES (GENERIC & SCHEMA-DRIVEN)
// ==========================================

export async function exportWorkspaceToExcel(
    documents: StoredDocument[],
    options: ExcelExportOptions,
    fileName = `workspace_export_${Date.now()}.xlsx`
) {
    const workbook = XLSX.utils.book_new()
    const { schemaGroup, specifications = {} } = options

    const docsBySchema = new Map<string, StoredDocument[]>()
    documents.forEach((doc) => {
        const list = docsBySchema.get(doc.schema_id) ?? []
        list.push(doc)
        docsBySchema.set(doc.schema_id, list)
    })

    const specKeys = Object.keys(specifications)
    const specColumnRanges: Record<string, { colIndex: number; maxRow: number }> = {}

    if (specKeys.length > 0) {
        const maxRows = Math.max(...specKeys.map((k) => specifications[k]?.length ?? 0), 1)
        const specAoa: string[][] = [specKeys]

        for (let i = 0; i < maxRows; i++) {
            const row = specKeys.map((k) => specifications[k]?.[i] ?? "")
            specAoa.push(row)
        }

        const specSheet = XLSX.utils.aoa_to_sheet(specAoa)
        XLSX.utils.book_append_sheet(workbook, specSheet, SPECIFICATION_SHEET_NAME)

        specKeys.forEach((key, idx) => {
            const rowCount = specifications[key]?.length ?? 0
            if (rowCount > 0) {
                specColumnRanges[key] = { colIndex: idx, maxRow: rowCount + 1 }
            }
        })
    }

    const getColumnLetter = (colIdx: number): string => {
        let letter = ""
        while (colIdx >= 0) {
            const charCode = (colIdx % 26) + 65
            letter = String.fromCharCode(charCode) + letter
            colIdx = Math.floor(colIdx / 26) - 1
        }
        return letter
    }

    for (const schema of schemaGroup.documents) {
        const schemaDocs = docsBySchema.get(schema.id) ?? []
        const mainSheetName = safeSheetName(schema.name || schema.id)

        const fieldNames = schema.fields.map((f) => f.name)
        const mainColumns = [...SYSTEM_FIELDS, ...fieldNames]

        const mainRows: Record<string, unknown>[] = []
        const subtypeRowStore: Record<string, Array<{ subtypeId: string; mainId: string; fields: Record<string, unknown> }>> = {}

        if (schema.subtypeFields) {
            Object.keys(schema.subtypeFields).forEach((st) => {
                subtypeRowStore[st] = []
            })
        }

        schemaDocs.forEach((doc) => {
            const frontmatter = doc.frontmatter ?? {}
            const mainRow: Record<string, unknown> = {
                id: doc.id,
                title: doc.title,
                parent_id: doc.parent_id ?? "",
                body: doc.body ?? "",
                workspace_id: doc.workspace_id ?? options.workspaceId ?? "default",
                created_by: doc.created_by ?? "",
                updated_by: doc.updated_by ?? "",
                created_at: doc.created_at ?? "",
                updated_at: doc.updated_at ?? "",
                is_deleted: doc.is_deleted ? "true" : "false",
            }

            schema.fields.forEach((field) => {
                const val = frontmatter[field.name]
                mainRow[field.name] = Array.isArray(val) ? val.join("; ") : val ?? ""
            })

            mainRows.push(mainRow)

            if (schema.subtypeFields) {
                const activeSubtype = frontmatter.subtype_form || frontmatter.subtype_key || frontmatter.subtype
                if (typeof activeSubtype === "string" && schema.subtypeFields[activeSubtype]) {
                    const subtypeId = `${doc.id}_${activeSubtype}`
                    const subtypeFieldDefs = schema.subtypeFields[activeSubtype]
                    const subtypeValues: Record<string, unknown> = {}

                    subtypeFieldDefs.forEach((f) => {
                        const val = frontmatter[f.name]
                        subtypeValues[f.name] = Array.isArray(val) ? val.join("; ") : val ?? ""
                    })

                    subtypeRowStore[activeSubtype].push({
                        subtypeId,
                        mainId: doc.id,
                        fields: subtypeValues,
                    })
                }
            }
        })

        const mainAoa = [mainColumns, ...mainRows.map((r) => mainColumns.map((c) => r[c] ?? ""))]
        const mainSheet = XLSX.utils.aoa_to_sheet(mainAoa)

        schema.fields.forEach((field, colIdx) => {
            if (field.specification && specColumnRanges[field.specification]) {
                const specInfo = specColumnRanges[field.specification]
                const colLetter = getColumnLetter(SYSTEM_FIELDS.length + colIdx)
                const specColLetter = getColumnLetter(specInfo.colIndex)

                if (!(mainSheet as any)["!validations"]) {
                    ;(mainSheet as any)["!validations"] = []
                }

                ;(mainSheet as any)["!validations"].push({
                    sqref: `${colLetter}2:${colLetter}10000`,
                    type: "list",
                    operator: "equal",
                    formula1: `'${SPECIFICATION_SHEET_NAME}'!$${specColLetter}$2:$${specColLetter}$${specInfo.maxRow}`,
                })
            }
        })

        XLSX.utils.book_append_sheet(workbook, mainSheet, mainSheetName)

        if (schema.subtypeFields) {
            Object.entries(schema.subtypeFields).forEach(([subtypeKey, subtypeFields]) => {
                const records = subtypeRowStore[subtypeKey] ?? []
                const subtypeSheetName = safeSheetName(`${schema.name}_${subtypeKey}`)
                const joinSheetName = safeSheetName(`${schema.name}_${subtypeKey}_Join`)

                const subtypeCols = ["subtype_id", ...subtypeFields.map((f) => f.name)]
                const subtypeAoa = [
                    subtypeCols,
                    ...records.map((rec) => [
                        rec.subtypeId,
                        ...subtypeFields.map((f) => rec.fields[f.name] ?? ""),
                    ]),
                ]
                const subtypeSheet = XLSX.utils.aoa_to_sheet(subtypeAoa)
                XLSX.utils.book_append_sheet(workbook, subtypeSheet, subtypeSheetName)

                const joinCols = ["main_record_id", "subtype_record_id", "subtype_key"]
                const joinAoa = [
                    joinCols,
                    ...records.map((rec) => [rec.mainId, rec.subtypeId, subtypeKey]),
                ]
                const joinSheet = XLSX.utils.aoa_to_sheet(joinAoa)
                XLSX.utils.book_append_sheet(workbook, joinSheet, joinSheetName)
            })
        }
    }

    const workbookBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
    const blob = new Blob([workbookBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    triggerBlobDownload(blob, fileName)
}

// Add to src/lib/export-import.ts
export async function exportWorkspaceAsSpreadsheetBundle(
    documents: StoredDocument[],
    format: "csv" | "xlsx",
    options?: ExcelExportOptions
): Promise<void> {
    if (options?.schemaGroup) {
        await exportWorkspaceToExcel(documents, options);
        return;
    }

    // Fallback simple export when schemaGroup is not explicitly provided
    const workbook = XLSX.utils.book_new();
    const rows = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        schema_id: doc.schema_id,
        parent_id: doc.parent_id ?? "",
        body: doc.body ?? "",
        ...doc.frontmatter,
    }));

    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Workspace Notes");

    const bookType = format === "csv" ? "csv" : "xlsx";
    const mimeType = format === "csv" 
        ? "text/csv;charset=utf-8;" 
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const buffer = XLSX.write(workbook, { bookType, type: "array" });
    const blob = new Blob([buffer], { type: mimeType });
    
    const fileName = `workspace_export_${Date.now()}.${format}`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

export async function inspectSpreadsheetFile(file: File): Promise<SpreadsheetInspectionResult> {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })

    const sheets: ParsedSpreadsheetSheet[] = []
    const specifications: SpecificationStore = {}
    let hasSpecificationSheet = false

    workbook.SheetNames.forEach((name) => {
        const worksheet = workbook.Sheets[name]
        const rawRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: "" })
        const [headerRow = [], ...bodyRows] = rawRows
        const headers = headerRow.map((v) => String(v ?? "").trim()).filter(Boolean)

        if (name === SPECIFICATION_SHEET_NAME) {
            hasSpecificationSheet = true
            headers.forEach((specKey, colIdx) => {
                const values = bodyRows
                    .map((r) => String(r[colIdx] ?? "").trim())
                    .filter(Boolean)
                specifications[specKey] = [...new Set(values)]
            })
            return
        }

        const parsedRows = bodyRows
            .filter((row) => row.some((v) => String(v ?? "").trim().length > 0))
            .map((row) => {
                const record: Record<string, string> = {}
                headers.forEach((header, index) => {
                    record[header] = String(row[index] ?? "").trim()
                })
                return record
            })

        sheets.push({ name, headers, rows: parsedRows })
    })

    return {
        fileName: file.name,
        sheetNames: workbook.SheetNames,
        sheets,
        hasSpecificationSheet,
        specifications,
    }
}

export function detectWorkbookSchemaGroup(
    inspection: SpreadsheetInspectionResult,
    registeredGroups: DocumentSchemaGroup[]
): SchemaGroupMatchResult {
    const mainSheets = inspection.sheets.filter((s) => !s.name.endsWith("_Join"))
    const sheetMap = new Map(mainSheets.map((s) => [canonicalize(s.name), s]))

    const inferredSchemaGroup: DocumentSchemaGroup = {
        id: `group-inferred-${Date.now()}`,
        name: inspection.fileName.replace(/\.[^/.]+$/, ""),
        description: "Auto-generated schema group based on Excel upload",
        documents: mainSheets
            .filter((sheet) => !sheet.headers.includes("subtype_id") && !sheet.headers.includes("main_record_id"))
            .map((sheet) => {
                const fieldHeaders = sheet.headers.filter((h) => !(SYSTEM_FIELDS as readonly string[]).includes(h))
                return {
                    id: canonicalize(sheet.name),
                    name: sheet.name,
                    titleField: sheet.headers.includes("title") ? "title" : fieldHeaders[0] || "id",
                    fields: fieldHeaders.map((header) => ({
                        name: header,
                        label: header.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                        type: { data: "string", input: "text" },
                    })),
                }
            }),
    }

    const scoreDetails: SchemaGroupMatchResult["scoreDetails"] = []
    const schemaGroupDiffs: SchemaGroupMatchResult["schemaGroupDiffs"] = {}

    let bestMatchGroup: DocumentSchemaGroup | null = null
    let highestConfidence = 0

    registeredGroups.forEach((group) => {
        let matchedSheetCount = 0
        let totalFieldMatches = 0
        let totalExpectedFields = 0

        const missingSheets: string[] = []
        const matchedSheets: string[] = []
        const missingFields: Record<string, string[]> = {}
        const extraHeaders: Record<string, string[]> = {}

        group.documents.forEach((schema) => {
            totalExpectedFields += schema.fields.length
            const targetSheetName = canonicalize(schema.name || schema.id)
            const matchedSheet = sheetMap.get(targetSheetName)

            if (matchedSheet) {
                matchedSheetCount++
                matchedSheets.push(schema.name)

                const uploadedHeaders = new Set(matchedSheet.headers.map(canonicalize))
                const schemaFields = schema.fields.map((f) => canonicalize(f.name))

                const missing = schema.fields.filter((f) => !uploadedHeaders.has(canonicalize(f.name))).map((f) => f.name)
                const extra = matchedSheet.headers.filter((h) => !(SYSTEM_FIELDS as readonly string[]).includes(h) && !schemaFields.includes(canonicalize(h)))

                if (missing.length) missingFields[schema.name] = missing
                if (extra.length) extraHeaders[schema.name] = extra

                totalFieldMatches += schema.fields.filter((f) => uploadedHeaders.has(canonicalize(f.name))).length
            } else {
                missingSheets.push(schema.name)
            }
        })

        const sheetMatchRatio = group.documents.length > 0 ? matchedSheetCount / group.documents.length : 0
        const fieldMatchRatio = totalExpectedFields > 0 ? totalFieldMatches / totalExpectedFields : 0
        const confidence = Number((sheetMatchRatio * 0.6 + fieldMatchRatio * 0.4).toFixed(2))

        scoreDetails.push({
            groupId: group.id,
            groupName: group.name,
            confidence,
            matchedSheets,
            missingSheets,
            fieldMatchRatio,
        })

        schemaGroupDiffs[group.id] = { missingFields, extraHeaders }

        if (confidence > highestConfidence && confidence >= 0.5) {
            highestConfidence = confidence
            bestMatchGroup = group
        }
    })

    return {
        matchedGroup: bestMatchGroup,
        confidence: highestConfidence,
        scoreDetails,
        inferredSchemaGroup,
        schemaGroupDiffs,
    }
}

export async function importExcelWorkbook(options: ExcelImportOptions): Promise<SpreadsheetImportSummary> {
    const { schemaGroup, inspection, workspaceId = "default" } = options
    const sheetMap = new Map(inspection.sheets.map((s) => [canonicalize(s.name), s]))

    let rowsProcessed = 0
    let recordsUpserted = 0
    let specificationsImported = 0

    if (inspection.hasSpecificationSheet && Object.keys(inspection.specifications).length > 0) {
        for (const [specId, values] of Object.entries(inspection.specifications)) {
            await dbClient.execute("DELETE FROM specifications WHERE workspace_id = ? AND kind = ?", [workspaceId, specId])
            for (const val of values) {
                await dbClient.execute(
                    "INSERT INTO specifications (kind, value, workspace_id) VALUES (?, ?, ?)",
                    [specId, val, workspaceId]
                )
            }
        }
        specificationsImported = Object.keys(inspection.specifications).length
    }

    for (const schema of schemaGroup.documents) {
        const sheetKey = canonicalize(schema.name || schema.id)
        const mainSheet = sheetMap.get(sheetKey)
        if (!mainSheet) continue

        const subtypeSheets: Record<string, ParsedSpreadsheetSheet> = {}
        const joinSheets: Record<string, ParsedSpreadsheetSheet> = {}

        if (schema.subtypeFields) {
            Object.keys(schema.subtypeFields).forEach((st) => {
                const subKey = canonicalize(`${schema.name}_${st}`)
                const joinKey = canonicalize(`${schema.name}_${st}_Join`)

                const subSheet = sheetMap.get(subKey)
                const joinSheet = sheetMap.get(joinKey)

                if (subSheet) subtypeSheets[st] = subSheet
                if (joinSheet) joinSheets[st] = joinSheet
            })
        }

        const subtypeLookup = new Map<string, Array<{ key: string; subtypeId: string }>>()
        Object.entries(joinSheets).forEach(([stKey, jSheet]) => {
            jSheet.rows.forEach((r) => {
                const mainId = r.main_record_id
                const subtypeId = r.subtype_record_id
                if (mainId && subtypeId) {
                    const existing = subtypeLookup.get(mainId) ?? []
                    existing.push({ key: stKey, subtypeId })
                    subtypeLookup.set(mainId, existing)
                }
            })
        })

        const subtypeDataLookup = new Map<string, Record<string, string>>()
        Object.values(subtypeSheets).forEach((sSheet) => {
            sSheet.rows.forEach((r) => {
                if (r.subtype_id) {
                    subtypeDataLookup.set(r.subtype_id, r)
                }
            })
        })

        for (const row of mainSheet.rows) {
            const id = row.id?.trim() || crypto.randomUUID()
            const title = row.title?.trim() || id
            const parentId = row.parent_id?.trim() || null
            const body = row.body || ""

            const frontmatter: Record<string, unknown> = {
                id,
                title,
                schema_id: schema.id,
                workspace_id: workspaceId,
                parent_id: parentId ?? undefined,
            }

            schema.fields.forEach((field) => {
                const rawVal = row[field.name]
                if (rawVal !== undefined && rawVal !== "") {
                    if (field.type.data === "array<string>") {
                        frontmatter[field.name] = rawVal.split(";").map((s) => s.trim()).filter(Boolean)
                    } else if (field.type.data === "boolean") {
                        frontmatter[field.name] = ["true", "yes", "1"].includes(rawVal.toLowerCase())
                    } else {
                        frontmatter[field.name] = rawVal
                    }
                }
            })

            const linkedSubtypes = subtypeLookup.get(id) ?? []
            if (linkedSubtypes.length > 0 && schema.subtypeFields) {
                const { key: stKey, subtypeId } = linkedSubtypes[0]
                const subData = subtypeDataLookup.get(subtypeId)

                if (subData && schema.subtypeFields[stKey]) {
                    frontmatter.subtype_form = stKey
                    schema.subtypeFields[stKey].forEach((f) => {
                        const rawVal = subData[f.name]
                        if (rawVal !== undefined && rawVal !== "") {
                            if (f.type.data === "array<string>") {
                                frontmatter[f.name] = rawVal.split(";").map((s) => s.trim()).filter(Boolean)
                            } else {
                                frontmatter[f.name] = rawVal
                            }
                        }
                    })
                }
            }

            const now = Date.now()
            await dbClient.execute(
                `INSERT INTO notes (
                    id, workspace_id, schema_id, parent_id, title, frontmatter, body,
                    created_by, updated_by, created_at, updated_at, is_deleted, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                ON CONFLICT(id) DO UPDATE SET
                    workspace_id = excluded.workspace_id,
                    schema_id = excluded.schema_id,
                    parent_id = excluded.parent_id,
                    title = excluded.title,
                    frontmatter = excluded.frontmatter,
                    body = excluded.body,
                    updated_at = excluded.updated_at,
                    is_deleted = excluded.is_deleted,
                    synced_at = NULL`,
                [
                    id,
                    workspaceId,
                    schema.id,
                    parentId,
                    title,
                    JSON.stringify(frontmatter),
                    body,
                    row.created_by || null,
                    row.updated_by || row.created_by || null,
                    row.created_at ? Number(row.created_at) || now : now,
                    row.updated_at ? Number(row.updated_at) || now : now,
                    row.is_deleted === "true" || row.is_deleted === "1" ? 1 : 0,
                ]
            )

            rowsProcessed++
            recordsUpserted++
        }
    }

    return { rowsProcessed, recordsUpserted, specificationsImported }
}

export async function importSpreadsheetSheet(options: ImportSpreadsheetSheetOptions): Promise<{ recordsUpserted: number }> {
    const { entityKey, sheet, mapping, workspaceId = "default" } = options
    let recordsUpserted = 0

    for (const row of sheet.rows) {
        const mappedData: Record<string, string> = {}
        for (const [header, targetField] of Object.entries(mapping)) {
            if (targetField && row[header] !== undefined) {
                mappedData[targetField] = row[header]
            }
        }

        const id = mappedData.id || crypto.randomUUID()
        const title = mappedData.title || mappedData.name || id
        const parentId = mappedData.parent_id || null
        const body = mappedData.notes || mappedData.body || ""

        const frontmatter: Record<string, unknown> = {
            id,
            title,
            schema_id: entityKey,
            workspace_id: workspaceId,
            ...mappedData,
        }

        const now = Date.now()
        await dbClient.execute(
            `INSERT INTO notes (
                id, workspace_id, schema_id, parent_id, title, frontmatter, body,
                created_at, updated_at, is_deleted, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
            ON CONFLICT(id) DO UPDATE SET
                workspace_id = excluded.workspace_id,
                schema_id = excluded.schema_id,
                parent_id = excluded.parent_id,
                title = excluded.title,
                frontmatter = excluded.frontmatter,
                body = excluded.body,
                updated_at = excluded.updated_at,
                synced_at = NULL`,
            [
                id,
                workspaceId,
                entityKey,
                parentId,
                title,
                JSON.stringify(frontmatter),
                body,
                now,
                now,
            ]
        )
        recordsUpserted++
    }

    return { recordsUpserted }
}

// ==========================================
// OBSIDIAN VAULT UTILITIES (GENERIC)
// ==========================================

export async function exportWorkspaceAsObsidianVault(
    documents: StoredDocument[],
    fileName = `obsidian_vault_${Date.now()}.zip`,
    options: ObsidianExportOptions = {}
) {
    const zip = new JSZip()
    const workspaceName = options.workspaceName?.trim() || options.workspaceId || "workspace"

    documents.forEach((doc) => {
        const folderName = doc.schema_id || "Records"
        const folder = zip.folder(folderName)
        const fileStem = doc.id.replace(/[/\\?%*:|"<>]/g, "_")
        const yamlFront = YAML.stringify(doc.frontmatter ?? {}).trimEnd()
        const markdown = `---\n${yamlFront}\n---\n\n${doc.body ?? ""}`
        folder?.file(`${fileStem}.md`, markdown)
    })

    if (options.schemaGroups) {
        const templatesFolder = zip.folder("Templates")
        options.schemaGroups.forEach((group) => {
            const groupFolder = templatesFolder?.folder(group.name || group.id)
            group.documents.forEach((schema) => {
                const templateFrontmatter = {
                    schema_id: schema.id,
                    schema_name: schema.name,
                    fields: schema.fields.map((f) => ({ name: f.name, label: f.label, data_type: f.type.data })),
                }
                const content = `---\n${YAML.stringify(templateFrontmatter).trimEnd()}\n---\n\n# ${schema.name} Template`
                groupFolder?.file(`${schema.id}.md`, content)
            })
        })
    }

    const blob = await zip.generateAsync({
        type: "blob",
        comment: `Obsidian vault export for ${workspaceName}`,
    })
    triggerBlobDownload(blob, fileName)
}

export async function importVaultZip(file: File, workspaceId = "default"): Promise<VaultImportSummary> {
    const archive = await JSZip.loadAsync(await file.arrayBuffer())
    let filesProcessed = 0
    let recordsUpserted = 0

    const markdownFiles = Object.keys(archive.files).filter((p) => p.toLowerCase().endsWith(".md") && !archive.files[p].dir)

    for (const fileName of markdownFiles) {
        const entry = archive.files[fileName]
        const text = await entry.async("text")
        const { frontmatter, body } = splitFrontmatter(text)

        const id = typeof frontmatter.id === "string" ? frontmatter.id : crypto.randomUUID()
        const schemaId = typeof frontmatter.schema_id === "string" ? frontmatter.schema_id : "imported-note"
        const title = typeof frontmatter.title === "string" ? frontmatter.title : fileName.split("/").pop()?.replace(/\.md$/i, "") || id

        const now = Date.now()
        await dbClient.execute(
            `INSERT INTO notes (
                id, workspace_id, schema_id, parent_id, title, frontmatter, body,
                created_at, updated_at, is_deleted, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
            ON CONFLICT(id) DO UPDATE SET
                workspace_id = excluded.workspace_id,
                schema_id = excluded.schema_id,
                parent_id = excluded.parent_id,
                title = excluded.title,
                frontmatter = excluded.frontmatter,
                body = excluded.body,
                updated_at = excluded.updated_at,
                synced_at = NULL`,
            [
                id,
                workspaceId,
                schemaId,
                frontmatter.parent_id ?? null,
                title,
                JSON.stringify(frontmatter),
                body,
                now,
                now,
            ]
        )

        filesProcessed++
        recordsUpserted++
    }

    return {
        filesProcessed,
        recordsUpserted,
        relationshipsResolved: 0,
    }
}