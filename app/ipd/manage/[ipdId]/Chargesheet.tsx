// app/ipd/manage/[ipdId]/PatientChargesTab.tsx
"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase"; // Your Supabase client
import { toast } from "sonner"; // For toasts

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // For history table
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"; // For history dialog
import { format } from "date-fns";
import { 
  Calendar, Trash2, Mic, MicOff, RefreshCw, Stethoscope, UserCheck, 
  History, DollarSign, Wallet
} from "lucide-react"; // Added relevant icons

// --- Type Definitions ---
// Corresponds to a row in 'manage_charge_sheets' table
interface ChargeSheetSupabase {
  id: string; // UUID from Supabase (primary key for each sheet)
  ipd_id: number;
  uhid: string;
  description: string;
  done_by: string; // Renamed to snake_case
  entered_by: string[] | null; // Array of users who entered/modified this specific sheet
  timestamp: string; // Timestamp of this specific sheet creation
  created_at?: string; // Supabase handles this
  updated_at?: string; // Supabase handles this
  deleted_data?: { deletedBy: string; deletedAt: string } | null; // For soft deletion
}

// Form inputs
interface ChargeSheetFormInputs {
  description: string;
  doneBy: string; // Use camelCase for form fields
}

// Web Speech API interfaces (standard declarations)
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
    | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any)
    | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
// --- End Type Definitions ---


