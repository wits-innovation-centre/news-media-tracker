import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { evaluateVisibility, flattenTieredOptions, generateFieldValue } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HierarchicalSelect } from "@/components/ui/custom/hierarchical-select";

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
import { Button } from "@/components/ui/button";
import {
  type FieldDefinition,
  type SpecificationStore,
  type TieredOptions
} from "@/lib/types";
import {
  isValidPathInRecord,
} from "@/lib/utils"
import { SearchSelectInput } from "@/components/ui/custom/search-select-input";

interface CaptureProps {
  fields: FieldDefinition[]
  initialValues?: Record<string, any>
  onValuesChange?: (values: Record<string, any>) => void
  specifications: SpecificationStore
  onAddSpecification?: (specificationId: string, value: string) => Promise<void> | void
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

function Capture({ fields, initialValues, onValuesChange, specifications, onAddSpecification, onSubmit }: CaptureProps) {
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
    form.reset({ ...buildDefaultValues(fields), ...(initialValues ?? {}) })
  }, [fields, form, initialValues])

  useEffect(() => {
    const subscription = form.watch((values) => {
      onValuesChange?.(values as Record<string, any>)
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

    fields.forEach((field) => {
      if (isDeferredRelationField(field)) return;

      const isVisible = evaluateVisibility(field.visibility, values);
      if (!isVisible) return;

      if (field.type.data === "markdown") {
        markdownBody = (values[field.name] as string) || ""
      } else {
        frontmatter[field.name] = values[field.name]
      }
    })

    onSubmit(frontmatter, markdownBody)
    form.reset(buildDefaultValues(fields))
  }

  const handleRegenerateField = (fieldDef: FieldDefinition) => {
    form.setValue(
      fieldDef.name,
      generateFieldValue(fieldDef, form.getValues() as Record<string, any>) as DynamicFormValues[string],
      { shouldDirty: true, shouldValidate: true }
    )
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FieldGroup>
        {fields.map((fieldDef) => {
          if (isDeferredRelationField(fieldDef)) return null;

          const isVisible = evaluateVisibility(fieldDef.visibility, watchedValues);
          if (!isVisible) return null;

          return (
            <Controller
              key={fieldDef.name}
              control={form.control}
              name={fieldDef.name}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  className={fieldDef.type.input === "checkbox" || fieldDef.type.input === "switch" ? "flex flex-row items-center gap-3 space-y-0 rounded-md border p-4" : ""}
                >

                  {fieldDef.type.input === "checkbox" || fieldDef.type.input === "switch" ? (
                    <>
                      <Checkbox
                        id={fieldDef.name}
                        checked={field.value as boolean}
                        onCheckedChange={field.onChange}
                        aria-invalid={fieldState.invalid}
                      />
                      <div className="space-y-1 leading-none w-full">
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
                      <FieldLabel htmlFor={fieldDef.name}>
                        {fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                      </FieldLabel>

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
                      ) : fieldDef.type.input === "search-select-input" ? (
                        (() => {
                          const specificationKind = getSpecificationKind(fieldDef)
                          const searchOptions = getSearchSelectOptions(fieldDef)

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
                                      <SearchSelectInput
                                        id={`${fieldDef.name}-${index}`}
                                        value={entry}
                                        options={searchOptions}
                                        placeholder={`Search ${fieldDef.label.toLowerCase()}...`}
                                        onChange={(nextValue) => updateIndex(index, nextValue)}
                                        allowCreate={Boolean(specificationKind)}
                                        onCreateOption={async (nextValue) => {
                                          if (!specificationKind) return
                                          await onAddSpecification?.(specificationKind, nextValue)
                                        }}
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
                            <SearchSelectInput
                              id={fieldDef.name}
                              value={(field.value as string) ?? ""}
                              options={searchOptions}
                              placeholder={`Search ${fieldDef.label.toLowerCase()}...`}
                              onChange={field.onChange}
                              allowCreate={Boolean(specificationKind)}
                              onCreateOption={async (nextValue) => {
                                if (!specificationKind) return
                                await onAddSpecification?.(specificationKind, nextValue)
                              }}
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
                      ) : null}

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
          );
        })}
      </FieldGroup>
      <Button type="submit" className="w-full">Capture</Button>
    </form>
  );
};

export {
  Capture
};