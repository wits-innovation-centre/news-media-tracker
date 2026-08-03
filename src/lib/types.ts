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
    "search-select" |
    "multi-select" |
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
    noSelectionValue?: string;
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
  // Multi-user & Attribution additions
  workspace_id?: string;
  created_by?: string;
  updated_by?: string;
  deleted_by?: string;
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

interface MergeProposal {
  id: string;
  workspace_id: string;
  document_id: string;                  // Target/Primary Document (the record that survives)
  secondary_document_id?: string | null;// Duplicate Document (the record being absorbed)
  author_id: string;                    // User ID or "system:duplicate-detector"
  action: "CREATE" | "UPDATE" | "DELETE" | "MERGE_DUPLICATE";
  
  // Target Document Base Snapshot
  base_frontmatter?: string | null;
  base_body?: string | null;

  // Duplicate Document Base Snapshot (For 3-way diff rendering)
  secondary_base_frontmatter?: string | null;
  secondary_base_body?: string | null;
  
  // Proposed Final Snapshot
  proposed_title: string;
  proposed_frontmatter: string;
  proposed_body: string;

  // Detection details e.g. { similarityScore: 0.91, matchReasons: ["source_url", "incident_date"] }
  metadata?: string | null;
  
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  review_comment?: string | null;
  created_at: number;
  updated_at: number;
  synced_at?: number | null;
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
    DocumentNode,
    MergeProposal
};
