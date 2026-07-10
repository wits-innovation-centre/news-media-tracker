import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface SearchSelectInputProps {
    id: string
    value: string
    options: string[]
    placeholder?: string
    onChange: (value: string) => void
    onCreateOption?: (value: string) => Promise<void> | void
    allowCreate?: boolean
}

function SearchSelectInput({ id, value, options, placeholder = "Search and select...", onChange, onCreateOption, allowCreate = false }: SearchSelectInputProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
                setSearchQuery("")
            }
        }

        document.addEventListener("mousedown", handlePointerDown)
        return () => document.removeEventListener("mousedown", handlePointerDown)
    }, [])

    const normalizedQuery = searchQuery.trim().toLowerCase()

    const filteredOptions = useMemo(() => {
        if (!normalizedQuery) return options
        return options.filter((option) => option.toLowerCase().includes(normalizedQuery))
    }, [normalizedQuery, options])

    const exactMatch = normalizedQuery
        ? options.some((option) => option.toLowerCase() === normalizedQuery)
        : false

    const close = () => {
        setIsOpen(false)
        setSearchQuery("")
    }

    const handleSelect = (nextValue: string) => {
        onChange(nextValue)
        close()
    }

    const handleCreate = async () => {
        const nextValue = searchQuery.trim()
        if (!nextValue) return

        await onCreateOption?.(nextValue)
        onChange(nextValue)
        close()
    }

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
                    <Search className="size-4 shrink-0" />
                    <span className={`truncate text-left ${value ? "text-foreground" : "text-muted-foreground"}`}>
                        {value || placeholder}
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
                                onChange("")
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onChange("")
                                }
                            }}
                            aria-label="Clear selection"
                        >
                            <X className="size-3.5" />
                        </span>
                    ) : null}
                    <Plus className={`size-4 transition-transform ${isOpen ? "rotate-45" : ""}`} />
                </span>
            </Button>

            {isOpen ? (
                <div className="rounded-2xl border bg-popover p-3 shadow-xl">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search entries"
                            className="pl-9"
                        />
                    </div>

                    <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => {
                                const isSelected = value === option

                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => handleSelect(option)}
                                        className="flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-muted"
                                    >
                                        <span className="font-medium">{option}</span>
                                        {isSelected ? <Check className="size-4 text-primary" /> : null}
                                    </button>
                                )
                            })
                        ) : (
                            <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                No matches found.
                            </div>
                        )}
                    </div>

                    {allowCreate && searchQuery.trim() && !exactMatch ? (
                        <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => void handleCreate()}>
                            <Plus className="mr-1 size-4" />
                            Add "{searchQuery.trim()}" to specification
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

export { SearchSelectInput }