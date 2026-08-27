import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, ChevronRight, HelpCircle, Plus, Search, X } from "lucide-react"

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
    allowOther?: boolean
    allowUnknown?: boolean
    onChange: (value: string) => void
}

/**
 * Builds nodes while filtering out hardcoded legacy 'Other' and 'Unknown' strings.
 */
function buildNodes(options: TieredOptions, schema?: TieredOptionsSchema, parentPath: string[] = []): TierNode[] {
    return Object.entries(options).flatMap(([key, value]) => {
        if (key.startsWith("$")) return []
        if (key === "Other" || key === "Unknown") return []

        const nextPath = [...parentPath, key]
        const keyLabel = typeof schema?.$label === "object" && schema.$label?.[key] ? String(schema.$label[key]) : key

        if (Array.isArray(value)) {
            return [{
                id: nextPath.join("/"),
                label: keyLabel,
                path: nextPath,
                children: value
                    .filter((leaf) => leaf !== "Other" && leaf !== "Unknown")
                    .map((leaf) => ({
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

function HierarchicalSelect({
    id,
    value,
    options,
    placeholder = "Select option...",
    allowOther = false,
    allowUnknown = false,
    onChange,
}: HierarchicalSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState(value)
    const [currentPath, setCurrentPath] = useState<TierNode[]>([])
    const [isSpecifyingOther, setIsSpecifyingOther] = useState(false)
    const [customInputValue, setCustomInputValue] = useState("")

    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const treeSchema = options.$schema
    const rootNodes = useMemo(() => buildNodes(options, treeSchema), [options, treeSchema])
    const flatNodes = useMemo(() => flattenNodes(rootNodes).filter((node) => !node.children?.length), [rootNodes])

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
                setSearchQuery(value)
                setCurrentPath([])
                setIsSpecifyingOther(false)
            }
        }

        document.addEventListener("mousedown", handlePointerDown)
        return () => document.removeEventListener("mousedown", handlePointerDown)
    }, [value])

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery(value)
            setIsSpecifyingOther(false)
        }
    }, [isOpen, value])

    // Global search filter across flat leaf nodes
    const filteredGlobalOptions = useMemo(() => {
        if (!searchQuery.trim()) return []
        const normalized = searchQuery.trim().toLowerCase()
        return flatNodes.filter((node) => node.path.join(" / ").toLowerCase().includes(normalized))
    }, [flatNodes, searchQuery])

    // Level-by-level options based on currentPath depth
    const currentLevelNodes = useMemo(() => {
        if (searchQuery.trim()) return []
        if (currentPath.length === 0) return rootNodes
        return currentPath[currentPath.length - 1].children ?? []
    }, [currentPath, rootNodes, searchQuery])

    const finalizeSelection = (pathStrings: string[]) => {
        const nextValue = pathStrings.join(" / ")
        onChange(nextValue)
        setSearchQuery(nextValue)
        setIsOpen(false)
        setCurrentPath([])
        setIsSpecifyingOther(false)
    }

    // Handles selecting "Unknown" at level n -> sets path to levels 1 to n-1
    const handleSelectUnknown = () => {
        const previousLevelStrings = currentPath.map((node) => node.label)
        finalizeSelection(previousLevelStrings)
    }

    // Handles adding a custom "Other" entry at the current level n
    const handleAddCustom = (customLabel: string) => {
        const trimmed = customLabel.trim()
        if (!trimmed) return

        const newPathStrings = [...currentPath.map((n) => n.label), trimmed]
        const customNode: TierNode = {
            id: newPathStrings.join("/"),
            label: trimmed,
            path: newPathStrings,
        }

        // Advance path to level n so proceeding levels can be specified
        setCurrentPath((previous) => [...previous, customNode])
        setSearchQuery("")
        setCustomInputValue("")
        setIsSpecifyingOther(false)
    }

    const openNode = (node: TierNode) => {
        if (node.children?.length) {
            setCurrentPath((previous) => [...previous, node])
            return
        }
        finalizeSelection(node.path)
    }

    const goBack = () => {
        setCurrentPath((previous) => previous.slice(0, -1))
        setIsSpecifyingOther(false)
    }

    const clearSelection = () => {
        onChange("")
        setSearchQuery("")
        setCurrentPath([])
        setIsSpecifyingOther(false)
        setIsOpen(true)
        inputRef.current?.focus()
    }

    const currentPathString = currentPath.map((n) => n.label).join(" / ")
    const hasExactSearchMatch = searchQuery.trim()
        ? currentLevelNodes.some((n) => n.label.toLowerCase() === searchQuery.trim().toLowerCase())
        : false

    return (
        <div ref={containerRef} className="w-full space-y-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    id={id}
                    type="text"
                    value={searchQuery}
                    placeholder={placeholder}
                    className="pl-9 pr-16"
                    onFocus={() => setIsOpen(true)}
                    onChange={(event) => {
                        setSearchQuery(event.target.value)
                        setCurrentPath([])
                        setIsOpen(true)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault()
                            setIsOpen(false)
                            setSearchQuery(value)
                            setCurrentPath([])
                            setIsSpecifyingOther(false)
                            inputRef.current?.blur()
                        }
                    }}
                />

                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-muted-foreground">
                    {searchQuery ? (
                        <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-muted hover:text-foreground"
                            onClick={clearSelection}
                            aria-label="Clear selection"
                        >
                            <X className="size-3.5" />
                        </button>
                    ) : null}
                    <ChevronRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </div>
            </div>

            {isOpen ? (
                <div className="rounded-2xl border bg-popover p-3 shadow-xl">
                    {!searchQuery.trim() ? (
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                                {currentPath.length === 0
                                    ? "Select location"
                                    : `Viewing: ${currentPathString}`}
                            </span>
                            {currentPath.length > 0 ? (
                                <Button type="button" variant="ghost" size="sm" onClick={goBack} className="h-7 px-2">
                                    <ArrowLeft className="mr-1 size-3" />
                                    Back
                                </Button>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                        {/* Option to complete selection at current path */}
                        {currentPath.length > 0 && !searchQuery.trim() ? (
                            <button
                                type="button"
                                onClick={() => finalizeSelection(currentPath.map((n) => n.label))}
                                className="flex w-full items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                            >
                                <span>Select "{currentPathString}"</span>
                                <Check className="size-4" />
                            </button>
                        ) : null}

                        {/* Search results mode */}
                        {searchQuery.trim() ? (
                            filteredGlobalOptions.length > 0 ? (
                                filteredGlobalOptions.map((node) => {
                                    const nodeValue = node.path.join(" / ")
                                    const isSelected = value === nodeValue

                                    return (
                                        <button
                                            key={node.id}
                                            type="button"
                                            onClick={() => finalizeSelection(node.path)}
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
                                    No predefined locations match search.
                                </div>
                            )
                        ) : currentLevelNodes.length > 0 ? (
                            /* Level-by-level navigation mode */
                            currentLevelNodes.map((node) => {
                                const nodeValue = node.path.join(" / ")
                                const isSelected = value === nodeValue

                                return (
                                    <div key={node.id} className="flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted">
                                        <button
                                            type="button"
                                            onClick={() => openNode(node)}
                                            className="flex flex-1 items-center justify-between rounded-lg px-2 py-1 text-left"
                                        >
                                            <span className="text-sm font-medium">{node.label}</span>
                                            {node.children?.length ? (
                                                <ChevronRight className="size-4 text-muted-foreground" />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Select</span>
                                            )}
                                        </button>
                                        {!node.children?.length ? (
                                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => finalizeSelection(node.path)}>
                                                {isSelected ? "Selected" : "Choose"}
                                            </Button>
                                        ) : null}
                                    </div>
                                )
                            })
                        ) : (
                            <div className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                                No sub-locations listed for this level.
                            </div>
                        )}

                        {/* Dynamic "Unknown" Option */}
                        {allowUnknown && !searchQuery.trim() ? (
                            <button
                                type="button"
                                onClick={handleSelectUnknown}
                                className="flex w-full items-center justify-between rounded-xl border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                            >
                                <span className="flex items-center gap-2 italic">
                                    <HelpCircle className="size-3.5" />
                                    Unknown {currentPath.length > 0 ? `(ends at ${currentPath[currentPath.length - 1].label})` : ""}
                                </span>
                                <span className="text-xs font-medium">Select</span>
                            </button>
                        ) : null}

                        {/* Dynamic "Other" Option */}
                        {allowOther ? (
                            searchQuery.trim() && !hasExactSearchMatch ? (
                                <button
                                    type="button"
                                    onClick={() => handleAddCustom(searchQuery.trim())}
                                    className="flex w-full items-center justify-between rounded-xl border border-dashed border-primary/40 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/5"
                                >
                                    <span className="flex items-center gap-2">
                                        <Plus className="size-4" />
                                        Add "{searchQuery.trim()}" at current level
                                    </span>
                                </button>
                            ) : !searchQuery.trim() && !isSpecifyingOther ? (
                                <button
                                    type="button"
                                    onClick={() => setIsSpecifyingOther(true)}
                                    className="flex w-full items-center justify-between rounded-xl border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                                >
                                    <span className="flex items-center gap-2">
                                        <Plus className="size-3.5" />
                                        Other (Specify custom...)
                                    </span>
                                </button>
                            ) : !searchQuery.trim() && isSpecifyingOther ? (
                                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2">
                                    <Input
                                        autoFocus
                                        type="text"
                                        placeholder="Enter custom location..."
                                        value={customInputValue}
                                        onChange={(e) => setCustomInputValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                handleAddCustom(customInputValue)
                                            } else if (e.key === "Escape") {
                                                setIsSpecifyingOther(false)
                                            }
                                        }}
                                        className="h-8 text-sm"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 px-3"
                                        onClick={() => handleAddCustom(customInputValue)}
                                    >
                                        Add
                                    </Button>
                                </div>
                            ) : null
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export { HierarchicalSelect }