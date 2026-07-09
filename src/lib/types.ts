export type FieldType = "string" | "number" | "boolean" | "markdown"

export interface FieldDefinition {
    name: string
    label: string
    type: FieldType
    required?: boolean
    description?: string
}

export interface DocumentSchema {
    id: string
    name: string
    description?: string
    kind?: "template" | "custom"
    parentSchemaId?: string
    fields: FieldDefinition[]
}

export interface StoredDocument {
    id: string
    schema_id: string
    title: string
    frontmatter: Record<string, any>
    body: string
    created_at?: string
}
