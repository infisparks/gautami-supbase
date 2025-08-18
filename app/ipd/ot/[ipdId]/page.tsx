// app/ipd/ot/[ipdId]/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Resolver, useForm, type SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  RefreshCw,
  User,
  Phone,
  MapPin,
  Bed,
  Save,
  AlertTriangle,
  Stethoscope,
  Calendar,
  Pencil,
  CalendarDays,
  Trash2, // Added for delete icon
  X, // Added for close icon in modal
} from "lucide-react";
import { format, parseISO } from "date-fns";
import Layout from "@/components/global/Layout";

// --- Type Definitions ---

interface PatientDetailSupabase {
  patient_id: number;
  name: string;
  number: number | null;
  age: number | null;
  gender: string | null;
  address: string | null;
  age_unit: string | null;
  dob: string | null;
  uhid: string;
}

interface BedManagementSupabase {
  id: number;
  room_type: string;
  bed_number: number;
  bed_type: string;
  status: string;
}

interface IPDRegistrationForOT {
  ipd_id: number;
  uhid: string;
  bed_id: number | null;
  admission_date: string | null;
  created_at: string;
  patient_detail: PatientDetailSupabase | null;
  bed_management: BedManagementSupabase | null;
  under_care_of_doctor: string | null;
}

// Interface for fetching existing OT data
interface OtDetailsSupabase {
  id: string; // UUID of the OT record
  ipd_id: number;
  patient_id: number | null;
  uhid: string;
  ot_type: "Major" | "Minor" | null; // Changed to be nullable
  ot_notes: string | null;
  ot_date: string | null; // Changed to be nullable
  created_at: string;
  doctor_id: number | null; // Added doctor_id
  has_baby_birth: boolean | null; // New field
  baby_birth_date: string | null; // New field
  baby_birth_weight: number | null; // New field
  baby_birth_gender: "Male" | "Female" | "Other" | null; // New field
  location_type: "OT" | "Labour Room" | null; // New field for location type
}

// Interface for the payload sent to Supabase for OT details upsert
interface OtUpsertPayload {
  ipd_id: number;
  uhid: string;
  ot_type: "Major" | "Minor" | null | undefined;
  ot_notes: string | null;
  ot_date: string | null;
  doctor_id: number | null;
  has_baby_birth: boolean | null;
  baby_birth_date: string | null;
  baby_birth_weight: number | null;
  baby_birth_gender: "Male" | "Female" | "Other" | null;
  location_type: "OT" | "Labour Room" | null;
}

// Interface for Doctor
interface DoctorSupabase {
  id: number;
  dr_name: string;
  department: string;
  specialist: any | null; // Adjust type if you have a specific structure for JSON
  charges: any | null; // Adjust type if you have a specific structure for JSON
}

interface OTFormInputs {
  otType: "Major" | "Minor" | undefined | null; // Changed to be nullable
  otNotes: string | null;
  otDate: string | null; // Changed to be nullable
  otDoctorId: number | undefined; // Added for doctor selection
  hasBabyBirth: boolean; // New field for checkbox
  babyBirthDate: string | null; // New field
  babyBirthWeight: number | null; // New field
  babyBirthGender: "Male" | "Female" | "Other" | undefined; // New field
  locationType: "OT" | "Labour Room" | undefined; // New field for location type
}

// --- Validation Schema ---
const otSchema = yup.object().shape({
  locationType: yup.string()
    .oneOf(["OT", "Labour Room"], "Please select either OT or Labour Room")
    .required("Location Type is required"),
  otType: yup.string()
    .nullable()
    .when("locationType", {
      is: "OT",
      then: (schema) => schema.oneOf(["Major", "Minor"], "Please select either Major OT or Minor OT").required("OT Type is required for OT location"),
      otherwise: (schema) => schema.notRequired(),
    }),
  otNotes: yup.string().nullable(),
  otDate: yup.string().nullable().when("locationType", {
    is: "OT",
    then: (schema) => schema.required("OT Date is required for OT location"),
    otherwise: (schema) => schema.notRequired(),
  }),
  otDoctorId: yup.number().nullable().required("Operating Doctor is required"), // Required for both OT and Labour Room
  hasBabyBirth: yup.boolean(), // Validation for checkbox
  babyBirthDate: yup.string().nullable().when("hasBabyBirth", {
    is: true,
    then: (schema) => schema.required("Baby Birth Date is required if 'Baby Birth' is checked"),
    otherwise: (schema) => schema.notRequired(),
  }),
  babyBirthWeight: yup.number().nullable().when("hasBabyBirth", {
    is: true,
    then: (schema) =>
      schema
        .min(0.1, "Weight must be positive")
        .max(10, "Weight seems too high")
        .typeError("Baby Birth Weight must be a number"),
    otherwise: (schema) => schema.notRequired(),
  }),
  babyBirthGender: yup.string().nullable().when("hasBabyBirth", {
    is: true,
    then: (schema) =>
      schema
        .oneOf(["Male", "Female", "Other"], "Invalid Gender")
        .required("Baby Birth Gender is required if 'Baby Birth' is checked"),
    otherwise: (schema) => schema.notRequired(),
  }),
});

