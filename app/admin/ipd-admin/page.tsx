"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase" // Assuming your Supabase client is configured here
import { toast } from "sonner" // For notifications
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  isWithinInterval,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns"
import {
  Bed,
  Users,
  User,
  Search,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  DollarSign,
  FileText,
  CreditCard,
  Plus,
  CalendarDays,
  TrendingUp,
  X,
} from "lucide-react"
import { Dialog, Transition } from "@headlessui/react" // For modals
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts" // For charts

// Assuming these are from shadcn/ui or similar component library
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Layout from "@/components/global/Layout" // Assuming your global layout component

// Register Chart.js components
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip as ChartTooltip, Legend as ChartLegend } from "chart.js" // Renamed to avoid conflict
import { Bar } from "react-chartjs-2" // Correctly import the Bar component
ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, ChartLegend)

import * as XLSX from "xlsx"
import { saveAs } from "file-saver"

// ----- Type Definitions (from your DashboardPage, for consistency) -----

// Doctor info (fetched separately)
interface Doctor {
  id: string // Assuming doctor ID is a string/UUID, or number if you changed it
  dr_name: string // Changed from 'name' to 'dr_name' to match DB
  opd_charge?: number
  department?: string
  specialist?: string
}

// Modality/Service info (from OPD service_info JSONB)
interface IModality {
  charges: number
  doctor?: string // This will now store doctor name if available, not ID
  specialist?: string
  type: "consultation" | "casualty" | "xray" | "pathology" | "ipd" | "radiology" | "custom"
  visitType?: string
  service?: string
}

// Payment info (from OPD payment_info JSONB)
interface IPayment {
  cashAmount: number
  createdAt: string
  discount: number
  onlineAmount: number
  paymentMethod: string
  totalCharges: number
  totalPaid: number
}

// Patient detail structure as it would appear in the patient_detail table
interface PatientDetailFromSupabase {
  patient_id: number; // Added missing property
  uhid: string
  name: string | null // Allowed to be null
  number: string | null // Assuming it can be null in DB
  age: number | null
  gender: string | null
  address: string | null
  age_unit: string | null; // Added missing property
  dob: string | null; // Added missing property
}

// IPD Service (from IPD `service_detail` JSONB)
// Adjusted for new IPDService structure from DashboardPage
interface IPDService {
  id?: string; // Added id for consistency, though not strictly required for display
  amount: number
  serviceName: string
  type: string // "service" or "doctorvisit"
  doctorName?: string
  createdAt: string // ISO string
}

// IPD Payment (from IPD `payment_detail` JSONB)
// Adjusted for new IPDPayment structure from DashboardPage
interface IPDPayment {
  id?: string // UUID from DB or generated, optional
  amount: number
  paymentType: "cash" | "online" | "bill_reduction" | string // Added string for flexibility
  type: "advance" | "refund" | "deposit" | "discount" | "settlement" | string // Added settlement and string
  date: string // ISO string
  createdAt: string // ISO string
  through?: string // Added 'through' for online/cash payments
  transactionType?: string; // Added based on your example
  amountType?: string; // Added based on your example
}

// Bed Management details (defined here to resolve forward reference)
interface BedManagementSupabase {
  id: number
  room_type: string
  bed_number: number
  bed_type: string
  status: string
}

// IPD Registration (from Supabase `ipd_registration` table)
interface IPDRegistrationSupabaseJoined { // Renamed from your original `IPDRegistrationSupabaseJoined` to match IPD section
  ipd_id: number
  uhid: string
  admission_date: string // date (YYYY-MM-DD string as in your INSERT)
  admission_time: string | null // time (HH:mm string as in your INSERT)
  under_care_of_doctor: string | null // Now storing doctor's name (string)
  payment_detail: IPDPayment[] | null // JSONB
  service_detail: IPDService[] | null // JSONB
  created_at: string // timestamp with time zone (UTC ISO string)
  bed_id: number | null
  bed_management: BedManagementSupabase | null; // Corrected to single object after join
  patient_detail: PatientDetailFromSupabase | null; // Corrected to single object after join
  admission_source: string | null;
  admission_type: string | null;
  discharge_date: string | null;
  relative_name: string | null;
  relative_ph_no: number | null;
  relative_address: string | null;
  discharge_summaries?: {
    discharge_type: string | null;
  }[] | null;
  // Add the financial summary properties directly to this interface
  totalGrossBill?: number;
  totalPaidAmount?: number;
  totalRefundedAmount?: number;
  totalDiscountAmount?: number;
  netBalance?: number;
}

// OT Details (from Supabase `ot_details` table)
interface OTDetailsSupabase {
  id: string // UUID of the OT record
  ipd_id: number | null // bigint null in schema
  uhid: string
  ot_type: "Major" | "Minor"
  ot_notes: string | null
  ot_date: string // timestamp with time zone (UTC ISO string from DB, even if default is Asia/Kolkata)
  created_at: string // timestamp with time zone (UTC ISO string from DB, even if default is Asia/Kolkata)
  // FIX: Switched to a LEFT join, so the result can be null.
  patient_detail: PatientDetailFromSupabase[] | null
}

// Combined types for display in tables/modals (these are simplified, use the full fetched types)
interface OPDAppointmentDisplay {
  type: "OPD"
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  modalities: IModality[]
  payment: IPayment
  message: string
  opd_id: string
  created_at: string
  refer_by: string | null
  additional_notes: string | null
  service_info: IModality[] | null
  payment_info: IPayment | null
  bill_no: number
  patient_uhid_from_opd_table: string
  appointment_type?: string | null
  visit_type?: string | null
}

