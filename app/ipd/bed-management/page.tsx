"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Bed, Plus, Search, Edit, Trash2 } from "lucide-react"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

interface BedData {
  id: string // Assuming Supabase ID is a string (UUID)
  room_type: string
  bed_number: string | number | null // Allow number, convert to string for search/display
  bed_type: string | null
  status: string
  created_at: string
}

const BedManagementPage = () => {
  const [beds, setBeds] = useState<BedData[]>([])
  const [roomTypeOptions, setRoomTypeOptions] = useState<{ value: string, label: string }[]>([])

  // Fetch unique room types from the database
  const fetchRoomTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("bed_management")
      .select("room_type")
      .neq("room_type", null)
    if (!error && data) {
      // Get unique, non-empty room types
      const uniqueTypes = Array.from(new Set(data.map((row) => row.room_type).filter(Boolean)))
      setRoomTypeOptions(
        uniqueTypes.map((type) => ({ value: type, label: type.charAt(0).toUpperCase() + type.slice(1) }))
      )
    }
  }, [])

  // Fetch room types on mount and after beds update
  useEffect(() => {
    fetchRoomTypes()
  }, [fetchRoomTypes, beds])

  const statusOptions = [
    { value: "available", label: "Available" },
    { value: "occupied", label: "Occupied" },
    { value: "maintenance", label: "Maintenance" },
    { value: "reserved", label: "Reserved" },
  ]

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingBed, setEditingBed] = useState<BedData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    roomType: "",
    bedNumber: "",
    bedType: "",
    status: "available",
  })

  // Debug function to check table structure
  const checkTableStructure = async () => {
    try {
      const { data, error } = await supabase
        .from('bed_management')
        .select('*')
        .limit(1)
      
      if (error) throw error
      console.log('Table structure:', data?.[0])
    } catch (error) {
      console.error('Error checking table structure:', error)
    }
  }

  const fetchBeds = useCallback(async () => {
    setIsLoading(true)
    try {
      // First check the table structure for debugging
      await checkTableStructure()

      const { data, error } = await supabase
        .from("bed_management")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Supabase fetch error details:", error.details)
        console.error("Supabase fetch error message:", error.message)
        console.error("Supabase fetch error code:", error.code)
        throw error
      }

      console.log("Fetched beds data:", data)
      setBeds(data || [])
    } catch (error) {
      console.error("Full error object:", error)
      toast.error(`Failed to fetch beds: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBeds()
  }, [fetchBeds])

  // Debug form data changes when editing
  useEffect(() => {
    if (isEditDialogOpen) {
      console.log("Edit dialog form data:", formData)
    }
  }, [formData, isEditDialogOpen])

  const filteredBeds = useMemo(() => {
    let currentFiltered = beds

    if (statusFilter !== "all") {
      currentFiltered = currentFiltered.filter((bed) => bed.status === statusFilter)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      currentFiltered = currentFiltered.filter(
        (bed) =>
          bed.bed_number?.toString().toLowerCase().includes(term) ||
          bed.bed_type?.toLowerCase().includes(term) ||
          bed.room_type?.toLowerCase().includes(term)
      )
    }
    return currentFiltered
  }, [beds, searchTerm, statusFilter])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.roomType || !formData.bedNumber || !formData.bedType) {
      toast.error("Please fill all required fields")
      return
    }

    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from("bed_management")
        .insert({
          room_type: formData.roomType,
          bed_number: formData.bedNumber,
          bed_type: formData.bedType,
          status: formData.status,
        })
        .select()

      if (error) {
        console.error("Insert error details:", error.details)
        throw error
      }

      toast.success("Bed added successfully!")
      resetForm()
      setIsAddDialogOpen(false)
      fetchBeds()
    } catch (error) {
      console.error("Full add error:", error)
      toast.error(`Failed to add bed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (bed: BedData) => {
    console.log("Editing bed:", bed)
    console.log("Bed number type:", typeof bed.bed_number, "Value:", bed.bed_number)
    setEditingBed(bed)
    const formDataToSet = {
      roomType: bed.room_type,
      bedNumber: bed.bed_number?.toString() || "",
      bedType: bed.bed_type || "",
      status: bed.status || "available",
    }
    console.log("Setting form data:", formDataToSet)
    setFormData(formDataToSet)
    setIsEditDialogOpen(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBed) return

    setIsLoading(true)
    console.log("Updating bed with ID:", editingBed.id)

    try {
      const { data, error } = await supabase
        .from("bed_management")
        .update({
          bed_number: formData.bedNumber,
          bed_type: formData.bedType,
          status: formData.status,
        })
        .eq("id", editingBed.id)
        .select()

      if (error) {
        console.error("Update error details:", error.details)
        console.error("Update error message:", error.message)
        console.error("Update error code:", error.code)
        throw error
      }

      console.log("Update response data:", data)
      toast.success("Bed updated successfully!")
      setIsEditDialogOpen(false)
      setEditingBed(null)
      resetForm()
      fetchBeds()
    } catch (error) {
      console.error("Full update error:", error)
      toast.error(`Failed to update bed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (bedId: string) => {
    console.log("Deleting bed with ID:", bedId)
    try {
      const { data, error } = await supabase
        .from("bed_management")
        .delete()
        .eq("id", bedId)
        .select()

      if (error) {
        console.error("Delete error details:", error.details)
        console.error("Delete error message:", error.message)
        console.error("Delete error code:", error.code)
        throw error
      }

      console.log("Delete response data:", data)
      toast.success("Bed deleted successfully!")
      fetchBeds()
    } catch (error) {
      console.error("Full delete error:", error)
      toast.error(`Failed to delete bed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const resetForm = () => {
    setFormData({
      roomType: "",
      bedNumber: "",
      bedType: "",
      status: "available",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800 border-green-200"
      case "occupied":
        return "bg-red-100 text-red-800 border-red-200"
      case "maintenance":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "reserved":
        return "bg-blue-100 text-blue-800 border-blue-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  // Use useMemo for status counts to only re-calculate when 'beds' changes
  const statusCounts = useMemo(() => {
    const counts = {
      all: beds.length,
      available: beds.filter((b) => b.status === "available").length,
      occupied: beds.filter((b) => b.status === "occupied").length,
      maintenance: beds.filter((b) => b.status === "maintenance").length,
      reserved: beds.filter((b) => b.status === "reserved").length,
    }
    console.log("Calculated status counts:", counts) // Debugging: Check calculated counts
    return counts
  }, [beds])

  const getBedsByRoomType = (roomType: string) => {
    return filteredBeds.filter((bed) => bed.room_type === roomType)
  }

  const getRoomTypeLabel = (value: string) => {
    const room = roomTypeOptions.find((r) => r.value === value)
    return room ? room.label : value
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">IPD BED MANAGEMENT</h1>
            <p className="text-gray-600">Manage hospital bed allocation and availability</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Bed
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Bed</DialogTitle>
                <DialogDescription>Add a new bed to the hospital management system</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roomType">Room Type</Label>
                  <Select
                    value={formData.roomType}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, roomType: value }))}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select room type" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypeOptions.map((room) => (
                        <SelectItem key={room.value} value={room.value}>
                          {room.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bedNumber">Bed Number</Label>
                  <Input
                    id="bedNumber"
                    placeholder="e.g. B101"
                    value={formData.bedNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, bedNumber: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bedType">Bed Type</Label>
                  <Input
                    id="bedType"
                    placeholder="e.g. Standard, ICU, Electric"
                    value={formData.bedType}
                    onChange={(e) => setFormData((prev) => ({ ...prev, bedType: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false)
                      resetForm()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Adding..." : "Add Bed"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Beds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statusCounts.all}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Available</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{statusCounts.available}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Occupied</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{statusCounts.occupied}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{statusCounts.maintenance}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Reserved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{statusCounts.reserved}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by bed number, type, or room..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { key: "all", label: "All", count: statusCounts.all },
              { key: "available", label: "Available", count: statusCounts.available },
              { key: "occupied", label: "Occupied", count: statusCounts.occupied },
              { key: "maintenance", label: "Maintenance", count: statusCounts.maintenance },
              { key: "reserved", label: "Reserved", count: statusCounts.reserved },
            ].map((filter) => (
              <Button
                key={filter.key}
                variant={statusFilter === filter.key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(filter.key)}
                className="whitespace-nowrap"
              >
                {filter.label} <span className="ml-1">({filter.count})</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Room Type Sections */}
        <div className="space-y-6">
          {roomTypeOptions.map((roomType) => {
            const roomBeds = getBedsByRoomType(roomType.value)
            // Only render room section if it has beds or if no status filter is applied
            if (roomBeds.length === 0 && statusFilter !== "all") return null

            return (
              <Card key={roomType.value} className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="capitalize">{roomType.label}</span>
                    <Badge variant="secondary">{roomBeds.length} beds</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {roomBeds.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      No beds in this room type matching current filter.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {roomBeds.map((bed) => (
                        <Card key={bed.id} className="p-3 border hover:shadow-md transition-shadow">
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <Bed className="h-5 w-5 text-blue-600" />
                                <div>
                                  <p className="font-semibold">{bed.bed_number}</p>
                                  {/* Removed parentheses from Type display */}
                                  <p className="text-sm text-gray-600">Type: {bed.bed_type}</p>
                                </div>
                              </div>
                              <div className="flex space-x-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(bed)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Bed</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete bed {bed.bed_number}? This action cannot be
                                        undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(bed.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            {/* Display status below type with improved UI */}
                            <Badge
                              className={`${getStatusColor(bed.status)} text-xs w-fit px-2 py-1 rounded-md border`}
                            >
                              {bed.status.charAt(0).toUpperCase() + bed.status.slice(1)}
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Edit Dialog */}
        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsEditDialogOpen(false)
              setEditingBed(null)
              resetForm()
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Bed</DialogTitle>
              <DialogDescription>Update bed information</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label>Room Type</Label>
                <Input
                  value={editingBed ? getRoomTypeLabel(editingBed.room_type) : ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editBedNumber">Bed Number</Label>
                <Input
                  id="editBedNumber"
                  placeholder="e.g. B101"
                  value={formData.bedNumber}
                  onChange={(e) => {
                    console.log("Bed number changed to:", e.target.value)
                    setFormData((prev) => ({ ...prev, bedNumber: e.target.value }))
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editBedType">Bed Type</Label>
                <Input
                  id="editBedType"
                  placeholder="e.g. Standard, ICU, Electric"
                  value={formData.bedType}
                  onChange={(e) => setFormData((prev) => ({ ...prev, bedType: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status} // This ensures the default value is shown
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingBed(null)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Updating..." : "Update Bed"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

export default BedManagementPage
