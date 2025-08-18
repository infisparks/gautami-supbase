// app/ipd/billing/[ipdId]/bulk-service-modal.tsx
"use client"

import React, { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { X, Plus, Loader2, CheckCircle, AlertTriangle, Search, Trash } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

// Import the ParsedServiceItem from shared-types to ensure consistency
import { ParsedServiceItem } from "@/lib/shared-types"

interface BulkServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onAddServices: (services: ParsedServiceItem[]) => Promise<void>
  geminiApiKey: string // API key passed as prop
}

export default function BulkServiceModal({ isOpen, onClose, onAddServices, geminiApiKey }: BulkServiceModalProps) {
  const [message, setMessage] = useState("")
  const [parsedServices, setParsedServices] = useState<ParsedServiceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [consultantServices, setConsultantServices] = useState<ParsedServiceItem[]>([])
  const [otherServices, setOtherServices] = useState<ParsedServiceItem[]>([])

  const handleParseMessage = async () => {
    setError(null)
    setLoading(true)
    setParsedServices([])
    setIsConfirmed(false)
    setConsultantServices([])
    setOtherServices([])

    if (!message.trim()) {
      setError("Please enter a message to parse.")
      setLoading(false)
      return
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`
    const prompt = `Extract an array of JSON objects, each with "serviceName" (string), "quantity" (number), and "amount" (number) from this message. If quantity is not specified, assume 1. If amount is not specified, assume 0. Categorize services into two types: "doctorvisit" if the service name explicitly includes "Dr." or "doctor" followed by a name (e.g., "Dr. Sharma's Visit", "Doctor Consultation with Dr. Smith"), and "service" for all other items. If the type is "doctorvisit", extract the doctor's full name into a separate "doctorName" (string) field. Ensure the output is a valid JSON array.

    Example 1: "2x X-ray 1500, Blood Test 500, 3x Dressing 200"
    Output 1: [{"serviceName": "X-ray", "quantity": 2, "amount": 1500, "type": "service"}, {"serviceName": "Blood Test", "quantity": 1, "amount": 500, "type": "service"}, {"serviceName": "Dressing", "quantity": 3, "amount": 200, "type": "service"}]

    Example 2: "Physiotherapy 1000, ECG"
    Output 2: [{"serviceName": "Physiotherapy", "quantity": 1, "amount": 1000, "type": "service"}, {"serviceName": "ECG", "quantity": 1, "amount": 0, "type": "service"}]

    Example 3: "CT Scan 2500, 2x Injection 150, Doctor Visit Dr. Sharma 500"
    Output 3: [{"serviceName": "CT Scan", "quantity": 1, "amount": 2500, "type": "service"}, {"serviceName": "Injection", "quantity": 2, "amount": 150, "type": "service"}, {"serviceName": "Doctor Visit", "quantity": 1, "amount": 500, "type": "doctorvisit", "doctorName": "Dr. Sharma"}]

    Example 4: "Dr. Singh's Consultation 700, Lab Test 300"
    Output 4: [{"serviceName": "Dr. Singh's Consultation", "quantity": 1, "amount": 700, "type": "doctorvisit", "doctorName": "Dr. Singh"}, {"serviceName": "Lab Test", "quantity": 1, "amount": 300, "type": "service"}]

    Now, extract from this message: "${message}"`

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(`Gemini API error: ${res.status} - ${errorData.error?.message || res.statusText}`)
      }

      const json = await res.json()
      const geminiText = json.candidates?.[0]?.content?.parts?.[0]?.text

      if (!geminiText) {
        throw new Error("Gemini did not return a valid response.")
      }

      // Parse the JSON string into an array of ParsedServiceItem
      const parsed: ParsedServiceItem[] = JSON.parse(geminiText)

      if (
        !Array.isArray(parsed) ||
        parsed.some(
          (item) =>
            typeof item.serviceName !== "string" ||
            typeof item.quantity !== "number" ||
            typeof item.amount !== "number" ||
            item.quantity < 1 ||
            item.amount < 0 ||
            (item.type !== "service" && item.type !== "doctorvisit") || // Validate type
            (item.type === "doctorvisit" && typeof item.doctorName !== "string") // Validate doctorName for doctorvisit
        )
      ) {
        throw new Error("Gemini returned an unexpected data format. Please try rephrasing your message.")
      }

      const servicesWithIds = parsed.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        // Ensure type and doctorName are present, even if defaulted by Gemini.
        // If Gemini misses 'type', we might default it here, but the prompt should ideally handle it.
        // For now, assuming Gemini's output adheres to the prompt's type and doctorName inclusion.
      }));

      setParsedServices(servicesWithIds)
      setConsultantServices(servicesWithIds.filter(service => service.type === "doctorvisit"))
      setOtherServices(servicesWithIds.filter(service => service.type === "service"))
    } catch (err: any) {
      console.error("Error parsing message with Gemini:", err)
      setError(`Failed to parse message: ${err.message || "Unknown error"}. Please check your input and API key.`)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmAddServices = async () => {
    setLoading(true)
    setError(null)
    try {
      await onAddServices(parsedServices)
      setIsConfirmed(true)
      toast.success("Bulk services added successfully!")
      setTimeout(() => {
        onClose()
        setMessage("")
        setParsedServices([])
        setIsConfirmed(false)
        setConsultantServices([])
        setOtherServices([])
      }, 1000)
    } catch (err: any) {
      console.error("Error adding bulk services:", err)
      setError(`Failed to add services: ${err.message || "Unknown error"}`)
      toast.error("Failed to add bulk services. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveService = (idToRemove: string) => {
    setParsedServices((prevServices) => prevServices.filter((service) => service.id !== idToRemove))
    setConsultantServices((prevServices) => prevServices.filter((service) => service.id !== idToRemove))
    setOtherServices((prevServices) => prevServices.filter((service) => service.id !== idToRemove))
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
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
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-xl font-bold text-gray-800 flex items-center">
                  <Plus size={20} className="mr-2 text-teal-600" /> Add Bulk Services
                </Dialog.Title>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="bulk-message" className="block text-sm font-medium text-gray-700 mb-1">
                    Enter services (e.g., 2x X-ray 1500, Blood Test 500)
                  </label>
                  <textarea
                    id="bulk-message"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your services here..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y"
                  />
                  <button
                    onClick={handleParseMessage}
                    disabled={loading || !message.trim()}
                    className={`mt-2 w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                      loading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {loading ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Search size={16} className="mr-2" />
                    )}
                    {loading ? "Parsing..." : "Parse Services"}
                  </button>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center"
                  >
                    <AlertTriangle size={20} className="mr-2" />
                    <p className="text-sm">{error}</p>
                  </motion.div>
                )}

                <AnimatePresence>
                  {parsedServices.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4"
                    >
                      {consultantServices.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-lg font-semibold text-gray-800 mb-3">Consultant Visits:</h4>
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Service Name
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Qty
                                  </th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount (₹)
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Doctor Name
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {consultantServices.map((service) => (
                                  <tr key={service.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {service.serviceName}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 text-center">
                                      {service.quantity}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 text-right">
                                      {service.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                      {service.doctorName || 'N/A'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 text-center">
                                      <button
                                        onClick={() => handleRemoveService(service.id)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Remove service from list"
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {otherServices.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-lg font-semibold text-gray-800 mb-3">Other Services:</h4>
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Service Name
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Qty
                                  </th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount (₹)
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {otherServices.map((service) => (
                                  <tr key={service.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {service.serviceName}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 text-center">
                                      {service.quantity}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 text-right">
                                      {service.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 text-center">
                                      <button
                                        onClick={() => handleRemoveService(service.id)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Remove service from list"
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={() => {
                            setMessage("")
                            setParsedServices([])
                            setError(null)
                            setIsConfirmed(false)
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Clear
                        </button>
                        <button
                          onClick={handleConfirmAddServices}
                          disabled={loading || parsedServices.length === 0 || isConfirmed}
                          className={`py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center ${
                            loading || isConfirmed ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        >
                          {loading ? (
                            <Loader2 size={16} className="mr-2 animate-spin" />
                          ) : isConfirmed ? (
                            <CheckCircle size={16} className="mr-2" />
                          ) : (
                            <Plus size={16} className="mr-2" />
                          )}
                          {loading ? "Adding..." : isConfirmed ? "Added!" : "Confirm Add Services"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}