import React from "react";
import { CreditCard, Plus, Trash } from "lucide-react";

// Local copy of the type
interface PaymentDetailItemSupabase {
  id: string;
  amount: number;
  createdAt: string;
  date: string;
  paymentType: string;
  transactionType: "advance" | "refund" | "deposit" | "discount" | "settlement";
  amountType?: "advance" | "deposit" | "settlement" | "refund" | "discount";
  through?: string;
  remark?: string; // Make optional for compatibility
}

interface PaymentTabProps {
  selectedRecord: {
    payments: PaymentDetailItemSupabase[];
    services: { amount: number }[]; // Add services here for summary
  };
  loading: boolean;
  errorsPayment: any;
  registerPayment: any;
  handleSubmitPayment: any;
  onSubmitPayment: any;
  watchPaymentType: string;
  getThroughOptions: () => React.ReactNode;
  handleDeletePayment: (id: string, amount: number, amountType: string) => void;
}

export default function PaymentTab({
  selectedRecord,
  loading,
  errorsPayment,
  registerPayment,
  handleSubmitPayment,
  onSubmitPayment,
  watchPaymentType,
  getThroughOptions,
  handleDeletePayment,
}: PaymentTabProps) {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Payment Summary */}
        <div className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment Summary</h3>
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            {/* Payment Summary Section */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Services:</span>
                <span className="font-medium">₹{selectedRecord.services ? selectedRecord.services.reduce((sum: number, s: { amount: number }) => sum + (s.amount || 0), 0).toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Payments Received:</span>
                <span className="font-medium">₹{selectedRecord.payments.filter(p => p.amountType === "advance" || p.amountType === "deposit" || p.amountType === "settlement").reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Refunds:</span>
                <span className="font-medium">₹{selectedRecord.payments.filter(p => p.amountType === "refund").reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Discount:</span>
                <span className="font-medium">₹{selectedRecord.payments.filter(p => p.amountType === "discount").reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</span>
              </div>
              {/* Balance Calculation and Display */}
              {(() => {
                const totalServices = selectedRecord.services ? selectedRecord.services.reduce((sum: number, s: { amount: number }) => sum + (s.amount || 0), 0) : 0;
                const totalReceived = selectedRecord.payments.filter(p => p.amountType === "advance" || p.amountType === "deposit" || p.amountType === "settlement").reduce((sum, p) => sum + p.amount, 0);
                const totalRefunds = selectedRecord.payments.filter(p => p.amountType === "refund").reduce((sum, p) => sum + p.amount, 0);
                const totalDiscount = selectedRecord.payments.filter(p => p.amountType === "discount").reduce((sum, p) => sum + p.amount, 0);
                const netService = totalServices - totalDiscount;
                const balance = totalReceived - netService - totalRefunds;
                if (balance < 0) {
                  return (
                    <div className="border-t border-teal-200 pt-2 mt-2 flex justify-between font-bold text-teal-800">
                      <span>Due Amount:</span>
                      <span>₹{Math.abs(balance).toLocaleString()}</span>
                    </div>
                  );
                } else if (balance > 0) {
                  return (
                    <div className="border-t border-teal-200 pt-2 mt-2 flex justify-between font-bold text-blue-600">
                      <span>We have to refund:</span>
                      <span>₹{balance.toLocaleString()}</span>
                    </div>
                  );
                } else {
                  return (
                    <div className="border-t border-teal-200 pt-2 mt-2 flex justify-between font-bold text-green-600">
                      <span>Balance:</span>
                      <span>✓ Fully Paid</span>
                    </div>
                  );
                }
              })()}
            </div>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment History</h3>
          {selectedRecord.payments.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
              No payments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₹)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Through</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remark</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedRecord.payments.map((payment: PaymentDetailItemSupabase, idx: number) => (
                    <tr key={payment.id || idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{payment.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.paymentType}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.amountType}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.through || "N/A"}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{payment.remark || ""}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(payment.date).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        <button
                          onClick={() => payment.id && payment.amountType && handleDeletePayment(payment.id, payment.amount, payment.amountType)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete payment"
                        >
                          <Trash size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Record Payment Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <CreditCard size={16} className="mr-2 text-teal-600" /> Record Payment
            </h3>
            <form onSubmit={handleSubmitPayment(onSubmitPayment)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount (₹)</label>
                <input
                  type="number"
                  {...registerPayment("paymentAmount")}
                  placeholder="e.g., 5000"
                  className={`w-full px-3 py-2 rounded-lg border ${errorsPayment.paymentAmount ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                />
                {errorsPayment.paymentAmount && (
                  <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentAmount.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  {...registerPayment("paymentDate")} // New field for payment date
                  defaultValue={new Date().toISOString().split('T')[0]} // Set default to today's date
                  className={`w-full px-3 py-2 rounded-lg border ${errorsPayment.paymentDate ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                />
                {errorsPayment.paymentDate && (
                  <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentDate.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
                <select
                  {...registerPayment("paymentType")}
                  className={`w-full px-3 py-2 rounded-lg border ${errorsPayment.paymentType ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                >
                  <option value="">Select Payment Type</option>
                  <option value="cash">Cash</option>
                  <option value="online">Online</option>
                </select>
                {errorsPayment.paymentType && (
                  <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentType.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Through</label>
                <select
                  {...registerPayment("through")}
                  className={`w-full px-3 py-2 rounded-lg border ${errorsPayment.through ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                  disabled={watchPaymentType === "cash"}
                >
                  {getThroughOptions()}
                </select>
                {errorsPayment.through && (
                  <p className="text-red-500 text-xs mt-1">{errorsPayment.through.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  {...registerPayment("transactionType")}
                  className={`w-full px-3 py-2 rounded-lg border ${errorsPayment.transactionType ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                >
                  <option value="advance">Advance</option>
                  <option value="deposit">Deposit</option>
                  <option value="settlement">Settlement</option>
                  <option value="refund">Refund</option>
                  <option value="discount">Discount</option> {/* Added discount option */}
                </select>
                {errorsPayment.transactionType && (
                  <p className="text-red-500 text-xs mt-1">{errorsPayment.transactionType.message}</p>
                )}
              </div>
              <div>
                <div className="flex items-center mt-4">
                  <input
                    type="checkbox"
                    id="sendWhatsappNotification"
                    {...registerPayment("sendWhatsappNotification")}
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                  />
                  <label htmlFor="sendWhatsappNotification" className="ml-2 block text-sm text-gray-900">
                    Send message on WhatsApp
                  </label>
                </div>
                {errorsPayment.sendWhatsappNotification && (
                  <p className="text-red-500 text-xs mt-1">{errorsPayment.sendWhatsappNotification.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                <input
                  type="text"
                  {...registerPayment("remark")}
                  placeholder="Enter any additional notes (optional)"
                  className={`w-full px-3 py-2 rounded-lg border ${errorsPayment.remark ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                />
                {/* Remark is now optional, so no error display */}
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {loading ? (
                  "Processing..."
                ) : (
                  <>
                    <Plus size={16} className="mr-2" /> Add Payment
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}