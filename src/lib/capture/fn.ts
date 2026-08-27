import * as z from "zod";
import { evaluateVisibility, flattenTieredOptions, generateFieldValue, isValidPathInRecord } from "@/lib/utils";
import type { FieldDefinition, SpecificationStore, TieredOptions } from "@/lib/types";

export type DynamicFormValues = Record<string, any>;

export const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

export const buildDefaultValues = (fields: FieldDefinition[], seedValues: Record<string, any> = {}) => {
  const defaults: DynamicFormValues = {};

  fields.forEach((field) => {
    defaults[field.name] = (field.default ?? generateFieldValue(field, { ...seedValues, ...defaults })) as DynamicFormValues[string];
  });

  return defaults;
};

export const isDeferredRelationField = (field: FieldDefinition) => {
  const fieldOptions = "options" in field ? (field as any).options : undefined;
  return (
    (field.type.data as string) === "array" &&
    (field.type.input as string) === "select" &&
    (!fieldOptions || (Array.isArray(fieldOptions) && fieldOptions.length === 0))
  );
};

export const getSelectOptions = (field: FieldDefinition): string[] => {
  const fieldOptions = "options" in field ? (field as any).options : undefined;
  if (!fieldOptions) return [];
  return Array.isArray(fieldOptions) ? fieldOptions.map(String) : flattenTieredOptions(fieldOptions);
};

export const getSpecificationKind = (fieldDef: FieldDefinition): string | undefined => {
  return "specification" in fieldDef && typeof fieldDef.specification === "string"
    ? fieldDef.specification
    : undefined;
};

export const getSearchSelectOptions = (fieldDef: FieldDefinition, specifications: SpecificationStore): string[] => {
  const kind = getSpecificationKind(fieldDef);
  if (kind) return specifications[kind] ?? [];
  return getSelectOptions(fieldDef);
};

export const generateZodSchema = (
  fields: FieldDefinition[],
  currentValues: Record<string, any>,
  subtypeFields?: Record<string, FieldDefinition[]>
) => {
  const schemaShape: Record<string, z.ZodTypeAny> = {};

  const processFields = (fieldList: FieldDefinition[]) => {
    fieldList.forEach((field) => {
      if (isDeferredRelationField(field)) {
        schemaShape[field.name] = z.any().optional();
        return;
      }

      const isVisible = evaluateVisibility(field.visibility, currentValues);
      if (!isVisible) {
        schemaShape[field.name] = z.any().optional();
        return;
      }

      if (field.type.input === "subtype-form-select") {
        schemaShape[field.name] = field.required ? z.string().min(1, "Selecting a subtype is required") : z.string().optional();

        const selectedSubtype = String(currentValues[field.name] ?? "");
        const nested = selectedSubtype ? subtypeFields?.[selectedSubtype] ?? [] : [];
        if (nested.length > 0) {
          processFields(nested);
        }
        return;
      }

      let fieldSchema: z.ZodTypeAny;

      switch (field.type.data) {
        case "number":
          fieldSchema = z.coerce.number();
          break;
        case "boolean":
          fieldSchema = z.boolean();
          break;
        case "date-range":
          fieldSchema = z.string();
          break;
        case "array": {
          const childFields = "fields" in field && Array.isArray((field as any).fields)
            ? ((field as any).fields as FieldDefinition[])
            : [];

          if (childFields.length > 0) {
            const childShape: Record<string, z.ZodTypeAny> = {};

            childFields.forEach((child) => {
              let baseSchema: z.ZodTypeAny = z.any();

              switch (child.type.data) {
                case "number":
                  baseSchema = z.number();
                  break;
                case "boolean":
                  baseSchema = z.boolean();
                  break;
                default:
                  baseSchema = z.string();
              }

              childShape[child.name] = child.required
                ? baseSchema.refine((val) => val !== undefined && val !== null && val !== "", {
                    message: `${child.label} is required`,
                  })
                : baseSchema.optional();
            });

            fieldSchema = z.array(z.object(childShape));
          } else {
            fieldSchema = z.array(z.record(z.string(), z.any()));
          }

          if (field.required) {
            fieldSchema = (fieldSchema as z.ZodArray<any>).min(1, `${field.label} requires at least one entry`);
          }
          break;
        }
        case "date":
          fieldSchema = z.string();
          break;
        case "hierarchical-select":
        case "select":
          fieldSchema = z.string();

          const fieldOptions = "options" in field ? (field as any).options : undefined;
          if (fieldOptions) {
            fieldSchema = (fieldSchema as z.ZodString).refine(
              (val: string) => {
                if (!val) return !field.required;

                const segments = val.split(" / ");

                if (Array.isArray(fieldOptions)) {
                  return (fieldOptions as string[]).includes(val);
                }

                return isValidPathInRecord(segments, fieldOptions as TieredOptions);
              },
              { message: "The selected category hierarchy path does not exist in the schema" }
            );
          }

          if (field.required) {
            fieldSchema = (fieldSchema as z.ZodString).min(1, "Selecting an option is required");
          }
          break;
        case "string":
        case "markdown":
        default:
          fieldSchema = z.string();
          if (field.required) {
            fieldSchema = (fieldSchema as z.ZodString).min(1, "This field is required");
          }
          break;
      }

      if (!field.required && field.type.data !== "string" && field.type.data !== "markdown") {
        fieldSchema = fieldSchema.optional();
      }

      schemaShape[field.name] = fieldSchema;
    });
  };

  processFields(fields);
  return z.object(schemaShape);
};

export const extractSubmissionPayload = (
  fields: FieldDefinition[],
  subtypeFields: Record<string, FieldDefinition[]> | undefined,
  values: DynamicFormValues
) => {
  const frontmatter: Record<string, any> = {};
  let markdownBody = "";

  const collectRenderableFields = (fieldSet: FieldDefinition[]): FieldDefinition[] => {
    const collected: FieldDefinition[] = [];

    fieldSet.forEach((field) => {
      if (isDeferredRelationField(field)) return;

      const isVisible = evaluateVisibility(field.visibility, values);
      if (!isVisible) return;

      collected.push(field);

      if (field.type.input === "subtype-form-select") {
        const selectedSubtype = String(values[field.name] ?? "");
        const nestedFields = selectedSubtype ? subtypeFields?.[selectedSubtype] ?? [] : [];
        if (nestedFields.length > 0) {
          collected.push(...collectRenderableFields(nestedFields));
        }
      }
    });

    return collected;
  };

  const renderableFields = collectRenderableFields(fields);
  const renderedFieldNames = new Set<string>();

  renderableFields.forEach((field) => {
    if (renderedFieldNames.has(field.name)) return;
    renderedFieldNames.add(field.name);

    if (isDeferredRelationField(field)) return;

    const isVisible = evaluateVisibility(field.visibility, values);
    if (!isVisible) return;

    let fieldValue = values[field.name];

    const noSelectionValue = "noSelectionValue" in field ? (field as any).noSelectionValue : undefined;
    if (noSelectionValue) {
      const isEmptyArray = Array.isArray(fieldValue) && fieldValue.length === 0;
      const isEmptyString = typeof fieldValue === "string" && fieldValue.trim() === "";
      const isNil = fieldValue === undefined || fieldValue === null;

      if (isEmptyArray || isEmptyString || isNil) {
        fieldValue = field.type.data === "array" ? [noSelectionValue] : noSelectionValue;
      }
    }

    if (field.type.data === "markdown") {
      markdownBody = (fieldValue as string) || "";
    } else {
      frontmatter[field.name] = fieldValue;
    }
  });

  return { frontmatter, markdownBody };
};