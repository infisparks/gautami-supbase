// app/ipd/management/page.tsx
"use client"
import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Edit,
  Users, // Still useful for the table rendering function for icon, even if not directly used in the main stats section.
  Home,
  XCircle,
  CheckCircle,
  FileText,
  Clipboard,
  Stethoscope,
  RefreshCw,
  IndianRupeeIcon, // Still useful for the table rendering function for formatting, even if not directly used in the main stats section.
  Trash2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
// --- Type Definitions ---
interface PatientDetailSupabase {
  patient_id: number
  name: string
  number: number | null
  age: number | null
  gender: string | null
  address: string | null
  age_unit: string | null
  dob: string | null
  uhid: string
}
interface BedManagementSupabase {
  id: number
  room_type: string
  bed_number: number
  bed_type: string
  status: string
}
interface PaymentDetailItemSupabase {
  amount: number
  type?: string
  paymentType?: string
  amountType?: string
  transactionType?: string
}
interface ServiceDetailItemSupabase {
  // Not fetching these, but keeping interface for BillingRecord consistency if needed later
}
// New interface for discharge_summaries to get discharge_type
interface DischargeSummaryRecord {
  id: string; // UUID of the summary
  discharge_type: string | null;
  // Include other fields if you need them from the summary itself for this page
  // e.g., final_diagnosis: string | null;
}
// Updated IPDRegistrationSupabase to include discharge_summaries join
interface IPDRegistrationSupabase {
  ipd_id: number
  discharge_date: string | null // Needed for main status calculation
  uhid: string
  bed_id: number | null
  payment_detail: PaymentDetailItemSupabase[] | null
  patient_detail: PatientDetailSupabase | null
  bed_management: BedManagementSupabase | null
  // Join to discharge_summaries (will be an array if multiple exist, but should be single here)
  discharge_summaries: DischargeSummaryRecord[] | null;
}
// BillingRecord now includes dischargeType
interface BillingRecord {
  ipdId: string
  uhid: string
  patientId: number | string
  name: string
  mobileNumber: string
  depositAmount: number
  roomType: string
  bedNumber: number | string
  // Changed status to reflect specific discharge types
  status: "Active" | "Discharged" | "Discharged Partially" | "Death"
  dischargeDate: string | null
  dischargeType: string | null; // New field to store the specific discharge type
  admissionDate: string | null
  admissionTime: string | null
  age: number | null
  gender: string | null
  address: string | null
  ageUnit: string | null
  dob: string | null
  relativeName: string | null
  relativePhone: number | null
  relativeAddress: string | null
  paymentDetails: PaymentDetailItemSupabase[] | null
  serviceDetails: ServiceDetailItemSupabase[] | null
  admissionSource: string | null
  admissionType: string | null
  underCareOfDoctor: string | null
}
// --- End Type Definitions ---
export default function IPDManagementPage() {
  const [allIpdRecords, setAllIpdRecords] = useState<IPDRegistrationSupabase[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  // Updated selectedTab to include "discharge-partially"
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge" | "discharge-partially">("non-discharge")
  const [selectedWard, setSelectedWard] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()
  const fetchIPDRecords = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const { data, error } = await supabase
        .from("ipd_registration")
        .select(
          `
          ipd_id,
          discharge_date,
          uhid,
          bed_id,
          payment_detail,
          patient_detail (patient_id, name, number, age, gender, address, age_unit, dob, uhid),
          bed_management (id, room_type, bed_number, bed_type, status),
          discharge_summaries (id, discharge_type) // Fetch discharge_type from summary
          `,
        )
        .order("created_at", { ascending: false })
      if (error) {
        console.error("Error fetching IPD records:", error)
        throw error
      }
      setAllIpdRecords(data as unknown as IPDRegistrationSupabase[] || [])
    } catch (error) {
      toast.error("Failed to load IPD records.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])
  useEffect(() => {
    fetchIPDRecords()
  }, [fetchIPDRecords])
  const formatRoomType = useCallback((roomType: string) => {
    if (!roomType) return "N/A"
    const upperCaseTypes = ["icu", "nicu"]
    const lowerType = roomType.toLowerCase()
    if (upperCaseTypes.includes(lowerType)) {
      return roomType.toUpperCase()
    }
    return roomType.charAt(0).toUpperCase() + roomType.slice(1).toLowerCase()
  }, [])
  const processedRecords = useMemo(() => {
    return allIpdRecords.map((record) => {
      // Calculate deposits and refunds separately
      const totalDeposits = (record.payment_detail || []).reduce(
        (sum, payment) => {
          const amtType = payment.amountType?.toLowerCase();
          const pType = payment.type?.toLowerCase();
          const pPaymentType = payment.paymentType?.toLowerCase();
          const pTransactionType = payment.transactionType?.toLowerCase();
          
          // Only count positive contributions (deposits, advances, settlements)
          if (
            amtType === "advance" || amtType === "deposit" || amtType === "settlement" ||
            pType === "advance" || pType === "deposit" || pTransactionType === "settlement"
          ) {
            return sum + (Number(payment.amount) || 0);
          }
          return sum;
        },
        0,
      );
      
      const totalRefunds = (record.payment_detail || []).reduce(
        (sum, payment) => {
          const pType = payment.type?.toLowerCase();
          
          // Only count refunds
          if (pType === "refund") {
            return sum + (Number(payment.amount) || 0);
          }
          return sum;
        },
        0,
      );
      
      // Net deposit = deposits - refunds
      const netDeposit = totalDeposits - totalRefunds;
      // Get discharge_type from the joined discharge_summaries.
      // Assuming one summary per IPD record, or take the first if multiple somehow.
      const dischargeSummary = record.discharge_summaries?.[0];
      const dischargeType = dischargeSummary?.discharge_type || null;
      let status: BillingRecord["status"];
      if (record.discharge_date) {
          // If discharge_date is set in ipd_registration, it's fully discharged or death
          status = dischargeType === "Death" ? "Death" : "Discharged";
      } else if (dischargeType === "Discharge Partially") {
          // If no discharge_date in ipd_registration, but summary says "Discharge Partially"
          status = "Discharged Partially";
      } else {
          // No discharge date and not partially discharged means active
          status = "Active";
      }
      return {
        ipdId: String(record.ipd_id),
        uhid: record.uhid,
        patientId: record.patient_detail?.patient_id || "N/A",
        name: record.patient_detail?.name || "Unknown",
        mobileNumber: record.patient_detail?.number ? String(record.patient_detail.number) : "N/A",
        depositAmount: netDeposit,
        roomType: record.bed_management?.room_type ? formatRoomType(record.bed_management.room_type) : "N/A",
        bedNumber: record.bed_management?.bed_number || "N/A",
        status: status,
        dischargeDate: record.discharge_date,
        dischargeType: dischargeType, // Assign the fetched discharge type
        admissionDate: null, // Not fetched in this query
        admissionTime: null, // Not fetched in this query
        age: record.patient_detail?.age,
        gender: record.patient_detail?.gender,
        address: record.patient_detail?.address,
        ageUnit: record.patient_detail?.age_unit,
        dob: record.patient_detail?.dob,
        relativeName: null, // Not fetched
        relativePhone: null, // Not fetched
        relativeAddress: null, // Not fetched
        paymentDetails: record.payment_detail,
        serviceDetails: null, // Not fetched
        admissionSource: null, // Not fetched
        admissionType: null, // Not fetched
        underCareOfDoctor: null, // Not fetched
      } as BillingRecord
    })
  }, [allIpdRecords, formatRoomType])
  const nonDischargedRecords = useMemo(() => {
    return processedRecords.filter((record) => record.status === "Active")
  }, [processedRecords])
  const partiallyDischargedRecords = useMemo(() => {
    return processedRecords.filter((record) => record.status === "Discharged Partially")
  }, [processedRecords])
  const fullyDischargedRecords = useMemo(() => {
    // This includes "Discharged" (complete) and "Death"
    return processedRecords.filter((record) => record.status === "Discharged" || record.status === "Death")
  }, [processedRecords])
  const filteredRecords = useMemo(() => {
    let currentRecords: BillingRecord[] = [];
    if (selectedTab === "non-discharge") {
      currentRecords = nonDischargedRecords;
    } else if (selectedTab === "discharge-partially") {
      currentRecords = partiallyDischargedRecords;
    } else { // selectedTab === "discharge"
      currentRecords = fullyDischargedRecords;
    }
    const term = searchTerm.trim().toLowerCase()
    let records = [...currentRecords]
    // Ward filtering
    if (selectedWard !== "All") {
      records = records.filter((rec) => rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }
    // Search filtering
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          (rec.mobileNumber && rec.mobileNumber.toLowerCase().includes(term)) ||
          rec.uhid.toLowerCase().includes(term),
      )
    }
    return records
  }, [nonDischargedRecords, partiallyDischargedRecords, fullyDischargedRecords, searchTerm, selectedTab, selectedWard])
  // Get unique ward names from all records for filter options
  const uniqueWards = useMemo(() => {
    const wards = new Set<string>()
    allIpdRecords.forEach((record) => {
      if (record.bed_management?.room_type) {
        wards.add(formatRoomType(record.bed_management.room_type))
      }
    })
    return Array.from(wards)
  }, [allIpdRecords, formatRoomType])
  // Summary stats (no longer displayed directly in cards)
  // const totalPatients = processedRecords.length
  // const totalDeposits = processedRecords.reduce((sum, record) => sum + record.depositAmount, 0)
  // Format currency without leading zero issue
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }, [])
  // Event handlers
  const handleRowClick = useCallback((record: BillingRecord) => {
    router.push(`/ipd/billing/${record.ipdId}`)
    toast.info(`Navigating to billing for: ${record.name} (UHID: ${record.uhid})`)
  }, [router])
  const handleEditRecord = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ipd/appointment/${record.ipdId}`)
  }, [router])
  // Modified handleManagePatient to route to the new /ipd/manage/[ipdId] page
  const handleManagePatient = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ipd/manage/${record.ipdId}`); // Navigate to the new manage page
    toast.info(`Navigating to Manage page for: ${record.name} (IPD ID: ${record.ipdId})`);
  }, [router])

  const handleDrugChart = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    toast.info(`Drug Chart for: ${record.name} (UHID: ${record.uhid}) - Not yet implemented`)
  }, [])
  // Modified handler for OT form navigation
  const handleOTForm = useCallback((e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    // Navigate to the new OT page with IPD ID
    router.push(`/ipd/ot/${record.ipdId}`)
    toast.info(`Navigating to OT Form for: ${record.name} (UHID: ${record.uhid})`)
  }, [router])

  // Delete handler for IPD records
  const handleDeleteRecord = useCallback(async (record: BillingRecord) => {
    try {
      // First, get the bed_id from the IPD record
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("bed_id")
        .eq("ipd_id", record.ipdId)
        .single()

      if (ipdError) {
        console.error("Error fetching bed_id:", ipdError)
        toast.error("Failed to fetch bed information")
        return
      }

      const bedId = ipdData?.bed_id

      // Delete the IPD record
      const { error: deleteError } = await supabase
        .from("ipd_registration")
        .delete()
        .eq("ipd_id", record.ipdId)

      if (deleteError) {
        console.error("Error deleting IPD record:", deleteError)
        toast.error("Failed to delete IPD record")
        return
      }

      // If bed_id exists, update bed status to available
      if (bedId) {
        const { error: bedUpdateError } = await supabase
          .from("bed_management")
          .update({ status: "available" })
          .eq("id", bedId)

        if (bedUpdateError) {
          console.error("Error updating bed status:", bedUpdateError)
          toast.error("IPD record deleted but failed to update bed status")
          return
        }
      }

      toast.success(`Successfully deleted IPD record for ${record.name}`)
      // Refresh the records
      fetchIPDRecords()
    } catch (error) {
      console.error("Error in delete operation:", error)
      toast.error("Failed to delete IPD record")
    }
  }, [fetchIPDRecords])
  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-xl text-gray-600">Loading IPD records...</p>
          </div>
        </div>
      </Layout>
    )
  }
  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-2">IPD Billing Management</h1>
            <p className="text-slate-500">Manage and track in-patient billing records and admissions</p>
          </div>
          {/* Removed Stats Cards */}
          {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="bg-white shadow-lg border border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Total Patients</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Users className="h-6 w-6 text-blue-500 mr-3" />
                  <span className="text-3xl font-bold text-slate-800">{totalPatients}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">All IPD patients registered</p>
              </CardContent>
            </Card>
            <Card className="bg-white shadow-lg border border-green-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-600">Net Deposits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <IndianRupeeIcon className="h-6 w-6 text-green-500 mr-3" />
                  <span className="text-3xl font-bold text-slate-800">{formatCurrency(totalDeposits)}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Net deposits after refunds</p>
              </CardContent>
            </Card>
          </div> */}
          {/* Tabs & Filters */}
          <Card className="mb-8 shadow-lg border border-slate-200">
            <CardContent className="p-6">
              <Tabs
                defaultValue="non-discharge"
                onValueChange={(value) => setSelectedTab(value as "non-discharge" | "discharge" | "discharge-partially")}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div className="overflow-x-auto">
                    <TabsList className="bg-slate-100 flex gap-2 whitespace-nowrap p-1 rounded-lg">
                      <TabsTrigger
                        value="non-discharge"
                        className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 px-4 py-2 rounded-md"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Non-Discharged ({nonDischargedRecords.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="discharge-partially"
                        className="data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 px-4 py-2 rounded-md"
                      >
                        <Clipboard className="h-4 w-4 mr-2" />
                        Partially Discharged ({partiallyDischargedRecords.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="discharge"
                        className="data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200 px-4 py-2 rounded-md"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Discharged ({fullyDischargedRecords.length})
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <div className="flex gap-3 items-center w-full md:w-auto">
                    <div className="relative flex-grow">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name, ID, mobile, or UHID"
                        className="pl-10 w-full"
                      />
                    </div>
                    <Button
                      onClick={fetchIPDRecords}
                      disabled={Boolean(isRefreshing)} // Applied Boolean() fix
                      variant="outline"
                      className="shrink-0 bg-transparent"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                      <span className="sr-only">Refresh</span>
                    </Button>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Home className="h-5 w-5 text-slate-600" />
                    <h3 className="font-semibold text-slate-800">Filter by Room Type</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={selectedWard === "All" ? "default" : "outline"}
                      className={`cursor-pointer px-3 py-1 text-sm rounded-full transition-colors ${
                        selectedWard === "All"
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                      }`}
                      onClick={() => setSelectedWard("All")}
                    >
                      All Rooms
                    </Badge>
                    {uniqueWards.map((ward) => (
                      <Badge
                        key={ward}
                        variant={selectedWard === ward ? "default" : "outline"}
                        className={`cursor-pointer px-3 py-1 text-sm rounded-full transition-colors ${
                          selectedWard === ward
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                        }`}
                        onClick={() => setSelectedWard(ward)}
                      >
                        {ward}
                      </Badge>
                    ))}
                  </div>
                </div>
                <TabsContent value="non-discharge" className="mt-0">
                  {renderPatientsTable(
                    filteredRecords,
                    handleRowClick,
                    handleEditRecord,
                    handleManagePatient,
                    handleDrugChart,
                    handleOTForm,
                    handleDeleteRecord,
                    isLoading,
                    formatCurrency,
                  )}
                </TabsContent>
                <TabsContent value="discharge-partially" className="mt-0">
                  {renderPatientsTable(
                    filteredRecords,
                    handleRowClick,
                    handleEditRecord,
                    handleManagePatient,
                    handleDrugChart,
                    handleOTForm,
                    handleDeleteRecord,
                    isLoading,
                    formatCurrency,
                  )}
                </TabsContent>
                <TabsContent value="discharge" className="mt-0">
                  {renderPatientsTable(
                    filteredRecords,
                    handleRowClick,
                    handleEditRecord,
                    handleManagePatient,
                    handleDrugChart,
                    handleOTForm,
                    handleDeleteRecord,
                    isLoading,
                    formatCurrency,
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  )
}
function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleEditRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleManagePatient: (e: React.MouseEvent, record: BillingRecord) => void,
  handleDrugChart: (e: React.MouseEvent, record: BillingRecord) => void,
  handleOTForm: (e: React.MouseEvent, record: BillingRecord) => void,
  handleDeleteRecord: (record: BillingRecord) => void,
  isLoading: boolean,
  formatCurrency: (amount: number) => string,
) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-lg text-gray-600">Loading patients...</p>
      </div>
    )
  }
  if (records.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-slate-200 shadow-sm">
        <Users className="h-16 w-16 text-slate-300 mx-auto mb-6" />
        <h3 className="text-xl font-semibold text-slate-700 mb-2">No patients found</h3>
        <p className="text-slate-500">Try adjusting your filters or search criteria.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-md bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-semibold text-slate-600">#</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Patient Name</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Mobile Number</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Net Deposit (₹)</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Room Type</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record, index) => (
            <tr
              key={record.ipdId}
              onClick={() => handleRowClick(record)}
              className="hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <td className="px-4 py-3 text-slate-700">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{record.name}</div>
                <div className="text-xs text-slate-500">ID: {record.ipdId.substring(0, 8)}...</div>
                <div className="text-xs text-slate-500">UHID: {record.uhid}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{record.mobileNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{formatCurrency(record.depositAmount)}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {record.roomType || "N/A"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {record.status === "Discharged" ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Discharged
                  </Badge>
                ) : record.status === "Discharged Partially" ? (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    Partially Discharged
                  </Badge>
                ) : record.status === "Death" ? (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    Death
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Active
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2 flex-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleEditRecord(e, record)}
                    className="text-blue-600 hover:bg-blue-50 border-blue-200 whitespace-nowrap"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleManagePatient(e, record)}
                    className="text-slate-700 hover:bg-slate-100 border-slate-200 whitespace-nowrap"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDrugChart(e, record)}
                    className="text-slate-700 hover:bg-slate-100 border-slate-200 whitespace-nowrap"
                  >
                    <Clipboard className="h-4 w-4 mr-1" />
                    Drug Chart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleOTForm(e, record)}
                    className="text-purple-600 hover:bg-purple-50 border-purple-200 whitespace-nowrap"
                  >
                    <Stethoscope className="h-4 w-4 mr-1" />
                    OT
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        className="text-red-600 hover:bg-red-50 border-red-200 whitespace-nowrap"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete IPD Record</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete the IPD record for {record.name} (UHID: {record.uhid})? 
                          This action will also make the bed available again. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteRecord(record)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}