// app/ipd/manage/[ipdId]/GlucoseMonitoring.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Trash2, 
  Mic, 
  MicOff, 
  RefreshCw,
  Stethoscope, 
  UserCheck,
  History, // <-- NEW ICON FOR DELETED HISTORY
  X, // For closing dialog
  EyeOff // Could be an alternative icon for deleted
} from "lucide-react"; 
import { format } from "date-fns";

// Assuming you have these Shadcn UI components setup:
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


// --- Type Definitions ---
// Interface for a single glucose reading object *within* the glucose_data JSON array
interface SingleGlucoseReadingEntry {
  tempId: string; // Client-side unique ID for managing this entry in the array
  bloodSugar: string;
  urineSugarKetone: string;
  medication: string;
  dose: string;
  orderedBy: string;
  staffOrNurse: string;
  enteredBy: string; // The user who entered/last modified this specific entry
  timestamp: string; // Timestamp for this specific entry
  deletedBy?: string; // For soft-deleting individual entries within the array
  deletedAt?: string;
}

// Interface for the main row in the 'glucose_readings' table
interface GlucoseReadingsRow {
  id: string; // Primary key of the main row
  ipd_id: number;
  uhid: string;
  entered_by: string[] | null; // Array of users who have modified this main row
  timestamp: string; // Last updated timestamp of the main row
  created_at?: string;
  glucose_data: SingleGlucoseReadingEntry[] | null; // The array of actual readings
  deleted_data?: { deletedBy: string; deletedAt: string } | null; // For soft-deleting the entire row
}

