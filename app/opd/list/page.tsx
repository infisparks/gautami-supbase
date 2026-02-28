"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
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
import {
  RefreshCw,
  Search,
  User,
  Calendar,
  Edit,
  Trash2,
  Phone,
  IndianRupeeIcon,
  Stethoscope,
} from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns"
import Image from "next/image"

// Patient detail object
interface PatientDetail {
  patient_id: number
  name: string
  number: string | null
  age: number | null
  gender: string | null
  address: string | null
  age_unit: string | null
  uhid: string
}

// OPD Appointment as used in the component
interface OPDAppointment {
  opd_id: number
  created_at: string
  date: string
  refer_by: string | null
  service_info: any[] | null
  payment_info: any
  uhid_from_registration: string
  patient_detail: PatientDetail | null
}

const OPDListPage = () => {
  // State for main data and loading
  const [appointments, setAppointments] = useState<OPDAppointment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("today")
  const router = useRouter()

  // State for filtering and search
  const [searchTerm, setSearchTerm] = useState("")

  // State for 'All Appointments' tab search
  const [allAppointmentsSearchResults, setAllAppointmentsSearchResults] = useState<OPDAppointment[]>([])
  const [phoneSearch, setPhoneSearch] = useState("")
  const [uhidSearch, setUhidSearch] = useState("")
  const [nameSearch, setNameSearch] = useState("")
  const [dateSearch, setDateSearch] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // NEW: State for selected doctor tab on 'Today' view
  const [selectedDoctor, setSelectedDoctor] = useState("All")

  // Initial data fetch
  useEffect(() => {
    fetchInitialAppointments()
  }, [])

  // Effect to reset states when switching main tabs
  useEffect(() => {
    // Reset doctor filter when leaving the 'Today' tab
    if (activeTab !== "today") {
      setSelectedDoctor("All")
    }
    // Reset 'All Appointments' search when leaving that tab
    if (activeTab !== "all") {
      setAllAppointmentsSearchResults([])
      setHasSearched(false)
      setPhoneSearch("")
      setUhidSearch("")
      setNameSearch("")
      setDateSearch("")
    }
  }, [activeTab])

  const fetchInitialAppointments = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("opd_registration")
        .select(
          `
          opd_id, created_at, date, refer_by, service_info, payment_info, uhid,
          patient_detail:patient_detail!opd_registration_uhid_fkey (
            patient_id, name, number, age, gender, address, age_unit, uhid
          )
        `,
        )
        .order("date", { ascending: false })
        .limit(500)

      if (error) {
        toast.error("Failed to fetch appointments: " + error.message)
        return
      }

      const processedData: OPDAppointment[] = (data || []).map((appt: any) => ({
        opd_id: appt.opd_id,
        created_at: appt.created_at,
        date: appt.date,
        refer_by: appt.refer_by,
        service_info: appt.service_info,
        payment_info: appt.payment_info,
        uhid_from_registration: appt.uhid,
        patient_detail: appt.patient_detail,
      }))
      setAppointments(processedData)
    } catch (err) {
      console.error("Error fetching appointments:", err)
      toast.error("An unexpected error occurred while fetching appointments.")
    } finally {
      setIsLoading(false)
    }
  }

  // Server-side search for the 'All Appointments' tab
  const handleAllAppointmentsSearch = async () => {
    if (!phoneSearch && !uhidSearch && !nameSearch && !dateSearch) {
      toast.info("Please enter a criteria to search (Date, Name, Phone, or UHID).")
      return
    }
    if (uhidSearch && (uhidSearch.length !== 5 || !/^\d+$/.test(uhidSearch))) {
      toast.error("UHID search requires the last 5 digits.")
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    setAllAppointmentsSearchResults([])

    try {
      const selectWithInnerJoin = `
          opd_id, created_at, date, refer_by, service_info, payment_info, uhid,
          patient_detail:patient_detail!inner(
            patient_id, name, number, age, gender, address, age_unit, uhid
          )
        `
      const selectStatement = `
        opd_id, created_at, date, refer_by, service_info, payment_info, uhid,
        patient_detail:patient_detail!opd_registration_uhid_fkey (
          patient_id, name, number, age, gender, address, age_unit, uhid
        )
      `

      let query;

      if (dateSearch) {
        // Search by Date
        query = supabase
          .from("opd_registration")
          .select(selectStatement)
          .gte("date", `${dateSearch}T00:00:00`)
          .lte("date", `${dateSearch}T23:59:59`)
      } else if (nameSearch) {
        // Search by Name
        query = supabase
          .from("opd_registration")
          .select(selectWithInnerJoin)
          .ilike("patient_detail.name", `%${nameSearch}%`)
      } else if (phoneSearch) {
        // Search by Phone
        query = supabase
          .from("opd_registration")
          .select(selectWithInnerJoin)
          .eq("patient_detail.number", phoneSearch)
      } else {
        // Search by UHID
        query = supabase
          .from("opd_registration")
          .select(selectStatement)
          .like("uhid", `%${uhidSearch}`)
      }

      const { data, error } = await query.order("date", { ascending: false })

      if (error) {
        toast.error("Search failed: " + error.message)
        return
      }

      const processedData: OPDAppointment[] = (data || []).map((appt: any) => ({
        opd_id: appt.opd_id,
        created_at: appt.created_at,
        date: appt.date,
        refer_by: appt.refer_by,
        service_info: appt.service_info,
        payment_info: appt.payment_info,
        uhid_from_registration: appt.uhid,
        patient_detail: appt.patient_detail,
      }))

      setAllAppointmentsSearchResults(processedData)
      if (processedData.length === 0) {
        toast.info("No appointments found for the given criteria.")
      }
    } catch (err) {
      console.error("Error during search:", err)
      toast.error("An unexpected error occurred during the search.")
    } finally {
      setIsSearching(false)
    }
  }

  // NEW: Memoized calculation for today's appointments to avoid re-filtering
  const todayAppointments = useMemo(() => {
    if (activeTab !== "today") return []
    const today = startOfDay(new Date())
    const endOfToday = endOfDay(new Date())
    return appointments.filter((appt) => {
      try {
        const apptDate = parseISO(appt.date)
        return apptDate >= today && apptDate <= endOfToday
      } catch {
        return false
      }
    })
  }, [appointments, activeTab])

  // NEW: Memoized calculation for the list of doctors and their consultation counts for today + Casualty count
  const filterCounts = useMemo(() => {
    if (activeTab !== "today") return { doctors: {}, casualty: 0 }

    const doctorCounts: Record<string, number> = {}
    let casualty = 0

    todayAppointments.forEach((appt) => {
      let hasCasualty = false
      if (appt.service_info) {
        appt.service_info.forEach((service) => {
          if (service.type === "casualty") {
            hasCasualty = true
          }
          if (service.type === "consultation" && service.doctor) {
            doctorCounts[service.doctor] = (doctorCounts[service.doctor] || 0) + 1
          }
        })
      }
      if (hasCasualty) casualty++
    })

    return { doctors: doctorCounts, casualty }
  }, [todayAppointments, activeTab])

  // NEW: Centralized and memoized filtering logic for all tabs
  const finalFilteredAppointments = useMemo(() => {
    let listToFilter: OPDAppointment[] = []

    if (activeTab === "today") {
      listToFilter = todayAppointments
      // Handle Casualty filter
      if (selectedDoctor === "Casualty") {
        listToFilter = listToFilter.filter((appt) =>
          appt.service_info?.some((service) => service.type === "casualty"),
        )
      }
      // Further filter by the selected doctor
      else if (selectedDoctor !== "All") {
        listToFilter = listToFilter.filter((appt) =>
          appt.service_info?.some(
            (service) => service.type === "consultation" && service.doctor === selectedDoctor,
          ),
        )
      }
    } else if (activeTab === "week") {
      const startOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 })
      const endOfThisWeek = endOfWeek(new Date(), { weekStartsOn: 1 })
      listToFilter = appointments.filter((appt) => {
        try {
          const apptDate = parseISO(appt.date)
          return apptDate >= startOfThisWeek && apptDate <= endOfThisWeek
        } catch {
          return false
        }
      })
    } else {
      // The 'all' tab uses its own search results, not the main 'appointments' list
      return allAppointmentsSearchResults
    }

    // Apply the general search term filter for 'today' and 'week' tabs
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase()
      listToFilter = listToFilter.filter(
        (appt) =>
          appt.patient_detail?.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          String(appt.patient_detail?.number).toLowerCase().includes(lowerCaseSearchTerm) ||
          appt.uhid_from_registration.toLowerCase().includes(lowerCaseSearchTerm) ||
          String(appt.opd_id).toLowerCase().includes(lowerCaseSearchTerm),
      )
    }

    return listToFilter
  }, [
    appointments,
    allAppointmentsSearchResults,
    searchTerm,
    activeTab,
    selectedDoctor,
    todayAppointments,
  ])

  const getTotalAmount = (paymentInfo: any) => {
    if (!paymentInfo) return 0
    return (paymentInfo.cashAmount || 0) + (paymentInfo.onlineAmount || 0)
  }

  const getAppointmentType = (serviceInfo: any[] | null) => {
    if (!serviceInfo || serviceInfo.length === 0) return "N/A"
    const types = serviceInfo.map((s) => s.type)
    return [...new Set(types)].join(", ")
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    try {
      const date = parseISO(dateString)
      return isNaN(date.getTime()) ? format(new Date(dateString), "MMM dd, yyyy") : format(date, "MMM dd, yyyy")
    } catch (error) {
      console.error("Error formatting date:", dateString, error)
      return "Invalid Date"
    }
  }

  const handleEditAppointment = (appointment: OPDAppointment) => {
    router.push(`/opd/appointment/${appointment.opd_id}`)
  }

  const handleDeleteAppointment = async (opd_id: number) => {
    try {
      const { error } = await supabase.from("opd_registration").delete().eq("opd_id", opd_id)
      if (error) throw error
      toast.success("Appointment deleted successfully.")
      await fetchInitialAppointments()
      if (hasSearched) await handleAllAppointmentsSearch()
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment.")
    }
  }

  return (
    <Layout>
      <div className="space-y-8 bg-gray-50 min-h-screen p-0">
        <div className="flex justify-center mb-0">
          <Image
            src="/banner.png"
            alt="Hospital Banner"
            width={1300}
            height={300}
            className="rounded-lg shadow-md"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <TabsList className="grid w-full grid-cols-3 bg-gray-200 rounded-lg p-1 md:w-auto">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="all">All Appointments</TabsTrigger>
            </TabsList>

            {activeTab !== "all" ? (
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search by patient name, phone, or UHID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            ) : (
              <div className="w-full md:flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
                <Input
                  type="date"
                  value={dateSearch}
                  onChange={(e) => {
                    setDateSearch(e.target.value)
                    if (e.target.value) {
                      setPhoneSearch("")
                      setUhidSearch("")
                      setNameSearch("")
                    }
                  }}
                  className="w-full"
                />
                <Input
                  placeholder="Patient Name..."
                  value={nameSearch}
                  onChange={(e) => {
                    setNameSearch(e.target.value)
                    if (e.target.value) {
                      setPhoneSearch("")
                      setUhidSearch("")
                      setDateSearch("")
                    }
                  }}
                />
                <Input
                  placeholder="Phone Number..."
                  value={phoneSearch}
                  onChange={(e) => {
                    setPhoneSearch(e.target.value)
                    if (e.target.value) {
                      setUhidSearch("")
                      setNameSearch("")
                      setDateSearch("")
                    }
                  }}
                />
                <Input
                  placeholder="Last 5 digits UHID..."
                  value={uhidSearch}
                  onChange={(e) => {
                    setUhidSearch(e.target.value)
                    if (e.target.value) {
                      setPhoneSearch("")
                      setNameSearch("")
                      setDateSearch("")
                    }
                  }}
                />
                <Button onClick={handleAllAppointmentsSearch} disabled={isSearching} className="w-full">
                  <Search className="h-5 w-5 mr-2" />
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="today" className="space-y-6 mt-0">
            {/* NEW: Doctor filter tabs, only shown on the 'Today' tab */}
            {activeTab === "today" && (
              <Tabs value={selectedDoctor} onValueChange={setSelectedDoctor} className="w-full">
                <TabsList className="h-auto flex-wrap justify-start p-1 bg-gray-200 rounded-lg">
                  <TabsTrigger value="All" className="flex-shrink-0">
                    All ({todayAppointments.length})
                  </TabsTrigger>
                  <TabsTrigger value="Casualty" className="flex-shrink-0">
                    Casualty ({filterCounts.casualty})
                  </TabsTrigger>
                  {Object.entries(filterCounts.doctors).map(([doctor, count]) => (
                    <TabsTrigger key={doctor} value={doctor} className="flex-shrink-0">
                      {doctor} ({count})
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            <AppointmentsList
              appointments={finalFilteredAppointments}
              isLoading={isLoading}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleEditAppointment={handleEditAppointment}
              handleDeleteAppointment={handleDeleteAppointment}
              label="Today's Appointments"
              emptyMessage={searchTerm ? "No appointments found matching your search." : "No appointments for today."}
            />
          </TabsContent>
          <TabsContent value="week" className="space-y-6 mt-0">
            <AppointmentsList
              appointments={finalFilteredAppointments}
              isLoading={isLoading}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleEditAppointment={handleEditAppointment}
              handleDeleteAppointment={handleDeleteAppointment}
              label="This Week's Appointments"
              emptyMessage={
                searchTerm ? "No appointments found matching your search." : "No appointments for this week."
              }
            />
          </TabsContent>
          <TabsContent value="all" className="space-y-6 mt-0">
            <AppointmentsList
              appointments={finalFilteredAppointments}
              isLoading={isSearching}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleEditAppointment={handleEditAppointment}
              handleDeleteAppointment={handleDeleteAppointment}
              label="Search Results"
              emptyMessage={
                hasSearched
                  ? "No appointments found for your search criteria."
                  : "Enter a phone number or UHID to begin a search."
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}

// Props for the unified list component
interface AppointmentsListProps {
  appointments: OPDAppointment[]
  isLoading: boolean
  getAppointmentType: (serviceInfo: any[] | null) => string
  getTotalAmount: (paymentInfo: any) => number
  formatDate: (dateString: string) => string
  handleEditAppointment: (appointment: OPDAppointment) => void
  handleDeleteAppointment: (opd_id: number) => void
  label: string
  emptyMessage: string
}

const AppointmentsList: React.FC<AppointmentsListProps> = ({
  appointments,
  isLoading,
  getAppointmentType,
  getTotalAmount,
  formatDate,
  handleEditAppointment,
  handleDeleteAppointment,
  label,
  emptyMessage,
}) => {
  // Use a dynamic label for the badge count inside the list
  const listLabel = label === "Today's Appointments" && appointments.length > 0
    ? `${label} (${new Set(appointments.map(a => a.patient_detail?.uhid)).size} unique patients)`
    : label;

  return (
    <Card className="shadow-lg border border-gray-200 rounded-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-2xl font-bold text-gray-800">
          <span>{listLabel}</span>
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-emerald-800 px-3 py-1 text-base rounded-full"
          >
            {appointments.length} appointments
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 min-h-[300px]">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500 text-lg flex flex-col items-center">
            <RefreshCw className="h-8 w-8 animate-spin mb-4 text-emerald-600" />
            Loading appointments...
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-lg">{emptyMessage}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {appointments.map((appointment: OPDAppointment) => (
              <Card
                key={appointment.opd_id}
                className="border-l-8 border-emerald-500 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-xl overflow-hidden"
              >
                <CardContent className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="font-extrabold text-xl text-gray-900">
                        {appointment.patient_detail?.name || (
                          <span className="text-red-600">Unknown Patient</span>
                        )}
                      </h3>
                      <Badge variant="outline" className="bg-blue-100 text-blue-800 text-sm rounded-full">
                        {getAppointmentType(appointment.service_info)}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-700">
                      <span className="font-semibold">UHID:</span>
                      <span>{appointment.patient_detail?.uhid || appointment.uhid_from_registration}</span>
                    </div>
                    {!appointment.patient_detail && (
                      <div className="text-sm text-red-600">
                        <span>⚠️ No patient details found for UHID: </span>
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                          {appointment.uhid_from_registration}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span>{appointment.patient_detail?.number ?? <span className="text-red-600">N/A</span>}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <span>
                          Age: {appointment.patient_detail?.age ?? <span className="text-red-600">N/A</span>}
                          {appointment.patient_detail?.age_unit ? ` ${appointment.patient_detail.age_unit}` : ""}
                          {" | "} {appointment.patient_detail?.gender || <span className="text-red-600">N/A</span>}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span>{formatDate(appointment.date)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <IndianRupeeIcon className="h-4 w-4 text-gray-500" />
                        <span>Amount: ₹{getTotalAmount(appointment.payment_info)}</span>
                      </div>
                    </div>
                    {appointment.refer_by && (
                      <div className="text-sm text-gray-700">
                        <span className="font-semibold">Referred by:</span> {appointment.refer_by}
                      </div>
                    )}
                    {appointment.service_info && appointment.service_info.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                          <Stethoscope className="h-3 w-3" /> Services:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {appointment.service_info.map((service, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs capitalize bg-gray-100 text-gray-700">
                              {service.doctor && <strong>{service.doctor}: </strong>}
                              {service.type} {service.service && `- ${service.service}`} {service.charges && `- ₹${service.charges}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col space-y-3 sm:ml-6 w-full sm:w-auto">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleEditAppointment(appointment)}
                    >
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-red-700">Confirm Deletion</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the appointment for{" "}
                            <span className="font-semibold">{appointment.patient_detail?.name || "this patient"}</span>? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteAppointment(appointment.opd_id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default OPDListPage