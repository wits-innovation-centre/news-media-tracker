"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface MultiSelectOption {
  label: string
  value: string
}

export interface MultiSelectProps {
  options: string[] | MultiSelectOption[]
  value?: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function MultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "Select options...",
  className,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  // Normalize string[] or { label, value }[] into standardized objects
  const formattedOptions: MultiSelectOption[] = React.useMemo(() => {
    return options.map((opt) =>
      typeof opt === "string" ? { label: opt, value: opt } : opt
    )
  }, [options])

  const isAllSelected =
    formattedOptions.length > 0 && value.length === formattedOptions.length

  const handleSelect = (optionValue: string) => {
    const nextValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue]
    onChange(nextValue)
  }

  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter((v) => v !== optionValue))
  }

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      onChange([])
    } else {
      onChange(formattedOptions.map((opt) => opt.value))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between h-auto min-h-10 px-3 py-2 hover:bg-background focus:ring-2 focus:ring-ring",
              className
            )}
          />
        }
      >
        <div className="flex flex-wrap gap-1.5 items-center max-w-[calc(100%-20px)]">
          {value.length === 0 ? (
            <span className="text-muted-foreground text-sm font-normal">
              {placeholder}
            </span>
          ) : (
            value.map((val) => {
              const option = formattedOptions.find((o) => o.value === val)
              return (
                <Badge
                  key={val}
                  variant="secondary"
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-normal bg-secondary text-secondary-foreground"
                >
                  <span>{option ? option.label : val}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${option ? option.label : val}`}
                    className="rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onClick={(e) => handleRemove(val, e)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                  </button>
                </Badge>
              )
            })
          )}
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </PopoverTrigger>

      <PopoverContent className="w-full p-0 min-w-[300px]" align="start">
        <Command>
          <CommandInput placeholder="Search options..." />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>No options found.</CommandEmpty>

            <CommandGroup>
              {/* Select All / Deselect All Toggle */}
              <CommandItem
                onSelect={handleToggleSelectAll}
                className="cursor-pointer font-medium text-xs text-muted-foreground"
              >
                <div
                  className={cn(
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                    isAllSelected
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50 [&_svg]:invisible"
                  )}
                >
                  <Check className="h-3 w-3" />
                </div>
                <span>{isAllSelected ? "Deselect All" : "Select All"}</span>
              </CommandItem>

              <CommandSeparator className="my-1" />

              {/* Individual Options */}
              {formattedOptions.map((option) => {
                const isSelected = value.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}