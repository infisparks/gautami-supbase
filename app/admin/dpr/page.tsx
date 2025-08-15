'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Layout from '@/components/global/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Calendar,
  Stethoscope,
  TrendingUp,
  AlertTriangle,
  Clock,
  UserCheck,
  Building2,
  Printer,
  Heart,
  X,
  Activity,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'

// Dynamic import for html2pdf to avoid SSR issues
let html2pdf: any = null;
if (typeof window !== 'undefined') {
  // @ts-ignore
  import('html2pdf.js').then(module => {
    html2pdf = module.default;
  });
}

const getDayRangeForSupabase = (dateString: string) => {
  const start = `${dateString}T00:00:00`;
  const end = `${dateString}T23:59:59`;
  return { start, end };
};

// --- Type Definitions ---
interface KPIData {
  totalOPDAppointments: number;
  totalIPDAdmissions: number;
  totalDischarges: number;
  totalMajorOT: number;
  totalMinorOT: number;
  totalOTProcedures: number;
  totalDeaths: number;
  totalCasualtyOPD: number;
  totalConsultantOPD: number;
  totalXray: number;
  totalDialysis: number;
  totalPathology: number;
}


interface BedManagement {
  wardName: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
}

interface Alert {
  type: 'warning' | 'info' | 'success';
  icon: React.ElementType;
  message: string;
}

