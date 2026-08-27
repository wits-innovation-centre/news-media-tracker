type FieldDataType =
    | "string"
    | "array" // <-- Replaces array<string> and array<object>
    | "hierarchical-select"
    | "select"
    | "form"
    | "number" | "boolean" | "date" | "date-range" | "markdown";

type FieldInputType =
    | "text"
    | "textarea"
    | "select"
    | "multi-select"
    | "search-select"
    | "search-select-input"
    | "subtype-form-select"
    | "embedded-form-list"
    | "repeating-group"
    | "date" | "date-range" | "text-multi" | "checkbox" | "switch";

export const DATA_TO_INPUT: Record<FieldDataType, FieldInputType[]> = {
    "string": ["text", "textarea", "select", "search-select", "search-select-input"],
    "array": ["repeating-group", "multi-select", "text-multi"],
    "hierarchical-select": ["select", "search-select"],
    "select": ["select", "search-select", "search-select-input"],
    "number": ["text", "select", "search-select", "search-select-input"],
    "boolean": ["checkbox", "switch"],
    "date": ["date"],
    "date-range": ["date-range"],
    "markdown": ["textarea", "text"],
    "form": ["subtype-form-select", "embedded-form-list"]
};

export const INPUT_TO_DATA: Record<FieldInputType, FieldDataType[]> = {
    "text": ["string", "number", "markdown"],
    "textarea": ["string", "markdown"],
    "select": ["select", "string", "number", "hierarchical-select"],
    "multi-select": ["array"],
    "search-select": ["select", "string", "number", "hierarchical-select"],
    "search-select-input": ["select", "string", "number"],
    "subtype-form-select": ["form"],
    "embedded-form-list": ["form"],
    "repeating-group": ["array"],
    "date": ["date"],
    "date-range": ["date-range"],
    "text-multi": ["array"],
    "checkbox": ["boolean"],
    "switch": ["boolean"]
};

// Map aliases for schema system consistency
export const DATA_TO_TYPE = DATA_TO_INPUT;
export const TYPE_TO_DATA = INPUT_TO_DATA;

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

interface BaseFieldDefinition {
    name: string;
    label: string;
    description?: string;
    required?: boolean;
    default?: any;
    visibility?: VisibilityCondition;
    generator?: FieldGeneratorConfig;
    linkTo?: string;
    icon?: IconName;
    tooltip?: FieldTooltip;
    specification?: string;
    [key: string]: unknown;
}

interface RepeatingGroupFieldDefinition extends BaseFieldDefinition {
    type: {
        data: "array";
        input: "repeating-group";
    };
    fields: FieldDefinition[];
    addButtonText?: string;
    minItems?: number;
    maxItems?: number;
}

interface MultiSelectFieldDefinition extends BaseFieldDefinition {
    type: {
        data: "array";
        input: "multi-select" | "text-multi";
    };
    options?: string[] | TieredOptions;
}

interface SelectFieldDefinition extends BaseFieldDefinition {
    type: {
        data: "select" | "string" | "number";
        input: "select" | "search-select";
    };
    options: string[] | TieredOptions;
    noSelectionValue?: string;
}

interface HierarchicalSelectDefinition extends BaseFieldDefinition {
    type: {
        data: "hierarchical-select";
        input: "select" | "search-select"
    },
    options: TieredOptions;
    noSelectionValue?: string;
    allowOther?: boolean;
    allowUnknown?: boolean;
}

interface SearchSelectInputDefinition extends BaseFieldDefinition {
    type: {
        data: "select" | "string" | "number" ;
        input: "search-select-input";
    };
    options: string[] | TieredOptions;
    specification: string;
    noSelectionValue?: string;
}

interface FormFieldDefinition extends BaseFieldDefinition {
    type: {
        data: "form";
        input: "subtype-form-select" | "embedded-form-list";
    };
}

interface StandardFieldDefinition extends BaseFieldDefinition {
    type: {
        data: "string" | "number" | "boolean" | "date" | "date-range" | "markdown";
        input: "text" | "textarea" | "date" | "date-range" | "checkbox" | "switch";
    };
}

type FieldDefinition =
    | RepeatingGroupFieldDefinition
    | MultiSelectFieldDefinition
    | SelectFieldDefinition
    | SearchSelectInputDefinition
    | FormFieldDefinition
    | StandardFieldDefinition
    | HierarchicalSelectDefinition;

interface DocumentSchema {
    id: string;
    name: string;
    titleField: string;
    description?: string;
    metadata?: Record<string, any>;
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
    workspace_id?: string;
    created_by?: string;
    updated_by?: string;
    deleted_by?: string;
    user_id?: string;
    device_id?: string;
    updated_at?: number;
    is_deleted?: boolean;
}

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

interface WorkspaceRecord {
    id: string;
    name: string;
    description?: string;
    icon_path?: string;
    template_group_id?: string;
    created_at: number;
    last_accessed_at: number;
}

interface MergeProposal {
    id: string;
    workspace_id: string;
    document_id: string;
    secondary_document_id?: string | null;
    author_id: string;
    user_id?: string | null;
    device_id?: string | null;
    action: "CREATE" | "UPDATE" | "DELETE" | "MERGE_DUPLICATE";
    source_id?: string | null;
    target_id?: string | null;
    entity_type?: string | null;
    similarity_score?: number | null;
    base_frontmatter?: string | null;
    base_body?: string | null;
    secondary_base_frontmatter?: string | null;
    secondary_base_body?: string | null;
    proposed_title: string;
    proposed_frontmatter: string;
    proposed_body: string;
    metadata?: string | null;
    status: "pending" | "approved" | "rejected";
    reviewed_by?: string | null;
    review_comment?: string | null;
    created_at: number;
    updated_at: number;
    synced_at?: number | null;
}

interface MergeResolutionPayload {
    title: string;
    frontmatter: Record<string, unknown>;
    body: string;
}

interface DuplicateDetectionMetadata {
    similarityScore: number;
    matchReasons: string[];
    fieldScores?: Record<string, number>;
}

interface ArchivalLedgerRecord {
    id: string;
    article_id: string;
    workspace_id?: string;
    archive_type: string;
    sha256_hash: string;
    uri_or_path?: string | null;
    file_size_bytes?: number | null;
    device_id?: string;
    last_verified_at?: number | null;
    health_status?: string;
    sync_status?: string;
    blockchain_tx_hash?: string | null;
    blockchain_network?: string | null;
    ots_proof_payload?: string | null;
    anchored_at?: string | null;
    created_at?: number;
    updated_at?: number;
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
    WorkspaceRecord,
    SpecificationStore,
    StoredDocument,
    DocumentNode,
    MergeProposal,
    ArchivalLedgerRecord,
    MergeResolutionPayload,
    DuplicateDetectionMetadata
};