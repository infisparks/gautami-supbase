// app/ipd/manage/[ipdId]/clinicnote.tsx
"use client";

import type React from "react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useForm, type SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase"; // Assuming your Supabase client setup
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope,
  FileText,
  Heart,
  Pill,
  Brain,
  Bone,
  ClipboardList,
  Mic,
  MicOff,
  Save,
  Users,
  Activity,
  Clock,
  TreesIcon as Lungs, // Still aliasing for consistency with your original code
} from "lucide-react";
import {
  PersonIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { toast } from "sonner"; // Using sonner for toasts

// --- Define Web Speech API interfaces if not globally available (common in TypeScript) ---
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

// --- End Web Speech API interfaces ---

// Supabase table schema for clinic_notes
interface ClinicNoteSupabase {
  id?: string; // UUID from Supabase, optional for insert
  ipd_id: number;
  uhid: string;
  main_complaints_and_duration?: string | null;
  past_history?: string | null;
  family_social_history?: string | null;
  general_physical_examination?: string | null;
  systemic_cardiovascular?: string | null;
  systemic_respiratory?: string | null;
  systemic_per_abdomen?: string | null;
  systemic_neurology?: string | null;
  systemic_skeletal?: string | null;
  systemic_other?: string | null;
  summary?: string | null;
  provisional_diagnosis?: string | null;
  additional_notes?: string | null;
  entered_by?: string[] | null; // CHANGED: Now an array of strings
  timestamp?: string | null; // ISO string
  created_at?: string | null; // ISO string
}

// Form inputs, omitting auto-generated/admin fields for React Hook Form
type ClinicNoteFormInputs = Omit<
  ClinicNoteSupabase,
  "id" | "ipd_id" | "uhid" | "entered_by" | "timestamp" | "created_at"
>;

export default function ClinicNotePage() {
  const { ipdId } = useParams<{ ipdId: string }>(); // Get ipdId from URL params

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<ClinicNoteFormInputs>({
    defaultValues: {
      main_complaints_and_duration: "",
      past_history: "",
      family_social_history: "",
      general_physical_examination: "",
      systemic_cardiovascular: "",
      systemic_respiratory: "",
      systemic_per_abdomen: "",
      systemic_neurology: "",
      systemic_skeletal: "",
      systemic_other: "",
      summary: "",
      provisional_diagnosis: "",
      additional_notes: "",
    },
  });

  const [loading, setLoading] = useState(true);
  const [activeField, setActiveField] =
    useState<keyof ClinicNoteFormInputs | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("complaints");
  const [enteredByUsers, setEnteredByUsers] = useState<string[] | null>(null); // State to display the list of users
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Fetch existing clinic note (if any) from Supabase
  const fetchClinicNote = useCallback(async () => {
    if (!ipdId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch the clinic note using the ipd_id (which is unique in your schema)
      const { data, error } = await supabase
        .from("clinic_notes")
        .select("*")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (error && error.code !== "PGRST116") { // PGRST116 means "No rows found"
        console.error("Error fetching clinic note:", error.message);
        toast.error("Failed to load clinic note.");
      } else if (data) {
        // Pre-populate the form with existing data.
        reset({
          main_complaints_and_duration: data.main_complaints_and_duration || "",
          past_history: data.past_history || "",
          family_social_history: data.family_social_history || "",
          general_physical_examination: data.general_physical_examination || "",
          systemic_cardiovascular: data.systemic_cardiovascular || "",
          systemic_respiratory: data.systemic_respiratory || "",
          systemic_per_abdomen: data.systemic_per_abdomen || "",
          systemic_neurology: data.systemic_neurology || "",
          systemic_skeletal: data.systemic_skeletal || "",
          systemic_other: data.systemic_other || "",
          summary: data.summary || "",
          provisional_diagnosis: data.provisional_diagnosis || "",
          additional_notes: data.additional_notes || "",
        });
        if (data.timestamp) {
          setLastUpdated(new Date(data.timestamp).toLocaleString());
        }
        // Handle entered_by: ensure it's an array for state
        if (data.entered_by) {
          if (Array.isArray(data.entered_by)) {
            setEnteredByUsers(data.entered_by);
          } else if (typeof data.entered_by === 'string') {
            // Handle case where it might be a single string from a previous schema
            setEnteredByUsers([data.entered_by]);
          }
        } else {
          setEnteredByUsers(null);
        }
      } else {
        // If no data found, reset enteredByUsers as well
        setEnteredByUsers(null);
      }
    } catch (error: any) {
      console.error("An unexpected error occurred:", error.message);
      toast.error("An unexpected error occurred while loading data.");
    } finally {
      setLoading(false);
    }
  }, [ipdId, reset]);

  useEffect(() => {
    fetchClinicNote();
  }, [fetchClinicNote]);

  // Submit handler saves or updates the clinic note in Supabase
  const onSubmit: SubmitHandler<ClinicNoteFormInputs> = async (formData) => {
    try {
      // First, get UHID from ipd_registration based on ipd_id for insertion
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("uhid")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (ipdError || !ipdData) {
        toast.error("Could not find patient's UHID. Cannot save clinic note.");
        console.error("Error fetching UHID for save:", ipdError?.message);
        return;
      }

      const uhid = ipdData.uhid;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Fetch the current clinic note to get the existing entered_by array
      const { data: existingNote, error: fetchError } = await supabase
        .from("clinic_notes")
        .select("entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();

      let updatedEnteredBy: string[] = [];

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("Error fetching existing entered_by for update:", fetchError.message);
        toast.error("Failed to fetch existing user data for update.");
        return;
      }

      if (existingNote?.entered_by) {
        if (Array.isArray(existingNote.entered_by)) {
            updatedEnteredBy = [...existingNote.entered_by];
        } else if (typeof existingNote.entered_by === 'string') {
            // Handle legacy single string entry, convert to array
            updatedEnteredBy = [existingNote.entered_by];
        }
      }

      // Add current user's email if not already present
      if (!updatedEnteredBy.includes(currentUserEmail)) {
        updatedEnteredBy.push(currentUserEmail);
      }

      const clinicNoteData: ClinicNoteSupabase = {
        ipd_id: Number(ipdId),
        uhid: uhid,
        ...formData, // All fields from the form
        entered_by: updatedEnteredBy, // Use the updated array
        timestamp: new Date().toISOString(), // Update timestamp on save
      };

      // Use upsert to insert if no record exists (based on ipd_id unique constraint), or update if one does
      const { error } = await supabase
        .from("clinic_notes")
        .upsert(clinicNoteData, { onConflict: "ipd_id" }); // Specify conflict key for upsert

      if (error) {
        console.error("Error updating clinic note:", error.message);
        throw error;
      }

      setLastUpdated(new Date().toLocaleString());
      setEnteredByUsers(updatedEnteredBy); // Update the state for display
      toast.success("Clinic note updated successfully!");
    } catch (error: any) {
      console.error("Error updating clinic note:", error.message);
      toast.error("Error updating clinic note. Please try again.");
    }
  };

  // Voice transcription functionality (remains the same)
  const startRecording = (field: keyof ClinicNoteFormInputs) => {
    // Ensure any previous recognition is stopped before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setActiveField(field);
    setIsRecording(true);

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          const currentValue = watch(field) || "";
          setValue(
            field,
            (currentValue ? currentValue + " " : "") + finalTranscript.trim(),
            { shouldDirty: true }
          );
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error, event.message);
        toast.error(`Speech recognition error: ${event.error}`);
        setIsRecording(false);
        setActiveField(null);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        if (isRecording && activeField === field) {
          setIsRecording(false);
          setActiveField(null);
          recognitionRef.current = null;
        }
      };

      try {
        recognition.start();
        console.log("Speech recognition started for field:", field);
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast.error("Could not start voice recording. Check permissions.");
        setIsRecording(false);
        setActiveField(null);
        recognitionRef.current = null;
      }
    } else {
      toast.error("Speech recognition is not supported in your browser.");
      setIsRecording(false);
      setActiveField(null);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log("Speech recognition stopped by user.");
      } catch (e) {
        console.error("Error stopping speech recognition:", e);
      }
    }
    setIsRecording(false);
    setActiveField(null);
    recognitionRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        console.log("Stopping recognition on component unmount.");
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-teal-700 font-medium">Loading clinic note...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-0 rounded-lg">
      <Card className="max-w-5xl mx-auto shadow-none border-none">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-t-lg p-4 md:p-6 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Clinic Note
              </CardTitle>
              <CardDescription className="text-teal-100 mt-1">
                IPD ID: {ipdId}
              </CardDescription>
            </div>
            {lastUpdated && (
              <Badge
                variant="outline"
                className="bg-white/10 text-white border-none flex items-center gap-1"
              >
                <Clock className="h-3 w-3" />
                Last updated: {lastUpdated}
              </Badge>
            )}
          </div>
          {enteredByUsers && enteredByUsers.length > 0 && (
            <div className="mt-2 text-sm text-teal-100">
              Edited by: {enteredByUsers.join(", ")}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Tabs
            defaultValue="complaints"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="border-b">
              <ScrollArea className="w-full whitespace-nowrap">
                <TabsList className="bg-transparent h-14 px-4">
                  <TabsTrigger
                    value="complaints"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                    Complaints
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <PersonIcon className="h-4 w-4 mr-2" />
                    History
                  </TabsTrigger>
                  <TabsTrigger
                    value="examination"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Examination
                  </TabsTrigger>
                  <TabsTrigger
                    value="systemic"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    Systemic
                  </TabsTrigger>
                  <TabsTrigger
                    value="diagnosis"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Diagnosis
                  </TabsTrigger>
                </TabsList>
              </ScrollArea>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              <TabsContent value="complaints" className="mt-0">
                <TextareaWithVoice
                  label="Main Complaints & Duration"
                  icon={
                    <ExclamationTriangleIcon className="h-5 w-5 text-teal-600" />
                  }
                  field="main_complaints_and_duration"
                  register={register}
                  isRecording={
                    isRecording &&
                    activeField === "main_complaints_and_duration"
                  }
                  startRecording={() =>
                    startRecording("main_complaints_and_duration")
                  }
                  stopRecording={stopRecording}
                  placeholder="Enter patient's main complaints and their duration..."
                />
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <TextareaWithVoice
                  label="Past History"
                  icon={<Clock className="h-5 w-5 text-teal-600" />}
                  field="past_history"
                  register={register}
                  isRecording={isRecording && activeField === "past_history"}
                  startRecording={() => startRecording("past_history")}
                  stopRecording={stopRecording}
                  placeholder="Enter patient's past medical history..."
                />

                <TextareaWithVoice
                  label="Family & Social History"
                  icon={<Users className="h-5 w-5 text-teal-600" />}
                  field="family_social_history"
                  register={register}
                  isRecording={
                    isRecording && activeField === "family_social_history"
                  }
                  startRecording={() => startRecording("family_social_history")}
                  stopRecording={stopRecording}
                  placeholder="Enter patient's family and social history..."
                />
              </TabsContent>

              <TabsContent value="examination" className="mt-0">
                <TextareaWithVoice
                  label="General Physical Examination"
                  icon={
                    <Stethoscope className="h-5 w-5 text-teal-600" />
                  }
                  field="general_physical_examination"
                  register={register}
                  isRecording={
                    isRecording &&
                    activeField === "general_physical_examination"
                  }
                  startRecording={() =>
                    startRecording("general_physical_examination")
                  }
                  stopRecording={stopRecording}
                  placeholder="Enter general physical examination findings..."
                />
              </TabsContent>

              <TabsContent value="systemic" className="mt-0">
                <TextareaWithVoice
                  label="Cardiovascular System"
                  icon={<Heart className="h-5 w-5 text-teal-600" />}
                  field="systemic_cardiovascular"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemic_cardiovascular"
                  }
                  startRecording={() =>
                    startRecording("systemic_cardiovascular")
                  }
                  stopRecording={stopRecording}
                  placeholder="Enter cardiovascular examination findings..."
                />

                <TextareaWithVoice
                  label="Respiratory System"
                  icon={<Lungs className="h-5 w-5 text-teal-600" />}
                  field="systemic_respiratory"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemic_respiratory"
                  }
                  startRecording={() => startRecording("systemic_respiratory")}
                  stopRecording={stopRecording}
                  placeholder="Enter respiratory examination findings..."
                />

                <TextareaWithVoice
                  label="Per Abdomen"
                  icon={<Pill className="h-5 w-5 text-teal-600" />}
                  field="systemic_per_abdomen"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemic_per_abdomen"
                  }
                  startRecording={() => startRecording("systemic_per_abdomen")}
                  stopRecording={stopRecording}
                  placeholder="Enter per abdomen examination findings..."
                />

                <TextareaWithVoice
                  label="Neurological System"
                  icon={<Brain className="h-5 w-5 text-teal-600" />}
                  field="systemic_neurology"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemic_neurology"
                  }
                  startRecording={() => startRecording("systemic_neurology")}
                  stopRecording={stopRecording}
                  placeholder="Enter neurological examination findings..."
                />

                <TextareaWithVoice
                  label="Skeletal System"
                  icon={<Bone className="h-5 w-5 text-teal-600" />}
                  field="systemic_skeletal"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemic_skeletal"
                  }
                  startRecording={() => startRecording("systemic_skeletal")}
                  stopRecording={stopRecording}
                  placeholder="Enter skeletal examination findings..."
                />

                <TextareaWithVoice
                  label="Other Systems"
                  icon={<PlusIcon className="h-5 w-5 text-teal-600" />}
                  field="systemic_other"
                  register={register}
                  isRecording={isRecording && activeField === "systemic_other"}
                  startRecording={() => startRecording("systemic_other")}
                  stopRecording={stopRecording}
                  placeholder="Enter other systemic examination findings..."
                />
              </TabsContent>

              <TabsContent value="diagnosis" className="mt-0">
                <TextareaWithVoice
                  label="Summary"
                  icon={<ClipboardList className="h-5 w-5 text-teal-600" />}
                  field="summary"
                  register={register}
                  isRecording={isRecording && activeField === "summary"}
                  startRecording={() => startRecording("summary")}
                  stopRecording={stopRecording}
                  placeholder="Enter summary of findings..."
                />

                <TextareaWithVoice
                  label="Provisional Diagnosis"
                  icon={<Stethoscope className="h-5 w-5 text-teal-600" />}
                  field="provisional_diagnosis"
                  register={register}
                  isRecording={
                    isRecording && activeField === "provisional_diagnosis"
                  }
                  startRecording={() => startRecording("provisional_diagnosis")}
                  stopRecording={stopRecording}
                  placeholder="Enter provisional diagnosis..."
                />

                <TextareaWithVoice
                  label="Additional Notes"
                  icon={<FileText className="h-5 w-5 text-teal-600" />}
                  field="additional_notes"
                  register={register}
                  isRecording={
                    isRecording && activeField === "additional_notes"
                  }
                  startRecording={() => startRecording("additional_notes")}
                  stopRecording={stopRecording}
                  placeholder="Enter any additional notes..."
                />
              </TabsContent>

              <div className="mt-8 flex justify-end">
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white px-6"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Clinic Note
                </Button>
              </div>
            </form>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// TextareaWithVoice component (remains the same as before)
