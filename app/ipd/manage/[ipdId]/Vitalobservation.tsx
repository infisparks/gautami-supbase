// app/ipd/manage/[ipdId]/VitalObservationsTab.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase"; // Your Supabase client
import { toast } from "sonner"; // For toasts

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // For history table
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"; // For history dialog
import { format } from "date-fns";
import { 
  RefreshCw, Trash2, Mic, MicOff, Stethoscope, UserCheck, 
  History, CalendarDays, FlaskConical, Droplet, Clock, Heart, Hand, Scale, Pill, ArrowUp, ArrowDown
} from "lucide-react"; // Added relevant icons

// --- Type Definitions ---
// Interface for a single vital observation entry *within* the `vital_data` JSONB array
interface SingleVitalObservationEntry {
  tempId: string; // Client-side unique ID for managing this entry in the array
  dateTime: string;
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressure: string;
  intakeOral: string;
  intakeIV: string;
  outputUrine: string;
  outputStool: string;
  outputAspiration: string;
  enteredBy: string; // User who entered this specific observation
  timestamp: string; // Timestamp for this specific observation
  deletedBy?: string; // For soft-deleting individual entries
  deletedAt?: string; // Timestamp of deletion for this individual entry
}

// Interface for the main row in the 'manage_vital_observations' table
interface VitalObservationsRecordSupabase {
  id: string; // UUID of the main row
  ipd_id: number;
  uhid: string;
  vital_data: SingleVitalObservationEntry[]; // The array of individual observations
  entered_by: string[] | null; // Array of users who modified this main record
  created_at?: string;
  updated_at?: string; // Supabase can automatically update this
  deleted_data?: { deletedBy: string; deletedAt: string } | null; // For soft-deleting the *entire row*
}

// Form inputs
interface VitalObservationFormInputs {
  dateTime: string;
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressure: string;
  intakeOral: string;
  intakeIV: string;
  outputUrine: string;
  outputStool: string;
  outputAspiration: string;
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


export default function VitalObservations() {
  const { ipdId } = useParams<{ ipdId: string }>();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
  } = useForm<VitalObservationFormInputs>({
    defaultValues: {
      dateTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"), // Current local date/time
      temperature: "",
      pulse: "",
      respiratoryRate: "",
      bloodPressure: "",
      intakeOral: "",
      intakeIV: "",
      outputUrine: "",
      outputStool: "",
      outputAspiration: ""
    }
  });

