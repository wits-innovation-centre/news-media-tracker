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
    const [searchQuery, setSearchQuery] = useState(value)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery(value)
        }
    }, [isOpen, value])

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
                setSearchQuery(value)
            }
        }

        document.addEventListener("mousedown", handlePointerDown)
        return () => document.removeEventListener("mousedown", handlePointerDown)
    }, [value])

    const normalizedQuery = searchQuery.trim().toLowerCase()

    const filteredOptions = useMemo(() => {
        if (!normalizedQuery) return options
        return options.filter((option) => option.toLowerCase().includes(normalizedQuery))
    }, [normalizedQuery, options])

    const exactMatch = normalizedQuery
        ? options.some((option) => option.toLowerCase() === normalizedQuery)
        : false

    const handleSelect = (nextValue: string) => {
        onChange(nextValue)
        setSearchQuery(nextValue)
        setIsOpen(false)
    }

    const handleCreate = async () => {
        const nextValue = searchQuery.trim()
        if (!nextValue) return

        await onCreateOption?.(nextValue)
        onChange(nextValue)
        setSearchQuery(nextValue)
        setIsOpen(false)
    }

    return (
        <div ref={containerRef} className="w-full space-y-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    type="text"
                    id={id}
                    value={searchQuery}
                    placeholder={placeholder}
                    className="pl-9 pr-9"
                    onFocus={() => setIsOpen(true)}
                    onChange={(event) => {
                        setSearchQuery(event.target.value)
                        setIsOpen(true)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault()
                            setIsOpen(false)
                            setSearchQuery(value)
                            inputRef.current?.blur()
                        }
                    }}
                />
                {searchQuery ? (
                    <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                            setSearchQuery("")
                            onChange("")
                            setIsOpen(true)
                            inputRef.current?.focus()
                        }}
                        aria-label="Clear selection"
                    >
                        <X className="size-3.5" />
                    </button>
                ) : null}
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