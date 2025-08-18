// app/ipd/manage/[ipdId]/DrugChartTab.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, Fragment, useRef } from "react";
import { useParams } from "next/navigation";
import { useForm, type SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pencil, RefreshCw, Trash2, History, Stethoscope, UserCheck,
  Calendar, Pill, Plus, CheckCircle, XCircle, ChevronDown, ChevronRight // Added ChevronDown, ChevronRight for toggle
} from "lucide-react";
import { format } from "date-fns";

// --- Type Definitions ---
interface Signature {
  dateTime: string;
  by: string;
  timestamp: string;
}

interface EditRecord {
  editedBy: string;
  timestamp: string;
  previousValues: Partial<SingleDrugChartEntry>; // Partial of the individual entry
}

// Represents a single drug chart entry *within* the `drug_chart_data` JSONB array
interface SingleDrugChartEntry {
  tempId: string; // Client-side unique ID for managing this entry in the array
  dateTime: string;
  duration: string;
  dosage: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  specialInstruction: string;
  stat: string;
  enteredBy: string; // User who entered this specific entry
  timestamp: string; // Timestamp of this specific entry
  signatures?: Signature[];
  status: "active" | "hold" | "omit";
  editHistory?: EditRecord[];
  deletedBy?: string; // For soft-deleting individual entries
  deletedAt?: string; // Timestamp of deletion for this individual entry
}

// Represents the single row in the 'manage_drug_charts' table for a given IPD ID
interface DrugChartRecordSupabase {
  id: string; // UUID of the main row
  ipd_id: number;
  uhid: string;
  drug_chart_data: SingleDrugChartEntry[]; // The array of individual drug chart entries
  entered_by: string[] | null; // Array of users who modified this main record
  created_at?: string;
  updated_at?: string; // Supabase can automatically update this
  deleted_data?: { deletedBy: string; deletedAt: string } | null; // For soft-deleting the *entire row*
}

// Form inputs for new entry and edit forms
interface DrugChartFormInputs {
  dateTime: string;
  duration: string;
  dosage: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  specialInstruction: string;
  stat: string;
  status: "active" | "hold" | "omit";
}

interface SignatureFormInputs {
  dateTime: string;
}
// --- End Type Definitions ---


