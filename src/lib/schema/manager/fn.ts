import {
    DATA_TO_INPUT,
    type DocumentSchema,
    type FieldDataType,
    type FieldDefinition,
    type FieldInputType,
} from "@/lib/types"

export interface EditableField {
    name: string
    label: string
    type: {
        data: FieldDataType
        input: FieldInputType
    }
    required?: boolean
    description?: string
    default?: unknown
    generator?: {
        strategy: "uuid" | "timestamp" | "pattern"
        pattern?: string
        prefix?: string
    }
    visibility?: {
        dependsOn: string
        operator: "eq" | "neq" | "includes" | "notEmpty"
        value?: unknown
    }
    noSelectionValue?: string
    specification?: string
    linkTo?: string
    options?: unknown
    optionsText: string
    tooltipKind: "help" | "warn" | "info"
    tooltipUseIcon: boolean
    tooltipMessage: string
}

export const DATA_TYPES: FieldDataType[] = [
    "string",
    "array<string>" as FieldDataType,
    "hierarchical-select",
    "select",
    "number",
    "boolean",
    "date",
    "date-range",
    "markdown",
    "form",
]

export const DATA_TYPE_GUIDANCE: Record<string, string> = {
    "array<string>": "Use this for multi-value entries. Pick an input that supports repeated values.",
    "hierarchical-select": "Expect nested options JSON with levels (for example Province -> Town).",
    "date-range": "Stores a start and end value; make sure downstream filters handle ranges.",
    markdown: "Best for longer rich text notes that can include formatting.",
    form: "Use form inputs when this field controls a composite UI (for example subtype or embedded records).",
}

export const INPUT_TYPE_GUIDANCE: Record<string, string> = {
    "search-select": "Searches and selects from existing options only.",
    "search-select-input": "Lets users search existing options and create a new value when needed.",
    "text-multi": "Use for multiple free-text values (aliases, tags, and similar lists).",
    "subtype-form-select": "Switches the active subtype and displays subtype-specific fields.",
    "embedded-form-list": "Manages linked documents directly from this field.",
    switch: "Use with a short option set, typically binary states.",
}

export const GENERATOR_GUIDANCE: Record<"uuid" | "timestamp" | "pattern", string> = {
    uuid: "Generates a random unique identifier automatically.",
    timestamp: "Generates a time-based value; useful for sortable IDs.",
    pattern: "Builds values from tokens like {date} and {rand:n}. Example: evt-{date}-{rand:6}.",
}

export function createEmptyField(): EditableField {
    return {
        name: "",
        label: "",
        type: { data: "string", input: "text" },
        required: false,
        description: "",
        noSelectionValue: "",
        optionsText: "",
        specification: undefined,
        tooltipKind: "info",
        tooltipUseIcon: true,
        tooltipMessage: "",
    }
}

export function schemaToEditableFields(schema?: DocumentSchema): EditableField[] {
    if (!schema) return [createEmptyField()]

    return schema.fields.map((field) => {
        const fieldObj = field as Record<string, unknown>
        const rawOptions = "options" in field ? fieldObj.options : undefined
        const rawNoSelectionValue = "noSelectionValue" in field ? (fieldObj.noSelectionValue as string | undefined) : undefined
        const rawSpecification = "specification" in field ? (fieldObj.specification as string | undefined) : undefined

        return {
            name: field.name ?? "",
            label: field.label ?? "",
            type: field.type,
            required: field.required,
            description: field.description,
            default: field.default,
            generator: field.generator,
            visibility: field.visibility,
            noSelectionValue: rawNoSelectionValue,
            specification: rawSpecification,
            options: rawOptions,
            optionsText: rawOptions
                ? Array.isArray(rawOptions)
                    ? rawOptions.join("\n")
                    : JSON.stringify(rawOptions, null, 2)
                : "",
            tooltipKind: field.tooltip?.kind ?? "info",
            tooltipUseIcon: field.tooltip?.useIcon ?? true,
            tooltipMessage: field.tooltip?.message ?? "",
        }
    })
}

export function parseField(field: EditableField): FieldDefinition {
    const nextField: Record<string, unknown> = {
        name: field.name.trim(),
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        description: field.description?.trim() || undefined,
        default: field.default === "" ? undefined : field.default,
        generator: field.generator,
        visibility: field.visibility?.dependsOn ? field.visibility : undefined,
        noSelectionValue: field.noSelectionValue?.trim() || undefined,
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

    return nextField as unknown as FieldDefinition
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    if (fromIndex === toIndex) return items
    const nextItems = [...items]
    const [moved] = nextItems.splice(fromIndex, 1)
    nextItems.splice(toIndex, 0, moved)
    return nextItems
}

export function buildFieldGuidance(field: EditableField): string[] {
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

export function getAllowedInputs(dataType: FieldDataType): FieldInputType[] {
    const mapped = (DATA_TO_INPUT as Record<string, FieldInputType[]>)[dataType]
    return mapped || []
}