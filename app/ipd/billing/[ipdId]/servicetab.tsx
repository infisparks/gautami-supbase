import React from "react";
import { Plus, Trash, Percent, RefreshCw, DollarSign } from "lucide-react";
import CreatableSelect from "react-select/creatable";
import { Controller } from "react-hook-form";

interface ServiceTabProps {
  selectedRecord: any;
  loading: boolean;
  groupedServiceItems: any[];
  hospitalServiceTotal: number;
  errorsService: any;
  registerService: any;
  handleSubmitService: any;
  onSubmitAdditionalService: any;
  serviceControl: any;
  masterServiceOptions: any[];
  setValueService: any;
  resetService: any;
  handleDeleteGroupedServiceItem: (serviceName: string, amount: number) => void;
  discountVal: number;
  discountPercentage: string;
  setIsDiscountModalOpen: (open: boolean) => void;
  loadingDiscount?: boolean;
}

const ServiceTab: React.FC<ServiceTabProps> = ({
  selectedRecord,
  loading,
  groupedServiceItems,
  hospitalServiceTotal,
  errorsService,
  registerService,
  handleSubmitService,
  onSubmitAdditionalService,
  serviceControl,
  masterServiceOptions,
  setValueService,
  resetService,
  handleDeleteGroupedServiceItem,
  discountVal,
  discountPercentage,
  setIsDiscountModalOpen,
  loadingDiscount,
}) => {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
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
                      <td className="px-4 py-3 text-sm text-center">
                        <button
                          onClick={() => handleDeleteGroupedServiceItem(srv.serviceName, srv.amount)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete all instances of this service"
                        >
                          <Trash size={16} />
                        </button>
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
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Add Service Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Hospital Service</h3>
            <form onSubmit={handleSubmitService(onSubmitAdditionalService)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
                <Controller
                  control={serviceControl}
                  name="serviceName"
                  render={({ field }) => {
                    const valueStr = field.value || "";
                    const selectedOption = masterServiceOptions.find(
                      (opt) =>
                        typeof opt.label === "string" &&
                        typeof valueStr === "string" &&
                        opt.label.toLowerCase() === valueStr.toLowerCase(),
                    ) || (valueStr ? { label: valueStr, value: valueStr, amount: 0 } : null);
                    return (
                      <CreatableSelect
                        {...field}
                        isClearable
                        options={masterServiceOptions}
                        placeholder="Select or type a service..."
                        onChange={(selected) => {
                          if (selected) {
                            field.onChange(selected.label);
                            const found = masterServiceOptions.find((opt) => opt.label === selected.label);
                            if (found) setValueService("amount", found.amount);
                          } else {
                            field.onChange("");
                            setValueService("amount", 0);
                          }
                        }}
                        value={selectedOption}
                      />
                    );
                  }}
                />
                {errorsService.serviceName && (
                  <p className="text-red-500 text-xs mt-1">{errorsService.serviceName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  {...registerService("amount")}
                  placeholder="Auto-filled on selection, or type your own"
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errorsService.amount ? "border-red-500" : "border-gray-300"
                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                />
                {errorsService.amount && (
                  <p className="text-red-500 text-xs mt-1">{errorsService.amount.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  {...registerService("quantity")}
                  min="1"
                  placeholder="e.g., 1"
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errorsService.quantity ? "border-red-500" : "border-gray-300"
                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                />
                {errorsService.quantity && (
                  <p className="text-red-500 text-xs mt-1">{errorsService.quantity.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {loading ? (
                  "Processing..."
                ) : (
                  <>
                    <Plus size={16} className="mr-2" /> Add Service
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Enhanced Discount Card */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200 p-6 mt-6 shadow-sm">
            <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center">
              <Percent size={18} className="mr-2 text-emerald-600" /> Discount
            </h3>
            {discountVal > 0 ? (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-500">Current Discount</p>
                      <p className="text-2xl font-bold text-emerald-600">₹{discountVal.toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-medium">
                      {discountPercentage}% off
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center"
                >
                  <RefreshCw size={16} className="mr-2" /> Update Discount
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 shadow-sm border border-dashed border-emerald-200 text-center">
                  <p className="text-gray-500 mb-2">No discount applied yet</p>
                  <DollarSign size={24} className="mx-auto text-emerald-300" />
                </div>
                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center"
                >
                  <Percent size={16} className="mr-2" /> Add Discount
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceTab;