// Form inputs for a new reading
interface GlucoseFormInputs {
  bloodSugar: string;
  urineSugarKetone: string;
  medication: string;
  dose: string;
  orderedBy: string;
  staffOrNurse: string;
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


export default function GlucoseMonitoring() {
  const { ipdId } = useParams<{ ipdId: string }>();

  // State for the single row containing all glucose data for this IPD
  const [glucoseDataRow, setGlucoseDataRow] = useState<GlucoseReadingsRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // For form submission state
  const [isListening, setIsListening] = useState(false); // For voice input state
  const [showDeletedHistory, setShowDeletedHistory] = useState(false); // <--- NEW STATE for dialog
  const recognitionRef = useRef<SpeechRecognition | null>(null); // Ref for voice recognition instance

  // React Hook Form setup
  const { register, handleSubmit, reset, setValue, getValues } = useForm<GlucoseFormInputs>({
    defaultValues: { // Corrected from defaultDefaults to defaultValues
      bloodSugar: "",
      urineSugarKetone: "",
      medication: "",
      dose: "",
      orderedBy: "",
      staffOrNurse: "",
    },
  });

  // --- Data Fetching Logic ---
  // Fetches the single row of glucose readings data for the current IPD ID
  const fetchGlucoseDataRow = useCallback(async () => {
    if (!ipdId) {
      setGlucoseDataRow(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ipdNum = Number(ipdId);
    try {
      const { data, error } = await supabase
        .from("glucose_readings")
        .select("*")
        .eq("ipd_id", ipdNum)
        .is("deleted_data", null) // Only fetch the main row if it's not soft-deleted
        .single();

      if (error && error.code !== "PGRST116") { // PGRST116 means "No rows found"
        // This is a genuine error, not just no data
        console.error("Error fetching glucose readings row:", error.message);
        toast.error("Failed to load glucose readings data.");
        setGlucoseDataRow(null);
      } else if (data) {
        setGlucoseDataRow(data as GlucoseReadingsRow);
      } else {
        setGlucoseDataRow(null); // No data found, or main row is soft-deleted
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during initial fetch:", error.message);
      toast.error("An unexpected error occurred while loading glucose data.");
      setGlucoseDataRow(null);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]);


  // --- Real-time Subscription Setup ---
  useEffect(() => {
    let channel: any; 
    
    async function setupRealtimeChannel() {
      // Clean up any existing channel before setting up a new one
      if (channel) { 
        await supabase.removeChannel(channel);
      }

      // First, fetch the current state to get the row's actual 'id' (PK) if it exists
      await fetchGlucoseDataRow();

      const ipdNum = Number(ipdId);
      const { data } = await supabase
        .from("glucose_readings")
        .select("id")
        .eq("ipd_id", ipdNum)
        .is("deleted_data", null)
        .single();

      if (!data?.id) {
        return; 
      }

      const rowPkId = data.id;

      channel = supabase 
        .channel(`glucose_readings_row_${rowPkId}`) 
        .on(
          "postgres_changes",
          {
            event: "*", 
            schema: "public",
            table: "glucose_readings",
            filter: `id=eq.${rowPkId}`, 
          },
          async (payload) => {
            console.log("Realtime change detected for glucose PK row:", payload);
            toast.info(`Database change detected for glucose: ${payload.eventType}`);
            await fetchGlucoseDataRow(); 
          }
        )
        .subscribe();
    }

    if (ipdId) {
      setupRealtimeChannel();
    }

    return () => {
      if (channel) { 
        supabase.removeChannel(channel);
      }
    };
  }, [ipdId, fetchGlucoseDataRow]); 


  // --- Polling for initial row existence ---
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined; 
    if (!glucoseDataRow && ipdId && !isLoading) {
      interval = setInterval(fetchGlucoseDataRow, 2000); 
    }
    if ((glucoseDataRow || !ipdId) && interval) { 
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [glucoseDataRow, ipdId, isLoading, fetchGlucoseDataRow]);


  // --- Voice Input Functionality ---
  const handleVoiceInput = useCallback(
    async (text: string) => {
      setIsSubmitting(true);
      const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8"; // Your API Key
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `Extract these details as JSON with keys bloodSugar, urineSugarKetone, medication, dose, orderedBy, staffOrNurse from this: "${text}". Only return the JSON.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      };

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
          toast.error("AI response did not contain valid JSON.");
          throw new Error("No JSON returned from AI API");
        }

        const structuredData: Partial<GlucoseFormInputs> = JSON.parse(jsonText);

        Object.entries(structuredData).forEach(([key, val]) => {
          if (val != null && String(val).trim() !== "") {
            setValue(key as keyof GlucoseFormInputs, String(val));
          }
        });
        toast.success("Voice input processed successfully!");
      } catch (error) {
        console.error("Vertex AI request failed:", error);
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
      toast.error("Speech Recognition not supported in your browser.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
    recognitionRef.current = recognition; 
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false; 

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      handleVoiceInput(transcript);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error, event.message);
      toast.error(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    
    recognition.start();
    setIsListening(true);
    toast.info("Listening for your input...");
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);


  // --- Form Submission (Add New Glucose Reading) ---
  const onSubmit: SubmitHandler<GlucoseFormInputs> = async (formData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("uhid")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (ipdError || !ipdData) {
        toast.error("Could not find patient's UHID. Cannot save glucose reading.");
        console.error("Error fetching UHID for save:", ipdError?.message);
        return;
      }
      const uhid = ipdData.uhid;

      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      const newReadingEntry: SingleGlucoseReadingEntry = {
        tempId: Date.now().toString(), 
        bloodSugar: formData.bloodSugar,
        urineSugarKetone: formData.urineSugarKetone,
        medication: formData.medication,
        dose: formData.dose,
        orderedBy: formData.orderedBy,
        staffOrNurse: formData.staffOrNurse,
        enteredBy: currentUserEmail, 
        timestamp: new Date().toISOString(), 
      };

      let currentGlucoseData: SingleGlucoseReadingEntry[] = [];
      let mainRecordEnteredBy: string[] = []; 
      let mainRecordIdToUpdate: string | null = null;

      const { data: currentMainRowData, error: fetchMainRowError } = await supabase
        .from("glucose_readings")
        .select("id, glucose_data, entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (fetchMainRowError && fetchMainRowError.code !== "PGRST116") {
        console.error("Error fetching current main row data before update:", fetchMainRowError.message);
        toast.error("Failed to retrieve current glucose data. Please try again.");
        return;
      }

      if (currentMainRowData) {
        mainRecordIdToUpdate = currentMainRowData.id;
        currentGlucoseData = currentMainRowData.glucose_data || [];
        if (Array.isArray(currentMainRowData.entered_by)) {
          mainRecordEnteredBy = [...currentMainRowData.entered_by];
        } else if (typeof currentMainRowData.entered_by === "string" && currentMainRowData.entered_by) {
          mainRecordEnteredBy = [currentMainRowData.entered_by]; 
        }
      }

      currentGlucoseData.push(newReadingEntry);

      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      const updatePayload: Partial<GlucoseReadingsRow> = {
        glucose_data: currentGlucoseData,
        entered_by: mainRecordEnteredBy,
        timestamp: new Date().toISOString(), 
      };

      if (mainRecordIdToUpdate) {
        const { error } = await supabase
          .from("glucose_readings")
          .update(updatePayload)
          .eq("id", mainRecordIdToUpdate);

        if (error) {
          console.error("Error updating glucose readings:", error.message);
          toast.error("Error updating glucose readings. Please try again.");
        } else {
          toast.success("Glucose reading added successfully!");
          reset(); 
          await fetchGlucoseDataRow(); 
        }
      } else {
        const newMainRowPayload: Omit<GlucoseReadingsRow, "id" | "created_at" | "deleted_data" | "updated_at"> = {
          ipd_id: Number(ipdId),
          uhid: uhid,
          glucose_data: currentGlucoseData,
          entered_by: mainRecordEnteredBy,
          timestamp: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("glucose_readings")
          .insert(newMainRowPayload);

        if (error) {
          console.error("Error inserting new glucose readings row:", error.message);
          toast.error("Error inserting new glucose readings row. Please try again.");
        } else {
          toast.success("Glucose reading added successfully!");
          reset();
          await fetchGlucoseDataRow(); 
        }
      }
    } catch (error: any) {
      console.error("An unexpected error occurred:", error.message);
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };


  // --- Delete Logic (Soft Delete an Individual Glucose Reading Entry) ---
  const handleDeleteReading = useCallback(async (tempIdToDelete: string) => {
    if (!window.confirm("Are you sure you want to delete this glucose reading?")) {
      return;
    }

    if (!glucoseDataRow) {
      toast.error("No glucose data found to delete from.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      const updatedGlucoseData = (glucoseDataRow.glucose_data || []).map(reading => {
        if (reading.tempId === tempIdToDelete) {
          return {
            ...reading,
            deletedBy: currentUserEmail,
            deletedAt: new Date().toISOString(),
          };
        }
        return reading;
      });

      let mainRecordEnteredBy: string[] = [];
      if (Array.isArray(glucoseDataRow.entered_by)) {
        mainRecordEnteredBy = [...glucoseDataRow.entered_by];
      } else if (typeof glucoseDataRow.entered_by === "string" && glucoseDataRow.entered_by) {
        mainRecordEnteredBy = [glucoseDataRow.entered_by];
      }
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      const { error } = await supabase
        .from("glucose_readings")
        .update({
          glucose_data: updatedGlucoseData,
          entered_by: mainRecordEnteredBy, 
          timestamp: new Date().toISOString(), 
        })
        .eq("id", glucoseDataRow.id); 

      if (error) {
        console.error("Error soft-deleting glucose reading:", error.message);
        toast.error("Failed to delete glucose reading. Please try again.");
      } else {
        toast.success("Glucose reading marked as deleted!");
        await fetchGlucoseDataRow(); 
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during deletion:", error.message);
      toast.error("An unexpected error occurred during deletion.");
    }
  }, [glucoseDataRow, fetchGlucoseDataRow]);


  // --- Memoized Data for UI Rendering ---
  // Filters out deleted readings and sorts them for display
  const displayGlucoseReadings = useMemo(() => {
    if (!glucoseDataRow || !glucoseDataRow.glucose_data) return [];
    
    return glucoseDataRow.glucose_data
      .filter(reading => !reading.deletedBy) 
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [glucoseDataRow]);

  // Filters for only deleted readings for the history popup
  const deletedGlucoseReadings = useMemo(() => {
    if (!glucoseDataRow || !glucoseDataRow.glucose_data) return [];
    
    return glucoseDataRow.glucose_data
      .filter(reading => reading.deletedBy) // Only show soft-deleted readings
      .sort((a, b) => new Date(a.deletedAt || '').getTime() - new Date(b.deletedAt || '').getTime());
  }, [glucoseDataRow]);


  // --- Component UI ---
  return (
    <div className="space-y-6">
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <div className="flex justify-between items-center"> {/* Added flex container */}
            <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-blue-600" />
              Add New Glucose Reading
            </CardTitle>
            {deletedGlucoseReadings.length > 0 && (
              <Dialog open={showDeletedHistory} onOpenChange={setShowDeletedHistory}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    aria-label="View deleted history"
                  >
                    <History className="h-4 w-4" /> {/* History icon */}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto"> {/* Increased max-width */}
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-gray-600" /> Deleted Glucose Readings History
                    </DialogTitle>
                    <DialogDescription>
                      View readings that were previously deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {deletedGlucoseReadings.length === 0 ? (
                      <p className="text-center text-gray-500">No deleted readings found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Blood Sugar</TableHead>
                            <TableHead>Urine Sugar/Ketone</TableHead>
                            <TableHead>Deleted By</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead>Original Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedGlucoseReadings.map((reading, index) => (
                            <TableRow key={reading.tempId}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{reading.bloodSugar}</TableCell>
                              <TableCell>{reading.urineSugarKetone}</TableCell>
                              <TableCell>{reading.deletedBy || 'N/A'}</TableCell>
                              <TableCell>
                                {reading.deletedAt ? format(new Date(reading.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
                              </TableCell>
                              <TableCell>
                                {format(new Date(reading.timestamp), "MMM dd, yyyy hh:mm a")}
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
              <label htmlFor="bloodSugar" className="block text-sm font-medium text-slate-700 mb-1">
                Blood Sugar (mg/dL)
              </label>
              <Input
                id="bloodSugar"
                type="text"
                {...register("bloodSugar", { required: true })}
                placeholder="Enter blood sugar level"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="urineSugarKetone" className="block text-sm font-medium text-slate-700 mb-1">
                Urine Sugar/Ketone
              </label>
              <Input
                id="urineSugarKetone"
                type="text"
                {...register("urineSugarKetone", { required: true })}
                placeholder="Enter urine sugar/ketone reading"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="medication" className="block text-sm font-medium text-slate-700 mb-1">
                Medication
              </label>
              <Input
                id="medication"
                type="text"
                {...register("medication")}
                placeholder="Enter medication"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="dose" className="block text-sm font-medium text-slate-700 mb-1">
                Dose
              </label>
              <Input
                id="dose"
                type="text"
                {...register("dose")}
                placeholder="Enter dose details"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="orderedBy" className="block text-sm font-medium text-slate-700 mb-1">
                Ordered By
              </label>
              <Input
                id="orderedBy"
                type="text"
                {...register("orderedBy")}
                placeholder="Enter who ordered"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="staffOrNurse" className="block text-sm font-medium text-slate-700 mb-1">
                Staff/Nurse
              </label>
              <Input
                id="staffOrNurse"
                type="text"
                {...register("staffOrNurse")}
                placeholder="Enter staff or nurse name"
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
                  <UserCheck className="h-4 w-4 mr-2" /> Save Reading
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-green-600" />
            All Glucose Readings
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
            <p className="ml-4 text-lg text-gray-600">Loading glucose readings...</p>
          </div>
        ) : displayGlucoseReadings.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Stethoscope className="h-16 w-16 text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No glucose readings recorded yet.</h3>
            <p className="text-slate-500">Add a new reading using the form above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-md bg-white">
            <Table className="w-full text-sm">
              <thead>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">#</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Blood Sugar</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Urine Sugar/Ketone</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Medication</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Dose</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Ordered By</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Staff/Nurse</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Entered By</TableHead>
                  <TableHead className="px-3 py-2 text-left font-semibold text-slate-600">Date/Time</TableHead>
                  <TableHead className="px-3 py-2 text-right font-semibold text-slate-600">Actions</TableHead>
                </TableRow>
              </thead>
              <TableBody className="divide-y divide-slate-100">
                {displayGlucoseReadings.map((reading, idx) => (
                  <TableRow key={reading.tempId} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="px-3 py-2">{idx + 1}</TableCell>
                    <TableCell className="px-3 py-2">{reading.bloodSugar}</TableCell>
                    <TableCell className="px-3 py-2">{reading.urineSugarKetone}</TableCell>
                    <TableCell className="px-3 py-2">{reading.medication || "N/A"}</TableCell>
                    <TableCell className="px-3 py-2">{reading.dose || "N/A"}</TableCell>
                    <TableCell className="px-3 py-2">{reading.orderedBy || "N/A"}</TableCell>
                    <TableCell className="px-3 py-2">{reading.staffOrNurse || "N/A"}</TableCell>
                    <TableCell className="px-3 py-2">{reading.enteredBy}</TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center text-xs text-slate-600">
                        <Calendar className="h-3 w-3 mr-1 text-slate-500" />
                        {format(new Date(reading.timestamp), "MMM dd, yyyy hh:mm a")}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteReading(reading.tempId)}
                        className="px-2 py-1 text-xs"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}