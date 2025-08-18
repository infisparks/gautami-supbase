// components/ui/input-service-name.tsx
import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils"; // Assuming you have a utility for class names

interface EditableServiceNameInputProps {
  value: string;
  onSave: (newValue: string) => void;
  index: number;
  isCurrentlyEditing: boolean;
  onEditStart: (index: number) => void;
  onEditEnd: () => void;
  error?: string;
  className?: string;
  placeholder?: string;
}

const EditableServiceNameInput: React.FC<EditableServiceNameInputProps> = ({
  value,
  onSave,
  index,
  isCurrentlyEditing,
  onEditStart,
  onEditEnd,
  error,
  className,
  placeholder = "Enter custom service name",
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep internalValue in sync with prop value when not editing
  useEffect(() => {
    if (!isCurrentlyEditing) {
      setInternalValue(value);
    }
  }, [value, isCurrentlyEditing]);

  const handleFocus = () => {
    onEditStart(index);
  };

  const handleBlur = () => {
    onSave(internalValue);
    onEditEnd();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form submission
      inputRef.current?.blur(); // Trigger blur to save
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "h-8 text-xs pr-2", // Added pr-2 to prevent text from going under the icon
          { "border-red-500": error },
          className
        )}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
};

export default EditableServiceNameInput;