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
  type TieredOptions
} from "@/lib/types";
import {
  isValidPathInRecord,
} from "@/lib/utils"

interface CaptureProps {
  fields: FieldDefinition[]
  initialValues?: Record<string, any>
  onValuesChange?: (values: Record<string, any>) => void
  onSubmit: (frontmatter: Record<string, any>, markdownBody: string) => void
};

type DynamicFormValues = Record<string, string | string[] | number | boolean>

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
          fieldSchema = (fieldSchema as z.ZodString).min(1, "This field is required")
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
              if (!val) return !field.required; // Pass if empty and not required

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

function Capture({ fields, initialValues, onValuesChange, onSubmit }: CaptureProps) {
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
                        <Textarea
                          {...field}
                          value={Array.isArray(field.value) ? field.value.join("\n") : (field.value as string) ?? ""}
                          id={fieldDef.name}
                          placeholder="Enter one item per line"
                          className="min-h-30 resize-y"
                          aria-invalid={fieldState.invalid}
                        />
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