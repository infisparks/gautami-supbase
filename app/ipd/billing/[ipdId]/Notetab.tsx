import React, { useState } from "react";

interface NotetabProps {
  ipdNote: string;
  setIpdNote: (note: string) => void;
  ipdNoteLoading: boolean;
  onSaveNote: (note: string) => Promise<void>;
}

const Notetab: React.FC<NotetabProps> = ({ ipdNote, setIpdNote, ipdNoteLoading, onSaveNote }) => {
  const [localNote, setLocalNote] = useState(ipdNote || "");

  // Sync local state with prop
  React.useEffect(() => {
    setLocalNote(ipdNote || "");
  }, [ipdNote]);

  const handleSave = async () => {
    await onSaveNote(localNote);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">IPD Note</h3>
      <textarea
        className="w-full min-h-[120px] p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        value={localNote}
        onChange={e => setLocalNote(e.target.value)}
        placeholder="Enter any notes related to this IPD admission (optional)"
        disabled={ipdNoteLoading}
      />
      <div className="flex justify-end mt-4">
        <button
          onClick={handleSave}
          disabled={ipdNoteLoading}
          className={`px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors ${ipdNoteLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {ipdNoteLoading ? "Saving..." : "Save Note"}
        </button>
      </div>
    </div>
  );
};

export default Notetab;
