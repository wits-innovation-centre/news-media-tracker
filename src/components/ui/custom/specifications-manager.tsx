import { useEffect, useState } from "react"
import { Plus, Save, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { SpecificationDefinition, SpecificationStore } from "@/lib/types"

interface SpecificationsManagerProps {
    registry: SpecificationDefinition[]
    specifications: SpecificationStore
    onSave: (nextRegistry: SpecificationDefinition[], nextSpecifications: SpecificationStore) => Promise<void> | void
}

const serialize = (values: string[]) => values.join("\n")
const parse = (text: string) =>
    [...new Set(text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]

function createDraftSpecification(): SpecificationDefinition {
    return {
        id: "",
        name: "",
        description: "",
    }
}

function SpecificationsManager({ registry, specifications, onSave }: SpecificationsManagerProps) {
    const [registryDraft, setRegistryDraft] = useState<SpecificationDefinition[]>(registry)
    const [selectedId, setSelectedId] = useState<string>(registry[0]?.id ?? "")
    const [detailsDraft, setDetailsDraft] = useState<SpecificationDefinition>(registry[0] ?? createDraftSpecification())
    const [valuesByIdDraft, setValuesByIdDraft] = useState<SpecificationStore>(specifications)
    const [valuesDraft, setValuesDraft] = useState(serialize(specifications[registry[0]?.id ?? ""] ?? []))
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        setRegistryDraft(registry)
        setValuesByIdDraft(specifications)
        const fallbackId = registry[0]?.id ?? ""
        const nextSelected = registry.some((item) => item.id === selectedId) ? selectedId : fallbackId
        setSelectedId(nextSelected)
        const nextSelectedSpec = registry.find((item) => item.id === nextSelected) ?? createDraftSpecification()
        setDetailsDraft(nextSelectedSpec)
        setValuesDraft(serialize((specifications[nextSelected] ?? [])))
    }, [registry, specifications])

    const withCurrentDetails = (current: SpecificationDefinition[]) => {
        if (!selectedId) return current
        return current.map((item) => item.id === selectedId ? detailsDraft : item)
    }

    const importFile = async (file?: File) => {
        if (!file) return
        const text = await file.text()
        const values = parse(text)
        setValuesDraft((current) => {
            const next = serialize([...parse(current), ...values])
            if (selectedId) {
                setValuesByIdDraft((existing) => ({ ...existing, [selectedId]: parse(next) }))
            }
            return next
        })
    }

    const handleCreateSpecification = () => {
        const nextId = crypto.randomUUID().slice(0, 8)
        const nextSpec: SpecificationDefinition = {
            id: `spec_${nextId}`,
            name: "New Specification",
            description: "",
        }

        setRegistryDraft((current) => [...current, nextSpec])
        setSelectedId(nextSpec.id)
        setDetailsDraft(nextSpec)
        setValuesByIdDraft((current) => ({ ...current, [nextSpec.id]: [] }))
        setValuesDraft("")
    }

    const handleDeleteSpecification = (specificationId: string) => {
        const nextRegistry = registryDraft.filter((item) => item.id !== specificationId)
        setRegistryDraft(nextRegistry)
        const nextSelected = nextRegistry[0]?.id ?? ""
        setSelectedId(nextSelected)
        setDetailsDraft(nextRegistry.find((item) => item.id === nextSelected) ?? createDraftSpecification())
        setValuesByIdDraft((current) => {
            const next = { ...current }
            delete next[specificationId]
            return next
        })
        setValuesDraft(serialize(valuesByIdDraft[nextSelected] ?? []))
    }

    const handleSelectSpecification = (specificationId: string) => {
        if (selectedId) {
            setValuesByIdDraft((current) => ({
                ...current,
                [selectedId]: parse(valuesDraft),
            }))
        }
        const nextRegistryDraft = withCurrentDetails(registryDraft)
        setRegistryDraft(nextRegistryDraft)
        setSelectedId(specificationId)
        const nextSpec = nextRegistryDraft.find((item) => item.id === specificationId) ?? createDraftSpecification()
        setDetailsDraft(nextSpec)
        setValuesDraft(serialize(valuesByIdDraft[specificationId] ?? []))
    }

    const handleSave = async () => {
        const nextRegistryDraft = withCurrentDetails(registryDraft)
        setRegistryDraft(nextRegistryDraft)

        const normalizedRegistry = nextRegistryDraft
            .map((item) => ({
                id: item.id.trim(),
                name: item.name.trim(),
                description: item.description?.trim() || undefined,
            }))
            .filter((item) => item.id && item.name)

        const nextValuesById = {
            ...valuesByIdDraft,
            ...(selectedId ? { [selectedId]: parse(valuesDraft) } : {}),
        }

        const renamedSelectedId = detailsDraft.id.trim()
        if (selectedId && renamedSelectedId && renamedSelectedId !== selectedId) {
            nextValuesById[renamedSelectedId] = parse(valuesDraft)
            delete nextValuesById[selectedId]
        }

        const nextSpecifications: SpecificationStore = {}
        normalizedRegistry.forEach((item) => {
            nextSpecifications[item.id] = [...new Set((nextValuesById[item.id] ?? []).map((value) => value.trim()).filter(Boolean))]
        })

        setIsSaving(true)
        try {
            await onSave(normalizedRegistry, nextSpecifications)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                <section className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">Specification Registry</h4>
                        <Button type="button" variant="outline" size="sm" onClick={handleCreateSpecification}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            New
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {registryDraft.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleSelectSpecification(item.id)}
                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedId === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                            >
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs text-muted-foreground">{item.id}</div>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">Specification Details</h4>
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                            <Upload className="h-3.5 w-3.5" />
                            Upload
                            <input
                                type="file"
                                accept=".txt,.csv"
                                className="hidden"
                                onChange={(event) => {
                                    void importFile(event.target.files?.[0])
                                    event.currentTarget.value = ""
                                }}
                            />
                        </label>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                        <Input
                            value={detailsDraft.id}
                            onChange={(event) => setDetailsDraft((current) => ({ ...current, id: event.target.value }))}
                            placeholder="Specification id"
                        />
                        <Input
                            value={detailsDraft.name}
                            onChange={(event) => setDetailsDraft((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Specification name"
                        />
                    </div>

                    <Textarea
                        value={detailsDraft.description ?? ""}
                        onChange={(event) => setDetailsDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Optional description"
                        className="min-h-20"
                    />

                    <Textarea
                        value={valuesDraft}
                        onChange={(event) => {
                            const next = event.target.value
                            setValuesDraft(next)
                            if (selectedId) {
                                setValuesByIdDraft((current) => ({ ...current, [selectedId]: parse(next) }))
                            }
                        }}
                        placeholder="One specification value per line"
                        className="min-h-72"
                    />

                    <p className="text-xs text-muted-foreground">Supports newline or comma-separated lists.</p>

                    {selectedId ? (
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteSpecification(selectedId)}
                            >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Delete Specification
                            </Button>
                        </div>
                    ) : null}
                </section>
            </div>

            <div className="flex justify-end">
                <Button type="button" onClick={handleSave} disabled={isSaving}>
                    <Save className="mr-1 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Specifications"}
                </Button>
            </div>
        </div>
    )
}

export { SpecificationsManager }