const DPRPage = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState<string>('all'); // This filter is not fully implemented in fetching logic, but kept for UI
  const [isLoading, setIsLoading] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Ref for the content to be printed
  const printContentRef = useRef<HTMLDivElement>(null);

  // Data states
  const [kpiData, setKpiData] = useState<KPIData>({
    totalOPDAppointments: 0,
    totalIPDAdmissions: 0,
    totalDischarges: 0,
    totalMajorOT: 0,
    totalMinorOT: 0,
    totalOTProcedures: 0,
    totalDeaths: 0,
    totalCasualtyOPD: 0,
    totalConsultantOPD: 0,
    totalXray: 0,
    totalDialysis: 0,
    totalPathology: 0,
  });

  const [bedManagement, setBedManagement] = useState<BedManagement[]>([]);

  const fetchDPRData = useCallback(async () => {
    setIsLoading(true);
    const currentAlerts: Alert[] = [];
    try {
      const { start, end } = getDayRangeForSupabase(selectedDate);

      // --- Fetching data from Supabase ---
      const { data: opdAppointments, error: opdError } = await supabase
        .from('opd_registration')
        .select(`
          created_at,
          service_info,
          payment_info,
          "additional Notes",
          opd_id,
          date
        `)
        .gte('created_at', start)
        .lte('created_at', end);
      if (opdError) {
        console.error("Supabase OPD fetch error:", opdError);
        throw opdError;
      }

      // Fetch IPD admissions that *began* on the selected date
      const { data: ipdAdmissions, error: ipdError } = await supabase
        .from('ipd_registration')
        .select(`
          ipd_id,
          created_at,
          discharge_date,
          bed_id,
          admission_type
        `)
        .gte('created_at', start)
        .lte('created_at', end);
      if (ipdError) {
        console.error("Supabase IPD fetch error:", ipdError);
        throw ipdError;
      }

      // Fetch all IPD registrations that were active on the selected date for accurate bed management
      // This means admitted on or before selectedDate, and discharged on or after selectedDate, or not yet discharged
      const { data: activeIpdRegistrations, error: activeIpdError } = await supabase
        .from('ipd_registration')
        .select(`
          ipd_id,
          admission_date,
          admission_time,
          discharge_date,
          bed_id
        `);
      
      if (activeIpdError) {
        console.error("Supabase Active IPD fetch error:", activeIpdError);
        throw activeIpdError;
      }


      const { data: otProcedures, error: otError } = await supabase
        .from('ot_details')
        .select(`
          created_at,
          ot_date,
          ot_type,
          ot_notes
        `)
        .gte('created_at', start)
        .lte('created_at', end);
      if (otError) {
        console.error("Supabase OT fetch error:", otError);
        throw otError;
      }

      const { data: beds, error: bedError } = await supabase
        .from('bed_management')
        .select('id, status, room_type'); // Ensure 'id' is selected for bed matching
      if (bedError) {
        console.error("Supabase Beds fetch error:", bedError);
        throw bedError;
      }

      // Fetch discharge summaries for discharges on the selected date, including discharge_type
      const { data: dischargeSummaries, error: dischargeError } = await supabase
        .from('discharge_summaries')
        .select(`
          id,
          ipd_id,
          discharge_type,
          last_updated
        `)
        .gte('last_updated', start) // Assuming last_updated reflects discharge date
        .lte('last_updated', end);
      if (dischargeError) {
        console.error("Supabase Discharge Summaries fetch error:", dischargeError);
        throw dischargeError;
      }

      // --- KPI Calculations ---
      const totalOPD = opdAppointments?.length || 0;

      let totalCasualtyOPD = 0;
      let totalConsultantOPD = 0;
      let totalXray = 0;
      let totalDialysis = 0;

      opdAppointments?.forEach((appointment: any) => {
        if (appointment.service_info && Array.isArray(appointment.service_info)) {
          appointment.service_info.forEach((service: any) => {
            const serviceType = service.type?.toLowerCase();
            if (serviceType === 'casualty') {
              totalCasualtyOPD++;
              if (service.service?.toLowerCase().includes('dialysis')) {
                totalDialysis++;
              }
            } else if (serviceType === 'consultation') {
              totalConsultantOPD++;
            } else if (serviceType === 'xray') {
              totalXray++;
            }
          });
        }
      });

      const totalIPD = ipdAdmissions?.length || 0;

      // Count discharges and deaths based on discharge_summaries for the selected date
      const dischargesOnSelectedDate = dischargeSummaries?.filter(summary => {
        const dischargeDateFormatted = format(parseISO(summary.last_updated), 'yyyy-MM-dd');
        return dischargeDateFormatted === selectedDate;
      }) || [];

      const totalDischarges = dischargesOnSelectedDate.length;
      const totalDeaths = dischargesOnSelectedDate.filter(summary => summary.discharge_type === 'Death').length;


      // OT Calculations - Major vs Minor
      const majorOT = otProcedures?.filter(ot =>
        ot.ot_type?.toLowerCase().includes('major') ||
        ot.ot_notes?.toLowerCase().includes('major')
      ).length || 0;

      const minorOT = otProcedures?.filter(ot =>
        ot.ot_type?.toLowerCase().includes('minor') ||
        ot.ot_notes?.toLowerCase().includes('minor')
      ).length || 0;

      const totalOT = majorOT + minorOT;

      // Fetch Pathology count from secure server API
      let totalPathology = 0;
      try {
        const res = await fetch('/api/lab/pathology-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate })
        })
        if (res.ok) {
          const json = await res.json()
          if (json && typeof json.count === 'number') {
            totalPathology = json.count
          }
        } else {
          console.warn('Failed to fetch pathology count')
        }
      } catch (e) {
        console.warn('Error while fetching pathology count', e)
      }

      setKpiData({
        totalOPDAppointments: totalOPD,
        totalIPDAdmissions: totalIPD,
        totalDischarges: totalDischarges,
        totalMajorOT: majorOT,
        totalMinorOT: minorOT,
        totalOTProcedures: totalOT,
        totalDeaths: totalDeaths,
        totalCasualtyOPD: totalCasualtyOPD,
        totalConsultantOPD: totalConsultantOPD,
        totalXray: totalXray,
        totalDialysis: totalDialysis,
        totalPathology,
      });

      // --- Bed Management Tab Data Calculation for the selected date ---
      const bedStatusForSelectedDate: { [bedId: number]: boolean } = {}; // true if occupied

      activeIpdRegistrations?.forEach((ipd: any) => {
        const admissionDateTime = parseISO(`${ipd.admission_date}T${ipd.admission_time || '00:00:00'}`);
        const dischargeDateTime = ipd.discharge_date ? parseISO(ipd.discharge_date) : null;
        const selectedDateStart = parseISO(start);
        const selectedDateEnd = parseISO(end);

        // Check if the IPD registration was active at any point on the selected date
        const wasAdmittedOnOrBeforeSelectedDate = admissionDateTime <= selectedDateEnd;
        const wasDischargedOnOrAfterSelectedDate = !dischargeDateTime || dischargeDateTime >= selectedDateStart;

        if (wasAdmittedOnOrBeforeSelectedDate && wasDischargedOnOrAfterSelectedDate) {
          if (ipd.bed_id) {
            bedStatusForSelectedDate[ipd.bed_id] = true; // Mark bed as occupied for the selected date
          }
        }
      });
      
      const uniqueRoomTypes = Array.from(new Set(beds?.map(bed => bed.room_type).filter(Boolean))) as string[];

      const bedManagementData: BedManagement[] = uniqueRoomTypes
        .filter(roomType => !roomType.toLowerCase().includes('test ward'))
        .map(roomType => {
          const bedsInThisWard = beds?.filter(bed => bed.room_type === roomType) || [];
          const totalBedsInWard = bedsInThisWard.length;
          
          let occupiedBedsInWard = 0;
          bedsInThisWard.forEach(bed => {
            if (bedStatusForSelectedDate[bed.id]) {
              occupiedBedsInWard++;
            }
          });

          const availableBedsInWard = totalBedsInWard - occupiedBedsInWard;
          const occupancyRate = totalBedsInWard > 0 ? (occupiedBedsInWard / totalBedsInWard) * 100 : 0;

          return {
            wardName: roomType,
            totalBeds: totalBedsInWard,
            occupiedBeds: occupiedBedsInWard,
            availableBeds: availableBedsInWard,
            occupancyRate: parseFloat(occupancyRate.toFixed(1)),
          };
        }).sort((a,b) => b.occupancyRate - a.occupancyRate);

      setBedManagement(bedManagementData);


      // --- Automated Alerts Generation ---
      if (totalOT === 0 && selectedDate === format(new Date(), 'yyyy-MM-dd')) {
        currentAlerts.push({
          type: 'info',
          message: 'No OT procedures scheduled for today. Verify OT schedules.',
          icon: Clock
        });
      }

      if (totalDischarges > 10) { // Example threshold
        currentAlerts.push({
          type: 'success',
          message: `High discharge rate: ${totalDischarges} patients discharged today.`,
          icon: TrendingUp
        });
      }

      if (totalDeaths > 0) {
        currentAlerts.push({
          type: 'warning',
          message: `${totalDeaths} death(s) recorded today. Review cases for quality assurance.`,
          icon: AlertTriangle
        });
      }

      setAlerts(currentAlerts);

    } catch (error) {
      console.error('Caught error during DPR data fetch:', error);
      setAlerts([{ type: 'warning', message: 'Failed to load data. Please try again later. Check console for details.', icon: AlertTriangle }]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]); // Re-run fetchDPRData when selectedDate changes

  useEffect(() => {
    fetchDPRData();
  }, [selectedDate, fetchDPRData]);

  const generatePrintContent = useCallback(() => {
    return (
      <div className="pdf-content-wrapper" style={{
        fontFamily: 'Arial, sans-serif',
        // Overall padding reduced significantly to maximize content area
        padding: '10px 15px', // Top/Bottom, Left/Right
        color: '#333',
        width: '210mm',      // A4 width
        height: '296mm',     // Slightly less than full A4 height to avoid overflow rounding
        boxSizing: 'border-box',
        position: 'relative',
        backgroundImage: `url(${typeof window !== 'undefined' ? window.location.origin : ''}/letterhead.png)`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center',
        backgroundSize: '210mm 297mm', // Exact A4 dimensions
        fontSize: '11px', // Base font size for report, can be adjusted further
        overflow: 'hidden', // Prevent content spill that can trigger extra pages
      }}>
        <style>
          {`
            @page {
              size: A4;
              margin: 0; /* Remove default page margins */
            }
            body {
              margin: 0;
              padding: 0;
            }

            /* Make card and table backgrounds transparent */
            .kpi-card, .ot-card, .bed-table, .bed-table th, .bed-table td, .ot-item, .alert-item {
              background-color: transparent !important; /* Override all default backgrounds */
              border-color: #d1d5db; /* Keep borders visible if desired */
            }

            /* Adjust internal padding/margins for content to sit well on letterhead */
            .header {
              text-align: center;
              margin-bottom: 15px; /* Reduced margin */
              padding-top: 150px; /* Increased top padding to prevent cutting off */
            }
            .title {
              font-size: 22px; /* Smaller title */
              font-weight: bold;
              margin: 10px 0;
              text-align: center;
              color: #2563eb;
            }
            .date-info {
              text-align: center;
              margin: 5px 0 15px 0; /* Reduced margin */
              font-size: 12px;
              color: #6b7280;
              font-weight: 500;
            }

            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(8, 1fr);
              gap: 6px; /* Further reduced gap for 7 columns */
              margin: 15px 0; /* Reduced margin */
            }
            .kpi-card {
              border: 1px solid #e5e7eb;
              padding: 8px; /* Reduced padding */
              text-align: center;
              border-radius: 6px; /* Slightly smaller border radius */
              background: #f9fafb;
            }
            .kpi-value {
              font-size: 24px; /* Slightly smaller for 7 columns */
              font-weight: bold;
              color: #2563eb;
              margin-bottom: 3px; /* Reduced margin */
            }
            .kpi-label {
              font-size: 10px; /* Smaller KPI label */
              color: #6b7280;
              font-weight: 500;
            }

            .ot-card {
              border: 1px solid #e5e7eb;
              padding: 8px; /* Reduced padding */
              text-align: center;
              border-radius: 6px;
              margin: 15px 0; /* Reduced margin */
            }
            .ot-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 6px; /* Reduced gap */
              margin-top: 8px; /* Reduced margin */
            }
            .ot-item {
              padding: 4px; /* Reduced padding */
              border: 1px solid #d1d5db;
              border-radius: 4px; /* Smaller border radius */
            }
            .ot-value {
              font-size: 18px; /* Smaller OT value */
              font-weight: bold;
              color: #059669;
            }
            .ot-label {
              font-size: 9px; /* Smaller OT label */
              color: #6b7280;
              margin-top: 2px;
            }

            .bed-section {
              margin-top: 15px; /* Reduced margin */
            }
            .section-title {
              font-size: 15px; /* Smaller section title */
              font-weight: bold;
              text-align: center;
              margin: 15px 0 8px 0; /* Reduced margin */
              color: #374151;
            }
            .bed-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px; /* Reduced margin */
              border: 1px solid #e5e7eb;
              font-size: 10px; /* Smaller table font size */
            }
            .bed-table th, .bed-table td {
              border: 1px solid #d1d5db;
              padding: 6px; /* Significantly reduced padding */
              text-align: center;
            }
            .bed-table th {
              font-weight: bold;
              color: #374151;
            }
            /* Specific styles for the OPD breakdown in PDF */
            .opd-breakdown-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 5px;
              margin-top: 5px;
            }
            .opd-breakdown-item {
                text-align: center;
            }
            .opd-breakdown-value {
                font-size: 12px;
                font-weight: bold;
            }
            .opd-breakdown-label {
                font-size: 9px;
                color: #6b7280;
            }

          `}
        </style>
        <div className="header">
          <div className="title">Daily Performance Report</div>
          <div className="date-info">Date: {format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}</div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalOPDAppointments}</div>
            <div className="kpi-label">Total OPD Appointments</div>
            {/* NEW: OPD Breakdown for PDF */}
            <div className="opd-breakdown-grid">
              <div className="opd-breakdown-item">
                <div className="opd-breakdown-value" style={{ color: '#dc2626' }}>{kpiData.totalCasualtyOPD}</div>
                <div className="opd-breakdown-label">Casualty</div>
              </div>
              <div className="opd-breakdown-item">
                <div className="opd-breakdown-value" style={{ color: '#4f46e5' }}>{kpiData.totalConsultantOPD}</div>
                <div className="opd-breakdown-label">Consultant</div>
              </div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalIPDAdmissions}</div>
            <div className="kpi-label">Total IPD Admissions</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalOTProcedures}</div>
            <div className="kpi-label">Total OT</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalDischarges}</div>
            <div className="kpi-label">Total Discharges</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalDeaths}</div>
            <div className="kpi-label">Total Deaths</div>
          </div>
          {/* NEW: X-ray and Dialysis for PDF */}
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalXray}</div>
            <div className="kpi-label">Total X-ray</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalDialysis}</div>
            <div className="kpi-label">Total Dialysis</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{kpiData.totalPathology}</div>
            <div className="kpi-label">Total Pathology</div>
          </div>
        </div>

        <div className="ot-card">
          <div className="section-title">OT Breakdown</div>
          <div className="ot-grid">
            <div className="ot-item">
              <div className="ot-value">{kpiData.totalMajorOT}</div>
              <div className="ot-label">Major OT</div>
            </div>
            <div className="ot-item">
              <div className="ot-value">{kpiData.totalMinorOT}</div>
              <div className="ot-label">Minor OT</div>
            </div>
            <div className="ot-item">
              <div className="ot-value">{kpiData.totalOTProcedures}</div>
              <div className="ot-label">Total OT</div>
            </div>
          </div>
        </div>

        

        <div className="bed-section">
          <div className="section-title">Bed Management Status</div>
          <table className="bed-table">
            <thead>
              <tr>
                <th>Ward/Type</th>
                <th>Total Beds</th>
                <th>Occupied</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {/* Conditional rendering: Only render if bedManagement has data to avoid empty table */}
              {bedManagement.length > 0 ? (
                bedManagement.map((ward, index) => (
                  <tr key={index}>
                    <td>{ward.wardName}</td>
                    <td>{ward.totalBeds}</td>
                    <td>{ward.occupiedBeds}</td>
                    <td>{ward.availableBeds}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '10px' }}>No bed data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>


      </div>
    );
  }, [selectedDate, kpiData, bedManagement]); // Removed 'alerts' from dependency array


  const handlePrint = async () => {
    if (printContentRef.current && html2pdf) {
      const options = {
        margin: [0, 0, 0, 0], // Keep margins at 0 for full letterhead coverage
        filename: `Daily_Performance_Report_${format(parseISO(selectedDate), 'yyyy-MM-dd')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2, // Keep scale high for quality
          useCORS: true,
          allowTaint: true,
          logging: false,
          letterRendering: true,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] },
      };

      try {
        // Build PDF, remove any trailing blank page, and open in new tab
        const worker = html2pdf().from(printContentRef.current).set(options).toPdf();
        const pdf = await worker.get('pdf');

        const totalPages = pdf.internal.getNumberOfPages();
        if (totalPages > 1) {
          // For DPR we expect a single page; remove any unintended trailing page
          pdf.deletePage(totalPages);
        }

        const blobUrl = pdf.output('bloburl');
        window.open(blobUrl, '_blank');
      } catch (error) {
        console.error('Error generating PDF:', error);
        // Fallback to original download method
        html2pdf().from(printContentRef.current).set(options).save();
      }
    } else if (!html2pdf) {
      console.warn('html2pdf not loaded yet. Please try again.');
    }
  };


  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto mb-6"></div>
            <p className="text-lg text-gray-700 font-medium">Loading Daily Performance Report...</p>
            <p className="text-sm text-gray-500 mt-2">Fetching the latest data for <span className="font-semibold">{format(parseISO(selectedDate), 'MMM dd, yyyy')}</span>...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8 p-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 bg-white p-6 rounded-lg shadow-md">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 leading-tight">Daily Performance Report</h1>
            <p className="text-lg text-gray-600 mt-2">A comprehensive overview of hospital operations for <span className="font-semibold text-blue-700">{format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}</span></p>
          </div>

          {/* Filters and Print Button */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition duration-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-500" />
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-auto border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition duration-200">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="opd">OPD</SelectItem>
                  <SelectItem value="ipd">IPD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print DPR
            </Button>
          </div>
        </div>

        {/* Summary Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Daily Service Summary</h2>
              <p className="text-blue-100">Complete overview of all hospital services for {format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}</p>
            </div>
            <div className="mt-4 md:mt-0 text-center md:text-right">
              <div className="text-3xl font-bold">{kpiData.totalOPDAppointments + kpiData.totalIPDAdmissions}</div>
              <div className="text-blue-100 text-sm">Total Patients</div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-blue-100 bg-blue-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Total OPD Appointments</CardTitle>
              <Calendar className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900">{kpiData.totalOPDAppointments}</div>
              <p className="text-xs text-blue-600 mt-1">Appointments on {format(parseISO(selectedDate), 'MMM dd')}</p>
              {/* NEW: OPD Breakdown for UI */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-sm font-semibold text-red-600">{kpiData.totalCasualtyOPD}</div>
                  <p className="text-xs text-red-600">Casualty</p>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-indigo-600">{kpiData.totalConsultantOPD}</div>
                  <p className="text-xs text-indigo-600">Consultant</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-purple-100 bg-purple-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Total IPD Admissions</CardTitle>
              <Building2 className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900">{kpiData.totalIPDAdmissions}</div>
              <p className="text-xs text-purple-600 mt-1">Admissions on {format(parseISO(selectedDate), 'MMM dd')}</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-green-100 bg-green-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Total OT</CardTitle>
              <Stethoscope className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900">{kpiData.totalOTProcedures}</div>
              <p className="text-xs text-green-600 mt-1">Procedures on {format(parseISO(selectedDate), 'MMM dd')}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-sm font-semibold text-orange-600">{kpiData.totalMajorOT}</div>
                  <p className="text-xs text-orange-600">Major</p>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-teal-600">{kpiData.totalMinorOT}</div>
                  <p className="text-xs text-teal-600">Minor</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-emerald-100 bg-emerald-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800">Total Discharges</CardTitle>
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-900">{kpiData.totalDischarges}</div>
              <p className="text-xs text-emerald-600 mt-1">Discharges on {format(parseISO(selectedDate), 'MMM dd')}</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-red-100 bg-red-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-800">Total Deaths</CardTitle>
              <Heart className="h-5 w-5 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-900">{kpiData.totalDeaths}</div>
              <p className="text-xs text-red-600 mt-1">Deaths on {format(parseISO(selectedDate), 'MMM dd')}</p>
            </CardContent>
          </Card>

          {/* NEW: X-ray KPI Card */}
          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-amber-100 bg-amber-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-800">Total X-ray</CardTitle>
              <X className="h-5 w-5 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-900">{kpiData.totalXray}</div>
              <p className="text-xs text-amber-600 mt-1">X-ray Services</p>
            </CardContent>
          </Card>

          {/* NEW: Dialysis KPI Card */}
          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-cyan-100 bg-cyan-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-cyan-800">Total Dialysis</CardTitle>
              <Activity className="h-5 w-5 text-cyan-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cyan-900">{kpiData.totalDialysis}</div>
              <p className="text-xs text-cyan-600 mt-1">Dialysis Services</p>
            </CardContent>
          </Card>

          {/* NEW: Pathology KPI Card */}
          <Card className="hover:shadow-lg transition-shadow duration-300 ease-in-out border border-rose-100 bg-rose-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-rose-800">Total Pathology</CardTitle>
              <TrendingUp className="h-5 w-5 text-rose-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-900">{kpiData.totalPathology}</div>
              <p className="text-xs text-rose-600 mt-1">Lab Tests</p>
            </CardContent>
          </Card>
        </div>

        {/* Service Breakdown Summary */}
        <Card className="shadow-lg border border-gray-100 mt-6">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-xl font-semibold text-gray-800">Service Breakdown Summary ({format(parseISO(selectedDate), 'dd-MM-yyyy')})</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-2xl font-bold text-blue-700">{kpiData.totalCasualtyOPD}</div>
                <div className="text-sm font-medium text-blue-600">Casualty Services</div>
                <div className="text-xs text-blue-500 mt-1">Emergency & Walk-in</div>
              </div>
              <div className="text-center p-4 bg-indigo-50 rounded-lg border border-indigo-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-2xl font-bold text-indigo-700">{kpiData.totalConsultantOPD}</div>
                <div className="text-sm font-medium text-indigo-600">Consultation Services</div>
                <div className="text-xs text-indigo-500 mt-1">Scheduled Appointments</div>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-2xl font-bold text-amber-700">{kpiData.totalXray}</div>
                <div className="text-sm font-medium text-amber-600">X-ray Services</div>
                <div className="text-xs text-amber-500 mt-1">Diagnostic Imaging</div>
              </div>
              <div className="text-center p-4 bg-cyan-50 rounded-lg border border-cyan-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-2xl font-bold text-cyan-700">{kpiData.totalDialysis}</div>
                <div className="text-sm font-medium text-cyan-600">Dialysis Services</div>
                <div className="text-xs text-cyan-500 mt-1">Kidney Treatment</div>
              </div>
              <div className="text-center p-4 bg-rose-50 rounded-lg border border-rose-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-2xl font-bold text-rose-700">{kpiData.totalPathology}</div>
                <div className="text-sm font-medium text-rose-600">Pathology Tests</div>
                <div className="text-xs text-rose-500 mt-1">Daily Lab Count</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bed Management Section */}
        <Card className="shadow-lg border border-gray-100">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-xl font-semibold text-gray-800">Bed Management Overview ({format(parseISO(selectedDate), 'dd-MM-yyyy')})</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table className="min-w-full divide-y divide-gray-200">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ward/Type</TableHead>
                    <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Beds</TableHead>
                    <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Occupied</TableHead>
                    <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white divide-y divide-gray-200">
                  {bedManagement.map((ward, index) => (
                    <TableRow key={index} className="hover:bg-gray-50 transition-colors duration-200">
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ward.wardName}</TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{ward.totalBeds}</TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{ward.occupiedBeds}</TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">{ward.availableBeds}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>



        {/* Hidden div for PDF generation */}
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '210mm', height: '297mm' }}>
          <div ref={printContentRef}>
            {generatePrintContent()}
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default DPRPage