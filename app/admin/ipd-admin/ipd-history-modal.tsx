"use client"

import React, { useState, useEffect } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { format, parseISO } from "date-fns"
import {
  X,
  FileText,
  Plus,
  CreditCard,
  UserPlus,
  Bed,
  AlertTriangle,
  Calendar,
  User,
  Phone,
  MapPin,
  Tag,
} from "lucide-react"

// Re-import type definitions from the original file
interface PaymentDetailItemSupabase {
  id: string
  amount: number
  createdAt: string
  date: string
  paymentType: string
  type: "advance" | "refund" | "deposit" | "discount"
  through?: string
  amountType?: string // Added for new logic
}

interface ServiceDetailItemSupabase {
  id: string
  amount: number
  createdAt: string
  doctorName: string
  serviceName: string
  type: "service" | "doctorvisit"
}

export interface BillingRecord {
  patientId: string
  uhid: string
  ipdId: string
  name: string
  mobileNumber: string
  address?: string | null
  age?: number | null
  ageUnit?: string | null
  gender?: string | null
  dob?: string | null
  relativeName?: string | null
  relativePhone?: number | null
  relativeAddress?: string | null
  dischargeDate?: string | null
  totalDeposit: number
  roomType?: string | null
  bedNumber?: number | string | null
  bedType?: string | null
  services: ServiceDetailItemSupabase[]
  payments: PaymentDetailItemSupabase[]
  discount: number
  admitDate?: string | null
  admissionTime?: string | null
  createdAt?: string
  doctor?: string | null
}

interface IpdHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  record: BillingRecord | null
}

