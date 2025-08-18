"use client"

import { useState, useEffect, useCallback } from "react"
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
  CalendarPlus,
  RefreshCw,
  Search,
  User,
  Calendar,
  Edit,
  Trash2,
  Phone,
  MapPin,
  Stethoscope,
  IndianRupeeIcon,
} from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { format, isToday, isThisWeek, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns"
import Image from "next/image" // Import Image component

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
  date: string // The actual appointment date (timestamp without time zone)
  refer_by: string | null
  service_info: any[] | null
  payment_info: any
  uhid_from_registration: string
  patient_detail: PatientDetail | null
}

const OPDListPage = () => {
  const [appointments, setAppointments] = useState<OPDAppointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<OPDAppointment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState("today")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchAppointments()
  }, [])

  useEffect(() => {
    filterAppointments()
  }, [appointments, searchTerm, activeTab])

  const fetchAppointments = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("opd_registration")
        .select(`
          opd_id, created_at, date, refer_by, "additional Notes", service_info, payment_info, uhid,
          patient_detail:patient_detail!opd_registration_uhid_fkey (
            patient_id, name, number, age, gender, address, age_unit, uhid
          )
        `)
        .order("date", { ascending: false })

      if (error) {
        toast.error("Failed to fetch appointments: " + error.message)
        setIsLoading(false)
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

  const filterAppointments = useCallback(() => {
    let filtered = appointments

    const today = startOfDay(new Date())
    const endOfToday = endOfDay(new Date())
    const startOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
    const endOfThisWeek = endOfWeek(new Date(), { weekStartsOn: 1 }) // Sunday

    if (activeTab === "today") {
      filtered = filtered.filter((appt) => {
        const apptDate = parseISO(appt.date) // Parse the date string from DB
        return apptDate >= today && apptDate <= endOfToday
      })
    } else if (activeTab === "week") {
      filtered = filtered.filter((appt) => {
        const apptDate = parseISO(appt.date)
        return apptDate >= startOfThisWeek && apptDate <= endOfThisWeek
      })
    }

    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (appt) =>
          appt.patient_detail?.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          String(appt.patient_detail?.number).toLowerCase().includes(lowerCaseSearchTerm) ||
          appt.uhid_from_registration.toLowerCase().includes(lowerCaseSearchTerm) ||
          String(appt.opd_id).toLowerCase().includes(lowerCaseSearchTerm),
      )
    }

    setFilteredAppointments(filtered)
  }, [appointments, searchTerm, activeTab])

  const getTotalAmount = (paymentInfo: any) => {
    if (!paymentInfo) return 0
    return (paymentInfo.cashAmount || 0) + (paymentInfo.onlineAmount || 0)
  }

  const getAppointmentType = (serviceInfo: any[] | null) => {
    if (!serviceInfo || serviceInfo.length === 0) return "N/A"
    const types = serviceInfo.map((s) => s.type)
    const uniqueTypes = [...new Set(types)]
    return uniqueTypes.join(", ")
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    try {
      // Attempt to parse as ISO string first (e.g., "2023-11-08T00:00:00.000Z")
      const date = parseISO(dateString);
      // Check if it's a valid date after parsing
      if (isNaN(date.getTime())) {
          // If not valid, try parsing as a simple date string (e.g., "2023-11-08")
          return format(new Date(dateString), "MMM dd, yyyy");
      }
      return format(date, "MMM dd, yyyy");
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return "Invalid Date";
    }
  };

  const handleEditAppointment = (appointment: OPDAppointment) => {
    router.push(`/opd/appointment/${appointment.opd_id}`)
  }

  const handleDeleteAppointment = async (opd_id: number) => {
    try {
      const { error } = await supabase.from("opd_registration").delete().eq("opd_id", opd_id)
      if (error) throw error
      toast.success("Appointment deleted successfully.")
      fetchAppointments() // Refresh the list
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment.")
    }
  }

  return (
    <Layout>
      <div className="space-y-8 bg-gray-50 min-h-screen p-0">
        {/* Banner Image */}
        <div className="flex justify-center mb-0">
          <Image
            src="/banner.png"
            alt="Hospital Banner"
            width={1300}
            height={300}
            className="rounded-lg shadow-md transition-all duration-300 hover:shadow-lg"
          />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            {/* Removed OPD Management Title */}
            {/* <h1 className="text-4xl font-extrabold text-gray-900">OPD Management</h1> */}
            {/* Removed OPD Management Description */}
            {/* <p className="text-lg text-gray-600 mt-1">View and manage outpatient department appointments</p> */}
          </div>
          {/* Removed Refresh and New Appointment Buttons */}
          {/* <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full md:w-auto">
            <Button
              onClick={() => router.push("/opd/appointment")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
            >
              <CalendarPlus className="h-5 w-5 mr-2" />
              New Appointment
            </Button>
            <Button
              variant="outline"
              onClick={fetchAppointments}
              disabled={isLoading}
              className="border-gray-300 text-gray-700 hover:bg-gray-100 bg-transparent"
            >
              <RefreshCw className={`h-5 w-5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div> */}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <TabsList className="grid w-full grid-cols-3 bg-gray-200 rounded-lg p-1 md:w-auto">
              <TabsTrigger
                value="today"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-md transition-all"
              >
                Today
              </TabsTrigger>
              <TabsTrigger
                value="week"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-md transition-all"
              >
                This Week
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-md transition-all"
              >
                All Appointments
              </TabsTrigger>
            </TabsList>
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search by patient name, phone, or UHID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
              />
            </div>
          </div>
          <TabsContent value="today" className="space-y-6 mt-0">
            <AppointmentsList
              filteredAppointments={filteredAppointments}
              isLoading={isLoading}
              getAppointmentType={getAppointmentType}
              getTotalAmount={getTotalAmount}
              formatDate={formatDate}
              handleEditAppointment={handleEditAppointment}
              handleDeleteAppointment={handleDeleteAppointment}
              searchTerm={searchTerm}
              label="Today's Appointments"
            />
          </TabsContent>
          <TabsContent value="week" className="space-y-6 mt-0">
            <Card className="mb-6 shadow-lg border border-gray-200 rounded-xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between text-2xl font-bold text-gray-800">
                  <span>This Week's Appointments</span>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 text-emerald-800 px-3 py-1 text-base rounded-full"
                  >
                    {filteredAppointments.length} appointments
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <AppointmentsList
                  filteredAppointments={filteredAppointments}
                  isLoading={isLoading}
                  getAppointmentType={getAppointmentType}
                  getTotalAmount={getTotalAmount}
                  formatDate={formatDate}
                  handleEditAppointment={handleEditAppointment}
                  handleDeleteAppointment={handleDeleteAppointment}
                  searchTerm={searchTerm}
                  label="This Week's Appointments"
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="all" className="space-y-6 mt-0">
            <Card className="mb-6 shadow-lg border border-gray-200 rounded-xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between text-2xl font-bold text-gray-800">
                  <span>All Appointments</span>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 text-emerald-800 px-3 py-1 text-base rounded-full"
                  >
                    {filteredAppointments.length} appointments
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <AppointmentsList
                  filteredAppointments={filteredAppointments}
                  isLoading={isLoading}
                  getAppointmentType={getAppointmentType}
                  getTotalAmount={getTotalAmount}
                  formatDate={formatDate}
                  handleEditAppointment={handleEditAppointment}
                  handleDeleteAppointment={handleDeleteAppointment}
                  searchTerm={searchTerm}
                  label="All Appointments"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}

