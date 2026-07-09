import type { DocumentSchema, FieldDefinition } from "@/lib/types"

export const DEFAULT_HOMICIDE_TEMPLATE: DocumentSchema = {
    id: "homicide-template",
    name: "Homicide Tracking",
    description: "Legacy homicide case template adapted for the Vite workspace.",
    kind: "template",
    fields: [
        { name: "title", label: "Case title", type: "string", required: true },
        { name: "date", label: "Incident date", type: "string" },
        { name: "location", label: "Location", type: "string" },
        { name: "victims", label: "Victims", type: "string" },
        { name: "perpetrators", label: "Perpetrators", type: "string" },
        { name: "type_of_murder", label: "Type of murder", type: "string" },
        { name: "notes", label: "Case notes", type: "markdown" },
    ],
}

export const DEFAULT_SCHEMA_TEMPLATES: DocumentSchema[] = [
    DEFAULT_HOMICIDE_TEMPLATE,
    {
        id: "book-review-template",
        name: "Book Review",
        description: "Legacy review-style template.",
        kind: "template",
        fields: [
            { name: "author", label: "Author", type: "string", required: true },
            { name: "rating", label: "Rating (1-5)", type: "number" },
            { name: "finished", label: "Finished reading", type: "boolean" },
            { name: "thoughts", label: "Review content", type: "markdown" },
        ],
    },
    {
        id: "daily-reflection-template",
        name: "Daily Reflection",
        description: "Legacy daily journaling template.",
        kind: "template",
        fields: [
            { name: "mood", label: "Today's mood", type: "string" },
            { name: "productivity", label: "Productivity score", type: "number" },
            { name: "body", label: "Journal entry", type: "markdown" },
        ],
    },
]

export function createSchemaFromTemplate(template: DocumentSchema, overrides?: Partial<DocumentSchema>): DocumentSchema {
    return {
        ...template,
        ...overrides,
        id: overrides?.id ?? `${template.id}-${crypto.randomUUID()}`,
        name: overrides?.name ?? template.name,
        fields: (overrides?.fields ?? template.fields).map((field) => ({ ...field })),
    }
}

export function buildFieldDefinitionsForParent(parentSchema?: DocumentSchema, childSchema?: DocumentSchema): FieldDefinition[] {
    const inheritedFields = parentSchema?.fields ?? []
    const childFields = childSchema?.fields ?? []
    return [
        ...inheritedFields.map((field) => ({ ...field })),
        ...childFields.map((field) => ({ ...field })),
    ]
}
