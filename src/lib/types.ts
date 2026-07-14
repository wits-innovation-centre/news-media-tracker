type FieldDataType = "string" |
    "array<string>" |
    "hierarchical-select" |
    "select" |
    "number" |
    "boolean" |
    "date" |
    "date-range" |
    "markdown" |
    "form";

type FieldInputType = "text" |
    "textarea" |
    "select" |
    "search-select" |
    "search-select-input" |
    "date" |
    "date-range" |
    "text-multi" |
    "checkbox" |
    "switch" |
    "subtype-form-select" |
    "embedded-form-list";

type IconName =
    "file-plus-2" |
    "newspaper" |
    "users" |
    "user-round" |
    "map-pin" |
    "tag" |
    "shield" |
    "folder-tree";

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

interface FieldTooltip {
    kind: "help" | "warn" | "info";
    useIcon: boolean;
    message: string;
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
    linkTo?: string;
    icon?: IconName;
    tooltip?: FieldTooltip;
};

interface DocumentSchema {
    id: string;
    name: string;
    description?: string;
    icon?: IconName;
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
    IconName,
    FieldDefinition,
    FieldTooltip,
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
