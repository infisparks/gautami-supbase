// app/ipd/manage/[ipdId]/ProgressNotesTab.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase"; // Your Supabase client
import { toast } from "sonner"; // For toasts
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // For history table
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"; // For history dialog
import { format } from "date-fns";
import { RefreshCw, Trash2, History, Stethoscope, UserCheck, CalendarDays } from "lucide-react"; // Added icons

// --- Type Definitions ---
// Represents a single progress note entry within the 'progress_data' JSONB array
interface SingleProgressNoteEntry {
  tempId: string; // Client-side unique ID for managing this entry in the array
  noteText: string; // The actual progress note text
  enteredBy: string; // User who entered this specific note
  timestamp: string; // Timestamp for this specific note (of this individual entry)
  deletedBy?: string; // For soft-deleting individual entries
  deletedAt?: string; // Timestamp of deletion for this individual entry
}

// Represents the single row in the 'manage_progress_notes' table for a given IPD ID
interface ProgressNotesRecordSupabase {
  id: string; // UUID of the main row (the single row per ipd_id)
  ipd_id: number;
  uhid: string;
  progress_data: SingleProgressNoteEntry[]; // The array of individual notes
  entered_by: string[] | null; // Array of users who modified this main record
  created_at?: string; // Timestamp of main record creation
  updated_at?: string; // Timestamp of main record last update
  deleted_data?: { deletedBy: string; deletedAt: string } | null; // For soft-deleting the *entire row*
}

// Form inputs
interface ProgressNoteFormInputs {
  note: string; // This will map to noteText in SingleProgressNoteEntry
}
// --- End Type Definitions ---


