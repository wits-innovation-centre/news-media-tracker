import JSZip from "jszip"
import * as XLSX from "xlsx"
import YAML from "yaml"

import { dbClient } from "@/lib/db/client"
import type { DocumentSchemaGroup, SpecificationDefinition, SpecificationStore } from "@/lib/types"
type WorkspaceEntityKey = "event" | "article" | "participant"

type SpreadsheetValue = string | number | boolean | null

interface WorkspaceExportRecord {
    id: string
    schema_id: string
    title: string
    frontmatter: Record<string, unknown>
    body: string
    parent_id?: string
    workspace_id?: string
    created_by?: string
    updated_by?: string
    created_at?: string | number
    updated_at?: number
    is_deleted?: boolean
}

interface SpreadsheetTable {
    entityKey: WorkspaceEntityKey
    sheetName: string
    folderName: string
    columns: string[]
    rows: Record<string, SpreadsheetValue>[]
}

interface ParsedSpreadsheetSheet {
    name: string
    headers: string[]
    rows: Record<string, string>[]
}

interface SpreadsheetImportMapping {
    [column: string]: string | null
}

interface SpreadsheetImportOptions {
    entityKey: WorkspaceEntityKey
    sheet: ParsedSpreadsheetSheet
    mapping: SpreadsheetImportMapping
    workspaceId?: string
}

interface VaultImportSummary {
    filesProcessed: number
    recordsUpserted: number
    relationshipsResolved: number
}

interface SpreadsheetImportSummary {
    rowsProcessed: number
    recordsUpserted: number
}

interface SpreadsheetInspectionResult {
    fileName: string
    sheetNames: string[]
    sheets: ParsedSpreadsheetSheet[]
}

interface ObsidianExportOptions {
    includeTutorial?: boolean
    workspaceId?: string
    workspaceName?: string
    schemaGroups?: DocumentSchemaGroup[]
    specificationRegistry?: SpecificationDefinition[]
    specifications?: SpecificationStore
}

interface ObsidianTemplateFrontmatter {
    schema_id: string
    schema_name: string
    group_name?: string
    description?: string
    fields: Array<{
        name: string
        label: string
        data_type: string
        input_type: string
        required: boolean
        specification?: string
        description?: string
        default?: unknown
        options?: unknown
    }>
    subtype_fields?: Record<string, Array<{
        name: string
        label: string
        data_type: string
        input_type: string
        required: boolean
        specification?: string
        description?: string
        default?: unknown
        options?: unknown
    }>>
}

