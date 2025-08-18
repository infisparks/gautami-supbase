// page.tsx
"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { User, Phone, Calendar, Bed, Eye, XCircle, AlertCircle } from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { SearchableSelect } from "@/components/global/searchable-select"
import IPDSignaturePDF from "@/app/ipd/appointment/pdf"
import { useRouter } from "next/navigation"

// --- Type Definitions (Defined directly in this file) ---

interface Option {
  value: string;
  label: string;
}

interface PatientDetail {
  patient_id: number;
  created_at: string;
  name: string;
  number: number | null; // Matches bigint in DB
  age: number | null; // Matches integer in DB
  gender: string | null;
  address: string | null;
  age_unit: string | null;
  dob: string | null;
  uhid: string;
  updated_at: string | null;
}

interface Doctor {
  id: number; // Changed to number to match DB schema
  created_at: string;
  dr_name: string; // This should match pdf.tsx's Doctor interface's dr_name property
  department: string;
  specialist: any;
  charges: any;
}

interface BedData {
  id: number; // Matches bigint in DB, and now matches pdf.tsx's expected prop type
  created_at: string;
  room_type: string;
  bed_number: number;
  bed_type: string;
  status: "available" | "occupied" | "maintenance" | "reserved";
}

interface PaymentDetailItem {
  date: string;
  type: string;
  amount: number;
  createdAt: string;
  paymentType: string;
  through: string;
  amountType?: string; // Add this line
}

interface ServiceDetailItem {
  type: string;
  amount: number;
  createdAt: string;
  doctorName: string;
  serviceName: string;
}

interface IPDFormInput {
  ipd_id?: number;
  uhid: string;
  name: string;
  phone: string | number | null; // Use string | number for form state, convert to number for DB
  age: string | number | null; // Use string | number for form state, convert to number for DB
  ageUnit: string;
  gender: string; // Ensure this is always a string when passed to PDF
  address: string | null; // Keep as string | null to match Supabase and form state
  relativeName: string;
  relativePhone: string | number | null; // Use string | number for form state, convert to number for DB
  relativeAddress: string | null;
  admissionSource: string;
  admissionType: string;
  referralDoctor: string | null;
  underCareOfDoctor: string;
  depositAmount: string | number | null; // Use string | number for form state, convert to number for DB
  paymentMode: string;
  paymentThrough: string; // New field for payment through
  bed: number | null; // Changed to number | null to match BedData.id and DB
  roomType: string;
  date: string;
  time: string;
  paymentDetails: PaymentDetailItem[] | null;
  serviceDetails: ServiceDetailItem[] | null;
  mrd?: string | null; // Added new field for MRD
  tpa?: boolean; // Added new field for TPA
}

// Supabase structure for fetching
interface IPDRegistrationSupabaseFetch {
  referral_doctor: null
  ipd_id: number;
  admission_source: string | null;
  admission_type: string | null;
  under_care_of_doctor: string | null;
  payment_detail: PaymentDetailItem[] | null; // Now includes 'through'
  bed_id: number | null;
  service_detail: ServiceDetailItem[] | null;
  created_at: string;
  discharge_date: string | null;
  relative_name: string | null;
  relative_ph_no: number | null;
  relative_address: string | null;
  admission_date: string | null;
  admission_time: string | null;
  uhid: string;
  patient_detail: {
    patient_id: number;
    name: string;
    number: number | null;
    age: number | null;
    gender: string | null;
    address: string | null;
    age_unit: string | null;
    dob: string | null;
    uhid: string;
  } | null;
  bed_management: {
    id: number;
    room_type: string;
    bed_number: number;
    bed_type: string;
    status: string;
  } | null;
  discharge_type: string | null;
  ipd_notes: string | null;
  mrd: string | null; // Added new field for MRD
  tpa: boolean | null; // Added new field for TPA
}

// --- End Type Definitions ---

// Options for various form fields
const admissionSourceOptions: Option[] = [
  { value: "ipd", label: "IPD" },
  { value: "opd", label: "OPD" },
  { value: "casualty", label: "Casualty" },
  { value: "referral", label: "Referral" },
]

const admissionTypeOptions: Option[] = [
  { value: "general", label: "General" },
  { value: "surgery", label: "Surgery" },
  { value: "accident_emergency", label: "Accident/Emergency" },
  { value: "day_observation", label: "Day Observation" },
]

const paymentModeOptions: Option[] = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "mixed", label: "Cash + Online" },
]