interface TextareaWithVoiceProps {
  label: string;
  icon: React.ReactNode;
  field: keyof ClinicNoteFormInputs;
  register: any; // Use UseFormRegisterReturn type from react-hook-form if possible for better type safety
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  placeholder: string;
}

function TextareaWithVoice({
  label,
  icon,
  field,
  register,
  isRecording,
  startRecording,
  stopRecording,
  placeholder,
}: TextareaWithVoiceProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center text-sm font-medium text-teal-800 gap-1.5">
          {icon}
          {label}
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={isRecording ? "destructive" : "outline"}
                className={`h-8 w-[140px] ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "border-teal-200 text-teal-700 hover:bg-teal-100"
                }`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4 mr-1 flex-shrink-0" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-1 flex-shrink-0" />
                    Voice Input
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRecording
                ? `Stop voice recording for ${label}`
                : `Start voice recording for ${label}`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div
        className={`relative ${
          isRecording ? "ring-2 ring-red-500 rounded-md" : ""
        }`}
      >
        <Textarea
          {...register(field)}
          placeholder={placeholder}
          className={`min-h-[120px] border-teal-200 focus:border-teal-500 focus:ring-teal-500 pr-10 ${
            isRecording
              ? "border-red-500 focus:border-red-600 focus:ring-red-600"
              : ""
          }`}
        />
        {isRecording && (
          <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-none">
            <span className="animate-pulse h-2 w-2 bg-red-500 rounded-full"></span>
            <span
              className="animate-pulse h-2 w-2 bg-red-500 rounded-full"
              style={{ animationDelay: "0.2s" }}
            ></span>
            <span
              className="animate-pulse h-2 w-2 bg-red-500 rounded-full"
              style={{ animationDelay: "0.4s" }}
            ></span>
          </div>
        )}
      </div>
    </div>
  );
}