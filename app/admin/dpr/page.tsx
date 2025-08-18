'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Layout from '@/components/global/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Calendar, Stethoscope, TrendingUp, AlertTriangle, Clock, UserCheck, Building2, Printer, Heart, X, Activity } from 'lucide-react'
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
  totalOtherOPD: number; // NEW
  totalXray: number;
  totalDialysis: number;
  totalPathology: number;
  totalBirths: number; // NEW
  birthsInOT: number; // NEW
  birthsInLabourRoom: number; // NEW
  totalTpaIpd: number; // New field for total TPA IPD
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
    totalOtherOPD: 0, // NEW
    totalXray: 0,
    totalDialysis: 0,
    totalPathology: 0,
    totalBirths: 0, // NEW
    birthsInOT: 0, // NEW
    birthsInLabourRoom: 0, // NEW
    totalTpaIpd: 0, // New field for total TPA IPD
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

      // Fetch total TPA IPD registrations
      const { data: tpaIpdData, error: tpaIpdError } = await supabase
        .from('ipd_registration')
        .select('ipd_id')
        .eq('tpa', true)
        .gte('created_at', start)
        .lte('created_at', end);
      if (tpaIpdError) {
        console.error("Supabase TPA IPD fetch error:", tpaIpdError);
        throw tpaIpdError;
      }

      // Fetch all IPD registrations that were active on the selected date for accurate bed management
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

      // NEW: Fetch OT/Labour Room data specifically for baby births
      const { data: babyBirthsData, error: babyBirthsError } = await supabase
        .from('ot_details')
        .select(`
          id,
          location_type,
          has_baby_birth
        `)
        .eq('has_baby_birth', true) // Filter for records with baby births
        .gte('created_at', start)
        .lte('created_at', end);

      if (babyBirthsError) {
        console.error("Supabase Baby Births fetch error:", babyBirthsError);
        throw babyBirthsError;
      }

      // --- KPI Calculations ---
      const totalOPD = opdAppointments?.length || 0;

      let totalCasualtyOPD = 0;
      let totalConsultantOPD = 0;
      let totalOtherOPD = 0; // Initialize new counter
      let totalDialysis = 0;

      const countedOpdIds = new Set(); // To track unique OPD appointments

      opdAppointments?.forEach((appointment: any) => {
        if (countedOpdIds.has(appointment.opd_id)) {
          return; // Skip if this OPD appointment has already been counted
        }

        let isCasualty = false;
        let isConsultation = false;

        if (appointment.service_info && Array.isArray(appointment.service_info)) {
          appointment.service_info.forEach((service: any) => {
            const serviceType = service.type?.toLowerCase();
            if (serviceType === 'casualty') {
              isCasualty = true;
              if (service.service?.toLowerCase().includes('dialysis')) {
                totalDialysis++;
              }
            } else if (serviceType === 'consultation') {
              isConsultation = true;
            }
            // X-ray count can still be per service, as per original logic if not tied to unique appointments
            if (serviceType === 'xray') {
              // We keep this as is, as X-ray count might be a service count, not an appointment count
              // If X-ray also needs to be per unique appointment, its logic would need adjustment too.
              // For now, it remains a service count if multiple X-rays can be in one appointment.
              // totalXray++; // This was moved out of the loop and handled by API call
            }
          });
        }

        // Categorize the unique appointment
        if (isCasualty) {
          totalCasualtyOPD++;
        } else if (isConsultation) {
          totalConsultantOPD++;
        } else {
          totalOtherOPD++; // Count as 'other' if neither casualty nor consultation
        }
        countedOpdIds.add(appointment.opd_id); // Mark this OPD ID as counted
      });

      const finalTotalOPDAppointments = totalCasualtyOPD + totalConsultantOPD + totalOtherOPD;

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

      // Fetch X-ray count from external API
      let totalXray = 0;
      try {
        const xrayApiDate = format(parseISO(selectedDate), 'dd-MM-yyyy');
        const hospitalName = process.env.NEXT_PUBLIC_LAB_HOSPITAL_NAME || 'Gautami Medford NX Hospital';

        if (!process.env.NEXT_PUBLIC_LAB_API_KEY) {
          console.error("NEXT_PUBLIC_LAB_API_KEY is not set. Skipping X-ray count API call.");
          return;
        }

        const res = await fetch('https://labapi.infispark.in/rest/v1/rpc/get_registration_count_xray', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_LAB_API_KEY,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_LAB_API_KEY}`,
          },
          body: JSON.stringify({ p_date: xrayApiDate, p_hospital: hospitalName })
        });

        if (res.ok) {
          const json = await res.json();
          // Assuming the API returns an array with the count in the first element
          if (typeof json === 'number') {
            totalXray = json;
          } else if (json && Array.isArray(json) && json.length > 0 && typeof json[0].count === 'number') {
            totalXray = json[0].count;
          } else {
            console.warn('X-ray API response format unexpected:', json);
          }
        } else {
          console.warn('Failed to fetch X-ray count from API:', res.status, res.statusText);
        }
      } catch (e) {
        console.warn('Error while fetching X-ray count:', e);
      }

      setKpiData({
        totalOPDAppointments: finalTotalOPDAppointments,
        totalIPDAdmissions: totalIPD,
        totalDischarges: totalDischarges,
        totalMajorOT: majorOT,
        totalMinorOT: minorOT,
        totalOTProcedures: totalOT,
        totalDeaths: totalDeaths,
        totalCasualtyOPD: totalCasualtyOPD,
        totalConsultantOPD: totalConsultantOPD,
        totalOtherOPD: totalOtherOPD,
        totalXray: totalXray,
        totalDialysis: totalDialysis,
        totalPathology,
        totalBirths: babyBirthsData?.length || 0, // Calculate total births
        birthsInOT: babyBirthsData?.filter(b => b.location_type === 'OT').length || 0, // Calculate births in OT
        birthsInLabourRoom: babyBirthsData?.filter(b => b.location_type === 'Labour Room').length || 0, // Calculate births in Labour Room
        totalTpaIpd: tpaIpdData?.length || 0, // Calculate total TPA IPD
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
    const org = (typeof window !== 'undefined' ? window.location.origin : '') || '';
    const letterheadURL = `${org}/letterhead.png`;
    const logoURL = `${org}/logo.png`; // optional, place /public/logo.png
  
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const generatedAt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  
    return (
      <div
        className="pdf-content-wrapper"
        style={{
          fontFamily: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          // <CHANGE> Reduced padding for more content density
          padding: '30mm 10mm 6mm 10mm', // Increased top padding from 25mm to 30mm
          color: '#111827',
          width: '210mm',
          height: '297mm',
          boxSizing: 'border-box',
          position: 'relative',
          backgroundImage: `url(${letterheadURL})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center center',
          backgroundSize: '210mm 297mm',
          // <CHANGE> Increased base font size from 11px to 13px
          fontSize: '13px',
          lineHeight: 1.4,
          overflow: 'hidden',
        }}
      >
        <style>
          {`
            @page { size: A4; margin: 0; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  
            .muted { color: #6b7280; }
            .subtle { color: #374151; }
            .accent { color: #2563eb; }
            .accent-green { color: #059669; }
            .accent-red { color: #dc2626; }
            .accent-amber { color: #b45309; }
            .accent-indigo { color: #4f46e5; }
  
            .header {
              display: flex;
              flex-direction: column;
              align-items: center;
              margin-bottom: 4mm;
              padding-top: 15mm;
            }
  
            .logo {
              width: 16mm;
              height: 16mm;
              object-fit: contain;
              border-radius: 3mm;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              margin-bottom: 2mm;
            }
  
            .title-wrap {
              display: flex;
              flex-direction: column;
              align-items: center;
              row-gap: 1.5mm;
            }
  
            .report-title {
              font-size: 20px;
              font-weight: 900;
              letter-spacing: 0.3px;
              text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
  
            .meta-line {
              display: flex;
              gap: 6mm;
              flex-wrap: wrap;
              font-size: 12px;
              font-weight: 500;
              justify-content: center;
            }
  
            .chip {
              display: inline-block;
              padding: 3px 8px;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(37, 99, 235, 0.04));
              color: #1f2937;
              font-weight: 600;
              font-size: 11px;
            }
  
            .divider {
              height: 2px;
              background: linear-gradient(to right, #2563eb, #3b82f6 40%, rgba(59, 130, 246, 0.3));
              margin: 2mm 0 3mm;
              border-radius: 1px;
            }
  
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 3mm;
              margin: 0 0 4mm;
            }
            .kpi {
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 3mm 2.5mm;
              background: linear-gradient(135deg, rgba(249, 250, 251, 0.9), rgba(255, 255, 255, 0.8));
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }
            .kpi .val {
              font-size: 22px;
              font-weight: 900;
              margin-bottom: 1mm;
              color: #111827;
            }
            .kpi .label {
              font-size: 11px;
              color: #6b7280;
              font-weight: 700;
              letter-spacing: 0.3px;
              text-transform: uppercase;
            }
  
            .opd-breakdown {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 1.5mm;
              margin-top: 2mm;
            }
            .opd-item { text-align: center; }
            .opd-item .v { font-size: 13px; font-weight: 800; }
            .opd-item .t { font-size: 10px; color: #6b7280; margin-top: 0.5mm; font-weight: 600; }
  
            .section-title {
              font-size: 15px;
              font-weight: 900;
              color: #1f2937;
              letter-spacing: 0.3px;
              text-transform: uppercase;
              margin-bottom: 2mm;
              padding-bottom: 1mm;
              border-bottom: 2px solid #e5e7eb;
            }
            .section {
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 3mm;
              background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(249, 250, 251, 0.8));
              margin-bottom: 3mm;
              box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .ot-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 2.5mm;
              margin-top: 2mm;
            }
            .ot {
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 2.5mm;
              text-align: center;
              background: linear-gradient(135deg, rgba(5, 150, 105, 0.05), rgba(5, 150, 105, 0.02));
            }
            .ot .val {
              font-size: 20px;
              font-weight: 900;
              color: #065f46;
            }
            .ot .t {
              font-size: 11px; 
              color: #6b7280; 
              margin-top: 1mm;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.2px;
            }
  
            .table-wrap { margin-top: 2mm; }
            table.bed {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              overflow: hidden;
            }
            .bed th, .bed td {
              border: 1px solid #e5e7eb;
              padding: 1mm 2.5mm; /* Further decreased padding */
              text-align: center;
            }
            .bed th {
              font-weight: 800;
              background: linear-gradient(135deg, rgba(243, 244, 246, 0.9), rgba(249, 250, 251, 0.8));
              color: #374151;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.2px;
            }
            .bed tr.highlight td {
              background: rgba(249, 250, 251, 0.5);
            }
            .bed td {
              font-weight: 600;
            }
  
            .footer {
              position: absolute;
              left: 10mm;
              right: 10mm;
              bottom: 6mm;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              color: #6b7280;
              font-weight: 500;
              padding-top: 2mm;
              border-top: 1px solid #e5e7eb;
            }
            .footer strong { color: #374151; font-weight: 700; }

            /* <CHANGE> Added secondary KPI grid for better content organization */
            .secondary-kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 3mm;
              margin: 0 0 4mm;
            }
            .secondary-kpi {
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 2.5mm;
              background: linear-gradient(135deg, rgba(239, 246, 255, 0.8), rgba(255, 255, 255, 0.6));
              text-align: center;
            }
            .secondary-kpi .val {
              font-size: 18px;
              font-weight: 800;
              margin-bottom: 0.5mm;
              color: #2563eb;
            }
            .secondary-kpi .label {
              font-size: 10px;
              color: #6b7280;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.2px;
            }
          `}
        </style>
  
        {/* HEADER */}
        <div className="header">
          <img className="logo" src={logoURL || "/placeholder.svg"} alt="Logo" onError={(e) => ((e.target as HTMLImageElement).style.display='none')} />
          <div className="title-wrap">
            <div className="report-title accent">Daily Performance Report</div>
            <div className="meta-line">
              <span>
                <strong>Date:</strong> {format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}
              </span>
              <span className="muted">Comprehensive Operations Overview</span>
              <span className="chip">Inficare RMS Professional</span>
            </div>
          </div>
        </div>
  
        <div className="divider" />
  
        {/* <CHANGE> Reorganized KPI grid to be more compact with 4 columns */}
        <div className="kpi-grid">
          <div className="kpi">
            <div className="val">{kpiData.totalOPDAppointments}</div>
            <div className="label">OPD Appointments</div>
            <div className="opd-breakdown">
              <div className="opd-item">
                <div className="v accent-red">{kpiData.totalCasualtyOPD}</div>
                <div className="t">Casualty</div>
              </div>
              <div className="opd-item">
                <div className="v accent-indigo">{kpiData.totalConsultantOPD}</div>
                <div className="t">Consultant</div>
              </div>
              <div className="opd-item">
                <div className="v accent-amber">{kpiData.totalOtherOPD}</div>
                <div className="t">Other</div>
              </div>
            </div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalBirths}</div>
            <div className="label">Total Births</div>
            <div className="opd-breakdown">
              <div className="opd-item">
                <div className="v accent-pink">{kpiData.birthsInOT}</div>
                <div className="t">In OT</div>
              </div>
              <div className="opd-item">
                <div className="v accent-purple">{kpiData.birthsInLabourRoom}</div>
                <div className="t">Labour Room</div>
              </div>
            </div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalIPDAdmissions}</div>
            <div className="label">IPD Admissions</div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalOTProcedures}</div>
            <div className="label">OT Procedures</div>
            <div className="opd-breakdown">
              <div className="opd-item">
                <div className="v accent-green">{kpiData.totalMajorOT}</div>
                <div className="t">Major OT</div>
              </div>
              <div className="opd-item">
                <div className="v accent-green">{kpiData.totalMinorOT}</div>
                <div className="t">Minor OT</div>
              </div>
              <div className="opd-item">
                {/* Empty for spacing if needed, or remove if only two sub-points */}
              </div>
            </div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalDischarges}</div>
            <div className="label">Discharges</div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalDeaths}</div>
            <div className="label">Deaths</div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalXray}</div>
            <div className="label">X-Ray</div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalDialysis}</div>
            <div className="label">Dialysis</div>
          </div>

          <div className="kpi">
            <div className="val">{kpiData.totalPathology}</div>
            <div className="label">Pathology</div>
          </div>
        </div>

        {/* BEDS */}
        <div className="section">
          <div className="section-title">Bed Management Overview</div>
          <div className="table-wrap">
            <table className="bed">
              <thead>
                <tr>
                  <th>Ward/Department</th>
                  <th>Total Capacity</th>
                  <th>Occupied</th>
                  <th>Available</th>
                  <th>Occupancy %</th>
                  <th>Room Status</th>
                </tr>
              </thead>
              <tbody>
                {bedManagement.length > 0 ? (
                  bedManagement.map((ward, idx) => {
                    const occupancyRate = ward.totalBeds > 0 ? Math.round((ward.occupiedBeds / ward.totalBeds) * 100) : 0;
                    return (
                      <tr key={idx} className={idx % 2 === 1 ? 'highlight' : ''}>
                        <td style={{ textAlign: 'left', fontWeight: 700 }}>{ward.wardName}</td>
                        <td style={{ fontWeight: 600 }}>{ward.totalBeds}</td>
                        <td style={{ color: '#059669', fontWeight: 800 }}>{ward.occupiedBeds}</td>
                        <td style={{ color: '#2563eb', fontWeight: 800 }}>{ward.availableBeds}</td>
                        <td style={{
                          color: occupancyRate > 85 ? '#dc2626' : occupancyRate > 70 ? '#b45309' : '#059669',
                          fontWeight: 800
                        }}>
                          {occupancyRate}%
                        </td>
                        <td style={{
                          color: ward.availableBeds > 0 ? '#059669' : '#dc2626',
                          fontWeight: 800
                        }}>
                          {ward.availableBeds > 0 ? 'Available' : 'Full'}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '6mm', fontStyle: 'italic' }}>
                      No bed management data available for this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
  
        {/* FOOTER */}
        <div className="footer">
          <div>Generated: <strong>{generatedAt}</strong></div>
          <div className="muted">Daily Performance Report • Professional Edition</div>
          <div className="muted">Operations Department</div>
        </div>
      </div>
    );
  }, [selectedDate, kpiData, bedManagement]);

  const handleSendDPRToMerajSir = async () => {
    if (!html2pdf || !printContentRef.current) {
      console.warn('html2pdf not loaded or print content not available.');
      return;
    }

    setIsLoading(true);
    try {
      const options = {
        margin: [0, 0, 0, 0],
        filename: `Daily_Performance_Report_${format(parseISO(selectedDate), 'yyyy-MM-dd')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          letterRendering: true,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] },
      };

      const worker = html2pdf().from(printContentRef.current).set(options).toPdf();
      const pdf = await worker.get('pdf');
      const totalPages = pdf.internal.getNumberOfPages();
      if (totalPages > 1) {
        pdf.deletePage(totalPages);
      }

      const pdfBlob = new Blob([pdf.output('blob')], { type: 'application/pdf' });

      // Prepare the caption dynamically
      const caption = `*Daily Performance Report - ${format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}*

📈 *Key Performance Indicators:*
- Total OPD Appointments: *${kpiData.totalOPDAppointments}* 
    Casualty: ${kpiData.totalCasualtyOPD}, 
    Consultant: ${kpiData.totalConsultantOPD}, 
    Other: ${kpiData.totalOtherOPD}

- Total IPD Admissions: *${kpiData.totalIPDAdmissions}*

- Total Discharges: *${kpiData.totalDischarges}*

- Total OT Procedures: *${kpiData.totalOTProcedures}* 
    Major: ${kpiData.totalMajorOT},
    Minor: ${kpiData.totalMinorOT}

- Total Deaths: *${kpiData.totalDeaths}*

- Total X-ray: *${kpiData.totalXray}*

- Total Dialysis: *${kpiData.totalDialysis}*

- Total Pathology: *${kpiData.totalPathology}*

- Total Births: *${kpiData.totalBirths}*
    In OT: ${kpiData.birthsInOT},
    Labour Room: ${kpiData.birthsInLabourRoom}

_Generated automatically from the Inficare Management System._`;

      // Create FormData to send the PDF blob and caption
      const formData = new FormData();
      formData.append('pdfFile', pdfBlob, options.filename);
      formData.append('caption', caption);
      formData.append('filename', options.filename); // Explicitly add filename

      // Send PDF to a new API route for upload and WhatsApp send
      const uploadRes = await fetch('/api/send-dpr', {
        method: 'POST',
        body: formData, // Send as FormData
      });

      if (uploadRes.ok) {
        const result = await uploadRes.json();
        alert(result.message);
      } else {
        const errorData = await uploadRes.json();
        throw new Error(errorData.message || 'Failed to send DPR via WhatsApp.');
      }
    } catch (error) {
      console.error('Error sending DPR:', error);
      alert(`Failed to send DPR: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 md:gap-6 bg-white p-4 sm:p-6 rounded-lg shadow-md">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">Daily Performance Report</h1>
            <p className="text-md sm:text-lg text-gray-600 mt-1 sm:mt-2">A comprehensive overview of hospital operations for <span className="font-semibold text-blue-700">{format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}</span></p>
          </div>

          {/* Filters and Print Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mt-4 sm:mt-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Calendar className="h-5 w-5 text-gray-500" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition duration-200"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Building2 className="h-5 w-5 text-gray-500" />
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-full sm:w-auto border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition duration-200">
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
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 w-full sm:w-auto"
            >
              <Printer className="h-4 w-4" />
              Print DPR
            </Button>
            <Button
              onClick={handleSendDPRToMerajSir}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2 w-full sm:w-auto"
              disabled={isLoading} // Disable button while loading
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a8.125 8.125 0 0 1 6.386-.713 12.915 12.915 0 0 1 3.292 1.487c.732.397 1.455.88 2.14 1.442A27.174 27.174 0 0 0 22.5 12c0 2.94-.585 5.75-1.68 8.232a8.15 8.15 0 0 1-2.643-3.63 10.518 10.518 0 0 0-4.636-4.636 8.15 8.15 0 0 1-3.63-2.643C6.349 7.085 4.939 4.75 3.478 2.405ZM18.784 12c.704.227 1.4.48 2.08.756a12.917 12.917 0 0 0-3.3-1.488 8.126 8.126 0 0 1-6.384-.711 10.518 10.518 0 0 0-4.637-4.637 8.15 8.15 0 0 1-2.643-3.63C4.25 4.939 6.585 6.349 9.068 7.451c2.482 1.096 4.755 1.69 7.03 1.69.76 0 1.51-.078 2.246-.226Z" fill="currentColor" />
                <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
              </svg>

              Send to Meraj Sir
            </Button>
          </div>
        </div>

        {/* Summary Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-5 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row items-center justify-between text-center md:text-left">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Daily Service Summary</h2>
              <p className="text-blue-100 text-sm sm:text-base">Complete overview of all hospital services for {format(parseISO(selectedDate), 'EEEE, MMMM dd, yyyy')}</p>
            </div>
            <div className="mt-3 md:mt-0 text-center md:text-right">
              <div className="text-3xl sm:text-4xl font-bold">{kpiData.totalOPDAppointments + kpiData.totalIPDAdmissions}</div>
              <div className="text-blue-100 text-sm">Total Patients</div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Total OPD Appointments</CardTitle>
              <Calendar className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-blue-900">{kpiData.totalOPDAppointments}</div>
              <p className="text-xs text-blue-600 mt-1">Appointments on {format(parseISO(selectedDate), 'MMM dd')}</p>
              {/* NEW: OPD Breakdown for UI */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-sm font-semibold text-red-600">{kpiData.totalCasualtyOPD}</div>
                  <p className="text-xs text-red-600">Casualty</p>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-indigo-600">{kpiData.totalConsultantOPD}</div>
                  <p className="text-xs text-indigo-600">Consultant</p>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-amber-600">{kpiData.totalOtherOPD}</div>
                  <p className="text-xs text-amber-600">Other</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Total IPD Admissions</CardTitle>
              <Building2 className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-purple-900">{kpiData.totalIPDAdmissions}</div>
              <p className="text-xs text-purple-600 mt-1">Admissions on {format(parseISO(selectedDate), 'MMM dd')}</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Total OT</CardTitle>
              <Stethoscope className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
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

          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800">Total Discharges</CardTitle>
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-emerald-900">{kpiData.totalDischarges}</div>
              <p className="text-xs text-emerald-600 mt-1">Discharges on {format(parseISO(selectedDate), 'MMM dd')}</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-800">Total Deaths</CardTitle>
              <Heart className="h-5 w-5 text-red-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-red-900">{kpiData.totalDeaths}</div>
              <p className="text-xs text-red-600 mt-1">Deaths on {format(parseISO(selectedDate), 'MMM dd')}</p>
            </CardContent>
          </Card>

          {/* NEW: X-ray KPI Card */}
          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-800">Total X-ray</CardTitle>
              <X className="h-5 w-5 text-amber-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-amber-900">{kpiData.totalXray}</div>
              <p className="text-xs text-amber-600 mt-1">X-ray Services</p>
            </CardContent>
          </Card>

          {/* NEW: Dialysis KPI Card */}
          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-cyan-800">Total Dialysis</CardTitle>
              <Activity className="h-5 w-5 text-cyan-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-cyan-900">{kpiData.totalDialysis}</div>
              <p className="text-xs text-cyan-600 mt-1">Dialysis Services</p>
            </CardContent>
          </Card>

          {/* NEW: Pathology KPI Card */}
          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-rose-800">Total Pathology</CardTitle>
              <TrendingUp className="h-5 w-5 text-rose-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-rose-900">{kpiData.totalPathology}</div>
              <p className="text-xs text-rose-600 mt-1">Lab Tests</p>
            </CardContent>
          </Card>

          {/* NEW: Total Births KPI Card */}
          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-pink-800">Total Births</CardTitle>
              <Heart className="h-5 w-5 text-pink-600" />
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-pink-900">{kpiData.totalBirths}</div>
              <p className="text-xs text-pink-600 mt-1">Births on {format(parseISO(selectedDate), 'MMM dd')}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-sm font-semibold text-pink-600">{kpiData.birthsInOT}</div>
                  <p className="text-xs text-pink-600">In OT</p>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-purple-600">{kpiData.birthsInLabourRoom}</div>
                  <p className="text-xs text-purple-600">Labour Room</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* NEW: Total TPA IPD Card */}
          <Card className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Total TPA IPD</CardTitle>
              <Building2 className="h-5 w-5 text-purple-600" /> {/* Using Building2 for IPD related */}
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3">
              <div className="text-3xl font-bold text-purple-900">{kpiData.totalTpaIpd}</div>
              <p className="text-xs text-purple-600 mt-1">TPA Admissions Today</p>
            </CardContent>
          </Card>
        </div>

        {/* Service Breakdown Summary */}
        <Card className="shadow-lg border border-gray-100 mt-6">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-xl font-semibold text-gray-800">Service Breakdown Summary ({format(parseISO(selectedDate), 'dd-MM-yyyy')})</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-xl sm:text-2xl font-bold text-blue-700">{kpiData.totalCasualtyOPD}</div>
                <div className="text-sm font-medium text-blue-600">Casualty Services</div>
                <div className="text-xs text-blue-500 mt-1">Emergency & Walk-in</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-indigo-50 rounded-lg border border-indigo-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-xl sm:text-2xl font-bold text-indigo-700">{kpiData.totalConsultantOPD}</div>
                <div className="text-sm font-medium text-indigo-600">Consultation Services</div>
                <div className="text-xs text-indigo-500 mt-1">Scheduled Appointments</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-amber-50 rounded-lg border border-amber-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-xl sm:text-2xl font-bold text-amber-700">{kpiData.totalXray}</div>
                <div className="text-sm font-medium text-amber-600">X-ray Services</div>
                <div className="text-xs text-amber-500 mt-1">Diagnostic Imaging</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-cyan-50 rounded-lg border border-cyan-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-xl sm:text-2xl font-bold text-cyan-700">{kpiData.totalDialysis}</div>
                <div className="text-sm font-medium text-cyan-600">Dialysis Services</div>
                <div className="text-xs text-cyan-500 mt-1">Kidney Treatment</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-rose-50 rounded-lg border border-rose-200 hover:shadow-md transition-all duration-200 hover:scale-105">
                <div className="text-xl sm:text-2xl font-bold text-rose-700">{kpiData.totalPathology}</div>
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
                    <TableHead className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ward/Type</TableHead>
                    <TableHead className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Beds</TableHead>
                    <TableHead className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Occupied</TableHead>
                    <TableHead className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white divide-y divide-gray-200">
                  {bedManagement.map((ward, index) => (
                    <TableRow key={index} className="hover:bg-gray-50 transition-colors duration-200">
                      <TableCell className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{ward.wardName}</TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{ward.totalBeds}</TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-green-600 font-semibold">{ward.occupiedBeds}</TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 font-semibold">{ward.availableBeds}</TableCell>
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
