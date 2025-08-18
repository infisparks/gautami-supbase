// app/dashboard/master-services/page.tsx
"use client"

import React, { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useForm, type SubmitHandler } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Edit, Trash, RefreshCw, X, DollarSign, Save } from "lucide-react"
import { Dialog, Transition } from "@headlessui/react"
// Removed Select as doctor linking is removed from here
import Layout from '@/components/global/Layout' // Import your Layout component

// Type Definitions
interface MasterService {
  id: string
  service_name: string
  amount: number
  // is_consultant and doctor_id removed as per new requirement
  created_at: string
}

// IDoctor and its interface are no longer needed in this file
// interface IDoctor { ... }

// Form Interface - Simplified
interface MasterServiceForm {
  service_name: string
  amount: number
  // is_consultant and doctor_id removed
}

// Validation Schema - Simplified
const masterServiceSchema = yup
  .object({
    service_name: yup.string().required("Service name is required"),
    amount: yup.number().typeError("Amount must be a number").positive("Must be positive").required("Amount is required"),
  })
  .required()

export default function MasterServicesPage() {
  const [masterServices, setMasterServices] = useState<MasterService[]>([])
  // doctors state is no longer needed
  // const [doctors, setDoctors] = useState<IDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<MasterService | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    // control and watch are no longer needed without conditional fields or Select component
    // control,
    // watch,
    // setValue, // setValue is also likely not needed for simple text/number inputs
  } = useForm<MasterServiceForm>({
    resolver: yupResolver(masterServiceSchema),
    defaultValues: { service_name: "", amount: 0 }, // Simplified defaults
  })

  // watchIsConsultant is no longer needed
  // const watchIsConsultant = watch("is_consultant")

  const fetchMasterServices = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from("master_services").select("*").order("service_name", { ascending: true })
      if (error) throw error
      setMasterServices(data || [])
    } catch (error) {
      console.error("Error fetching master services:", error)
      toast.error("Failed to load master services.")
    } finally {
      setLoading(false)
    }
  }, [])

  // fetchDoctors is no longer needed in this file
  // const fetchDoctors = useCallback(async () => {
  //   try {
  //     const { data, error } = await supabase.from("doctor").select("id, dr_name, department, specialist")
  //     if (error) throw error
  //     setDoctors(data || [])
  //   } catch (error) {
  //     console.error("Error fetching doctors:", error)
  //     toast.error("Failed to load doctors.")
  //   }
  // }, [])

  useEffect(() => {
    fetchMasterServices()
    // Only fetchMasterServices needed now
    // fetchDoctors()
  }, [fetchMasterServices]) // Removed fetchDoctors from dependency array

  const onSubmit: SubmitHandler<MasterServiceForm> = async (data) => {
    setLoading(true)
    try {
      if (editingService) {
        // Update existing service - Simplified
        const { error } = await supabase
          .from("master_services")
          .update({
            service_name: data.service_name,
            amount: data.amount,
            // is_consultant and doctor_id removed from update
          })
          .eq("id", editingService.id)
        if (error) throw error
        toast.success("Service updated successfully!")
      } else {
        // Add new service - Simplified
        const { error } = await supabase.from("master_services").insert({
          service_name: data.service_name,
          amount: data.amount,
          // is_consultant and doctor_id removed from insert
        })
        if (error) throw error
        toast.success("Service added successfully!")
      }
      reset()
      setIsModalOpen(false)
      setEditingService(null)
      fetchMasterServices() // Re-fetch to update the list
    } catch (error) {
      console.error("Error saving service:", error)
      toast.error("Failed to save service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (service: MasterService) => {
    setEditingService(service)
    reset({
      service_name: service.service_name,
      amount: service.amount,
      // is_consultant and doctor_id removed from reset
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this master service?")) return
    setLoading(true)
    try {
      const { error } = await supabase.from("master_services").delete().eq("id", id)
      if (error) throw error
      toast.success("Service deleted successfully!")
      fetchMasterServices()
    } catch (error) {
      console.error("Error deleting service:", error)
      toast.error("Failed to delete service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingService(null)
    reset({ service_name: "", amount: 0 }) // Simplified reset
    setIsModalOpen(true)
  }

  // doctorOptions are no longer needed
  // const doctorOptions = doctors.map((doc) => ({ value: doc.id, label: `${doc.dr_name} (${doc.specialist})` }))

  return (
    <Layout> {/* <--- ADDED THE LAYOUT WRAPPER HERE */}
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
          <DollarSign size={28} className="mr-3 text-purple-600" /> Master Services Management
        </h1>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-700">All Master Services</h2>
            <button
              onClick={openAddModal}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
            >
              <Plus size={18} className="mr-2" /> Add New Service
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-10">
              <RefreshCw className="h-10 w-10 animate-spin text-purple-600" />
              <p className="ml-3 text-gray-600">Loading master services...</p>
            </div>
          ) : masterServices.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
              No master services created yet. Click "Add New Service" to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount (₹)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Added
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {masterServices.map((service) => (
                    <tr key={service.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {service.service_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₹{service.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(service.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(service)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(service.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Master Service Modal */}
        <Transition appear show={isModalOpen} as={React.Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setIsModalOpen(false)}>
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
                leaveFrom="opacity-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="text-xl font-bold text-gray-800">
                      {editingService ? "Edit Master Service" : "Add New Master Service"}
                    </Dialog.Title>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                      <label htmlFor="service_name" className="block text-sm font-medium text-gray-700 mb-1">
                        Service Name
                      </label>
                      <input
                        type="text"
                        id="service_name"
                        {...register("service_name")}
                        placeholder="e.g., Room Charge, ECG"
                        className={`w-full px-3 py-2 rounded-lg border ${
                          errors.service_name ? "border-red-500" : "border-gray-300"
                        } focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                      />
                      {errors.service_name && (
                        <p className="text-red-500 text-xs mt-1">{errors.service_name.message}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                        Default Amount (₹)
                      </label>
                      <input
                        type="number"
                        id="amount"
                        {...register("amount", { valueAsNumber: true })}
                        placeholder="e.g., 500"
                        className={`w-full px-3 py-2 rounded-lg border ${
                          errors.amount ? "border-red-500" : "border-gray-300"
                        } focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                      />
                      {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
                    </div>
                    {/* is_consultant checkbox and doctor selection removed */}
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center ${
                          loading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {loading ? (
                          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Save size={16} className="mr-2" />
                        )}
                        {loading ? "Saving..." : editingService ? "Update Service" : "Add Service"}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition>
      </div>
    </Layout> // <--- CLOSING LAYOUT TAG
  )
}