const IpdHistoryModal: React.FC<IpdHistoryModalProps> = ({ isOpen, onClose, record }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "payments" | "consultants">("overview")

  useEffect(() => {
    if (isOpen) {
      setActiveTab("overview") // Reset tab when modal opens
    }
  }, [isOpen])

  if (!record) return null

  // Re-implement grouping logic from BillingPage for display
  const getGroupedServices = (services: ServiceDetailItemSupabase[]) => {
    const grouped: Record<string, { serviceName: string; amount: number; quantity: number; createdAt: string }> = {}
    services.forEach((item) => {
      if (item.type === "service") {
        const key = `${item.serviceName}-${item.amount}`
        if (grouped[key]) {
          grouped[key].quantity += 1
        } else {
          grouped[key] = {
            serviceName: item.serviceName,
            amount: item.amount,
            quantity: 1,
            createdAt: item.createdAt || new Date().toLocaleString(),
          }
        }
      }
    })
    return Object.values(grouped)
  }

  const serviceItems = record.services.filter((s) => s.type === "service") || []
  const groupedServiceItems = getGroupedServices(serviceItems)
  const hospitalServiceTotal = serviceItems.reduce((sum, s) => sum + s.amount, 0)

  const consultantChargeItems = record.services.filter((s) => s.type === "doctorvisit") || []
  const consultantChargeTotal = consultantChargeItems.reduce((sum, s) => sum + s.amount, 0)

  // Calculate totalDeposit and totalRefunds using amountType as primary, fallback to type
  const totalDeposit = record.payments.filter(
    (p) =>
      (p.amountType?.toLowerCase?.() === "advance" ||
        p.amountType?.toLowerCase?.() === "deposit" ||
        p.amountType?.toLowerCase?.() === "settlement" ||
        p.type?.toLowerCase?.() === "advance" ||
        p.type?.toLowerCase?.() === "deposit" ||
        p.type?.toLowerCase?.() === "settlement")
  ).reduce((sum, p) => sum + p.amount, 0)

  const totalRefunds = record.payments.filter(
    (p) =>
      p.amountType?.toLowerCase?.() === "refund" ||
      p.type?.toLowerCase?.() === "refund"
  ).reduce((sum, p) => sum + p.amount, 0)

  const discountVal = record.payments.filter(
    (p) =>
      p.amountType?.toLowerCase?.() === "discount" ||
      p.type?.toLowerCase?.() === "discount"
  ).reduce((sum, p) => sum + p.amount, 0)

  const totalBill = hospitalServiceTotal + consultantChargeTotal - discountVal
  const balanceAmount = totalBill - totalDeposit

  const aggregatedConsultantCharges = consultantChargeItems.reduce(
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
        items: ServiceDetailItemSupabase[]
      }
    >,
  )
  const aggregatedConsultantChargesArray = Object.values(aggregatedConsultantCharges)

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
            <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-3xl w-full transform transition-all">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-2xl font-bold text-gray-800">{record.name}'s IPD History</Dialog.Title>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Patient Summary in Modal */}
              <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4 rounded-lg mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-white">{record.name}</h1>
                    <p className="text-teal-50">UHID: {record.uhid || "Not assigned"}</p>
                    <p className="text-teal-50 mt-1">
                      Under care of Dr.: <span className="font-semibold">{record.doctor || "N/A"}</span>
                    </p>
                  </div>
                  <div className="mt-2 md:mt-0 flex flex-col md:items-end">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                      <Bed size={14} className="mr-2" />
                      {record.roomType || "No Room"} • {record.bedNumber || "Unknown Bed"}
                    </div>
                    <div className="mt-2 text-teal-50 text-sm">
                      {record.dischargeDate ? (
                        <span className="inline-flex items-center">
                          <AlertTriangle size={14} className="mr-1" /> Discharged:{" "}
                          {format(parseISO(record.dischargeDate), "dd MMM,yyyy")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center">
                          <Calendar size={14} className="mr-1" /> Admitted:{" "}
                          {record.admitDate ? format(parseISO(record.admitDate), "dd MMM,yyyy") : "Unknown"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs in Modal */}
              <div className="mb-6">
                <div className="border-b border-gray-200">
                  <nav className="flex -mb-px space-x-8">
                    <button
                      onClick={() => setActiveTab("overview")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "overview"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <FileText size={16} className="mr-2" /> Overview
                    </button>
                    <button
                      onClick={() => setActiveTab("services")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "services"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Plus size={16} className="mr-2" /> Services
                    </button>
                    <button
                      onClick={() => setActiveTab("payments")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "payments"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <CreditCard size={16} className="mr-2" /> Payments
                    </button>
                    <button
                      onClick={() => setActiveTab("consultants")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "consultants"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <UserPlus size={16} className="mr-2" /> Consultants
                    </button>
                  </nav>
                </div>
              </div>

              {/* Tab Content in Modal */}
              <div className="bg-white rounded-lg overflow-hidden">
                {activeTab === "overview" && (
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Financial Summary */}
                      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-5 shadow-sm">
                        <h3 className="text-lg font-semibold text-teal-800 mb-3">Financial Summary</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Hospital Services:</span>
                            <span className="font-medium">₹{hospitalServiceTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Consultant Charges:</span>
                            <span className="font-medium">₹{consultantChargeTotal.toLocaleString()}</span>
                          </div>
                          {discountVal > 0 && (
                            <div className="flex justify-between text-green-600">
                              <span className="flex items-center">
                                <Tag size={14} className="mr-1" /> Discount:
                              </span>
                              <span className="font-medium">-₹{discountVal.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="border-t border-teal-200 pt-2 mt-2">
                            <div className="flex justify-between font-bold text-teal-800">
                              <span>Total Bill:</span>
                              <span>₹{totalBill.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-gray-600">Total Payments Received:</span>
                            <span className="font-medium">₹{totalDeposit.toLocaleString()}</span>
                          </div>
                          {totalRefunds > 0 && (
                            <div className="flex justify-between text-blue-600">
                              <span className="text-gray-600">Total Refunds:</span>
                              <span className="font-medium">₹{totalRefunds.toLocaleString()}</span>
                            </div>
                          )}
                          {balanceAmount > 0 ? (
                            <div className="flex justify-between text-red-600 font-bold">
                              <span>Due Amount:</span>
                              <span>₹{balanceAmount.toLocaleString()}</span>
                            </div>
                          ) : balanceAmount < 0 ? (
                            <div className="flex justify-between text-blue-600 font-bold">
                              <span>We have to refund :</span>
                              <span>₹{Math.abs(balanceAmount).toLocaleString()}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-green-600 font-bold">
                              <span>Balance:</span>
                              <span>✓ Fully Paid</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Patient Details */}
                      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                          <User size={18} className="mr-2 text-teal-600" /> Patient Details
                        </h3>
                        <div className="space-y-2">
                          <div className="flex items-start">
                            <Phone size={16} className="mr-2 text-gray-400 mt-0.5" />
                            <div>
                              <p className="text-sm text-gray-500">Mobile</p>
                              <p className="font-medium">{record.mobileNumber}</p>
                            </div>
                          </div>
                          <div className="flex items-start">
                            <MapPin size={16} className="mr-2 text-gray-400 mt-0.5" />
                            <div>
                              <p className="text-sm text-gray-500">Address</p>
                              <p className="font-medium">{record.address || "Not provided"}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-sm text-gray-500">Age</p>
                              <p className="font-medium">
                                {record.age || "N/A"} {record.ageUnit || "years"}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Gender</p>
                              <p className="font-medium">{record.gender || "Not provided"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "services" && (
                  <div className="p-4">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Hospital Services</h3>
                    {groupedServiceItems.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                        No hospital services recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Service Name
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Qty
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Amount (₹)
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date/Time
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {groupedServiceItems.map((srv, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-center">{srv.quantity}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                  {srv.amount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {srv.createdAt ? new Date(srv.createdAt).toLocaleString() : "N/A"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium">Total</td>
                              <td></td>
                              <td className="px-4 py-3 text-sm font-bold text-right">
                                ₹{hospitalServiceTotal.toLocaleString()}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "payments" && (
                  <div className="p-4">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment History</h3>
                    {record.payments.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                        No payments recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                #
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                          <tbody className="divide-y divide-gray-200">
                            {record.payments.map((payment, idx) => (
                              <tr key={payment.id || idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{idx + 1}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                  {payment.amount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.paymentType}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.type}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                  {payment.through || "N/A"}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {new Date(payment.date).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "consultants" && (
                  <div className="p-4">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Consultant Charges</h3>
                    {consultantChargeItems.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                        No consultant charges recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                        <table className="w-full">
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
                          <tbody className="divide-y divide-gray-200">
                            {aggregatedConsultantChargesArray.map((agg, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{agg.doctorName}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-center">{agg.visited}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                  ₹{agg.totalCharge.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {agg.lastVisit ? agg.lastVisit.toLocaleString() : "N/A"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium">Total</td>
                              <td></td>
                              <td className="px-4 py-3 text-sm font-bold text-right">
                                ₹{consultantChargeTotal.toLocaleString()}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
