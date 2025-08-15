"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserPlus, Edit, Trash2, Stethoscope, Plus, X } from "lucide-react"
// import { SpecialistOptions, DepartmentOptions } from "../../ipd/types" // THIS LINE IS REMOVED
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { AutoCompleteInput } from "@/components/global/autocompleteinput" // Re-added AutoCompleteInput

// --- START: Directly defined options (moved from external types.ts) ---

const SpecialistOptions = [
  "General Physician",
  "Pediatrics",
  "Gynecology",
  "Orthopedics",
  "Cardiology",
  "Neurology",
  "Dermatology",
  "Ophthalmology",
  "ENT Specialist",
  "Urology",
  "Nephrology",
  "Gastroenterology",
  "Pulmonology",
  "Endocrinology",
  "Oncology",
  "Rheumatology",
  "Psychiatry",
  "Anesthesiology",
  "Radiology",
  "Pathology",
  "Emergency Medicine",
  "Physical Medicine and Rehabilitation",
  "Infectious Disease",
  "Allergy and Immunology",
  "Pain Management",
  "Sports Medicine",
  "Geriatrics",
  "Palliative Medicine",
  "Nuclear Medicine",
  "Forensic Medicine",
  "Occupational Medicine",
  "Preventive Medicine",
  "Sleep Medicine",
  "Critical Care Medicine",
  "Clinical Pharmacology",
  "Medical Genetics",
  "Addiction Medicine",
  "Adolescent Medicine",
  "Aerospace Medicine",
  "Bariatric Medicine",
  "Breast Surgery",
  "Cardiac Surgery",
  "Chest Physician"
];

const DepartmentOptions = [
  { label: "Out-Patient Department (OPD)", value: "opd" },
  { label: "In-Patient Department (IPD)", value: "ipd" },
  { label: "Both (OPD & IPD)", value: "both" },
];

// --- END: Directly defined options ---

interface Doctor {
  id: string
  dr_name: string
  department: string
  specialist: string[]
  charges: any[]
}

