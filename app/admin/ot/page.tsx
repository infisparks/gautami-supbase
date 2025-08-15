// app/ipd/ot/breakdown/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  User,
  Activity,
  List,
  Stethoscope,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import Layout from "@/components/global/Layout";

// Import Recharts components
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// --- Type Definitions ---
interface PatientDetailSupabase {
  patient_id: number;
  name: string;
  number: number | null;
  age: number | null;
  gender: string | null;
  address: string | null;
  age_unit: string | null;
  dob: string | null;
  uhid: string;
}

interface OtDetailsSupabase {
  id: string;
  ipd_id: number;
  uhid: string;
  ot_type: "Major" | "Minor";
  ot_notes: string | null;
  ot_date: string; // ISO string
  created_at: string; // Creation timestamp (not used for date filtering)
  doctor_id: number | null;
  has_baby_birth: boolean | null; // New field for baby birth option
  baby_birth_date: string | null; // New field
  baby_birth_weight: number | null; // New field
  baby_birth_gender: "Male" | "Female" | "Other" | null; // New field
}

interface DoctorSupabase {
  id: number;
  dr_name: string;
  department: string;
  specialist: any | null;
  charges: any | null;
}

interface OTRecordWithDetails extends OtDetailsSupabase {
  patient_detail: Pick<PatientDetailSupabase, 'name' | 'uhid' | 'age' | 'gender' | 'age_unit'> | null;
}

interface OTFilters {
  searchTerm: string; // This is the raw input value
  otType: 'All' | 'Major' | 'Minor';
  doctorId: number | 'All';
  startDate: string; // YYYY-MM-DD format
  endDate: string;   // YYYY-MM-DD format
  showBabyBirthOnly: boolean; // New filter field
}

interface DailyOTCountData {
  date: string;
  totalOts: number;
}


