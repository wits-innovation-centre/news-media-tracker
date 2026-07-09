type FieldDataType = "string" |
    "array<string>" |
    "tiered-select" |
    "select" |
    "number" |
    "boolean" |
    "date" |
    "date-range" |
    "markdown";

type FieldInputType = "text" |
    "textarea" |
    "select" |
    "date" |
    "date-range" |
    "text-multi" |
    "checkbox" |
    "switch"

type TieredOptionsSchema = {
    [key: string]: string | TieredOptionsSchema | any;
}

type TieredOptions = {
    [key: string]: string[] | TieredOptions;
} & {
    "$schema"?: TieredOptionsSchema
};

interface VisibilityCondition {
    dependsOn: string;
    operator: "eq" | "neq" | "includes" | "notEmpty";
    value?: any;
}

interface FieldDefinition {
    name: string;
    label: string;
    type: {
        data: FieldDataType;
        input: FieldInputType;
    };
    default?: any;
    visibility?: VisibilityCondition;
    required?: boolean;
    options?: string[] | TieredOptions;
    description?: string;
};

interface DocumentSchema {
    id: string;
    name: string;
    description?: string;
    parentSchemaId?: string;
    groupId?: string;
    groupName?: string;
    fields: FieldDefinition[];
    subtypeFields?: Record<string, FieldDefinition[]>;
};

interface DocumentSchemaGroup {
    id: string;
    name: string;
    description?: string;
    documents: DocumentSchema[];
};

interface StoredDocument {
    id: string;
    schema_id: string;
    title: string;
    frontmatter: Record<string, any>;
    body: string;
    created_at?: string;
};

export type {
    FieldDataType,
    FieldDefinition,
    TieredOptions,
    TieredOptionsSchema,
    DocumentSchema,
    DocumentSchemaGroup,
    StoredDocument
};
