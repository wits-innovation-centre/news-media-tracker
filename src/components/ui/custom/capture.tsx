import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { RefreshCw, Check, Save } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { evaluateVisibility, flattenTieredOptions, generateFieldValue } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HierarchicalSelect } from "@/components/ui/custom/hierarchical-select";
import { MultiSelect } from "@/components/ui/custom/multi-select";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  type DocumentSchema,
  type FieldDefinition,
  type SpecificationStore,
  type TieredOptions
} from "@/lib/types";
import {
  isValidPathInRecord,
} from "@/lib/utils"
import { SearchSelect } from "@/components/ui/custom/search-select"
import { SearchSelectInput } from "@/components/ui/custom/search-select-input";
import { EmbeddedFormList } from "@/components/ui/custom/embedded-form-list";

interface CaptureProps {
  fields: FieldDefinition[]
  subtypeFields?: Record<string, FieldDefinition[]>
  initialValues?: Record<string, any>
  onValuesChange?: (values: Record<string, any>) => void
  specifications: SpecificationStore
  onAddSpecification?: (specificationId: string, value: string) => Promise<void> | void
  schemas?: Record<string, DocumentSchema>
  activeDocumentId?: string
  onCreateLinkedDocument?: (params: {
    schemaId: string
    title: string
    parentDocumentId?: string
    seedData?: Record<string, any>
  }) => {
    id: string
    title: string
    data: Record<string, any>
    schemaId: string
  }
  onDeleteLinkedDocument?: (documentId: string) => void
  onNavigateToLinkedDocument?: (documentId: string, schemaId: string) => void
  getExistingLinkedDocuments?: (params: {
    parentDocumentId?: string
    schemaId: string
  }) => {
    id: string
    title: string
    data: Record<string, any>
    schemaId: string
  }[]
  onSubmit: (frontmatter: Record<string, any>, markdownBody: string) => void
};

type DynamicFormValues = Record<string, string | string[] | number | boolean>

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  return []
}

const buildDefaultValues = (fields: FieldDefinition[], seedValues: Record<string, any> = {}) => {
  const defaults: DynamicFormValues = {}

  fields.forEach((field) => {
    defaults[field.name] = generateFieldValue(field, { ...seedValues, ...defaults }) as DynamicFormValues[string]
  })

  return defaults
}

const isDeferredRelationField = (field: FieldDefinition) => {
  return field.type.data === "array<string>" && field.type.input === "select" && (!field.options || (Array.isArray(field.options) && field.options.length === 0))
}

const getSelectOptions = (field: FieldDefinition) => {
  if (!field.options) return []
  return Array.isArray(field.options) ? field.options.map(String) : flattenTieredOptions(field.options)
}

const generateZodSchema = (fields: FieldDefinition[], currentValues: Record<string, any>) => {
  const schemaShape: Record<string, z.ZodTypeAny> = {}

  fields.forEach((field) => {
    if (isDeferredRelationField(field)) {
      schemaShape[field.name] = z.any().optional();
      return;
    }

    const isVisible = evaluateVisibility(field.visibility, currentValues);
    if (!isVisible) {
      schemaShape[field.name] = z.any().optional();
      return;
    }

    let fieldSchema: z.ZodTypeAny

    switch (field.type.data) {
      case "number":
        fieldSchema = z.coerce.number()
        break
      case "boolean":
        fieldSchema = z.boolean()
        break
      case "date-range":
        fieldSchema = z.string()
        break
      case "array<string>":
        fieldSchema = z.array(z.string())
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodArray<z.ZodString>).min(1, "This field is required")
        }
        break
      case "date":
        fieldSchema = z.string()
        break
      case "hierarchical-select":
      case "select":
        fieldSchema = z.string();

        if (field.options) {
          const options = field.options;

          fieldSchema = (fieldSchema as z.ZodString).refine(
            (val: string) => {
              if (!val) return !field.required;

              const segments = val.split(" / ");

              if (Array.isArray(options)) {
                return (options as string[]).includes(val);
              }

              return isValidPathInRecord(segments, options as TieredOptions);
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
        fieldSchema = z.string()
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodString).min(1, "This field is required")
        }
        break;
    }

    if (!field.required && field.type.data !== "string" && field.type.data !== "markdown") {
      fieldSchema = fieldSchema.optional()
    }

    schemaShape[field.name] = fieldSchema
  })

  return z.object(schemaShape)
}

