"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useForm, Controller, FormProvider, useFieldArray } from "react-hook-form"
import { useRouter, useParams } from "next/navigation"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css" // Ensure toastify CSS is imported

// Supabase client import
import { supabase } from "@/lib/supabase"

// UI Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Calendar,
  User,
  Phone,
  Stethoscope,
  CreditCard,
  FileText,
  Trash2,
  Search,
  Hospital,
  PhoneCall,
  MessageSquare,
  IndianRupeeIcon,
  PersonStandingIcon as PersonIcon,
  Clock,
  Cake,
  MapPin,
  Eye,
} from "lucide-react"

// Import the new custom input component
import EditableChargesInput from "@/components/ui/input-new"; // Adjust path as needed
import { SearchableSelect } from "@/components/global/searchable-select";

// Type Definitions and Options
import {
  GenderOptions,
  ModalityOptions,
  PaymentOptions,
  AgeUnitOptions,
  OnlineThroughOptions,
  CashThroughOptions,
  type ModalitySelection,
  type PatientDetail,
  type OnCallAppointment,
  type Doctor,
  type IFormInput,
  XRayStudyOptions,
  PathologyStudyOptions,
  IPDServiceOptions,
  RadiologyServiceOptions,
  Casualty,
  CardiologyStudyOptions,
  type ServiceOption,
} from "@/app/opd/types"

// Server Actions
import {
  fetchDoctorsSupabase,
  fetchOnCallAppointmentsSupabase,
  searchPatientByUhId,
  searchPatientsByPhoneNumber,
  updateAppointment, // Correctly imported now
  deleteOnCallAppointment,
} from "@/action/appointment"

// Bill Generation Utility
import { openBillInNewTabProgrammatically } from "../bill-generator" // Ensure this path is correct relative to the current file

// Layout component
import Layout from "@/components/global/Layout"

// Helper function for time formatting
function formatAMPM(date: Date): string {
  const rawHours = date.getHours()
  const rawMinutes = date.getMinutes()
  const ampm = rawHours >= 12 ? "PM" : "AM"
  const hours = rawHours % 12 || 12
  const minutesStr = rawMinutes < 10 ? `0${rawMinutes}` : rawMinutes.toString()
  return `${hours}:${minutesStr} ${ampm}`
}

// Function to get service options based on modality type
const getServiceOptions = (modalityType: ModalitySelection["type"]): ServiceOption[] => {
  switch (modalityType) {
    case "xray":
      return XRayStudyOptions
    case "pathology":
      return PathologyStudyOptions
    case "ipd":
      return IPDServiceOptions
    case "radiology":
      return RadiologyServiceOptions
    case "casualty":
      return Casualty
    case "cardiology":
      return CardiologyStudyOptions
    default:
      return []
  }
}

