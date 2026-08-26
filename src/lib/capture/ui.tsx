import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, Check, Save } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HierarchicalSelect } from "@/components/ui/custom/hierarchical-select";
import { MultiSelect } from "@/components/ui/custom/multi-select";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/custom/search-select";
import { SearchSelectInput } from "@/components/ui/custom/search-select-input";
import { EmbeddedFormList } from "@/components/ui/custom/embedded-form-list";

import { generateFieldValue, evaluateVisibility } from "@/lib/utils";
import type { DocumentSchema, FieldDefinition, SpecificationStore, TieredOptions } from "@/lib/types";
import {
  toStringArray,
  buildDefaultValues,
  isDeferredRelationField,
  getSelectOptions,
  getSpecificationKind,
  getSearchSelectOptions,
  generateZodSchema,
  extractSubmissionPayload,
  type DynamicFormValues,
} from "./fn";

export interface CaptureProps {
  fields: FieldDefinition[];
  subtypeFields?: Record<string, FieldDefinition[]>;
  initialValues?: Record<string, any>;
  onValuesChange?: (values: Record<string, any>) => void;
  specifications: SpecificationStore;
  onAddSpecification?: (specificationId: string, value: string) => Promise<void> | void;
  schemas?: Record<string, DocumentSchema>;
  activeDocumentId?: string;
  onCreateLinkedDocument?: (params: {
    schemaId: string;
    title: string;
    parentDocumentId?: string;
    seedData?: Record<string, any>;
  }) => {
    id: string;
    title: string;
    data: Record<string, any>;
    schemaId: string;
  };
  onDeleteLinkedDocument?: (documentId: string) => void;
  onNavigateToLinkedDocument?: (documentId: string, schemaId: string) => void;
  getExistingLinkedDocuments?: (params: {
    parentDocumentId?: string;
    schemaId: string;
  }) => {
    id: string;
    title: string;
    data: Record<string, any>;
    schemaId: string;
  }[];
  onSubmit: (frontmatter: Record<string, any>, markdownBody: string) => void;
}

