// app/ipd/manage/[ipdId]/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase"; // Your Supabase client
import { toast } from "sonner"; // For toasts

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Phone, Building, Bed, User, RefreshCw } from "lucide-react";

// Import your components
import ClinicNote from "./ClinicNoteTab"; 
import DoctorVisits from "./DoctorVisitsTab";
import GlucoseMonitoring from "./GlucoseMonitoringTab"; 
import InvestigationSheet from "./InvestigationSheetTab"; 
import NurseNoteComponent from "./NurseNoteTab"; 
import VitalObservations from "./Vitalobservation"; 
import ProgressNotes from "./ProgressNotesTab"; 
import PatientAdmissionAssessment from "./PatientAdmissionAssessment"; 
import PatientCharges from "./Chargesheet"; // Correct import for PatientCharges
import DrugChartPage from "./DrugChartTab"; // <-- NEW IMPORT for DrugChartPage

type TabValue =
  | "charge"
  | "glucose"
  | "admission"
  | "investigation"
  | "clinic"
  | "progress"
  | "nurse"
  | "vital"
  | "doctor"
  | "drug-chart"; // <-- NEW TAB VALUE

interface PatientInfo {
  name: string;
  phone: string;
  roomType: string;
  bedNumber: number | string;
  uhid: string;
}

// --- NEW INTERFACES FOR SUPABASE JOINED DATA (Refined for precise typing) ---
interface PatientDetailRow {
  name: string;
  number: number;
}

interface BedManagementRow {
  room_type: string;
  bed_number: number;
}

interface IpdRegistrationJoinedResult {
  uhid: string;
  patient_detail: PatientDetailRow | null; 
  bed_management: BedManagementRow | null; 
}
// --- END NEW INTERFACES ---

export default function ManagePatientPageTabs() {
  const router = useRouter();
  const { ipdId } = useParams<{ ipdId: string }>();

  // Set default to "drug-chart" for testing convenience
  const [activeTab, setActiveTab] = useState<TabValue>("drug-chart"); 
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* ---------- fetch patient header data from Supabase ---------- */
  const fetchPatientData = useCallback(async () => {
    if (!ipdId) return;

    setIsRefreshing(true);
    try {
      // Explicitly type the data returned from the select query
      const { data, error } = await supabase
        .from("ipd_registration")
        .select<string, IpdRegistrationJoinedResult>( 
          `
          uhid,
          patient_detail (name, number),
          bed_management (room_type, bed_number)
          `
        )
        .eq("ipd_id", Number(ipdId))
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("IPD record not found.");
        } else {
          console.error("Error fetching patient IPD record:", error.message);
          toast.error("Failed to load patient header data.");
        }
        setPatientInfo(null);
        return;
      }

      if (data) {
        const patientDetail = data.patient_detail;
        const bedManagement = data.bed_management;

        setPatientInfo({
          name: patientDetail?.name || "Patient Name N/A",
          phone: patientDetail?.number ? String(patientDetail.number) : "N/A",
          roomType: bedManagement?.room_type || "N/A",
          bedNumber: bedManagement?.bed_number || "N/A",
          uhid: data.uhid || "N/A",
        });
      } else {
        setPatientInfo(null);
      }
    } catch (err: any) {
      console.error("An unexpected error occurred:", err.message);
      toast.error("An unexpected error occurred while loading patient data.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [ipdId]);

  useEffect(() => {
    fetchPatientData();
  }, [fetchPatientData]);

  /* ---------- tab metadata ---------- */
  const tabs = [
    { value: "charge", label: "Charges" },
    { value: "glucose", label: "Glucose" },
    { value: "admission", label: "Admission" }, 
    { value: "investigation", label: "Investigation" }, 
    { value: "clinic", label: "Clinic" },
    { value: "progress", label: "Progress" }, 
    { value: "nurse", label: "Nurse" }, 
    { value: "vital", label: "Vitals" },
    { value: "doctor", label: "Doctor" },
    { value: "drug-chart", label: "Drug Chart" }, // <-- NEW TAB ENTRY
  ];

  const handleGoBack = () => {
    router.back();
  };

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-4 md:py-6">
        {/* Back and Add Discharge Summary buttons */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            className="text-slate-600 hover:text-slate-900 -ml-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              toast.info("Discharge Summary feature not yet linked to specific patient UHID/ID in this example.");
            }}
          >
            Add Discharge Summary
          </Button>
        </div>

        {/* Patient header */}
        {isLoading ? (
          <div className="h-24 animate-pulse bg-slate-200 rounded-lg mb-6"></div>
        ) : patientInfo ? (
          <Card className="mb-6 overflow-hidden border-none shadow-md">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 md:p-6">
              <div className="flex items-center">
                <div className="bg-white/20 p-2 rounded-full mr-4">
                  <User className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white capitalize">
                    {patientInfo.name}
                  </h1>
                  <p className="text-white/90 text-sm">UHID: {patientInfo.uhid}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {patientInfo.phone && (
                      <div className="flex items-center text-white/90 text-sm">
                        <Phone className="h-3 w-3 mr-1" />
                        {patientInfo.phone}
                      </div>
                    )}
                    {patientInfo.roomType && (
                      <div className="flex items-center text-white/90 text-sm capitalize">
                        <Building className="h-3 w-3 mr-1" />
                        {patientInfo.roomType}
                      </div>
                    )}
                    {patientInfo.bedNumber && (
                      <div className="flex items-center text-white/90 text-sm">
                        <Bed className="h-3 w-3 mr-1" />
                        Bed: {patientInfo.bedNumber}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  onClick={fetchPatientData}
                  disabled={isRefreshing}
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                >
                  <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span className="sr-only">Refresh Patient Info</span>
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="text-center py-6">
            <p className="text-lg text-gray-600">Patient information not available.</p>
          </div>
        )}

        {/* tabs */}
        <Card className="shadow-md border-none overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
            {/* tab bar */}
            <div className="relative px-4 pt-4 pb-2 bg-white border-b">
              <div className="overflow-x-auto scrollbar-hide pb-1">
                <TabsList className="flex space-x-1 whitespace-nowrap bg-slate-100/80 rounded-lg p-1">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className={`px-3 py-1.5 text-xs sm:text-sm flex-shrink-0 rounded-md transition-all duration-200 ${
                        activeTab === t.value
                          ? "bg-white shadow-sm text-blue-700 font-medium"
                          : "text-slate-700 hover:bg-slate-200/50"
                      }`}
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            {/* tab panels */}
            <div className="p-4 md:p-6 bg-white">
              <TabsContent value="charge" className="mt-0">
                <PatientCharges /> 
              </TabsContent>
              <TabsContent value="glucose" className="mt-0">
                <GlucoseMonitoring /> 
              </TabsContent>
              <TabsContent value="admission" className="mt-0">
                <PatientAdmissionAssessment /> 
              </TabsContent>
              <TabsContent value="investigation" className="mt-0">
                <InvestigationSheet /> 
              </TabsContent>
              <TabsContent value="clinic" className="mt-0">
                <ClinicNote />
              </TabsContent>
              <TabsContent value="vital" className="mt-0">
                <VitalObservations /> 
              </TabsContent>
              <TabsContent value="progress" className="mt-0">
                <ProgressNotes /> 
              </TabsContent>
              <TabsContent value="nurse" className="mt-0">
                <NurseNoteComponent /> 
              </TabsContent>
              <TabsContent value="doctor" className="mt-0">
                <DoctorVisits />
              </TabsContent>
              <TabsContent value="drug-chart" className="mt-0">
                <DrugChartPage /> {/* <-- Render DrugChartPage component here */}
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}