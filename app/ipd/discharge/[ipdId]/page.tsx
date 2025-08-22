"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Save,
  UserCheck,
  FileText,
  Calendar,
  User,
  Phone,
  MapPin,
  Bed,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  XCircle,
  Edit,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import "react-toastify/dist/ReactToastify.css";

// Interface for discharge summary data stored in Supabase
interface DischargeSummarySupabase {
  id?: string;
  ipd_id: number;
  patient_id: string;
  uhid: string;
  final_diagnosis: string | null;
  procedures: string | null;
  provisional_diagnosis: string | null;
  history_of_present_illness: string | null;
  investigations: string | null;
  treatment_given: string | null;
  hospital_course: string | null;
  surgery_procedure_details: string | null;
  condition_at_discharge: string | null;
  discharge_medication: string | null;
  follow_up: string | null;
  discharge_instructions: string | null;
  last_updated: string | null;
  discharge_type?: string | null;
}

// Interface for the form state (camelCase for React usage)
interface DischargeDataForm {
  finalDiagnosis: string;
  procedures: string;
  provisionalDiagnosis: string;
  historyOfPresentIllness: string;
  investigations: string;
  treatmentGiven: string;
  hospitalCourse: string;
  surgeryProcedureDetails: string;
  conditionAtDischarge: string;
  dischargeMedication: string;
  followUp: string;
  dischargeInstructions: string;
}

// Patient record interface, now fetched from ipd_registration + patient_detail + bed_management
interface PatientRecord {
  patientId: string;
  uhid: string;
  ipdId: string;
  name: string;
  mobileNumber: string;
  address?: string;
  age?: number | null;
  gender?: string | null;
  relativeName?: string | null;
  relativePhone?: number | null;
  relativeAddress?: string | null;
  roomType?: string | null;
  bedNumber?: number | null;
  bedId?: number | null;
  admitDate?: string | null;
  dischargeDate?: string | null;
  currentDischargeType?: string | null;
  billno?: string | null; // Added bill number field
}

// Define discharge types
const DISCHARGE_TYPES = {
  DISCHARGE: "Discharge",
  DISCHARGE_PARTIALLY: "Discharge Partially",
  DEATH: "Death",
};

