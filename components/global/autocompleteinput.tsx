"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface AutoCompleteInputProps {
  id?: string // Added id prop
  value: string
  onChange: (value: string) => void
  onSelect: (item: { id: string; name: string; [key: string]: any }) => void
  fetchSuggestions: (query: string) => Promise<{ id: string; name: string; [key: string]: any }[]>
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
  debounceTime?: number
}

export function AutoCompleteInput({
  id, // Destructure id
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder,
  className,
  disabled,
  required,
  debounceTime = 300,
}: AutoCompleteInputProps) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; [key: string]: any }[]>([])
  const [query, setQuery] = useState(value)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value
      setQuery(inputValue)
      onChange(inputValue) // This updates the external form state as user types

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      if (inputValue.length > 0) {
        debounceRef.current = setTimeout(async () => {
          const fetched = await fetchSuggestions(inputValue)
          setSuggestions(fetched)
          setOpen(true)
        }, debounceTime)
      } else {
        setSuggestions([])
        setOpen(false)
      }
    },
    [onChange, fetchSuggestions, debounceTime],
  )

  const handleSelectItem = useCallback(
    (item: { id: string; name: string; [key: string]: any }) => {
      // Removed onChange(item.name) here.
      // The external onSelect callback is now solely responsible for updating the form state
      // with the selected item's details, including the name.
      onSelect(item)
      setOpen(false)
      setSuggestions([])
    },
    [onSelect], // Only onSelect is a dependency now
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          id={id} // Pass id to the internal Input
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
          required={required}
          autoComplete="off" // Prevent browser autocomplete
        />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandList>
            {suggestions.length === 0 && query.length > 0 && <CommandEmpty>No results found.</CommandEmpty>}
            <CommandGroup>
              {suggestions.map((item) => (
                <CommandItem key={item.id} value={item.name} onSelect={() => handleSelectItem(item)}>
                  {item.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