  const [vitalDataRow, setVitalDataRow] = useState<VitalObservationsRecordSupabase | null>(null); // Holds the single row
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false); // For voice input
  const [showDeletedHistory, setShowDeletedHistory] = useState(false); // State for history dialog
  const recognitionRef = useRef<SpeechRecognition | null>(null); // For voice recognition

  // --- Data Fetching Logic ---
  const fetchVitalDataRow = useCallback(async () => {
    if (!ipdId) {
      setVitalDataRow(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("manage_vital_observations")
        .select("*")
        .eq("ipd_id", Number(ipdId))
        .single(); // Expecting a single row for this ipd_id

      if (error && error.code !== "PGRST116") { // PGRST116 means "No rows found"
        console.error("Error fetching vital observations row:", error.message);
        toast.error("Failed to load vital observations data.");
        setVitalDataRow(null);
      } else if (data) {
        setVitalDataRow(data as VitalObservationsRecordSupabase);
      } else {
        setVitalDataRow(null); // No data found
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during fetch:", error.message);
      toast.error("An unexpected error occurred while loading vital observations.");
      setVitalDataRow(null);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]);


  // --- Real-time Subscription ---
  useEffect(() => {
    if (!ipdId) return;

    const ipdNum = Number(ipdId);
    let channel: any; // Declare channel here for proper cleanup
    
    async function setupRealtimeChannel() {
      // Clean up any existing channel before setting up a new one
      if (channel) { 
        await supabase.removeChannel(channel);
      }

      // First, fetch initial data
      await fetchVitalDataRow();

      // We need the PK 'id' of the row to subscribe specifically to it.
      // If the row doesn't exist yet, we can't subscribe immediately.
      const { data: currentRecord, error: currentRecordError } = await supabase
        .from("manage_vital_observations")
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
            .channel(`vital_observations_row_${rowPkId}`) // Unique channel name per row
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'manage_vital_observations',
                    filter: `id=eq.${rowPkId}` // Filter by the actual row ID (PK)
                },
                async (payload) => {
                    console.log("Realtime change detected for vital observations PK row:", payload);
                    toast.info(`Vital observation data ${payload.eventType.toLowerCase()}d.`);
                    await fetchVitalDataRow(); // Refetch the data to update the UI
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
  }, [ipdId, fetchVitalDataRow]);


  // --- Polling for initial row existence ---
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined; 
    // If no row data is loaded yet and we have an ipdId, start polling
    if (!vitalDataRow && ipdId && !isLoading) {
      interval = setInterval(fetchVitalDataRow, 2000); // Poll every 2 seconds
    }
    // If data is loaded or ipdId is null, clear any active interval
    if ((vitalDataRow || !ipdId) && interval) { 
      clearInterval(interval);
    }
    // Cleanup function: clear interval when component unmounts or dependencies change
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [vitalDataRow, ipdId, isLoading, fetchVitalDataRow]);


  // --- Voice Input Functionality ---
  const handleVoiceInput = useCallback(
    async (transcript: string) => {
      setIsSubmitting(true);
      const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8"; // Your Vertex AI API Key
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const prompt = `Extract these as JSON with keys:
dateTime, temperature, pulse, respiratoryRate, bloodPressure, intakeOral, intakeIV, outputUrine, outputStool, outputAspiration
from this text:
"${transcript}". Ensure dateTime is in "YYYY-MM-DDTHH:MM" format if provided, otherwise leave empty.`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });
        const json = await res.json();
        // Ensure to handle potential API errors (e.g., json.candidates might be undefined)
        const jsonText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            toast.error("AI response did not contain valid data.");
            throw new Error("No valid JSON returned from AI API.");
        }
        
        const aiData: Partial<VitalObservationFormInputs> = JSON.parse(jsonText);

        // Only overwrite non-empty fields
        Object.entries(aiData).forEach(([key, val]) => {
          if (val != null && String(val).trim() !== "") {
            // For dateTime, if AI provides it, use it, otherwise keep current
            if (key === 'dateTime' && !val) {
                // Do nothing if AI returns empty dateTime
            } else {
                setValue(key as keyof VitalObservationFormInputs, String(val));
            }
          }
        });
        toast.success("Voice input processed successfully!");
      } catch (err) {
        console.error("AI fill failed:", err);
        toast.error("AI fill failed. Please check console for details.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [setValue] // Dependency on setValue
  );

  const startListening = () => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast.error("Speech Recognition API not supported in this browser.");
      return;
    }
    // Stop any previous recognition
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }

    const recog = new SpeechRecognitionAPI() as SpeechRecognition;
    recognitionRef.current = recog; // Store ref
    recog.lang = "en-IN"; // Changed to Indian English for better recognition of medical terms if spoken in Indian accent
    recog.interimResults = false;
    recog.continuous = false; // Listen for a single utterance

    recog.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0][0].transcript;
      handleVoiceInput(text);
    };
    recog.onerror = (ev: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", ev.error, ev.message);
      toast.error(`Speech recognition error: ${ev.error}`);
      setIsListening(false);
    };
    recog.onend = () => {
        setIsListening(false);
        recognitionRef.current = null; // Clear ref on end
    };
    recog.start();
    setIsListening(true);
    toast.info("Listening for your vital observation input...");
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

  // --- Form Submission (Add New Vital Observation) ---
  const onSubmit: SubmitHandler<VitalObservationFormInputs> = async (formData) => {
    setIsSubmitting(true);
    try {
      // 1. Get UHID from ipd_registration
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("uhid")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (ipdError || !ipdData) {
        toast.error("Could not find patient's UHID. Cannot save vital observation.");
        console.error("UHID fetch error:", ipdError?.message);
        return;
      }
      const uhid = ipdData.uhid;

      // 2. Get current logged-in user email
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // 3. Prepare the new single vital observation entry
      const newObservationEntry: SingleVitalObservationEntry = {
        tempId: Date.now().toString(), // Client-side unique ID
        dateTime: formData.dateTime, // From form
        temperature: formData.temperature,
        pulse: formData.pulse,
        respiratoryRate: formData.respiratoryRate,
        bloodPressure: formData.bloodPressure,
        intakeOral: formData.intakeOral,
        intakeIV: formData.intakeIV,
        outputUrine: formData.outputUrine,
        outputStool: formData.outputStool,
        outputAspiration: formData.outputAspiration,
        enteredBy: currentUserEmail,
        timestamp: new Date().toISOString(), // Timestamp for this specific entry
      };

      let currentVitalData: SingleVitalObservationEntry[] = [];
      let mainRecordEnteredBy: string[] = [];
      let mainRecordIdToUpdate: string | null = null;

      // 4. Fetch the current state of the main vital observation row (if it exists)
      const { data: currentMainRowData, error: fetchMainRowError } = await supabase
        .from("manage_vital_observations")
        .select("id, vital_data, entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (fetchMainRowError && fetchMainRowError.code !== "PGRST116") {
        console.error("Error fetching current main vital observation row:", fetchMainRowError.message);
        toast.error("Failed to retrieve current observation data. Please try again.");
        return;
      }

      // If a main row already exists for this ipd_id, use its data
      if (currentMainRowData) {
        mainRecordIdToUpdate = currentMainRowData.id;
        currentVitalData = currentMainRowData.vital_data || [];
        if (Array.isArray(currentMainRowData.entered_by)) {
          mainRecordEnteredBy = [...currentMainRowData.entered_by];
        } else if (typeof currentMainRowData.entered_by === "string" && currentMainRowData.entered_by) {
          mainRecordEnteredBy = [currentMainRowData.entered_by]; // Handle legacy
        }
      }

      // Add the new observation entry to the array
      currentVitalData.push(newObservationEntry);

      // Update the main record's 'entered_by' list
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      const updatePayload: Partial<VitalObservationsRecordSupabase> = {
        vital_data: currentVitalData,
        entered_by: mainRecordEnteredBy,
        updated_at: new Date().toISOString(), // Update main record's updated_at
      };

      // 5. Perform the database operation (UPDATE or INSERT)
      if (mainRecordIdToUpdate) {
        // Update existing main row
        const { error } = await supabase
          .from("manage_vital_observations")
          .update(updatePayload)
          .eq("id", mainRecordIdToUpdate);

        if (error) throw error;
      } else {
        // Insert new main row if no existing data for this ipd_id
        const newMainRowPayload: Omit<VitalObservationsRecordSupabase, "id" | "created_at" | "deleted_data"> = {
          ipd_id: Number(ipdId),
          uhid: uhid,
          vital_data: currentVitalData,
          entered_by: mainRecordEnteredBy,
          // created_at will be set by DB default, updated_at will be same as created_at initially
        };
        const { error } = await supabase
          .from("manage_vital_observations")
          .insert(newMainRowPayload);

        if (error) throw error;
      }
      toast.success("Vital observation added successfully!");
      // Reset form fields
      reset({
        dateTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"), // Reset to current time
        temperature: "", pulse: "", respiratoryRate: "", bloodPressure: "",
        intakeOral: "", intakeIV: "", outputUrine: "", outputStool: "", outputAspiration: ""
      });
    } catch (error: any) {
      console.error("An unexpected error occurred:", error.message);
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
      await fetchVitalDataRow(); // Manually refetch for immediate UI update
    }
  };


  // --- Delete Logic (Soft Delete an Individual Vital Observation Entry) ---
  const handleDeleteObservation = useCallback(async (tempIdToDelete: string) => {
    if (!window.confirm("Are you sure you want to delete this vital observation?")) {
      return;
    }

    if (!vitalDataRow || !vitalDataRow.id) {
      toast.error("No vital observation data found to delete from.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Create a deep copy of the vital_data array to modify
      const updatedVitalData = JSON.parse(JSON.stringify(vitalDataRow.vital_data || [])) as SingleVitalObservationEntry[];

      const observationToUpdate = updatedVitalData.find(obs => obs.tempId === tempIdToDelete);

      if (!observationToUpdate) {
        toast.error("Observation entry not found for deletion.");
        return;
      }

      // Mark the specific observation as deleted
      observationToUpdate.deletedBy = currentUserEmail;
      observationToUpdate.deletedAt = new Date().toISOString();

      let mainRecordEnteredBy: string[] = [];
      if (Array.isArray(vitalDataRow.entered_by)) {
        mainRecordEnteredBy = [...vitalDataRow.entered_by];
      } else if (typeof vitalDataRow.entered_by === "string" && vitalDataRow.entered_by) {
        mainRecordEnteredBy = [vitalDataRow.entered_by];
      }
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      // Update the main row in the database with the modified array
      const { error } = await supabase
        .from("manage_vital_observations")
        .update({
          vital_data: updatedVitalData,
          entered_by: mainRecordEnteredBy,
          updated_at: new Date().toISOString(), // Update main record's updated_at
        })
        .eq("id", vitalDataRow.id); 

      if (error) {
        console.error("Error soft-deleting vital observation:", error.message);
        toast.error("Failed to delete vital observation. Please try again.");
      } else {
        toast.success("Vital observation marked as deleted!");
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during deletion:", error.message);
      toast.error("An unexpected error occurred during deletion.");
    } finally {
      await fetchVitalDataRow(); // Manually refetch for immediate UI update
    }
  }, [vitalDataRow, fetchVitalDataRow]);


  // --- Memoized Data for UI Rendering ---
  // Filters out deleted observations and sorts them for display
  const displayObservations = useMemo(() => {
    if (!vitalDataRow || !vitalDataRow.vital_data) return [];
    return vitalDataRow.vital_data
      .filter((obs: SingleVitalObservationEntry) => !obs.deletedBy)
      .sort((a: SingleVitalObservationEntry, b: SingleVitalObservationEntry) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()); // Sort newest first
  }, [vitalDataRow]);

  // Filters for only deleted observations for the history popup
  const deletedObservations = useMemo(() => {
    if (!vitalDataRow || !vitalDataRow.vital_data) return [];
    return vitalDataRow.vital_data
      .filter((obs: SingleVitalObservationEntry) => obs.deletedBy)
      .sort((a: SingleVitalObservationEntry, b: SingleVitalObservationEntry) => new Date(b.deletedAt || '').getTime() - new Date(a.deletedAt || '').getTime()); // Sort by most recent deletion
  }, [vitalDataRow]);


  return (
    <div className="space-y-6">
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-600" /> {/* Changed icon to be more vital-like */}
              Add Vital Observation
            </CardTitle>
            {deletedObservations.length > 0 && (
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
                      <History className="h-5 w-5 text-gray-600" /> Deleted Vital Observations History
                    </DialogTitle>
                    <DialogDescription>
                      View vital observations that were previously deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {deletedObservations.length === 0 ? (
                      <p className="text-center text-gray-500">No deleted observations found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Date/Time</TableHead>
                            <TableHead>Temp</TableHead>
                            <TableHead>BP</TableHead>
                            <TableHead>Deleted By</TableHead>
                            <TableHead>Deleted At</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedObservations.map((obs, index) => (
                            <TableRow key={obs.tempId}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{format(new Date(obs.dateTime), "MMM dd, hh:mm a")}</TableCell>
                              <TableCell>{obs.temperature}</TableCell>
                              <TableCell>{obs.bloodPressure}</TableCell>
                              <TableCell>{obs.deletedBy || 'N/A'}</TableCell>
                              <TableCell>
                                {obs.deletedAt ? format(new Date(obs.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
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
                <Mic className="h-4 w-4 mr-2" /> Fill Form via Voice
              </>
            )}
          </Button>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="dateTime" className="block text-sm font-medium text-slate-700 mb-1">
                <CalendarDays className="inline-block h-4 w-4 mr-1 text-slate-600" /> Date & Time
              </label>
              <Input type="datetime-local" {...register("dateTime")} className="w-full" />
            </div>

            <div>
              <label htmlFor="temperature" className="block text-sm font-medium text-slate-700 mb-1">
                <Droplet className="inline-block h-4 w-4 mr-1 text-slate-600" /> Temperature
              </label>
              <Input {...register("temperature")} placeholder="e.g. 98.6 ℉" className="w-full" />
            </div>

            <div>
              <label htmlFor="pulse" className="block text-sm font-medium text-slate-700 mb-1">
                <Heart className="inline-block h-4 w-4 mr-1 text-slate-600" /> Pulse
              </label>
              <Input {...register("pulse")} placeholder="beats per minute" className="w-full" />
            </div>

            <div>
              <label htmlFor="respiratoryRate" className="block text-sm font-medium text-slate-700 mb-1">
                <Clock className="inline-block h-4 w-4 mr-1 text-slate-600" /> Respiratory Rate
              </label>
              <Input
                {...register("respiratoryRate")}
                placeholder="breaths per minute"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="bloodPressure" className="block text-sm font-medium text-slate-700 mb-1">
                <Hand className="inline-block h-4 w-4 mr-1 text-slate-600" /> Blood Pressure
              </label>
              <Input {...register("bloodPressure")} placeholder="e.g. 120/80" className="w-full" />
            </div>

            <h3 className="text-lg font-semibold pt-4 flex items-center gap-2">
                <ArrowUp className="h-5 w-5 text-blue-600" /> Intake
            </h3>
            <div>
              <label htmlFor="intakeOral" className="block text-sm font-medium text-slate-700 mb-1">
                Oral Intake
              </label>
              <Input {...register("intakeOral")} placeholder="ml" className="w-full" />
            </div>
            <div>
              <label htmlFor="intakeIV" className="block text-sm font-medium text-slate-700 mb-1">
                IV Intake
              </label>
              <Input {...register("intakeIV")} placeholder="ml" className="w-full" />
            </div>

            <h3 className="text-lg font-semibold pt-4 flex items-center gap-2">
                <ArrowDown className="h-5 w-5 text-red-600" /> Output
            </h3>
            <div>
              <label htmlFor="outputUrine" className="block text-sm font-medium text-slate-700 mb-1">
                Urine
              </label>
              <Input {...register("outputUrine")} placeholder="ml" className="w-full" />
            </div>
            <div>
              <label htmlFor="outputStool" className="block text-sm font-medium text-slate-700 mb-1">
                Stool
              </label>
              <Input {...register("outputStool")} placeholder="times/volume" className="w-full" />
            </div>
            <div>
              <label htmlFor="outputAspiration" className="block text-sm font-medium text-slate-700 mb-1">
                Aspiration
              </label>
              <Input
                {...register("outputAspiration")}
                placeholder="ml"
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
                  <UserCheck className="h-4 w-4 mr-2" /> Add Observation
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-green-600" />
          All Vital Observations
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
            <p className="ml-4 text-lg text-gray-600">Loading vital observations...</p>
          </div>
        ) : displayObservations.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 shadow-sm">
            <FlaskConical className="h-16 w-16 text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No vital observations recorded yet.</h3>
            <p className="text-slate-500">Add a new observation using the form above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-md bg-white">
            <Table className="w-full text-sm">
              <thead>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="px-2 py-1">Date & Time</TableHead>
                  <TableHead className="px-2 py-1">Temp</TableHead>
                  <TableHead className="px-2 py-1">Pulse</TableHead>
                  <TableHead className="px-2 py-1">Resp Rate</TableHead>
                  <TableHead className="px-2 py-1">BP</TableHead>
                  <TableHead className="px-2 py-1">Intake (Oral/IV)</TableHead>
                  <TableHead className="px-2 py-1">Output (U/St/Asp)</TableHead>
                  <TableHead className="px-2 py-1">Entered By</TableHead>
                  <TableHead className="px-2 py-1">Actions</TableHead>
                </TableRow>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayObservations.map((obs) => (
                  <TableRow key={obs.tempId} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="px-2 py-1">
                      <div className="flex items-center text-xs text-slate-600">
                        <CalendarDays className="h-3 w-3 mr-1 text-slate-500" />
                        {format(new Date(obs.dateTime), "MMM dd, yyyy, hh:mm a")}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-1">{obs.temperature || "-"}</TableCell>
                    <TableCell className="px-2 py-1">{obs.pulse || "-"}</TableCell>
                    <TableCell className="px-2 py-1">{obs.respiratoryRate || "-fourths/min"}</TableCell>
                    <TableCell className="px-2 py-1">{obs.bloodPressure || "-"}</TableCell>
                    <TableCell className="px-2 py-1">
                      {obs.intakeOral || "-"}ml / {obs.intakeIV || "-"}ml
                    </TableCell>
                    <TableCell className="px-2 py-1">
                      {obs.outputUrine || "-"}ml / {obs.outputStool || "-"} / {obs.outputAspiration || "-"}ml
                    </TableCell>
                    <TableCell className="px-2 py-1">{obs.enteredBy}</TableCell>
                    <TableCell className="px-2 py-1 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteObservation(obs.tempId)}
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