import { useEffect, useMemo, useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DocumentSchema, DocumentSchemaGroup, FieldDataType, FieldDefinition, FieldInputType, SpecificationDefinition } from "@/lib/types"

const DATA_TYPES: FieldDataType[] = ["string", "array<string>", "hierarchical-select", "select", "number", "boolean", "date", "date-range", "markdown"]
const INPUT_TYPES: FieldInputType[] = ["text", "textarea", "select", "search-select-input", "date", "date-range", "text-multi", "checkbox", "switch"]

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
    subtypeFieldsText?: string
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

    return nextField
}

function SchemaManager({ groups, specificationRegistry, onSaveGroup, onDeleteGroup, onSaveSchema, onDeleteSchema }: SchemaManagerProps) {
    const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(groups[0]?.id)
    const [selectedSchemaId, setSelectedSchemaId] = useState<string | undefined>(groups[0]?.documents[0]?.id)
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
        () => groups.flatMap((group) => group.documents).find((schema) => schema.id === selectedSchemaId),
        [groups, selectedSchemaId]
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
        }
    }, [selectedSchema])

    const resetGroupDraft = () => {
        setSelectedGroupId(undefined)
        setGroupDraft({ id: crypto.randomUUID(), name: "", description: "" })
    }

    const resetSchemaDraft = () => {
        setSelectedSchemaId(undefined)
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
    }

    const handleSaveCurrentGroup = () => {
        if (!groupDraft.name.trim()) return
        onSaveGroup({
            id: groupDraft.id || crypto.randomUUID(),
            name: groupDraft.name.trim(),
            description: groupDraft.description.trim() || undefined,
            documents: selectedGroup?.documents ?? [],
        })
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
    }

    return (
        <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <section className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">Schema Groups</h4>
                        <Button type="button" variant="outline" size="sm" onClick={resetGroupDraft}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            New Group
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {groups.map((group) => (
                            <button
                                key={group.id}
                                type="button"
                                onClick={() => {
                                    setSelectedGroupId(group.id)
                                    setSelectedSchemaId(group.documents[0]?.id)
                                }}
                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedGroupId === group.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                            >
                                <div className="font-medium">{group.name}</div>
                                <div className="text-xs text-muted-foreground">{group.documents.length} schema{group.documents.length === 1 ? "" : "s"}</div>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-2 rounded-xl border p-3">
                        <Input value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Group name" />
                        <Textarea value={groupDraft.description} onChange={(event) => setGroupDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Group description" className="min-h-20" />
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
                </section>

                <section className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">Schemas</h4>
                        <Button type="button" variant="outline" size="sm" onClick={resetSchemaDraft}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            New Schema
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {(selectedGroup?.documents ?? []).map((schema) => (
                            <button
                                key={schema.id}
                                type="button"
                                onClick={() => setSelectedSchemaId(schema.id)}
                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedSchemaId === schema.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                            >
                                <div className="font-medium">{schema.name}</div>
                                <div className="text-xs text-muted-foreground">{schema.fields.length} field{schema.fields.length === 1 ? "" : "s"}</div>
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                        <Input value={schemaDraft.name} onChange={(event) => setSchemaDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Schema name" />
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
                        <Input value={schemaDraft.description ?? ""} onChange={(event) => setSchemaDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Schema description" />
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

                    <div className="space-y-3 rounded-xl border p-3">
                        <div className="flex items-center justify-between gap-2">
                            <h5 className="text-sm font-medium">Fields</h5>
                            <Button type="button" variant="outline" size="sm" onClick={() => setSchemaDraft((current) => ({ ...current, fields: [...current.fields, createEmptyField()] }))}>
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Add Field
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {schemaDraft.fields.map((field, index) => (
                                <div key={`${field.name}-${index}`} className="rounded-xl border p-3 space-y-2">
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <Input value={field.name} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Field key" />
                                        <Input value={field.label} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} placeholder="Field label" />
                                        <Select value={field.type.data} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, type: { ...item.type, data: value as FieldDataType } } : item) }))}>
                                            <SelectTrigger><SelectValue placeholder="Data type" /></SelectTrigger>
                                            <SelectContent>{DATA_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={field.type.input} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, type: { ...item.type, input: value as FieldInputType } } : item) }))}>
                                            <SelectTrigger><SelectValue placeholder="Input type" /></SelectTrigger>
                                            <SelectContent>{INPUT_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Input value={field.default == null ? "" : String(field.default)} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, default: event.target.value } : item) }))} placeholder="Default value" />
                                        <Input value={field.description ?? ""} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} placeholder="Description" />
                                    </div>

                                    {field.type.input === "search-select-input" ? (
                                        <div className="grid gap-2 md:grid-cols-2">
                                            <Select value={field.specification ?? "__none__"} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, specification: !value || value === "__none__" ? undefined : value } : item) }))}>
                                                <SelectTrigger><SelectValue placeholder="Specification source" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">No specification source</SelectItem>
                                                    {specificationRegistry.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.id})</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ) : null}

                                    <Textarea value={field.optionsText} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, optionsText: event.target.value } : item) }))} placeholder={field.type.input === "search-select-input" ? "Optional fallback options" : field.type.data === "hierarchical-select" ? "Options JSON" : "One option per line or JSON array"} className="min-h-24" />

                                    <div className="grid gap-2 md:grid-cols-4">
                                        <Input value={field.visibility?.dependsOn ?? ""} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, visibility: { ...item.visibility, dependsOn: event.target.value, operator: item.visibility?.operator ?? "eq" } } : item) }))} placeholder="Visibility dependsOn" />
                                        <Select value={field.visibility?.operator ?? "eq"} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, visibility: { ...item.visibility, dependsOn: item.visibility?.dependsOn ?? "", operator: value as "eq" | "neq" | "includes" | "notEmpty", value: item.visibility?.value } } : item) }))}>
                                            <SelectTrigger><SelectValue placeholder="Operator" /></SelectTrigger>
                                            <SelectContent>
                                                {(["eq", "neq", "includes", "notEmpty"] as const).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Input value={field.visibility?.value == null ? "" : String(field.visibility.value)} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, visibility: { ...item.visibility, dependsOn: item.visibility?.dependsOn ?? "", operator: item.visibility?.operator ?? "eq", value: event.target.value } } : item) }))} placeholder="Visibility value" />
                                        <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
                                            <input type="checkbox" checked={field.required ?? false} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item) }))} />
                                            Required
                                        </label>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-4">
                                        <Select value={field.generator?.strategy ?? "__none__"} onValueChange={(value) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, generator: value === "__none__" ? undefined : { ...item.generator, strategy: value as "uuid" | "timestamp" | "pattern" } } : item) }))}>
                                            <SelectTrigger><SelectValue placeholder="Generator" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">No generator</SelectItem>
                                                <SelectItem value="uuid">uuid</SelectItem>
                                                <SelectItem value="timestamp">timestamp</SelectItem>
                                                <SelectItem value="pattern">pattern</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input value={field.generator?.pattern ?? ""} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, generator: { ...item.generator, strategy: item.generator?.strategy ?? "pattern", pattern: event.target.value } } : item) }))} placeholder="Generator pattern" />
                                        <Input value={field.generator?.prefix ?? ""} onChange={(event) => setSchemaDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, generator: { ...item.generator, strategy: item.generator?.strategy ?? "pattern", prefix: event.target.value } } : item) }))} placeholder="Generator prefix" />
                                        <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => setSchemaDraft((current) => ({ ...current, fields: current.fields.filter((_, itemIndex) => itemIndex !== index) }))}>
                                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                                            Remove field
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Textarea value={schemaDraft.subtypeFieldsText} onChange={(event) => setSchemaDraft((current) => ({ ...current, subtypeFieldsText: event.target.value }))} placeholder="Subtype fields JSON (optional)" className="min-h-28" />

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
                </section>
            </div>
        </div>
    )
}

export { SchemaManager }