interface IPDAppointmentDisplay {
  type: "IPD"
  id: string
  patientId: string
  name: string
  phone: string
  totalAmount: number // Calculated gross service amount (total services, not deposit)
  totalDeposit: number // Calculated sum of actual deposits (advance, deposit, settlement)
  totalRefunds: number // Calculated total refunds
  discount: number // Calculated discount
  remainingAmount: number // Calculated remaining amount
  roomType: string
  ipd_id: number
  uhid: string
  admission_date: string
  admission_time: string | null
  under_care_of_doctor: string | null
  payment_detail: IPDPayment[] | null
  service_detail: IPDService[] | null
  created_at: string
  bed_id: number | null
}

interface OTAppointmentDisplay {
  type: "OT"
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  message: string
  ipd_id: number | null
  uhid: string
  ot_type: "Major" | "Minor"
  ot_notes: string | null
  ot_date: string
  created_at: string
}

type CombinedAppointment = OPDAppointmentDisplay | IPDAppointmentDisplay | OTAppointmentDisplay

// BillingRecord - simplified for history modal display, derived from IPDRegistrationSupabaseJoined
export interface BillingRecord {
  patientId: string; // patient_detail.patient_id
  uhid: string; // ipd_registration.uhid
  ipdId: string; // ipd_registration.ipd_id
  name: string; // patient_detail.name
  mobileNumber: string; // patient_detail.number
  address?: string | null; // patient_detail.address
  age?: number | null; // patient_detail.age
  ageUnit?: string | null; // patient_detail.age_unit
  gender?: string | null; // patient_detail.gender
  dob?: string | null; // patient_detail.dob
  relativeName?: string | null; // ipd_registration.relative_name
  relativePhone?: number | null; // ipd_registration.relative_ph_no
  relativeAddress?: string | null; // ipd_registration.relative_address
  dischargeDate?: string | null; // ipd_registration.discharge_date
  // Corrected: These now represent actual financial summaries based on parsed payments
  totalGrossBill: number; // Sum of all services
  totalPaidAmount: number; // Sum of advances + deposits + settlements
  totalRefundedAmount: number; // Sum of refunds
  totalDiscountAmount: number; // Sum of discounts
  netBalance: number; // totalGrossBill - totalPaidAmount - totalDiscountAmount + totalRefundedAmount
  roomType?: string | null; // bed_management.room_type
  bedNumber?: number | string | null; // bed_management.bed_number
  bedType?: string | null; // bed_management.bed_type
  services: IPDService[]; // ipd_registration.service_detail
  payments: IPDPayment[]; // ipd_registration.payment_detail
  admitDate?: string | null; // ipd_registration.admission_date
  admissionTime?: string | null; // ipd_registration.admission_time
  createdAt?: string; // ipd_registration.created_at
  doctor?: string | null; // ipd_registration.under_care_of_doctor
}


// Define the target timezone offset for display
// Mumbai (Asia/Kolkata) is UTC+5:30.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // 5 hours 30 minutes in milliseconds

// ----- Manual Timezone Conversion Helpers (TOP-LEVEL SCOPE) -----

// Formats a number as Indian Rupee currency
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)

// Formats bytes into human-readable units (not directly used here, but kept from previous code)
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Converts a UTC Date object to a Date object representing the time in IST
const toIST = (utcDate: Date): Date => {
  return new Date(utcDate.getTime() + IST_OFFSET_MS)
}

// Converts an IST Date object to a Date object representing the time in UTC (for Supabase query)
const fromIST = (istDate: Date): Date => {
  return new Date(istDate.getTime() - IST_OFFSET_MS)
}


