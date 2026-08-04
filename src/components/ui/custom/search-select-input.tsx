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
    const searchInputRef = useRef<HTMLInputElement>(null)

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

    useEffect(() => {
        if (!isOpen) return

        const frame = window.requestAnimationFrame(() => {
            searchInputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

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

    const openForTyping = () => {
        setIsOpen(true)
        setSearchQuery(value)
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
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    id={id}
                    ref={searchInputRef}
                    value={isOpen ? searchQuery : value}
                    onFocus={openForTyping}
                    onClick={openForTyping}
                    onChange={(event) => {
                        setIsOpen(true)
                        setSearchQuery(event.target.value)
                    }}
                    placeholder={placeholder}
                    className="pl-9 pr-18"
                />
                <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {value ? (
                        <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                onChange("")
                            }}
                            aria-label="Clear selection"
                        >
                            <X className="size-3.5" />
                        </button>
                    ) : null}
                    <Plus className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-45" : ""}`} />
                </span>
            </div>

            {isOpen ? (
                <div className="rounded-2xl border bg-popover p-3 shadow-xl">
                    <div className="max-h-72 space-y-1 overflow-y-auto">
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
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="mt-3"
                            onClick={() => void handleCreate()}
                            aria-label={`Add ${searchQuery.trim()} as a new option`}
                        >
                            <Plus className="size-4" />
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

export { SearchSelectInput }