export default function PatientCharges() {
  const { ipdId } = useParams<{ ipdId: string }>();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
  } = useForm<ChargeSheetFormInputs>({
    defaultValues: {
      description: "",
      doneBy: "",
    },
  });

  const [allChargeSheets, setAllChargeSheets] = useState<ChargeSheetSupabase[]>([]); // Holds all sheets including deleted
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false); // For voice input
  const [showDeletedHistory, setShowDeletedHistory] = useState(false); // State for history dialog
  const recognitionRef = useRef<SpeechRecognition | null>(null); // For voice recognition

  // --- Data Fetching Logic ---
  const fetchChargeSheets = useCallback(async () => {
    if (!ipdId) {
      setAllChargeSheets([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("manage_charge_sheets")
        .select("*")
        .eq("ipd_id", Number(ipdId))
        .order("timestamp", { ascending: false }); // Fetch all, including soft-deleted

      if (error) {
        console.error("Error fetching charge sheets:", error.message);
        toast.error("Failed to load charge sheets.");
        setAllChargeSheets([]);
        return;
      }
      setAllChargeSheets(data as ChargeSheetSupabase[]);
    } catch (error: any) {
      console.error("An unexpected error occurred during fetch:", error.message);
      toast.error("An unexpected error occurred while loading charge sheets.");
      setAllChargeSheets([]);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!ipdId) return;

    const ipdNum = Number(ipdId);
    let channel: any; // Declare channel here

    // Initial fetch
    fetchChargeSheets();

    // Set up real-time subscription
    channel = supabase
      .channel(`charge_sheets_ipd_${ipdNum}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'manage_charge_sheets',
          filter: `ipd_id=eq.${ipdNum}`,
        },
        async (payload) => {
          console.log("Realtime change detected for charge sheets:", payload);
          toast.info(`Charge sheet ${payload.eventType.toLowerCase()}d.`);
          // Refetch all data to update the UI
          await fetchChargeSheets();
        }
      )
      .subscribe();

    // Cleanup: unsubscribe when component unmounts or ipdId changes
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [ipdId, fetchChargeSheets]);


  // --- Voice Input Functionality ---
  const handleVoiceInput = useCallback(
    async (transcript: string) => {
      setIsSubmitting(true);
      const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8"; // Your Vertex AI API Key
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const prompt = `Extract these as JSON with keys "description" and "doneBy" from this text: "${transcript}". Only return the JSON.`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
        const json = await res.json();
        const jsonText = json.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
          toast.error("AI response did not contain valid JSON.");
          throw new Error("No JSON returned from AI API");
        }

        const aiData: Partial<ChargeSheetFormInputs> = JSON.parse(jsonText);
        Object.entries(aiData).forEach(([key, val]) => {
          if (val != null && String(val).trim() !== "") {
            setValue(key as keyof ChargeSheetFormInputs, String(val));
          }
        });
        toast.success("Voice input processed successfully!");
      } catch (err) {
        console.error("AI fill failed:", err);
        toast.error("Failed to process voice input. Please try manually.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [setValue]
  );

  const startListening = () => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast.error("Speech Recognition API not supported.");
      return;
    }
    // Stop any previous recognition
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }

    const recog = new SpeechRecognitionAPI();
    recognitionRef.current = recog; // Store ref
    recog.lang = "en-IN"; // Changed to Indian English
    recog.interimResults = false;
    recog.continuous = false; // Listen for a single utterance

    recog.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      handleVoiceInput(transcript);
    };
    recog.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error, event.message);
      toast.error(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };
    recog.onend = () => {
        setIsListening(false);
        recognitionRef.current = null; // Clear ref on end
    };
    recog.start();
    setIsListening(true);
    toast.info("Listening for charge details...");
  };

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  // --- Form Submission (Add New Charge Sheet) ---
  const onSubmit: SubmitHandler<ChargeSheetFormInputs> = async (formData) => {
    setIsSubmitting(true);
    try {
      // 1. Get UHID from ipd_registration
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("uhid")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (ipdError || !ipdData) {
        toast.error("Could not find patient's UHID. Cannot save charge sheet.");
        console.error("UHID fetch error:", ipdError?.message);
        return;
      }
      const uhid = ipdData.uhid;

      // 2. Get current logged-in user email
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // 3. Prepare the new charge sheet data
      const newSheet: Omit<ChargeSheetSupabase, "id" | "created_at" | "updated_at" | "deleted_data"> = {
        ipd_id: Number(ipdId),
        uhid: uhid,
        description: formData.description.trim(),
        done_by: formData.doneBy.trim(), // Use done_by
        entered_by: [currentUserEmail], // Initial entry by current user
        timestamp: new Date().toISOString(), // Timestamp for this specific entry
      };

      // 4. Insert the new note into Supabase
      const { error } = await supabase
        .from("manage_charge_sheets")
        .insert(newSheet);

      if (error) {
        console.error("Error saving charge sheet:", error.message);
        toast.error("Error saving charge sheet. Please try again.");
      } else {
        toast.success("Charge sheet added successfully!");
        reset({ description: "", doneBy: "" }); // Clear form
      }
    } catch (error: any) {
      console.error("An unexpected error occurred:", error.message);
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
      await fetchChargeSheets(); // Manually refetch for immediate UI update
    }
  };

  // --- Delete Logic (Soft Delete a Charge Sheet) ---
  const handleDeleteSheet = useCallback(async (sheetId: string) => {
    if (!window.confirm("Are you sure you want to delete this charge sheet?")) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Fetch the note to get its current `entered_by` array before updating
      const { data: existingSheet, error: fetchError } = await supabase
        .from('manage_charge_sheets')
        .select('entered_by')
        .eq('id', sheetId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") { // Ignore "no rows found" error
        console.error("Error fetching existing charge sheet for update:", fetchError.message);
        toast.error("Failed to retrieve sheet data for deletion. Please try again.");
        return;
      }
      
      let updatedEnteredBy: string[] = [];
      // Populate updatedEnteredBy from existing data, or start fresh
      if (existingSheet?.entered_by) {
        if (Array.isArray(existingSheet.entered_by)) {
            updatedEnteredBy = [...existingSheet.entered_by];
        } else if (typeof existingSheet.entered_by === 'string') { // Handle potential legacy string
            updatedEnteredBy = [existingSheet.entered_by];
        }
      }
      // Add current user to entered_by if not already present
      if (!updatedEnteredBy.includes(currentUserEmail)) {
        updatedEnteredBy.push(currentUserEmail);
      }

      // Update the `deleted_data` and `entered_by` fields for the specific sheet
      const { error } = await supabase
        .from("manage_charge_sheets")
        .update({
          deleted_data: { deletedBy: currentUserEmail, deletedAt: new Date().toISOString() },
          entered_by: updatedEnteredBy // Update entered_by on deletion as well
        })
        .eq("id", sheetId);

      if (error) {
        console.error("Error soft-deleting charge sheet:", error.message);
        toast.error("Failed to delete charge sheet. Please try again.");
      } else {
        toast.success("Charge sheet marked as deleted!");
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during deletion:", error.message);
      toast.error("An unexpected error occurred during deletion.");
    } finally {
      await fetchChargeSheets(); // Manually refetch for immediate UI update
    }
  }, [fetchChargeSheets]);

  // --- Memoized Data for UI Rendering ---
  const activeChargeSheets = useMemo(() => {
    return allChargeSheets.filter(sheet => !sheet.deleted_data)
                           .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort newest first
  }, [allChargeSheets]);

  const deletedChargeSheets = useMemo(() => {
    return allChargeSheets.filter(sheet => sheet.deleted_data)
                           .sort((a, b) => new Date(b.deleted_data?.deletedAt || '').getTime() - new Date(a.deleted_data?.deletedAt || '').getTime()); // Sort by deletion time
  }, [allChargeSheets]);


  return (
    <div className="space-y-6">
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-blue-600" /> {/* Changed icon */}
              Add New Charge Sheet
            </CardTitle>
            {deletedChargeSheets.length > 0 && (
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
                      <History className="h-5 w-5 text-gray-600" /> Deleted Charge Sheets History
                    </DialogTitle>
                    <DialogDescription>
                      View charge sheets that were previously deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {deletedChargeSheets.length === 0 ? (
                      <p className="text-center text-gray-500">No deleted charge sheets found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Done By</TableHead>
                            <TableHead>Deleted By</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead>Original Entered By</TableHead>
                            <TableHead>Original Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedChargeSheets.map((sheet, index) => (
                            <TableRow key={sheet.id}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{sheet.description}</TableCell>
                              <TableCell>{sheet.done_by}</TableCell>
                              <TableCell>{sheet.deleted_data?.deletedBy || 'N/A'}</TableCell>
                              <TableCell>
                                {sheet.deleted_data?.deletedAt ? format(new Date(sheet.deleted_data.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
                              </TableCell>
                              <TableCell>{Array.isArray(sheet.entered_by) ? sheet.entered_by.join(', ') : sheet.entered_by || 'N/A'}</TableCell>
                              <TableCell>{sheet.timestamp ? format(new Date(sheet.timestamp), "MMM dd, yyyy hh:mm a") : 'N/A'}</TableCell>
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
          <Button
            type="button"
            onClick={startListening}
            disabled={isListening || isSubmitting}
            className="w-full mb-4 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isListening ? (
              <>
                <MicOff className="h-4 w-4 mr-2 animate-pulse" /> Listening…
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" /> Fill via Voice
              </>
            )}
          </Button>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">Charge Details</label>
              <Textarea
                id="description"
                {...register("description", { required: true })}
                placeholder="Enter charge description..."
                className="w-full min-h-[80px]"
              />
            </div>

            <div>
              <label htmlFor="doneBy" className="block text-sm font-medium text-slate-700 mb-1">Done By</label>
              <Input
                id="doneBy"
                type="text"
                {...register("doneBy", { required: true })}
                placeholder="Enter name of person who performed the service"
                className="w-full"
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 mr-2" /> Add Charge Sheet
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-600" />
            Charge Sheet History
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
            <p className="ml-4 text-lg text-gray-600">Loading charge sheets...</p>
          </div>
        ) : activeChargeSheets.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 shadow-sm">
            <DollarSign className="h-16 w-16 text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No charge sheets have been added yet.</h3>
            <p className="text-slate-500">Add a new charge using the form above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-md bg-white">
            <Table className="w-full text-sm">
              <thead>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="px-4 py-2 text-left font-semibold text-slate-600">#</TableHead>
                  <TableHead className="px-4 py-2 text-left font-semibold text-slate-600">Description</TableHead>
                  <TableHead className="px-4 py-2 text-left font-semibold text-slate-600">Done By</TableHead>
                  <TableHead className="px-4 py-2 text-left font-semibold text-slate-600">Entered By</TableHead>
                  <TableHead className="px-4 py-2 text-left font-semibold text-slate-600">Date/Time</TableHead>
                  <TableHead className="px-4 py-2 text-right font-semibold text-slate-600">Actions</TableHead>
                </TableRow>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeChargeSheets.map((sheet, idx) => (
                  <TableRow key={sheet.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="px-4 py-2">{idx + 1}</TableCell>
                    <TableCell className="px-4 py-2">{sheet.description}</TableCell>
                    <TableCell className="px-4 py-2">{sheet.done_by}</TableCell>
                    <TableCell className="px-4 py-2">{Array.isArray(sheet.entered_by) ? sheet.entered_by.join(', ') : sheet.entered_by || 'N/A'}</TableCell>
                    <TableCell className="px-4 py-2 flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-slate-500" />
                      {format(new Date(sheet.timestamp), "MMM dd, yyyy, hh:mm a")}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteSheet(sheet.id)}
                        className="px-2 py-1 text-xs"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}