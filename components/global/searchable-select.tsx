"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
  disabled,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  // Update internal search value when external value changes
  React.useEffect(() => {
    const selectedOption = options.find((option) => option.value === value)
    setSearchValue(selectedOption ? selectedOption.label : "")
  }, [value, options])

  const handleSelect = (currentValue: string) => {
    const selectedOption = options.find((option) => option.label.toLowerCase() === currentValue.toLowerCase())
    if (selectedOption) {
      onValueChange(selectedOption.value)
      setSearchValue(selectedOption.label)
    } else {
      // If no match, clear the value or handle as needed
      onValueChange("")
      setSearchValue(currentValue) // Keep what user typed if no match
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-normal shadow-sm hover:bg-gray-50",
            "placeholder-gray-400", // Light placeholder
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
          disabled={disabled}
        >
          <span
            className={cn(
              "block truncate",
              !value && "text-gray-400", // Apply placeholder color when no value
            )}
          >
            {value ? options.find((option) => option.value === value)?.label : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={placeholder} value={searchValue} onValueChange={setSearchValue} className="h-9" />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label} // Use label for search matching
                  onSelect={handleSelect}
                >
                  {option.label}
                  <Check className={cn("ml-auto h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