// New options for payment 'through'
const paymentThroughCashOptions: Option[] = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online (for Mixed)" }, // Clarified label for mixed scenario
];

const paymentThroughOnlineOptions: Option[] = [
  { value: "upi", label: "UPI" },
  { value: "credit-card", label: "Credit Card" },
  { value: "debit-card", label: "Debit Card" },
  { value: "netbanking", label: "Net Banking" },
  { value: "cheque", label: "Cheque" },
];

const genderOptions: Option[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

const ageUnitOptions: Option[] = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
  { value: "days", label: "Days" },
]

interface IPDAppointmentEditPageProps {
  params: { ipd_id: string }
}

const IPDAppointmentEditPage = ({ params }: IPDAppointmentEditPageProps) => {
  const { ipd_id } = params
  const [patients, setPatients] = useState<PatientDetail[]>([])
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([])
  const [beds, setBeds] = useState<BedData[]>([])
  const [availableBeds, setAvailableBeds] = useState<BedData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [patientSuggestions, setPatientSuggestions] = useState<PatientDetail[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [originalBedId, setOriginalBedId] = useState<number | null>(null);
  const router = useRouter();

  // Place these INSIDE the component:
  const [roomTypeOptions, setRoomTypeOptions] = useState<Option[]>([]);

  useEffect(() => {
    const fetchRoomTypes = async () => {
      const { data, error } = await supabase
        .from("bed_management")
        .select("room_type")
        .neq("room_type", null);
      if (!error && data) {
        const uniqueTypes = Array.from(new Set(data.map((row) => row.room_type).filter(Boolean)));
        setRoomTypeOptions(
          uniqueTypes.map((type) => ({
            value: type,
            label: type.charAt(0).toUpperCase() + type.slice(1),
          }))
        );
      }
    };
    fetchRoomTypes();
  }, []);

  const [formData, setFormData] = useState<IPDFormInput>({
    ipd_id: Number(ipd_id),
    uhid: "",
    name: "",
    phone: "",
    age: "",
    ageUnit: "years",
    gender: "male", // Default to a non-null string
    address: null, // Can be null
    relativeName: "",
    relativePhone: "",
    relativeAddress: null,
    admissionSource: "",
    admissionType: "",
    referralDoctor: null,
    underCareOfDoctor: "",
    depositAmount: "",
    paymentMode: "",
    paymentThrough: "", // Initialize paymentThrough
    roomType: "",
    bed: null,
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    paymentDetails: [],
    serviceDetails: [],
  })

  // Determine available 'Through' options based on paymentMode
  const currentPaymentThroughOptions = useMemo(() => {
    if (formData.paymentMode === "cash" || formData.paymentMode === "mixed") {
      return paymentThroughCashOptions;
    } else if (formData.paymentMode === "online") {
      return paymentThroughOnlineOptions;
    }
    return [];
  }, [formData.paymentMode]);

  useEffect(() => {
    // Reset paymentThrough when paymentMode changes to a default for that mode
    if (formData.paymentMode === "cash" || formData.paymentMode === "mixed") {
      setFormData((prev) => ({ ...prev, paymentThrough: "cash" }));
    } else if (formData.paymentMode === "online") {
      setFormData((prev) => ({ ...prev, paymentThrough: "upi" })); // Default to UPI for online
    } else {
      setFormData((prev) => ({ ...prev, paymentThrough: "" })); // Clear if no specific mode
    }
  }, [formData.paymentMode]);


  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      await Promise.all([fetchPatients(), fetchAllDoctors(), fetchBeds()])
      if (ipd_id) {
        await fetchIPDRecord(Number(ipd_id))
      }
      setIsLoading(false)
    }
    fetchData()
  }, [ipd_id])

  useEffect(() => {
    if (formData.roomType) {
      // Filter available beds for the selected room type. If formData.bed is set and matches, include it too.
      const roomBeds = beds.filter((bed) => {
          return bed.room_type === formData.roomType &&
                 (bed.status === "available" || bed.id === formData.bed); // Include current bed even if occupied
      });
      setAvailableBeds(roomBeds);
    } else {
      setAvailableBeds([]);
    }
  }, [formData.roomType, beds, formData.bed]);


  const fetchIPDRecord = async (id: number) => {
    try {
      const { data, error } = await supabase
        .from("ipd_registration")
        .select(
          `ipd_id,admission_source,admission_type,under_care_of_doctor,payment_detail,bed_id,service_detail,created_at,discharge_date,relative_name,relative_ph_no,relative_address,admission_date,admission_time,uhid,patient_detail(patient_id,name,number,age,gender,address,age_unit,dob),bed_management(id,room_type,bed_number,bed_type,status),discharge_type,ipd_notes,mrd,tpa`
        )
        .eq("ipd_id", id)
        .single<IPDRegistrationSupabaseFetch>()

      if (error) throw error
      if (data) {
        const depositPayment = data.payment_detail?.find(p => p.type === "deposit");

        setFormData((prev: IPDFormInput) => ({
          ...prev,
          ipd_id: data.ipd_id,
          uhid: data.uhid,
          name: data.patient_detail?.name || "",
          phone: data.patient_detail?.number || "", // Now correctly `number | null`
          age: data.patient_detail?.age || "", // Now correctly `number | null`
          ageUnit: data.patient_detail?.age_unit || "years",
          gender: data.patient_detail?.gender || "other", // Provide a default non-null string
          address: data.patient_detail?.address || null, // Can be null
          relativeName: data.relative_name || "",
          relativePhone: data.relative_ph_no || "", // Now correctly `number | null`
          relativeAddress: data.relative_address || null,
          admissionSource: data.admission_source || "",
          admissionType: data.admission_type || "",
          referralDoctor: data.referral_doctor || null, // Ensure this matches your DB schema for referral_doctor
          underCareOfDoctor: data.under_care_of_doctor || "",
          depositAmount: depositPayment?.amount ? String(depositPayment.amount) : "",
          paymentMode: depositPayment?.paymentType || "cash",
          paymentThrough: depositPayment?.through || (depositPayment?.paymentType === "online" ? "upi" : "cash"), // Set 'through'
          roomType: data.bed_management?.room_type || "",
          bed: data.bed_id || null, // This is now a number directly
          date: data.admission_date || new Date().toISOString().split("T")[0],
          time: data.admission_time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          paymentDetails: data.payment_detail || [],
          serviceDetails: data.service_detail || [],
          mrd: data.mrd || null, // Set mrd from fetched data
          tpa: data.tpa || false, // Set tpa from fetched data
        }));
        setOriginalBedId(data.bed_id); // Store original bed ID for status update logic
      }
    } catch (error) {
      console.error("Error fetching IPD record for edit:", error)
      toast.error("Failed to load IPD record for editing.")
    }
  }

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from("patient_detail")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setPatients(data || [])
    } catch (error) {
      console.error("Error fetching patients:", error)
    }
  }

  const fetchAllDoctors = async () => {
    try {
      const { data, error } = await supabase.from("doctor").select("*")

      if (error) throw error
      // Convert doctor IDs to number for consistency with the updated Doctor interface
      setAllDoctors(data ? data.map(doc => ({ ...doc, id: Number(doc.id) })) : [])
    } catch (error) {
      console.error("Error fetching doctors:", error)
    }
  }

  const fetchBeds = async () => {
    try {
      const { data, error } = await supabase.from("bed_management").select("*")

      if (error) {
        console.error("Supabase fetch beds error:", error)
        throw error
      }
      console.log("Fetched beds from Supabase:", data)
      // Convert bed IDs to number for consistency with the updated BedData interface
      setBeds(data ? data.map(bed => ({ ...bed, id: Number(bed.id) })) : [])
    }
    catch (error) {
      console.error("Error fetching beds:", error)
      toast.error("Failed to fetch beds")
    }
  }

  const handlePatientNameChange = (value: string) => {
    setFormData((prev: IPDFormInput) => ({ ...prev, name: value }));

    if (value.length > 0) {
      const suggestions = patients
        .filter((patient) => patient.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 5)
      setPatientSuggestions(suggestions)
      setShowSuggestions(suggestions.length > 0)
    } else {
      setPatientSuggestions([]);
      setShowSuggestions(false)
    }
  }

  const selectPatient = (patient: PatientDetail) => {
    setFormData((prev: IPDFormInput) => ({
      ...prev,
      uhid: patient.uhid,
      name: patient.name,
      phone: patient.number,
      age: patient.age,
      ageUnit: patient.age_unit || "years",
      gender: patient.gender || "other", // Provide a default non-null string
      address: patient.address,
    }))
    setShowSuggestions(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.phone || !formData.roomType || formData.bed === null) {
      toast.error("Please fill all required fields (Patient Name, Phone, Room Type, Bed).")
      return
    }

    setIsLoading(true)

    try {
      let patientUhid = formData.uhid;
      let calculatedDob: string | null = null;

      if (formData.age && formData.ageUnit) {
        const today = new Date();
        let dobDate = new Date(today);

        const ageNum = Number(formData.age);

        if (formData.ageUnit === "years") {
          dobDate.setFullYear(today.getFullYear() - ageNum);
        } else if (formData.ageUnit === "months") {
          dobDate.setMonth(today.getMonth() - ageNum);
        } else if (formData.ageUnit === "days") {
          dobDate.setDate(today.getDate() - ageNum);
        }
        calculatedDob = dobDate.toISOString().split('T')[0];
      }

      if (patientUhid) {
        // Update existing patient details using UHID
        const { error: patientUpdateError } = await supabase
          .from("patient_detail")
          .update({
            name: formData.name,
            number: formData.phone ? Number(formData.phone) : null,
            age: formData.age ? Number(formData.age) : null,
            age_unit: formData.ageUnit,
            gender: formData.gender,
            address: formData.address,
            dob: calculatedDob,
            updated_at: new Date().toISOString(),
          })
          .eq("uhid", patientUhid);
        if (patientUpdateError) throw patientUpdateError;
        toast.success("Patient details updated successfully!");
      } else {
        // This scenario ideally shouldn't happen in an "Edit" page
        // but as a fallback or for a combined new/edit page, you'd generate a UHID here.
        throw new Error("Patient UHID is missing for update operation. This record cannot be updated without a UHID.");
      }

      // Ensure paymentDetail is initialized correctly
      let paymentDetail: PaymentDetailItem[] = formData.paymentDetails ? [...formData.paymentDetails] : [];
      const depositAmount = formData.depositAmount ? Number.parseFloat(String(formData.depositAmount)) : 0;

      // Find existing deposit entry
      const existingDepositIndex = paymentDetail.findIndex(p => p.type === "deposit");

      if (depositAmount > 0) {
        const newDepositEntry: PaymentDetailItem = {
          date: new Date().toISOString(),
          type: "deposit",
          amountType:"deposit",
          amount: depositAmount,
          createdAt: new Date().toISOString(),
          paymentType: formData.paymentMode,
          through: formData.paymentThrough, // Save the 'through' value
        };

        if (existingDepositIndex !== -1) {
          // Update existing deposit entry
          paymentDetail[existingDepositIndex] = newDepositEntry;
        } else {
          // Add new deposit entry
          paymentDetail.push(newDepositEntry);
        }
      } else if (existingDepositIndex !== -1) {
        // If depositAmount is 0 or null, and a deposit entry exists, remove it
        paymentDetail.splice(existingDepositIndex, 1);
      }

      const serviceDetail: ServiceDetailItem[] = [];

      const newBedId = formData.bed; // Already a number
      if (newBedId === null) {
        throw new Error("Invalid bed selection. This should not happen due to validation.");
      }

      if (formData.ipd_id) {
        // Handle bed status changes if bed is changed
        if (originalBedId !== null && originalBedId !== newBedId) {
          // Set old bed to available
          const { error: oldBedError } = await supabase
            .from("bed_management")
            .update({ status: "available" })
            .eq("id", originalBedId);
          if (oldBedError) console.error("Error updating old bed status:", oldBedError);
        }

        // Set new bed to occupied
        const { error: newBedOccupiedError } = await supabase
          .from("bed_management")
          .update({ status: "occupied" })
          .eq("id", newBedId);
        if (newBedOccupiedError) throw new Error("Failed to update new bed status to occupied: " + newBedOccupiedError.message);


        const { error: ipdError } = await supabase
          .from("ipd_registration")
          .update({
            uhid: patientUhid,
            admission_source: formData.admissionSource,
            admission_type: formData.admissionType,
            under_care_of_doctor: formData.underCareOfDoctor,
            payment_detail: paymentDetail,
            bed_id: newBedId, // Now correctly a number
            service_detail: serviceDetail,
            relative_name: formData.relativeName,
            relative_ph_no: formData.relativePhone ? Number(formData.relativePhone) : null,
            relative_address: formData.relativeAddress,
            admission_date: formData.date,
            admission_time: formData.time,
            mrd: formData.mrd || null, // Save mrd
            tpa: formData.tpa || false, // Save tpa
          })
          .eq("ipd_id", formData.ipd_id);
        if (ipdError) throw ipdError;
        toast.success("IPD admission updated successfully!");

        // Redirect back to management page after successful update
        router.push('/ipd/management');

      } else {
        throw new Error("IPD ID is missing for update operation.");
      }

      fetchBeds();
    } catch (error) {
      console.error("Error submitting admission:", error);
      toast.error("Failed to register/update admission: " + (error as any).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push('/ipd/management');
  };

  const handlePreview = () => {
    if (!formData.name || !formData.phone) {
      toast.error("Please fill patient information first")
      return
    }
    setShowPreview(true)
  }

  const handleConfirmSubmit = () => {
    setShowPreview(false)
    const form = document.getElementById("ipd-form") as HTMLFormElement
    if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    }
  }

  const handleBedSelectFromPopup = (bedId: number) => { // bedId is number now
    const selectedBed = beds.find((bed) => bed.id === bedId)
    if (selectedBed) {
      setFormData((prev: IPDFormInput) => ({
        ...prev,
        roomType: selectedBed.room_type,
        bed: selectedBed.id, // bed.id is number
      }))
      setShowAvailability(false)
    }
  }

  const groupBedsByRoomType = () => {
    const groupedBeds: Record<string, BedData[]> = {}

    beds.forEach((bed) => {
      if (!groupedBeds[bed.room_type]) {
        groupedBeds[bed.room_type] = []
      }
      groupedBeds[bed.room_type].push(bed)
    })

    return groupedBeds
  }

  const groupedBeds = groupBedsByRoomType()

  const filteredDoctorOptions = useMemo(() => {
    const currentAdmissionSource = formData.admissionSource
    if (!currentAdmissionSource) {
      return allDoctors.map((doctor) => ({
        value: doctor.dr_name, // Use dr_name for value and label
        label: doctor.dr_name,
      }))
    }

    return allDoctors
      .filter((doctor) => {
        if (currentAdmissionSource === "opd") {
          return doctor.department === "opd" || doctor.department === "both"
        }
        if (currentAdmissionSource === "ipd") {
          return doctor.department === "ipd" || doctor.department === "both"
        }
        return true
      })
      .map((doctor) => ({
        value: doctor.dr_name, // Use dr_name for value and label
        label: doctor.dr_name,
      }))
  }, [formData.admissionSource, allDoctors])

  const bedSelectOptions = useMemo(() => {
    const options = availableBeds.map((bed) => ({
      value: String(bed.id), // Convert to string for <SearchableSelect> value
      label: `Bed ${bed.bed_number} - ${bed.bed_type}`,
    }))

    // Ensure the currently selected bed is always an option, even if it's no longer 'available'
    // This handles the case when editing an IPD record and its bed is now occupied
    if (formData.bed !== null && !options.some((opt) => Number(opt.value) === formData.bed)) { // Compare with number
      const selectedBed = beds.find((bed) => bed.id === formData.bed)
      if (selectedBed) {
        options.unshift({
          value: String(selectedBed.id), // Convert to string for <SearchableSelect> value
          label: `Bed ${selectedBed.bed_number} - ${selectedBed.bed_type} (Selected - ${selectedBed.status})`,
        })
      }
    }
    return options
  }, [availableBeds, formData.bed, beds])

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 animate-bounce text-blue-500 mb-4" />
            <p className="text-xl text-gray-700">Loading patient data...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white py-8 rounded-lg shadow-md">
          <h1 className="text-4xl font-bold mb-3">{ipd_id ? "Edit IPD Admission" : "New IPD Admission"}</h1>
          <p className="text-lg opacity-90">
            {ipd_id ? "Modify existing IPD patient details" : "Register new IPD patient admission"}
          </p>
        </div>

        <form id="ipd-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Information */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-blue-800">
                <User className="h-5 w-5" />
                <span>Patient Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2 relative">
                  <Label htmlFor="name">Patient Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter patient name"
                    value={formData.name}
                    onChange={(e) => handlePatientNameChange(e.target.value)}
                    onFocus={() => {
                      if (formData.name.length > 0) {
                        setPatientSuggestions(
                          patients
                            .filter((patient) => patient.name.toLowerCase().includes(formData.name.toLowerCase()))
                            .slice(0, 5)
                        );
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    required
                    autoComplete="off"
                    className="placeholder-gray-400"
                  />
                  {showSuggestions && (
                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {patientSuggestions.map((patient) => (
                        <div
                          key={patient.uhid}
                          className="p-2 hover:bg-gray-100 cursor-pointer"
                          onMouseDown={() => selectPatient(patient)}
                        >
                          <div className="font-medium">{patient.name}</div>
                          <div className="text-sm text-gray-600">{patient.number} - {patient.uhid}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="Enter phone number"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, phone: e.target.value }))}
                    required
                    autoComplete="off"
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uhid">UHID</Label>
                  <Input
                    id="uhid"
                    placeholder={formData.uhid || "Auto-generated on new admission"}
                    value={formData.uhid}
                    readOnly // UHID should be read-only on an edit page
                    className={`placeholder-gray-400 bg-gray-100 cursor-not-allowed`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="Enter age"
                    value={formData.age || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, age: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Age Unit</Label>
                  <SearchableSelect
                    options={ageUnitOptions}
                    value={formData.ageUnit}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, ageUnit: value }))}
                    placeholder="Select age unit"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <SearchableSelect
                    options={genderOptions}
                    value={formData.gender}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, gender: value }))}
                    placeholder="Select gender"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Enter patient address"
                  value={formData.address || ''}
                  onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, address: e.target.value }))}
                  autoComplete="off"
                  className="placeholder-gray-400"
                />
              </div>
            </CardContent>
          </Card>

          {/* Relative Information */}
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-green-800">
                <Phone className="h-5 w-5" />
                <span>Relative Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="relativeName">Relative Name</Label>
                  <Input
                    id="relativeName"
                    placeholder="Enter relative name"
                    value={formData.relativeName}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, relativeName: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relativePhone">Relative Phone No.</Label>
                  <Input
                    id="relativePhone"
                    placeholder="Enter relative phone"
                    value={formData.relativePhone || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, relativePhone: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relativeAddress">Relative Address</Label>
                  <Input
                    id="relativeAddress"
                    placeholder="Enter relative address"
                    value={formData.relativeAddress || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, relativeAddress: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Admission Details */}
          <Card className="bg-purple-50 border-purple-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-purple-800">
                <Calendar className="h-5 w-5" />
                <span>Admission Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Admission Source</Label>
                  <SearchableSelect
                    options={admissionSourceOptions}
                    value={formData.admissionSource}
                    onValueChange={(value) =>
                      setFormData((prev: IPDFormInput) => ({ ...prev, admissionSource: value, underCareOfDoctor: "" }))
                    }
                    placeholder="Select admission source"
                  />
                </div>

                {formData.admissionSource === "referral" && (
                  <div className="space-y-2">
                    <Label htmlFor="referralDoctor">Referral Doctor</Label>
                    <Input
                      id="referralDoctor"
                      placeholder="Enter referral doctor name"
                      value={formData.referralDoctor || ''}
                      onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, referralDoctor: e.target.value }))}
                      className="placeholder-gray-400"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mrd">MRD Number (Optional)</Label>
                  <Input
                    id="mrd"
                    placeholder="Enter MRD number"
                    value={formData.mrd || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, mrd: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label>TPA (Third Party Administrator)</Label>
                  <SearchableSelect
                    options={[
                      { value: "true", label: "Yes" },
                      { value: "false", label: "No" },
                    ]}
                    value={String(formData.tpa)}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, tpa: value === "true" }))}
                    placeholder="Select TPA option"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Admission Type</Label>
                  <SearchableSelect
                    options={admissionTypeOptions}
                    value={formData.admissionType}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, admissionType: value }))}
                    placeholder="Select admission type"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Under Care of Doctor</Label>
                  <SearchableSelect
                    options={filteredDoctorOptions}
                    value={formData.underCareOfDoctor}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, underCareOfDoctor: value }))}
                    placeholder="Select doctor"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Deposit Amount</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    placeholder="Enter deposit amount"
                    value={formData.depositAmount || ''}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, depositAmount: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <SearchableSelect
                    options={paymentModeOptions}
                    value={formData.paymentMode}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, paymentMode: value }))}
                    placeholder="Select payment mode"
                  />
                </div>

                {/* New "Through" dropdown, visible only if depositAmount > 0 */}
                {Number(formData.depositAmount) > 0 && (
                  <div className="space-y-2">
                    <Label>Through</Label>
                    <SearchableSelect
                      options={currentPaymentThroughOptions}
                      value={formData.paymentThrough}
                      onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, paymentThrough: value }))}
                      placeholder="Select payment method"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="date">Admission Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, date: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time">Admission Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData((prev: IPDFormInput) => ({ ...prev, time: e.target.value }))}
                    className="placeholder-gray-400"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Room & Bed Assignment */}
          <Card className="bg-orange-50 border-orange-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-orange-800">
                <Bed className="h-5 w-5" />
                <span>Room & Bed Assignment</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {" "}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Room Type</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAvailability(true)}
                      className="text-xs"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View Availability
                    </Button>
                  </div>
                  <SearchableSelect
                    options={roomTypeOptions}
                    value={formData.roomType}
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, roomType: value, bed: null }))}
                    placeholder="Select room type"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bed</Label>
                  <SearchableSelect
                    options={bedSelectOptions}
                    value={formData.bed !== null ? String(formData.bed) : ''} // Convert number to string for display
                    onValueChange={(value) => setFormData((prev: IPDFormInput) => ({ ...prev, bed: Number(value) }))} // Convert back to number
                    placeholder={!formData.roomType || availableBeds.length === 0 ? "No Beds Available" : "Select bed"}
                    disabled={!formData.roomType || availableBeds.length === 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="border-gray-600 text-gray-600 hover:bg-gray-50 bg-transparent"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              className="border-blue-600 text-blue-600 hover:bg-blue-50 bg-transparent"
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>

        {/* Bed Availability Popup */}
        {showAvailability && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-blue-700 flex items-center">
                  <Bed className="h-5 w-5 mr-2" />
                  Bed Availability
                </h2>
                <button onClick={() => setShowAvailability(false)} className="text-gray-500 hover:text-gray-700">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {beds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-gray-500">No bed data available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {roomTypeOptions.map((roomTypeOption) => {
                    const roomBeds = groupedBeds[roomTypeOption.value] || []
                    const availableBedsCount = roomBeds.filter((bed) => bed.status === "available").length
                    const totalBedsCount = roomBeds.length

                    return (
                      <div key={roomTypeOption.value} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 p-4 border-b">
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold capitalize">{roomTypeOption.label}</h3>
                            <span
                              className={`px-3 py-1 rounded-full text-sm ${
                                availableBedsCount > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {availableBedsCount} of {totalBedsCount} available
                            </span>
                          </div>
                        </div>

                        <div className="p-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {roomBeds.map((bed) => {
                              const isAvailable = bed.status === "available"
                              // Explicitly type the status mapping object
                              const statusColorMap: Record<BedData['status'], string> = {
                                available: "bg-green-100 text-green-800",
                                occupied: "bg-red-100 text-red-800",
                                maintenance: "bg-yellow-100 text-yellow-800",
                                reserved: "bg-blue-100 text-blue-800",
                              };
                              const statusColor = statusColorMap[bed.status] || "bg-gray-100 text-gray-800";

                              return (
                                <div
                                  key={bed.id}
                                  className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                    isAvailable
                                      ? "border-green-500 bg-green-50 hover:bg-green-100"
                                      : "border-gray-300 bg-gray-50 opacity-80"
                                  }`}
                                  onClick={() => isAvailable && handleBedSelectFromPopup(bed.id)}
                                >
                                  <Bed size={24} className={isAvailable ? "text-green-600" : "text-gray-500"} />
                                  <span className="text-sm mt-1 font-medium">Bed {bed.bed_number}</span>
                                  <span className={`text-xs px-2 py-1 rounded-full mt-1 ${statusColor}`}>
                                    {bed.status}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-blue-700">Admission Preview</DialogTitle>
              <DialogDescription className="text-gray-600">
                Review the admission details before submitting
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-blue-800 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Patient Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Name:</span>
                    <p className="font-semibold mt-1">{formData.name}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Phone:</span>
                    <p className="font-semibold mt-1">{formData.phone}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">UHID:</span>
                    <p className="font-semibold mt-1">{formData.uhid || "Not yet generated"}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Age:</span>
                    <p className="font-semibold mt-1">{formData.age} {formData.ageUnit}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Gender:</span>
                    <p className="font-semibold mt-1">{formData.gender}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm col-span-2">
                    <span className="font-medium text-gray-500">Address:</span>
                    <p className="font-semibold mt-1">{formData.address}</p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-green-800 mb-3 flex items-center">
                  <Phone className="h-5 w-5 mr-2" />
                  Relative Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Name:</span>
                    <p className="font-semibold mt-1">{formData.relativeName}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Phone:</span>
                    <p className="font-semibold mt-1">{formData.relativePhone}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm col-span-2">
                    <span className="font-medium text-gray-500">Address:</span>
                    <p className="font-semibold mt-1">{formData.relativeAddress}</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-purple-800 mb-3 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Admission Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Source:</span>
                    <p className="font-semibold mt-1">
                      {admissionSourceOptions.find((s) => s.value === formData.admissionSource)?.label}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Type:</span>
                    <p className="font-semibold mt-1">
                      {admissionTypeOptions.find((t) => t.value === formData.admissionType)?.label}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Doctor:</span>
                    <p className="font-semibold mt-1">{formData.underCareOfDoctor}</p>
                  </div>
                  {Number(formData.depositAmount) > 0 && (
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <span className="font-medium text-gray-500">Deposit:</span>
                      <p className="font-semibold mt-1">₹{formData.depositAmount}</p>
                    </div>
                  )}
                  {Number(formData.depositAmount) > 0 && (
                    <>
                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <span className="font-medium text-gray-500">Payment Mode:</span>
                        <p className="font-semibold mt-1">
                          {paymentModeOptions.find((p) => p.value === formData.paymentMode)?.label}
                        </p>
                      </div>
                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <span className="font-medium text-gray-500">Payment Through:</span>
                        <p className="font-semibold mt-1">
                          {currentPaymentThroughOptions.find((p) => p.value === formData.paymentThrough)?.label}
                        </p>
                      </div>
                    </>
                  )}
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Date:</span>
                    <p className="font-semibold mt-1">{formData.date}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Time:</span>
                    <p className="font-semibold mt-1">{formData.time}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Room:</span>
                    <p className="font-semibold mt-1">
                      {roomTypeOptions.find((r) => r.value === formData.roomType)?.label}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <span className="font-medium text-gray-500">Bed:</span>
                    <p className="font-semibold mt-1">
                      {beds.find((b) => b.id === (formData.bed !== null ? formData.bed : undefined))?.bed_number} -{" "}
                      {beds.find((b) => b.id === (formData.bed !== null ? formData.bed : undefined))?.bed_type}
                    </p>
                  </div>
                  {formData.mrd && (
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <span className="font-medium text-gray-500">MRD Number:</span>
                      <p className="font-semibold mt-1">{formData.mrd}</p>
                    </div>
                  )}
                  {formData.tpa !== undefined && (
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <span className="font-medium text-gray-500">TPA (Third Party Administrator):</span>
                      <p className="font-semibold mt-1">{formData.tpa ? "Yes" : "No"}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Cancel
              </Button>
              <IPDSignaturePDF
                data={{
                  uhid: formData.uhid,
                  name: formData.name,
                  phone: String(formData.phone || ""),
                  age: Number(formData.age) || 0,
                  ageUnit: formData.ageUnit,
                  gender: formData.gender,
                  address: formData.address || "",
                  relativeName: formData.relativeName,
                  relativePhone: formData.relativePhone,
                  relativeAddress: formData.relativeAddress,
                  admissionSource: formData.admissionSource,
                  admissionType: formData.admissionType,
                  referralDoctor: formData.referralDoctor || "",
                  underCareOfDoctor: formData.underCareOfDoctor,
                  depositAmount: formData.depositAmount,
                  paymentMode: formData.paymentMode,
                  bed: formData.bed !== null ? formData.bed : 0, // Ensure `number` for PDF, defaulting to 0 if null
                  roomType: formData.roomType,
                  date: formData.date,
                  time: formData.time,
                  paymentDetails: formData.paymentDetails
                    ? formData.paymentDetails.map(payment => ({
                        ...payment,
                        through: payment.through || "cash", // Ensure through always has a value
                        amountType: (
                          payment.amountType === "deposit" ||
                          payment.amountType === "advance" ||
                          payment.amountType === "settlement" ||
                          payment.amountType === "refund" ||
                          payment.amountType === "discount"
                        )
                          ? payment.amountType
                          : undefined
                      }))
                    : null,
                  serviceDetails: formData.serviceDetails,
                  mrd: formData.mrd || null,
                }}
                genderOptions={genderOptions}
                admissionSourceOptions={admissionSourceOptions}
                admissionTypeOptions={admissionTypeOptions}
                paymentModeOptions={paymentModeOptions}
                roomTypeOptions={roomTypeOptions}
                doctors={allDoctors}
                beds={beds}
              />
              <Button onClick={handleConfirmSubmit} className="bg-green-600 hover:bg-green-700">
                Confirm & Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

export default IPDAppointmentEditPage