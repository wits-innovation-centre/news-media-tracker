import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DocumentSchema, DocumentSchemaGroup, FieldDataType, FieldDefinition, FieldInputType, SpecificationDefinition } from "@/lib/types"

const DATA_TYPES: FieldDataType[] = ["string", "array<string>", "hierarchical-select", "select", "number", "boolean", "date", "date-range", "markdown", "form"]
const INPUT_TYPES: FieldInputType[] = ["text", "textarea", "select", "search-select", "search-select-input", "date", "date-range", "text-multi", "checkbox", "switch", "subtype-form-select", "embedded-form-list"]

interface SchemaManagerProps {
    groups: DocumentSchemaGroup[]
    specificationRegistry: SpecificationDefinition[]
    onSaveGroup: (group: DocumentSchemaGroup) => void
    onDeleteGroup: (groupId: string) => void
    onSaveSchema: (schema: DocumentSchema) => void
    onDeleteSchema: (schemaId: string) => void
}

interface EditableField extends FieldDefinition {
    optionsText: string
    tooltipKind: "help" | "warn" | "info"
    tooltipUseIcon: boolean
    tooltipMessage: string
}

function createEmptyField(): EditableField {
    return {
        name: "",
        label: "",
        type: { data: "string", input: "text" },
        required: false,
        description: "",
        optionsText: "",
        specification: undefined,
        tooltipKind: "info",
        tooltipUseIcon: true,
        tooltipMessage: "",
    }
}

function schemaToEditableFields(schema?: DocumentSchema): EditableField[] {
    if (!schema) return [createEmptyField()]

    return schema.fields.map((field) => ({
        ...field,
        optionsText: field.options
            ? Array.isArray(field.options)
                ? field.options.join("\n")
                : JSON.stringify(field.options, null, 2)
            : "",
        tooltipKind: field.tooltip?.kind ?? "info",
        tooltipUseIcon: field.tooltip?.useIcon ?? true,
        tooltipMessage: field.tooltip?.message ?? "",
    }))
}

function parseField(field: EditableField): FieldDefinition {
    const nextField: FieldDefinition = {
        name: field.name.trim(),
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        description: field.description?.trim() || undefined,
        default: field.default === "" ? undefined : field.default,
        generator: field.generator,
        visibility: field.visibility?.dependsOn ? field.visibility : undefined,
        specification: field.specification,
    }

    if (field.optionsText.trim()) {
        if (field.type.data === "hierarchical-select") {
            nextField.options = JSON.parse(field.optionsText)
        } else {
            const maybeJson = field.optionsText.trim()
            nextField.options = maybeJson.startsWith("[")
                ? JSON.parse(maybeJson)
                : maybeJson.split("\n").map((item) => item.trim()).filter(Boolean)
        }
    }

    if (field.tooltipMessage.trim()) {
        nextField.tooltip = {
            kind: field.tooltipKind,
            useIcon: field.tooltipUseIcon,
            message: field.tooltipMessage.trim(),
        }
    }

    return nextField
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    if (fromIndex === toIndex) return items
    const nextItems = [...items]
    const [moved] = nextItems.splice(fromIndex, 1)
    nextItems.splice(toIndex, 0, moved)
    return nextItems
}

const DATA_TYPE_GUIDANCE: Partial<Record<FieldDataType, string>> = {
    "array<string>": "Use this for multi-value entries. Pick an input that supports repeated values.",
    "hierarchical-select": "Expect nested options JSON with levels (for example Province -> Town).",
    "date-range": "Stores a start and end value; make sure downstream filters handle ranges.",
    "markdown": "Best for longer rich text notes that can include formatting.",
    form: "Use form inputs when this field controls a composite UI (for example subtype or embedded records).",
}

const INPUT_TYPE_GUIDANCE: Partial<Record<FieldInputType, string>> = {
    "search-select": "Searches and selects from existing options only.",
    "search-select-input": "Lets users search existing options and create a new value when needed.",
    "text-multi": "Use for multiple free-text values (aliases, tags, and similar lists).",
    "subtype-form-select": "Switches the active subtype and displays subtype-specific fields.",
    "embedded-form-list": "Manages linked documents directly from this field.",
    switch: "Use with a short option set, typically binary states.",
}

