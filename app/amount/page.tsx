"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase" // Using Supabase client
import {
  format,
  parseISO, // For parsing ISO date strings from DB
} from "date-fns"

import {
  Activity,
  Layers,
  CreditCard,
  DollarSign,
} from "lucide-react"

// Shadcn/ui components
import { Card } from "@/components/ui/card"
import { toast } from "sonner" // For notifications
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog" // Import Dialog components
import Layout from "@/components/global/Layout"; // Import Layout component

import { useRouter } from 'next/navigation'; // Import useRouter

// --- Type Definitions (Minimal for this page) ---

// Modality/Service info (from OPD service_info JSONB)
interface IModality {
  charges: number
  type: "consultation" | "casualty" | "xray" | "pathology" | "ipd" | "radiology" | "custom"
}

// Payment info (from OPD payment_info JSONB)
interface IPayment {
  cashAmount: number
  onlineAmount: number
  totalPaid: number
}

// OPD Registration (from Supabase `opd_registration` table)
interface OPDRegistrationSupabase {
  opd_id: string
  date: string // date (YYYY-MM-DD string)
  service_info: IModality[] | null // JSONB
  payment_info: IPayment | null // JSONB
  uhid: string; // Add uhid to OPDRegistrationSupabase
}

// IPD Payment (from IPD `payment_detail` JSONB)
interface IPDPaymentDetailItem {
  id?: string;
  amount: number
  createdAt: string
  paymentType: string
  type: "advance" | "refund" | "deposit" | "settlement" | string
  transactionType?: string;
  amountType?: "advance" | "refund" | "deposit" | "settlement" | "discount";
  through?: string;
  remark?: string;
}

// IPD Registration (from Supabase `ipd_registration` table - for clarity)
interface IPDRegistrationSupabase {
  ipd_id: number
  admission_date: string
  payment_detail: IPDPaymentDetailItem[] | null
  uhid: string; // Add uhid to IPDRegistrationSupabase
}

// Patient Detail (Minimal for display in lists) - Updated interface based on schema
interface IPatientDetail {
  uhid: string;
  name: string; // Corrected: 'name' from your schema
  number: number; // Corrected: 'number' from your schema
}

// Detailed OPD Transaction for display
interface OPDTransactionDetail {
  opd_id: string;
  date: string;
  payment_info: IPayment;
  patient_name?: string; // Will be fetched from patient_detail (using 'name' column)
  uhid?: string; // Will be fetched from patient_detail
}

// Detailed IPD Transaction for display (combining IPD info with payment item)
interface IPDTransactionDetail {
  ipd_id: number;
  admission_date: string;
  payment_item: IPDPaymentDetailItem; // The specific payment item from the array
  patient_name?: string; // Will be fetched from patient_detail
  uhid?: string; // Will be fetched from patient_detail
}


// --- Helper Functions ---

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)

// Helper to get start and end of a day for Supabase query based on current IST date
const getTodayDateRangeIST = (date: Date) => {
  const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const istDateString = istFormatter.format(date);

  const start = `${istDateString}T00:00:00+05:30`;
  const end = `${istDateString}T23:59:59+05:30`;

  return { dateString: istDateString, startIST: start, endIST: end };
};

const getYesterdayDateRangeIST = (date: Date) => {
  const yesterday = new Date(date);
  yesterday.setDate(date.getDate() - 1); // Subtract one day

  const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const istDateString = istFormatter.format(yesterday);

  const start = `${istDateString}T00:00:00+05:30`;
  const end = `${istDateString}T23:59:59+05:30`;

  return { dateString: istDateString, startIST: start, endIST: end };
};

// --- DailyCollectionPage Component ---