const EditAppointmentPage = () => {
  const [activeTab, setActiveTab] = useState("book")
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [onCallAppointments, setOnCallAppointments] = useState<OnCallAppointment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchUhIdInput, setSearchUhIdInput] = useState("")
  const [searchPhoneInput, setSearchPhoneInput] = useState("")
  const [searchedPatientResults, setSearchedPatientResults] = useState<PatientDetail[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PatientDetail | null>(null)
  const [currentBillNo, setCurrentBillNo] = useState<number | null>(null)
  // State to track which charges input is currently being edited
  const [editingChargeIndex, setEditingChargeIndex] = useState<number | null>(null);


  const router = useRouter()
  const params = useParams()
  const opdId = params.opd_id as string | undefined

  const form = useForm<IFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      ageUnit: "year",
      gender: "",
      address: "",
      appointmentType: "visithospital",
      referredBy: "",
      additionalNotes: "",
      paymentMethod: "cash",
      cashAmount: undefined,
      onlineAmount: undefined,
      discount: 0,
      onlineThrough: "upi",
      cashThrough: "cash",
      date: new Date(),
      time: formatAMPM(new Date()),
      modalities: [],
      opdType: "",
      doctor: "",
      specialist: "",
      visitType: "first",
      study: "",
      uhid: "",
    },
    mode: "onChange",
  })

  const {
    register,
    control,
    formState: { errors },
    watch,
    setValue,
    handleSubmit,
    reset,
    getValues, // Added to get current form values for bill generation
  } = form

  const { fields, append, remove } = useFieldArray({
    control,
    name: "modalities",
  })

  const watchedModalities = watch("modalities") || []
  const watchedPaymentMethod = watch("paymentMethod")
  const watchedAppointmentType = watch("appointmentType")
  const watchedCashAmount = watch("cashAmount")
  const watchedOnlineAmount = watch("onlineAmount")

  // --- Initial Data Fetch ---
  useEffect(() => {
    const loadDoctors = async () => {
      setDoctors(await fetchDoctorsSupabase())
    }
    loadDoctors()
  }, [])

  useEffect(() => {
    // Fetch on-call appointments only when the "oncall" tab is active
    if (activeTab === "oncall") {
      const loadOnCall = async () => {
        setOnCallAppointments(await fetchOnCallAppointmentsSupabase())
      }
      loadOnCall()
    }
  }, [activeTab])

  // --- Fetch Appointment for Edit ---
  useEffect(() => {
    const fetchAppointmentForEdit = async () => {
      if (!opdId) return
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from("opd_registration")
          .select(
            `
            *,
            patient_detail (*)
            `,
          )
          .eq("opd_id", opdId)
          .single()

        if (error) throw error

        if (data) {
          // Check if patient_detail is valid before setting selectedPatient
          if (!data.patient_detail || !data.patient_detail.patient_id || !data.patient_detail.uhid) {
            console.error("Fetched appointment data is missing patient_detail or its ID/UHID:", data)
            toast.error("Failed to load patient details for editing. Missing patient ID or UHID.")
            router.push("/opd/list")
            return
          }

          // Fill react-hook-form fields
          setValue("name", data.patient_detail.name || "", { shouldValidate: true })
          setValue("phone", data.patient_detail.number || "", { shouldValidate: true })
          setValue("age", data.patient_detail.age ? Number(data.patient_detail.age) : undefined, {
            shouldValidate: true,
          })
          // Ensure ageUnit defaults to "year" if not provided or invalid
          const ageUnit = data.patient_detail.age_unit && ["year", "month", "day"].includes(data.patient_detail.age_unit) ? data.patient_detail.age_unit : "year"
          setValue("ageUnit", ageUnit, { shouldValidate: true })
          setValue("gender", data.patient_detail.gender || "", { shouldValidate: true })
          setValue("address", data.patient_detail.address || "")
          setValue("referredBy", data.refer_by || "")
          setValue("additionalNotes", data["additional Notes"] || "")
          setValue("paymentMethod", data.payment_info?.paymentMethod || "cash")
          setValue("cashAmount", data.payment_info?.cashAmount || undefined)
          setValue("onlineAmount", data.payment_info?.onlineAmount || undefined)
          setValue("discount", data.payment_info?.discount || 0)
          setValue("onlineThrough", data.payment_info?.onlineThrough || "upi")
          setValue("cashThrough", data.payment_info?.cashThrough || "cash")
          setValue("date", new Date(data.date))
          // Removed: setValue("time", data.time || formatAMPM(new Date())) as opd_registration does not have a time column
          setValue("uhid", data.patient_detail.uhid || "")
          setValue("opdType", data.opdType || "OPD") // Ensure opdType is set
          setCurrentBillNo(data.bill_no) // Set the current bill number

          // Set selected patient for read-only fields
          // Ensure patient_id is number and uhid is string, as per schema
          setSelectedPatient({
            patient_id: data.patient_detail.patient_id as number,
            uhid: data.patient_detail.uhid as string,
            name: data.patient_detail.name || "",
            number: data.patient_detail.number || "",
            age: data.patient_detail.age || 0,
            age_unit: data.patient_detail.age_unit || "year",
            gender: data.patient_detail.gender || "",
            address: data.patient_detail.address || "",
          })
          console.log("Selected Patient after fetch:", {
            patient_id: data.patient_detail.patient_id,
            uhid: data.patient_detail.uhid,
          })

          // Populate modalities using useFieldArray's replace
          // Map doctor name to doctor id for dropdown
          const mappedModalities = (data.service_info || []).map((modality: any) => {
            // If doctor is already an ID, keep as is; if it's a name, map to ID
            const doctorObj = doctors.find((d) => d.dr_name === modality.doctor || d.id === modality.doctor);
            return {
              ...modality,
              doctor: doctorObj ? doctorObj.id : modality.doctor,
            };
          });
          form.setValue("modalities", mappedModalities)
          setActiveTab("book")
          // toast.success("Appointment data loaded for editing.")
        } else {
          toast.error("Appointment not found or unable to load.")
          router.push("/opd/list") // Redirect if not found
        }
      } catch (error) {
        console.error("Error fetching appointment for edit:", error)
        toast.error("Failed to load appointment for editing.")
        router.push("/opd/list") // Redirect on error
      } finally {
        setIsLoading(false)
      }
    }
    fetchAppointmentForEdit()
  }, [opdId, setValue, router, form, doctors]) // Added 'doctors' to the dependency array

  // --- Utility Functions ---
  const getTotalModalityCharges = useCallback(() => {
    return watchedModalities.reduce((total, modality) => total + modality.charges, 0)
  }, [watchedModalities])

  const totalModalityCharges = useMemo(() => getTotalModalityCharges(), [getTotalModalityCharges])

  // Auto-fill cash/online amount based on total charges and payment method (replicated from booking)
  useEffect(() => {
    if (
      watchedAppointmentType === "visithospital" &&
      watchedModalities.length > 0 &&
      (watchedCashAmount === undefined ||
        watchedOnlineAmount === undefined ||
        (watchedCashAmount === 0 && watchedOnlineAmount === 0))
    ) {
      const total = totalModalityCharges
      if (watchedPaymentMethod === "cash") {
        setValue("cashAmount", total)
        setValue("onlineAmount", 0)
      } else if (
        watchedPaymentMethod === "online" ||
        watchedPaymentMethod === "card-credit" ||
        watchedPaymentMethod === "card-debit"
      ) {
        setValue("onlineAmount", total)
        setValue("cashAmount", 0)
      } else if (watchedPaymentMethod === "mixed") {
        if (watchedCashAmount === undefined && watchedOnlineAmount === undefined) {
          setValue("cashAmount", total)
          setValue("onlineAmount", 0)
        }
      }
      setValue("discount", 0)
    }
  }, [
    watchedModalities.length,
    watchedAppointmentType,
    totalModalityCharges,
    setValue,
    watchedCashAmount,
    watchedOnlineAmount,
    watchedPaymentMethod,
  ])

  // Calculate discount based on total charges and amount paid (replicated from booking)
  useEffect(() => {
    if (watchedAppointmentType !== "visithospital") return
    const totalCharges = totalModalityCharges
    const cashAmount = Number(watchedCashAmount) || 0
    const onlineAmount = Number(watchedOnlineAmount) || 0
    const totalPaid = cashAmount + onlineAmount
    const discount = Math.max(0, totalCharges - totalPaid)
    if (watch("discount") !== discount) {
      setValue("discount", discount)
    }
  }, [
    watchedAppointmentType,
    watchedPaymentMethod,
    watchedCashAmount,
    watchedOnlineAmount,
    totalModalityCharges,
    setValue,
    watch,
  ])

  // Calculate total amount paid for summary
  const calculateTotalAmountPaid = () => {
    const cashAmount = Number(watchedCashAmount) || 0
    const onlineAmount = Number(watchedOnlineAmount) || 0
    return cashAmount + onlineAmount
  }

  // --- Patient Search and Selection ---
  const fillFormWithPatientData = (patient: PatientDetail) => {
    setValue("name", patient.name || "", { shouldValidate: true })
    setValue("phone", patient.number || "", { shouldValidate: true })
    setValue("age", patient.age ? Number(patient.age) : undefined, { shouldValidate: true })
    setValue("ageUnit", patient.age_unit || "year", { shouldValidate: true })
    setValue("gender", patient.gender || "", { shouldValidate: true })
    setValue("address", patient.address || "")
    setValue("referredBy", "") // Clear referred by when selecting new patient
    setValue("additionalNotes", "") // Clear notes
    setValue("paymentMethod", "cash") // Reset payment
    setValue("cashAmount", undefined)
    setValue("onlineAmount", undefined)
    setValue("discount", 0)
    setValue("onlineThrough", "upi")
    setValue("cashThrough", "cash")
    setValue("uhid", patient.uhid || "")
    setSelectedPatient(patient)
    console.log("Selected Patient after search/fill:", { patient_id: patient.patient_id, uhid: patient.uhid })
    setValue("modalities", []) // Clear modalities
    setActiveTab("book")
    setSearchUhIdInput("")
    setSearchPhoneInput("")
    setSearchedPatientResults(null)
  }

  const resetFormForNewPatient = () => {
    reset({
      name: "",
      phone: "",
      age: undefined,
      ageUnit: "year",
      gender: "",
      address: "",
      appointmentType: "visithospital",
      referredBy: "",
      additionalNotes: "",
      paymentMethod: "cash",
      cashAmount: undefined,
      onlineAmount: undefined,
      discount: 0,
      onlineThrough: "upi",
      cashThrough: "cash",
      date: new Date(),
      time: formatAMPM(new Date()),
      modalities: [],
      opdType: "",
      doctor: "",
      specialist: "",
      visitType: "first",
      study: "",
      uhid: "",
    })
    setSelectedPatient(null)
    setSearchedPatientResults(null)
    setSearchUhIdInput("")
    setSearchPhoneInput("")
    setEditingChargeIndex(null); // Reset editing state on form reset
  }

  // Handle patient selection from search results
  const handlePatientSelect = (patient: PatientDetail) => {
    fillFormWithPatientData(patient)
    setValue("uhid", patient.uhid)
    setActiveTab("book")
  }

  // Handle manual changes to name/phone (clears selected patient)
  // --- handlers that no longer drop patient_id & uhid while editing ---