export default function DischargeSummaryPage() {
  const { ipdId } = useParams() as { ipdId: string };
  const router = useRouter();

  /* State for basic IPD + patient info */
  const [patientRecord, setPatientRecord] = useState<PatientRecord | null>(null);

  /* State for our discharge-summary form */
  const [dischargeData, setDischargeData] = useState<DischargeDataForm>({
    finalDiagnosis: "",
    procedures: "",
    provisionalDiagnosis: "",
    historyOfPresentIllness: "",
    investigations: "",
    treatmentGiven: "",
    hospitalCourse: "",
    surgeryProcedureDetails: "",
    conditionAtDischarge: "",
    dischargeMedication: "",
    followUp: "",
    dischargeInstructions: "",
  });

  /* UI loading/saving flags */
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [showEditDischargeDateModal, setShowEditDischargeDateModal] = useState(false);
  const [editedDischargeDate, setEditedDischargeDate] = useState<string>("");

  /* Info about when the summary was last saved */
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  /* Refs for enabling Ctrl+B → **bold** in <textarea> */
  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Helper function to format room type
  const formatRoomType = (roomType: string | null) => {
    if (!roomType) return "N/A";
    const upperCaseTypes = ["icu", "nicu"];
    const lowerType = roomType.toLowerCase();
    if (upperCaseTypes.includes(lowerType)) {
      return roomType.toUpperCase();
    }
    return roomType.charAt(0).toUpperCase() + roomType.slice(1).toLowerCase();
  };

  /* ─── Fetch IPD and Patient Data ───────────────────────────────── */
  const fetchPatientAndIpdData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select(
          `
          ipd_id,
          admission_date,
          created_at,
          discharge_date,
          uhid,
          relative_name,
          relative_ph_no,
          relative_address,
          bed_id,
          billno,
          patient_detail (
            patient_id,
            name,
            number,
            age,
            gender,
            address
          ),
          bed_management (
            room_type,
            bed_number
          )
          `
        )
        .eq("ipd_id", ipdId)
        .single();

      if (ipdError) {
        console.error("Error fetching IPD data:", ipdError);
        toast.error("Failed to load IPD patient data.");
        setLoading(false);
        return;
      }

      const patientDetail = Array.isArray(ipdData.patient_detail) ? ipdData.patient_detail[0] : ipdData.patient_detail;
      const bedManagement = Array.isArray(ipdData.bed_management) ? ipdData.bed_management[0] : ipdData.bed_management;

      if (!ipdData || !patientDetail) {
        toast.error("Patient or IPD record not found.");
        setLoading(false);
        return;
      }

      const { data: summaryData, error: summaryError } = await supabase
        .from("discharge_summaries")
        .select("*")
        .eq("ipd_id", ipdId)
        .single();

      if (summaryError && summaryError.code !== 'PGRST116') {
        console.error("Error fetching discharge summary:", summaryError);
        toast.error("Failed to load existing discharge summary.");
      } else if (summaryData) {
        setDischargeData({
          finalDiagnosis: summaryData.final_diagnosis || "",
          procedures: summaryData.procedures || "",
          provisionalDiagnosis: summaryData.provisional_diagnosis || "",
          historyOfPresentIllness: summaryData.history_of_present_illness || "",
          investigations: summaryData.investigations || "",
          treatmentGiven: summaryData.treatment_given || "",
          hospitalCourse: summaryData.hospital_course || "",
          surgeryProcedureDetails: summaryData.surgery_procedure_details || "",
          conditionAtDischarge: summaryData.condition_at_discharge || "",
          dischargeMedication: summaryData.discharge_medication || "",
          followUp: summaryData.follow_up || "",
          dischargeInstructions: summaryData.discharge_instructions || "",
        });
        setLastSaved(summaryData.last_updated);
      }

      const patient: PatientRecord = {
        patientId: patientDetail.patient_id,
        uhid: ipdData.uhid,
        ipdId: String(ipdData.ipd_id),
        name: patientDetail.name,
        mobileNumber: String(patientDetail.number || ""),
        address: patientDetail.address,
        age: patientDetail.age,
        gender: patientDetail.gender,
        relativeName: ipdData.relative_name,
        relativePhone: ipdData.relative_ph_no,
        relativeAddress: ipdData.relative_address,
        roomType: bedManagement?.room_type || null,
        bedNumber: bedManagement?.bed_number || null,
        bedId: ipdData.bed_id,
        admitDate: ipdData.admission_date || ipdData.created_at,
        dischargeDate: ipdData.discharge_date,
        currentDischargeType: summaryData?.discharge_type || null,
        billno: ipdData.billno,
      };
      setPatientRecord(patient);

      // Initialize editedDischargeDate if dischargeDate exists
      if (ipdData.discharge_date) {
        // Parse the UTC date from Supabase, then format it to the local ISO string for input[type="datetime-local"]
        const dischargeDateObj = parseISO(ipdData.discharge_date);
        setEditedDischargeDate(format(dischargeDateObj, "yyyy-MM-dd'T'HH:mm"));
      }

    } catch (err) {
      console.error("Caught error in fetchPatientAndIpdData:", err);
      toast.error("An unexpected error occurred while loading patient data.");
    } finally {
      setLoading(false);
    }
  }, [ipdId]);

  useEffect(() => {
    if (ipdId) {
      fetchPatientAndIpdData();
    }
  }, [ipdId, fetchPatientAndIpdData]);

  /* ─── "Ctrl+B → **bold**" textarea helper ───────────────────────────────── */
  const makeBold = (
    field: keyof DischargeDataForm,
    ta: HTMLTextAreaElement
  ) => {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.substring(start, end);
    if (!sel) return;
    const newText =
      ta.value.substring(0, start) +
      "**" +
      sel +
      "**" +
      ta.value.substring(end);
    setDischargeData((d) => ({
      ...d,
      [field]: newText,
    }));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(
        start + sel.length + 4,
        start + sel.length + 4
      );
    }, 0);
  };

  const handleKey = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    fieldName: keyof DischargeDataForm
  ) => {
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      const ta = textRefs.current[fieldName];
      if (ta) {
        makeBold(fieldName, ta);
      }
    }
  };

  const handleChange = (fieldName: keyof DischargeDataForm, val: string) => {
    setDischargeData((d) => ({
      ...d,
      [fieldName]: val,
    }));
  };

  /* ─── "Save Draft" → write discharge summary into discharge_summaries table ─────────── */
  const saveDraft = async () => {
    if (!patientRecord) {
      toast.error("Patient record not loaded. Cannot save.");
      return;
    }
    setSaving(true);
    try {
      const nowUtc = new Date().toISOString();

      const payload: DischargeSummarySupabase = {
        ipd_id: parseInt(patientRecord.ipdId),
        patient_id: patientRecord.patientId,
        uhid: patientRecord.uhid,
        final_diagnosis: dischargeData.finalDiagnosis || null,
        procedures: dischargeData.procedures || null,
        provisional_diagnosis: dischargeData.provisionalDiagnosis || null,
        history_of_present_illness: dischargeData.historyOfPresentIllness || null,
        investigations: dischargeData.investigations || null,
        treatment_given: dischargeData.treatmentGiven || null,
        hospital_course: dischargeData.hospitalCourse || null,
        surgery_procedure_details: dischargeData.surgeryProcedureDetails || null,
        condition_at_discharge: dischargeData.conditionAtDischarge || null,
        discharge_medication: dischargeData.dischargeMedication || null,
        follow_up: dischargeData.followUp || null,
        discharge_instructions: dischargeData.dischargeInstructions || null,
        last_updated: nowUtc,
        discharge_type: patientRecord.currentDischargeType || null,
      };

      const { data: existingSummary, error: fetchError } = await supabase
        .from("discharge_summaries")
        .select("id")
        .eq("ipd_id", patientRecord.ipdId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existingSummary) {
        const { error: updateError } = await supabase
          .from("discharge_summaries")
          .update(payload)
          .eq("id", existingSummary.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("discharge_summaries")
          .insert(payload);
        if (insertError) throw insertError;
      }

      setLastSaved(nowUtc);
      toast.success("Discharge note saved!");
    } catch (err: any) {
      console.error("Save failed:", err);
      toast.error("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Bill Number Generation Function ─────────────────────────────────── */
  const generateBillNumber = async (): Promise<string> => {
    const today = new Date();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear().toString().slice(-2);
    const monthYear = `${month}/${year}`;

    const { data: counterData, error: counterError } = await supabase.rpc('increment_bill_counter', { month_year_param: monthYear });

    if (counterError) {
        console.error("Supabase RPC error:", counterError);
        throw new Error("Failed to get or increment bill counter.");
    }
    
    if (!counterData) {
      throw new Error("No counter data returned from RPC.");
    }

    const counter = counterData as number;

    const paddedCounter = counter.toString().padStart(4, '0');
    return `GMH/${month}/${paddedCounter}`;
  };

  /* ─── "Complete Discharge" → update discharge_date in ipd_registration, free bed, and save summary ─ */
  const finalDischarge = async (dischargeType: string) => {
    if (!patientRecord) {
      toast.error("Patient record not loaded. Cannot discharge.");
      return;
    }

    if (
      (dischargeType === DISCHARGE_TYPES.DISCHARGE || dischargeType === DISCHARGE_TYPES.DEATH) &&
      (!patientRecord.roomType || !patientRecord.bedNumber || !patientRecord.bedId)
    ) {
      toast.error("Missing bed/ward information for final discharge. Please ensure patient is assigned a bed.");
      return;
    }

    setLoading(true);
    setShowDischargeModal(false);
    try {
      const dischargeTimestampUtc = new Date().toISOString();
      let generatedBillNumber: string | null = null;

      if (dischargeType === DISCHARGE_TYPES.DISCHARGE || dischargeType === DISCHARGE_TYPES.DEATH) {
        try {
          generatedBillNumber = await generateBillNumber();
        } catch (billError: any) {
          console.error("Error generating bill number:", billError);
          toast.error("Failed to generate bill number. Discharge aborted.");
          setLoading(false);
          return;
        }
      }

      const ipdUpdatePayload: { discharge_date: string | null; billno?: string | null } = {
        discharge_date: (dischargeType === DISCHARGE_TYPES.DISCHARGE || dischargeType === DISCHARGE_TYPES.DEATH)
          ? dischargeTimestampUtc
          : null,
      };

      if (generatedBillNumber) {
        ipdUpdatePayload.billno = generatedBillNumber;
      }

      const { error: ipdUpdateError } = await supabase
        .from("ipd_registration")
        .update(ipdUpdatePayload)
        .eq("ipd_id", parseInt(patientRecord.ipdId));
      if (ipdUpdateError) throw ipdUpdateError;

      const payload: DischargeSummarySupabase = {
        ipd_id: parseInt(patientRecord.ipdId),
        patient_id: patientRecord.patientId,
        uhid: patientRecord.uhid,
        final_diagnosis: dischargeData.finalDiagnosis || null,
        procedures: dischargeData.procedures || null,
        provisional_diagnosis: dischargeData.provisionalDiagnosis || null,
        history_of_present_illness: dischargeData.historyOfPresentIllness || null,
        investigations: dischargeData.investigations || null,
        treatment_given: dischargeData.treatmentGiven || null,
        hospital_course: dischargeData.hospitalCourse || null,
        surgery_procedure_details: dischargeData.surgeryProcedureDetails || null,
        condition_at_discharge: dischargeData.conditionAtDischarge || null,
        discharge_medication: dischargeData.dischargeMedication || null,
        follow_up: dischargeData.followUp || null,
        discharge_instructions: dischargeData.dischargeInstructions || null,
        last_updated: dischargeTimestampUtc,
        discharge_type: dischargeType,
      };

      const { data: existingSummary, error: fetchError } = await supabase
        .from("discharge_summaries")
        .select("id")
        .eq("ipd_id", parseInt(patientRecord.ipdId))
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existingSummary) {
        const { error: updateError } = await supabase
          .from("discharge_summaries")
          .update(payload)
          .eq("id", existingSummary.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("discharge_summaries")
          .insert(payload);
        if (insertError) throw insertError;
      }

      if (patientRecord.bedId) {
        let newBedStatus: "available" | "occupied" | null = null;
        if (dischargeType === DISCHARGE_TYPES.DISCHARGE || dischargeType === DISCHARGE_TYPES.DEATH) {
          newBedStatus = "available";
        } else if (dischargeType === DISCHARGE_TYPES.DISCHARGE_PARTIALLY) {
          newBedStatus = "occupied";
        }

        if (newBedStatus) {
          const { error: bedUpdateError } = await supabase
            .from("bed_management")
            .update({ status: newBedStatus })
            .eq("id", patientRecord.bedId);
          if (bedUpdateError) throw bedUpdateError;
        } else {
          console.warn(`No specific bed status update defined for dischargeType: ${dischargeType}`);
        }
      } else {
        console.warn("Patient has no bed_id, cannot update bed status.");
      }

      toast.success(`Patient marked as ${dischargeType.toLowerCase()} successfully!`);

      setPatientRecord((prev) => ({
        ...prev!,
        dischargeDate: (dischargeType === DISCHARGE_TYPES.DISCHARGE || dischargeType === DISCHARGE_TYPES.DEATH)
          ? dischargeTimestampUtc
          : null,
        currentDischargeType: dischargeType,
        billno: generatedBillNumber,
      }));

      if (dischargeType === DISCHARGE_TYPES.DISCHARGE) {
        router.push(`/ipd/billing/${patientRecord.ipdId}`);
      } else {
        router.push(`/ipd/management`);
      }

    } catch (err: any) {
      console.error("Error during discharge process:", err);
      toast.error("Error during discharge: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Edit Discharge Date Function ───────────────────────── */
  const handleEditDischargeDate = async () => {
    if (!patientRecord || !editedDischargeDate) {
      toast.error("Patient record or edited date is missing.");
      return;
    }

    setSaving(true);
    try {
      const parsedDate = new Date(editedDischargeDate);
      if (isNaN(parsedDate.getTime())) {
        toast.error("Invalid date format.");
        setSaving(false);
        return;
      }

      const editedDateUtc = parsedDate.toISOString();

      const { error: ipdUpdateError } = await supabase
        .from("ipd_registration")
        .update({ discharge_date: editedDateUtc })
        .eq("ipd_id", parseInt(patientRecord.ipdId));

      if (ipdUpdateError) throw ipdUpdateError;

      const { data: existingSummary } = await supabase
        .from("discharge_summaries")
        .select("id")
        .eq("ipd_id", parseInt(patientRecord.ipdId))
        .single();

      if (existingSummary) {
        const { error: summaryUpdateError } = await supabase
          .from("discharge_summaries")
          .update({ last_updated: editedDateUtc })
          .eq("id", existingSummary.id);
        if (summaryUpdateError) console.error("Error updating last_updated in summary:", summaryUpdateError);
      }

      setPatientRecord((prev) => ({
        ...prev!,
        dischargeDate: editedDateUtc,
      }));
      toast.success("Discharge date updated successfully!");
      setShowEditDischargeDateModal(false);
    } catch (err: any) {
      console.error("Error updating discharge date:", err);
      toast.error("Failed to update discharge date: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Helper to render a single field with (Ctrl+B) hint ───────────────────── */
  const Field = (
    key: keyof DischargeDataForm,
    label: string,
    rows = 4,
    placeholder = "Type here…"
  ) => (
    <div className="space-y-2">
      <label htmlFor={key} className="block text-sm font-medium text-gray-700">
        {label}
        <span className="text-xs text-gray-500 ml-2">(Ctrl+B for bold)</span>
      </label>
      <textarea
        id={key}
        ref={(el) => {
          textRefs.current[key as string] = el;
        }}
        rows={rows}
        value={dischargeData[key] || ""}
        placeholder={placeholder}
        onKeyDown={(e) => handleKey(e, key)}
        onChange={(e) => handleChange(key, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y min-h-[50px] shadow-sm"
      />
    </div>
  );

  /* ─── Render Loading State ───────────────────────────────── */
  if (loading && !patientRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-teal-50">
        <div className="text-center">
          <RefreshCw className="h-16 w-16 text-teal-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Loading patient record...</p>
        </div>
      </div>
    );
  }

  if (!patientRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-teal-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <AlertTriangle className="h-20 w-20 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Patient Record Not Found</h2>
          <p className="text-gray-600 mb-6">The IPD record for ID "{ipdId}" could not be loaded. It may not exist or an error occurred.</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg shadow hover:bg-teal-700 transition-colors"
          >
            <ArrowLeft size={20} className="inline-block mr-2" /> Go Back
          </button>
        </div>
      </div>
    );
  }

  const canInitiateDischarge = !patientRecord.dischargeDate || patientRecord.currentDischargeType === DISCHARGE_TYPES.DISCHARGE_PARTIALLY;

  /* ─── Full JSX ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* ─── Header ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-teal-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <button
            onClick={() => router.push(`/ipd/billing/${patientRecord.ipdId}`)}
            className="flex items-center text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            <ArrowLeft size={18} className="mr-2" /> Back to Billing
          </button>

          <div className="flex items-center gap-4">
            {lastSaved && (
              <div className="flex items-center text-sm text-gray-500">
                <Clock size={14} className="mr-1" />
                Last saved:{" "}
                {format(parseISO(lastSaved), "MMM dd,yyyy 'at' HH:mm")}
              </div>
            )}

            {patientRecord.dischargeDate && patientRecord.currentDischargeType && (
              <button
                onClick={() => {
                  setShowEditDischargeDateModal(true);
                  if (patientRecord.dischargeDate) {
                    setEditedDischargeDate(format(parseISO(patientRecord.dischargeDate), "yyyy-MM-dd'T'HH:mm"));
                  }
                }}
                className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-sm hover:bg-gray-300 transition-colors"
                disabled={Boolean(loading || saving)}
              >
                <Edit size={16} className="mr-2" />
                Edit Discharge Date
              </button>
            )}

            <button
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveDraft}
              disabled={Boolean(saving || loading)}
            >
              {saving ? (
                <span className="animate-spin border-2 border-white border-t-transparent h-4 w-4 rounded-full mr-2" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              {saving ? "Saving…" : "Save Info"}
            </button>

            {patientRecord && (
              <button
                className={`flex items-center px-4 py-2 text-white rounded-lg shadow-sm transition-colors
                  ${canInitiateDischarge
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-gray-400 cursor-not-allowed"
                  } disabled:opacity-50`}
                onClick={() => setShowDischargeModal(true)}
                disabled={Boolean(!canInitiateDischarge || loading || saving)}
              >
                {loading && canInitiateDischarge ? (
                  <span className="animate-spin border-2 border-white border-t-transparent h-4 w-4 rounded-full mr-2" />
                ) : (
                  <UserCheck size={16} className="mr-2" />
                )}
                {canInitiateDischarge
                  ? (loading ? "Processing…" : "Discharge Patient")
                  : `Already Discharged (${patientRecord.currentDischargeType || 'N/A'})`}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ─── Patient Summary Card ─────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8 border border-gray-100">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {patientRecord.name}
                  </h1>
                  <p className="text-teal-50">
                    UHID: {patientRecord.uhid}
                    {patientRecord.billno && (
                      <span className="ml-4 text-white font-semibold">
                        Bill No: {patientRecord.billno}
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-2 md:mt-0 flex flex-col md:items-end">
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                    <Bed size={14} className="mr-2" />
                    {formatRoomType(patientRecord.roomType || "")} •{" "}
                    {patientRecord.bedNumber ? `Bed ${patientRecord.bedNumber}` : "No Bed"}
                  </div>

                  <div className="mt-2 text-teal-50 text-sm">
                    {patientRecord.currentDischargeType === DISCHARGE_TYPES.DISCHARGE_PARTIALLY ? (
                      <span className="inline-flex items-center">
                        <AlertTriangle size={14} className="mr-1 text-yellow-300" />
                        Admitted:{" "}
                        {patientRecord.admitDate
                          ? format(parseISO(patientRecord.admitDate), "dd MMM,yyyy")
                          : "Unknown"}
                        {" "} (Partially Discharged)
                      </span>
                    ) : patientRecord.dischargeDate ? (
                      <span className="inline-flex items-center">
                        <CheckCircle size={14} className="mr-1" /> Discharged:{" "}
                        {format(
                          parseISO(patientRecord.dischargeDate),
                          "dd MMM,yyyy 'at' HH:mm"
                        )}
                        {` (${patientRecord.currentDischargeType || 'Complete'})`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center">
                        <Calendar size={14} className="mr-1" /> Admitted:{" "}
                        {patientRecord.admitDate
                          ? format(
                              parseISO(patientRecord.admitDate),
                              "dd MMM,yyyy"
                            )
                          : "Unknown"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <User size={18} className="mr-2 text-teal-600" /> Patient
                    Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-start">
                      <Phone
                        size={16}
                        className="mr-2 text-gray-400 mt-0.5"
                      />
                      <div>
                        <p className="text-sm text-gray-500">Mobile</p>
                        <p className="font-medium">
                          {patientRecord.mobileNumber || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <MapPin
                        size={16}
                        className="mr-2 text-gray-400 mt-0.5"
                      />
                      <div>
                        <p className="text-sm text-gray-500">Address</p>
                        <p className="font-medium">
                          {patientRecord.address || "Not provided"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-sm text-gray-500">Age</p>
                        <p className="font-medium">
                          {patientRecord.age || "Not provided"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Gender</p>
                        <p className="font-medium">
                          {patientRecord.gender || "Not provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <User size={18} className="mr-2 text-teal-600" /> Relative
                    Details
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Name</p>
                      <p className="font-medium">
                        {patientRecord.relativeName || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium">
                        {patientRecord.relativePhone || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Address</p>
                      <p className="font-medium">
                        {patientRecord.relativeAddress || "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <FileText size={18} className="mr-2 text-teal-600" />{" "}
                    Discharge Status
                  </h3>
                  <div className="space-y-3">
                    {patientRecord.currentDischargeType === DISCHARGE_TYPES.DISCHARGE_PARTIALLY ? (
                      <div className="flex items-center p-3 bg-orange-50 rounded-lg">
                        <AlertTriangle
                          size={20}
                          className="text-orange-600 mr-3"
                        />
                        <div>
                          <p className="font-medium text-orange-800">
                            Partially Discharged
                          </p>
                          <p className="text-sm text-orange-600">
                            Billing pending or incomplete discharge.
                          </p>
                           {patientRecord.dischargeDate && (
                             <p className="text-xs text-orange-500 mt-1">
                               Discharge initiated on: {format(parseISO(patientRecord.dischargeDate), "dd MMM,yyyy 'at' HH:mm")}
                             </p>
                           )}
                        </div>
                      </div>
                    ) : patientRecord.dischargeDate ? (
                      <div className="flex items-center p-3 bg-green-50 rounded-lg">
                        <CheckCircle
                          size={20}
                          className="text-green-600 mr-3"
                        />
                        <div>
                          <p className="font-medium text-green-800">
                            Patient Discharged ({patientRecord.currentDischargeType || 'Complete'})
                          </p>
                          <p className="text-sm text-green-600">
                            {format(
                              parseISO(patientRecord.dischargeDate),
                              "MMM dd,yyyy 'at' HH:mm"
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center p-3 bg-yellow-50 rounded-lg">
                        <AlertTriangle
                          size={20}
                          className="text-yellow-600 mr-3"
                        />
                        <div>
                          <p className="font-medium text-yellow-800">
                            Pending Discharge
                          </p>
                          <p className="text-sm text-yellow-600">
                            Complete the form to discharge
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Discharge Summary Form ───────────────────────── */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <FileText size={24} className="mr-3" /> Discharge Summary
              </h2>
              <p className="text-blue-50 mt-1">
                Fill in all medical discharge details below
              </p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  {Field(
                    "finalDiagnosis",
                    "Final Diagnosis (primary first)",
                    3
                  )}
                  {Field(
                    "procedures",
                    "Procedures (dates, complications)",
                    4
                  )}
                  {Field(
                    "provisionalDiagnosis",
                    "Provisional Diagnosis",
                    3
                  )}
                  {Field(
                    "historyOfPresentIllness",
                    "History of Present Illness",
                    4
                  )}
                  {Field("investigations", "Investigations", 4)}
                  {Field("treatmentGiven", "Treatment Given", 4)}
                </div>

                <div className="space-y-6">
                  {Field("hospitalCourse", "Hospital Course", 4)}
                  {Field(
                    "surgeryProcedureDetails",
                    "Surgery / Procedure Details",
                    4
                  )}
                  {Field("conditionAtDischarge", "Condition at Discharge", 3)}
                  {Field("dischargeMedication", "Discharge Medication", 4)}
                  {Field("followUp", "Follow-up", 3)}
                  {Field(
                    "dischargeInstructions",
                    "Discharge Instructions (diet, activity, etc.)",
                    4
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* ─── Discharge Type Selection Modal ───────────────────────── */}
      <AnimatePresence>
        {showDischargeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDischargeModal(false)}
          >
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowDischargeModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle size={24} />
              </button>
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                Select Discharge Type
              </h3>

              <div className="space-y-4">
                <button
                  onClick={() => finalDischarge(DISCHARGE_TYPES.DISCHARGE)}
                  className="w-full flex items-center justify-center px-6 py-4 bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700 transition-colors text-lg font-semibold"
                  disabled={Boolean(loading)}
                >
                  <UserCheck size={20} className="mr-3" />
                  {loading && patientRecord?.currentDischargeType === DISCHARGE_TYPES.DISCHARGE ? "Processing..." : "Discharge Patient (Complete)"}
                </button>
                <button
                  onClick={() => finalDischarge(DISCHARGE_TYPES.DISCHARGE_PARTIALLY)}
                  className={`w-full flex items-center justify-center px-6 py-4 text-white rounded-lg shadow-md transition-colors text-lg font-semibold
                    ${patientRecord.dischargeDate && patientRecord.currentDischargeType !== DISCHARGE_TYPES.DISCHARGE_PARTIALLY
                      ? "bg-gray-500 cursor-not-allowed"
                      : "bg-yellow-500 hover:bg-yellow-600"
                    }`}
                  disabled={Boolean(loading || (patientRecord.dischargeDate && patientRecord.currentDischargeType !== DISCHARGE_TYPES.DISCHARGE_PARTIALLY))}
                >
                  <FileText size={20} className="mr-3" />
                  {loading && patientRecord?.currentDischargeType === DISCHARGE_TYPES.DISCHARGE_PARTIALLY ? "Processing..." : "Discharge Partially (Bill Pending)"}
                </button>
                <button
                  onClick={() => finalDischarge(DISCHARGE_TYPES.DEATH)}
                  className="w-full flex items-center justify-center px-6 py-4 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors text-lg font-semibold"
                  disabled={Boolean(loading)}
                >
                  <AlertTriangle size={20} className="mr-3" />
                  {loading && patientRecord?.currentDischargeType === DISCHARGE_TYPES.DEATH ? "Processing..." : "Mark as Death"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Edit Discharge Date Modal ───────────────────────── */}
      <AnimatePresence>
        {showEditDischargeDateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditDischargeDateModal(false)}
          >
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowEditDischargeDateModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle size={24} />
              </button>
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                Edit Discharge Date
              </h3>

              <div className="space-y-4">
                <label htmlFor="editedDischargeDateTime" className="block text-sm font-medium text-gray-700">
                  New Discharge Date & Time (IST)
                </label>
                <input
                  type="datetime-local"
                  id="editedDischargeDateTime"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                  value={editedDischargeDate}
                  onChange={(e) => setEditedDischargeDate(e.target.value)}
                  disabled={saving}
                />
                <button
                  onClick={handleEditDischargeDate}
                  className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={saving}
                >
                  {saving ? (
                    <span className="animate-spin border-2 border-white border-t-transparent h-4 w-4 rounded-full mr-2" />
                  ) : (
                    <Save size={20} className="mr-3" />
                  )}
                  {saving ? "Updating..." : "Save New Date"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}