const DailyCollectionPage: React.FC = () => {
  const router = useRouter(); // Initialize useRouter

  const [opdCash, setOpdCash] = useState<number>(0)
  const [opdOnline, setOpdOnline] = useState<number>(0)
  const [ipdCash, setIpdCash] = useState<number>(0)
  const [ipdOnline, setIpdOnline] = useState<number>(0)
  const [ipdOnlineUpi, setIpdOnlineUpi] = useState<number>(0);
  const [ipdOnlineCard, setIpdOnlineCard] = useState<number>(0);
  const [ipdOnlineNetBanking, setIpdOnlineNetBanking] = useState<number>(0);
  const [ipdOnlineCheque, setIpdOnlineCheque] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [currentDisplayDate, setCurrentDisplayDate] = useState<string>("")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()); // New state for selected date

  // State for Modals
  const [showOpdCashModal, setShowOpdCashModal] = useState<boolean>(false);
  const [showOpdOnlineModal, setShowOpdOnlineModal] = useState<boolean>(false);
  const [showIpdCashModal, setShowIpdCashModal] = useState<boolean>(false);
  const [showIpdOnlineModal, setShowIpdOnlineModal] = useState<boolean>(false);

  // State for Detailed Transaction Data
  const [opdCashTransactions, setOpdCashTransactions] = useState<OPDTransactionDetail[]>([]);
  const [opdOnlineTransactions, setOpdOnlineTransactions] = useState<OPDTransactionDetail[]>([]);
  const [ipdCashTransactions, setIpdCashTransactions] = useState<IPDTransactionDetail[]>([]);
  const [ipdOnlineTransactions, setIpdOnlineTransactions] = useState<IPDTransactionDetail[]>([]);

  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false); // For modal loading


  useEffect(() => {
    const fetchDailyCollections = async () => {
      setIsLoading(true)
      const { dateString: displayDateString, startIST, endIST } = getTodayDateRangeIST(selectedDate); // Use selectedDate
      setCurrentDisplayDate(format(parseISO(displayDateString), "dd MMMM yyyy"));

      let currentOpdCash = 0;
      let currentOpdOnline = 0;
      let currentIpdCash = 0;
      let currentIpdOnline = 0;
      let currentIpdOnlineUpi = 0;
      let currentIpdOnlineCard = 0;
      let currentIpdOnlineNetBanking = 0;
      let currentIpdOnlineCheque = 0;

      try {
        const { data: opdData, error: opdError } = await supabase
          .from("opd_registration")
          .select("payment_info, date, uhid, opd_id")
          .gte("date", startIST)
          .lt("date", endIST);

        if (opdError) {
          console.error("Supabase OPD fetch error:", opdError);
          toast.error("Failed to load OPD data.");
        } else {
          (opdData as OPDRegistrationSupabase[]).forEach((appt) => {
            if (appt.payment_info) {
              currentOpdCash += appt.payment_info.cashAmount || 0;
              currentOpdOnline += appt.payment_info.onlineAmount || 0;
            }
          });
        }

        const { data: ipdCollectionData, error: ipdError } = await supabase
          .rpc('get_daily_ipd_collections_from_jsonb', {
            target_date: displayDateString
          });

        if (ipdError) {
          console.error("Supabase RPC IPD fetch error:", ipdError);
          toast.error("Failed to load IPD data.");
        } else {
          if (ipdCollectionData && ipdCollectionData.length > 0) {
            const {
              cash_total,
              online_total,
              online_upi_total,
              online_card_total,
              online_netbanking_total,
              online_cheque_total
            } = ipdCollectionData[0];

            currentIpdCash = cash_total || 0;
            currentIpdOnline = online_total || 0;
            currentIpdOnlineUpi = online_upi_total || 0;
            currentIpdOnlineCard = online_card_total || 0;
            currentIpdOnlineNetBanking = online_netbanking_total || 0;
            currentIpdOnlineCheque = online_cheque_total || 0;

          } else {
            currentIpdCash = 0;
            currentIpdOnline = 0;
            currentIpdOnlineUpi = 0;
            currentIpdOnlineCard = 0;
            currentIpdOnlineNetBanking = 0;
            currentIpdOnlineCheque = 0;
          }
        }

        setOpdCash(currentOpdCash);
        setOpdOnline(currentOpdOnline);
        setIpdCash(currentIpdCash);
        setIpdOnline(currentIpdOnline);
        setIpdOnlineUpi(currentIpdOnlineUpi);
        setIpdOnlineCard(currentIpdOnlineCard);
        setIpdOnlineNetBanking(currentIpdOnlineNetBanking);
        setIpdOnlineCheque(currentIpdOnlineCheque);

      } catch (err) {
        console.error("Error fetching daily collections:", err);
        toast.error("An unexpected error occurred while fetching data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDailyCollections();
  }, [selectedDate]); // Add selectedDate to dependency array

  // --- Fetching Functions for Detailed Data (for Modals) ---

  const fetchOpdCashDetails = async () => {
    setIsDetailLoading(true);
    const { startIST, endIST } = getTodayDateRangeIST(selectedDate);
    try {
      const { data: opdData, error } = await supabase
        .from("opd_registration")
        .select("opd_id, date, payment_info, uhid")
        .gte("date", startIST)
        .lt("date", endIST);

      if (error) throw error;

      const cashTransactions: OPDTransactionDetail[] = [];
      for (const appt of opdData as OPDRegistrationSupabase[]) {
        if (appt.payment_info?.cashAmount && appt.payment_info.cashAmount > 0) {
          let patientName = "N/A";
          let patientUhId = "N/A";
          if (appt.uhid) {
            const { data: patient, error: patientError } = await supabase
              .from("patient_detail")
              .select("name, uhid") // Corrected: select 'name' and 'uhid'
              .eq("uhid", appt.uhid)
              .single();
            if (patient && !patientError) {
              patientName = patient.name; // Corrected: use 'name'
              patientUhId = patient.uhid; // Use 'uhid'
            }
          }
          cashTransactions.push({
            opd_id: appt.opd_id,
            date: appt.date,
            payment_info: appt.payment_info,
            patient_name: patientName,
            uhid: patientUhId,
          });
        }
      }
      setOpdCashTransactions(cashTransactions);
    } catch (err) {
      console.error("Error fetching OPD cash details:", err);
      toast.error("Failed to load OPD cash details.");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const fetchOpdOnlineDetails = async () => {
    setIsDetailLoading(true);
    const { startIST, endIST } = getTodayDateRangeIST(selectedDate);
    try {
      const { data: opdData, error } = await supabase
        .from("opd_registration")
        .select("opd_id, date, payment_info, uhid")
        .gte("date", startIST)
        .lt("date", endIST);

      if (error) throw error;

      const onlineTransactions: OPDTransactionDetail[] = [];
      for (const appt of opdData as OPDRegistrationSupabase[]) {
        if (appt.payment_info?.onlineAmount && appt.payment_info.onlineAmount > 0) {
          let patientName = "N/A";
          let patientUhId = "N/A";
          if (appt.uhid) {
            const { data: patient, error: patientError } = await supabase
              .from("patient_detail")
              .select("name, uhid") // Corrected: select 'name' and 'uhid'
              .eq("uhid", appt.uhid)
              .single();
            if (patient && !patientError) {
              patientName = patient.name; // Corrected: use 'name'
              patientUhId = patient.uhid; // Use 'uhid'
            }
          }
          onlineTransactions.push({
            opd_id: appt.opd_id,
            date: appt.date,
            payment_info: appt.payment_info,
            patient_name: patientName,
            uhid: patientUhId,
          });
        }
      }
      setOpdOnlineTransactions(onlineTransactions);
    } catch (err) {
      console.error("Error fetching OPD online details:", err);
      toast.error("Failed to load OPD online details.");
    } finally {
      setIsDetailLoading(false);
    }
  };


  const fetchIpdCashDetails = async () => {
    setIsDetailLoading(true);
    const { dateString: displayDateString } = getTodayDateRangeIST(selectedDate);
    try {
      const { data, error } = await supabase.rpc('get_daily_ipd_transactions_details', {
        target_date: displayDateString,
        payment_type: 'cash'
      });

      if (error) throw error;

      const transactions: IPDTransactionDetail[] = data.map((item: any) => ({
        ipd_id: item.ipd_id,
        admission_date: item.createdat,
        patient_name: item.patient_name,
        uhid: item.uhid,
        payment_item: {
          amount: item.amount,
          createdAt: item.createdat,
          paymentType: item.paymenttype,
          type: item.amounttype,
          through: item.through,
        },
      }));
      setIpdCashTransactions(transactions);
    } catch (err) {
      console.error("Error fetching IPD cash details:", err);
      toast.error("Failed to load IPD cash details.");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const fetchIpdOnlineDetails = async () => {
    setIsDetailLoading(true);
    const { dateString: displayDateString } = getTodayDateRangeIST(selectedDate);
    try {
      const { data, error } = await supabase.rpc('get_daily_ipd_transactions_details', {
        target_date: displayDateString,
        payment_type: 'online'
      });

      if (error) throw error;

      const transactions: IPDTransactionDetail[] = data.map((item: any) => ({
        ipd_id: item.ipd_id,
        admission_date: item.createdat,
        patient_name: item.patient_name,
        uhid: item.uhid,
        payment_item: {
          amount: item.amount,
          createdAt: item.createdat,
          paymentType: item.paymenttype,
          type: item.amounttype,
          through: item.through,
        },
      }));
      setIpdOnlineTransactions(transactions);
    } catch (err) {
      console.error("Error fetching IPD online details:", err);
      toast.error("Failed to load IPD online details.");
    } finally {
      setIsDetailLoading(false);
    }
  };


  // --- Click Handlers for Cards ---
  const handleOpdCashClick = () => {
    setShowOpdCashModal(true);
    fetchOpdCashDetails();
  };

  const handleOpdOnlineClick = () => {
    setShowOpdOnlineModal(true);
    fetchOpdOnlineDetails();
  };

  const handleIpdCashClick = () => {
    setShowIpdCashModal(true);
    fetchIpdCashDetails();
  };

  const handleIpdOnlineClick = () => {
    setShowIpdOnlineModal(true);
    fetchIpdOnlineDetails();
  };

  // --- New: Handle row click to navigate ---
  const handleIpdRowClick = (ipdId: number) => {
    router.push(`/ipd/billing/${ipdId}`);
    setShowIpdCashModal(false);
    setShowIpdOnlineModal(false);
  };

  const handleOpdRowClick = (opdId: string) => {
    // Assuming your OPD appointment page is at `/opd/appointment/[id]`
    router.push(`/opd/appointment/${opdId}`);
    setShowOpdCashModal(false);
    setShowOpdOnlineModal(false);
  };


  const totalOpdAmount = useMemo(() => opdCash + opdOnline, [opdCash, opdOnline]);

  const totalIpdAmount = useMemo(
    () => ipdCash + ipdOnlineUpi + ipdOnlineCard + ipdOnlineNetBanking + ipdOnlineCheque,
    [ipdCash, ipdOnlineUpi, ipdOnlineCard, ipdOnlineNetBanking, ipdOnlineCheque]
  );

  const totalOnline = useMemo(
    () => opdOnline + ipdOnlineUpi + ipdOnlineCard + ipdOnlineNetBanking + ipdOnlineCheque,
    [opdOnline, ipdOnlineUpi, ipdOnlineCard, ipdOnlineNetBanking, ipdOnlineCheque]
  );

  const grandTotal = useMemo(() => totalOpdAmount + totalIpdAmount, [totalOpdAmount, totalIpdAmount]);
  const totalCash = useMemo(() => opdCash + ipdCash, [opdCash, ipdCash]);


  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-lg mb-6 rounded-xl">
            <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center">
              <div className="flex items-center mb-4 md:mb-0">
                <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg mr-3 shadow-md">
                  <DollarSign className="text-white h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Daily Collections Overview
                </h1>
              </div>
              <div className="text-lg font-medium text-gray-700 flex items-center">
                <CreditCard className="mr-2 h-5 w-5 text-gray-600" />
                Date: <span className="ml-2 text-green-700">{currentDisplayDate}</span>
              </div>
              <div className="flex space-x-2 mt-4 md:mt-0">
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    const yesterday = new Date(selectedDate);
                    yesterday.setDate(selectedDate.getDate() - 1);
                    setSelectedDate(yesterday);
                  }}
                  className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                >
                  Yesterday
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
              <span className="ml-3 text-lg text-gray-600">Fetching today's collection data...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* OPD Collections Card */}
              <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-sky-100 to-blue-100 rounded-full shadow-md">
                    <Activity className="text-sky-600 h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">OPD Collections</h2>
                </div>
                <div className="space-y-4">
                  <div
                    className="flex justify-between items-center bg-sky-50 p-3 rounded-lg border border-sky-200 cursor-pointer hover:bg-sky-100 transition-colors"
                    onClick={handleOpdCashClick}
                  >
                    <span className="text-gray-700 font-medium">💵 Cash Collection</span>
                    <span className="text-xl font-bold text-sky-700">
                      {formatCurrency(opdCash)}
                    </span>
                  </div>
                  <div
                    className="flex justify-between items-center bg-sky-50 p-3 rounded-lg border border-sky-200 cursor-pointer hover:bg-sky-100 transition-colors"
                    onClick={handleOpdOnlineClick}
                  >
                    <span className="text-gray-700 font-medium">💳 Online Collection</span>
                    <span className="text-xl font-bold text-sky-700">
                      {formatCurrency(opdOnline)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-sky-300">
                    <span className="text-lg font-semibold text-sky-800">Total OPD Collected</span>
                    <span className="text-2xl font-bold text-sky-600">
                      {formatCurrency(totalOpdAmount)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* IPD Collections Card */}
              <Card className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-orange-100 to-red-100 rounded-full shadow-md">
                    <Layers className="text-orange-600 h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">IPD Collections</h2>
                </div>
                <div className="space-y-4">
                  <div
                    className="flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors"
                    onClick={handleIpdCashClick}
                  >
                    <span className="text-gray-700 font-medium">💵 Cash Collection</span>
                    <span className="text-xl font-bold text-orange-700">
                      {formatCurrency(ipdCash)}
                    </span>
                  </div>
                  {/* Total Online Collection for IPD is now derived from the sum of its parts */}
                  <div
                    className="flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors"
                    onClick={handleIpdOnlineClick}
                  >
                    <span className="text-gray-700 font-medium">💳 Total Online Collection</span>
                    <span className="text-xl font-bold text-orange-700">
                      {formatCurrency(ipdOnline)}
                    </span>
                  </div>
                  {/* Display detailed online through types if they exist */}
                  {ipdOnlineUpi > 0 && (
                    <div className="flex justify-between items-center bg-orange-50 p-2 pl-6 rounded-lg border border-orange-200 text-sm">
                      <span className="text-gray-600">UPI Payments</span>
                      <span className="font-semibold text-orange-600">
                        {formatCurrency(ipdOnlineUpi)}
                      </span>
                    </div>
                  )}
                  {ipdOnlineCard > 0 && (
                    <div className="flex justify-between items-center bg-orange-50 p-2 pl-6 rounded-lg border border-orange-200 text-sm">
                      <span className="text-gray-600">Card Payments</span>
                      <span className="font-semibold text-orange-600">
                        {formatCurrency(ipdOnlineCard)}
                      </span>
                    </div>
                  )}
                  {ipdOnlineNetBanking > 0 && (
                    <div className="flex justify-between items-center bg-orange-50 p-2 pl-6 rounded-lg border border-orange-200 text-sm">
                      <span className="text-gray-600">Net Banking Payments</span>
                      <span className="font-semibold text-orange-600">
                        {formatCurrency(ipdOnlineNetBanking)}
                      </span>
                    </div>
                  )}
                  {ipdOnlineCheque > 0 && (
                    <div className="flex justify-between items-center bg-orange-50 p-2 pl-6 rounded-lg border border-orange-200 text-sm">
                      <span className="text-gray-600">Cheque Payments (Online)</span>
                      <span className="font-semibold text-orange-600">
                        {formatCurrency(ipdOnlineCheque)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-4 border-t border-orange-300">
                    <span className="text-lg font-semibold text-orange-800">Total IPD Collected</span>
                    <span className="text-2xl font-bold text-orange-600">
                      {formatCurrency(totalIpdAmount)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Overall Daily Totals Card (Optional, but useful for a summary) */}
              <Card className="lg:col-span-2 bg-gradient-to-r from-emerald-50 to-green-50 shadow-lg rounded-xl p-6 border border-emerald-200">
                <h2 className="text-xl font-bold text-emerald-900 mb-4 flex items-center">
                  <DollarSign className="mr-2 h-6 w-6 text-emerald-700" /> Today's Grand Totals
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-emerald-100">
                    <p className="text-gray-600 text-sm">Total Cash Collections</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {formatCurrency(totalCash)}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-emerald-100">
                    <p className="text-gray-600 text-sm">Total Online Collections</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {formatCurrency(totalOnline)}
                    </p>
                  </div>
                  <div className="bg-emerald-100 p-4 rounded-lg shadow-md border border-emerald-300">
                    <p className="text-emerald-800 text-lg font-semibold">Overall Total Collection</p>
                    <p className="text-3xl font-extrabold text-emerald-900">
                      {formatCurrency(grandTotal)}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Modals for Detailed Collections */}

        {/* OPD Cash Details Modal */}
        <Dialog open={showOpdCashModal} onOpenChange={setShowOpdCashModal}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>OPD Cash Collections - {currentDisplayDate}</DialogTitle>
              <DialogDescription>
                Detailed list of today's OPD cash transactions. Click a row to view OPD appointment.
              </DialogDescription>
            </DialogHeader>
            {isDetailLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
                <span className="ml-2 text-gray-600">Loading cash transactions...</span>
              </div>
            ) : opdCashTransactions.length === 0 ? (
              <p className="text-center text-gray-500">No cash transactions found for today.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        OPD ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        UHID
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {opdCashTransactions.map((tx, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleOpdRowClick(tx.opd_id)} // Added onClick for OPD
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {tx.opd_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.patient_name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.uhid || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(tx.payment_info.cashAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* OPD Online Details Modal */}
        <Dialog open={showOpdOnlineModal} onOpenChange={setShowOpdOnlineModal}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>OPD Online Collections - {currentDisplayDate}</DialogTitle>
              <DialogDescription>
                Detailed list of today's OPD online transactions. Click a row to view OPD appointment.
              </DialogDescription>
            </DialogHeader>
            {isDetailLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
                <span className="ml-2 text-gray-600">Loading online transactions...</span>
              </div>
            ) : opdOnlineTransactions.length === 0 ? (
              <p className="text-center text-gray-500">No online transactions found for today.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        OPD ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        UHID
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {opdOnlineTransactions.map((tx, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleOpdRowClick(tx.opd_id)} // Added onClick for OPD
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {tx.opd_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.patient_name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.uhid || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(tx.payment_info.onlineAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* IPD Cash Details Modal */}
        <Dialog open={showIpdCashModal} onOpenChange={setShowIpdCashModal}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>IPD Cash Collections - {currentDisplayDate}</DialogTitle>
              <DialogDescription>
                Detailed list of today's IPD cash transactions. Click a row to view IPD billing.
              </DialogDescription>
            </DialogHeader>
            {isDetailLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
                <span className="ml-2 text-gray-600">Loading cash transactions...</span>
              </div>
            ) : ipdCashTransactions.length === 0 ? (
              <p className="text-center text-gray-500">No cash transactions found for today.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IPD ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        UHID
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ipdCashTransactions.map((tx, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleIpdRowClick(tx.ipd_id)} // Added onClick handler
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {tx.ipd_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.patient_name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.uhid || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(tx.payment_item.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.payment_item.type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* IPD Online Details Modal */}
        <Dialog open={showIpdOnlineModal} onOpenChange={setShowIpdOnlineModal}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>IPD Online Collections - {currentDisplayDate}</DialogTitle>
              <DialogDescription>
                Detailed list of today's IPD online transactions. Click a row to view IPD billing.
              </DialogDescription>
            </DialogHeader>
            {isDetailLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
                <span className="ml-2 text-gray-600">Loading online transactions...</span>
              </div>
            ) : ipdOnlineTransactions.length === 0 ? (
              <p className="text-center text-gray-500">No online transactions found for today.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IPD ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        UHID
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Through
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ipdOnlineTransactions.map((tx, index) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleIpdRowClick(tx.ipd_id)} // Added onClick handler
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {tx.ipd_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.patient_name || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.uhid || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(tx.payment_item.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.payment_item.through || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {tx.payment_item.type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

export default DailyCollectionPage;