interface AppointmentsListProps {
  filteredAppointments: OPDAppointment[]
  isLoading: boolean
  getAppointmentType: (serviceInfo: any[] | null) => string
  getTotalAmount: (paymentInfo: any) => number
  formatDate: (dateString: string) => string
  handleEditAppointment: (appointment: OPDAppointment) => void
  handleDeleteAppointment: (opd_id: number) => void
  searchTerm: string
  label: string
}

const AppointmentsList: React.FC<AppointmentsListProps> = ({
  filteredAppointments,
  isLoading,
  getAppointmentType,
  getTotalAmount,
  formatDate,
  handleEditAppointment,
  handleDeleteAppointment,
  searchTerm,
  label,
}) => {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-500 text-lg flex flex-col items-center">
        <RefreshCw className="h-8 w-8 animate-spin mb-4 text-emerald-600" />
        Loading appointments...
      </div>
    )
  }

  if (filteredAppointments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-lg">
        {searchTerm ? "No appointments found matching your search." : `No appointments found.`}
        <p className="mt-2 text-base">Click "New Appointment" to add one!</p>
      </div>
    )
  }

  return (
    <Card className="mb-6 shadow-lg border border-gray-200 rounded-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-2xl font-bold text-gray-800">
          <span>{label}</span>
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-emerald-800 px-3 py-1 text-base rounded-full"
          >
            {filteredAppointments.length} appointments
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500 text-lg flex flex-col items-center">
            <RefreshCw className="h-8 w-8 animate-spin mb-4 text-emerald-600" />
            Loading appointments...
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-lg">
            {searchTerm ? "No appointments found matching your search." : `No appointments found.`}
            <p className="mt-2 text-base">Click "New Appointment" to add one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredAppointments.map((appointment: OPDAppointment) => (
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
                      <Badge
                        variant="outline"
                        className="bg-blue-100 text-blue-800 px-2 py-1 text-sm rounded-full"
                      >
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
                          Age: {appointment.patient_detail?.age !== null && appointment.patient_detail?.age !== undefined
                            ? appointment.patient_detail.age
                            : <span className="text-red-600">N/A</span>}
                          {appointment.patient_detail?.age !== null &&
                            appointment.patient_detail?.age !== undefined &&
                            appointment.patient_detail?.age_unit
                            ? ` ${appointment.patient_detail.age_unit}`
                            : ""}
                          {" | "}
                          {appointment.patient_detail?.gender || <span className="text-red-600">N/A</span>}
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
                    {appointment.patient_detail?.address && (
                      <div className="flex items-center space-x-2 text-sm text-gray-700">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        <span>{appointment.patient_detail.address}</span>
                      </div>
                    )}
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
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-xs capitalize bg-gray-100 text-gray-700 border border-gray-200"
                            >
                              {service.type} {service.charges && `- ₹${service.charges}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col space-y-3 sm:ml-6 w-full sm:w-auto">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      onClick={() => handleEditAppointment(appointment)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50 bg-transparent"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-red-700">Confirm Deletion</AlertDialogTitle>
                          <AlertDialogDescription className="text-gray-700">
                            Are you sure you want to delete the appointment for{" "}
                            <span className="font-semibold">
                              {appointment.patient_detail?.name || "this patient"}
                            </span>
                            ? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-gray-300 hover:bg-gray-100">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteAppointment(appointment.opd_id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
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