const AddDoctorPage = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  // 1. Add state for room types
  const [roomTypeOptions, setRoomTypeOptions] = useState<{ value: string, label: string }[]>([])

  // 2. Fetch unique room types from bed_management
  useEffect(() => {
    const fetchRoomTypes = async () => {
      const { data, error } = await supabase
        .from("bed_management")
        .select("room_type")
        .neq("room_type", null)
      if (!error && data) {
        const uniqueTypes = Array.from(new Set(data.map((row) => row.room_type).filter(Boolean)))
        setRoomTypeOptions(
          uniqueTypes.map((type) => ({ value: type, label: type.charAt(0).toUpperCase() + type.slice(1) }))
        )
      }
    }
    fetchRoomTypes()
  }, [])

  // 3. Update formData to use bedCharges object
  const [formData, setFormData] = useState({
    doctorName: "",
    specialists: [] as string[],
    department: "",
    firstVisitCharge: "",
    followUpCharge: "",
    bedCharges: {} as { [roomType: string]: string },
  })

  // 4. When roomTypeOptions change, initialize bedCharges keys if not present
  useEffect(() => {
    setFormData((prev) => {
      const newBedCharges = { ...prev.bedCharges }
      roomTypeOptions.forEach(rt => {
        if (!(rt.value in newBedCharges)) newBedCharges[rt.value] = ""
      })
      // Remove keys that are no longer in roomTypeOptions
      Object.keys(newBedCharges).forEach(key => {
        if (!roomTypeOptions.find(rt => rt.value === key)) delete newBedCharges[key]
      })
      return { ...prev, bedCharges: newBedCharges }
    })
  }, [roomTypeOptions])

  useEffect(() => {
    fetchDoctors()
  }, [])

  const fetchDoctors = async () => {
    try {
      const { data, error } = await supabase.from("doctor").select("*").order("created_at", { ascending: false })

      if (error) {
        console.error("Supabase error:", error)
        throw error
      }

      console.log("Fetched doctors:", data)
      setDoctors(data || [])
    } catch (error) {
      console.error("Error fetching doctors:", error)
      toast.error("Failed to fetch doctors")
    }
  }

  // Function to fetch doctor suggestions for AutoCompleteInput
  const fetchDoctorSuggestions = async (query: string) => {
    if (!query) return []
    try {
      const { data, error } = await supabase
        .from("doctor")
        .select("id, dr_name")
        .ilike("dr_name", `%${query}%`)
        .limit(10)

      if (error) throw error
      return data.map((d) => ({ id: d.id, name: d.dr_name }))
    } catch (error) {
      console.error("Error fetching doctor suggestions:", error)
      return []
    }
  }

  const handleSpecialistToggle = (specialist: string) => {
    setFormData((prev) => ({
      ...prev,
      specialists: prev.specialists.includes(specialist)
        ? prev.specialists.filter((s) => s !== specialist)
        : [...prev.specialists, specialist],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.doctorName.trim()) {
      toast.error("Please enter doctor name")
      return
    }

    if (formData.specialists.length === 0) {
      toast.error("Please select at least one specialist")
      return
    }

    if (!formData.department) {
      toast.error("Please select department")
      return
    }

    setIsLoading(true)

    try {
      // Check for existing doctor with the same name
      const { data: existingDoctors, error: checkError } = await supabase
        .from("doctor")
        .select("id")
        .eq("dr_name", formData.doctorName.trim())

      if (checkError) throw checkError

      if (existingDoctors && existingDoctors.length > 0) {
        toast.error("A doctor with this name already exists. Please edit the existing entry or use a different name.")
        setIsLoading(false)
        return
      }

      const charges = []

      if (formData.department === "opd" || formData.department === "both") {
        charges.push({
          id: Math.random().toString(36).substr(2, 9),
          name: formData.doctorName,
          department: formData.department === "both" ? "Both" : "OPD",
          followUpCharge: Number.parseInt(formData.followUpCharge) || 0,
          firstVisitCharge: Number.parseInt(formData.firstVisitCharge) || 0,
          bedCharges: { ...formData.bedCharges },
        })
      }

      if (formData.department === "ipd") {
        charges.push({
          id: Math.random().toString(36).substr(2, 9),
          name: formData.doctorName,
          department: "IPD",
          bedCharges: { ...formData.bedCharges },
        })
      }

      console.log("Inserting doctor data:", {
        dr_name: formData.doctorName,
        department: formData.department,
        specialist: formData.specialists,
        charges: charges,
      })

      const { data, error } = await supabase
        .from("doctor")
        .insert({
          dr_name: formData.doctorName,
          department: formData.department,
          specialist: formData.specialists,
          charges: charges,
        })
        .select()

      if (error) {
        console.error("Supabase insert error:", error)
        throw error
      }

      console.log("Doctor inserted successfully:", data)
      toast.success("Doctor added successfully!")
      resetForm()
      fetchDoctors()
    } catch (error) {
      console.error("Error adding doctor:", error)
      toast.error("Failed to add doctor: " + (error as any).message)
    } finally {
      setIsLoading(false)
    }
  }

  // 5. In handleEdit, populate bedCharges from doctor.charges[0]?.bedCharges
  const handleEdit = (doctor: Doctor) => {
    setEditingDoctor(doctor)
    setFormData({
      doctorName: doctor.dr_name,
      specialists: doctor.specialist,
      department: doctor.department,
      firstVisitCharge: doctor.charges[0]?.firstVisitCharge?.toString() || "",
      followUpCharge: doctor.charges[0]?.followUpCharge?.toString() || "",
      bedCharges: doctor.charges[0]?.bedCharges || {},
    })
    setIsEditDialogOpen(true)
  }

  // 6. In handleSubmit and handleUpdate, store bedCharges in charges
  const handleUpdate = async () => {
    if (!editingDoctor) return
    setIsLoading(true)

    try {
      const charges = []

      if (formData.department === "opd" || formData.department === "both") {
        charges.push({
          id: editingDoctor.charges[0]?.id || Math.random().toString(36).substr(2, 9),
          name: formData.doctorName,
          department: formData.department === "both" ? "Both" : "OPD",
          followUpCharge: Number.parseInt(formData.followUpCharge) || 0,
          firstVisitCharge: Number.parseInt(formData.firstVisitCharge) || 0,
          bedCharges: { ...formData.bedCharges },
        })
      }

      if (formData.department === "ipd") {
        charges.push({
          id: editingDoctor.charges[0]?.id || Math.random().toString(36).substr(2, 9),
          name: formData.doctorName,
          department: "IPD",
          bedCharges: { ...formData.bedCharges },
        })
      }

      const { error } = await supabase
        .from("doctor")
        .update({
          dr_name: formData.doctorName,
          department: formData.department,
          specialist: formData.specialists,
          charges: charges,
        })
        .eq("id", editingDoctor.id)

      if (error) throw error

      toast.success("Doctor updated successfully!")
      setIsEditDialogOpen(false)
      setEditingDoctor(null)
      resetForm()
      fetchDoctors()
    } catch (error) {
      console.error("Error updating doctor:", error)
      toast.error("Failed to update doctor")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (doctorId: string) => {
    try {
      const { error } = await supabase.from("doctor").delete().eq("id", doctorId)

      if (error) throw error

      toast.success("Doctor deleted successfully!")
      fetchDoctors()
    } catch (error) {
      console.error("Error deleting doctor:", error)
      toast.error("Failed to delete doctor")
    }
  }

  const resetForm = () => {
    setFormData({
      doctorName: "",
      specialists: [],
      department: "",
      firstVisitCharge: "",
      followUpCharge: "",
      bedCharges: {},
    })
  }

  return (
    <Layout>
      <div className="space-y-8 p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-700 text-white py-10 rounded-xl shadow-lg">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3 tracking-tight">Manage Hospital Doctors</h1>
          <p className="text-lg opacity-90 max-w-2xl mx-auto">
            Effortlessly add, edit, and organize doctor profiles and their associated charges within your hospital
            system.
          </p>
        </div>

        {/* Add Doctor Form */}
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-lg rounded-xl">
          <CardHeader className="border-b border-blue-100 pb-4">
            <CardTitle className="flex items-center space-x-3 text-blue-800">
              <UserPlus className="h-6 w-6" />
              <span className="text-2xl font-bold">Add New Doctor</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Doctor Name */}
                <div className="space-y-2">
                  <Label htmlFor="doctorName">Doctor Name</Label>
                  <Input
                    id="doctorName"
                    placeholder="Enter doctor name"
                    value={formData.doctorName}
                    onChange={(e) => setFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                    required
                    autoComplete="off"
                  />
                </div>

                {/* Department - Custom Styled Dropdown */}
                <div className="space-y-2">
                  <Label className="font-medium text-gray-700">Department</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, department: value }))}
                  >
                    <SelectTrigger className="rounded-md shadow-sm">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* DepartmentOptions is now defined directly in this file */}
                      {DepartmentOptions.map((dept) => (
                        <SelectItem key={dept.value} value={dept.value}>
                          {dept.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Specialists */}
              <div className="space-y-2">
                <Label className="font-medium text-gray-700">Specialists (Select multiple)</Label>
                <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {/* SpecialistOptions is now defined directly in this file */}
                    {SpecialistOptions.map((specialist) => (
                      <div
                        key={specialist}
                        onClick={() => handleSpecialistToggle(specialist)}
                        className={`p-2 text-sm rounded-lg cursor-pointer transition-all duration-200 flex items-center justify-center text-center
                          ${formData.specialists.includes(specialist)
                            ? "bg-blue-600 text-white border-blue-600 shadow-md scale-105"
                            : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                          } border`}
                      >
                        {specialist}
                      </div>
                    ))}
                  </div>
                  {formData.specialists.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 mt-3">
                      {formData.specialists.map((specialist) => (
                        <Badge
                          key={specialist}
                          variant="secondary"
                          className="text-xs bg-blue-100 text-blue-700 border-blue-300"
                        >
                          {specialist}
                          <button
                            type="button"
                            onClick={() => handleSpecialistToggle(specialist)}
                            className="ml-1 text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Charges based on department */}
              {(formData.department === "opd" || formData.department === "both") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="firstVisitCharge" className="font-medium text-gray-700">
                      First Visit Charge (₹)
                    </Label>
                    <Input
                      id="firstVisitCharge"
                      type="number"
                      placeholder="Enter first visit charge"
                      value={formData.firstVisitCharge}
                      onChange={(e) => setFormData((prev) => ({ ...prev, firstVisitCharge: e.target.value }))}
                      className="rounded-md shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followUpCharge" className="font-medium text-gray-700">
                      Follow Up Charge (₹)
                    </Label>
                    <Input
                      id="followUpCharge"
                      type="number"
                      placeholder="Enter follow up charge"
                      value={formData.followUpCharge}
                      onChange={(e) => setFormData((prev) => ({ ...prev, followUpCharge: e.target.value }))}
                      className="rounded-md shadow-sm"
                    />
                  </div>
                </div>
              )}

              {(formData.department === "ipd" || formData.department === "both") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {roomTypeOptions.map((room) => (
                    <div className="space-y-2" key={room.value}>
                      <Label htmlFor={`charge-${room.value}`}>{room.label} Charge (₹)</Label>
                      <Input
                        id={`charge-${room.value}`}
                        type="number"
                        placeholder={`Enter ${room.label.toLowerCase()} charge`}
                        value={formData.bedCharges[room.value] || ""}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          bedCharges: { ...prev.bedCharges, [room.value]: e.target.value }
                        }))}
                        className="rounded-md shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 transition-all duration-200 py-3 text-lg rounded-md shadow-md hover:scale-[1.01]"
                disabled={isLoading}
              >
                <Plus className="h-5 w-5 mr-2" />
                {isLoading ? "Adding Doctor..." : "Add Doctor"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Existing Doctors */}
        <Card className="bg-gradient-to-br from-green-50 to-teal-50 border-green-200 shadow-lg rounded-xl">
          <CardHeader className="border-b border-green-100 pb-4">
            <CardTitle className="flex items-center space-x-3 text-green-800">
              <Stethoscope className="h-6 w-6" />
              <span className="text-2xl font-bold">Existing Doctors ({doctors.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {doctors.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-lg">
                No doctors added yet. Add your first doctor above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {doctors.map((doctor) => (
                  <Card
                    key={doctor.id}
                    className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-lg"
                  >
                    <CardContent className="p-5">
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-bold text-xl text-gray-900">{doctor.dr_name}</h3>
                          <p className="text-sm text-gray-600 capitalize font-medium">{doctor.department} Department</p>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 mb-2 font-medium">Specialists:</p>
                          <div className="flex flex-wrap gap-1">
                            {doctor.specialist.slice(0, 3).map((spec, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs bg-gray-100 text-gray-700">
                                {spec}
                              </Badge>
                            ))}
                            {doctor.specialist.length > 3 && (
                              <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700">
                                +{doctor.specialist.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>

                        {doctor.charges[0] && (
                          <div className="text-sm text-gray-700 space-y-1 bg-gray-50 p-3 rounded-md border border-gray-100">
                            {doctor.charges[0].firstVisitCharge !== undefined && (
                              <p>
                                <span className="font-medium">First Visit:</span> ₹{doctor.charges[0].firstVisitCharge}
                              </p>
                            )}
                            {doctor.charges[0].followUpCharge !== undefined && (
                              <p>
                                <span className="font-medium">Follow Up:</span> ₹{doctor.charges[0].followUpCharge}
                              </p>
                            )}
                            {doctor.charges[0].bedCharges && Object.keys(doctor.charges[0].bedCharges).length > 0 ? (
                              <>
                                {Object.entries(doctor.charges[0].bedCharges).map(([roomType, charge]) => (
                                  <p key={roomType}>
                                    <span className="font-medium">{roomType}:</span> ₹{(charge !== undefined && charge !== null && charge !== "") ? String(charge) : "N/A"}
                                  </p>
                                ))}
                              </>
                            ) : null}
                          </div>
                        )}

                        <div className="flex space-x-2 pt-3 border-t border-gray-100">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(doctor)}
                            className="flex-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Doctor</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete Dr. {doctor.dr_name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(doctor.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        {/* Changed onOpenChange to an explicit arrow function, which might
            help TypeScript resolve the type in some unusual environment cases. */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => setIsEditDialogOpen(open)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-gray-800">Edit Doctor</DialogTitle>
              <DialogDescription className="text-gray-600">Update doctor information and charges</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editDoctorName" className="text-gray-700">
                    Doctor Name
                  </Label>
                  <Input
                    id="editDoctorName"
                    value={formData.doctorName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, doctorName: e.target.value }))}
                    className="rounded-md shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Department</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, department: value }))}
                  >
                    <SelectTrigger className="rounded-md shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* DepartmentOptions is now defined directly in this file */}
                      {DepartmentOptions.map((dept) => (
                        <SelectItem key={dept.value} value={dept.value}>
                          {dept.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700">Specialists</Label>
                <div className="border border-gray-200 rounded-lg p-3 max-h-32 overflow-y-auto bg-white shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {/* SpecialistOptions is now defined directly in this file */}
                    {SpecialistOptions.map((specialist) => (
                      <div
                        key={specialist}
                        onClick={() => handleSpecialistToggle(specialist)}
                        className={`p-2 text-xs rounded cursor-pointer transition-colors
                          ${formData.specialists.includes(specialist)
                            ? "bg-blue-600 text-white"
                            : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                          }`}
                      >
                        {specialist}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {(formData.department === "opd" || formData.department === "both") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700">First Visit Charge (₹)</Label>
                    <Input
                      type="number"
                      value={formData.firstVisitCharge}
                      onChange={(e) => setFormData((prev) => ({ ...prev, firstVisitCharge: e.target.value }))}
                      className="rounded-md shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Follow Up Charge (₹)</Label>
                    <Input
                      type="number"
                      value={formData.followUpCharge}
                      onChange={(e) => setFormData((prev) => ({ ...prev, followUpCharge: e.target.value }))}
                      className="rounded-md shadow-sm"
                    />
                  </div>
                </div>
              )}

              {(formData.department === "ipd" || formData.department === "both") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {roomTypeOptions.map((room) => (
                    <div className="space-y-2" key={room.value}>
                      <Label className="text-gray-700">
                        {room.label} Charge (₹)
                      </Label>
                      <Input
                        type="number"
                        value={formData.bedCharges[room.value] || ""}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          bedCharges: { ...prev.bedCharges, [room.value]: e.target.value }
                        }))}
                        className="rounded-md shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={isLoading}>
                {isLoading ? "Updating..." : "Update Doctor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

export default AddDoctorPage