export default function OTPage() {
  const { ipdId } = useParams() as { ipdId: string };
  const router = useRouter();

  const [patientRecord, setPatientRecord] = useState<IPDRegistrationForOT | null>(null);
  const [existingOtRecord, setExistingOtRecord] = useState<OtDetailsSupabase | null>(null);
  const [doctors, setDoctors] = useState<DoctorSupabase[]>([]); // State for doctors list
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false); // New state for delete loading
  const [searchTerm, setSearchTerm] = useState(""); // For doctor search
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false); // To control dropdown visibility
  const [showClearConfirm, setShowClearConfirm] = useState(false); // State for confirmation pop-up
  const [hasBabyBirthChecked, setHasBabyBirthChecked] = useState(false); // New state for baby birth checkbox

  const getCurrentDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<OTFormInputs>({
    resolver: yupResolver(otSchema) as Resolver<OTFormInputs>,
    defaultValues: {
      otType: undefined,
      otNotes: null,
      otDate: getCurrentDate(),
      otDoctorId: undefined, // Default for doctor
      hasBabyBirth: false, // Default for new field
      babyBirthDate: null, // This will be set conditionally in useEffect
      babyBirthWeight: null,
      babyBirthGender: undefined,
      locationType: "OT", // Default for location type
    },
    mode: "onBlur",
  });

  const selectedOtType = watch("otType");
  const selectedOtDoctorId = watch("otDoctorId"); // Watch for selected doctor
  const selectedLocationType = watch("locationType"); // Watch for location type
  const selectedDoctor = useMemo(() => {
    return doctors.find(doc => doc.id === selectedOtDoctorId);
  }, [doctors, selectedOtDoctorId]);


  const handleOtTypeChange = (type: "Major" | "Minor") => {
    setValue("otType", selectedOtType === type ? undefined : type);
  };

  // Filtered doctors for dropdown search
  const filteredDoctors = useMemo(() => {
    if (!searchTerm) {
      return doctors;
    }
    return doctors.filter(doctor =>
      doctor.dr_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [doctors, searchTerm]);

  // --- Data Fetching: Patient Details, Existing OT Record, and Doctors ---
  const fetchPatientAndOtData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch IPD registration and patient details
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select(
          `
          ipd_id,
          uhid,
          bed_id,
          admission_date,
          created_at,
          under_care_of_doctor,
          patient_detail (patient_id, name, number, age, gender, address, age_unit, dob, uhid),
          bed_management (id, room_type, bed_number, bed_type, status)
          `
        )
        .eq("ipd_id", ipdId)
        .single<IPDRegistrationForOT>();

      if (ipdError) {
        console.error("Error fetching patient data for OT:", ipdError);
        toast.error("Failed to load patient data for OT form.");
        setPatientRecord(null);
        setExistingOtRecord(null);
        return;
      }
      if (!ipdData) {
        toast.error("IPD record not found for this ID.");
        setPatientRecord(null);
        setExistingOtRecord(null);
        return;
      }
      setPatientRecord(ipdData);

      // 2. Fetch all doctors first
      const { data: doctorsData, error: doctorsError } = await supabase
        .from("doctor")
        .select("id, dr_name, department, specialist, charges")
        .order("dr_name", { ascending: true });

      if (doctorsError) {
        console.error("Error fetching doctors:", doctorsError);
        toast.error("Failed to load doctor list.");
        setDoctors([]);
      } else {
        setDoctors(doctorsData || []);
      }

      // 3. Fetch existing OT details for this ipdId
      const { data: otData, error: otError } = await supabase
        .from("ot_details")
        .select("*")
        .eq("ipd_id", ipdId)
        .single<OtDetailsSupabase>();

      if (otError && otError.code !== 'PGRST116') {
        console.error("Error fetching existing OT details:", otError);
        toast.error("Failed to load existing OT details.");
        setExistingOtRecord(null);
      } else if (otData) {
        setExistingOtRecord(otData);
        const existingOtDate = otData.ot_date ? otData.ot_date.split('T')[0] : getCurrentDate();
        reset({
          otType: otData.ot_type,
          otNotes: otData.ot_notes,
          otDate: existingOtDate,
          otDoctorId: otData.doctor_id || undefined, // Set existing doctor ID
          hasBabyBirth: otData.has_baby_birth || false, // Set existing baby birth fields
          babyBirthDate: otData.baby_birth_date || null,
          babyBirthWeight: otData.baby_birth_weight || null,
          babyBirthGender: otData.baby_birth_gender || undefined,
          locationType: otData.location_type || "OT", // Set location type from fetched data, default to OT
        });
        // Set search term to selected doctor's name if available for display
        if (doctorsData && otData.doctor_id) {
          const doc = doctorsData.find(d => d.id === otData.doctor_id);
          if (doc) setSearchTerm(doc.dr_name);
          else setSearchTerm(""); // Clear if doctor not found
        } else {
          setSearchTerm("");
        }
        toast.info("Existing OT details loaded for editing.");
      } else {
        setExistingOtRecord(null);
        reset({
          otType: undefined,
          otNotes: null,
          otDate: getCurrentDate(),
          otDoctorId: undefined, // Reset doctor for new entry
          hasBabyBirth: false, // Reset baby birth fields for new entry
          babyBirthDate: null, // This will be set conditionally below
          babyBirthWeight: null,
          babyBirthGender: undefined,
          locationType: "OT", // Reset location type for new entry
        });
        setSearchTerm(""); // Clear search for new entry
      }

      // After reset, if hasBabyBirth is checked, set babyBirthDate to current date
      if (watch("hasBabyBirth")) {
        setValue("babyBirthDate", getCurrentDate());
      }

    } catch (err) {
      console.error("Caught error in fetchPatientAndOtData:", err);
      toast.error("An unexpected error occurred while loading data.");
    } finally {
      setLoading(false);
    }
  }, [ipdId, reset, watch, setValue]);

  useEffect(() => {
    if (ipdId) {
      fetchPatientAndOtData();
    }
  }, [ipdId, fetchPatientAndOtData]);

  // --- Handle OT form submission (INSERT or UPDATE) ---
  const onSubmit: SubmitHandler<OTFormInputs> = async (formData) => {
    if (!patientRecord) {
      toast.error("Patient record not loaded. Cannot save OT details.");
      return;
    }
    setSaving(true);
    try {
      const otDateISO = formData.otDate ? formData.otDate + 'T00:00:00.000Z' : null; // Ensure correct ISO format without timezone issues, or null
      
      const payload: OtUpsertPayload = {
        ipd_id: patientRecord.ipd_id,
        uhid: patientRecord.uhid,
        ot_type: formData.otType,
        ot_notes: formData.otNotes,
        ot_date: otDateISO,
        doctor_id: formData.otDoctorId || null, // Include doctor_id, ensure null if undefined
        has_baby_birth: formData.hasBabyBirth || null, // Include baby birth fields
        baby_birth_date: formData.babyBirthDate || null,
        baby_birth_weight: formData.babyBirthWeight || null,
        baby_birth_gender: formData.babyBirthGender || null,
        location_type: formData.locationType || null, // Include location_type
      };

      // Conditionally nullify OT related fields if locationType is Labour Room
      if (payload.location_type === "Labour Room") {
        payload.ot_type = null;
        payload.ot_notes = null;
        payload.ot_date = null;
        // Do not nullify doctor_id for Labour Room, as it's now required for both
        // payload.doctor_id = null;
      }

      let error = null;
      if (existingOtRecord) {
        const { error: updateError } = await supabase
          .from("ot_details")
          .update(payload)
          .eq("id", existingOtRecord.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("ot_details")
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;

      toast.success(existingOtRecord ? "OT details updated successfully!" : "OT details saved successfully!");
      await fetchPatientAndOtData(); // Re-fetch to update the existing record state and UI
    } catch (err: any) {
      console.error("Error saving OT details:", err);
      toast.error("Failed to save OT details: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Handle Clear OT Data ---
  const handleClearOtData = async () => {
    setShowClearConfirm(false); // Close the confirmation modal immediately
    if (!existingOtRecord) {
      toast.error("No existing OT record to clear.");
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("ot_details")
        .delete()
        .eq("id", existingOtRecord.id);

      if (error) throw error;

      toast.success("OT details cleared successfully!");
      setExistingOtRecord(null); // Clear the state
      reset({ // Reset the form to default values
        otType: undefined,
        otNotes: null,
        otDate: getCurrentDate(),
        otDoctorId: undefined,
        hasBabyBirth: false, // Reset baby birth fields for new entry
        babyBirthDate: null,
        babyBirthWeight: null,
        babyBirthGender: undefined,
        locationType: "OT", // Reset location type for new entry
      });
      setSearchTerm(""); // Clear doctor search term
    } catch (err: any) {
      console.error("Error clearing OT details:", err);
      toast.error("Failed to clear OT details: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const formatRoomType = useCallback((roomType: string | null) => {
    if (!roomType) return "N/A";
    const upperCaseTypes = ["icu", "nicu"];
    const lowerType = roomType.toLowerCase();
    if (upperCaseTypes.includes(lowerType)) {
      return roomType.toUpperCase();
    }
    return roomType.charAt(0).toUpperCase() + roomType.slice(1).toLowerCase();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-teal-50">
          <div className="text-center">
            <RefreshCw className="h-16 w-16 text-teal-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Loading OT patient data...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!patientRecord) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-teal-50">
          <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-gray-100">
            <AlertTriangle className="h-20 w-20 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Patient Record Not Found</h2>
            <p className="text-gray-600 mb-6">The IPD record for ID "{ipdId}" could not be loaded. It may not exist or an error occurred.</p>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-teal-600 text-white rounded-lg shadow-md hover:bg-teal-700 transition-colors flex items-center justify-center mx-auto"
            >
              <ArrowLeft size={20} className="inline-block mr-2" /> Go Back
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
        {/* Header Section */}
        <header className="bg-white border-b border-teal-100 shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
            <button
              onClick={() => router.push(`/ipd/management`)}
              className="flex items-center text-teal-600 hover:text-teal-800 font-medium transition-colors mb-3 sm:mb-0"
            >
              <ArrowLeft size={18} className="mr-2" /> Back to IPD Management
            </button>
            <h1 className="text-2xl font-bold text-gray-800 text-center sm:text-right">
              OT Details for IPD: {ipdId}
              {existingOtRecord && (
                <span className="ml-0 sm:ml-3 text-base text-gray-500 flex items-center justify-center sm:justify-end mt-1 sm:mt-0">
                  <Pencil size={16} className="mr-1" /> Editing
                </span>
              )}
            </h1>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Patient Summary Card */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8 border border-gray-100">
              <div className="bg-gradient-to-r from-teal-600 to-cyan-700 px-6 py-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">{patientRecord.patient_detail?.name || "N/A"}</h2>
                    <p className="text-teal-100 text-sm">UHID: {patientRecord.uhid || "Not assigned"}</p>
                    <p className="text-teal-100 mt-2 text-sm">
                      <Stethoscope size={14} className="inline-block mr-1 opacity-80" /> Under care of Dr.: <span className="font-semibold">{patientRecord.under_care_of_doctor || "N/A"}</span>
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 flex flex-col md:items-end space-y-2">
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium backdrop-blur-sm">
                      <Bed size={15} className="mr-2 opacity-90" />
                      {formatRoomType(patientRecord.bed_management?.room_type || "")}
                      {patientRecord.bed_management?.bed_number ? ` • Bed ${patientRecord.bed_management.bed_number}` : " • No Bed Assigned"}
                    </div>
                    <div className="text-teal-100 text-sm flex items-center">
                      <Calendar size={15} className="mr-2 opacity-90" /> Admitted:{" "}
                      {patientRecord.admission_date
                        ? format(parseISO(patientRecord.admission_date), "dd MMM, yyyy")
                        : "Unknown"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Patient Details Sub-card */}
                  <div className="bg-gray-50 rounded-xl p-5 shadow-inner border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <User size={18} className="mr-2 text-teal-600" /> Patient Demographics
                    </h3>
                    <div className="space-y-3 text-gray-700">
                      <div className="flex items-center">
                        <Phone size={16} className="mr-3 text-gray-500" />
                        <div>
                          <p className="text-sm text-gray-500">Mobile Number</p>
                          <p className="font-medium text-base">{patientRecord.patient_detail?.number ? String(patientRecord.patient_detail.number) : "N/A"}</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <MapPin size={16} className="mr-3 text-gray-500 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Address</p>
                          <p className="font-medium text-base leading-snug">{patientRecord.patient_detail?.address || "Not provided"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 mt-4">
                        <div>
                          <p className="text-sm text-gray-500">Age</p>
                          <p className="font-medium text-base">
                            {patientRecord.patient_detail?.age || "N/A"} {patientRecord.patient_detail?.age_unit || "years"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Gender</p>
                          <p className="font-medium text-base">{patientRecord.patient_detail?.gender || "Not provided"}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* OT Form Card */}
                  <div className="bg-gray-50 rounded-xl p-5 shadow-inner border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <Stethoscope size={18} className="mr-2 text-teal-600" /> OT Procedure Details
                    </h3>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                      <div>
                        <label htmlFor="locationType" className="block text-sm font-medium text-gray-700 mb-2">
                          Location Type <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-4">
                          <button
                            type="button"
                            onClick={() => setValue("locationType", "OT", { shouldValidate: true })}
                            className={`px-5 py-2 rounded-lg border-2 font-medium transition-all duration-200 ease-in-out
                              ${selectedLocationType === "OT"
                                ? "bg-teal-600 text-white border-teal-700 shadow-md"
                                : "bg-white text-gray-700 border-gray-300 hover:border-teal-400 hover:text-teal-600"}
                            `}
                          >
                            Operating Theatre
                          </button>
                          <button
                            type="button"
                            onClick={() => setValue("locationType", "Labour Room", { shouldValidate: true })}
                            className={`px-5 py-2 rounded-lg border-2 font-medium transition-all duration-200 ease-in-out
                              ${selectedLocationType === "Labour Room"
                                ? "bg-teal-600 text-white border-teal-700 shadow-md"
                                : "bg-white text-gray-700 border-gray-300 hover:border-teal-400 hover:text-teal-600"}
                            `}
                          >
                            Labour Room
                          </button>
                        </div>
                        {errors.locationType && (
                          <p className="text-red-500 text-xs mt-2">{errors.locationType.message}</p>
                        )}
                      </div>

                      {selectedLocationType === "OT" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-6"
                        >
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">OT Type <span className="text-red-500">*</span></label>
                            <div className="flex flex-wrap gap-4">
                              <button
                                type="button"
                                onClick={() => handleOtTypeChange("Major")}
                                className={`px-5 py-2 rounded-lg border-2 font-medium transition-all duration-200 ease-in-out
                                  ${selectedOtType === "Major"
                                    ? "bg-teal-600 text-white border-teal-700 shadow-md"
                                    : "bg-white text-gray-700 border-gray-300 hover:border-teal-400 hover:text-teal-600"}
                                `}
                              >
                                Major OT
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOtTypeChange("Minor")}
                                className={`px-5 py-2 rounded-lg border-2 font-medium transition-all duration-200 ease-in-out
                                  ${selectedOtType === "Minor"
                                    ? "bg-teal-600 text-white border-teal-700 shadow-md"
                                    : "bg-white text-gray-700 border-gray-300 hover:border-teal-400 hover:text-teal-600"}
                                `}
                              >
                                Minor OT
                              </button>
                            </div>
                            {errors.otType && (
                              <p className="text-red-500 text-xs mt-2">{errors.otType.message}</p>
                            )}
                          </div>

                          <div>
                            <label htmlFor="otDate" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                              <CalendarDays size={16} className="mr-2 text-teal-600" />
                              OT Date <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              id="otDate"
                              {...register("otDate")}
                              className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white
                                ${errors.otDate ? "border-red-500" : "border-gray-300"}
                                focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors`}
                            />
                            {errors.otDate && (
                              <p className="text-red-500 text-xs mt-1">{errors.otDate.message}</p>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* Doctor Selection Dropdown with Search - always show if locationType is selected */}
                      {(selectedLocationType === "OT" || selectedLocationType === "Labour Room") && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="relative">
                            <label htmlFor="otDoctor" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                              <User size={16} className="mr-2 text-teal-600" />
                              Operating Doctor <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              id="otDoctor"
                              placeholder="Search and select doctor..."
                              value={searchTerm}
                              onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setIsDoctorDropdownOpen(true); // Open dropdown when typing
                                setValue("otDoctorId", undefined); // Clear selected doctor when searching
                              }}
                              onFocus={() => setIsDoctorDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setIsDoctorDropdownOpen(false), 200)} // Delay to allow click on options
                              className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white
                                ${errors.otDoctorId ? "border-red-500" : "border-gray-300"}
                                focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors`}
                            />
                            {selectedDoctor && !isDoctorDropdownOpen && searchTerm === selectedDoctor.dr_name && (
                                <div className="absolute top-0 right-0 mt-10 mr-3 text-sm text-gray-500 flex items-center">
                                    <Stethoscope size={14} className="mr-1" /> Selected
                                </div>
                            )}
                            {isDoctorDropdownOpen && filteredDoctors.length > 0 && (
                              <ul className="absolute z-20 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                                {filteredDoctors.map((doctor) => (
                                  <li
                                    key={doctor.id}
                                    className="px-4 py-2 cursor-pointer hover:bg-teal-100 flex justify-between items-center"
                                    onMouseDown={(e) => { // Use onMouseDown to prevent blur event from closing before click
                                      e.preventDefault();
                                      setValue("otDoctorId", doctor.id);
                                      setSearchTerm(doctor.dr_name);
                                      setIsDoctorDropdownOpen(false);
                                    }}
                                  >
                                    <span>{doctor.dr_name} <span className="text-gray-500 text-sm">({doctor.department})</span></span>
                                    {selectedOtDoctorId === doctor.id && (
                                      <svg className="h-5 w-5 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {errors.otDoctorId && (
                              <p className="text-red-500 text-xs mt-1">{errors.otDoctorId.message}</p>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {selectedLocationType === "Labour Room" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-6"
                        >
                          {/* No OT details needed for Labour Room, only baby birth details */}
                        </motion.div>
                      )}

                      {(selectedLocationType === "OT" || selectedLocationType === "Labour Room") && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-6"
                        >
                          <div>
                            <label htmlFor="hasBabyBirth" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                              <User size={16} className="mr-2 text-teal-600" /> Baby Birth Details (Optional)
                            </label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id="hasBabyBirth"
                                checked={hasBabyBirthChecked}
                                {...register("hasBabyBirth")}
                                onChange={(e) => {
                                  setHasBabyBirthChecked(e.target.checked);
                                  setValue("hasBabyBirth", e.target.checked);
                                  // Reset baby birth fields if unchecked
                                  if (!e.target.checked) {
                                    setValue("babyBirthDate", null);
                                    setValue("babyBirthWeight", null);
                                    setValue("babyBirthGender", undefined);
                                  } else {
                                    // Set current date if checked and no existing date
                                    setValue("babyBirthDate", getCurrentDate());
                                  }
                                }}
                                className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                              />
                              <label htmlFor="hasBabyBirth" className="text-sm text-gray-700">Baby Birth Details</label>
                            </div>
                            {hasBabyBirthChecked && (
                              <>
                                <div className="mt-4">
                                  <label htmlFor="babyBirthDate" className="block text-sm font-medium text-gray-700 mb-2">
                                    Baby Birth Date <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    id="babyBirthDate"
                                    {...register("babyBirthDate")}
                                    className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white
                                      ${errors.babyBirthDate ? "border-red-500" : "border-gray-300"}
                                      focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors`}
                                  />
                                  {errors.babyBirthDate && (
                                    <p className="text-red-500 text-xs mt-1">{errors.babyBirthDate.message}</p>
                                  )}
                                </div>
                                <div className="mt-4">
                                  <label htmlFor="babyBirthWeight" className="block text-sm font-medium text-gray-700 mb-2">
                                    Baby Birth Weight (kg) <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="number"
                                    id="babyBirthWeight"
                                    {...register("babyBirthWeight")}
                                    className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white
                                      ${errors.babyBirthWeight ? "border-red-500" : "border-gray-300"}
                                      focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors`}
                                  />
                                  {errors.babyBirthWeight && (
                                    <p className="text-red-500 text-xs mt-1">{errors.babyBirthWeight.message}</p>
                                  )}
                                </div>
                                <div className="mt-4">
                                  <label htmlFor="babyBirthGender" className="block text-sm font-medium text-gray-700 mb-2">
                                    Baby Birth Gender <span className="text-red-500">*</span>
                                  </label>
                                  <select
                                    id="babyBirthGender"
                                    {...register("babyBirthGender")}
                                    className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white
                                      ${errors.babyBirthGender ? "border-red-500" : "border-gray-300"}
                                      focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors`}
                                  >
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                  </select>
                                  {errors.babyBirthGender && (
                                    <p className="text-red-500 text-xs mt-1">{errors.babyBirthGender.message}</p>
                                  )}
                                </div>
                              </>
                            )}
                          </div>

                          {/* OT Notes only shown if locationType is OT */}
                          {selectedLocationType === "OT" && (
                            <div>
                              <label htmlFor="otNotes" className="block text-sm font-medium text-gray-700 mb-2">
                                OT Notes/Procedure Details (Optional)
                              </label>
                              <textarea
                                id="otNotes"
                                rows={6}
                                {...register("otNotes")}
                                placeholder="Enter details about the operation/procedure here..."
                                className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white
                                  ${errors.otNotes ? "border-red-500" : "border-gray-300"}
                                  focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y transition-colors`}
                              />
                              {errors.otNotes && (
                                <p className="text-red-500 text-xs mt-1">{errors.otNotes.message}</p>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* Only show submit button if a location type is selected */}
                      {(selectedLocationType === "OT" || selectedLocationType === "Labour Room") && (
                        <button
                          type="submit"
                          disabled={Boolean(saving || loading || deleting)}
                          className={`w-full flex items-center justify-center px-6 py-3 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white
                            ${Boolean(saving || loading || deleting) ? "bg-gray-400 cursor-not-allowed" : "bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"}
                            transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2`}
                        >
                          {saving ? (
                            <>
                              <RefreshCw className="h-5 w-5 animate-spin mr-3" />
                              <span>{existingOtRecord ? "Updating..." : "Saving..."}</span>
                            </>
                          ) : (
                            <>
                              <Save size={20} className="mr-3" />
                              <span>{existingOtRecord ? "Update Details" : "Save Details"}</span>
                            </>
                          )}
                        </button>
                      )}

                      {existingOtRecord && (selectedLocationType === "OT" || selectedLocationType === "Labour Room") && (
                        <button
                          type="button"
                          onClick={() => setShowClearConfirm(true)}
                          disabled={Boolean(saving || loading || deleting)}
                          className={`w-full flex items-center justify-center px-6 py-3 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white mt-4
                            ${Boolean(saving || loading || deleting) ? "bg-red-300 cursor-not-allowed" : "bg-red-500 hover:bg-red-600 focus:ring-red-500"}
                            transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2`} 
                        >
                          {deleting ? (
                            <>
                              <RefreshCw className="h-5 w-5 animate-spin mr-3" />
                              <span>Clearing...</span>
                            </>
                          ) : (
                            <>
                              <Trash2 size={20} className="mr-3" />
                              <span>Clear Data</span>
                            </>
                          )}
                        </button>
                      )}

                    </form>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </main>
      </div>

      {/* Confirmation Modal for Clearing OT Data */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full relative"
          >
            <button
              onClick={() => setShowClearConfirm(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">Confirm Clear OT Data</h3>
              <p className="text-gray-600 mb-6">Are you sure you want to clear all OT details for this patient? This action cannot be undone.</p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearOtData}
                  className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
                >
                  <Trash2 size={18} className="mr-2" /> Yes, Clear Data
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </Layout>
  );
}