export default function OTBreakdownPage() {
  const router = useRouter();

  const [otRecords, setOtRecords] = useState<OTRecordWithDetails[]>([]);
  const [doctors, setDoctors] = useState<DoctorSupabase[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');

  const [filters, setFilters] = useState<OTFilters>({
    searchTerm: '',
    otType: 'All',
    doctorId: 'All',
    startDate: today,
    endDate: today,
    showBabyBirthOnly: false, // Initialize new filter
  });

  // NEW: State to hold the debounced search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce logic for searchTerm
  useEffect(() => {
    const handler = setTimeout(() => {
      // Only update debouncedSearchTerm if the input is empty or at least 5 characters
      if (filters.searchTerm.length >= 5 || filters.searchTerm.length === 0) {
        setDebouncedSearchTerm(filters.searchTerm);
      }
    }, 500); // 500ms debounce time

    // Cleanup function: This is important! It clears the timeout if filters.searchTerm changes again.
    return () => {
      clearTimeout(handler);
    };
  }, [filters.searchTerm]); // Re-run this effect whenever filters.searchTerm changes

  // --- Derived State for Analytics ---
  const dailyOTCounts = useMemo(() => {
    const counts: { [date: string]: number } = {};
    otRecords.forEach(record => {
      if (record.ot_date) {
        const date = format(parseISO(record.ot_date), 'yyyy-MM-dd');
        counts[date] = (counts[date] || 0) + 1;
      }
    });

    const sortedData: DailyOTCountData[] = Object.keys(counts)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(date => ({
        date: format(parseISO(date), 'dd MMM'),
        totalOts: counts[date],
      }));

    return sortedData;
  }, [otRecords]);

  // Summary counts for Total / Major / Minor
  const otSummary = useMemo(() => {
    const total = otRecords.length;
    const major = otRecords.filter(r => r.ot_type === 'Major').length;
    const minor = otRecords.filter(r => r.ot_type === 'Minor').length;
    const babyBirths = otRecords.filter(r => r.has_baby_birth).length; // New: Count baby births
    return { total, major, minor, babyBirths };
  }, [otRecords]);

  const otsByDoctor = useMemo(() => {
    const data: { [key: string]: number } = {};
    otRecords.forEach(record => {
      const doctor = doctors.find(doc => doc.id === record.doctor_id);
      const doctorName = doctor?.dr_name || 'Not Selected';
      data[doctorName] = (data[doctorName] || 0) + 1;
    });
    return Object.entries(data).sort(([, countA], [, countB]) => countB - countA);
  }, [otRecords, doctors]);

  // --- Data Fetching Logic ---
  const fetchAllRequiredData = useCallback(async () => {
    setLoading(true);
    console.log("Fetching data with filters:", filters, "Debounced search term:", debouncedSearchTerm);
    try {
      // 1. Fetch all doctors
      const { data: doctorsData, error: doctorsError } = await supabase
        .from("doctor")
        .select("id, dr_name, department")
        .order("dr_name", { ascending: true });

      if (doctorsError) {
        console.error("Error fetching doctors:", doctorsError);
        toast.error("Failed to load doctor list for filters.");
      } else {
        // Ensure doctorsData is mapped to DoctorSupabase type (with all required fields)
        setDoctors(
          (doctorsData || []).map((doc: any) => ({
            id: doc.id,
            dr_name: doc.dr_name,
            department: doc.department,
            specialist: doc.specialist ?? "",
            charges: doc.charges ?? 0,
          }))
        );
      }

      // 2. Fetch OT records based on current filters and debounced search term
      let query = supabase
        .from('ot_details')
        .select(`
          id,
          ipd_id,
          uhid,
          ot_type,
          ot_notes,
          ot_date,
          created_at,
          doctor_id,
          has_baby_birth,
          baby_birth_date,
          baby_birth_weight,
          baby_birth_gender,
          patient_detail:uhid (name, uhid, age, gender, age_unit)
        `);

      if (filters.otType !== 'All') {
        query = query.eq('ot_type', filters.otType);
      }
      if (filters.doctorId !== 'All') {
        query = query.eq('doctor_id', filters.doctorId);
      }
      if (filters.startDate) {
        query = query.gte('ot_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('ot_date', filters.endDate + 'T23:59:59.999');
      }
      if (filters.showBabyBirthOnly) {
        query = query.eq('has_baby_birth', true);
      }

      query = query.order('ot_date', { ascending: false });

      const { data: otData, error: otError } = await query.returns<OTRecordWithDetails[]>();

      if (otError) {
        console.error("Error fetching OT data:", otError);
        if (otError.code === 'PGRST116') {
             toast.info("No OT records found for the applied filters.");
        } else {
            toast.error(`Failed to load OT breakdown data: ${otError.message}`);
        }
        setOtRecords([]);
        return;
      }

      let processedOtData = otData || [];

      // Apply client-side search filtering using the DEBOUNCED search term
      if (debouncedSearchTerm) { // Only filter if debouncedSearchTerm is not empty
        const lowerCaseSearchTerm = debouncedSearchTerm.toLowerCase();
        processedOtData = processedOtData.filter(record =>
          record.patient_detail?.name?.toLowerCase().includes(lowerCaseSearchTerm) ||
          record.uhid?.toLowerCase().includes(lowerCaseSearchTerm)
        );
      }

      setOtRecords(processedOtData);

    } catch (err: any) {
      console.error("Caught error in fetchAllRequiredData:", err);
      toast.error("An unexpected error occurred while loading data: " + err.message);
      setOtRecords([]);
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [filters.otType, filters.doctorId, filters.startDate, filters.endDate, debouncedSearchTerm, filters.showBabyBirthOnly]); // Dependencies now include debouncedSearchTerm

  // Effect hook to trigger data fetching
  useEffect(() => {
    // This effect now depends on `fetchAllRequiredData` itself, which in turn
    // depends on the filters and debouncedSearchTerm. This is a common pattern.
    fetchAllRequiredData();
  }, [fetchAllRequiredData]);

  // Generic handler for date, select filters
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: name === 'doctorId' && value !== 'All' ? parseInt(value) : value,
    }));
  };

  // Specific handler for searchTerm - updates the immediate filter state, which triggers debounce
  const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({
      ...prev,
      searchTerm: e.target.value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      searchTerm: '',
      otType: 'All',
      doctorId: 'All',
      startDate: today,
      endDate: today,
      showBabyBirthOnly: false, // Also clear the new filter
    });
    setDebouncedSearchTerm(''); // Also clear the debounced term immediately
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        {/* Header */}
        <header className="bg-white border-b border-blue-100 shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
            <button
              onClick={() => router.push(`/ipd/management`)}
              className="flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors mb-3 sm:mb-0"
            >
              <ArrowLeft size={18} className="mr-2" /> Back to IPD Management
            </button>
            <h1 className="text-2xl font-bold text-gray-800 text-center sm:text-right flex items-center">
              <Activity size={24} className="mr-3 text-blue-500" /> OT Analytics & Breakdown
            </h1>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="min-h-[50vh] flex flex-col items-center justify-center bg-white rounded-xl shadow-md p-8">
              <RefreshCw className="h-16 w-16 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Loading OT data for analytics...</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Filter Section */}
              <section className="bg-white rounded-xl shadow-md p-6 mb-8 border border-blue-100">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <Filter size={20} className="mr-2 text-blue-600" /> Filter OT Records
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date (OT Date)</label>
                    <input
                      type="date"
                      id="startDate"
                      name="startDate"
                      value={filters.startDate}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">End Date (OT Date)</label>
                    <input
                      type="date"
                      id="endDate"
                      name="endDate"
                      value={filters.endDate}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="otType" className="block text-sm font-medium text-gray-700 mb-1">OT Type</label>
                    <select
                      id="otType"
                      name="otType"
                      value={filters.otType}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="All">All Types</option>
                      <option value="Major">Major</option>
                      <option value="Minor">Minor</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="doctorId" className="block text-sm font-medium text-gray-700 mb-1">Operating Doctor</label>
                    <select
                      id="doctorId"
                      name="doctorId"
                      value={filters.doctorId}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="All">All Doctors</option>
                      {doctors.map(doctor => (
                        <option key={doctor.id} value={doctor.id}>{doctor.dr_name} ({doctor.department})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showBabyBirthOnly"
                      name="showBabyBirthOnly"
                      checked={filters.showBabyBirthOnly}
                      onChange={handleFilterChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="showBabyBirthOnly" className="ml-2 text-sm font-medium text-gray-700">
                      Show only Baby Births
                    </label>
                  </div>
                </div>
                <div>
                    <label htmlFor="searchTerm" className="block text-sm font-medium text-gray-700 mb-1">Search Patient (Name/UHID)</label>
                    <div className="relative">
                        <input
                            type="text"
                            id="searchTerm"
                            name="searchTerm"
                            value={filters.searchTerm} // Still bound to filters.searchTerm for immediate input display
                            onChange={handleSearchTermChange} // Dedicated handler
                            placeholder="Type at least 5 characters..."
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-5">
                  <button
                    onClick={handleClearFilters}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Clear Filters
                  </button>
                  <button
                    // This button will still trigger a fetch, useful if user changes filters
                    // but doesn't use the debounceable search.
                    onClick={() => fetchAllRequiredData()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
                  >
                    <Filter size={18} className="mr-2" /> Apply Filters
                  </button>
                </div>
              </section>

              {/* Summary Cards */}
              <section className="mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Total OTs</p>
                      <p className="text-3xl font-bold text-gray-800">{otSummary.total}</p>
                    </div>
                    <div className="p-3 rounded-full bg-indigo-100 text-indigo-600">
                      <List size={24} />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Major OTs</p>
                      <p className="text-3xl font-bold text-gray-800">{otSummary.major}</p>
                    </div>
                    <div className="p-3 rounded-full bg-red-100 text-red-600">
                      <Stethoscope size={24} />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Minor OTs</p>
                      <p className="text-3xl font-bold text-gray-800">{otSummary.minor}</p>
                    </div>
                    <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                      <Stethoscope size={24} />
                    </div>
                  </div>
                  {otSummary.babyBirths > 0 && (
                    <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Baby Births</p>
                        <p className="text-3xl font-bold text-gray-800">{otSummary.babyBirths}</p>
                      </div>
                      <div className="p-3 rounded-full bg-pink-100 text-pink-600">
                        <User size={24} /> {/* Using User icon for baby birth, can be changed */}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Analytics & Breakdown Section (Updated for single graph) */}
              <section className="bg-white rounded-xl shadow-md p-6 mb-8 border border-blue-100">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <Activity size={20} className="mr-2 text-blue-600" /> Daily OT Count Trend
                </h2>
                <div className="w-full h-80">
                  {dailyOTCounts.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={dailyOTCounts}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis allowDecimals={false} label={{ value: 'OT Count', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="totalOts"
                          stroke="#8884d8"
                          activeDot={{ r: 8 }}
                          name="Total OTs"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded-lg">
                      <AlertTriangle size={30} className="mb-2 text-yellow-500" />
                      <p>No OT data available for this date range.</p>
                      <p className="text-sm">Try adjusting your date filters.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* OT List Table */}
              <section className="bg-white rounded-xl shadow-md p-6 border border-blue-100">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <List size={20} className="mr-2 text-blue-600" /> All OT Records
                </h2>
                {otRecords.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <AlertTriangle size={40} className="mx-auto mb-3 text-yellow-500" />
                    <p className="text-lg font-medium">No OT records found.</p>
                    <p className="text-sm">Try adjusting your filters or search terms.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient Name</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UHID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT Type</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT Date (Actual)</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operating Doctor</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Baby Birth</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Baby Birth Date</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Baby Birth Weight</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Baby Gender</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {otRecords.map((record) => (
                          <motion.tr
                            key={record.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className="hover:bg-blue-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.patient_detail?.name || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.uhid}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                                ${record.ot_type === 'Major' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                {record.ot_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.ot_date ? format(parseISO(record.ot_date), 'dd MMM, yyyy') : 'N/A'}
                            </td>
                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.created_at ? format(parseISO(record.created_at), 'dd MMM, yyyy') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {doctors.find(doc => doc.id === record.doctor_id)?.dr_name || 'Not Selected'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{record.ot_notes || 'No notes'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.has_baby_birth ? 'Yes' : 'No'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.has_baby_birth && record.baby_birth_date ? format(parseISO(record.baby_birth_date), 'dd MMM, yyyy') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.has_baby_birth && record.baby_birth_weight !== null ? `${record.baby_birth_weight} kg` : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {record.has_baby_birth && record.baby_birth_gender ? record.baby_birth_gender : 'N/A'}
                            </td>
                          </motion.tr>
                        ))}                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </main>
      </div>
    </Layout>
  );
}