export function Capture({
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
  const prevInitialValuesRef = useRef(initialValues);
  const prevFieldsRef = useRef(fields);

  const [isCaptured, setIsCaptured] = useState(false);
  const [lastDraftSaved, setLastDraftSaved] = useState<string | null>(null);

  const defaultValues = useMemo(() => {
    return { ...buildDefaultValues(fields), ...(initialValues ?? {}) };
  }, [fields, initialValues]);

  const form = useForm<DynamicFormValues>({
    resolver: (values, context, options) => {
      const dynamicSchema = generateZodSchema(fields, values, subtypeFields);
      return zodResolver(dynamicSchema as any)(values as any, context, options as any) as any;
    },
    defaultValues,
  });

  useEffect(() => {
    const initialValuesChanged = JSON.stringify(initialValues) !== JSON.stringify(prevInitialValuesRef.current);
    const fieldsChanged = JSON.stringify(fields) !== JSON.stringify(prevFieldsRef.current);

    if (initialValuesChanged || fieldsChanged) {
      prevInitialValuesRef.current = initialValues;
      prevFieldsRef.current = fields;
      form.reset({ ...buildDefaultValues(fields), ...(initialValues ?? {}) });
      setLastDraftSaved(null);
    }
  }, [fields, form, initialValues]);

  useEffect(() => {
    const subscription = form.watch((values) => {
      onValuesChange?.(values as Record<string, any>);
      setLastDraftSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    });

    return () => subscription.unsubscribe();
  }, [form, onValuesChange]);

  const watchedValues = form.watch();

  const handleSubmit = (values: DynamicFormValues) => {
    const { frontmatter, markdownBody } = extractSubmissionPayload(fields, subtypeFields, values);
    onSubmit(frontmatter, markdownBody);
    form.reset(values);

    setIsCaptured(true);
    setTimeout(() => {
      setIsCaptured(false);
    }, 3000);
  };

  const handleRegenerateField = (fieldDef: FieldDefinition) => {
    form.setValue(
      fieldDef.name,
      generateFieldValue(fieldDef, form.getValues() as Record<string, any>) as DynamicFormValues[string],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const renderField = (fieldDef: FieldDefinition, keyPrefix: string = ""): ReactNode => {
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
                  {fieldDef.description && <FieldDescription>{fieldDef.description}</FieldDescription>}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </div>
              </>
            ) : (
              <>
                {fieldDef.type.input !== "embedded-form-list" && fieldDef.type.input !== "subtype-form-select" ? (
                  <FieldLabel htmlFor={fieldDef.name}>
                    {fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                  </FieldLabel>
                ) : null}

                {fieldDef.type.input === "repeating-group" ? (
                  (() => {
                    const items = Array.isArray(field.value) ? (field.value as Record<string, any>[]) : [];
                    const childFields: FieldDefinition[] =
                      "fields" in fieldDef && Array.isArray((fieldDef as any).fields)
                        ? ((fieldDef as any).fields as FieldDefinition[])
                        : [];

                    const createEmptyItem = () => {
                      const emptyObj: Record<string, any> = {};
                      childFields.forEach((child) => {
                        emptyObj[child.name] = child.default ?? "";
                      });
                      return emptyObj;
                    };

                    const activeItems = items.length > 0 ? items : [createEmptyItem()];

                    const updateItemField = (itemIndex: number, childName: string, childVal: any) => {
                      const next = activeItems.map((item, idx) => {
                        if (idx !== itemIndex) return item;
                        return { ...item, [childName]: childVal };
                      });
                      field.onChange(next);
                    };

                    const addItem = () => {
                      field.onChange([...activeItems, createEmptyItem()]);
                    };

                    const removeItem = (itemIndex: number) => {
                      const next = activeItems.filter((_, idx) => idx !== itemIndex);
                      field.onChange(next.length > 0 ? next : [createEmptyItem()]);
                    };

                    const addButtonLabel =
                      "addButtonText" in fieldDef && typeof (fieldDef as any).addButtonText === "string"
                        ? (fieldDef as any).addButtonText
                        : `Add ${fieldDef.label}`;

                    return (
                      <div className="space-y-3">
                        {activeItems.map((item, itemIndex) => (
                          <div
                            key={`${fieldDef.name}-${itemIndex}`}
                            className="relative rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-border/40">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {fieldDef.label} #{itemIndex + 1}
                              </span>
                              {activeItems.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="h-6 px-2 text-destructive hover:bg-destructive/10"
                                  onClick={() => removeItem(itemIndex)}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>

                            <div className={`grid grid-cols-1 ${childFields.length > 1 ? "md:grid-cols-2" : ""} gap-3`}>
                              {childFields.map((child) => {
                                const childValue = item[child.name] ?? "";
                                const childOptions = "options" in child ? (child as any).options : undefined;
                                const searchOptions = childOptions
                                  ? (Array.isArray(childOptions) ? childOptions : [])
                                  : [];

                                return (
                                  <div key={child.name} className="space-y-1">
                                    <label className="text-xs font-medium text-foreground">
                                      {child.label} {child.required && <span className="text-red-500">*</span>}
                                    </label>

                                    {child.type.input === "search-select-input" || child.type.input === "search-select" ? (
                                      <SearchSelectInput
                                        id={`${fieldDef.name}-${itemIndex}-${child.name}`}
                                        value={String(childValue)}
                                        options={searchOptions}
                                        placeholder={`Select or enter ${child.label.toLowerCase()}...`}
                                        onChange={(val) => updateItemField(itemIndex, child.name, val)}
                                        allowCreate={child.type.input === "search-select-input"}
                                      />
                                    ) : child.type.input === "checkbox" || child.type.input === "switch" ? (
                                      <div className="pt-2">
                                        <Checkbox
                                          checked={Boolean(childValue)}
                                          onCheckedChange={(checked) => updateItemField(itemIndex, child.name, checked)}
                                        />
                                      </div>
                                    ) : (
                                      <Input
                                        id={`${fieldDef.name}-${itemIndex}-${child.name}`}
                                        type={child.type.data === "number" ? "number" : "text"}
                                        value={childValue}
                                        placeholder={`Enter ${child.label.toLowerCase()}...`}
                                        onChange={(e) =>
                                          updateItemField(
                                            itemIndex,
                                            child.name,
                                            child.type.data === "number" ? e.target.valueAsNumber || "" : e.target.value
                                          )
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        <Button type="button" variant="outline" size="sm" onClick={addItem}>
                          + {addButtonLabel}
                        </Button>
                      </div>
                    );
                  })()
                ) : fieldDef.type.input === "text" || fieldDef.type.input === "date" ? (
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
                          <TooltipContent>Generate New</TooltipContent>
                        </Tooltip>
                      </Button>
                    ) : null}
                  </div>
                ) : fieldDef.type.input === "date-range" ? (
                  (() => {
                    const rawValue = typeof field.value === "string" ? field.value : "";
                    const [start = "", end = ""] = rawValue ? rawValue.split(" - ") : [];

                    return (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={start}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            field.onChange(nextStart || end ? `${nextStart} - ${end}` : "");
                          }}
                          aria-invalid={fieldState.invalid}
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                          type="date"
                          value={end}
                          onChange={(e) => {
                            const nextEnd = e.target.value;
                            field.onChange(start || nextEnd ? `${start} - ${nextEnd}` : "");
                          }}
                          aria-invalid={fieldState.invalid}
                        />
                      </div>
                    );
                  })()
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
                    options={("options" in fieldDef ? (fieldDef as any).options : undefined) as TieredOptions}
                    placeholder={`Select ${fieldDef.label.toLowerCase()}...`}
                    onChange={field.onChange}
                  />
                ) : fieldDef.type.input === "search-select-input" || fieldDef.type.input === "search-select" ? (
                  (() => {
                    const specificationKind = getSpecificationKind(fieldDef);
                    const searchOptions = getSearchSelectOptions(fieldDef, specifications);
                    const isCreatable = fieldDef.type.input === "search-select-input" && Boolean(specificationKind);
                    const SearchComponent = fieldDef.type.input === "search-select-input" ? SearchSelectInput : SearchSelect;

                    if ((fieldDef.type.data as string) === "array") {
                      const values = toStringArray(field.value);
                      const listValues = values.length > 0 ? values : [""];

                      const updateIndex = (index: number, nextValue: string) => {
                        const next = [...listValues];
                        next[index] = nextValue;
                        field.onChange(next.filter((entry) => entry.trim().length > 0));
                      };

                      const removeIndex = (index: number) => {
                        const next = listValues.filter((_, itemIndex) => itemIndex !== index);
                        field.onChange(next.filter((entry) => entry.trim().length > 0));
                      };

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
                                  {...(fieldDef.type.input === "search-select-input"
                                    ? {
                                      allowCreate: isCreatable,
                                      onCreateOption: async (nextValue: string) => {
                                        if (!specificationKind) return;
                                        await onAddSpecification?.(specificationKind, nextValue);
                                      },
                                    }
                                    : {})}
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
                      );
                    }

                    return (
                      <SearchComponent
                        id={fieldDef.name}
                        value={(field.value as string) ?? ""}
                        options={searchOptions}
                        placeholder={`Search ${fieldDef.label.toLowerCase()}...`}
                        onChange={field.onChange}
                        {...(fieldDef.type.input === "search-select-input"
                          ? {
                            allowCreate: isCreatable,
                            onCreateOption: async (nextValue: string) => {
                              if (!specificationKind) return;
                              await onAddSpecification?.(specificationKind, nextValue);
                            },
                          }
                          : {})}
                      />
                    );
                  })()
                ) : fieldDef.type.input === "select" ? (
                  (() => {
                    const selectOptions = getSelectOptions(fieldDef);

                    return (
                      <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
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
                    );
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
                    const values = toStringArray(field.value);

                    const updateIndex = (index: number, nextValue: string) => {
                      const next = values.length > 0 ? [...values] : [""];
                      next[index] = nextValue;
                      field.onChange(next);
                    };

                    const removeIndex = (index: number) => {
                      const next = values.filter((_, itemIndex) => itemIndex !== index);
                      field.onChange(next.length > 0 ? next : [""]);
                    };

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
                    );
                  })()
                ) : fieldDef.type.input === "subtype-form-select" ? (
                  (() => {
                    const selectedSubtype = String(field.value ?? "");
                    const subtypeOptions = Object.keys(subtypeFields || {});
                    const nestedFields = selectedSubtype ? subtypeFields?.[selectedSubtype] ?? [] : [];

                    return (
                      <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
                        <div>
                          <FieldLabel htmlFor={fieldDef.name}>
                            {fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                          </FieldLabel>
                          <Select value={selectedSubtype} onValueChange={field.onChange}>
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
                            {nestedFields.map((nestedField) =>
                              renderField(nestedField, `${keyPrefix}${fieldDef.name}__${selectedSubtype}__`)
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                ) : fieldDef.type.input === "embedded-form-list" ? (
                  (() => {
                    const linkToSchemaId = fieldDef.linkTo;
                    const childSchema = linkToSchemaId && schemas ? schemas[linkToSchemaId] : undefined;

                    if (childSchema) {
                      const rawLinkedDocuments = Array.isArray(field.value) ? (field.value as unknown[]) : [];
                      const fieldLinkedDocuments = rawLinkedDocuments
                        .filter((doc): doc is Record<string, unknown> => typeof doc === "object" && doc !== null)
                        .map((doc) => ({
                          id:
                            typeof doc.id === "string"
                              ? doc.id
                              : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          title: typeof doc.title === "string" ? doc.title : "",
                          data: typeof doc.data === "object" && doc.data !== null ? (doc.data as Record<string, any>) : {},
                          schemaId: typeof doc.schemaId === "string" ? doc.schemaId : childSchema.id,
                        }));

                      const existingLinkedDocuments =
                        getExistingLinkedDocuments?.({
                          parentDocumentId: activeDocumentId,
                          schemaId: childSchema.id,
                        }) ?? [];

                      const mergedLinkedDocuments = new Map<
                        string,
                        {
                          id: string;
                          title: string;
                          data: Record<string, any>;
                          schemaId: string;
                        }
                      >();

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
                            const seedData =
                              Object.keys(data ?? {}).length > 0 ? data : buildDefaultValues(childSchema.fields);
                            const created = onCreateLinkedDocument?.({
                              schemaId: childSchema.id,
                              title,
                              parentDocumentId: activeDocumentId,
                              seedData,
                            });

                            const nextDocument = created ?? {
                              id:
                                globalThis.crypto?.randomUUID?.() ??
                                `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
                  })()
                ) : null}

                {fieldDef.description && <FieldDescription>{fieldDef.description}</FieldDescription>}
                {fieldDef.generator && !fieldDef.description ? (
                  <FieldDescription>This value is generated from the schema rule and can be regenerated.</FieldDescription>
                ) : null}
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </>
            )}
          </Field>
        )}
      />
    );
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" autoComplete="off">
      <FieldGroup>{fields.map((fieldDef) => renderField(fieldDef))}</FieldGroup>
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
}