// app/ipd/billing/[ipdId]/bulk-service-modal.tsx
"use client"

import React, { Fragment, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { X, Plus, Loader2, CheckCircle, AlertTriangle, Search, Trash } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

// Import the ParsedServiceItem from shared-types to ensure consistency
import { ParsedServiceItem } from "@/lib/shared-types"

// Utility function to parse services manually
const parseServicesManually = (message: string): ParsedServiceItem[] => {
  const lines = message.split(/\r?\n/).filter((line) => line.trim() !== "");
  const parsedItems: ParsedServiceItem[] = [];

  lines.forEach((line) => {
    const regex = /(.+?)\s+(\d+)\s+₹\s*([\d.,]+)/; // Regex to capture service name, quantity, and amount
    const match = line.match(regex);

    if (match) {
      const fullServiceName = match[1].trim();
      const quantity = parseInt(match[2], 10);
      const amount = parseFloat(match[3].replace(/,/g, "")); // Remove commas for parsing

      let serviceName = fullServiceName;
      let type: "service" | "doctorvisit" = "service";
      let doctorName: string | undefined = undefined;

      const doctorRegex = /(Dr\.?\s*[A-Za-z]+\s*[A-Za-z]*|Doctor\s*[A-Za-z]+\s*[A-Za-z]*)/i;
      const doctorMatch = fullServiceName.match(doctorRegex);

      if (doctorMatch) {
        type = "doctorvisit";
        doctorName = doctorMatch[1].trim();
        // Optionally, remove doctor name from serviceName if desired, or keep as is
        // For now, keeping fullServiceName as is, as it contains the doctor's name
      }

      parsedItems.push({
        id: crypto.randomUUID(),
        serviceName: serviceName,
        quantity: quantity,
        amount: amount,
        type: type,
        ...(doctorName && { doctorName: doctorName }),
      });
    } else {
      console.warn("Could not parse line:", line);
      // Handle unparseable lines, e.g., by adding an error or skipping
    }
  });

  return parsedItems;
};

interface BulkServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onAddServices: (services: ParsedServiceItem[]) => Promise<void>
  // geminiApiKey: string // API key passed as prop
}

export default function BulkServiceModal({ isOpen, onClose, onAddServices }: BulkServiceModalProps) {
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

    try {
      const parsed = parseServicesManually(message);

      if (!Array.isArray(parsed) || parsed.some((item) => typeof item.serviceName !== "string" || typeof item.quantity !== "number" || typeof item.amount !== "number" || item.quantity < 1 || item.amount < 0 || (item.type !== "service" && item.type !== "doctorvisit") || (item.type === "doctorvisit" && typeof item.doctorName !== "string"))) {
        throw new Error("Parsed data format is unexpected. Please check your message format.");
      }

      const servicesWithIds = parsed.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));

      setParsedServices(servicesWithIds);
      setConsultantServices(servicesWithIds.filter((service) => service.type === "doctorvisit"));
      setOtherServices(servicesWithIds.filter((service) => service.type === "service"));
    } catch (err: any) {
      console.error("Error parsing message:", err);
      setError(`Failed to parse message: ${err.message || "Unknown error"}. Please check your input format.`);
    } finally {
      setLoading(false);
    }
  };

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