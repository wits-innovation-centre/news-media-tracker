type FieldDataType = "string" |
    "array<string>" |
    "hierarchical-select" |
    "select" |
    "number" |
    "boolean" |
    "date" |
    "date-range" |
    "markdown";

type FieldInputType = "text" |
    "textarea" |
    "select" |
    "search-select-input" |
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

interface FieldGeneratorConfig {
    strategy: "uuid" | "timestamp" | "pattern";
    prefix?: string;
    pattern?: string;
    randomLength?: number;
    uppercase?: boolean;
}

interface FieldDefinition {
    name: string;
    label: string;
    type: {
        data: FieldDataType;
        input: FieldInputType;
    };
    default?: any;
    generator?: FieldGeneratorConfig;
    visibility?: VisibilityCondition;
    required?: boolean;
    options?: string[] | TieredOptions;
    specification?: string;
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
    parent_id?: string;
    created_at?: string;
};

interface DocumentNode {
    id: string;
    schemaId: string;
    parentId?: string;
    label: string;
}

interface SchemaWorkspace {
    groups: DocumentSchemaGroup[];
}

interface SpecificationDefinition {
    id: string;
    name: string;
    description?: string;
}

type SpecificationStore = Record<string, string[]>;

export type {
    FieldDataType,
    FieldInputType,
    FieldDefinition,
    FieldGeneratorConfig,
    TieredOptions,
    TieredOptionsSchema,
    DocumentSchema,
    DocumentSchemaGroup,
    SchemaWorkspace,
    SpecificationDefinition,
    SpecificationStore,
    StoredDocument,
    DocumentNode
};