export default function IPDAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [ipdSummary, setIpdSummary] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
  })
  const [ipdTrendData, setIpdTrendData] = useState<{ date: string; admissions: number }[]>([])
  const [patients, setPatients] = useState<IPDRegistrationSupabaseJoined[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<BillingRecord | null>(null)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)

  // State for date filtering the patient list
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null)
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null)
  const [dischargeStatusFilter, setDischargeStatusFilter] = useState<string | null>(null)

  // Fetches summary data for IPD admissions (today, this week, this month) and trend data for the last 30 days
  const fetchIPDSummary = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from("ipd_registration").select("created_at") // Only need admission date for summary

      if (error) {
        console.error("Error fetching IPD summary:", error)
        toast.error("Failed to load IPD summary.")
        return
      }

      const now = new Date() // Current system time (likely UTC for Supabase server's created_at)
      const nowInIST = toIST(now); // Convert current system time to IST for accurate "today" calculations
      const todayIST = format(startOfDay(nowInIST), "yyyy-MM-dd"); // Start of today in IST
      const startOfCurrentWeekIST = startOfWeek(nowInIST, { weekStartsOn: 1 }); // Monday in IST
      const endOfCurrentWeekIST = endOfWeek(nowInIST, { weekStartsOn: 1 }); // Sunday in IST
      const startOfCurrentMonthIST = startOfMonth(nowInIST);
      const endOfCurrentMonthIST = endOfMonth(nowInIST);


      let todayCount = 0
      let thisWeekCount = 0
      let thisMonthCount = 0

      const admissionsByDate: Record<string, number> = {}

      data.forEach((record) => {
        // Parse the created_at string, then convert it to IST for comparison
        const createdAtIST = toIST(parseISO(record.created_at))
        const recordDateIST = format(createdAtIST, "yyyy-MM-dd") // Date string in IST for comparison

        // For summary counts
        if (recordDateIST === todayIST) { // Compare with IST date string
          todayCount++
        }
        if (isWithinInterval(createdAtIST, { start: startOfCurrentWeekIST, end: endOfCurrentWeekIST })) {
          thisWeekCount++
        }
        if (isWithinInterval(createdAtIST, { start: startOfCurrentMonthIST, end: endOfCurrentMonthIST })) {
          thisMonthCount++
        }

        // For trend data (last 30 days)
        const dateKey = format(createdAtIST, "MMM dd") // Use IST date for trend data keys
        admissionsByDate[dateKey] = (admissionsByDate[dateKey] || 0) + 1
      })

      setIpdSummary({
        today: todayCount,
        thisWeek: thisWeekCount,
        thisMonth: thisMonthCount,
      })

      // Generate trend data for the last 30 days, ensuring all days are present
      const trendData = []
      for (let i = 29; i >= 0; i--) {
        const dateInIST = subDays(nowInIST, i) // Calculate date in IST
        const formattedDate = format(dateInIST, "MMM dd") // Format for display
        trendData.push({
          date: formattedDate,
          admissions: admissionsByDate[formattedDate] || 0,
        })
      }
      setIpdTrendData(trendData)
    } catch (error) {
      console.error("Error in fetchIPDSummary:", error)
      toast.error("Error loading IPD summary.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetches the list of all IPD patients for the table, with date filtering
  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from("ipd_registration").select(
        `
          ipd_id,
          uhid,
          admission_date,
          admission_time,
          discharge_date,
          under_care_of_doctor,
          patient_detail (patient_id, name, number, age, gender, address, age_unit, dob, uhid),
          bed_management (id, room_type, bed_number, bed_type, status),
          service_detail,
          payment_detail,
          discharge_summaries (discharge_type)
        `, // Added service_detail, payment_detail, and discharge_summaries for table calculations if needed, or for pre-fetching for modal
      )

      // Get the UTC boundaries for the selected filter period
      // This is crucial for TIMESTAMP WITHOUT TIME ZONE columns if DB is UTC
      const startOfFilterPeriodUTC = filterStartDate ? fromIST(startOfDay(parseISO(filterStartDate))).toISOString() : null;
      const endOfFilterPeriodUTC = filterEndDate ? fromIST(endOfDay(parseISO(filterEndDate))).toISOString() : null;


      if (startOfFilterPeriodUTC) {
        query = query.gte("admission_date", startOfFilterPeriodUTC);
      }
      if (endOfFilterPeriodUTC) {
        query = query.lte("admission_date", endOfFilterPeriodUTC);
      }

      query = query.order("admission_date", { ascending: false }) // Order by most recent admissions

      const { data, error } = await query

      if (error) {
        console.error("Error fetching patients:", error)
        toast.error("Failed to load patient list.")
        setPatients([])
        return
      }

      const processedPatients: IPDRegistrationSupabaseJoined[] = (data || []).map((patient: any) => {
        const payments = (patient.payment_detail || []) as IPDPayment[];
        const services = (patient.service_detail || []) as IPDService[];

        let totalGrossBill = 0;
        services.forEach(s => {
          totalGrossBill += s.amount;
        });

        let totalPaidAmount = 0;
        let totalRefundedAmount = 0;
        let totalDiscountAmount = 0;

        payments.forEach(p => {
          const amtType = p.amountType?.toLowerCase();
          const pType = p.type?.toLowerCase();
          const pPaymentType = p.paymentType?.toLowerCase();
          const pTransactionType = p.transactionType?.toLowerCase();

          if (
            amtType === "advance" || amtType === "deposit" || amtType === "settlement" ||
            pType === "advance" || pType === "deposit" || pTransactionType === "settlement"
          ) {
            totalPaidAmount += p.amount;
          } else if (
            amtType === "refund" || pType === "refund" || pTransactionType === "refund"
          ) {
            totalRefundedAmount += p.amount;
          } else if (
            amtType === "discount" || pType === "discount" || pPaymentType === "bill_reduction"
          ) {
            totalDiscountAmount += p.amount;
          }
        });

        const netBalance = totalGrossBill - totalPaidAmount - totalDiscountAmount + totalRefundedAmount;

        return {
          ...patient,
          totalGrossBill,
          totalPaidAmount,
          totalRefundedAmount,
          totalDiscountAmount,
          netBalance,
        };
      });

      setPatients(processedPatients);
    } catch (error) {
      console.error("Error in fetchPatients:", error)
      toast.error("Error loading patient list.")
    } finally {
      setLoading(false)
    }
  }, [filterStartDate, filterEndDate]) // Re-fetch when date filters change

  // Initial data fetch on component mount
  useEffect(() => {
    fetchIPDSummary()
    fetchPatients()
  }, [fetchIPDSummary, fetchPatients])

  // Debug logging for discharge_summaries data structure
  useEffect(() => {
    if (patients.length > 0) {
      console.log('Sample patient discharge_summaries:', patients[0]?.discharge_summaries);
      console.log('Patients with discharge_summaries:', patients.filter(p => p.discharge_summaries && p.discharge_summaries.length > 0).length);
    }
  }, [patients])

  // Helper function to get discharge type from discharge_summaries array
  const getDischargeType = (dischargeSummaries: any) => {
    if (Array.isArray(dischargeSummaries) && dischargeSummaries.length > 0) {
      return dischargeSummaries[0]?.discharge_type || null;
    }
    return null;
  };

  // Helper function to get discharge status and styling
  const getDischargeStatus = (dischargeDate: string | null | undefined, bedStatus: string | null | undefined, dischargeType: string | null | undefined) => {
    if (!dischargeDate) {
      return {
        status: "Admitted",
        color: "bg-green-100 text-green-800",
        icon: "🟢"
      }
    }
    
    // Use the actual discharge_type from discharge_summaries if available
    if (dischargeType) {
      if (dischargeType === "Discharge") {
        return {
          status: "Discharged",
          color: "bg-blue-100 text-blue-800",
          icon: "🔵"
        }
      } else if (dischargeType === "Discharge Partially") {
        return {
          status: "Partially Discharged",
          color: "bg-yellow-100 text-yellow-800",
          icon: "🟡"
        }
      } else if (dischargeType === "Death") {
        return {
          status: "Death",
          color: "bg-red-100 text-red-800",
          icon: "⚫"
        }
      }
    }
    
    // Fallback to bed status logic if discharge_type is not available
    if (bedStatus === "available") {
      return {
        status: "Discharged",
        color: "bg-blue-100 text-blue-800",
        icon: "🔵"
      }
    }
    
    return {
      status: "Partially Discharged",
      color: "bg-yellow-100 text-yellow-800",
      icon: "🟡"
    }
  }

  // Filters patients based on search term and discharge status (applied after date filtering)
  const filteredPatients = useMemo(() => {
    let filtered = patients

    // Apply discharge status filter
    if (dischargeStatusFilter) {
      filtered = filtered.filter((patient) => {
        if (dischargeStatusFilter === "admitted") {
          return !patient.discharge_date
        } else if (dischargeStatusFilter === "discharged") {
          return patient.discharge_date && getDischargeType(patient.discharge_summaries) === "Discharge"
        } else if (dischargeStatusFilter === "partially") {
          return patient.discharge_date && getDischargeType(patient.discharge_summaries) === "Discharge Partially"
        } else if (dischargeStatusFilter === "death") {
          return patient.discharge_date && getDischargeType(patient.discharge_summaries) === "Death"
        }
        return true
      })
    }

    // Apply search term filter
    if (!searchTerm) {
      return filtered
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase()
    return filtered.filter(
      (patient) =>
        patient.patient_detail?.name?.toLowerCase().includes(lowerCaseSearchTerm) ||
        patient.uhid?.toLowerCase().includes(lowerCaseSearchTerm) ||
        patient.patient_detail?.number?.toString().includes(lowerCaseSearchTerm) ||
        patient.ipd_id.toString().includes(lowerCaseSearchTerm),
    )
  }, [patients, searchTerm, dischargeStatusFilter])

  // Handlers for date filter buttons
  const handleFilterToday = () => {
    const todayIST = format(toIST(new Date()), "yyyy-MM-dd") // Get today's date in IST
    setFilterStartDate(todayIST)
    setFilterEndDate(todayIST)
  }

  const handleFilterThisWeek = () => {
    const nowIST = toIST(new Date());
    setFilterStartDate(format(startOfWeek(nowIST, { weekStartsOn: 1 }), "yyyy-MM-dd"))
    setFilterEndDate(format(endOfWeek(nowIST, { weekStartsOn: 1 }), "yyyy-MM-dd"))
  }

  const handleFilterThisMonth = () => {
    const nowIST = toIST(new Date());
    setFilterStartDate(format(startOfMonth(nowIST), "yyyy-MM-dd"))
    setFilterEndDate(format(endOfMonth(nowIST), "yyyy-MM-dd"))
  }

  const handleClearDateFilters = () => {
    setFilterStartDate(null)
    setFilterEndDate(null)
    setDischargeStatusFilter(null)
  }

  const handleExportExcel = useCallback(() => {
    if (filteredPatients.length === 0) {
      toast.info("No patients to export.")
      return
    }

    const dataToExport = filteredPatients.map((patient) => {
      const dischargeType = getDischargeType(patient.discharge_summaries);
      const dischargeStatus = getDischargeStatus(patient.discharge_date, patient.bed_management?.status, dischargeType);

      return {
        "IPD ID": patient.ipd_id,
        "UHID": patient.uhid || "N/A",
        "Patient ID": patient.patient_detail?.patient_id || "N/A",
        "Patient Name": patient.patient_detail?.name || "Unknown",
        "Phone Number": patient.patient_detail?.number ? String(patient.patient_detail.number) : "N/A",
        "Age": patient.patient_detail?.age || "N/A",
        "Gender": patient.patient_detail?.gender || "N/A",
        "Address": patient.patient_detail?.address || "N/A",
        "Admission Date": patient.admission_date ? format(parseISO(patient.admission_date), "dd MMM, yyyy") : "N/A",
        "Admission Time": patient.admission_time || "N/A",
        "Discharge Date": patient.discharge_date ? format(parseISO(patient.discharge_date), "dd MMM, yyyy") : "N/A",
        "Discharge Status": dischargeStatus.status,
        "Under Care Of Doctor": patient.under_care_of_doctor || "N/A",
        "Room Type": patient.bed_management?.room_type || "N/A",
        "Bed Number": patient.bed_management?.bed_number || "N/A",
        "Total Gross Bill": patient.totalGrossBill,
        "Total Payments Received": patient.totalPaidAmount,
        "Total Refunds": patient.totalRefundedAmount,
        "Total Discount": patient.totalDiscountAmount,
        "Net Balance": patient.netBalance,
        "Admission Source": patient.admission_source || "N/A",
        "Admission Type": patient.admission_type || "N/A",
        "Relative Name": patient.relative_name || "N/A",
        "Relative Phone": patient.relative_ph_no || "N/A",
        "Relative Address": patient.relative_address || "N/A",
        "Services": (patient.service_detail || []).map((s: IPDService) => `${s.serviceName} (${s.amount})`).join("; ") || "N/A",
        "Payments": (patient.payment_detail || []).map((p: IPDPayment) => `${p.type}: ${p.amount} (${p.paymentType})`).join("; ") || "N/A",
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "IPD Patients")

    let filename = "IPD_Patients"
    if (filterStartDate && filterEndDate) {
      filename += `_Custom_${format(parseISO(filterStartDate), "yyyyMMdd")}_to_${format(parseISO(filterEndDate), "yyyyMMdd")}`
    } else if (dischargeStatusFilter) {
      filename += `_${dischargeStatusFilter}`
    }
    filename += ".xlsx"

    XLSX.writeFile(workbook, filename)
    toast.success("IPD data exported successfully!")
  }, [filteredPatients, filterStartDate, filterEndDate, dischargeStatusFilter, getDischargeType, getDischargeStatus])

  // Handles opening the patient history modal and fetching detailed data
  const handleViewPatientHistory = useCallback(async (ipdId: number) => {
    setLoading(true) // Set main loading to true while fetching modal data
    try {
      const { data, error } = await supabase
        .from("ipd_registration")
        .select(
          `*,
            patient_detail (patient_id, name, number, age, gender, address, age_unit, dob, uhid),
            bed_management (id, room_type, bed_number, bed_type, status)
          `,
        )
        .eq("ipd_id", ipdId)
        .single<IPDRegistrationSupabaseJoined>()

      if (error) {
        console.error("Error fetching IPD record for history:", error)
        toast.error("Failed to load patient history.")
        setSelectedPatientForHistory(null)
        return
      }

      if (!data) {
        toast.error("Patient history not found.")
        setSelectedPatientForHistory(null)
        return
      }

      const payments = (data.payment_detail || []) as IPDPayment[]
      const services = (data.service_detail || []) as IPDService[]

      let totalGrossBill = 0;
      services.forEach(s => {
        totalGrossBill += s.amount;
      });

      let totalPaidAmount = 0; // sum of 'advance', 'deposit', 'settlement' payments
      let totalRefundedAmount = 0; // sum of 'refund' payments
      let totalDiscountAmount = 0; // sum of 'discount' payments and 'bill_reduction' paymentType

      payments.forEach(p => {
        const amtType = p.amountType?.toLowerCase();
        const pType = p.type?.toLowerCase();
        const pPaymentType = p.paymentType?.toLowerCase();
        const pTransactionType = p.transactionType?.toLowerCase();

        if (
          amtType === "advance" || amtType === "deposit" || amtType === "settlement" ||
          pType === "advance" || pType === "deposit" || pTransactionType === "settlement"
        ) {
          totalPaidAmount += p.amount;
        } else if (
          amtType === "refund" || pType === "refund" || pTransactionType === "refund"
        ) {
          totalRefundedAmount += p.amount;
        } else if (
          amtType === "discount" || pType === "discount" || pPaymentType === "bill_reduction"
        ) {
          totalDiscountAmount += p.amount;
        }
      });

      // Net Balance calculation: Total Services - (Total Paid + Total Discount) + Total Refunds
      // Refunds increase the amount due back to the hospital, or decrease the amount owed to patient
      const netBalance = totalGrossBill - totalPaidAmount - totalDiscountAmount + totalRefundedAmount;


      const processedRecord: BillingRecord = {
        ipdId: String(data.ipd_id),
        uhid: data.uhid,
        patientId: String(data.patient_detail?.patient_id || "N/A"),
        name: data.patient_detail?.name || "Unknown",
        mobileNumber: data.patient_detail?.number ? String(data.patient_detail.number) : "N/A",
        address: data.patient_detail?.address || null,
        age: data.patient_detail?.age || null,
        ageUnit: data.patient_detail?.age_unit || null,
        gender: data.patient_detail?.gender || null,
        dob: data.patient_detail?.dob || null,
        relativeName: data.relative_name || null,
        relativePhone: data.relative_ph_no || null,
        relativeAddress: data.relative_address || null,
        dischargeDate: data.discharge_date,
        totalGrossBill: totalGrossBill, // New
        totalPaidAmount: totalPaidAmount, // New
        totalRefundedAmount: totalRefundedAmount, // New
        totalDiscountAmount: totalDiscountAmount, // New
        netBalance: netBalance, // New
        roomType: data.bed_management?.room_type || null,
        bedNumber: data.bed_management?.bed_number || null,
        bedType: data.bed_management?.bed_type || null,
        services: services,
        payments: payments,
        // Removed 'discount' as it's now covered by totalDiscountAmount
        admitDate: data.admission_date || null,
        admissionTime: data.admission_time || null,
        createdAt: data.created_at,
        doctor: data.under_care_of_doctor || null,
      }
      setSelectedPatientForHistory(processedRecord)
      setIsHistoryModalOpen(true)
    } catch (error) {
      console.error("Error fetching patient history (catch block):", error)
      toast.error("Error loading patient history details.")
      setSelectedPatientForHistory(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Helper to aggregate consultant charges for display in the modal
  const aggregatedConsultantCharges = useMemo(() => {
    if (!selectedPatientForHistory) return {} as Record<string, any>
    const consultantChargeItems = (selectedPatientForHistory.services || []).filter((s: IPDService) => s.type === "doctorvisit")
    return consultantChargeItems.reduce(
      (acc, item) => {
        const key = item.doctorName || "Unknown"
        if (!acc[key]) {
          acc[key] = {
            doctorName: key,
            visited: 0,
            totalCharge: 0,
            lastVisit: null,
            items: [],
          }
        }
        acc[key].visited += 1
        acc[key].totalCharge += item.amount
        const itemDate = item.createdAt ? new Date(item.createdAt) : new Date(0)
        const currentLastVisit = acc[key].lastVisit
        if (currentLastVisit === null || itemDate > currentLastVisit) {
          acc[key].lastVisit = itemDate
        }
        acc[key].items.push(item)
        return acc
      },
      {} as Record<
        string,
        {
          doctorName: string
          visited: number
          totalCharge: number
          lastVisit: Date | null
          items: IPDService[]
        }
      >,
    )
  }, [selectedPatientForHistory])

  // Calculate totals for the financial summary in the modal
  // These now directly use the `BillingRecord`'s pre-calculated values
  const hospitalServiceTotal = useMemo(() => {
    return selectedPatientForHistory?.totalGrossBill || 0;
  }, [selectedPatientForHistory]);

  const consultantChargeTotal = useMemo(() => {
    return (selectedPatientForHistory?.services || [])
      .filter((s: IPDService) => s.type === "doctorvisit")
      .reduce((sum, s) => sum + s.amount, 0) || 0
  }, [selectedPatientForHistory]);

  const totalBill = useMemo(() => {
    return selectedPatientForHistory?.totalGrossBill || 0; // This should just be the total services amount now
  }, [selectedPatientForHistory]);

  const balanceAmount = useMemo(() => {
    return selectedPatientForHistory?.netBalance || 0; // This is the final calculated balance
  }, [selectedPatientForHistory]);

  // Loading state for the main page
  if (loading && !selectedPatientForHistory) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-150px)] bg-gradient-to-br from-cyan-50 to-teal-50 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-teal-600" />
            <p className="text-xl text-gray-600">Loading IPD admin data...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header and Summary Cards */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">IPD Admin Dashboard</h1>
            <p className="text-gray-600">
              Overview of In-Patient Department activities •{" "}
              <span className="font-semibold text-teal-600">{patients.length} total patients</span>
            </p>
          </div>
          <button
            onClick={() => {
              fetchIPDSummary()
              fetchPatients()
            }}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className="mr-2" /> Refresh Data
          </button>
        </div>

        {/* Summary Cards: Today, This Week, This Month */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/80">Today's Admissions</CardTitle>
              <CalendarDays className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{ipdSummary.today}</div>
              <p className="text-xs text-white/70">New IPD patients today</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/80">This Week's Admissions</CardTitle>
              <TrendingUp className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{ipdSummary.thisWeek}</div>
              <p className="text-xs text-white/70">Total IPD patients this week</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-red-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/80">This Month's Admissions</CardTitle>
              <Bed className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{ipdSummary.thisMonth}</div>
              <p className="text-xs text-white/70">Total IPD patients this month</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/80">Current Status</CardTitle>
              <Users className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{patients.filter(p => !p.discharge_date).length}</div>
              <p className="text-xs text-white/70">Currently Admitted</p>
            </CardContent>
          </Card>
        </div>

        {/* IPD Trend Graph */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-teal-600" />
              <span>IPD Admissions Trend (Last 30 Days)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ipdTrendData.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={ipdTrendData}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255,255,255,0.9)",
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#333", fontWeight: "bold" }}
                      itemStyle={{ color: "#333" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="admissions"
                      stroke="#0D9488"
                      strokeWidth={2}
                      dot={{ stroke: "#0D9488", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 3, fill: "#0D9488" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>No admission data available for the last 30 days.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Discharge Status Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-teal-600" />
              <span>Discharge Status Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-600">
                  {patients.filter(p => !p.discharge_date).length}
                </div>
                <div className="text-sm text-green-700 font-medium">Currently Admitted</div>
                <div className="text-xs text-green-600 mt-1">🟢 Active Patients</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">
                  {patients.filter(p => p.discharge_date && getDischargeType(p.discharge_summaries) === "Discharge").length}
                </div>
                <div className="text-sm text-blue-700 font-medium">Fully Discharged</div>
                <div className="text-xs text-blue-600 mt-1">🔵 Complete Discharge</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600">
                  {patients.filter(p => p.discharge_date && getDischargeType(p.discharge_summaries) === "Discharge Partially").length}
                </div>
                <div className="text-sm text-yellow-700 font-medium">Partially Discharged</div>
                <div className="text-xs text-yellow-600 mt-1">🟡 Billing Pending</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="text-2xl font-bold text-red-600">
                  {patients.filter(p => p.discharge_date && getDischargeType(p.discharge_summaries) === "Death").length}
                </div>
                <div className="text-sm text-red-700 font-medium">Death Cases</div>
                <div className="text-xs text-red-600 mt-1">⚫ Deceased Patients</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patient List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-teal-600" />
              <span>IPD Patient List</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="lg:col-span-2">
                <label htmlFor="search" className="sr-only">
                  Search Patients
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="search"
                    type="text"
                    placeholder="Search by name, UHID, mobile, or IPD ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition duration-200"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={filterStartDate || ""}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={filterEndDate || ""}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="dischargeStatus" className="block text-sm font-medium text-gray-700 mb-1">
                  Discharge Status
                </label>
                <select
                  id="dischargeStatus"
                  value={dischargeStatusFilter || ""}
                  onChange={(e) => setDischargeStatusFilter(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">All Statuses</option>
                  <option value="admitted">Currently Admitted</option>
                  <option value="discharged">Fully Discharged</option>
                  <option value="partially">Partially Discharged</option>
                  <option value="death">Death Cases</option>
                </select>
              </div>
              <div className="lg:col-span-4 flex flex-wrap gap-3">
                <button
                  onClick={handleFilterToday}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  Today
                </button>
                <button
                  onClick={handleFilterThisWeek}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  This Week
                </button>
                <button
                  onClick={handleFilterThisMonth}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  This Month
                </button>
                <button
                  onClick={() => setDischargeStatusFilter("admitted")}
                  className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                >
                  Show Admitted Only
                </button>
                <button
                  onClick={() => setDischargeStatusFilter("death")}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                >
                  Show Death Cases
                </button>
                {(filterStartDate || filterEndDate || dischargeStatusFilter) && (
                  <button
                    onClick={handleClearDateFilters}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm flex items-center"
                  >
                    <X size={14} className="mr-1" /> Clear All Filters
                  </button>
                )}
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm flex items-center"
                >
                  Export to Excel
                </button>
              </div>
            </div>
            
            {/* Results Summary */}
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredPatients.length}</span> of{" "}
                <span className="font-semibold text-gray-900">{patients.length}</span> total patients
                {dischargeStatusFilter && (
                  <span className="ml-2 text-gray-500">
                    (Filtered by: {dischargeStatusFilter === "admitted" ? "Currently Admitted" : 
                                   dischargeStatusFilter === "discharged" ? "Fully Discharged" : 
                                   dischargeStatusFilter === "partially" ? "Partially Discharged" :
                                   dischargeStatusFilter === "death" ? "Death Cases" : "Unknown"})
                  </span>
                )}
              </div>
              {filteredPatients.length > 0 && (
                <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              )}
            </div>
            
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-teal-600" />
                <p>Loading patient list...</p>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-yellow-500" />
                <p>No patients found matching your criteria or selected date range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center">
                          <span>IPD ID</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2 text-gray-500" />
                          <span>Patient Information</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center">
                          <CalendarDays className="h-4 w-4 mr-2 text-gray-500" />
                          <span>Admission Date</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center">
                          <Bed className="h-4 w-4 mr-2 text-gray-500" />
                          <span>Room/Bed</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-2 text-gray-500" />
                          <span>Doctor</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center">
                          <FileText className="h-4 w-4 mr-2 text-gray-500" />
                          <span>Discharge Status</span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <div className="flex items-center justify-center">
                          <span>Actions</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPatients.map((patient) => {
                      const dischargeType = getDischargeType(patient.discharge_summaries);
        const dischargeStatus = getDischargeStatus(patient.discharge_date, patient.bed_management?.status, dischargeType)
                      return (
                        <tr key={patient.ipd_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {patient.ipd_id}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-2">
                              <div className="font-semibold text-gray-900 text-sm">
                                {patient.patient_detail?.name || "N/A"}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex items-center">
                                  <span className="font-medium text-gray-600 w-16">ID:</span>
                                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-700">
                                    {patient.patient_detail?.patient_id || "N/A"}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <span className="font-medium text-gray-600 w-16">UHID:</span>
                                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-700">
                                    {patient.uhid || "N/A"}
                                  </span>
                                </div>
                                {patient.patient_detail?.age && (
                                  <div className="flex items-center">
                                    <span className="font-medium text-gray-600 w-16">Age:</span>
                                    <span className="text-gray-700">
                                      {patient.patient_detail.age} {patient.patient_detail.age_unit || 'y'}
                                    </span>
                                  </div>
                                )}
                                {patient.patient_detail?.gender && (
                                  <div className="flex items-center">
                                    <span className="font-medium text-gray-600 w-16">Gender:</span>
                                    <span className="text-gray-700 capitalize">
                                      {patient.patient_detail.gender}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {patient.admission_date ? format(parseISO(patient.admission_date), "dd MMM, yyyy") : "N/A"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="space-y-1">
                              <div className="font-medium text-gray-700">
                                {patient.bed_management?.room_type ? 
                                  patient.bed_management.room_type.charAt(0).toUpperCase() + 
                                  patient.bed_management.room_type.slice(1).toLowerCase() : "N/A"}
                              </div>
                              <div className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded inline-block">
                                Bed {patient.bed_management?.bed_number || "N/A"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {patient.under_care_of_doctor || "N/A"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="space-y-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${dischargeStatus.color}`}>
                                <span className="mr-1">{dischargeStatus.icon}</span>
                                {dischargeStatus.status}
                              </span>
                              {patient.discharge_date && (
                                <div className="text-xs text-gray-600 font-medium">
                                  Discharged: {format(parseISO(patient.discharge_date), "dd MMM, yyyy")}
                                </div>
                              )}
                              {!patient.discharge_date && (
                                <div className="text-xs text-green-600 font-medium">
                                  Active since: {patient.admission_date ? format(parseISO(patient.admission_date), "dd MMM, yyyy") : "N/A"}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            <button
                              onClick={() => handleViewPatientHistory(patient.ipd_id)}
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                            >
                              View History <ArrowRight size={14} className="ml-1" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Patient History Modal */}
      <Transition appear show={isHistoryModalOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsHistoryModalOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-4xl w-full transform transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title className="text-2xl font-bold text-gray-800 flex items-center">
                    <FileText size={24} className="mr-3 text-teal-600" />
                    {selectedPatientForHistory?.name || "Patient"} IPD History
                  </Dialog.Title>
                  <button
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                {selectedPatientForHistory ? (
                  <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Patient Summary in Modal */}
                    <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4 rounded-lg text-white shadow-md">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div>
                          <h2 className="text-xl font-bold">{selectedPatientForHistory.name}</h2>
                          <p className="text-teal-50">UHID: {selectedPatientForHistory.uhid || "N/A"}</p>
                          <p className="text-teal-50 mt-1">
                            Under care of Dr.:{" "}
                            <span className="font-semibold">{selectedPatientForHistory.doctor || "N/A"}</span>
                          </p>
                        </div>
                        <div className="mt-2 md:mt-0 flex flex-col md:items-end">
                          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                            <Bed size={14} className="mr-2" />
                            {selectedPatientForHistory.roomType || "No Room"} •{" "}
                            {selectedPatientForHistory.bedNumber || "Unknown Bed"}
                          </div>
                          <div className="mt-2 text-teal-50 text-sm">
                            {selectedPatientForHistory.dischargeDate ? (
                              <span className="inline-flex items-center">
                                <AlertTriangle size={14} className="mr-1" /> Discharged:{" "}
                                {format(parseISO(selectedPatientForHistory.dischargeDate), "dd MMM, yyyy")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center">
                                <CalendarDays size={14} className="mr-1" /> Admitted:{" "}
                                {selectedPatientForHistory.admitDate
                                  ? format(parseISO(selectedPatientForHistory.admitDate), "dd MMM, yyyy")
                                  : "Unknown"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financial Summary in Modal */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <DollarSign size={18} className="mr-2 text-teal-600" /> Financial Overview
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-teal-50 rounded-lg p-4">
                          <p className="text-sm text-teal-600">Total Gross Bill</p>
                          <p className="text-2xl font-bold text-teal-800">
                            ₹{selectedPatientForHistory.totalGrossBill.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-cyan-50 rounded-lg p-4">
                          <p className="text-sm text-cyan-600">Total Payments Received</p>
                          <p className="text-2xl font-bold text-cyan-800">
                            ₹{selectedPatientForHistory.totalPaidAmount.toLocaleString()}
                          </p>
                        </div>
                        {selectedPatientForHistory.netBalance > 0 ? (
                          <div className="bg-red-50 rounded-lg p-4">
                            <p className="text-sm text-red-600">Due Amount</p>
                            <p className="text-2xl font-bold text-red-800">
                              ₹{selectedPatientForHistory.netBalance.toLocaleString()}
                            </p>
                          </div>
                        ) : selectedPatientForHistory.netBalance < 0 ? (
                          <div className="bg-blue-50 rounded-lg p-4">
                            <p className="text-sm text-blue-600">Amount to Refund</p>
                            <p className="text-2xl font-bold text-blue-800">
                              ₹{Math.abs(selectedPatientForHistory.netBalance).toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-green-50 rounded-lg p-4">
                            <p className="text-sm text-green-600">Balance</p>
                            <p className="text-2xl font-bold text-green-800">✓ Fully Paid</p>
                          </div>
                        )}
                      </div>
                      {(selectedPatientForHistory.totalRefundedAmount > 0 || selectedPatientForHistory.totalDiscountAmount > 0) && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                           {selectedPatientForHistory.totalRefundedAmount > 0 && (
                            <div className="bg-yellow-50 rounded-lg p-4">
                                <p className="text-sm text-yellow-600">Total Refunds</p>
                                <p className="text-xl font-bold text-yellow-800">
                                    ₹{selectedPatientForHistory.totalRefundedAmount.toLocaleString()}
                                </p>
                            </div>
                           )}
                           {selectedPatientForHistory.totalDiscountAmount > 0 && (
                            <div className="bg-purple-50 rounded-lg p-4">
                                <p className="text-sm text-purple-600">Total Discount</p>
                                <p className="text-xl font-bold text-purple-800">
                                    ₹{selectedPatientForHistory.totalDiscountAmount.toLocaleString()}
                                </p>
                            </div>
                           )}
                        </div>
                      )}
                    </div>

                    {/* Services History in Modal */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <Plus size={18} className="mr-2 text-teal-600" /> Hospital Services History
                      </h3>
                      {selectedPatientForHistory.services.filter((s) => s.type === "service").length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                          No hospital services recorded.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[500px] divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Service Name
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Amount (₹)
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Date/Time
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {selectedPatientForHistory.services
                                .filter((s) => s.type === "service")
                                .map((service, idx) => (
                                  <tr key={idx}>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                      {service.serviceName}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                      {service.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                      {service.createdAt ? new Date(service.createdAt).toLocaleString() : "N/A"}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Consultant Charges History in Modal (Conditional Rendering) */}
                    {Object.keys(aggregatedConsultantCharges).length > 0 && (
                      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                          <Users size={18} className="mr-2 text-teal-600" /> Consultant Charges History
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[500px] divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Doctor
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Visits
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Total Charge (₹)
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Last Visit
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {Object.values(aggregatedConsultantCharges).map((agg: any, idx) => (
                                <tr key={idx}>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                    {agg.doctorName}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                                    {agg.visited}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                    {agg.totalCharge.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    {agg.lastVisit ? agg.lastVisit.toLocaleString() : "N/A"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {Object.keys(aggregatedConsultantCharges).length === 0 && (
                      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                        No consultant charges recorded.
                      </div>
                    )}

                    {/* Payment History in Modal */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <CreditCard size={18} className="mr-2 text-teal-600" /> Payment History
                      </h3>
                      {selectedPatientForHistory.payments.length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">No payments recorded.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[600px] divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Amount (₹)
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Payment Type
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Type
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Through
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Date
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {selectedPatientForHistory.payments.map((payment, idx) => (
                                <tr key={payment.id || idx}>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                    {payment.amount.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                                    {payment.paymentType}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                                    {/* Display 'type' or 'transactionType' if present */}
                                    {payment.type || payment.transactionType || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                                    {payment.through || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(payment.date).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-red-500" />
                    <p>Could not load patient history.</p>
                  </div>
                )}

                <div className="mt-6 flex justify-end space-x-3">
                  {selectedPatientForHistory && (
                    <button
                      onClick={() => router.push(`/ipd/billing/${selectedPatientForHistory.ipdId}`)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                    >
                      <FileText size={16} className="mr-2" /> Go to Billing Page
                    </button>
                  )}
                  <button
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </Layout>
  )
}
