import { useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

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

type FieldType = "string" | "number" | "boolean" | "markdown";

interface FieldDefinition {
  name: string
  label: string
  type: FieldType
  required?: boolean
  description?: string
};

interface CaptureProps {
  fields: FieldDefinition[]
  onSubmit: (frontmatter: Record<string, any>, markdownBody: string) => void
};

type DynamicFormValues = Record<string, string | number | boolean>

const generateZodSchema = (fields: FieldDefinition[]) => {
  const schemaShape: Record<string, z.ZodTypeAny> = {}

  fields.forEach((field) => {
    let fieldSchema: z.ZodTypeAny

    switch (field.type) {
      case "number":
        fieldSchema = z.coerce.number()
        break
      case "boolean":
        fieldSchema = z.boolean()
        break
      case "string":
      case "markdown":
      default:
        fieldSchema = z.string()
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodString).min(1, "This field is required")
        }
        break
    }

    if (!field.required && field.type !== "string" && field.type !== "markdown") {
      fieldSchema = fieldSchema.optional()
    }

    schemaShape[field.name] = fieldSchema
  })

  return z.object(schemaShape)
}

function Capture({ fields, onSubmit }: CaptureProps) {
  const dynamicSchema = useMemo(() => generateZodSchema(fields), [fields])

  const defaultValues = useMemo(() => {
    const defaults: DynamicFormValues = {}
    fields.forEach((field) => {
      if (field.type === "boolean") defaults[field.name] = false
      else if (field.type === "number") defaults[field.name] = 0
      else defaults[field.name] = ""
    })
    return defaults
  }, [fields])

  const form = useForm<DynamicFormValues>({
    resolver: zodResolver(dynamicSchema as any),
    defaultValues,
  })

  const handleSubmit = (values: DynamicFormValues) => {
    const frontmatter: Record<string, any> = {}
    let markdownBody = ""

    fields.forEach((field) => {
      if (field.type === "markdown") {
        markdownBody = (values[field.name] as string) || ""
      } else {
        frontmatter[field.name] = values[field.name]
      }
    })

    onSubmit(frontmatter, markdownBody)
    form.reset()
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FieldGroup>
        {fields.map((fieldDef) => (
          <Controller
            key={fieldDef.name}
            control={form.control}
            name={fieldDef.name}
            render={({ field, fieldState }) => (
              <Field 
                data-invalid={fieldState.invalid} 
                className={fieldDef.type === "boolean" ? "flex flex-row items-center gap-3 space-y-0 rounded-md border p-4" : ""}
              >
                
                {fieldDef.type === "boolean" ? (
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
                    
                    {fieldDef.type === "string" || fieldDef.type === "number" ? (
                      <Input
                        {...field}
                        value={(field.value as string | number) ?? ""}
                        id={fieldDef.name}
                        type={fieldDef.type === "number" ? "number" : "text"}
                        placeholder={`Enter ${fieldDef.label.toLowerCase()}...`}
                        aria-invalid={fieldState.invalid}
                      />
                    ) : fieldDef.type === "markdown" ? (
                      <Textarea
                        {...field}
                        value={(field.value as string) ?? ""}
                        id={fieldDef.name}
                        placeholder="Write your content here..."
                        className="min-h-[200px] resize-y font-mono"
                        aria-invalid={fieldState.invalid}
                      />
                    ) : null}

                    {fieldDef.description && (
                      <FieldDescription>{fieldDef.description}</FieldDescription>
                    )}
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </>
                )}
                
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      
      <Button type="submit" className="w-full">Capture</Button>
    </form>
  )
};

export {
    type FieldType,
    type FieldDefinition,

    Capture
};