export default function DrugChartPage() {
  const { ipdId } = useParams<{ ipdId: string }>();

  // --- New-Entry form state
  const { register, handleSubmit, reset, watch: watchNewEntryForm, setValue: setNewEntryValue } = useForm<DrugChartFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      duration: "",
      dosage: "",
      drugName: "",
      dose: "",
      route: "",
      frequency: "",
      specialInstruction: "",
      stat: "",
      status: "active",
    },
  });

  const [drugChartDataRow, setDrugChartDataRow] = useState<DrugChartRecordSupabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // For new entry form submission
  const [showDeletedHistory, setShowDeletedHistory] = useState(false); // State for history dialog
  const channelRef = useRef<any>(null); // For Supabase real-time channel


  // --- Signature modal state
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [entryForSignature, setEntryForSignature] = useState<SingleDrugChartEntry | null>(null);
  const {
    register: registerSign,
    handleSubmit: handleSubmitSign,
    reset: resetSign,
    setValue: setSignatureValue
  } = useForm<SignatureFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
    },
  });

  // --- Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [entryForEdit, setEntryForEdit] = useState<SingleDrugChartEntry | null>(null);
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setEditValue } =
    useForm<DrugChartFormInputs>();


  // --- Supabase Table Name ---
  const drugChartTable = 'manage_drug_charts';


  // --- Data Fetching Logic ---
  const fetchDrugChartDataRow = useCallback(async () => {
    if (!ipdId) {
      setDrugChartDataRow(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from(drugChartTable)
        .select("*")
        .eq("ipd_id", Number(ipdId))
        .single(); // Expecting a single row for this ipd_id

      if (error && error.code !== "PGRST116") { // PGRST116 means "No rows found"
        console.error("Error fetching drug chart row:", error.message);
        toast.error("Failed to load drug chart data.");
        setDrugChartDataRow(null);
      } else if (data) {
        setDrugChartDataRow(data as DrugChartRecordSupabase);
      } else {
        setDrugChartDataRow(null); // No data found
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during fetch:", error.message);
      toast.error("An unexpected error occurred while loading drug chart.");
      setDrugChartDataRow(null);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!ipdId) return;

    const ipdNum = Number(ipdId);
    let channel: any;

    async function setupRealtimeChannel() {
      if (channel) {
        await supabase.removeChannel(channel);
      }

      // First, fetch initial data
      await fetchDrugChartDataRow();

      // We need the PK 'id' of the row to subscribe specifically to it.
      const { data: currentRecord, error: currentRecordError } = await supabase
        .from(drugChartTable)
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
          .channel(`drug_chart_row_${rowPkId}`) // Unique channel name per row
          .on(
            'postgres_changes',
            {
              event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
              schema: 'public',
              table: drugChartTable,
              filter: `id=eq.${rowPkId}` // Filter by the actual row ID (PK)
            },
            async (payload) => {
              console.log("Realtime change detected for drug chart PK row:", payload);
              toast.info(`Drug chart data ${payload.eventType.toLowerCase()}d.`);
              await fetchDrugChartDataRow(); // Refetch the data to update the UI
            }
          )
          .subscribe();
      } else {
        // If no row exists yet, rely on polling to find it and then subscribe.
      }
    }

    if (ipdId) {
      setupRealtimeChannel();
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [ipdId, fetchDrugChartDataRow]);

  // --- Polling for initial row existence ---
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (!drugChartDataRow && ipdId && !isLoading) {
      interval = setInterval(fetchDrugChartDataRow, 2000); // Poll every 2 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [drugChartDataRow, ipdId, isLoading, fetchDrugChartDataRow]);


  // --- Create a new drug-chart entry
  const onSubmit: SubmitHandler<DrugChartFormInputs> = async (data) => {
    setIsSubmitting(true);
    try {
      // 1. Get UHID from ipd_registration
      const { data: ipdRecord, error: ipdError } = await supabase
        .from('ipd_registration')
        .select('uhid')
        .eq('ipd_id', Number(ipdId))
        .single();

      if (ipdError || !ipdRecord) {
        toast.error("Failed to get patient UHID. Cannot save drug chart entry.");
        console.error("UHID fetch error:", ipdError?.message);
        return;
      }
      const uhid = ipdRecord.uhid;

      // 2. Get current logged-in user email
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // 3. Prepare the new single drug chart entry
      const newEntry: SingleDrugChartEntry = {
        tempId: Date.now().toString(), // Client-side unique ID
        ...data, // Form data
        enteredBy: currentUserEmail,
        timestamp: new Date().toISOString(), // Timestamp of this specific entry
        signatures: [],
        editHistory: [],
        status: data.status || "active",
      };

      let currentDrugChartData: SingleDrugChartEntry[] = [];
      let mainRecordEnteredBy: string[] = [];
      let mainRecordIdToUpdate: string | null = null;

      // 4. Fetch the current state of the main drug chart row (if it exists)
      const { data: currentMainRowData, error: fetchMainRowError } = await supabase
        .from(drugChartTable)
        .select("id, drug_chart_data, entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (fetchMainRowError && fetchMainRowError.code !== "PGRST116") {
        console.error("Error fetching current main drug chart row:", fetchMainRowError.message);
        toast.error("Failed to retrieve current drug chart data. Please try again.");
        return;
      }

      // If a main row already exists for this ipd_id, use its data
      if (currentMainRowData) {
        mainRecordIdToUpdate = currentMainRowData.id;
        currentDrugChartData = currentMainRowData.drug_chart_data || [];
        if (Array.isArray(currentMainRowData.entered_by)) {
          mainRecordEnteredBy = [...currentMainRowData.entered_by];
        } else if (typeof currentMainRowData.entered_by === "string" && currentMainRowData.entered_by) {
          mainRecordEnteredBy = [currentMainRowData.entered_by]; // Handle legacy
        }
      }

      // Add the new entry to the array
      currentDrugChartData.push(newEntry);

      // Update the main record's 'entered_by' list
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      const updatePayload: Partial<DrugChartRecordSupabase> = {
        drug_chart_data: currentDrugChartData,
        entered_by: mainRecordEnteredBy,
        updated_at: new Date().toISOString(), // Update main record's updated_at
      };

      // 5. Perform the database operation (UPDATE or INSERT)
      if (mainRecordIdToUpdate) {
        // Update existing main row
        const { error } = await supabase
          .from(drugChartTable)
          .update(updatePayload)
          .eq("id", mainRecordIdToUpdate);

        if (error) throw error;
      } else {
        // Insert new main row if no existing data for this ipd_id
        const newMainRowPayload: Omit<DrugChartRecordSupabase, "id" | "created_at" | "deleted_data"> = {
          ipd_id: Number(ipdId),
          uhid: uhid,
          drug_chart_data: currentDrugChartData,
          entered_by: mainRecordEnteredBy,
        };
        const { error } = await supabase
          .from(drugChartTable)
          .insert(newMainRowPayload);

        if (error) throw error;
      }
      toast.success("Drug chart entry added successfully!");
      // Reset form
      reset({
        dateTime: new Date().toISOString().slice(0, 16),
        duration: "", dosage: "", drugName: "", dose: "", route: "",
        frequency: "", specialInstruction: "", stat: "", status: "active",
      });
    } catch (err: any) {
      console.error("Error saving drug chart entry:", err.message);
      toast.error(`Error saving entry: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
      await fetchDrugChartDataRow(); // Manually refetch for immediate UI update
    }
  };

  // --- Open signature modal
  const handleSignatureClick = (entry: SingleDrugChartEntry) => {
    setEntryForSignature(entry);
    resetSign({ dateTime: new Date().toISOString().slice(0, 16) });
    setSignatureModalOpen(true);
  };

  // --- Open edit modal
  const handleEditClick = (entry: SingleDrugChartEntry) => {
    setEntryForEdit(entry);
    resetEdit({
      dateTime: entry.dateTime, duration: entry.duration, dosage: entry.dosage,
      drugName: entry.drugName, dose: entry.dose, route: entry.route,
      frequency: entry.frequency, specialInstruction: entry.specialInstruction,
      stat: entry.stat, status: entry.status || "active",
    });
    setEditModalOpen(true);
  };

  // --- Submit signature
  const onSubmitSignature: SubmitHandler<SignatureFormInputs> = async (data) => {
    if (!entryForSignature || !drugChartDataRow || !drugChartDataRow.id) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Deep copy the main data array
      const updatedDrugChartData = JSON.parse(JSON.stringify(drugChartDataRow.drug_chart_data || [])) as SingleDrugChartEntry[];
      const entryToUpdate = updatedDrugChartData.find(ent => ent.tempId === entryForSignature.tempId);

      if (!entryToUpdate) {
        toast.error("Entry not found for signature.");
        return;
      }

      const signature: Signature = {
        dateTime: data.dateTime,
        by: currentUserEmail,
        timestamp: new Date().toISOString(),
      };

      entryToUpdate.signatures = [...(entryToUpdate.signatures || []), signature];

      const updatedMainRecordEnteredBy = Array.from(new Set([...(drugChartDataRow.entered_by || []), currentUserEmail]));

      const { error } = await supabase
        .from(drugChartTable)
        .update({
          drug_chart_data: updatedDrugChartData,
          entered_by: updatedMainRecordEnteredBy,
          updated_at: new Date().toISOString()
        })
        .eq('id', drugChartDataRow.id);

      if (error) throw error;

      toast.success("Signature added successfully!");
      setSignatureModalOpen(false);
      setEntryForSignature(null);
    } catch (err: any) {
      console.error("Error saving signature:", err.message);
      toast.error(`Error saving signature: ${err.message || 'Unknown error'}`);
    } finally {
      await fetchDrugChartDataRow(); // Manually refetch for immediate UI update
    }
  };

  // --- Submit edit
  const onSubmitEdit: SubmitHandler<DrugChartFormInputs> = async (data) => {
    if (!entryForEdit || !drugChartDataRow || !drugChartDataRow.id) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Deep copy the main data array
      const updatedDrugChartData = JSON.parse(JSON.stringify(drugChartDataRow.drug_chart_data || [])) as SingleDrugChartEntry[];
      const entryToUpdate = updatedDrugChartData.find(ent => ent.tempId === entryForEdit.tempId);

      if (!entryToUpdate) {
        toast.error("Entry not found for edit.");
        return;
      }

      const editRecord: EditRecord = {
        editedBy: currentUserEmail,
        timestamp: new Date().toISOString(),
        previousValues: {
          dateTime: entryToUpdate.dateTime, duration: entryToUpdate.duration,
          dosage: entryToUpdate.dosage, drugName: entryToUpdate.drugName,
          dose: entryToUpdate.dose, route: entryToUpdate.route,
          frequency: entryToUpdate.frequency, specialInstruction: entryToUpdate.specialInstruction,
          stat: entryToUpdate.stat, status: entryToUpdate.status,
        },
      };

      // Update fields of the entry
      Object.assign(entryToUpdate, data); // Apply new data
      entryToUpdate.editHistory = [...(entryToUpdate.editHistory || []), editRecord];

      const updatedMainRecordEnteredBy = Array.from(new Set([...(drugChartDataRow.entered_by || []), currentUserEmail]));

      const { error } = await supabase
        .from(drugChartTable)
        .update({
          drug_chart_data: updatedDrugChartData,
          entered_by: updatedMainRecordEnteredBy,
          updated_at: new Date().toISOString()
        })
        .eq('id', drugChartDataRow.id);

      if (error) throw error;

      toast.success("Drug chart entry updated successfully!");
      setEditModalOpen(false);
      setEntryForEdit(null);
    } catch (err: any) {
      console.error("Error updating drug chart entry:", err.message);
      toast.error(`Error updating entry: ${err.message || 'Unknown error'}`);
    } finally {
      await fetchDrugChartDataRow(); // Manually refetch for immediate UI update
    }
  };

  // --- Change status only
  const handleStatusChange = useCallback(async (tempId: string, newStatus: "active" | "hold" | "omit") => {
    if (!drugChartDataRow || !drugChartDataRow.id) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Deep copy the main data array
      const updatedDrugChartData = JSON.parse(JSON.stringify(drugChartDataRow.drug_chart_data || [])) as SingleDrugChartEntry[];
      const entryToUpdate = updatedDrugChartData.find(ent => ent.tempId === tempId);

      if (!entryToUpdate) {
        toast.error("Entry not found for status change.");
        return;
      }

      const editRecord: EditRecord = {
        editedBy: currentUserEmail,
        timestamp: new Date().toISOString(),
        previousValues: { status: entryToUpdate.status }, // Only track status change
      };

      entryToUpdate.status = newStatus;
      entryToUpdate.editHistory = [...(entryToUpdate.editHistory || []), editRecord];

      const updatedMainRecordEnteredBy = Array.from(new Set([...(drugChartDataRow.entered_by || []), currentUserEmail]));

      const { error } = await supabase
        .from(drugChartTable)
        .update({
          drug_chart_data: updatedDrugChartData,
          entered_by: updatedMainRecordEnteredBy,
          updated_at: new Date().toISOString()
        })
        .eq('id', drugChartDataRow.id);

      if (error) throw error;

      toast.success("Drug status updated!");
    } catch (err: any) {
      console.error("Error updating entry status:", err.message);
      toast.error(`Error updating status: ${err.message || 'Unknown error'}`);
    } finally {
      await fetchDrugChartDataRow(); // Manually refetch for immediate UI update
    }
  }, [drugChartDataRow, fetchDrugChartDataRow]);


  // --- Delete Entry (Soft Delete an Individual Drug Chart Entry) ---
  const handleDeleteEntry = useCallback(async (tempIdToDelete: string) => {
    if (!window.confirm("Are you sure you want to delete this drug chart entry?")) {
      return;
    }

    if (!drugChartDataRow || !drugChartDataRow.id) {
      toast.error("No drug chart data found to delete from.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Create a deep copy of the drug_chart_data array to modify
      const updatedDrugChartData = JSON.parse(JSON.stringify(drugChartDataRow.drug_chart_data || [])) as SingleDrugChartEntry[];

      const entryToUpdate = updatedDrugChartData.find(entry => entry.tempId === tempIdToDelete);

      if (!entryToUpdate) {
        toast.error("Drug chart entry not found for deletion.");
        return;
      }

      // Mark the specific entry as deleted
      entryToUpdate.deletedBy = currentUserEmail;
      entryToUpdate.deletedAt = new Date().toISOString();

      let mainRecordEnteredBy: string[] = [];
      if (Array.isArray(drugChartDataRow.entered_by)) {
        mainRecordEnteredBy = [...drugChartDataRow.entered_by];
      } else if (typeof drugChartDataRow.entered_by === "string" && drugChartDataRow.entered_by) {
        mainRecordEnteredBy = [drugChartDataRow.entered_by];
      }
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      // Update the main row in the database with the modified array
      const { error } = await supabase
        .from(drugChartTable)
        .update({
          drug_chart_data: updatedDrugChartData,
          entered_by: mainRecordEnteredBy,
          updated_at: new Date().toISOString(), // Update main record's updated_at
        })
        .eq("id", drugChartDataRow.id);

      if (error) throw error;

      toast.success("Drug chart entry marked as deleted!");
    } catch (error: any) {
      console.error("An unexpected error occurred during deletion:", error.message);
      toast.error("An unexpected error occurred during deletion.");
    } finally {
      await fetchDrugChartDataRow(); // Manually refetch for immediate UI update
    }
  }, [drugChartDataRow, fetchDrugChartDataRow]);


  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-50";
      case "hold": return "bg-orange-50";
      case "omit": return "bg-red-50";
      default: return "bg-white";
    }
  };

  // --- Memoized Data for UI Rendering ---
  const activeEntries = useMemo(() => {
    if (!drugChartDataRow || !drugChartDataRow.drug_chart_data) return [];
    return drugChartDataRow.drug_chart_data
      .filter(entry => !entry.deletedBy)
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()); // Sort newest first
  }, [drugChartDataRow]);

  const groupedEntries = useMemo(() => {
    return activeEntries.reduce((acc: Record<string, SingleDrugChartEntry[]>, entry) => {
      const day = format(new Date(entry.dateTime), "dd MMM yyyy");
      if (!acc[day]) acc[day] = [];
      acc[day].push(entry);
      return acc;
    }, {});
  }, [activeEntries]);

  const deletedEntries = useMemo(() => {
    if (!drugChartDataRow || !drugChartDataRow.drug_chart_data) return [];
    return drugChartDataRow.drug_chart_data
      .filter(entry => entry.deletedBy)
      .sort((a, b) => new Date(b.deletedAt || '').getTime() - new Date(a.deletedAt || '').getTime()); // Sort by most recent deletion
  }, [drugChartDataRow]);


  return (
    <div className="p-4 space-y-6">
      {/* === New Entry Form === */}
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Pill className="h-6 w-6 text-blue-600" />
              New Drug Chart Entry
            </CardTitle>
            {deletedEntries.length > 0 && (
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
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-gray-600" /> Deleted Drug Chart Entries History
                    </DialogTitle>
                    <DialogDescription>
                      View individual drug chart entries that were previously deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {deletedEntries.length === 0 ? (
                      <p className="text-center text-gray-500">No deleted entries found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Drug Name</TableHead>
                            <TableHead>Dosage</TableHead>
                            <TableHead>Route</TableHead>
                            <TableHead>Deleted By</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead>Original Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedEntries.map((entry, index) => (
                            <TableRow key={entry.tempId}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{entry.drugName}</TableCell>
                              <TableCell>{entry.dosage}</TableCell>
                              <TableCell>{entry.route}</TableCell>
                              <TableCell>{entry.deletedBy || 'N/A'}</TableCell>
                              <TableCell>
                                {entry.deletedAt ? format(new Date(entry.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
                              </TableCell>
                              <TableCell>
                                {format(new Date(entry.timestamp), "MMM dd, yyyy hh:mm a")}
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
            <div>
              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
              <Input type="datetime-local" {...register("dateTime")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Duration</label>
              <Input type="text" placeholder="Enter duration" {...register("duration")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dosage</label>
              <Input type="text" placeholder="Enter dosage" {...register("dosage")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Drug Name</label>
              <Input type="text" placeholder="Enter drug name" {...register("drugName")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dose</label>
              <Input type="text" placeholder="Enter dose" {...register("dose")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Route</label>
              <Input type="text" placeholder="Enter route (e.g., oral, IV)" {...register("route")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Frequency</label>
              <Input
                type="text"
                placeholder="Enter frequency (e.g., Q6H)"
                {...register("frequency")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Special Instruction</label>
              <Textarea
                placeholder="Enter special instructions"
                {...register("specialInstruction")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Stat</label>
              <Input type="text" placeholder="Enter stat if applicable" {...register("stat")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <Select onValueChange={(value) => setNewEntryValue('status', value as "active" | "hold" | "omit")} defaultValue="active">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="omit">Omit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Pill className="h-4 w-4 mr-2" /> Save Entry
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* === List of Entries === */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Pill className="h-6 w-6 text-green-600" />
          Drug Chart Entries
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
            <p className="ml-4 text-lg text-gray-600">Loading entries...</p>
          </div>
        ) : Object.keys(groupedEntries).length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Pill className="h-16 w-16 text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No entries recorded yet.</h3>
            <p className="text-slate-500">Add a new drug chart entry using the form above.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEntries).sort(([dayA], [dayB]) => new Date(dayB).getTime() - new Date(dayA).getTime()).map(([day, dayEntries]) => (
              <Card key={day} className="border border-slate-200 shadow-sm">
                <CardHeader className="bg-slate-50 py-3 px-4 border-b">
                  <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-gray-600" /> {day}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.tempId}
                        className={`border p-3 rounded-lg shadow-sm flex flex-col gap-2 ${getStatusBgColor(
                          entry.status || "active"
                        )}`}
                      >
                        <div className="flex justify-between flex-wrap items-start">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="font-semibold text-base mb-1">
                              Drug: {entry.drugName} ({entry.dosage})
                            </p>
                            <p className="text-sm text-gray-700">
                              **Dose:** {entry.dose} | **Route:** {entry.route} | **Frequency:** {entry.frequency}
                            </p>
                            {entry.duration && <p className="text-sm text-gray-700">**Duration:** {entry.duration}</p>}
                            {entry.specialInstruction && (
                              <p className="text-sm text-gray-700">
                                **Special Instruction:** {entry.specialInstruction}
                              </p>
                            )}
                            {entry.stat && <p className="text-sm text-gray-700">**STAT:** {entry.stat}</p>}
                            <p className="text-xs text-gray-500 mt-1">
                              Entered By: {entry.enteredBy} at {format(new Date(entry.timestamp), "MMM dd, yyyy hh:mm a")}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 mt-2 md:mt-0">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEditClick(entry)}>
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleSignatureClick(entry)}>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Sign
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDeleteEntry(entry.tempId)}>
                                <Trash2 className="h-4 w-4 mr-1" /> Delete
                              </Button>
                            </div>
                            <div className="mt-2">
                              <Select
                                defaultValue={entry.status || "active"}
                                onValueChange={(value) =>
                                  handleStatusChange(entry.tempId, value as "active" | "hold" | "omit")
                                }
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="hold">Hold</SelectItem>
                                  <SelectItem value="omit">Omit</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        {/* List signatures */}
                        {entry.signatures && entry.signatures.length > 0 && (
                          <div className="mt-2 border-t pt-2">
                            <p className="text-sm font-semibold text-slate-700 mb-1">Signatures:</p>
                            <div className="space-y-1">
                              {entry.signatures.map((sig, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs text-gray-700 flex items-center gap-2"
                                >
                                  <span>–</span>
                                  <span>
                                    {format(new Date(sig.dateTime), "dd MMM yyyy, hh:mm a")}
                                  </span>
                                  <span className="text-gray-500">by {sig.by}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Condense Edit History */}
                        {entry.editHistory && entry.editHistory.length > 0 && (
                          <div className="mt-2 border-t pt-2">
                            <details className="group cursor-pointer">
                              <summary className="flex items-center text-sm font-semibold text-slate-700 list-none">
                                <span className="flex-1 flex items-center gap-1">
                                  <ChevronRight className="h-4 w-4 transform transition-transform duration-200 group-open:rotate-90" />
                                  Edit History ({entry.editHistory.length})
                                </span>
                              </summary>
                              <div className="space-y-1 pl-6 pt-2">
                                {entry.editHistory.map((edit, idx) => (
                                  <div
                                    key={idx}
                                    className="text-xs text-gray-700 flex flex-wrap items-center gap-1"
                                  >
                                    <span>– Edited by {edit.editedBy} on {format(new Date(edit.timestamp), "dd MMM yyyy, hh:mm a")}</span>
                                    {edit.previousValues.status && (
                                      <span className={`px-1 rounded-full ${getStatusBgColor(edit.previousValues.status)}`}>
                                        (Status changed from: {edit.previousValues.status})
                                      </span>
                                    )}
                                    {/* You can add more details about what was changed here if needed */}
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* === Signature Modal === */}
      <Dialog open={signatureModalOpen} onOpenChange={setSignatureModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto"> {/* Added scrollability */}
          <DialogHeader>
            <DialogTitle>Add Signature</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitSign(onSubmitSignature)} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
              <Input type="datetime-local" {...registerSign("dateTime")} className="w-full" />
              <p className="text-xs text-gray-500 mt-1">(Auto-filled, can be changed)</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSignatureModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>


      {/* === Edit Modal === */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"> {/* Added scrollability */}
          <DialogHeader>
            <DialogTitle>Edit Drug Chart Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit(onSubmitEdit)} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
              <Input type="datetime-local" {...registerEdit("dateTime")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Duration</label>
              <Input type="text" placeholder="Enter duration" {...registerEdit("duration")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dosage</label>
              <Input type="text" placeholder="Enter dosage" {...registerEdit("dosage")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Drug Name</label>
              <Input type="text" placeholder="Enter drug name" {...registerEdit("drugName")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dose</label>
              <Input type="text" placeholder="Enter dose" {...registerEdit("dose")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Route</label>
              <Input type="text" placeholder="Enter route (e.g., oral, IV)" {...registerEdit("route")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Frequency</label>
              <Input type="text" placeholder="Enter frequency (e.g., Q6H)" {...registerEdit("frequency")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Special Instruction</label>
              <Textarea placeholder="Enter special instructions" {...registerEdit("specialInstruction")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Stat</label>
              <Input type="text" placeholder="Enter stat if applicable" {...registerEdit("stat")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <Select {...registerEdit("status")} defaultValue={entryForEdit?.status || "active"} onValueChange={(value) => setEditValue('status', value as "active" | "hold" | "omit")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="omit">Omit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- Deleted History Modal --- */}
      <Dialog open={showDeletedHistory} onOpenChange={setShowDeletedHistory}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-gray-600" /> Deleted Drug Chart Entries History
            </DialogTitle>
            <DialogDescription>
              View individual drug chart entries that were previously deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {deletedEntries.length === 0 ? (
              <p className="text-center text-gray-500">No deleted entries found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Drug Name</TableHead>
                    <TableHead>Dosage</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Deleted By</TableHead>
                    <TableHead>Deleted At</TableHead>
                    <TableHead>Original Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletedEntries.map((entry, index) => (
                    <TableRow key={entry.tempId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{entry.drugName}</TableCell>
                      <TableCell>{entry.dosage}</TableCell>
                      <TableCell>{entry.route}</TableCell>
                      <TableCell>{entry.deletedBy || 'N/A'}</TableCell>
                      <TableCell>
                        {entry.deletedAt ? format(new Date(entry.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(entry.timestamp), "MMM dd, yyyy hh:mm a")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}