export default function ProgressNotes() {
  const { ipdId } = useParams<{ ipdId: string }>();

  const { register, handleSubmit, reset } = useForm<ProgressNoteFormInputs>({
    defaultValues: { note: "" },
  });

  const [progressNotesDataRow, setProgressNotesDataRow] = useState<ProgressNotesRecordSupabase | null>(null); // Holds the single row
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeletedHistory, setShowDeletedHistory] = useState(false); // State for history dialog
  const channelRef = useRef<any>(null); // For Supabase real-time channel

  // --- Data Fetching Logic ---
  const fetchProgressNotesDataRow = useCallback(async () => {
    if (!ipdId) {
      setProgressNotesDataRow(null); // Ensure state is reset if no ipdId
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("manage_progress_notes")
        .select("*")
        .eq("ipd_id", Number(ipdId))
        .single(); // Expecting a single row for this ipd_id

      if (error && error.code !== "PGRST116") { // PGRST116 means "No rows found"
        console.error("Error fetching progress notes row:", error.message);
        toast.error("Failed to load progress notes data.");
        setProgressNotesDataRow(null);
      } else if (data) {
        setProgressNotesDataRow(data as ProgressNotesRecordSupabase);
      } else {
        setProgressNotesDataRow(null); // No data found
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during fetch:", error.message);
      toast.error("An unexpected error occurred while loading progress notes.");
      setProgressNotesDataRow(null);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]); // ipdId is a dependency


  // --- Real-time Subscription ---
  useEffect(() => {
    if (!ipdId) return;

    const ipdNum = Number(ipdId);
    let channel: any; // Declare channel here to be accessible in cleanup
    
    async function setupRealtimeChannel() {
      // Clean up any existing channel before setting up a new one
      if (channel) { 
        await supabase.removeChannel(channel);
      }

      // First, fetch initial data
      await fetchProgressNotesDataRow();

      // We need the PK 'id' of the row to subscribe specifically to it.
      // If the row doesn't exist yet, we can't subscribe immediately.
      const { data: currentRecord, error: currentRecordError } = await supabase
        .from("manage_progress_notes")
        .select("id")
        .eq("ipd_id", ipdNum)
        .single();

      if (currentRecordError && currentRecordError.code !== "PGRST116") {
          console.error("Error getting record ID for subscription:", currentRecordError.message);
          return;
      }
      
      const rowPkId = currentRecord?.id;

      if (rowPkId) {
          channel = supabase 
            .channel(`progress_notes_row_${rowPkId}`) // Unique channel name per row
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'manage_progress_notes',
                    filter: `id=eq.${rowPkId}` // Filter by the actual row ID (PK)
                },
                async (payload) => {
                    console.log("Realtime change detected for progress notes PK row:", payload);
                    toast.info(`Progress note data ${payload.eventType.toLowerCase()}d.`);
                    await fetchProgressNotesDataRow(); // Refetch the data to update the UI
                }
            )
            .subscribe();
      } else {
          // If no row exists yet, we rely on polling to eventually find it and then subscribe.
          // This path doesn't set up a channel initially.
      }
    }

    if (ipdId) {
      setupRealtimeChannel();
    }

    // Cleanup function for useEffect: unsubscribe from the channel
    return () => {
      if (channel) { 
        supabase.removeChannel(channel);
      }
    };
  }, [ipdId, fetchProgressNotesDataRow]); // Dependencies for useEffect


  // --- Polling for initial row existence ---
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined; 
    // If no row data is loaded yet and we have an ipdId, start polling
    if (!progressNotesDataRow && ipdId && !isLoading) {
      interval = setInterval(fetchProgressNotesDataRow, 2000); // Poll every 2 seconds
    }
    // If data is loaded or ipdId is null, clear any active interval
    if ((progressNotesDataRow || !ipdId) && interval) { 
      clearInterval(interval);
    }
    // Cleanup function: clear interval when component unmounts or dependencies change
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [progressNotesDataRow, ipdId, isLoading, fetchProgressNotesDataRow]);


  // --- Form Submission (Add New Progress Note) ---
  const onSubmit: SubmitHandler<ProgressNoteFormInputs> = async (formData) => {
    if (!formData.note.trim()) {
      toast.error("Note cannot be empty.");
      return;
    }
    setIsSubmitting(true);

    try {
      // 1. Get UHID from ipd_registration
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("uhid")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (ipdError || !ipdData) {
        toast.error("Could not find patient's UHID. Cannot save progress note.");
        console.error("UHID fetch error:", ipdError?.message);
        return;
      }
      const uhid = ipdData.uhid;

      // 2. Get current logged-in user email
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // 3. Prepare the new single progress note entry
      const newProgressNoteEntry: SingleProgressNoteEntry = {
        tempId: Date.now().toString(), // Client-side unique ID
        noteText: formData.note.trim(), // Actual text of the note
        enteredBy: currentUserEmail,
        timestamp: new Date().toISOString(),
      };

      let currentProgressData: SingleProgressNoteEntry[] = [];
      let mainRecordEnteredBy: string[] = [];
      let mainRecordIdToUpdate: string | null = null;

      // 4. Fetch the current state of the main progress note row (if it exists)
      const { data: currentMainRowData, error: fetchMainRowError } = await supabase
        .from("manage_progress_notes")
        .select("id, progress_data, entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (fetchMainRowError && fetchMainRowError.code !== "PGRST116") {
        console.error("Error fetching current main progress note row:", fetchMainRowError.message);
        toast.error("Failed to retrieve current note data. Please try again.");
        return;
      }

      // If a main row already exists for this ipd_id, use its data
      if (currentMainRowData) {
        mainRecordIdToUpdate = currentMainRowData.id;
        currentProgressData = currentMainRowData.progress_data || [];
        if (Array.isArray(currentMainRowData.entered_by)) {
          mainRecordEnteredBy = [...currentMainRowData.entered_by];
        } else if (typeof currentMainRowData.entered_by === "string" && currentMainRowData.entered_by) {
          mainRecordEnteredBy = [currentMainRowData.entered_by]; // Handle legacy
        }
      }

      // Add the new progress note entry to the array
      currentProgressData.push(newProgressNoteEntry);

      // Update the main record's 'entered_by' list
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      const updatePayload: Partial<ProgressNotesRecordSupabase> = {
        progress_data: currentProgressData,
        entered_by: mainRecordEnteredBy,
        updated_at: new Date().toISOString(), // Update main record's updated_at
      };

      // 5. Perform the database operation (UPDATE or INSERT)
      if (mainRecordIdToUpdate) {
        // Update existing main row
        const { error } = await supabase
          .from("manage_progress_notes")
          .update(updatePayload)
          .eq("id", mainRecordIdToUpdate);

        if (error) throw error;
      } else {
        // Insert new main row if no existing data for this ipd_id
        const newMainRowPayload: Omit<ProgressNotesRecordSupabase, "id" | "created_at" | "deleted_data"> = {
          ipd_id: Number(ipdId),
          uhid: uhid,
          progress_data: currentProgressData,
          entered_by: mainRecordEnteredBy,
          // created_at will be set by DB default, updated_at will be same as created_at initially
        };
        const { error } = await supabase
          .from("manage_progress_notes")
          .insert(newMainRowPayload);

        if (error) throw error;
      }
      toast.success("Progress note added successfully!");
      reset({ note: "" }); // Clear form
    } catch (error: any) {
      console.error("An unexpected error occurred:", error.message);
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
      await fetchProgressNotesDataRow(); // Manually refetch for immediate UI update
    }
  };


  // --- Delete Logic (Soft Delete an Individual Progress Note Entry) ---
  const handleDeleteNote = useCallback(async (tempIdToDelete: string) => {
    if (!window.confirm("Are you sure you want to delete this progress note?")) {
      return;
    }

    if (!progressNotesDataRow || !progressNotesDataRow.id) {
      toast.error("No progress note data found to delete from.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Create a deep copy of the progress_data array to modify
      const updatedProgressData = JSON.parse(JSON.stringify(progressNotesDataRow.progress_data || [])) as SingleProgressNoteEntry[];

      const noteToUpdate = updatedProgressData.find(note => note.tempId === tempIdToDelete);

      if (!noteToUpdate) {
        toast.error("Note entry not found for deletion.");
        return;
      }

      // Mark the specific note as deleted
      noteToUpdate.deletedBy = currentUserEmail;
      noteToUpdate.deletedAt = new Date().toISOString();

      let mainRecordEnteredBy: string[] = [];
      if (Array.isArray(progressNotesDataRow.entered_by)) {
        mainRecordEnteredBy = [...progressNotesDataRow.entered_by];
      } else if (typeof progressNotesDataRow.entered_by === "string" && progressNotesDataRow.entered_by) {
        mainRecordEnteredBy = [progressNotesDataRow.entered_by];
      }
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      // Update the main row in the database with the modified array
      const { error } = await supabase
        .from("manage_progress_notes")
        .update({
          progress_data: updatedProgressData,
          entered_by: mainRecordEnteredBy,
          updated_at: new Date().toISOString(), // Update main record's updated_at
        })
        .eq("id", progressNotesDataRow.id); 

      if (error) {
        console.error("Error soft-deleting progress note:", error.message);
        toast.error("Failed to delete progress note. Please try again.");
      } else {
        toast.success("Progress note marked as deleted!");
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during deletion:", error.message);
      toast.error("An unexpected error occurred during deletion.");
    } finally {
      await fetchProgressNotesDataRow(); // Manually refetch for immediate UI update
    }
  }, [progressNotesDataRow, fetchProgressNotesDataRow]);


  // --- Memoized Data for UI Rendering ---
  // Filters out deleted notes and sorts them for display
  const activeNotes = useMemo(() => {
    if (!progressNotesDataRow || !progressNotesDataRow.progress_data) return [];
    return progressNotesDataRow.progress_data
      .filter((note: SingleProgressNoteEntry) => !note.deletedBy)
      .sort((a: SingleProgressNoteEntry, b: SingleProgressNoteEntry) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort newest first
  }, [progressNotesDataRow]);

  // Filters for only deleted notes for the history popup
  const deletedNotes = useMemo(() => {
    if (!progressNotesDataRow || !progressNotesDataRow.progress_data) return [];
    return progressNotesDataRow.progress_data
      .filter((note: SingleProgressNoteEntry) => note.deletedBy)
      .sort((a: SingleProgressNoteEntry, b: SingleProgressNoteEntry) => new Date(b.deletedAt || '').getTime() - new Date(a.deletedAt || '').getTime()); // Sort by most recent deletion
  }, [progressNotesDataRow]);


  return (
    <div className="space-y-6">
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-blue-600" /> {/* Icon for Add Progress Note */}
              Add Progress Note
            </CardTitle>
            {deletedNotes.length > 0 && (
              <Dialog open={showDeletedHistory} onOpenChange={setShowDeletedHistory}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="View deleted history"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-gray-600" /> Deleted Progress Notes History
                    </DialogTitle>
                    <DialogDescription>
                      View progress notes that were previously deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {deletedNotes.length === 0 ? (
                      <p className="text-center text-gray-500">No deleted notes found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>Deleted By</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead>Original Entered By</TableHead>
                            <TableHead>Original Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedNotes.map((note, index) => (
                            <TableRow key={note.tempId}> 
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{note.noteText}</TableCell> 
                              <TableCell>{note.deletedBy || 'N/A'}</TableCell> 
                              <TableCell>
                                {note.deletedAt ? format(new Date(note.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
                              </TableCell>
                              <TableCell>{note.enteredBy}</TableCell>
                              <TableCell>
                                {format(new Date(note.timestamp), "MMM dd, yyyy hh:mm a")} 
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Textarea
              {...register("note", { required: true })}
              placeholder="Enter progress note..."
              className="w-full min-h-[120px]"
            />
            <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Adding...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" /> Add Note
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-green-600" /> {/* Icon for All Progress Notes */}
          All Progress Notes
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
            <p className="ml-4 text-lg text-gray-600">Loading progress notes...</p>
          </div>
        ) : activeNotes.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Stethoscope className="h-16 w-16 text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No progress notes available.</h3>
            <p className="text-slate-500">Add a new note using the form above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeNotes.map((note) => (
              <Card key={note.tempId} className="border border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-base text-slate-800 whitespace-pre-line mb-2">
                    {note.noteText}
                  </p>
                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>By: {note.enteredBy}</span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(note.timestamp), "MMM dd, yyyy, hh:mm a")}
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteNote(note.tempId)}
                      className="px-2 py-1 text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}