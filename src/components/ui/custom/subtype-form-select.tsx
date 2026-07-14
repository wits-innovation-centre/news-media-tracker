import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Field,
    FieldDescription,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    evaluateVisibility,
    generateFieldValue,
    isValidPathInRecord,
    flattenTieredOptions,
} from "@/lib/utils";
import type { FieldDefinition, TieredOptions } from "@/lib/types";

interface SubtypeFormSelectProps {
    fieldName: string;
    fieldLabel: string;
    subtypeFields: Record<string, FieldDefinition[]>;
    currentValues: Record<string, any>;
    onValuesChange: (fieldName: string, values: Record<string, any>) => void;
}

const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === "string") {
        return value
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }
    return [];
};

const isDeferredRelationField = (field: FieldDefinition) => {
    return (
        field.type.data === "array<string>" &&
        field.type.input === "select" &&
        (!field.options || (Array.isArray(field.options) && field.options.length === 0))
    );
};

const getSelectOptions = (field: FieldDefinition) => {
    if (!field.options) return [];
    return Array.isArray(field.options)
        ? field.options.map(String)
        : flattenTieredOptions(field.options);
};

const generateZodSchema = (
    fields: FieldDefinition[],
    currentValues: Record<string, any>
) => {
    const schemaShape: Record<string, z.ZodTypeAny> = {};

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
            case "array<string>":
                fieldSchema = z.array(z.string());
                if (field.required) {
                    fieldSchema = (
                        fieldSchema as z.ZodArray<z.ZodString>
                    ).min(1, "This field is required");
                }
                break;
            case "date":
                fieldSchema = z.string();
                break;
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
                        {
                            message:
                                "The selected category hierarchy path does not exist in the schema",
                        }
                    );
                }

                if (field.required) {
                    fieldSchema = (fieldSchema as z.ZodString).min(
                        1,
                        "Selecting an option is required"
                    );
                }
                break;
            case "string":
            case "markdown":
            default:
                fieldSchema = z.string();
                if (field.required) {
                    fieldSchema = (fieldSchema as z.ZodString).min(
                        1,
                        "This field is required"
                    );
                }
                break;
        }

        if (
            !field.required &&
            field.type.data !== "string" &&
            field.type.data !== "markdown"
        ) {
            fieldSchema = fieldSchema.optional();
        }

        schemaShape[field.name] = fieldSchema;
    });

    return z.object(schemaShape);
};

const buildDefaultValues = (
    fields: FieldDefinition[],
    seedValues: Record<string, any> = {}
) => {
    const defaults: Record<string, any> = {};

    fields.forEach((field) => {
        defaults[field.name] = generateFieldValue(field, {
            ...seedValues,
            ...defaults,
        });
    });

    return defaults;
};