const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const newName = e.target.value
  setValue("name", newName)

  if (opdId && selectedPatient) {
    // we’re editing an existing record → keep IDs, just update the local copy
    setSelectedPatient({ ...selectedPatient, name: newName })
  } else {
    // new booking flow → clear the previous selection
    setSelectedPatient(null)
    setValue("uhid", "")
    setSearchUhIdInput("")
    setSearchedPatientResults(null)
  }
}

const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const newNumber = e.target.value
  setValue("phone", newNumber)

  if (opdId && selectedPatient) {
    setSelectedPatient({ ...selectedPatient, number: newNumber })
  } else {
    setSelectedPatient(null)
    setValue("uhid", "")
    setSearchUhIdInput("")
    setSearchedPatientResults(null)
  }
}


  const handleSearchByUhId = async () => {
    if (!searchUhIdInput.trim()) {
      toast.error("Please enter a UHID to search.")
      return
    }
    setIsSearching(true)
    setSearchedPatientResults(null)
    resetFormForNewPatient()
    try {
      const result = await searchPatientByUhId(searchUhIdInput.trim().toUpperCase())
      if (result.success && result.patient) {
        fillFormWithPatientData(result.patient)
        toast.success("Patient found and details filled.")
      } else {
        toast.error(result.message || "Patient not found.")
        resetFormForNewPatient()
      }
    } catch (error) {
      console.error("Search by UHID failed:", error)
      toast.error("An error occurred during UHID search.")
      resetFormForNewPatient()
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchByPhoneNumber = async () => {
    if (!searchPhoneInput.trim()) {
      toast.error("Please enter a phone number to search.")
      return
    }
    setIsSearching(true)
    setSearchedPatientResults(null)
    resetFormForNewPatient()
    try {
      const result = await searchPatientsByPhoneNumber(searchPhoneInput.trim())
      if (result.success && result.patients) {
        if (result.patients.length === 1) {
          fillFormWithPatientData(result.patients[0])
          toast.success("Patient found and details filled.")
        } else {
          setSearchedPatientResults(result.patients)
          toast.info("Multiple patients found. Please select one from the list.")
        }
      } else {
        toast.error(result.message || "No patients found with this phone number.")
        resetFormForNewPatient()
      }
    } catch (error) {
      console.error("Search by phone number failed:", error)
      toast.error("An error occurred during phone number search.")
      resetFormForNewPatient()
    } finally {
      setIsSearching(false)
    }
  }

  // --- Modality Management (using useFieldArray) ---
  const addModality = (type: ModalitySelection["type"]) => {
    append({ id: Math.random().toString(36).substr(2, 9), type, charges: 0, doctor: "" }) // Initialize doctor for all
  }

  const updateModality = (index: number, updates: Partial<ModalitySelection>) => {
    const newModalities = [...fields] // Use 'fields' from useFieldArray
    newModalities[index] = { ...newModalities[index], ...updates }
    setValue("modalities", newModalities as ModalitySelection[]) // Update form state
  }

  const removeModality = (index: number) => {
    remove(index) // Use useFieldArray's remove
    // If the removed modality was being edited, reset the editing state
    if (editingChargeIndex === index) {
      setEditingChargeIndex(null);
    }
    // Adjust editing index if a modality before the currently edited one is removed
    if (editingChargeIndex !== null && index < editingChargeIndex) {
      setEditingChargeIndex(editingChargeIndex - 1);
    }
  }

  const getDoctorNameById = (doctorId: string): string => {
    if (!doctorId) return "-"
    const doc = doctors.find((d) => d.id === doctorId)
    return doc ? doc.dr_name : doctorId
  }

  // This specific handler will be passed to EditableChargesInput for saving charges
  const handleSaveCharges = (index: number, newValue: number) => {
    const currentModalities = getValues("modalities");
    const newModalitiesArray = [...currentModalities]; // Create a new array reference
    newModalitiesArray[index] = { ...newModalitiesArray[index], charges: newValue }; // Update the specific item

    setValue("modalities", newModalitiesArray as ModalitySelection[], {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    setEditingChargeIndex(null); // Exit editing mode for this input
  };


  // --- Form Submission ---
  const onSubmit = async (data: IFormInput) => {
    setIsLoading(true)
    try {
      if (!opdId) {
        toast.error("Appointment ID is missing. Cannot update.")
        return
      }
      if (!data.opdType) {
        data.opdType = data.appointmentType === "visithospital" ? "OPD" : "On-Call"
      }
      if (data.appointmentType === "visithospital" && (!data.modalities || data.modalities.length === 0)) {
        toast.error("Please add at least one service for a hospital visit.")
        setIsLoading(false)
        return
      }

      // Validation for required doctor field on modalities
      if (data.appointmentType === "visithospital") {
        for (const modality of data.modalities) {
          if (!modality.doctor || String(modality.doctor).trim() === "") {
            toast.error(`Doctor is required for ${modality.type} service.`)
            setIsLoading(false)
            return
          }
        }
      }

      // Crucial check: Ensure selectedPatient has valid ID and UHID before calling updateAppointment
      console.log("Submitting form. Current selectedPatient:", selectedPatient)
      if (!selectedPatient?.patient_id || !selectedPatient?.uhid) {
        toast.error("Patient details (ID or UHID) are missing. Cannot update appointment.")
        setIsLoading(false)
        return
      }

      const result = await updateAppointment(
        opdId,
        data,
        watchedModalities,
        totalModalityCharges,
        calculateTotalAmountPaid(),
        selectedPatient.patient_id, // Pass patient_id as number
        selectedPatient.uhid, // Pass uhid as string
      )

      if (result.success) {
        toast.success(result.message)
        router.push("/opd/list") // Redirect to appointment list
      } else {
        toast.error(result.message)
      }
    } catch (err: any) {
      console.error("Submission error:", err)
      toast.error("Failed to update appointment: " + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // --- Handle View Bill ---
  const handleViewBill = async () => {
    // Before proceeding, check if necessary data exists
    if (!opdId) {
      toast.error("Cannot view bill: Appointment ID is missing.")
      return
    }
    if (!selectedPatient?.uhid) {
      toast.error("Cannot view bill: Patient UHID is missing.")
      return
    }
    if (watchedAppointmentType !== "visithospital") {
      toast.error("Bill generation is only available for Hospital Visit appointments.")
      return
    }
    if (!currentBillNo) {
      toast.error("Bill number not found for this appointment. Cannot generate bill.")
      return
    }

    const currentFormData = getValues() // Get all current form values from react-hook-form

    // Construct the data payload for bill generation
    // Ensure all numeric fields are actual numbers, not strings or undefined
    const billDataForGeneration: IFormInput = {
      ...currentFormData,
      age: Number(currentFormData.age) || 0,
      cashAmount: Number(currentFormData.cashAmount) || 0,
      onlineAmount: Number(currentFormData.onlineAmount) || 0,
      discount: Number(currentFormData.discount) || 0,
      // Crucially, use the 'watchedModalities' for the most up-to-date services.
      modalities: watchedModalities.map((modality) => ({
        ...modality,
        charges: Number(modality.charges) || 0, // Ensure charges within modalities are numbers
      })),
      opdType: currentFormData.opdType || "OPD",
      uhid: selectedPatient.uhid, // Ensure UHID from selectedPatient is passed
      date: currentFormData.date instanceof Date ? currentFormData.date : new Date(currentFormData.date),
      time: currentFormData.time || formatAMPM(new Date()),
    }

    try {
      await openBillInNewTabProgrammatically(
        billDataForGeneration,
        selectedPatient.uhid, // Pass UHID from selectedPatient
        doctors.map((d) => ({ id: d.id, dr_name: d.dr_name })), // Pass doctor details for name resolution
        currentBillNo, // Pass the bill number
      )
    } catch (error) {
      console.error("Error generating or opening bill:", error)
      toast.error("Failed to generate or open bill. Check console for details.")
    }
  }

  // --- Handlers for On-Call List Actions ---
  const handleDeleteOnCall = async (onCallId: string) => {
    setIsLoading(true)
    try {
      const result = await deleteOnCallAppointment(onCallId)
      if (result.success) {
        toast.success(result.message)
        setOnCallAppointments(await fetchOnCallAppointmentsSupabase()) // Refresh list
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error("Error deleting on-call appointment:", error)
      toast.error("Failed to delete on-call appointment")
    } finally {
      setIsLoading(false)
    }
  }

  const bookOnCallToOPD = async (appointment: OnCallAppointment) => {
    setIsLoading(true)
    try {
      const { data: patientData, error } = await supabase
        .from("patient_detail")
        .select("patient_id, name, number, age, age_unit, dob, gender, address, uhid")
        .eq("patient_id", appointment.patient_id)
        .single()

      if (error) throw error

      // Ensure patientData conforms to PatientDetail structure
      const formattedPatientData: PatientDetail = {
        patient_id: patientData.patient_id,
        uhid: patientData.uhid,
        name: patientData.name || "",
        number: patientData.number || "",
        age: patientData.age || 0,
        age_unit: patientData.age_unit || "year",
        gender: patientData.gender || "",
        address: patientData.address || "",
      };

      fillFormWithPatientData(formattedPatientData)
      setValue("appointmentType", "visithospital")
      setValue("referredBy", appointment.referredBy || "")
      setValue("additionalNotes", appointment.additional_notes || "")
      setActiveTab("book")
      toast.info("On-call patient data loaded for OPD booking.")
    } catch (error) {
      console.error("Error fetching patient details for on-call conversion:", error)
      toast.error("Failed to load patient details for conversion.")
      resetFormForNewPatient()
    } finally {
      setIsLoading(false)
    }
  }

  const bookOnCallToOnCall = (appointment: OnCallAppointment) => {
    resetFormForNewPatient()
    setValue("name", appointment.patient_detail?.name || "")
    setValue("phone", appointment.patient_detail?.number || "")
    setValue("age", appointment.patient_detail?.age ? Number(appointment.patient_detail.age) : undefined)
    setValue("gender", appointment.patient_detail?.gender || "")
    setValue("appointmentType", "oncall")
    setValue("referredBy", appointment.referredBy || "")
    setValue("additionalNotes", appointment.additional_notes || "")
    setValue("date", new Date(appointment.date))
    // Removed: setValue("time", appointment.time) as opd_oncall does not have a time column
    if (appointment.patient_id && appointment.uhid) {
      // Ensure patient_id is number and uhid is string, and other fields are present
      const formattedPatientDetail: PatientDetail = {
        patient_id: appointment.patient_id as number,
        uhid: appointment.uhid as string,
        name: appointment.patient_detail?.name || "",
        number: appointment.patient_detail?.number || "",
        age: appointment.patient_detail?.age || 0,
        gender: appointment.patient_detail?.gender || "",
      };
      setSelectedPatient(formattedPatientDetail)
      setValue("uhid", appointment.uhid)
    }
    setActiveTab("book")
    toast.info("On-call patient data loaded for new on-call entry.")
  }

  return (
    <Layout>
      <ToastContainer />
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OPD Management System</h1>
              <p className="text-sm text-gray-500">Professional Healthcare Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-4 w-4" />
            <span>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <CardTitle className="text-xl">{opdId ? "Edit Appointment" : "Patient Management System"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
                <TabsTrigger value="book" className="flex items-center gap-2">
                  <Hospital className="h-4 w-4" />
                  {opdId ? "Edit Appointment" : "Book Appointment"}
                </TabsTrigger>
                <TabsTrigger value="oncall" className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4" />
                  On-Call List ({onCallAppointments.length})
                </TabsTrigger>
              </TabsList>

              {/* Book/Edit Appointment Tab Content */}
              <TabsContent value="book" className="p-6 mt-0">
                <FormProvider {...form}>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {/* Patient Information Section */}
                    <Card className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <User className="h-5 w-5 text-blue-600" />
                          Patient Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* Patient Name */}
                          <div className="space-y-2">
                            <Label htmlFor="name" className="text-sm font-medium">
                              Patient Name <span className="text-red-500">*</span>
                            </Label>
                            <div className="relative">
                              <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                id="name"
                                type="text"
                                {...register("name", { required: "Name is required" })}
                                onChange={handleNameChange}
                                placeholder="Enter patient name"
                                className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
                                autoComplete="off"
                                // Removed readOnly={!!selectedPatient && activeTab === "book"}
                              />
                            </div>
                            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                          </div>

                          {/* Phone */}
                          <div className="space-y-2">
                            <Label htmlFor="phone" className="text-sm font-medium">
                              Phone Number <span className="text-red-500">*</span>
                            </Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                id="phone"
                                type="tel"
                                {...register("phone", {
                                  required: "Phone number is required",
                                  pattern: {
                                    value: /^[0-9]{10}$/,
                                    message: "Please enter a valid 10-digit phone number",
                                  },
                                })}
                                onChange={handlePhoneChange}
                                placeholder="Enter 10-digit number"
                                className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
                                autoComplete="off"
                                // Removed readOnly={!!selectedPatient && activeTab === "book"}
                              />
                            </div>
                            {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
                          </div>

                          {/* Age & Age Unit */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="age" className="text-sm font-medium">
                                Age <span className="text-red-500">*</span>
                              </Label>
                              <div className="relative">
                                <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <Input
                                  id="age"
                                  type="number"
                                  {...register("age", {
                                    required: "Age is required",
                                    min: { value: 0, message: "Age must be positive" },
                                    valueAsNumber: true,
                                  })}
                                  placeholder="Enter age"
                                  className={`pl-10 ${errors.age ? "border-red-500" : ""}`}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  // Removed disabled={!!selectedPatient && activeTab === "book"}
                                />
                              </div>
                              {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ageUnit" className="text-sm font-medium">
                                Unit <span className="text-red-500">*</span>
                              </Label>
                              <Controller
                                control={control}
                                name="ageUnit"
                                rules={{ required: "Age unit is required" }}
                                render={({ field }) => (
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                    // Removed disabled={!!selectedPatient && activeTab === "book"}
                                  >
                                    <SelectTrigger className={errors.ageUnit ? "border-red-500" : ""}>
                                      <SelectValue placeholder="Select unit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {AgeUnitOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              {errors.ageUnit && <p className="text-sm text-red-500">{errors.ageUnit.message}</p>}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Gender */}
                          <div className="space-y-2">
                            <Label htmlFor="gender" className="text-sm font-medium">
                              Gender <span className="text-red-500">*</span>
                            </Label>
                            <Controller
                              control={control}
                              name="gender"
                              rules={{ required: "Gender is required" }}
                              render={({ field }) => (
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  // Removed disabled={!!selectedPatient && activeTab === "book"}
                                >
                                  <SelectTrigger className={errors.gender ? "border-red-500" : ""}>
                                    <SelectValue placeholder="Select gender" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {GenderOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
                          </div>

                          {/* Appointment Type */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">
                              Appointment Type <span className="text-red-500">*</span>
                            </Label>
                            <Controller
                              control={control}
                              name="appointmentType"
                              rules={{ required: "Appointment type is required" }}
                              render={({ field }) => (
                                <RadioGroup
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  className="flex space-x-6"
                                  disabled={!!opdId} // Disable if editing an existing appointment
                                >
                                  <div
                                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                                      field.value === "visithospital"
                                        ? "border-blue-500 bg-blue-50 shadow-md"
                                        : "border-gray-200 hover:border-gray-300"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <RadioGroupItem value="visithospital" id="visithospital" />
                                      <Label htmlFor="visithospital">Visit Hospital</Label>
                                    </div>
                                  </div>
                                  <div
                                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                                      field.value === "oncall"
                                        ? "border-blue-500 bg-blue-50 shadow-md"
                                        : "border-gray-200 hover:border-gray-300"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <RadioGroupItem value="oncall" id="oncall" />
                                      <Label htmlFor="oncall">On-Call</Label>
                                    </div>
                                  </div>
                                </RadioGroup>
                              )}
                            />
                            {errors.appointmentType && (
                              <p className="text-sm text-red-500">{errors.appointmentType.message}</p>
                            )}
                          </div>
                        </div>

                        {/* Address and Referred By */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="referredBy" className="text-sm font-medium">
                              Referred By
                            </Label>
                            <Input
                              id="referredBy"
                              type="text"
                              {...register("referredBy")}
                              placeholder="Referrer name"
                            />
                          </div>
                          {watchedAppointmentType === "visithospital" && (
                            <div className="space-y-2">
                              <Label htmlFor="address" className="text-sm font-medium">
                                Address
                              </Label>
                              <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                                <Textarea
                                  id="address"
                                  {...register("address")}
                                  placeholder="Enter address (optional)"
                                  className="pl-10 min-h-[60px]"
                                  // Removed disabled={!!selectedPatient && activeTab === "book"}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Medical Services Section - Only for hospital visits */}
                    {watchedAppointmentType === "visithospital" && (
                      <Card className="border-l-4 border-l-green-500">
                        <CardHeader className="pb-4">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Stethoscope className="h-5 w-5 text-green-600" />
                            Medical Services
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Label className="text-sm font-medium mb-3 block">Quick Add Services</Label>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {ModalityOptions.map((modality) => (
                              <Button
                                key={modality.value}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addModality(modality.value as ModalitySelection["type"])}
                                className="text-xs"
                              >
                                {modality.label}
                              </Button>
                            ))}
                          </div>

                          {fields.length === 0 && (
                            <p className="text-gray-500 text-center py-4">Add services to book an appointment.</p>
                          )}

                          {fields.map((modality, index) => (
                            <Card key={modality.id} className="border-l-4 border-l-blue-500 relative mb-4">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between mb-3">
                                  <Badge variant="secondary" className="capitalize">
                                    {modality.type}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeModality(index)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {/* Doctor selection - now present for ALL modalities */}
                                  <div className="space-y-2">
                                    <Label className="text-xs">
                                      Doctor <span className="text-red-500">*</span>
                                    </Label>
                                    <Controller
                                      control={control}
                                      name={`modalities.${index}.doctor`}
                                      rules={{ required: "Doctor is required" }}
                                      render={({ field }) => (
                                        <SearchableSelect
                                          options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.dr_name }))}
                                          value={field.value || ""}
                                          onValueChange={(value) => {
                                            field.onChange(value)
                                            updateModality(index, { doctor: value })
                                          }}
                                          placeholder="Select doctor"
                                          className={`h-8 text-xs ${errors.modalities?.[index]?.doctor ? "border-red-500" : ""}`}
                                        />
                                      )}
                                    />
                                    {errors.modalities?.[index]?.doctor && (
                                      <p className="text-sm text-red-500">
                                        {errors.modalities[index]?.doctor?.message}
                                      </p>
                                    )}
                                  </div>
                                  {modality.type === "consultation" ? (
                                    <>
                                      <div className="space-y-2">
                                        <Label className="text-xs">Specialist</Label>
                                        <Controller
                                          control={control}
                                          name={`modalities.${index}.specialist`}
                                          render={({ field }) => (
                                            <SearchableSelect
                                              options={Array.from(new Set(doctors.flatMap((d) => d.specialist))).map((spec) => ({ value: spec, label: spec }))}
                                              value={field.value || ""}
                                              onValueChange={(value) => field.onChange(value)}
                                              placeholder="Select specialist"
                                              className="h-8 text-xs"
                                            />
                                          )}
                                        />
                                        {errors.modalities?.[index]?.specialist && (
                                          <p className="text-sm text-red-500">
                                            {errors.modalities[index]?.specialist?.message}
                                          </p>
                                        )}
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-xs">Visit Type</Label>
                                        <Controller
                                          control={control}
                                          name={`modalities.${index}.visitType`}
                                          render={({ field }) => (
                                            <SearchableSelect
                                              options={[
                                                { value: "first", label: "First Visit" },
                                                { value: "followup", label: "Follow Up" },
                                              ]}
                                              value={field.value || ""}
                                              onValueChange={(value) => {
                                                const doctorId = watch(`modalities.${index}.doctor`)
                                                const doctor = doctors.find((d) => d.id === doctorId)
                                                let charges = 0
                                                if (doctor?.charges?.[0]) {
                                                  const chargeData = doctor.charges[0]
                                                  if (value === "first" && chargeData.firstVisitCharge !== undefined) {
                                                    charges = chargeData.firstVisitCharge
                                                  } else if (
                                                    value === "followup" &&
                                                    chargeData.followUpCharge !== undefined
                                                  ) {
                                                    charges = chargeData.followUpCharge
                                                  }
                                                }
                                                field.onChange(value)
                                                updateModality(index, {
                                                  visitType: value as "first" | "followup",
                                                  charges,
                                                })
                                              }}
                                              placeholder="Select visit type"
                                              className="h-8 text-xs"
                                            />
                                          )}
                                        />
                                        {errors.modalities?.[index]?.visitType && (
                                          <p className="text-sm text-red-500">
                                            {errors.modalities[index]?.visitType?.message}
                                          </p>
                                        )}
                                      </div>
                                    </>
                                  ) : modality.type === "custom" ? (
                                    <div className="space-y-2 col-span-2">
                                      <Label className="text-xs">
                                        Custom Service Name <span className="text-red-500">*</span>
                                      </Label>
                                      <Controller
                                        control={control}
                                        name={`modalities.${index}.service`}
                                        rules={{ required: "Service name is required" }}
                                        render={({ field }) => (
                                          <Input
                                            type="text"
                                            placeholder="Enter custom service name"
                                            {...field}
                                            className="h-8 text-xs"
                                          />
                                        )}
                                      />
                                      {errors.modalities?.[index]?.service && (
                                        <p className="text-sm text-red-500">
                                          {errors.modalities[index]?.service?.message}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <Label className="text-xs">
                                        Service <span className="text-red-500">*</span>
                                      </Label>
                                      <Controller
                                        control={control}
                                        name={`modalities.${index}.service`}
                                        rules={{ required: "Service is required" }}
                                        render={({ field }) => (
                                          <SearchableSelect
                                            options={getServiceOptions(modality.type).map((service) => ({ value: service.service, label: `${service.service} - ₹${service.amount}` }))}
                                            value={field.value || ""}
                                            onValueChange={(value) => {
                                              const serviceOptions = getServiceOptions(modality.type)
                                              const selectedService = serviceOptions.find((s) => s.service === value)
                                              field.onChange(value)
                                              updateModality(index, {
                                                service: value,
                                                charges: selectedService?.amount || 0,
                                              })
                                            }}
                                            placeholder="Select service"
                                            className="h-8 text-xs"
                                          />
                                        )}
                                      />
                                      {errors.modalities?.[index]?.service && (
                                        <p className="text-sm text-red-500">
                                          {errors.modalities[index]?.service?.message}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label className="text-xs">
                                      Charges (₹) <span className="text-red-500">*</span>
                                    </Label>
                                    {/* Use the custom EditableChargesInput component */}
                                    <EditableChargesInput
                                      value={modality.charges}
                                      onSave={(newValue: number) => handleSaveCharges(index, newValue)}
                                      index={index}
                                      isCurrentlyEditing={editingChargeIndex === index}
                                      onEditStart={setEditingChargeIndex}
                                      onEditEnd={() => setEditingChargeIndex(null)}
                                      error={errors.modalities?.[index]?.charges?.message}
                                    />
                                    {errors.modalities?.[index]?.charges && (
                                      <p className="text-sm text-red-500">
                                        {errors.modalities[index]?.charges?.message}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}

                          {fields.length > 0 && (
                            <div className="bg-blue-50 p-4 rounded-lg">
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-blue-900">Total Services Charges:</span>
                                <span className="text-xl font-bold text-blue-900">₹{totalModalityCharges}</span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Payment Section - Only for hospital visits */}
                    {watchedAppointmentType === "visithospital" && (
                      <Card className="border-l-4 border-l-purple-500">
                        <CardHeader className="pb-4">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <CreditCard className="h-5 w-5 text-purple-600" />
                            Payment Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Payment Method */}
                            <div className="space-y-2">
                              <Label htmlFor="paymentMethod" className="text-sm font-medium">
                                Payment Method <span className="text-red-500">*</span>
                              </Label>
                              <Controller
                                control={control}
                                name="paymentMethod"
                                rules={{
                                  required: "Payment method is required",
                                }}
                                render={({ field }) => (
                                  <Select onValueChange={field.onChange} value={field.value || "cash"}>
                                    <SelectTrigger className={errors.paymentMethod ? "border-red-500" : ""}>
                                      <SelectValue placeholder="Select method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {PaymentOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              {errors.paymentMethod && (
                                <p className="text-sm text-red-500">{errors.paymentMethod.message}</p>
                              )}
                            </div>

                            {/* Total Charges Display */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Total Charges</Label>
                              <div className="relative">
                                <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <Input
                                  value={totalModalityCharges}
                                  readOnly
                                  className="pl-10 bg-gray-50 cursor-not-allowed font-semibold text-blue-600"
                                  onWheel={(e) => e.currentTarget.blur()}
                                />
                              </div>
                            </div>

                            {/* Cash Amount */}
                            {watchedPaymentMethod === "cash" || watchedPaymentMethod === "mixed" ? (
                              <div className="space-y-2">
                                <Label htmlFor="cashAmount" className="text-sm font-medium">
                                  Cash Amount <span className="text-red-500">*</span>
                                </Label>
                                <div className="relative">
                                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                  <Input
                                    id="cashAmount"
                                    type="number"
                                    placeholder="Cash amount"
                                    className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                                    {...register("cashAmount", {
                                      required:
                                        (watchedPaymentMethod === "cash" || watchedPaymentMethod === "mixed") &&
                                        totalModalityCharges > 0
                                          ? "Cash amount is required"
                                          : false,
                                      min: { value: 0, message: "Amount must be positive" },
                                      valueAsNumber: true,
                                    })}
                                    onWheel={(e) => e.currentTarget.blur()}
                                  />
                                </div>
                                {errors.cashAmount && (
                                  <p className="text-sm text-red-500">{errors.cashAmount.message}</p>
                                )}
                              </div>
                            ) : null}

                            {/* Online Amount */}
                            {watchedPaymentMethod === "online" ||
                            watchedPaymentMethod === "card-credit" ||
                            watchedPaymentMethod === "card-debit" ||
                            watchedPaymentMethod === "mixed" ? (
                              <div className="space-y-2">
                                <Label htmlFor="onlineAmount" className="text-sm font-medium">
                                  {watchedPaymentMethod === "online" ||
                                  watchedPaymentMethod === "card-credit" ||
                                  watchedPaymentMethod === "card-debit" ||
                                  watchedPaymentMethod === "mixed"
                                    ? "Online Amount"
                                    : "Amount"}{" "}
                                  <span className="text-red-500">*</span>
                                </Label>
                                <div className="relative">
                                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                  <Input
                                    id="onlineAmount"
                                    type="number"
                                    placeholder="Online amount"
                                    className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                                    {...register("onlineAmount", {
                                      required:
                                        (watchedPaymentMethod === "online" ||
                                          watchedPaymentMethod === "card-credit" ||
                                          watchedPaymentMethod === "card-debit" ||
                                          watchedPaymentMethod === "mixed") &&
                                        totalModalityCharges > 0
                                          ? "Amount is required"
                                          : false,
                                      min: { value: 0, message: "Amount must be positive" },
                                      valueAsNumber: true,
                                    })}
                                    onWheel={(e) => e.currentTarget.blur()}
                                  />
                                </div>
                                {errors.onlineAmount && (
                                  <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>
                                )}
                              </div>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Cash Through */}
                            {(watchedPaymentMethod === "cash" || watchedPaymentMethod === "mixed") && (
                              <div className="space-y-2">
                                <Label htmlFor="cashThrough" className="text-sm font-medium">
                                  Cash Through
                                </Label>
                                <Controller
                                  control={control}
                                  name="cashThrough"
                                  render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || "cash"}>
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Select cash method" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {CashThroughOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>
                            )}

                            {/* Online Through */}
                            {(watchedPaymentMethod === "online" || watchedPaymentMethod === "mixed") && (
                              <div className="space-y-2">
                                <Label htmlFor="onlineThrough" className="text-sm font-medium">
                                  Online Through
                                </Label>
                                <Controller
                                  control={control}
                                  name="onlineThrough"
                                  render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || "upi"}>
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Select online method" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {OnlineThroughOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>
                            )}

                            {/* Discount (read-only for display, calculated automatically) */}
                            <div className="space-y-2">
                              <Label htmlFor="discount" className="text-sm font-medium">
                                Discount (Auto)
                              </Label>
                              <div className="relative">
                                <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <Input
                                  id="discount"
                                  type="number"
                                  placeholder="Auto-calculated"
                                  className="pl-10 bg-gray-50 cursor-not-allowed"
                                  value={watch("discount")}
                                  readOnly
                                  onWheel={(e) => e.currentTarget.blur()}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Payment Summary */}
                          {totalModalityCharges > 0 && (
                            <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
                              <CardContent className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div className="flex justify-between">
                                    <span>Total Charges:</span>
                                    <span className="font-semibold">₹{totalModalityCharges}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Discount:</span>
                                    <span className="text-red-600">-₹{Number(watch("discount")) || 0}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Amount to Pay:</span>
                                    <span className="font-semibold">
                                      ₹{totalModalityCharges - (Number(watch("discount")) || 0)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-lg font-bold text-green-700">
                                    <span>Amount Paid:</span>
                                    <span>₹{calculateTotalAmountPaid()}</span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Additional Notes Section */}
                    <Card className="border-l-4 border-l-orange-500">
                      <CardHeader className="pb-4">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <FileText className="h-5 w-5 text-orange-600" />
                            Additional Notes
                          </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Label htmlFor="additionalNotes" className="text-sm font-medium">
                            Notes & Comments
                          </Label>
                          <div className="relative">
                            <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                            <Textarea
                              id="additionalNotes"
                              {...register("additionalNotes")}
                              placeholder="Enter any additional notes, special instructions, or comments (optional)"
                              className="pl-10 min-h-[80px]"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Submit and View Bill Buttons */}
                    <div className="flex justify-end pt-6 border-t bg-gray-50 -mx-6 px-6 -mb-6 pb-6 gap-3">
                      {opdId && currentBillNo && watchedAppointmentType === "visithospital" && (
                        <Button
                          type="button" // Important: not a submit button
                          onClick={handleViewBill}
                          variant="outline"
                          className="flex items-center gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-medium py-3 px-8 rounded-lg transition bg-transparent"
                          disabled={isLoading}
                        >
                          <Eye className="h-5 w-5" />
                          View Bill
                        </Button>
                      )}
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition min-w-[150px]"
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Processing...
                          </div>
                        ) : opdId ? (
                          "Update Appointment"
                        ) : (
                          "Book Appointment"
                        )}
                      </Button>
                    </div>
                  </form>
                </FormProvider>
              </TabsContent>

              {/* On-Call List Tab Content */}
              <TabsContent value="oncall" className="p-6 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>On-call Appointments ({onCallAppointments.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {onCallAppointments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No on-call appointments found.</div>
                    ) : (
                      <div className="space-y-4">
                        {onCallAppointments.map((appointment) => (
                          <Card key={appointment.oncall_id} className="border-l-4 border-l-orange-500">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div className="space-y-2">
                                  <h3 className="font-semibold text-lg">{appointment.patient_detail?.name || "N/A"}</h3>
                                  <div className="space-y-1 text-sm text-gray-600">
                                    <p>
                                      <Phone className="inline h-3 w-3 mr-1" />
                                      {appointment.patient_detail?.number || "N/A"}
                                    </p>
                                    <p>
                                      <Calendar className="inline h-3 w-3 mr-1" />
                                      Age: {appointment.patient_detail?.age || "N/A"}{" "}
                                      {/* FIX: Ensure age_unit is accessed safely */}
                                      {(appointment.patient_detail as PatientDetail).age_unit || ""}
                                    </p>
                                    <p>
                                      <User className="inline h-3 w-3 mr-1" />
                                      Gender: {appointment.patient_detail?.gender || "N/A"}
                                    </p>
                                    <p>
                                      <User className="inline h-3 w-3 mr-1" />
                                      Referred by: {appointment.referredBy || "N/A"}
                                    </p>
                                    {appointment.additional_notes && (
                                      <p>
                                        <FileText className="inline h-3 w-3 mr-1" />
                                        Notes: {appointment.additional_notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col space-y-2">
                                  <Button
                                    size="sm"
                                    onClick={() => bookOnCallToOnCall(appointment)}
                                    className="bg-orange-600 hover:bg-orange-700"
                                  >
                                    Book On-call
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => bookOnCallToOPD(appointment)}>
                                    Book OPD Visit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteOnCall(appointment.oncall_id)}
                                    className="text-red-600 hover:text-red-700"
                                    disabled={isLoading}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Search Existing Patient Section - Available on both edit and book tabs if needed */}
            <Card className="shadow-lg border-0 mt-6">
              <CardHeader className="bg-gray-100 border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="h-5 w-5 text-gray-700" />
                  Search Existing Patient
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="searchUhId">Search by UHID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="searchUhId"
                      placeholder="Enter UHID or counter number (e.g., MG-070525-00001 or 00001)"
                      value={searchUhIdInput}
                      onChange={(e) => setSearchUhIdInput(e.target.value)}
                      disabled={isSearching}
                    />
                    <Button onClick={handleSearchByUhId} disabled={isSearching}>
                      {isSearching ? "Searching..." : "Search"}
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="searchPhone">Search by Phone Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="searchPhone"
                      placeholder="Enter phone number"
                      value={searchPhoneInput}
                      onChange={(e) => setSearchPhoneInput(e.target.value)}
                      disabled={isSearching}
                    />
                    <Button onClick={handleSearchByPhoneNumber} disabled={isSearching}>
                      {isSearching ? "Searching..." : "Search"}
                    </Button>
                  </div>
                </div>

                {searchedPatientResults && searchedPatientResults.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="selectPatient">Select Patient</Label>
                    <Select
                      onValueChange={(uhidValue) => {
                        const selected = searchedPatientResults.find((p) => p.uhid === uhidValue)
                        if (selected) {
                          handlePatientSelect(selected)
                          toast.success(`Selected patient: ${selected.name} (${selected.uhid})`)
                        }
                      }}
                    >
                      <SelectTrigger id="selectPatient">
                        <SelectValue placeholder="Select a patient from the list" />
                      </SelectTrigger>
                      <SelectContent>
                        {searchedPatientResults.map((patient) => (
                          <SelectItem key={patient.uhid} value={patient.uhid}>
                            {patient.name} ({patient.uhid}) - {patient.number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

export default EditAppointmentPage