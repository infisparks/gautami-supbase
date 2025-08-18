// components/ui/editable-charges-input.tsx
import React, { useState, useEffect } from 'react';
import { Input } from './input'; // Assuming this path
import { Button } from './button'; // Assuming this path
import { CheckCircle, Edit, IndianRupeeIcon } from 'lucide-react';

interface EditableChargesInputProps {
  value: number | undefined;
  onSave: (newValue: number) => void;
  index: number; // To uniquely identify which input is being edited
  isCurrentlyEditing: boolean;
  onEditStart: (index: number) => void;
  onEditEnd: () => void;
  error?: string;
}

const EditableChargesInput: React.FC<EditableChargesInputProps> = ({
  value,
  onSave,
  index,
  isCurrentlyEditing,
  onEditStart,
  onEditEnd,
  error,
}) => {
  // Local state to manage the input value while editing
  const [localValue, setLocalValue] = useState<string>(String(value || ''));

  // Update local value when the prop 'value' changes from outside (e.g., form reset, service change)
  // but only if the input is NOT currently being edited by the user.
  useEffect(() => {
    if (!isCurrentlyEditing) {
      setLocalValue(String(value === 0 ? '' : value || '')); // Show empty for 0 or undefined
    }
  }, [value, isCurrentlyEditing]);

  // Handler for when the "Edit" button is clicked
  const handleEditClick = () => {
    onEditStart(index); // Notify parent component that this input is now being edited
  };

  // Handler for when the "Save" (tick) button is clicked
  const handleSaveClick = () => {
    const numValue = parseFloat(localValue);
    // If the parsed value is a valid number, save it; otherwise, save 0.
    onSave(isNaN(numValue) ? 0 : numValue);
    onEditEnd(); // Notify parent component that editing has ended
  };

  // Determine the value to display in the read-only state
  const displayValue = value === 0 || value === undefined ? '' : String(value);

  return (
    <div className="relative flex items-center">
      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      {isCurrentlyEditing ? (
        // Render editable input with a save button
        <>
          <Input
            type="number"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            className={`h-8 text-xs pl-10 pr-10 ${error ? 'border-red-500' : ''}`}
            onWheel={(e) => e.currentTarget.blur()} // Prevent accidental scrolling changes
            autoFocus // Automatically focus when entering edit mode
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission on Enter
                handleSaveClick(); // Save changes on Enter key press
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleSaveClick}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-green-600 hover:text-green-700"
            title="Save Changes"
          >
            <CheckCircle className="h-4 w-4" />
          </Button>
        </>
      ) : (
        // Render read-only input with an edit button
        <>
          <Input
            type="text" // Use text type when read-only to avoid number input spinners
            value={displayValue}
            readOnly
            className={`h-8 text-xs pl-10 pr-10 bg-gray-50 cursor-pointer ${error ? 'border-red-500' : ''}`}
            onClick={handleEditClick} // Allow clicking the input itself to edit
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleEditClick}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-blue-600 hover:text-blue-700"
            title="Edit Charges"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

export default EditableChargesInput;