export function SubtypeFormSelect({
    fieldName,
    fieldLabel,
    subtypeFields,
    currentValues,
    onValuesChange,
}: SubtypeFormSelectProps) {
    if (!fieldName || !fieldLabel) {
        return (
            <div className="rounded-lg border border-border/50 bg-destructive/10 p-4 text-sm text-destructive">
                Error: fieldName or fieldLabel not provided
            </div>
        );
    }

    const selectedSubtype = (currentValues[fieldName] as string) || "";
    const subtypeOptions = Object.keys(subtypeFields);
    const selectedFields = subtypeFields[selectedSubtype] || [];

    const subtypeValues = useMemo(() => {
        const subtypeKey = `${fieldName}__values`;
        return currentValues[subtypeKey] || {};
    }, [fieldName, currentValues]);

    const defaultValues = useMemo(() => {
        return {
            ...buildDefaultValues(selectedFields, subtypeValues),
            ...subtypeValues,
        };
    }, [selectedFields, subtypeValues]);

    const form = useForm<Record<string, any>>({
        resolver: (values, context, options) => {
            const dynamicSchema = generateZodSchema(selectedFields, values);
            return zodResolver(dynamicSchema as any)(
                values as any,
                context,
                options as any
            ) as any;
        },
        defaultValues,
    });

    const watchedValues = form.watch();

    const handleSubtypeChange = (newSubtype: string | null) => {
        if (!newSubtype) return;
        onValuesChange(fieldName, { [fieldName]: newSubtype });
        form.reset(buildDefaultValues(subtypeFields[newSubtype] || [], {}));
    };

    const handleFieldChange = (fieldDefName: string, value: any) => {
        form.setValue(fieldDefName, value, {
            shouldDirty: true,
            shouldValidate: true,
        });

        const subtypeKey = `${fieldName}__values`;
        const nextValues = { ...watchedValues };
        nextValues[fieldDefName] = value;

        onValuesChange(subtypeKey, nextValues as Record<string, any>);
    };

    const renderField = (fieldDef: FieldDefinition) => {
        if (!fieldDef || !fieldDef.name) return null;

        const isVisible = evaluateVisibility(fieldDef.visibility, watchedValues);
        if (!isVisible) return null;

        const fieldValue = watchedValues[fieldDef.name];

        if (fieldDef.type.input === "text") {
            return (
                <Input
                    key={fieldDef.name}
                    value={(fieldValue as string) ?? ""}
                    onChange={(e) => handleFieldChange(fieldDef.name, e.target.value)}
                    placeholder={fieldDef.label}
                />
            );
        }

        if (fieldDef.type.input === "textarea") {
            return (
                <Textarea
                    key={fieldDef.name}
                    value={(fieldValue as string) ?? ""}
                    onChange={(e) => handleFieldChange(fieldDef.name, e.target.value)}
                    placeholder="Write your content here..."
                    className="min-h-32 resize-y font-mono"
                />
            );
        }

        if (fieldDef.type.input === "date") {
            return (
                <Input
                    key={fieldDef.name}
                    type="date"
                    value={(fieldValue as string) ?? ""}
                    onChange={(e) => handleFieldChange(fieldDef.name, e.target.value)}
                />
            );
        }

        if (fieldDef.type.input === "date-range") {
            return (
                <div key={fieldDef.name} className="flex gap-2">
                    <Input
                        type="date"
                        placeholder="Start date"
                        onChange={(e) =>
                            handleFieldChange(
                                fieldDef.name,
                                e.target.value + " - " + (fieldValue as string)?.split(" - ")[1]
                            )
                        }
                    />
                    <Input
                        type="date"
                        placeholder="End date"
                        onChange={(e) =>
                            handleFieldChange(
                                fieldDef.name,
                                (fieldValue as string)?.split(" - ")[0] + " - " + e.target.value
                            )
                        }
                    />
                </div>
            );
        }

        if (fieldDef.type.input === "checkbox" || fieldDef.type.input === "switch") {
            return (
                <div key={fieldDef.name} className="flex items-center gap-2">
                    <Checkbox
                        id={fieldDef.name}
                        checked={(fieldValue as boolean) ?? false}
                        onCheckedChange={(checked) =>
                            handleFieldChange(fieldDef.name, checked)
                        }
                    />
                    <label htmlFor={fieldDef.name} className="text-sm">
                        {fieldDef.label}
                    </label>
                </div>
            );
        }

        if (fieldDef.type.input === "select") {
            const options = getSelectOptions(fieldDef);
            return (
                <Select
                    key={fieldDef.name}
                    value={(fieldValue as string) ?? ""}
                    onValueChange={(value) => handleFieldChange(fieldDef.name, value)}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={`Select ${fieldDef.label.toLowerCase()}...`} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={String(option)} value={String(option)}>
                                {String(option)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }

        if (fieldDef.type.input === "text-multi") {
            const values = toStringArray(fieldValue);
            const listValues = values.length > 0 ? values : [""];

            return (
                <div key={fieldDef.name} className="space-y-2">
                    {listValues.map((entry, index) => (
                        <Input
                            key={`${fieldDef.name}-${index}`}
                            value={entry}
                            onChange={(e) => {
                                const next = [...listValues];
                                next[index] = e.target.value;
                                handleFieldChange(
                                    fieldDef.name,
                                    next.filter((item) => item.trim().length > 0)
                                );
                            }}
                            placeholder={`${fieldDef.label} ${index + 1}`}
                        />
                    ))}
                </div>
            );
        }

        return null;
    };

    return (
        <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
            <div>
                <label className="text-sm font-medium">{fieldLabel}</label>
                <Select value={selectedSubtype} onValueChange={handleSubtypeChange}>
                    <SelectTrigger>
                        <SelectValue placeholder={`Select ${fieldLabel.toLowerCase()}...`} />
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

            {selectedSubtype && (
                <div className="space-y-3">
                    {selectedFields.map((fieldDef) => (
                        <Field key={fieldDef.name}>
                            <FieldLabel>{fieldDef.label}</FieldLabel>
                            {renderField(fieldDef)}
                            {fieldDef.description && (
                                <FieldDescription>{fieldDef.description}</FieldDescription>
                            )}
                        </Field>
                    ))}
                </div>
            )}
        </div>
    );
}