const GENERATOR_GUIDANCE: Record<"uuid" | "timestamp" | "pattern", string> = {
    uuid: "Generates a random unique identifier automatically.",
    timestamp: "Generates a time-based value; useful for sortable IDs.",
    pattern: "Builds values from tokens like {date} and {rand:n}. Example: evt-{date}-{rand:6}.",
}

function buildFieldGuidance(field: EditableField): string[] {
    const guidance: string[] = []
    const dataHint = DATA_TYPE_GUIDANCE[field.type.data]
    const inputHint = INPUT_TYPE_GUIDANCE[field.type.input]

    if (dataHint) guidance.push(`Data type: ${dataHint}`)
    if (inputHint) guidance.push(`Input type: ${inputHint}`)

    if (field.generator?.strategy) {
        guidance.push(`Generator: ${GENERATOR_GUIDANCE[field.generator.strategy]}`)
    }

    if (field.type.input === "search-select-input" && !field.specification) {
        guidance.push("Consider setting a specification source so users search from maintained vocabularies.")
    }

    if (field.type.input === "embedded-form-list" && !field.linkTo) {
        guidance.push("Set linkTo so this field knows which schema to embed.")
    }

    return guidance
}

function SchemaManager({ groups, specificationRegistry, onSaveGroup, onDeleteGroup, onSaveSchema, onDeleteSchema }: SchemaManagerProps) {
    const [viewLevel, setViewLevel] = useState<"groups" | "schemas">("groups")
    const [mobileExpanded, setMobileExpanded] = useState<"groups" | "schemas" | "fields" | null>("groups")
    const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(groups[0]?.id)
    const [selectedSchemaId, setSelectedSchemaId] = useState<string | undefined>()
    const [showGroupEditor, setShowGroupEditor] = useState(false)
    const [showSchemaEditor, setShowSchemaEditor] = useState(false)
    const [expandedFieldIndex, setExpandedFieldIndex] = useState<number | null>(0)
    const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null)
    const [groupDraft, setGroupDraft] = useState({ id: "", name: "", description: "" })
    const [schemaDraft, setSchemaDraft] = useState<Omit<DocumentSchema, "fields"> & { fields: EditableField[]; subtypeFieldsText: string }>({
        id: "",
        name: "",
        description: "",
        parentSchemaId: undefined,
        groupId: groups[0]?.id,
        groupName: groups[0]?.name,
        fields: [createEmptyField()],
        subtypeFieldsText: "",
    })

    const selectedGroup = useMemo(
        () => groups.find((group) => group.id === selectedGroupId),
        [groups, selectedGroupId]
    )

    const selectedSchema = useMemo(
        () => selectedGroup?.documents.find((schema) => schema.id === selectedSchemaId),
        [selectedGroup, selectedSchemaId]
    )

    useEffect(() => {
        if (!selectedGroup && groups.length > 0) {
            setSelectedGroupId(groups[0].id)
        }
    }, [groups, selectedGroup])

    useEffect(() => {
        if (selectedGroup) {
            setGroupDraft({
                id: selectedGroup.id,
                name: selectedGroup.name,
                description: selectedGroup.description ?? "",
            })
        }
    }, [selectedGroup])

    useEffect(() => {
        if (selectedSchema) {
            setSchemaDraft({
                id: selectedSchema.id,
                name: selectedSchema.name,
                description: selectedSchema.description ?? "",
                parentSchemaId: selectedSchema.parentSchemaId,
                groupId: selectedSchema.groupId,
                groupName: selectedSchema.groupName,
                fields: schemaToEditableFields(selectedSchema),
                subtypeFieldsText: selectedSchema.subtypeFields ? JSON.stringify(selectedSchema.subtypeFields, null, 2) : "",
            })
            setExpandedFieldIndex(0)
            setShowSchemaEditor(true)
        }
    }, [selectedSchema])

    useEffect(() => {
        if (schemaDraft.fields.length === 0) {
            setExpandedFieldIndex(null)
            return
        }

        if (expandedFieldIndex == null || expandedFieldIndex > schemaDraft.fields.length - 1) {
            setExpandedFieldIndex(schemaDraft.fields.length - 1)
        }
    }, [expandedFieldIndex, schemaDraft.fields.length])

    const resetGroupDraft = () => {
        setViewLevel("groups")
        setSelectedSchemaId(undefined)
        setGroupDraft({ id: crypto.randomUUID(), name: "", description: "" })
        setShowGroupEditor(true)
    }

    const resetSchemaDraft = () => {
        setViewLevel("schemas")
        setSelectedSchemaId(undefined)
        setShowSchemaEditor(true)
        setSchemaDraft({
            id: crypto.randomUUID(),
            name: "",
            description: "",
            parentSchemaId: undefined,
            groupId: selectedGroupId,
            groupName: selectedGroup?.name,
            fields: [createEmptyField()],
            subtypeFieldsText: "",
        })
        setExpandedFieldIndex(0)
        setShowSchemaEditor(true)
    }

    const updateFieldAt = (index: number, updater: (field: EditableField) => EditableField) => {
        setSchemaDraft((current) => ({
            ...current,
            fields: current.fields.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
        }))
    }

    const cycleExpandedField = (delta: -1 | 1) => {
        if (schemaDraft.fields.length === 0) return
        const currentIndex = expandedFieldIndex == null ? 0 : expandedFieldIndex
        const next = (currentIndex + delta + schemaDraft.fields.length) % schemaDraft.fields.length
        setExpandedFieldIndex(next)
    }

    const handleDropField = (targetIndex: number) => {
        if (draggedFieldIndex == null || draggedFieldIndex === targetIndex) {
            setDraggedFieldIndex(null)
            return
        }

        setSchemaDraft((current) => ({
            ...current,
            fields: moveItem(current.fields, draggedFieldIndex, targetIndex),
        }))

        if (expandedFieldIndex === draggedFieldIndex) {
            setExpandedFieldIndex(targetIndex)
        }

        setDraggedFieldIndex(null)
    }

    const handleSaveCurrentGroup = () => {
        if (!groupDraft.name.trim()) return
        const existingGroup = groups.find((group) => group.id === groupDraft.id)
        onSaveGroup({
            id: groupDraft.id || crypto.randomUUID(),
            name: groupDraft.name.trim(),
            description: groupDraft.description.trim() || undefined,
            documents: existingGroup?.documents ?? [],
        })
        setShowGroupEditor(false)
    }

    const handleSaveCurrentSchema = () => {
        if (!schemaDraft.name.trim() || !schemaDraft.groupId) return

        const group = groups.find((item) => item.id === schemaDraft.groupId)
        const schema: DocumentSchema = {
            id: schemaDraft.id || crypto.randomUUID(),
            name: schemaDraft.name.trim(),
            description: (schemaDraft.description ?? "").trim() || undefined,
            parentSchemaId: schemaDraft.parentSchemaId || undefined,
            groupId: schemaDraft.groupId,
            groupName: group?.name,
            fields: schemaDraft.fields.filter((field) => field.name.trim() && field.label.trim()).map(parseField),
            subtypeFields: schemaDraft.subtypeFieldsText.trim() ? JSON.parse(schemaDraft.subtypeFieldsText) : undefined,
        }

        onSaveSchema(schema)
        setSelectedGroupId(schema.groupId)
        setSelectedSchemaId(schema.id)
        setViewLevel("schemas")
        setShowSchemaEditor(false)
    }

    const renderGroupEditorContent = () => (
        <div className="space-y-3">
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Group name</label>
                <Input value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Group name" />
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Group description</label>
                <Textarea value={groupDraft.description} onChange={(event) => setGroupDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Group description" className="min-h-20" />
            </div>
            <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleSaveCurrentGroup}>
                    <Save className="mr-1 h-3.5 w-3.5" />
                    Save Group
                </Button>
                {selectedGroup ? (
                    <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteGroup(selectedGroup.id)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete Group
                    </Button>
                ) : null}
            </div>
        </div>
    )

    const renderSchemaEditorContent = () => (
        <div className="space-y-3">
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Schema name</label>
                <Input value={schemaDraft.name} onChange={(event) => setSchemaDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Schema name" />
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Group assignment</label>
                <Select value={schemaDraft.groupId ?? ""} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, groupId: value ?? undefined }))}>
                    <SelectTrigger>
                        <SelectValue placeholder="Assign group" />
                    </SelectTrigger>
                    <SelectContent>
                        {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Schema description</label>
                <Input value={schemaDraft.description ?? ""} onChange={(event) => setSchemaDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Schema description" />
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Parent schema</label>
                <Select value={schemaDraft.parentSchemaId ?? "__none__"} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, parentSchemaId: !value || value === "__none__" ? undefined : value }))}>
                    <SelectTrigger>
                        <SelectValue placeholder="Parent schema" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">No parent</SelectItem>
                        {groups.flatMap((group) => group.documents).filter((schema) => schema.id !== schemaDraft.id).map((schema) => (
                            <SelectItem key={schema.id} value={schema.id}>{schema.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Subtype fields JSON</label>
                <Textarea value={schemaDraft.subtypeFieldsText} onChange={(event) => setSchemaDraft((current) => ({ ...current, subtypeFieldsText: event.target.value }))} placeholder="Subtype fields JSON (optional)" className="min-h-28" />
            </div>

            <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleSaveCurrentSchema}>
                    <Save className="mr-1 h-3.5 w-3.5" />
                    Save Schema
                </Button>
                {selectedSchema ? (
                    <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteSchema(selectedSchema.id)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete Schema
                    </Button>
                ) : null}
            </div>
        </div>
    )

    const renderSelectedSchemaEditor = () => {
        if (!selectedSchema) return null

        return (
            <div className="rounded-xl border p-3">
                <button
                    type="button"
                    onClick={() => setShowSchemaEditor((current) => !current)}
                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                >
                    <span>{schemaDraft.name || "Selected Schema"} Editor</span>
                    {showSchemaEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showSchemaEditor ? <div className="mt-3">{renderSchemaEditorContent()}</div> : null}
            </div>
        )
    }

    const renderFieldsPanelContent = () => (
        <>
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium">Fields in {schemaDraft.name || "Selected Schema"}</h4>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => cycleExpandedField(-1)} disabled={schemaDraft.fields.length < 2}>
                        <ChevronUp className="mr-1 h-3.5 w-3.5" />
                        Prev
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cycleExpandedField(1)} disabled={schemaDraft.fields.length < 2}>
                        <ChevronDown className="mr-1 h-3.5 w-3.5" />
                        Next
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {schemaDraft.fields.map((field, index) => {
                    const isExpanded = expandedFieldIndex === index
                    return (
                        <div
                            key={`${field.name || "field"}-${index}`}
                            draggable
                            onDragStart={() => setDraggedFieldIndex(index)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => handleDropField(index)}
                            onDragEnd={() => setDraggedFieldIndex(null)}
                            className={`rounded-xl border p-3 ${draggedFieldIndex === index ? "opacity-70" : "opacity-100"}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setExpandedFieldIndex(index)}
                                    className="flex flex-1 items-center gap-2 text-left"
                                >
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <div className="text-sm font-medium">{field.label || `Field ${index + 1}`}</div>
                                        <div className="text-xs text-muted-foreground">{field.name || "unnamed"} · {field.type.input}</div>
                                    </div>
                                </button>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedFieldIndex(isExpanded ? null : index)}>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </div>

                            {isExpanded ? (
                                <div className="mt-3 space-y-4">
                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</div>
                                        <div className="space-y-3 rounded-xl border p-3">
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Field key</label>
                                                <Input value={field.name} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, name: event.target.value }))} placeholder="field_key" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Field label</label>
                                                <Input value={field.label} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, label: event.target.value }))} placeholder="Field Label" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Description</label>
                                                <Input value={field.description ?? ""} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, description: event.target.value }))} placeholder="How this field should be used" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</div>
                                        <div className="space-y-3 rounded-xl border p-3">
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Data type</label>
                                                <Select value={field.type.data} onValueChange={(value) => updateFieldAt(index, (item) => ({ ...item, type: { ...item.type, data: value as FieldDataType } }))}>
                                                    <SelectTrigger><SelectValue placeholder="Data type" /></SelectTrigger>
                                                    <SelectContent>{DATA_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Input component</label>
                                                <Select value={field.type.input} onValueChange={(value) => updateFieldAt(index, (item) => ({ ...item, type: { ...item.type, input: value as FieldInputType } }))}>
                                                    <SelectTrigger><SelectValue placeholder="Input type" /></SelectTrigger>
                                                    <SelectContent>{INPUT_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Default value</label>
                                                <Input value={field.default == null ? "" : String(field.default)} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, default: event.target.value }))} placeholder="Optional default value" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Options and Source</div>
                                        <div className="space-y-3 rounded-xl border p-3">
                                            {field.type.input === "search-select-input" ? (
                                                <div className="space-y-1">
                                                    <label className="text-xs text-muted-foreground">Specification source</label>
                                                    <Select value={field.specification ?? "__none__"} onValueChange={(value) => updateFieldAt(index, (item) => ({ ...item, specification: !value || value === "__none__" ? undefined : value }))}>
                                                        <SelectTrigger><SelectValue placeholder="Specification source" /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="__none__">No specification source</SelectItem>
                                                            {specificationRegistry.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.id})</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ) : null}

                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Options</label>
                                                <Textarea
                                                    value={field.optionsText}
                                                    onChange={(event) => updateFieldAt(index, (item) => ({ ...item, optionsText: event.target.value }))}
                                                    placeholder={field.type.input === "search-select-input" ? "Optional fallback options" : field.type.data === "hierarchical-select" ? "Options JSON" : "One option per line or JSON array"}
                                                    className="min-h-24"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibility and Rules</div>
                                        <div className="space-y-3 rounded-xl border p-3">
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Visibility depends on</label>
                                                <Input value={field.visibility?.dependsOn ?? ""} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, visibility: { ...item.visibility, dependsOn: event.target.value, operator: item.visibility?.operator ?? "eq" } }))} placeholder="other_field_key" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Visibility operator</label>
                                                <Select value={field.visibility?.operator ?? "eq"} onValueChange={(value) => updateFieldAt(index, (item) => ({ ...item, visibility: { ...item.visibility, dependsOn: item.visibility?.dependsOn ?? "", operator: value as "eq" | "neq" | "includes" | "notEmpty", value: item.visibility?.value } }))}>
                                                    <SelectTrigger><SelectValue placeholder="Operator" /></SelectTrigger>
                                                    <SelectContent>
                                                        {(["eq", "neq", "includes", "notEmpty"] as const).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Visibility value</label>
                                                <Input value={field.visibility?.value == null ? "" : String(field.visibility.value)} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, visibility: { ...item.visibility, dependsOn: item.visibility?.dependsOn ?? "", operator: item.visibility?.operator ?? "eq", value: event.target.value } }))} placeholder="Value to compare against" />
                                            </div>
                                            <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
                                                <input type="checkbox" checked={field.required ?? false} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, required: event.target.checked }))} />
                                                Required field
                                            </label>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tooltip</div>
                                        <div className="space-y-3 rounded-xl border p-3">
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Tooltip kind</label>
                                                <Select value={field.tooltipKind} onValueChange={(value) => updateFieldAt(index, (item) => ({ ...item, tooltipKind: value as "help" | "warn" | "info" }))}>
                                                    <SelectTrigger><SelectValue placeholder="Tooltip kind" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="help">help</SelectItem>
                                                        <SelectItem value="warn">warn</SelectItem>
                                                        <SelectItem value="info">info</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Tooltip message</label>
                                                <Input value={field.tooltipMessage} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, tooltipMessage: event.target.value }))} placeholder="Explain how this field works" />
                                            </div>
                                            <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
                                                <input type="checkbox" checked={field.tooltipUseIcon} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, tooltipUseIcon: event.target.checked }))} />
                                                Show tooltip icon
                                            </label>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generator</div>
                                        <div className="space-y-3 rounded-xl border p-3">
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Generator strategy</label>
                                                <Select value={field.generator?.strategy ?? "__none__"} onValueChange={(value) => updateFieldAt(index, (item) => ({ ...item, generator: value === "__none__" ? undefined : { ...item.generator, strategy: value as "uuid" | "timestamp" | "pattern" } }))}>
                                                    <SelectTrigger><SelectValue placeholder="Generator" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__none__">No generator</SelectItem>
                                                        <SelectItem value="uuid">uuid</SelectItem>
                                                        <SelectItem value="timestamp">timestamp</SelectItem>
                                                        <SelectItem value="pattern">pattern</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Generator pattern</label>
                                                <Input value={field.generator?.pattern ?? ""} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, generator: { ...item.generator, strategy: item.generator?.strategy ?? "pattern", pattern: event.target.value } }))} placeholder="evt-{date}-{rand:6}" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Generator prefix</label>
                                                <Input value={field.generator?.prefix ?? ""} onChange={(event) => updateFieldAt(index, (item) => ({ ...item, generator: { ...item.generator, strategy: item.generator?.strategy ?? "pattern", prefix: event.target.value } }))} placeholder="Optional prefix" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built-in Guidance</div>
                                        <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                                            {buildFieldGuidance(field).length > 0 ? (
                                                <div className="space-y-1">
                                                    {buildFieldGuidance(field).map((hint, hintIndex) => (
                                                        <p key={`${field.name || index}-hint-${hintIndex}`}>{hint}</p>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p>No specific guidance for this combination yet.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="justify-start"
                                            onClick={() => {
                                                setSchemaDraft((current) => ({ ...current, fields: current.fields.filter((_, itemIndex) => itemIndex !== index) }))
                                                setExpandedFieldIndex((prev) => {
                                                    if (prev == null) return null
                                                    return index <= prev ? Math.max(0, prev - 1) : prev
                                                })
                                            }}
                                        >
                                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                                            Remove field
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            <div className="flex justify-end pt-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setSchemaDraft((current) => ({ ...current, fields: [...current.fields, createEmptyField()] }))
                        setExpandedFieldIndex(schemaDraft.fields.length)
                    }}
                >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Field
                </Button>
            </div>
        </>
    )

    return (
        <div className="space-y-5">
            <div className="space-y-3 lg:hidden">
                <section className="rounded-2xl border p-4">
                    <button
                        type="button"
                        onClick={() => setMobileExpanded((current) => current === "groups" ? null : "groups")}
                        className="flex w-full items-center justify-between text-left"
                    >
                        <h4 className="text-sm font-medium">Groups</h4>
                        {mobileExpanded === "groups" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {mobileExpanded === "groups" ? (
                        <div className="mt-3 space-y-3">
                            <div className="space-y-2">
                                {groups.map((group) => (
                                    <button
                                        key={group.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedGroupId(group.id)
                                            setSelectedSchemaId(undefined)
                                            setViewLevel("groups")
                                            setMobileExpanded("schemas")
                                            setShowGroupEditor(false)
                                        }}
                                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedGroupId === group.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                                    >
                                        <div className="font-medium">{group.name}</div>
                                        <div className="text-xs text-muted-foreground">{group.documents.length} schema{group.documents.length === 1 ? "" : "s"}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="rounded-xl border p-3">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupEditor((current) => !current)}
                                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                                >
                                    <span>{groupDraft.name || "Selected Group"} Editor</span>
                                    {showGroupEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                                {showGroupEditor ? <div className="mt-3">{renderGroupEditorContent()}</div> : null}
                            </div>

                            <div className="flex justify-end">
                                <Button type="button" variant="outline" size="sm" onClick={resetGroupDraft}>
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    New Group
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </section>

                <section className="rounded-2xl border p-4">
                    <button
                        type="button"
                        onClick={() => selectedGroup && setMobileExpanded((current) => current === "schemas" ? null : "schemas")}
                        className="flex w-full items-center justify-between text-left"
                    >
                        <h4 className="text-sm font-medium">Schemas</h4>
                        {mobileExpanded === "schemas" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {mobileExpanded === "schemas" ? (
                        <div className="mt-3 space-y-3">
                            {!selectedGroup ? (
                                <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                    Select a group first.
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        {selectedGroup.documents.map((schema) => (
                                            <button
                                                key={schema.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSchemaId(schema.id)
                                                    setViewLevel("schemas")
                                                    setMobileExpanded("fields")
                                                    setShowSchemaEditor(false)
                                                }}
                                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedSchemaId === schema.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                                            >
                                                <div className="font-medium">{schema.name}</div>
                                                <div className="text-xs text-muted-foreground">{schema.fields.length} field{schema.fields.length === 1 ? "" : "s"}</div>
                                            </button>
                                        ))}
                                    </div>

                                    {renderSelectedSchemaEditor()}

                                    <div className="flex justify-end">
                                        <Button type="button" variant="outline" size="sm" onClick={resetSchemaDraft}>
                                            <Plus className="mr-1 h-3.5 w-3.5" />
                                            New Schema
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : null}
                </section>

                <section className="rounded-2xl border p-4">
                    <button
                        type="button"
                        onClick={() => selectedSchema && setMobileExpanded((current) => current === "fields" ? null : "fields")}
                        className="flex w-full items-center justify-between text-left"
                    >
                        <h4 className="text-sm font-medium">Fields</h4>
                        {mobileExpanded === "fields" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {mobileExpanded === "fields" ? (
                        <div className="mt-3 space-y-3">
                            {!selectedSchema ? (
                                <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                    Select a schema first.
                                </div>
                            ) : renderFieldsPanelContent()}
                        </div>
                    ) : null}
                </section>
            </div>

            <div className="hidden gap-4 lg:grid lg:grid-cols-[0.9fr_1.1fr]">
                <section className="flex h-[78vh] flex-col rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {viewLevel === "schemas" ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                        setViewLevel("groups")
                                        setSelectedSchemaId(undefined)
                                        setShowSchemaEditor(false)
                                    }}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            ) : null}
                            <h4 className="text-sm font-medium">{viewLevel === "groups" ? "Schema Groups" : "Schemas"}</h4>
                        </div>

                    </div>

                    <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
                        <div className="space-y-2">
                            {viewLevel === "groups"
                                ? groups.map((group) => (
                                    <button
                                        key={group.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedGroupId(group.id)
                                            setShowGroupEditor(false)
                                        }}
                                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedGroupId === group.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                                    >
                                        <div className="font-medium">{group.name}</div>
                                        <div className="text-xs text-muted-foreground">{group.documents.length} schema{group.documents.length === 1 ? "" : "s"}</div>
                                    </button>
                                ))
                                : (selectedGroup?.documents ?? []).map((schema) => (
                                    <button
                                        key={schema.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedSchemaId(schema.id)
                                            setShowSchemaEditor(true)
                                        }}
                                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedSchemaId === schema.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                                    >
                                        <div className="font-medium">{schema.name}</div>
                                        <div className="text-xs text-muted-foreground">{schema.fields.length} field{schema.fields.length === 1 ? "" : "s"}</div>
                                    </button>
                                ))}
                        </div>

                        {viewLevel === "groups" ? (
                            <div className="rounded-xl border p-3">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupEditor((current) => !current)}
                                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                                >
                                    <span>{groupDraft.name || "Selected Group"} Editor</span>
                                    {showGroupEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>

                                {showGroupEditor ? <div className="mt-3">{renderGroupEditorContent()}</div> : null}
                            </div>
                        ) : (
                            renderSelectedSchemaEditor()
                        )}

                        <div className="flex justify-end pt-1">
                            {viewLevel === "groups" ? (
                                <Button type="button" variant="outline" size="sm" onClick={resetGroupDraft}>
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    New Group
                                </Button>
                            ) : (
                                <Button type="button" variant="outline" size="sm" onClick={resetSchemaDraft}>
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    New Schema
                                </Button>
                            )}
                        </div>
                    </div>
                </section>

                <section className="flex h-[78vh] flex-col rounded-2xl border p-4">
                    {viewLevel === "groups" ? (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-medium">Schemas in {selectedGroup?.name ?? "Selected Group"}</h4>
                            </div>

                            {!selectedGroup ? (
                                <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                    Select a schema group to view its schemas.
                                </div>
                            ) : (
                                <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
                                    {selectedGroup.documents.map((schema) => (
                                        <button
                                            key={schema.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedSchemaId(schema.id)
                                                setViewLevel("schemas")
                                                setShowSchemaEditor(true)
                                            }}
                                            className="w-full rounded-xl border px-3 py-2 text-left text-sm hover:bg-muted/50"
                                        >
                                            <div className="font-medium">{schema.name}</div>
                                            <div className="text-xs text-muted-foreground">{schema.fields.length} field{schema.fields.length === 1 ? "" : "s"}</div>
                                        </button>
                                    ))}
                                    {selectedGroup.documents.length === 0 ? (
                                        <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                            No schemas in this group yet. Use New Schema to create one.
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-3">
                            {renderSelectedSchemaEditor()}
                            {renderFieldsPanelContent()}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

export { SchemaManager }