function Capture({
  fields,
  subtypeFields,
  initialValues,
  onValuesChange,
  specifications,
  onAddSpecification,
  schemas,
  activeDocumentId,
  onCreateLinkedDocument,
  onDeleteLinkedDocument,
  onNavigateToLinkedDocument,
  getExistingLinkedDocuments,
  onSubmit,
}: CaptureProps) {
  const prevInitialValuesRef = useRef(initialValues)
  const prevFieldsRef = useRef(fields)

  const [isCaptured, setIsCaptured] = useState(false)
  const [lastDraftSaved, setLastDraftSaved] = useState<string | null>(null)

  const defaultValues = useMemo(() => {
    return { ...buildDefaultValues(fields), ...(initialValues ?? {}) }
  }, [fields, initialValues])

  const form = useForm<DynamicFormValues>({
    resolver: (values, context, options) => {
      const dynamicSchema = generateZodSchema(fields, values);
      return zodResolver(dynamicSchema as any)(values as any, context, options as any) as any;
    },
    defaultValues,
  })

  useEffect(() => {
    const initialValuesChanged = JSON.stringify(initialValues) !== JSON.stringify(prevInitialValuesRef.current)
    const fieldsChanged = JSON.stringify(fields) !== JSON.stringify(prevFieldsRef.current)

    if (initialValuesChanged || fieldsChanged) {
      prevInitialValuesRef.current = initialValues
      prevFieldsRef.current = fields
      form.reset({ ...buildDefaultValues(fields), ...(initialValues ?? {}) })
      setLastDraftSaved(null)
    }
  }, [fields, form, initialValues])

  useEffect(() => {
    const subscription = form.watch((values) => {
      onValuesChange?.(values as Record<string, any>)
      setLastDraftSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    })

    return () => subscription.unsubscribe()
  }, [form, onValuesChange])

  const watchedValues = form.watch()

  const getSpecificationKind = (fieldDef: FieldDefinition): string | undefined => {
    return fieldDef.specification
  }

  const getSearchSelectOptions = (fieldDef: FieldDefinition) => {
    const kind = getSpecificationKind(fieldDef)
    if (kind) return specifications[kind] ?? []
    return getSelectOptions(fieldDef)
  }

  const handleSubmit = (values: DynamicFormValues) => {
    const frontmatter: Record<string, any> = {}
    let markdownBody = ""

    const collectRenderableFields = (fieldSet: FieldDefinition[]): FieldDefinition[] => {
      const collected: FieldDefinition[] = []

      fieldSet.forEach((field) => {
        if (isDeferredRelationField(field)) return

        const isVisible = evaluateVisibility(field.visibility, values)
        if (!isVisible) return

        collected.push(field)

        if (field.type.input === "subtype-form-select") {
          const selectedSubtype = String(values[field.name] ?? "")
          const nestedFields = selectedSubtype ? subtypeFields?.[selectedSubtype] ?? [] : []
          if (nestedFields.length > 0) {
            collected.push(...collectRenderableFields(nestedFields))
          }
        }
      })

      return collected
    }

    const renderableFields = collectRenderableFields(fields)
    const renderedFieldNames = new Set<string>()

    renderableFields.forEach((field) => {
      if (renderedFieldNames.has(field.name)) return
      renderedFieldNames.add(field.name)

      if (isDeferredRelationField(field)) return;

      const isVisible = evaluateVisibility(field.visibility, values);
      if (!isVisible) return;

      let fieldValue = values[field.name];

      if (field.noSelectionValue) {
        const isEmptyArray = Array.isArray(fieldValue) && fieldValue.length === 0;
        const isEmptyString = typeof fieldValue === "string" && fieldValue.trim() === "";
        const isNil = fieldValue === undefined || fieldValue === null;

        if (isEmptyArray || isEmptyString || isNil) {
          fieldValue = field.type.data === "array<string>"
            ? [field.noSelectionValue]
            : field.noSelectionValue;
        }
      }

      if (field.type.data === "markdown") {
        markdownBody = (fieldValue as string) || ""
      } else {
        frontmatter[field.name] = fieldValue
      }
    })

    onSubmit(frontmatter, markdownBody)
    form.reset(values)

    setIsCaptured(true)
    setTimeout(() => {
      setIsCaptured(false)
    }, 3000)
  }

  const handleRegenerateField = (fieldDef: FieldDefinition) => {
    form.setValue(
      fieldDef.name,
      generateFieldValue(fieldDef, form.getValues() as Record<string, any>) as DynamicFormValues[string],
      { shouldDirty: true, shouldValidate: true }
    )
  }

  const renderField = (fieldDef: FieldDefinition, keyPrefix: string = "") => {
    if (isDeferredRelationField(fieldDef)) return null;

    const isVisible = evaluateVisibility(fieldDef.visibility, watchedValues);
    if (!isVisible) return null;

    return (
      <Controller
        key={`${keyPrefix}${fieldDef.name}`}
        control={form.control}
        name={fieldDef.name}
        render={({ field, fieldState }) => (
          <Field
            data-invalid={fieldState.invalid}
            className={
              fieldDef.type.input === "checkbox" || fieldDef.type.input === "switch"
                ? "flex flex-row items-center gap-3 space-y-0 rounded-md border p-4 *:w-auto"
                : ""
            }
          >

            {fieldDef.type.input === "checkbox" || fieldDef.type.input === "switch" ? (
              <>
                {fieldDef.type.input === "switch" ? (
                  <Switch
                    id={fieldDef.name}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                    className="shrink-0 w-auto"
                  />
                ) : (
                  <Checkbox
                    id={fieldDef.name}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                    className="shrink-0 w-auto"
                  />
                )}
                <div className="flex-1 space-y-1 leading-none">
                  <FieldLabel htmlFor={fieldDef.name}>
                    {fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                  </FieldLabel>
                  {fieldDef.description && (
                    <FieldDescription>{fieldDef.description}</FieldDescription>
                  )}
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </div>
              </>
            ) : (
              <>
                {fieldDef.type.input !== "embedded-form-list" && fieldDef.type.input !== "subtype-form-select" ? (
                  <FieldLabel htmlFor={fieldDef.name}>
                    {fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                  </FieldLabel>
                ) : null}

                {fieldDef.type.input === "text" || fieldDef.type.input === "date" ? (
                  <div className="relative">
                    <Input
                      {...field}
                      value={(field.value as string | number) ?? ""}
                      id={fieldDef.name}
                      type={fieldDef.type.input === "date" ? "date" : "text"}
                      placeholder={`Enter ${fieldDef.label.toLowerCase()}...`}
                      aria-invalid={fieldState.invalid}
                      className={fieldDef.generator && fieldDef.type.input === "text" ? "pr-28" : undefined}
                    />
                    {fieldDef.generator && fieldDef.type.input === "text" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="absolute top-1/2 right-1 h-6 -translate-y-1/2 px-2 text-[11px]"
                        onClick={() => handleRegenerateField(fieldDef)}
                      >
                        <Tooltip>
                          <TooltipTrigger>
                            <RefreshCw className="mr-1 h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Generate New
                          </TooltipContent>
                        </Tooltip>
                      </Button>
                    ) : null}
                  </div>
                ) : fieldDef.type.input === "textarea" ? (
                  <Textarea
                    {...field}
                    value={(field.value as string) ?? ""}
                    id={fieldDef.name}
                    placeholder="Write your content here..."
                    className="min-h-50 resize-y font-mono"
                    aria-invalid={fieldState.invalid}
                  />
                ) : fieldDef.type.data === "hierarchical-select" && fieldDef.type.input === "select" ? (
                  <HierarchicalSelect
                    id={fieldDef.name}
                    value={(field.value as string) ?? ""}
                    options={fieldDef.options as TieredOptions}
                    placeholder={`Select ${fieldDef.label.toLowerCase()}...`}
                    onChange={field.onChange}
                  />
                ) : fieldDef.type.input === "search-select-input" || fieldDef.type.input === "search-select" ? (
                  (() => {
                    const specificationKind = getSpecificationKind(fieldDef)
                    const searchOptions = getSearchSelectOptions(fieldDef)
                    const isCreatable = fieldDef.type.input === "search-select-input" && Boolean(specificationKind)
                    const SearchComponent = fieldDef.type.input === "search-select-input" ? SearchSelectInput : SearchSelect

                    if (fieldDef.type.data === "array<string>") {
                      const values = toStringArray(field.value)
                      const listValues = values.length > 0 ? values : [""]

                      const updateIndex = (index: number, nextValue: string) => {
                        const next = [...listValues]
                        next[index] = nextValue
                        field.onChange(next.filter((entry) => entry.trim().length > 0))
                      }

                      const removeIndex = (index: number) => {
                        const next = listValues.filter((_, itemIndex) => itemIndex !== index)
                        field.onChange(next.filter((entry) => entry.trim().length > 0))
                      }

                      return (
                        <div className="space-y-2">
                          {listValues.map((entry, index) => (
                            <div key={`${fieldDef.name}-${index}`} className="flex items-start gap-2">
                              <div className="flex-1">
                                <SearchComponent
                                  id={`${fieldDef.name}-${index}`}
                                  value={entry}
                                  options={searchOptions}
                                  placeholder={`Search ${fieldDef.label.toLowerCase()}...`}
                                  onChange={(nextValue) => updateIndex(index, nextValue)}
                                  {...(fieldDef.type.input === "search-select-input" ? {
                                    allowCreate: isCreatable,
                                    onCreateOption: async (nextValue: string) => {
                                      if (!specificationKind) return
                                      await onAddSpecification?.(specificationKind, nextValue)
                                    },
                                  } : {})}
                                />
                              </div>
                              {listValues.length > 1 ? (
                                <Button type="button" variant="outline" size="icon-xs" onClick={() => removeIndex(index)}>
                                  ×
                                </Button>
                              ) : null}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => field.onChange([...listValues, ""])}
                          >
                            Add {fieldDef.label}
                          </Button>
                        </div>
                      )
                    }

                    return (
                      <SearchComponent
                        id={fieldDef.name}
                        value={(field.value as string) ?? ""}
                        options={searchOptions}
                        placeholder={`Search ${fieldDef.label.toLowerCase()}...`}
                        onChange={field.onChange}
                        {...(fieldDef.type.input === "search-select-input" ? {
                          allowCreate: isCreatable,
                          onCreateOption: async (nextValue: string) => {
                            if (!specificationKind) return
                            await onAddSpecification?.(specificationKind, nextValue)
                          },
                        } : {})}
                      />
                    )
                  })()
                ) : fieldDef.type.input === "select" ? (
                  (() => {
                    const selectOptions = getSelectOptions(fieldDef)

                    return (
                      <Select
                        value={(field.value as string) ?? ""}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id={fieldDef.name} aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder={`Select ${fieldDef.label.toLowerCase()}...`} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectOptions.map((option) => (
                            <SelectItem key={String(option)} value={String(option)}>
                              {String(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  })()
                ) : fieldDef.type.input === "multi-select" ? (
                  <MultiSelect
                    options={getSelectOptions(fieldDef)}
                    value={toStringArray(field.value)}
                    onChange={field.onChange}
                    placeholder={`Select ${fieldDef.label.toLowerCase()}...`}
                  />
                ) : fieldDef.type.input === "text-multi" ? (
                  (() => {
                    const values = toStringArray(field.value)

                    const updateIndex = (index: number, nextValue: string) => {
                      const next = values.length > 0 ? [...values] : [""]
                      next[index] = nextValue
                      field.onChange(next)
                    }

                    const removeIndex = (index: number) => {
                      const next = values.filter((_, itemIndex) => itemIndex !== index)
                      field.onChange(next.length > 0 ? next : [""])
                    }

                    return (
                      <div className="space-y-2">
                        {(values.length > 0 ? values : [""]).map((entry, index) => (
                          <div key={`${fieldDef.name}-${index}`} className="flex items-center gap-2">
                            <Input
                              id={`${fieldDef.name}-${index}`}
                              value={entry}
                              onChange={(event) => updateIndex(index, event.target.value)}
                              placeholder={`${fieldDef.label} ${index + 1}`}
                              aria-invalid={fieldState.invalid}
                            />
                            {index > 0 ? (
                              <Button type="button" variant="outline" size="icon-xs" onClick={() => removeIndex(index)}>
                                ×
                              </Button>
                            ) : null}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => field.onChange([...(values.length > 0 ? values : [""]), ""])}
                        >
                          Add {fieldDef.label}
                        </Button>
                      </div>
                    )
                  })()
                ) : fieldDef.type.input === "subtype-form-select" ? (
                  (() => {
                    const selectedSubtype = String(field.value ?? "")
                    const subtypeOptions = Object.keys(subtypeFields || {})
                    const nestedFields = selectedSubtype ? subtypeFields?.[selectedSubtype] ?? [] : []

                    return (
                      <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
                        <div>
                          <FieldLabel htmlFor={fieldDef.name}>
                            {fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                          </FieldLabel>
                          <Select
                            value={selectedSubtype}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger id={fieldDef.name} aria-invalid={fieldState.invalid}>
                              <SelectValue placeholder={`Select ${fieldDef.label.toLowerCase()}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {subtypeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option.charAt(0).toUpperCase() + option.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedSubtype && nestedFields.length > 0 ? (
                          <div className="space-y-3">
                            {nestedFields.map((nestedField) => renderField(nestedField, `${keyPrefix}${fieldDef.name}__${selectedSubtype}__`))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })()
                ) : fieldDef.type.input === "embedded-form-list" ? (() => {
                  const linkToSchemaId = fieldDef.linkTo;
                  const childSchema = linkToSchemaId && schemas ? schemas[linkToSchemaId] : undefined;

                  if (childSchema) {
                    const rawLinkedDocuments = Array.isArray(field.value) ? (field.value as unknown[]) : [];
                    const fieldLinkedDocuments = rawLinkedDocuments
                      .filter((doc): doc is Record<string, unknown> => typeof doc === "object" && doc !== null)
                      .map((doc) => ({
                        id: typeof doc.id === "string" ? doc.id : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                        title: typeof doc.title === "string" ? doc.title : "",
                        data: typeof doc.data === "object" && doc.data !== null ? (doc.data as Record<string, any>) : {},
                        schemaId: typeof doc.schemaId === "string" ? doc.schemaId : childSchema.id,
                      }));

                    const existingLinkedDocuments = getExistingLinkedDocuments?.({
                      parentDocumentId: activeDocumentId,
                      schemaId: childSchema.id,
                    }) ?? [];

                    const mergedLinkedDocuments = new Map<string, {
                      id: string
                      title: string
                      data: Record<string, any>
                      schemaId: string
                    }>();

                    existingLinkedDocuments.forEach((doc) => {
                      mergedLinkedDocuments.set(doc.id, {
                        id: doc.id,
                        title: doc.title,
                        data: doc.data ?? {},
                        schemaId: doc.schemaId || childSchema.id,
                      });
                    });

                    fieldLinkedDocuments.forEach((doc) => {
                      mergedLinkedDocuments.set(doc.id, {
                        id: doc.id,
                        title: doc.title,
                        data: doc.data ?? {},
                        schemaId: doc.schemaId || childSchema.id,
                      });
                    });

                    const linkedDocuments = Array.from(mergedLinkedDocuments.values());

                    return (
                      <EmbeddedFormList
                        fieldLabel={fieldDef.label}
                        iconName={fieldDef.icon}
                        childSchema={childSchema}
                        linkedDocuments={linkedDocuments}
                        onCreateDocument={(title, data) => {
                          const seedData = Object.keys(data ?? {}).length > 0 ? data : buildDefaultValues(childSchema.fields);
                          const created = onCreateLinkedDocument?.({
                            schemaId: childSchema.id,
                            title,
                            parentDocumentId: activeDocumentId,
                            seedData,
                          });

                          const nextDocument = created ?? {
                            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            title,
                            data: seedData,
                            schemaId: childSchema.id,
                          };

                          field.onChange([...linkedDocuments, nextDocument]);
                        }}
                        onDeleteDocument={(documentId) => {
                          field.onChange(linkedDocuments.filter((doc) => doc.id !== documentId));
                          onDeleteLinkedDocument?.(documentId);
                        }}
                        onNavigateToDocument={(documentId, schemaId) => {
                          const nextSchemaId = schemaId || childSchema.id;
                          onNavigateToLinkedDocument?.(documentId, nextSchemaId);
                        }}
                      />
                    );
                  } else if (linkToSchemaId) {
                    return (
                      <div className="rounded-lg border border-border/50 bg-destructive/10 p-4 text-sm text-destructive">
                        Error: Schema "{linkToSchemaId}" not found for field "{fieldDef.label}"
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-lg border border-border/50 bg-destructive/10 p-4 text-sm text-destructive">
                      Error: Field "{fieldDef.label}" is missing linkTo configuration
                    </div>
                  );
                })() : null}

                {fieldDef.description && (
                  <FieldDescription>{fieldDef.description}</FieldDescription>
                )}
                {fieldDef.generator && !fieldDef.description ? (
                  <FieldDescription>
                    This value is generated from the schema rule and can be regenerated.
                  </FieldDescription>
                ) : null}
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </>
            )}

          </Field>
        )}
      />
    )
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FieldGroup>
        {fields.map((fieldDef) => renderField(fieldDef))}
      </FieldGroup>
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-h-5">
          {lastDraftSaved && (
            <>
              <Save className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span>Draft saved at {lastDraftSaved}</span>
            </>
          )}
        </div>
        <Button
          type="submit"
          className={
            isCaptured
              ? "bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200 min-w-35"
              : "min-w-35"
          }
        >
          {isCaptured ? (
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              Captured!
            </span>
          ) : (
            "Capture"
          )}
        </Button>
      </div>
    </form>
  );
};

export {
  Capture
};