const ENTITY_CONFIG: Record<WorkspaceEntityKey, { schemaId: string; folderName: string; sheetName: string; columns: string[]; titleField: string; bodyField: string }> = {
    event: {
        schemaId: "event",
        folderName: "Events",
        sheetName: "Events",
        titleField: "name",
        bodyField: "notes",
        columns: [
            "id",
            "name",
            "date",
            "location_of_homicide",
            "location_of_homicide_specify",
            "sexual_assault",
            "report",
            "type_of_murder",
            "notes",
            "parent_id",
            "parent_title",
            "workspace_id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ],
    },
    article: {
        schemaId: "report",
        folderName: "Articles",
        sheetName: "Articles",
        titleField: "headline",
        bodyField: "notes",
        columns: [
            "id",
            "headline",
            "url",
            "date",
            "author_identity_status",
            "author",
            "wire_service",
            "language",
            "type_of_source",
            "report_platform",
            "notes",
            "parent_id",
            "parent_title",
            "workspace_id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ],
    },
    participant: {
        schemaId: "actor",
        folderName: "Participants",
        sheetName: "Participants",
        titleField: "name",
        bodyField: "notes",
        columns: [
            "id",
            "name",
            "aliases",
            "gender",
            "race",
            "is_age_known",
            "age",
            "age_descriptor",
            "nationality",
            "mode_of_death_general",
            "mode_of_death_specific",
            "type_of_murder",
            "type_of_murder_specify",
            "subtype_form",
            "date_of_death_mode",
            "date_of_death",
            "date_of_death_range",
            "relationship_to_victim",
            "relationship_to_victim_specify",
            "identified",
            "arrested",
            "charged",
            "convicted",
            "charges",
            "sentence",
            "notes",
            "parent_id",
            "parent_title",
            "workspace_id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ],
    },
}

const ENTITY_BY_SCHEMA_ID: Record<string, WorkspaceEntityKey> = {
    event: "event",
    report: "article",
    actor: "participant",
}

const SPREADSHEET_SPECIAL_FIELDS = [
    "id",
    "title",
    "notes",
    "parent_id",
    "parent_title",
    "workspace_id",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
    "is_deleted",
]

const ARRAY_FIELDS: Record<WorkspaceEntityKey, Set<string>> = {
    event: new Set(["report", "type_of_murder"]),
    article: new Set(["author"]),
    participant: new Set(["aliases", "type_of_murder", "relationship_to_victim"]),
}

const BOOLEAN_FIELDS: Record<WorkspaceEntityKey, Set<string>> = {
    event: new Set(["sexual_assault"]),
    article: new Set(),
    participant: new Set(["is_age_known"]),
}

const canonicalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")

const titleFromRecord = (record: WorkspaceExportRecord, entityKey: WorkspaceEntityKey) => {
    const sourceFrontmatter = record.frontmatter ?? {}
    const candidate =
        (entityKey === "article" ? sourceFrontmatter.headline : sourceFrontmatter.name) ??
        sourceFrontmatter.title ??
        record.title ??
        record.id

    return String(candidate).trim() || record.id
}

const getEntityKeyFromSchemaId = (schemaId: string): WorkspaceEntityKey | null => {
    return ENTITY_BY_SCHEMA_ID[schemaId] ?? null
}

const getEntityKeyFromFrontmatter = (frontmatter: Record<string, unknown>, fallbackEntity?: WorkspaceEntityKey): WorkspaceEntityKey | null => {
    const schemaId = typeof frontmatter.schema_id === "string" ? frontmatter.schema_id : typeof frontmatter.schemaId === "string" ? frontmatter.schemaId : undefined
    if (schemaId) {
        const match = ENTITY_BY_SCHEMA_ID[schemaId]
        if (match) return match
    }

    const folderHint = typeof frontmatter.entity_type === "string" ? frontmatter.entity_type : typeof frontmatter.folder === "string" ? frontmatter.folder : undefined
    if (folderHint) {
        const normalized = canonicalize(folderHint)
        if (normalized.startsWith("event")) return "event"
        if (normalized.startsWith("article") || normalized.startsWith("report")) return "article"
        if (normalized.startsWith("participant") || normalized.startsWith("actor")) return "participant"
    }

    return fallbackEntity ?? null
}

const safeFileStem = (value: string) => {
    const collapsed = value.trim().replace(/\s+/g, "_")
    const sanitized = collapsed.replace(/[/\\?%*:|"<>]/g, "_")
    return sanitized.length > 0 ? sanitized : "untitled"
}

const slugifyFolderName = (value: string) => safeFileStem(value)

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const toDisplayString = (value: SpreadsheetValue | SpreadsheetValue[] | Record<string, unknown> | undefined): SpreadsheetValue => {
    if (value === null || value === undefined) return null
    if (Array.isArray(value)) {
        return value.map((item) => (item === null || item === undefined ? "" : String(item))).filter(Boolean).join("; ")
    }
    if (typeof value === "object") {
        return JSON.stringify(value)
    }
    return value
}

const parseArrayValue = (value: string) => {
    return value
        .split(/\r?\n|\s*;\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
}

const parseScalarValue = (entityKey: WorkspaceEntityKey, fieldName: string, rawValue: string): string | string[] | boolean | number | null => {
    const trimmed = rawValue.trim()
    if (!trimmed) return null

    if (ARRAY_FIELDS[entityKey].has(fieldName)) {
        return parseArrayValue(trimmed)
    }

    if (BOOLEAN_FIELDS[entityKey].has(fieldName)) {
        return ["true", "yes", "1", "on"].includes(trimmed.toLowerCase())
    }

    if (fieldName === "created_at" || fieldName === "updated_at") {
        const numeric = Number(trimmed)
        return Number.isFinite(numeric) ? numeric : trimmed
    }

    if (fieldName === "is_deleted") {
        return ["true", "yes", "1", "on"].includes(trimmed.toLowerCase())
    }

    return trimmed
}

const extractWikiLinkTargets = (value: unknown): string[] => {
    const tokens = new Set<string>()

    const visit = (input: unknown) => {
        if (typeof input === "string") {
            const matches = input.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) ?? []
            matches.forEach((match) => {
                const inner = match.slice(2, -2)
                const [target] = inner.split("|")
                if (target?.trim()) {
                    tokens.add(target.trim())
                }
            })
            return
        }

        if (Array.isArray(input)) {
            input.forEach(visit)
        }
    }

    visit(value)
    return [...tokens]
}

const buildWikiLink = (value: string) => `[[${value.replace(/\]\]/g, "").trim()}]]`

const yamlStringify = (value: Record<string, unknown>) => {
    const cleaned: Record<string, unknown> = {}

    Object.entries(value).forEach(([key, rawValue]) => {
        if (rawValue === undefined || rawValue === null) return
        if (Array.isArray(rawValue) && rawValue.length === 0) return
        if (typeof rawValue === "string" && rawValue.trim() === "") return
        cleaned[key] = rawValue
    })

    if (Object.keys(cleaned).length === 0) {
        return ""
    }

    return `---\n${YAML.stringify(cleaned).trimEnd()}\n---\n\n`
}

const yamlParse = (source: string) => {
    if (!source.trim()) {
        return {}
    }

    const parsed = YAML.parse(source)
    return isPlainObject(parsed) ? parsed : {}
}

const splitFrontmatter = (markdown: string) => {
    const trimmed = markdown.replace(/^\uFEFF/, "")
    if (!trimmed.startsWith("---")) {
        return { frontmatter: {}, body: markdown.trimStart() }
    }

    const newlineIndex = trimmed.indexOf("\n")
    if (newlineIndex < 0) {
        return { frontmatter: {}, body: markdown }
    }

    const remainder = trimmed.slice(newlineIndex + 1)
    const closingIndex = remainder.indexOf("\n---")
    if (closingIndex < 0) {
        return { frontmatter: {}, body: markdown }
    }

    const frontmatterSource = remainder.slice(0, closingIndex)
    const body = remainder.slice(closingIndex + 4).replace(/^\r?\n/, "")

    return {
        frontmatter: yamlParse(frontmatterSource),
        body,
    }
}

const buildRelatedRecordLookup = (documents: WorkspaceExportRecord[]) => {
    const byId = new Map<string, WorkspaceExportRecord>()
    const byTitle = new Map<string, WorkspaceExportRecord>()

    documents.forEach((record) => {
        byId.set(record.id, record)
        byTitle.set(canonicalize(record.title), record)
        const frontmatterTitle = typeof record.frontmatter?.title === "string" ? record.frontmatter.title : undefined
        if (frontmatterTitle) {
            byTitle.set(canonicalize(frontmatterTitle), record)
        }
        const frontmatterName = typeof record.frontmatter?.name === "string" ? record.frontmatter.name : undefined
        if (frontmatterName) {
            byTitle.set(canonicalize(frontmatterName), record)
        }
        const frontmatterHeadline = typeof record.frontmatter?.headline === "string" ? record.frontmatter.headline : undefined
        if (frontmatterHeadline) {
            byTitle.set(canonicalize(frontmatterHeadline), record)
        }
    })

    return { byId, byTitle }
}

const resolveRecordReference = (
    reference: string,
    lookup: ReturnType<typeof buildRelatedRecordLookup>
): WorkspaceExportRecord | undefined => {
    const normalized = canonicalize(reference)
    return lookup.byId.get(reference) ?? lookup.byTitle.get(normalized)
}

const buildEntityFrontmatter = (
    record: WorkspaceExportRecord,
    entityKey: WorkspaceEntityKey,
    lookup: ReturnType<typeof buildRelatedRecordLookup>,
    children: WorkspaceExportRecord[]
) => {
    const baseFrontmatter = isPlainObject(record.frontmatter) ? { ...record.frontmatter } : {}
    const title = titleFromRecord(record, entityKey)
    const parent = record.parent_id ? lookup.byId.get(record.parent_id) : undefined

    const eventLinks = entityKey === "event"
        ? []
        : parent
            ? [buildWikiLink(titleFromRecord(parent, "event"))]
            : []

    const relatedArticles = entityKey === "event"
        ? children.filter((child) => getEntityKeyFromSchemaId(child.schema_id) === "article").map((child) => buildWikiLink(titleFromRecord(child, "article")))
        : []

    const relatedParticipants = entityKey === "event"
        ? children.filter((child) => getEntityKeyFromSchemaId(child.schema_id) === "participant").map((child) => buildWikiLink(titleFromRecord(child, "participant")))
        : []

    return {
        ...baseFrontmatter,
        id: record.id,
        title,
        schema_id: ENTITY_CONFIG[entityKey].schemaId,
        workspace_id: record.workspace_id ?? baseFrontmatter.workspace_id ?? "default",
        parent_id: record.parent_id ?? baseFrontmatter.parent_id ?? undefined,
        parent_title: parent ? titleFromRecord(parent, getEntityKeyFromSchemaId(parent.schema_id) ?? "event") : baseFrontmatter.parent_title ?? undefined,
        event: eventLinks[0] ?? baseFrontmatter.event ?? undefined,
        related_articles: relatedArticles.length > 0 ? relatedArticles : baseFrontmatter.related_articles,
        related_participants: relatedParticipants.length > 0 ? relatedParticipants : baseFrontmatter.related_participants,
        created_by: record.created_by ?? baseFrontmatter.created_by ?? undefined,
        updated_by: record.updated_by ?? baseFrontmatter.updated_by ?? undefined,
        created_at: record.created_at ?? baseFrontmatter.created_at ?? undefined,
        updated_at: record.updated_at ?? baseFrontmatter.updated_at ?? undefined,
        is_deleted: record.is_deleted ?? baseFrontmatter.is_deleted ?? undefined,
    }
}

const buildEntityBody = (
    record: WorkspaceExportRecord,
    entityKey: WorkspaceEntityKey,
    lookup: ReturnType<typeof buildRelatedRecordLookup>,
    children: WorkspaceExportRecord[]
) => {
    const baseBody = typeof record.body === "string" ? record.body.trimEnd() : ""
    const parent = record.parent_id ? lookup.byId.get(record.parent_id) : undefined

    const lines: string[] = []

    if (baseBody) {
        lines.push(baseBody)
    }

    if (entityKey === "event") {
        const relatedArticles = children.filter((child) => getEntityKeyFromSchemaId(child.schema_id) === "article")
        const relatedParticipants = children.filter((child) => getEntityKeyFromSchemaId(child.schema_id) === "participant")

        if (relatedArticles.length > 0 || relatedParticipants.length > 0) {
            lines.push("## Related Records")
            if (relatedArticles.length > 0) {
                lines.push("### Articles")
                relatedArticles.forEach((child) => {
                    lines.push(`- ${buildWikiLink(titleFromRecord(child, "article"))}`)
                })
            }
            if (relatedParticipants.length > 0) {
                lines.push("### Participants")
                relatedParticipants.forEach((child) => {
                    lines.push(`- ${buildWikiLink(titleFromRecord(child, "participant"))}`)
                })
            }
        }
    } else if (parent) {
        lines.push("## Parent Event")
        lines.push(buildWikiLink(titleFromRecord(parent, "event")))
    }

    return lines.join("\n\n")
}

const buildTemplateFrontmatter = (groupName: string | undefined, schema: DocumentSchemaGroup["documents"][number]): ObsidianTemplateFrontmatter => ({
    schema_id: schema.id,
    schema_name: schema.name,
    group_name: groupName,
    description: schema.description,
    fields: schema.fields.map((field) => ({
        name: field.name,
        label: field.label,
        data_type: field.type.data,
        input_type: field.type.input,
        required: Boolean(field.required),
        specification: field.specification,
        description: field.description,
        default: field.default,
        options: field.options,
    })),
    subtype_fields: schema.subtypeFields
        ? Object.fromEntries(
            Object.entries(schema.subtypeFields).map(([subtype, fields]) => [
                subtype,
                fields.map((field) => ({
                    name: field.name,
                    label: field.label,
                    data_type: field.type.data,
                    input_type: field.type.input,
                    required: Boolean(field.required),
                    specification: field.specification,
                    description: field.description,
                    default: field.default,
                    options: field.options,
                })),
            ])
        )
        : undefined,
})

const buildTemplateMarkdown = (groupName: string | undefined, schema: DocumentSchemaGroup["documents"][number], specificationValues: SpecificationStore = {}) => {
    const templateFrontmatter = buildTemplateFrontmatter(groupName, schema)
    const specificationSections = schema.fields
        .filter((field) => field.specification)
        .map((field) => {
            const specificationId = field.specification as string
            const values = specificationValues[specificationId] ?? []
            return [
                `## Specification: ${specificationId}`,
                values.length > 0
                    ? values.map((value) => `- ${value}`).join("\n")
                    : "No seeded values were exported for this specification.",
            ].join("\n\n")
        })

    const bodySections = [
        `# ${schema.name} Template`,
        schema.description ?? "",
        "## Field Summary",
        schema.fields.map((field) => `- ${field.label} (${field.name})`).join("\n"),
        ...specificationSections,
    ].filter((section) => section.trim().length > 0)

    return `${yamlStringify(templateFrontmatter as unknown as Record<string, unknown>)}${bodySections.join("\n\n")}`
}

const buildSpecificationMarkdown = (registry: SpecificationDefinition[], specifications: SpecificationStore) => {
    const lines = [
        "# Specifications",
        "These values are exported for reference and can be copied into Obsidian templates or Properties as needed.",
    ]

    registry.forEach((entry) => {
        lines.push(`## ${entry.name}`)
        if (entry.description) {
            lines.push(entry.description)
        }

        const values = specifications[entry.id] ?? []
        if (values.length === 0) {
            lines.push("No values exported.")
            return
        }

        lines.push(values.map((value) => `- ${value}`).join("\n"))
    })

    return lines.join("\n\n")
}

const buildTutorialMarkdown = (workspaceName: string, includeSpecifications: boolean) => {
    const specificationNote = includeSpecifications
        ? "The export also includes a Specifications note and template metadata so you can seed Properties or template placeholders manually inside Obsidian."
        : ""

    return [
        "# Obsidian Quick Start",
        `This vault export was generated from the ${workspaceName} workspace.`,
        "## Open The Vault",
        "1. Install and launch Obsidian.",
        "2. Choose Open folder as vault.",
        "3. Select the extracted export folder.",
        "## How Records Are Organized",
        "Parent records that contain children are exported as folders. Each parent folder contains a markdown file with the same name as the folder, plus child notes such as related articles or participants.",
        "## Templates",
        "Open the Default Templates folder to inspect the exported schema templates. Each template note contains field metadata and seeded specification values where available.",
        "To create a new note from a template in Obsidian, enable the Templates core plugin, set the template folder to Default Templates, and insert the relevant template into a new note.",
        specificationNote,
        "## WikiLinks",
        "Relationships between records are exported with wiki links so you can navigate between events, articles, and participants inside Obsidian.",
    ].filter((section) => section.trim().length > 0).join("\n\n")
}

const buildExportManifest = (
    documents: WorkspaceExportRecord[],
    workspaceName: string,
    options: ObsidianExportOptions
) => {
    return {
        workspace_name: workspaceName,
        workspace_id: options.workspaceId ?? documents[0]?.workspace_id ?? "default",
        exported_at: new Date().toISOString(),
        document_count: documents.length,
        include_tutorial: Boolean(options.includeTutorial),
        schema_group_count: options.schemaGroups?.length ?? 0,
        specification_registry_count: options.specificationRegistry?.length ?? 0,
    }
}

const createSpreadsheetTables = (documents: WorkspaceExportRecord[]): SpreadsheetTable[] => {
    const lookup = buildRelatedRecordLookup(documents)
    const childrenByParentId = new Map<string, WorkspaceExportRecord[]>()

    documents.forEach((record) => {
        if (!record.parent_id) return
        const existing = childrenByParentId.get(record.parent_id) ?? []
        existing.push(record)
        childrenByParentId.set(record.parent_id, existing)
    })

    return Object.entries(ENTITY_CONFIG).map(([entityKey, config]) => {
        const entityDocuments = documents.filter((record) => getEntityKeyFromSchemaId(record.schema_id) === entityKey)
        const rows = entityDocuments.map((record) => {
            const frontmatter = isPlainObject(record.frontmatter) ? record.frontmatter : {}
            const row: Record<string, SpreadsheetValue> = {}

            config.columns.forEach((column) => {
                if (column === "notes") {
                    row[column] = record.body ?? ""
                    return
                }

                if (column === "parent_id") {
                    row[column] = record.parent_id ?? null
                    return
                }

                if (column === "parent_title") {
                    row[column] = record.parent_id ? titleFromRecord(lookup.byId.get(record.parent_id) ?? record, "event") : null
                    return
                }

                if (column === "workspace_id") {
                    row[column] = record.workspace_id ?? "default"
                    return
                }

                if (column === "created_by") {
                    row[column] = record.created_by ?? null
                    return
                }

                if (column === "updated_by") {
                    row[column] = record.updated_by ?? null
                    return
                }

                if (column === "created_at") {
                    row[column] = record.created_at ?? null
                    return
                }

                if (column === "updated_at") {
                    row[column] = record.updated_at ?? null
                    return
                }

                if (column === "id") {
                    row[column] = record.id
                    return
                }

                if (column === "title") {
                    row[column] = titleFromRecord(record, entityKey as WorkspaceEntityKey)
                    return
                }

                row[column] = toDisplayString(frontmatter[column] as SpreadsheetValue | SpreadsheetValue[] | Record<string, unknown> | undefined)
            })

            return row
        })

        return {
            entityKey: entityKey as WorkspaceEntityKey,
            sheetName: config.sheetName,
            folderName: config.folderName,
            columns: config.columns,
            rows,
        }
    })
}

const triggerBlobDownload = async (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

const upsertImportedNote = async (payload: {
    id: string
    workspaceId: string
    schemaId: string
    parentId?: string | null
    title: string
    frontmatter: Record<string, unknown>
    body: string
    createdBy?: string | null
    updatedBy?: string | null
    createdAt?: number
    updatedAt?: number
    isDeleted?: boolean
}) => {
    const now = Date.now()
    const createdAt = payload.createdAt ?? now
    const updatedAt = payload.updatedAt ?? now

    await dbClient.execute(
        `INSERT INTO notes (
       id, workspace_id, schema_id, parent_id, title, frontmatter, body,
       created_by, updated_by, deleted_by, created_at, updated_at, is_deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       schema_id = excluded.schema_id,
       parent_id = excluded.parent_id,
       title = excluded.title,
       frontmatter = excluded.frontmatter,
       body = excluded.body,
       created_by = COALESCE(notes.created_by, excluded.created_by),
       updated_by = excluded.updated_by,
       created_at = COALESCE(notes.created_at, excluded.created_at),
       updated_at = excluded.updated_at,
       is_deleted = excluded.is_deleted,
       synced_at = NULL`,
        [
            payload.id,
            payload.workspaceId,
            payload.schemaId,
            payload.parentId ?? null,
            payload.title,
            JSON.stringify(payload.frontmatter),
            payload.body,
            payload.createdBy ?? null,
            payload.updatedBy ?? payload.createdBy ?? null,
            createdAt,
            updatedAt,
            payload.isDeleted ? 1 : 0,
        ]
    )
}

const detectEntityFromPath = (path: string): WorkspaceEntityKey | null => {
    const segments = path.split("/").filter(Boolean)
    const folder = segments[0]
    if (!folder) return null

    const normalized = canonicalize(folder)
    if (normalized.startsWith("event")) return "event"
    if (normalized.startsWith("article") || normalized.startsWith("report")) return "article"
    if (normalized.startsWith("participant") || normalized.startsWith("actor") || normalized.startsWith("victim") || normalized.startsWith("perpetrator")) {
        return "participant"
    }

    return null
}

const parseVaultEntry = async (fileName: string, file: File, entityKey: WorkspaceEntityKey | null) => {
    const text = await file.text()
    const { frontmatter, body } = splitFrontmatter(text)
    const importedFrontmatter = isPlainObject(frontmatter) ? frontmatter : {}
    const entity = getEntityKeyFromFrontmatter(importedFrontmatter, entityKey ?? undefined)
    const fileStem = fileName.split("/").pop()?.replace(/\.md$/i, "") ?? fileName.replace(/\.md$/i, "")
    const title =
        (entity === "article" ? importedFrontmatter.headline : importedFrontmatter.name) ??
        importedFrontmatter.title ??
        fileStem

    return {
        fileName,
        entityKey: entity ?? "event",
        title: String(title).trim(),
        frontmatter: importedFrontmatter,
        body,
        links: extractWikiLinkTargets([importedFrontmatter, body]),
    }
}

const readZipMarkdownFiles = async (zipFile: File) => {
    const archive = await JSZip.loadAsync(await zipFile.arrayBuffer())
    const entries: Array<Awaited<ReturnType<typeof parseVaultEntry>>> = []

    const fileNames = Object.keys(archive.files).filter((path) => path.toLowerCase().endsWith(".md"))
    for (const fileName of fileNames) {
        const zipEntry = archive.files[fileName]
        if (!zipEntry || zipEntry.dir) continue

        const entityKey = detectEntityFromPath(fileName)
        const file = new File([await zipEntry.async("blob")], fileName, { type: "text/markdown" })
        entries.push(await parseVaultEntry(fileName, file, entityKey))
    }

    return entries
}

const inferEntityKeyFromSheetName = (sheetName: string): WorkspaceEntityKey | null => {
    const normalized = canonicalize(sheetName)
    if (normalized.startsWith("event")) return "event"
    if (normalized.startsWith("article") || normalized.startsWith("report")) return "article"
    if (normalized.startsWith("participant") || normalized.startsWith("actor") || normalized.startsWith("victim") || normalized.startsWith("perpetrator")) {
        return "participant"
    }
    return null
}

const getEntityFieldType = (entityKey: WorkspaceEntityKey, fieldName: string) => {
    if (ARRAY_FIELDS[entityKey].has(fieldName)) return "array"
    if (BOOLEAN_FIELDS[entityKey].has(fieldName)) return "boolean"
    if (fieldName === "created_at" || fieldName === "updated_at") return "number"
    if (fieldName === "is_deleted") return "boolean"
    return "string"
}

const ensureWorkbookSheet = (rows: Record<string, SpreadsheetValue>[], columns: string[]) => {
    const data = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]
    return XLSX.utils.aoa_to_sheet(data)
}

async function exportWorkspaceAsObsidianVault(
    documents: WorkspaceExportRecord[],
    fileName = `obsidian_vault_${Date.now()}.zip`,
    options: ObsidianExportOptions = {}
) {
    const zip = new JSZip()
    const lookup = buildRelatedRecordLookup(documents)
    const recordsById = new Map(documents.map((record) => [record.id, record]))
    const childrenByParentId = new Map<string, WorkspaceExportRecord[]>()
    const workspaceName = options.workspaceName?.trim() || options.workspaceId || documents[0]?.workspace_id || "workspace"

    documents.forEach((record) => {
        if (!record.parent_id) return
        const nextChildren = childrenByParentId.get(record.parent_id) ?? []
        nextChildren.push(record)
        childrenByParentId.set(record.parent_id, nextChildren)
    })

    const hasChildrenByRecordId = new Map<string, boolean>()
    const folderPathByRecordId = new Map<string, string>()

    documents.forEach((record) => {
        hasChildrenByRecordId.set(record.id, (childrenByParentId.get(record.id)?.length ?? 0) > 0)
    })

    const resolveRecordFolderPath = (record: WorkspaceExportRecord): string => {
        const cached = folderPathByRecordId.get(record.id)
        if (cached) return cached

        const entityKey = getEntityKeyFromSchemaId(record.schema_id)
        const defaultEntityFolder = entityKey ? ENTITY_CONFIG[entityKey].folderName : "Records"
        const ownFolderName = slugifyFolderName(record.id)

        let basePath = defaultEntityFolder
        if (record.parent_id) {
            const parentRecord = recordsById.get(record.parent_id)
            if (parentRecord && hasChildrenByRecordId.get(parentRecord.id)) {
                basePath = resolveRecordFolderPath(parentRecord)
            }
        }

        const resolved = `${basePath}/${ownFolderName}`
        folderPathByRecordId.set(record.id, resolved)
        return resolved
    }

    documents.forEach((record) => {
        if (hasChildrenByRecordId.get(record.id)) {
            resolveRecordFolderPath(record)
        }
    })

    for (const [entityKey, config] of Object.entries(ENTITY_CONFIG) as Array<[WorkspaceEntityKey, (typeof ENTITY_CONFIG)[WorkspaceEntityKey]]>) {
        const folder = zip.folder(config.folderName)
        if (!folder) continue

        const records = documents.filter((record) => getEntityKeyFromSchemaId(record.schema_id) === entityKey)

        for (const record of records) {
            const children = childrenByParentId.get(record.id) ?? []
            const frontmatter = buildEntityFrontmatter(record, entityKey, lookup, children)
            const body = buildEntityBody(record, entityKey, lookup, children)
            const markdown = `${yamlStringify(frontmatter)}${body}`
            const hasChildren = hasChildrenByRecordId.get(record.id) ?? false
            const parentFolderPath = record.parent_id ? folderPathByRecordId.get(record.parent_id) : undefined

            if (hasChildren) {
                const recordFolderPath = folderPathByRecordId.get(record.id) ?? `${config.folderName}/${slugifyFolderName(record.id)}`
                zip.file(`${recordFolderPath}/${slugifyFolderName(record.id)}.md`, markdown)
                continue
            }

            if (parentFolderPath) {
                zip.file(`${parentFolderPath}/${slugifyFolderName(record.id)}.md`, markdown)
                continue
            }

            folder.file(`${slugifyFolderName(record.id)}.md`, markdown)
        }
    }

    const templatesFolder = zip.folder("Default Templates")
    if (templatesFolder && options.schemaGroups) {
        options.schemaGroups.forEach((group) => {
            const groupFolder = templatesFolder.folder(slugifyFolderName(group.name || group.id))
            group.documents.forEach((schema) => {
                groupFolder?.file(
                    `${slugifyFolderName(schema.id)}.md`,
                    buildTemplateMarkdown(group.name, schema, options.specifications)
                )
            })
        })
    }

    if (templatesFolder && options.specificationRegistry && options.specifications) {
        templatesFolder.file(
            "Specifications.md",
            buildSpecificationMarkdown(options.specificationRegistry, options.specifications)
        )
    }

    zip.file("export-manifest.json", JSON.stringify(buildExportManifest(documents, workspaceName, options), null, 2))

    if (options.includeTutorial) {
        zip.file("00-Start-Here.md", buildTutorialMarkdown(workspaceName, Boolean(options.specificationRegistry?.length)))
    }

    const blob = await zip.generateAsync({ type: "blob" })
    await triggerBlobDownload(blob, fileName)
}

async function exportWorkspaceAsSpreadsheetBundle(documents: WorkspaceExportRecord[], format: "csv" | "xlsx") {
    const tables = createSpreadsheetTables(documents)

    if (format === "csv") {
        const zip = new JSZip()
        tables.forEach((table) => {
            const sheet = ensureWorkbookSheet(table.rows, table.columns)
            const csv = XLSX.utils.sheet_to_csv(sheet)
            zip.file(`${table.sheetName}.csv`, csv)
        })

        const blob = await zip.generateAsync({ type: "blob" })
        await triggerBlobDownload(blob, `workspace_csv_bundle_${Date.now()}.zip`)
        return
    }

    const workbook = XLSX.utils.book_new()
    tables.forEach((table) => {
        const sheet = ensureWorkbookSheet(table.rows, table.columns)
        XLSX.utils.book_append_sheet(workbook, sheet, table.sheetName)
    })

    const workbookBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
    const blob = new Blob([workbookBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    await triggerBlobDownload(blob, `workspace_tables_${Date.now()}.xlsx`)
}

async function inspectSpreadsheetFile(file: File): Promise<SpreadsheetInspectionResult> {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })

    const sheets = workbook.SheetNames.map((name) => {
        const worksheet = workbook.Sheets[name]
        const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: "" })
        const [headerRow = [], ...bodyRows] = rows
        const headers = headerRow.map((value) => String(value).trim()).filter(Boolean)
        const parsedRows = bodyRows
            .filter((row) => row.some((value) => String(value ?? "").trim().length > 0))
            .map((row) => {
                const record: Record<string, string> = {}
                headers.forEach((header, index) => {
                    record[header] = String(row[index] ?? "").trim()
                })
                return record
            })

        return {
            name,
            headers,
            rows: parsedRows,
        }
    })

    return {
        fileName: file.name,
        sheetNames: workbook.SheetNames,
        sheets,
    }
}

async function importVaultZip(file: File, workspaceId = "default"): Promise<VaultImportSummary> {
    const entries = await readZipMarkdownFiles(file)

    let recordsUpserted = 0
    let relationshipsResolved = 0

    const importedNotes = new Map<string, { id: string; entityKey: WorkspaceEntityKey; title: string; frontmatter: Record<string, unknown> }>()

    for (const entry of entries) {
        const frontmatter = isPlainObject(entry.frontmatter) ? { ...entry.frontmatter } : {}
        const id = typeof frontmatter.id === "string" && frontmatter.id.trim() ? frontmatter.id.trim() : crypto.randomUUID()
        const entityKey = getEntityKeyFromFrontmatter(frontmatter, entry.entityKey) ?? entry.entityKey
        const schemaId = ENTITY_CONFIG[entityKey].schemaId
        const title =
            (entityKey === "article" ? frontmatter.headline : frontmatter.name) ??
            frontmatter.title ??
            entry.title ??
            id

        const parentReference =
            typeof frontmatter.parent_id === "string" ? frontmatter.parent_id.trim() :
                typeof frontmatter.event === "string" ? frontmatter.event.trim() :
                    typeof frontmatter.parent_event === "string" ? frontmatter.parent_event.trim() :
                        undefined

        let parentId: string | null = null
        if (parentReference) {
            const entryLookup = buildRelatedRecordLookup(entries.map((item) => ({
                id: typeof item.frontmatter.id === "string" ? item.frontmatter.id : item.title,
                workspace_id: workspaceId,
                schema_id: ENTITY_CONFIG[item.entityKey].schemaId,
                title: item.title,
                frontmatter: item.frontmatter,
                body: item.body,
                parent_id: undefined,
                created_by: undefined,
                updated_by: undefined,
                created_at: undefined,
                updated_at: undefined,
                is_deleted: false,
            })))
            const resolved = extractWikiLinkTargets(parentReference)
                .map((reference) => resolveRecordReference(reference, entryLookup))
                .find(Boolean)
            if (resolved) {
                parentId = typeof resolved.frontmatter.id === "string" ? resolved.frontmatter.id : resolved.id
                relationshipsResolved += 1
            }
        }

        const importedFrontmatter = {
            ...frontmatter,
            id,
            title,
            schema_id: schemaId,
            workspace_id: workspaceId,
            parent_id: parentId ?? frontmatter.parent_id ?? undefined,
            event: entityKey === "article" || entityKey === "participant" ? frontmatter.event ?? frontmatter.parent_event : undefined,
        }

        const createdAt = typeof frontmatter.created_at === "number" ? frontmatter.created_at : Number(frontmatter.created_at) || Date.now()
        const updatedAt = typeof frontmatter.updated_at === "number" ? frontmatter.updated_at : Number(frontmatter.updated_at) || Date.now()

        await upsertImportedNote({
            id,
            workspaceId,
            schemaId,
            parentId,
            title: String(title),
            frontmatter: importedFrontmatter,
            body: entry.body,
            createdBy: typeof frontmatter.created_by === "string" ? frontmatter.created_by : null,
            updatedBy: typeof frontmatter.updated_by === "string" ? frontmatter.updated_by : null,
            createdAt,
            updatedAt,
            isDeleted: Boolean(frontmatter.is_deleted),
        })

        importedNotes.set(id, {
            id,
            entityKey,
            title: String(title),
            frontmatter: importedFrontmatter,
        })
        recordsUpserted += 1
    }

    const importedLookup = buildRelatedRecordLookup(entries.map((entry) => ({
        id: typeof entry.frontmatter.id === "string" ? entry.frontmatter.id : entry.title,
        workspace_id: workspaceId,
        schema_id: ENTITY_CONFIG[entry.entityKey].schemaId,
        title: entry.title,
        frontmatter: entry.frontmatter,
        body: entry.body,
        parent_id: undefined,
        created_by: undefined,
        updated_by: undefined,
        created_at: undefined,
        updated_at: undefined,
        is_deleted: false,
    })))

    for (const entry of entries) {
        if (entry.entityKey !== "event") continue
        const eventId = typeof entry.frontmatter.id === "string" ? entry.frontmatter.id : undefined
        if (!eventId) continue

        const relatedLinks = [
            ...extractWikiLinkTargets(entry.frontmatter.related_articles),
            ...extractWikiLinkTargets(entry.frontmatter.related_participants),
            ...extractWikiLinkTargets(entry.body),
        ]

        for (const link of relatedLinks) {
            const matched = importedLookup.byTitle.get(canonicalize(link))
            if (!matched) continue

            await dbClient.execute(
                `UPDATE notes
         SET parent_id = ?, updated_at = ?, synced_at = NULL
         WHERE workspace_id = ? AND id = ?`,
                [eventId, Date.now(), workspaceId, matched.id]
            )
            relationshipsResolved += 1
        }
    }

    return {
        filesProcessed: entries.length,
        recordsUpserted,
        relationshipsResolved,
    }
}

async function importSpreadsheetSheet(options: SpreadsheetImportOptions): Promise<SpreadsheetImportSummary> {
    const { entityKey, sheet, mapping, workspaceId = "default" } = options
    const schemaId = ENTITY_CONFIG[entityKey].schemaId
    let rowsProcessed = 0
    let recordsUpserted = 0

    for (const row of sheet.rows) {
        const importedFrontmatter: Record<string, unknown> = {}
        let id: string = crypto.randomUUID()
        let parentId: string | null = null
        let title = row[mapping.title ?? ""] ?? ""
        let body = ""

        for (const [column, targetField] of Object.entries(mapping)) {
            if (!targetField) continue
            const rawValue = row[column] ?? ""
            if (targetField === "id") {
                const nextId = rawValue.trim()
                if (nextId) id = nextId
                continue
            }

            if (targetField === "parent_id") {
                parentId = rawValue.trim() || null
                continue
            }

            if (targetField === "notes") {
                body = rawValue
                continue
            }

            if (targetField === "title") {
                title = rawValue
                continue
            }

            importedFrontmatter[targetField] = parseScalarValue(entityKey, targetField, rawValue)
        }

        if (!title.trim()) {
            title = String(
                entityKey === "article"
                    ? importedFrontmatter.headline ?? importedFrontmatter.title ?? id
                    : importedFrontmatter.name ?? importedFrontmatter.title ?? id
            )
        }

        importedFrontmatter.id = id
        importedFrontmatter.schema_id = schemaId
        importedFrontmatter.title = title
        importedFrontmatter.workspace_id = workspaceId
        if (parentId) {
            importedFrontmatter.parent_id = parentId
        }

        await upsertImportedNote({
            id,
            workspaceId,
            schemaId,
            parentId,
            title,
            frontmatter: importedFrontmatter,
            body,
            createdBy: typeof importedFrontmatter.created_by === "string" ? importedFrontmatter.created_by : null,
            updatedBy: typeof importedFrontmatter.updated_by === "string" ? importedFrontmatter.updated_by : null,
            createdAt: typeof importedFrontmatter.created_at === "number" ? importedFrontmatter.created_at : undefined,
            updatedAt: typeof importedFrontmatter.updated_at === "number" ? importedFrontmatter.updated_at : undefined,
            isDeleted: Boolean(importedFrontmatter.is_deleted),
        })

        rowsProcessed += 1
        recordsUpserted += 1
    }

    return {
        rowsProcessed,
        recordsUpserted,
    }
}

export type {
    ParsedSpreadsheetSheet,
    SpreadsheetImportMapping,
    SpreadsheetImportOptions,
    SpreadsheetInspectionResult,
    SpreadsheetImportSummary,
    VaultImportSummary,
    WorkspaceEntityKey,
    SpreadsheetTable,
    ObsidianExportOptions,
}

export {
    ENTITY_CONFIG,
    SPREADSHEET_SPECIAL_FIELDS,
    detectEntityFromPath,
    exportWorkspaceAsObsidianVault,
    exportWorkspaceAsSpreadsheetBundle,
    getEntityFieldType,
    getEntityKeyFromFrontmatter,
    getEntityKeyFromSchemaId,
    importSpreadsheetSheet,
    importVaultZip,
    inferEntityKeyFromSheetName,
    inspectSpreadsheetFile,
    parseScalarValue,
    splitFrontmatter,
}