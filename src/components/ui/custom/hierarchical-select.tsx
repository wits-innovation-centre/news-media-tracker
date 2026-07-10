import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, ChevronRight, Link2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TieredOptions, TieredOptionsSchema } from "@/lib/types"

interface TierNode {
    id: string
    label: string
    path: string[]
    children?: TierNode[]
}

interface HierarchicalSelectProps {
    id: string
    value: string
    options: TieredOptions
    placeholder?: string
    onChange: (value: string) => void
}

function buildNodes(options: TieredOptions, schema?: TieredOptionsSchema, parentPath: string[] = []): TierNode[] {
    return Object.entries(options).flatMap(([key, value]) => {
        if (key.startsWith("$")) return []

        const nextPath = [...parentPath, key]
        const keyLabel = typeof schema?.$label === "object" && schema.$label?.[key] ? String(schema.$label[key]) : key

        if (Array.isArray(value)) {
            return [{
                id: nextPath.join("/"),
                label: keyLabel,
                path: nextPath,
                children: value.map((leaf) => ({
                    id: [...nextPath, leaf].join("/"),
                    label: leaf,
                    path: [...nextPath, leaf],
                })),
            }]
        }

        return [{
            id: nextPath.join("/"),
            label: keyLabel,
            path: nextPath,
            children: buildNodes(value as TieredOptions, schema, nextPath),
        }]
    })
}

function flattenNodes(nodes: TierNode[]): TierNode[] {
    return nodes.flatMap((node) => [node, ...(node.children ? flattenNodes(node.children) : [])])
}

function findNodeByPath(nodes: TierNode[], path: string[]): TierNode | undefined {
    for (const node of nodes) {
        if (node.path.join(" / ") === path.join(" / ")) return node
        if (node.children) {
            const nested = findNodeByPath(node.children, path)
            if (nested) return nested
        }
    }

    return undefined
}

function HierarchicalSelect({ id, value, options, placeholder = "Select option...", onChange }: HierarchicalSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [currentPath, setCurrentPath] = useState<TierNode[]>([])
    const containerRef = useRef<HTMLDivElement>(null)

    const treeSchema = options.$schema
    const rootNodes = useMemo(() => buildNodes(options, treeSchema), [options, treeSchema])
    const flatNodes = useMemo(() => flattenNodes(rootNodes).filter((node) => !node.children?.length), [rootNodes])

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
                setSearchQuery("")
                setCurrentPath([])
            }
        }

        document.addEventListener("mousedown", handlePointerDown)
        return () => document.removeEventListener("mousedown", handlePointerDown)
    }, [])

    const filteredOptions = useMemo(() => {
        if (!searchQuery.trim()) return []

        const normalized = searchQuery.trim().toLowerCase()
        return flatNodes.filter((node) => node.path.join(" / ").toLowerCase().includes(normalized))
    }, [flatNodes, searchQuery])

    const currentOptions = useMemo(() => {
        if (searchQuery.trim()) return []
        if (currentPath.length === 0) return rootNodes
        return currentPath[currentPath.length - 1].children ?? []
    }, [currentPath, rootNodes, searchQuery])

    const selectedLabel = value || placeholder

    const handleSelect = (node: TierNode) => {
        const nextValue = node.path.join(" / ")
        onChange(nextValue)
        setIsOpen(false)
        setSearchQuery("")
        setCurrentPath([])
    }

    const openNode = (node: TierNode) => {
        if (node.children?.length) {
            setCurrentPath((previous) => [...previous, node])
            return
        }

        handleSelect(node)
    }

    const goBack = () => {
        setCurrentPath((previous) => previous.slice(0, -1))
    }

    const clearSelection = () => {
        onChange("")
        setSearchQuery("")
        setCurrentPath([])
    }

    useEffect(() => {
        if (!value) return
        const selectedNode = findNodeByPath(rootNodes, value.split(" / "))
        if (!selectedNode) return
    }, [rootNodes, value])

    return (
        <div ref={containerRef} className="w-full space-y-2">
            <Button
                type="button"
                id={id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => setIsOpen((previous) => !previous)}
            >
                <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <Link2 className="size-4 shrink-0" />
                    <span className={`truncate text-left ${value ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedLabel}
                    </span>
                </span>
                <span className="flex items-center gap-1">
                    {value ? (
                        <span
                            role="button"
                            tabIndex={0}
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(event) => {
                                event.stopPropagation()
                                clearSelection()
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    clearSelection()
                                }
                            }}
                            aria-label="Clear selection"
                        >
                            <X className="size-3.5" />
                        </span>
                    ) : null}
                    <ChevronRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </span>
            </Button>

            {isOpen ? (
                <div className="rounded-2xl border bg-popover p-3 shadow-xl">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(event) => {
                                setSearchQuery(event.target.value)
                                setCurrentPath([])
                            }}
                            placeholder="Search locations"
                            className="pl-9"
                        />
                    </div>

                    {!searchQuery.trim() ? (
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                                {currentPath.length === 0 ? "Choose a region" : `Viewing ${currentPath[currentPath.length - 1].label}`}
                            </span>
                            {currentPath.length > 0 ? (
                                <Button type="button" variant="ghost" size="sm" onClick={goBack} className="h-7 px-2">
                                    <ArrowLeft className="mr-1 size-3" />
                                    Back
                                </Button>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                        {searchQuery.trim() ? (
                            filteredOptions.length > 0 ? (
                                filteredOptions.map((node) => {
                                    const nodeValue = node.path.join(" / ")
                                    const isSelected = value === nodeValue

                                    return (
                                        <button
                                            key={node.id}
                                            type="button"
                                            onClick={() => handleSelect(node)}
                                            className="flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-muted"
                                        >
                                            <span>
                                                <span className="block font-medium">{node.label}</span>
                                                <span className="text-xs text-muted-foreground">{nodeValue}</span>
                                            </span>
                                            {isSelected ? <Check className="size-4 text-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                                        </button>
                                    )
                                })
                            ) : (
                                <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                    No locations match your search.
                                </div>
                            )
                        ) : currentOptions.length > 0 ? (
                            currentOptions.map((node) => {
                                const nodeValue = node.path.join(" / ")
                                const isSelected = value === nodeValue

                                return (
                                    <div key={node.id} className="flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted">
                                        <button
                                            type="button"
                                            onClick={() => openNode(node)}
                                            className="flex flex-1 items-center justify-between rounded-lg px-2 py-2 text-left"
                                        >
                                            <span className="text-sm font-medium">{node.label}</span>
                                            {node.children?.length ? (
                                                <ChevronRight className="size-4 text-muted-foreground" />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Select</span>
                                            )}
                                        </button>
                                        {!node.children?.length ? (
                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSelect(node)}>
                                                {isSelected ? "Selected" : "Choose"}
                                            </Button>
                                        ) : null}
                                    </div>
                                )
                            })
                        ) : (
                            <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                No sub-locations available for this selection.
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export { HierarchicalSelect }