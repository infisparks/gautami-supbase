"use client"
import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Users,
  Home,
  XCircle,
  CheckCircle,
  Clipboard,
  RefreshCw,
  IndianRupeeIcon,
  Phone,
  FileDown,
  Loader2,
  FileStack,
  X,
  UserCheck,
  FileText,
  CloudUpload,
  Archive
} from "lucide-react"
import Script from "next/script"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import Layout from "@/components/global/Layout"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import Image from "next/image"
import jsPDF from "jspdf"

// --- CONSTANTS ---
const GROUP_TO_COLUMN_MAP: Record<string, string> = {
  'Indoor Patient Progress Digital': 'indoor_patient_progress_digital_data',
  'Daily Drug Chart': 'daily_drug_chart_data',
  'Dr Visit Form': 'dr_visit_form_data',
  'Patient Charges Form': 'patient_charges_form_data',
  'Glucose Monitoring Sheet': 'glucose_monitoring_sheet_data',
  'Pt Admission Assessment (Nursing)': 'pt_admission_assessment_nursing_data',
  'Clinical Notes': 'clinical_notes_data',
  'Investigation Sheet': 'investigation_sheet_data',
  'Progress Notes': 'progress_notes_data',
  'Consent': 'consent_data',
  'OT': 'ot_data',
  'Nursing Notes': 'nursing_notes_data',
  'TPR / Intake / Output': 'tpr_intake_output_data',
  "TPR / Intake / Output'": 'tpr_intake_output_data',
  'Discharge / Dama': 'discharge_dama_data',
  'Casualty Note': 'casualty_note_data',
  'Indoor Patient File': 'indoor_patient_file_data',
  'Icu chart': 'icu_chart_data',
  'Transfer Summary': 'transfer_summary_data',
  'Prescription Sheet': 'prescription_sheet_data',
  'Billing Consent': 'billing_consent_data'
};

// PDF Generation Order
const IPD_GROUP_ORDER = [
  'Indoor Patient File',
  'Pt Admission Assessment (Nursing)',
  'Casualty Note',
  'Clinical Notes',
  'Dr Visit Form',
  'Indoor Patient Progress Digital',
  'Progress Notes',
  'Nursing Notes',
  'Daily Drug Chart',
  'Prescription Sheet',
  'Icu chart',
  'TPR / Intake / Output',
  "TPR / Intake / Output'",
  'Glucose Monitoring Sheet',
  'Investigation Sheet',
  'Consent',
  'GEN CONSENT',
  'Consent Form',
  'TPA Consent Form',
  'Traveling Consern',
  'Intravenous Thrombolytic therapy consent',
  'CONSENT FORM - Transfusin of Blood or Blood Components',
  'OT',
  'OT Form',
  'Billing Consent',
  'Patient Charges Form',
  'General word Charges',
  'Delux Charges',
  'Suite Room Charges',
  'Twin Sharing',
  'Nicu Charges',
  'Package Form',
  'FTND Packages',
  'Transfer Summary',
  'Discharge / Dama',
  'Discharge',
  'Dama',
  'Newborn foot print record',
  'BLOOD TRANSFUSION RECORD',
  'Feedback form',
  'sheet'
];

// --- Type Definitions ---
interface PatientDetailSupabase {
  patient_id: number
  name: string
  number: number | null
  age: number | null
  gender: string | null
  address: string | null
  age_unit: string | null
  dob: string | null
  uhid: string
}
interface BedManagementSupabase {
  id: number
  room_type: string
  bed_number: number
  bed_type: string
  status: string
}
interface PaymentDetailItemSupabase {
  amount: number
  type?: string
  paymentType?: string
  amountType?: string
  transactionType?: string
}
interface ServiceDetailItemSupabase { }
interface DischargeSummaryRecord {
  id: string
  discharge_type: string | null
}
interface IPDRegistrationSupabase {
  ipd_id: number
  discharge_date: string | null
  uhid: string
  bed_id: number | null
  payment_detail: PaymentDetailItemSupabase[] | null
  patient_detail: PatientDetailSupabase | null
  bed_management: BedManagementSupabase | null
  discharge_summaries: DischargeSummaryRecord[] | null
  tpa: boolean | null
  under_care_of_doctor: string | null
}
interface BillingRecord {
  ipdId: string
  uhid: string
  patientId: number | string
  name: string
  mobileNumber: string
  depositAmount: number
  roomType: string
  bedNumber: number | string
  status: "Active" | "Discharged" | "Discharged Partially" | "Death"
  dischargeDate: string | null
  dischargeType: string | null
  admissionDate: string | null
  admissionTime: string | null
  age: number | null
  gender: string | null
  address: string | null
  ageUnit: string | null
  dob: string | null
  relativeName: string | null
  relativePhone: number | null
  relativeAddress: string | null
  paymentDetails: PaymentDetailItemSupabase[] | null
  serviceDetails: ServiceDetailItemSupabase[] | null
  admissionSource: string | null
  admissionType: string | null
  underCareOfDoctor: string | null
  tpa: boolean | null
}

interface DrawingPage {
  id: string;
  templateImageUrl: string;
  pageNumber: number;
  pageName: string;
  groupName: string;
  lines: any[];
  images: any[];
  texts: any[];
  locationTag?: string;
}
interface DrawingGroup {
  id: string;
  groupName: string;
  pages: DrawingPage[];
}

// --- Helper Functions ---
const processToBillingRecord = (
  record: IPDRegistrationSupabase,
  formatRoomType: (roomType: string) => string,
): BillingRecord => {
  const totalDeposits = (record.payment_detail || []).reduce((sum, payment) => {
    const amtType = payment.amountType?.toLowerCase()
    if (amtType === "advance" || amtType === "deposit" || amtType === "settlement") {
      return sum + (Number(payment.amount) || 0)
    }
    return sum
  }, 0)
  const totalRefunds = (record.payment_detail || []).reduce((sum, payment) => {
    if (payment.type?.toLowerCase() === "refund") {
      return sum + (Number(payment.amount) || 0)
    }
    return sum
  }, 0)
  const netDeposit = totalDeposits - totalRefunds
  const dischargeSummary = record.discharge_summaries?.[0]
  const dischargeType = dischargeSummary?.discharge_type || null
  let status: BillingRecord["status"]
  if (record.discharge_date) {
    status = dischargeType === "Death" ? "Death" : "Discharged"
  } else if (dischargeType === "Discharge Partially") {
    status = "Discharged Partially"
  } else {
    status = "Active"
  }
  return {
    ipdId: String(record.ipd_id),
    uhid: record.uhid,
    patientId: record.patient_detail?.patient_id || "N/A",
    name: record.patient_detail?.name || "Unknown",
    mobileNumber: record.patient_detail?.number ? String(record.patient_detail.number) : "N/A",
    depositAmount: netDeposit,
    roomType: record.bed_management?.room_type ? formatRoomType(record.bed_management.room_type) : "N/A",
    bedNumber: record.bed_management?.bed_number || "N/A",
    status: status,
    dischargeDate: record.discharge_date,
    dischargeType: dischargeType,
    admissionDate: null,
    admissionTime: null,
    age: record.patient_detail?.age ?? null,
    gender: record.patient_detail?.gender ?? null,
    address: record.patient_detail?.address ?? null,
    ageUnit: record.patient_detail?.age_unit ?? null,
    dob: record.patient_detail?.dob ?? null,
    relativeName: null,
    relativePhone: null,
    relativeAddress: null,
    paymentDetails: record.payment_detail,
    serviceDetails: null,
    admissionSource: null,
    admissionType: null,
    underCareOfDoctor: record.under_care_of_doctor,
    tpa: record.tpa,
  }
}

export default function IPDManagementPage() {
  const [allIpdRecords, setAllIpdRecords] = useState<IPDRegistrationSupabase[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge" | "discharge-partially">(
    "non-discharge",
  )
  const [selectedWard, setSelectedWard] = useState("All")
  const [selectedTPA, setSelectedTPA] = useState<"All" | "Yes" | "No">("All")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()

  // Search Discharged
  const [dischargedSearchResults, setDischargedSearchResults] = useState<BillingRecord[]>([])
  const [dischargedPhoneSearch, setDischargedPhoneSearch] = useState("")
  const [dischargedUhidSearch, setDischargedUhidSearch] = useState("")
  const [dischargedNameSearch, setDischargedNameSearch] = useState("")
  const [isSearchingDischarged, setIsSearchingDischarged] = useState(false)
  const [hasSearchedDischarged, setHasSearchedDischarged] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<'granular' | 'legacy'>('granular');

  // PDF Loading State
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [downloadingSummaryId, setDownloadingSummaryId] = useState<string | null>(null);
  const [isPreparingDownload, setIsPreparingDownload] = useState<string | null>(null); // Track specific download loading

  // --- SPECIFIC DOWNLOAD STATE ---
  const [specificDownloadOpen, setSpecificDownloadOpen] = useState(false);
  const [specificDownloadRecord, setSpecificDownloadRecord] = useState<BillingRecord | null>(null);
  const [specificHealthData, setSpecificHealthData] = useState<any>(null);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  // --- COMPRESSION HELPER ---
  const compressImage = async (base64: string, quality: number = 0.3): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(base64); return; }
        // White background for transparency handling
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64);
    });
  };

  // --- GOOGLE DRIVE BACKUP STATE ---
  const [isBackingUp, setIsBackingUp] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [gapiInited, setGapiInited] = useState(false);
  const [gisInited, setGisInited] = useState(false);

  // CLIENT_ID - User needs to replace this
  const CLIENT_ID = '15585322243-enr1bn8bjqmrktpnek6nntuok6ifgo3v.apps.googleusercontent.com';
  const API_KEY = ''; // Leave empty or use a valid Browser API Key (starts with AIza...)
  const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';

  useEffect(() => {
    // Initialize Google Scripts are loaded via next/script
  }, []);

  const handleGapiLoaded = () => {
    window.gapi.load('client', async () => {
      await window.gapi.client.init({
        // apiKey: API_KEY, // Optional for some flows
        discoveryDocs: [DISCOVERY_DOC],
      });
      setGapiInited(true);
    });
  };

  const handleGisLoaded = () => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // defined later
    });
    setTokenClient(client);
    setGisInited(true);
  };

  const handleAuthClick = () => {
    return new Promise<void>((resolve, reject) => {
      if (!tokenClient) {
        reject("Google Token Client not initialized");
        return;
      }

      // Override callback to capture token
      tokenClient.callback = async (resp: any) => {
        if (resp.error !== undefined) {
          reject(resp);
        }
        resolve();
      };

      if (window.gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({ prompt: '' });
      }
    });
  };

  // --- GOOGLE DRIVE OPERATIONS ---

  const searchFile = async (fileName: string) => {
    try {
      const response = await window.gapi.client.drive.files.list({
        q: `name = '${fileName}' and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });
      return response.result.files;
    } catch (err) {
      console.error("Error searching file", err);
      throw err;
    }
  };

  const deleteFile = async (fileId: string) => {
    try {
      await window.gapi.client.drive.files.delete({
        fileId: fileId,
      });
    } catch (err) {
      console.error("Error deleting file", err);
      throw err;
    }
  };

  const uploadFile = async (blob: Blob, fileName: string) => {
    try {
      const metadata = {
        name: fileName,
        mimeType: 'application/pdf',
      };

      const accessToken = window.gapi.client.getToken().access_token;
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error("Error uploading file", err);
      throw err;
    }
  };

  const handleBackupToDrive = async (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation();

    if (!gapiInited || !gisInited) {
      toast.error("Google Services not yet initialized. Please wait or refresh.");
      return;
    }

    setIsBackingUp(record.ipdId);
    const fileName = `${record.name}_${record.ipdId}.pdf`;

    try {
      // 1. Authenticate
      await handleAuthClick();

      // 2. Generate PDF Blob (reuse logic)
      toast.info("Generating compressed PDF...");
      const pdfBlob = await generateFullRecordBlob(record, true); // true = high compression
      if (!pdfBlob) {
        throw new Error("Failed to generate PDF");
      }

      // 3. Search for existing file
      toast.info("Checking existing backups...");
      const existingFiles = await searchFile(fileName);

      // 4. Delete existing if found
      if (existingFiles && existingFiles.length > 0) {
        toast.info("Removing old backup...");
        for (const file of existingFiles) {
          await deleteFile(file.id);
        }
      }

      // 5. Upload new file
      toast.info("Uploading to Google Drive...");
      await uploadFile(pdfBlob, fileName);

      toast.success(`Backup successful: ${fileName}`);

    } catch (error: any) {
      console.error("Backup failed", error);
      toast.error(`Backup failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsBackingUp(null);
    }
  };

  // Helper to generate Blob without downloading
  const generateFullRecordBlob = async (record: BillingRecord, highCompression: boolean = false): Promise<Blob | null> => {
    try {
      let allPages: DrawingPage[] = [];

      if (selectedDatabase === 'legacy') {
        const { data: healthRecord, error } = await supabase
          .from('user_health_details')
          .select('*')
          .eq('ipd_registration_id', parseInt(record.ipdId))
          .eq('patient_uhid', record.uhid)
          .maybeSingle();

        if (error || !healthRecord) {
          toast.error("No legacy health records found.");
          return null;
        }

        IPD_GROUP_ORDER.forEach(groupName => {
          const colName = GROUP_TO_COLUMN_MAP[groupName];
          if (healthRecord[colName] && Array.isArray(healthRecord[colName])) {
            const pages = healthRecord[colName] as DrawingPage[];
            pages.forEach(p => p.groupName = groupName);
            allPages = [...allPages, ...pages];
          }
        });

        if (healthRecord.custom_groups_data && Array.isArray(healthRecord.custom_groups_data)) {
          const customGroups = healthRecord.custom_groups_data as DrawingGroup[];
          customGroups.forEach(group => {
            const pages = group.pages || [];
            pages.forEach(p => p.groupName = group.groupName);
            allPages = [...allPages, ...pages];
          });
        }
      } else {
        const { data: granularPages, error } = await supabase
          .from('ipd_pages')
          .select('*')
          .eq('ipd_id', parseInt(record.ipdId))
          .eq('uhid', record.uhid);

        if (error || !granularPages || granularPages.length === 0) {
          toast.error("No granular health records found.");
          return null;
        }

        granularPages.forEach((row: any) => {
          const canvasData = row.canvas_data || {};
          allPages.push({
            id: row.id.toString(),
            templateImageUrl: row.template_image_url || canvasData.template_image_url || "",
            pageNumber: row.page_number || 0,
            pageName: row.page_name || "Unnamed Page",
            groupName: row.group_name || "Uncategorized",
            lines: Array.isArray(row.canvas_data) ? row.canvas_data : (canvasData.lines || []),
            texts: row.texts || canvasData.texts || [],
            images: row.images || canvasData.images || [],
            locationTag: row.location_tag || canvasData.location_tag || ""
          });
        });
      }

      if (allPages.length === 0) {
        toast.info("No pages found.");
        return null;
      }

      // Sort
      allPages.sort((a, b) => {
        let idxA = IPD_GROUP_ORDER.indexOf(a.groupName);
        let idxB = IPD_GROUP_ORDER.indexOf(b.groupName);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        if (idxA !== idxB) return idxA - idxB;
        return (a.pageNumber || 0) - (b.pageNumber || 0);
      });

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      await generatePdfFromPages(doc, allPages, highCompression);
      return doc.output('blob');

    } catch (err) {
      console.error("Error in generateFullRecordBlob:", err);
      return null;
    }
  };

  const formatRoomType = useCallback((roomType: string) => {
    if (!roomType) return "N/A"
    return roomType.charAt(0).toUpperCase() + roomType.slice(1).toLowerCase()
  }, [])

  const fetchIPDRecords = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const { data, error } = await supabase
        .from("ipd_registration")
        .select(
          `
          ipd_id, discharge_date, uhid, bed_id, payment_detail, tpa, under_care_of_doctor,
          patient_detail (patient_id, name, number, age, gender, address, age_unit, dob, uhid),
          bed_management (id, room_type, bed_number, bed_type, status),
          discharge_summaries (id, discharge_type)
          `,
        )
        .is("discharge_date", null)
        .order("created_at", { ascending: false })
      if (error) throw error
      setAllIpdRecords((data as unknown as IPDRegistrationSupabase[]) || [])
    } catch (error) {
      console.error("Error fetching IPD records:", error)
      toast.error("Failed to load active IPD records.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchIPDRecords()
  }, [fetchIPDRecords])

  useEffect(() => {
    if (selectedTab !== 'discharge') {
      setDischargedSearchResults([]);
      setHasSearchedDischarged(false);
      setDischargedPhoneSearch('');
      setDischargedUhidSearch('');
      setDischargedNameSearch('');
    }
  }, [selectedTab]);

  const handleDischargedSearch = async () => {
    if (!dischargedPhoneSearch && !dischargedUhidSearch && !dischargedNameSearch) {
      toast.info("Please enter a Phone Number, UHID, or Name to search.")
      return
    }
    if (dischargedUhidSearch && (dischargedUhidSearch.length !== 5 || !/^\d+$/.test(dischargedUhidSearch))) {
      toast.error("UHID search requires the last 5 digits.")
      return
    }

    setIsSearchingDischarged(true)
    setHasSearchedDischarged(true)
    setDischargedSearchResults([])

    try {
      const selectStatement = `
        ipd_id, discharge_date, uhid, bed_id, payment_detail, tpa, under_care_of_doctor,
        patient_detail!inner(patient_id, name, number, age, gender, address, age_unit, dob, uhid),
        bed_management(id, room_type, bed_number, bed_type, status),
        discharge_summaries(id, discharge_type)
      `

      let query = supabase.from("ipd_registration").select(selectStatement).not("discharge_date", "is", null)

      if (dischargedPhoneSearch) {
        query = query.eq("patient_detail.number", dischargedPhoneSearch)
      } else if (dischargedUhidSearch) {
        query = query.like("uhid", `%${dischargedUhidSearch}`)
      } else if (dischargedNameSearch) {
        query = query.ilike("patient_detail.name", `%${dischargedNameSearch}%`)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) throw error

      const processed = (data as unknown as IPDRegistrationSupabase[]).map(record =>
        processToBillingRecord(record, formatRoomType),
      )
      setDischargedSearchResults(processed)
      if (processed.length === 0) {
        toast.info("No discharged records found for the given criteria.")
      }
    } catch (error) {
      console.error("Error searching discharged records:", error)
      toast.error("Failed to search discharged records.")
    } finally {
      setIsSearchingDischarged(false)
    }
  }

  // --- DISCHARGE SUMMARY PDF GENERATION ---
  const handleDownloadDischargeSummary = async (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation();
    setDownloadingSummaryId(record.ipdId);

    try {
      // 1. Fetch Data
      const { data: healthRecord, error } = await supabase
        .from('user_health_details')
        .select('dischare_summary_written')
        .eq('ipd_registration_id', parseInt(record.ipdId))
        .eq('patient_uhid', record.uhid)
        .maybeSingle();

      if (error || !healthRecord || !healthRecord.dischare_summary_written) {
        toast.error("No discharge summary data found.");
        setDownloadingSummaryId(null);
        return;
      }

      let summaryData = healthRecord.dischare_summary_written;
      // Handle array or object
      if (Array.isArray(summaryData)) {
        summaryData = summaryData.length > 0 ? summaryData[0] : null;
      }

      if (!summaryData) {
        toast.error("Summary data is empty.");
        setDownloadingSummaryId(null);
        return;
      }

      // 2. Load Letterhead
      const letterheadUrl = '/letterhead.png';
      const imgResponse = await fetch(letterheadUrl);
      const imgBlob = await imgResponse.blob();
      const letterheadBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(imgBlob);
      });

      // 3. Initialize PDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Colors
      const primaryColor = [23, 117, 137]; // #177589
      const accentColor = [250, 250, 250]; // #fafafa (Grey50)

      // --- UPDATED: TOP SPACING ---
      let currentY = 62; // Reduced from 70 to bring card closer to title
      const marginX = 10;
      const contentWidth = pageWidth - (marginX * 2);

      // --- Helpers ---
      const addBackground = () => {
        doc.addImage(letterheadBase64, 'PNG', 0, 0, pageWidth, pageHeight);
      };

      const checkPageBreak = (heightNeeded: number) => {
        if (currentY + heightNeeded > pageHeight - 20) {
          doc.addPage();
          addBackground();
          currentY = 45; // Reset Y on new page
        }
      };

      const drawSectionHeader = (title: string) => {
        checkPageBreak(10);
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.roundedRect(marginX, currentY, contentWidth, 6, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), marginX + 2, currentY + 4.5);
        currentY += 14;
      };

      const drawPdfSection = (label: string, value: string) => {
        if (!value || value.trim() === '') return;
        const textLines = value.split('\n');

        checkPageBreak(textLines.length * 5 + 6);

        // Label
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(label, marginX, currentY);
        currentY += 4;

        // Value (with left border)
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        textLines.forEach(line => {
          if (line.trim() === '') {
            currentY += 2;
            return;
          }
          const splitText = doc.splitTextToSize(line, contentWidth - 4);

          // Draw left border for this block
          const blockHeight = splitText.length * 4.5;
          checkPageBreak(blockHeight);

          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.line(marginX, currentY - 3, marginX, currentY + blockHeight - 3);

          doc.text(splitText, marginX + 2, currentY);
          currentY += blockHeight + 1;
        });
        currentY += 2;
      };

      const drawPatientInfoItem = (label: string, value: string, x: number, y: number, w: number) => {
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(label.toUpperCase(), x, y);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const splitVal = doc.splitTextToSize(value || '', w);
        doc.text(splitVal, x, y + 4);
      };

      // --- START GENERATION ---
      addBackground();

      // Title
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('DISCHARGE SUMMARY', pageWidth / 2, 55, { align: 'center' }); // Was 45
      doc.setLineWidth(0.5);
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.line((pageWidth / 2) - 30, 56, (pageWidth / 2) + 30, 56); // Underline

      // --- NEW ADDRESS CALCULATION LOGIC ---
      // 1. Prepare address string
      const fullAddress = `${summaryData.detailedAddress} ${summaryData.detailedAddress2}`;
      // 2. Calculate how many lines it will take
      const addressColumnWidth = (contentWidth / 2) - 5;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const addressLines = doc.splitTextToSize(fullAddress, addressColumnWidth);

      // 3. Calculate dynamic box height
      // Base height reduced to 38 (was 46) to fix excess bottom spacing
      const extraHeight = (addressLines.length > 1) ? (addressLines.length - 1) * 5 : 0;
      const boxHeight = 38 + extraHeight;

      // Patient Info Card
      doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.1);

      // Use dynamic boxHeight here
      doc.roundedRect(marginX, currentY, contentWidth, boxHeight, 1, 1, 'FD');

      const col1X = marginX + 4;
      const col2X = marginX + (contentWidth / 2) + 4;
      let cardY = currentY + 5;

      // Row 1
      drawPatientInfoItem('PATIENT NAME', summaryData.patientName, col1X, cardY, (contentWidth / 2) - 5);
      drawPatientInfoItem('AGE / SEX', summaryData.ageSex, col2X, cardY, (contentWidth / 2) - 5);

      // Divider
      cardY += 8;
      doc.setDrawColor(200, 200, 200);
      doc.line(marginX + 2, cardY - 2, marginX + contentWidth - 2, cardY - 2);

      // Row 2
      drawPatientInfoItem('UHID / IPD NO.', summaryData.uhidIpdNumber, col1X, cardY, (contentWidth / 2) - 5);
      drawPatientInfoItem('CONSULTANT', summaryData.consultantInCharge, col2X, cardY, (contentWidth / 2) - 5);

      // Divider
      cardY += 8;
      doc.line(marginX + 2, cardY - 2, marginX + contentWidth - 2, cardY - 2);

      // Row 3
      drawPatientInfoItem('ADMISSION DATE', summaryData.admissionDateAndTime, col1X, cardY, (contentWidth / 2) - 5);
      drawPatientInfoItem('DISCHARGE DATE', summaryData.dischargeDateAndTime, col2X, cardY, (contentWidth / 2) - 5);

      // Row 4 (Address & Type)
      cardY += 8;
      drawPatientInfoItem('DISCHARGE TYPE', summaryData.typeOfDischarge, col1X, cardY, (contentWidth / 2) - 5);

      // Draw address manually
      drawPatientInfoItem('ADDRESS', fullAddress, col2X, cardY, addressColumnWidth);

      // Update currentY based on the dynamic box height plus some padding
      currentY += boxHeight + 8; // Push Y below card

      // --- SECTIONS ---

      // Clinical Diagnosis
      drawSectionHeader('Clinical Diagnosis');
      drawPdfSection('Provisional Diagnosis', summaryData.provisionalDiagnosis);
      drawPdfSection('Final Diagnosis', `${summaryData.finalDiagnosis || ''}\n${summaryData.finalDiagnosis2 || ''}`.trim());
      drawPdfSection('Procedure / Surgeries', `${summaryData.procedure || ''}\n${summaryData.procedure2 || ''}\n${summaryData.surgeryProcedureDetails || ''}`.trim());

      // Clinical Summary
      drawSectionHeader('Clinical Summary');
      drawPdfSection('History of Present Illness', summaryData.historyOfPresentIllness);
      drawPdfSection('General Physical Examination', summaryData.generalPhysicalExamination);
      drawPdfSection('Systemic Examination', summaryData.systemicExamination);
      drawPdfSection('Investigations', summaryData.investigations);
      drawPdfSection('Treatment Given', summaryData.treatmentGiven);
      drawPdfSection('Hospital Course', summaryData.hospitalCourse);

      // Discharge Advice
      drawSectionHeader('Discharge Advice');
      drawPdfSection('Condition at Discharge', summaryData.conditionAtDischarge);

      // Medications Box
      if (summaryData.dischargeMedications) {
        checkPageBreak(30);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Discharge Medications', marginX, currentY);
        currentY += 2;

        const splitMeds = doc.splitTextToSize(summaryData.dischargeMedications, contentWidth - 4);
        const boxHeight = (splitMeds.length * 4.5) + 4;

        checkPageBreak(boxHeight);

        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(marginX, currentY, contentWidth, boxHeight, 1, 1, 'FD');

        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text(splitMeds, marginX + 2, currentY + 4);
        currentY += boxHeight + 4;
      }

      drawPdfSection('Follow Up', summaryData.followUp);
      drawPdfSection('Instructions', summaryData.dischargeInstruction);

      // Emergency Warning Box (Red)
      if (summaryData.reportImmediatelyIf) {
        checkPageBreak(25);
        currentY += 2;
        doc.setFillColor(254, 242, 242); // Red 50
        doc.setDrawColor(153, 27, 27); // Red 800
        doc.setLineWidth(0.3);

        const splitWarn = doc.splitTextToSize(summaryData.reportImmediatelyIf, contentWidth - 15);
        const warnHeight = (splitWarn.length * 4) + 10;

        doc.roundedRect(marginX, currentY, contentWidth, warnHeight, 1, 1, 'FD');

        doc.setTextColor(153, 27, 27);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("!", marginX + 3, currentY + 6);

        doc.setFontSize(9);
        doc.text("EMERGENCY: REPORT IMMEDIATELY IF:", marginX + 10, currentY + 5);

        doc.setFont('helvetica', 'normal');
        doc.text(splitWarn, marginX + 10, currentY + 9);

        currentY += warnHeight + 5;
      }

      // --- FOOTER SECTION ---
      // Ensure space for footer
      checkPageBreak(40);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.line(marginX, currentY, pageWidth - marginX, currentY);
      currentY += 5;

      // Left Column (Emergency + Date)
      const footerY = currentY;
      doc.setFontSize(9);
      if (summaryData.emergencyContact) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Emergency Contact: ${summaryData.emergencyContact}`, marginX, footerY + 5);
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Date: ${summaryData.date}   Time: ${summaryData.time}`, marginX, footerY + 10);

      // Right Column (Signatures)
      const sigX = pageWidth / 2;
      let sigY = footerY;

      const drawSigRow = (label: string, value: string) => {
        if (!value) return;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`${label}: `, pageWidth - marginX - 40, sigY + 5, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(value, pageWidth - marginX, sigY + 5, { align: 'right' });
        sigY += 4;
      };

      drawSigRow('Prepared By', summaryData.summaryPreparedBy);
      drawSigRow('Verified By', summaryData.summaryVerifiedBy);
      drawSigRow('Explained By', summaryData.summaryExplainedBy);
      drawSigRow('Explained To', summaryData.summaryExplainedTo);

      sigY += 10;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text("Authorized Signatory", pageWidth - marginX, sigY, { align: 'right' });


      // 4. Open PDF
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
      toast.success("Discharge Summary Generated");

    } catch (error) {
      console.error("PDF Gen Error", error);
      toast.error("Failed to generate discharge summary.");
    } finally {
      setDownloadingSummaryId(null);
    }
  };

  // --- SPECIFIC DOWNLOAD LOGIC ---

  const handlePrepareSpecificDownload = async (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation();
    setIsPreparingDownload(record.ipdId);
    setSpecificDownloadRecord(record);

    try {
      const available: Set<string> = new Set();

      if (selectedDatabase === 'legacy') {
        const { data: healthRecord, error } = await supabase
          .from('user_health_details')
          .select('*')
          .eq('ipd_registration_id', parseInt(record.ipdId))
          .eq('patient_uhid', record.uhid)
          .maybeSingle();

        if (error || !healthRecord) {
          toast.error("No legacy health records found.");
          setIsPreparingDownload(null);
          return;
        }

        setSpecificHealthData(healthRecord);

        // Identify from Legacy Table
        IPD_GROUP_ORDER.forEach(groupName => {
          const colName = GROUP_TO_COLUMN_MAP[groupName];
          if (healthRecord[colName] && Array.isArray(healthRecord[colName]) && healthRecord[colName].length > 0) {
            available.add(groupName);
          }
        });

        if (healthRecord.custom_groups_data && Array.isArray(healthRecord.custom_groups_data)) {
          const customGroups = healthRecord.custom_groups_data as DrawingGroup[];
          customGroups.forEach(g => {
            if (g.pages && g.pages.length > 0) {
              available.add(g.groupName);
            }
          });
        }
      } else {
        const { data: granularPages, error } = await supabase
          .from('ipd_pages')
          .select('group_name')
          .eq('ipd_id', parseInt(record.ipdId))
          .eq('uhid', record.uhid);

        if (error || !granularPages || granularPages.length === 0) {
          toast.error("No granular health records found.");
          setIsPreparingDownload(null);
          return;
        }

        granularPages.forEach((row: any) => {
          if (row.group_name) available.add(row.group_name);
        });
      }

      if (available.size === 0) {
        toast.info("No pages found to download.");
        setIsPreparingDownload(null);
        return;
      }

      setAvailableGroups(Array.from(available).sort((a, b) => {
        let idxA = IPD_GROUP_ORDER.indexOf(a);
        let idxB = IPD_GROUP_ORDER.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      }));
      setSelectedGroups(new Set());
      setSpecificDownloadOpen(true);

    } catch (error) {
      console.error(error);
      toast.error("Failed to load record details.");
    } finally {
      setIsPreparingDownload(null);
    }
  };

  const toggleGroupSelection = (groupName: string) => {
    const newSet = new Set(selectedGroups);
    if (newSet.has(groupName)) {
      newSet.delete(groupName);
    } else {
      newSet.add(groupName);
    }
    setSelectedGroups(newSet);
  };

  const handleGenerateSpecificPdf = async () => {
    if (selectedGroups.size === 0) {
      toast.error("Please select at least one group.");
      return;
    }

    setSpecificDownloadOpen(false);
    setDownloadingPdfId(specificDownloadRecord?.ipdId || null);

    try {
      if (!specificDownloadRecord) throw new Error("Patient record missing");
      let allPages: DrawingPage[] = [];

      if (selectedDatabase === 'legacy') {
        const healthRecord = specificHealthData;
        if (!healthRecord) throw new Error("Legacy data missing");

        IPD_GROUP_ORDER.forEach(groupName => {
          if (selectedGroups.has(groupName)) {
            const colName = GROUP_TO_COLUMN_MAP[groupName];
            if (healthRecord[colName] && Array.isArray(healthRecord[colName])) {
              const pages = healthRecord[colName] as DrawingPage[];
              pages.forEach(p => p.groupName = groupName);
              allPages = [...allPages, ...pages];
            }
          }
        });

        if (healthRecord.custom_groups_data && Array.isArray(healthRecord.custom_groups_data)) {
          const customGroups = healthRecord.custom_groups_data as DrawingGroup[];
          customGroups.forEach(group => {
            if (selectedGroups.has(group.groupName)) {
              const pages = group.pages || [];
              pages.forEach(p => p.groupName = group.groupName);
              allPages = [...allPages, ...pages];
            }
          });
        }
      } else {
        const { data: granularPages, error } = await supabase
          .from('ipd_pages')
          .select('*')
          .eq('ipd_id', parseInt(specificDownloadRecord.ipdId))
          .eq('uhid', specificDownloadRecord.uhid)
          .in('group_name', Array.from(selectedGroups));

        if (error || !granularPages) throw new Error("Granular data fetch failed");

        granularPages.forEach((row: any) => {
          const canvasData = row.canvas_data || {};
          allPages.push({
            id: row.id.toString(),
            templateImageUrl: row.template_image_url || canvasData.template_image_url || "",
            pageNumber: row.page_number || 0,
            pageName: row.page_name || "Unnamed Page",
            groupName: row.group_name || "Uncategorized",
            lines: Array.isArray(row.canvas_data) ? row.canvas_data : (canvasData.lines || []),
            texts: row.texts || canvasData.texts || [],
            images: row.images || canvasData.images || [],
            locationTag: row.location_tag || canvasData.location_tag || ""
          });
        });
      }

      if (allPages.length === 0) {
        toast.info("No pages chosen.");
        return;
      }

      // 4. Global Sort
      allPages.sort((a, b) => {
        let idxA = IPD_GROUP_ORDER.indexOf(a.groupName);
        let idxB = IPD_GROUP_ORDER.indexOf(b.groupName);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;

        if (idxA !== idxB) return idxA - idxB;
        return (a.pageNumber || 0) - (b.pageNumber || 0);
      });

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      await generatePdfFromPages(doc, allPages, false);

      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
      toast.success("PDF Generated Successfully");

    } catch (error) {
      console.error("Specific PDF Generation Error", error);
      toast.error("Failed to generate specific PDF");
    } finally {
      setDownloadingPdfId(null);
      setSpecificDownloadRecord(null);
      setSpecificHealthData(null);
    }
  };

  // --- SHARED PDF LOGIC ---
  const FLUTTER_CANVAS_WIDTH = 1000;
  const FLUTTER_CANVAS_HEIGHT = 1414;
  const PDF_WIDTH = 210;
  const PDF_HEIGHT = 297;

  const generatePdfFromPages = async (doc: jsPDF, allPages: DrawingPage[], highCompression: boolean = false) => {
    const scaleX = PDF_WIDTH / FLUTTER_CANVAS_WIDTH;
    const scaleY = PDF_HEIGHT / FLUTTER_CANVAS_HEIGHT;
    let isFirstPage = true;

    for (const page of allPages) {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      // A. Template
      if (page.templateImageUrl) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gautamiapi.infiplus.in';
          const imageUrl = page.templateImageUrl.startsWith('http')
            ? page.templateImageUrl
            : `${baseUrl}${page.templateImageUrl.startsWith('/') ? '' : '/'}${page.templateImageUrl}`;

          const imgResponse = await fetch(imageUrl);
          const imgBlob = await imgResponse.blob();
          let imgBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(imgBlob);
          });

          if (highCompression) {
            imgBase64 = await compressImage(imgBase64, 0.3);
          }

          const imgProps = doc.getImageProperties(imgBase64);
          const widthRatio = PDF_WIDTH / imgProps.width;
          const heightRatio = PDF_HEIGHT / imgProps.height;
          const scaleFactor = Math.min(widthRatio, heightRatio);
          const finalWidth = imgProps.width * scaleFactor;
          const finalHeight = imgProps.height * scaleFactor;
          const xOffset = (PDF_WIDTH - finalWidth) / 2;
          const yOffset = (PDF_HEIGHT - finalHeight) / 2;

          doc.addImage(imgBase64, 'JPEG', xOffset, yOffset, finalWidth, finalHeight);
        } catch (err) {
          console.error("Template load failed", err);
        }
      }

      // B. Images
      if (page.images && Array.isArray(page.images)) {
        for (const img of page.images) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gautamiapi.infiplus.in';
            const imgUrl = img.imageUrl.startsWith('http')
              ? img.imageUrl
              : `${baseUrl}${img.imageUrl.startsWith('/') ? '' : '/'}${img.imageUrl}`;

            const response = await fetch(imgUrl);
            const blob = await response.blob();
            let base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            if (highCompression) {
              base64 = await compressImage(base64, 0.3);
            }

            const pdfX = (img.position.dx || 0) * scaleX;
            const pdfY = (img.position.dy || 0) * scaleY;
            const pdfW = (img.width || 0) * scaleX;
            const pdfH = (img.height || 0) * scaleY;

            doc.addImage(base64, 'JPEG', pdfX, pdfY, pdfW, pdfH);
          } catch (e) {
            console.error("Failed to load user inserted image", e);
          }
        }
      }

      // C. Texts
      if (page.texts && Array.isArray(page.texts)) {
        page.texts.forEach((textItem: any) => {
          const textContent = textItem.text;
          if (!textContent) return;
          const x = (textItem.position?.dx || 0) * scaleX;
          const y = (textItem.position?.dy || 0) * scaleY;
          const colorVal = textItem.colorValue ?? 4278190080;
          const r = (colorVal >> 16) & 255;
          const g = (colorVal >> 8) & 255;
          const b = colorVal & 255;
          doc.setTextColor(r, g, b);
          const fontSizePoints = (textItem.fontSize || 16.0) * scaleX * 2.835;
          doc.setFontSize(fontSizePoints);
          doc.text(textContent, x, y, { baseline: 'top' });
        });
      }

      // D. Lines
      if (page.lines && Array.isArray(page.lines)) {
        page.lines.forEach((line: any) => {
          const colorVal = line.colorValue ?? 4278190080;
          const r = (colorVal >> 16) & 255;
          const g = (colorVal >> 8) & 255;
          const b = colorVal & 255;
          doc.setDrawColor(r, g, b);
          const strokeWidth = (line.strokeWidth || 2.0) * scaleX * 0.8;
          doc.setLineWidth(strokeWidth);
          const rawPoints = line.points;
          if (Array.isArray(rawPoints) && rawPoints.length >= 2) {
            if (typeof rawPoints[0] === 'number') {
              let lastX = rawPoints[0] / 100.0;
              let lastY = rawPoints[1] / 100.0;
              let pathData: { x: number, y: number }[] = [];
              pathData.push({ x: lastX * scaleX, y: lastY * scaleY });
              for (let i = 2; i < rawPoints.length; i += 2) {
                if (i + 1 < rawPoints.length) {
                  lastX += rawPoints[i] / 100.0;
                  lastY += rawPoints[i + 1] / 100.0;
                  pathData.push({ x: lastX * scaleX, y: lastY * scaleY });
                }
              }
              for (let k = 0; k < pathData.length - 1; k++) {
                doc.line(pathData[k].x, pathData[k].y, pathData[k + 1].x, pathData[k + 1].y);
              }
            }
            else if (typeof rawPoints[0] === 'object') {
              for (let k = 0; k < rawPoints.length - 1; k++) {
                const p1 = rawPoints[k];
                const p2 = rawPoints[k + 1];
                doc.line(
                  (p1.dx || 0) * scaleX,
                  (p1.dy || 0) * scaleY,
                  (p2.dx || 0) * scaleX,
                  (p2.dy || 0) * scaleY
                );
              }
            }
          }
        });
      }
    }

    // const pdfBlob = doc.output('blob');
    // const blobUrl = URL.createObjectURL(pdfBlob);
    // window.open(blobUrl, '_blank');
    // toast.success("PDF Generated Successfully");
  }

  const handleDownloadFullRecord = async (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation();
    setDownloadingPdfId(record.ipdId);

    try {
      const blob = await generateFullRecordBlob(record);
      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        toast.success("PDF Generated Successfully");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error generating PDF");
    } finally {
      setDownloadingPdfId(null);
    }
  };

  /* 
  const handleDownloadFullRecord = async (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation();
    setDownloadingPdfId(record.ipdId);

    try {
      const { data: healthRecord, error } = await supabase
        .from('user_health_details')
        .select('*')
        .eq('ipd_registration_id', parseInt(record.ipdId))
        .eq('patient_uhid', record.uhid)
        .maybeSingle();

      if (error || !healthRecord) {
        toast.error("No health records found for this patient.");
        setDownloadingPdfId(null);
        return;
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      let allPages: DrawingPage[] = [];

      // Gather all pages
      IPD_GROUP_ORDER.forEach(groupName => {
        const colName = GROUP_TO_COLUMN_MAP[groupName];
        if (healthRecord[colName] && Array.isArray(healthRecord[colName])) {
           const pages = healthRecord[colName] as DrawingPage[];
           pages.forEach(p => p.groupName = groupName);
           pages.sort((a, b) => a.pageNumber - b.pageNumber);
           allPages = [...allPages, ...pages];
        }
      });

      if (healthRecord.custom_groups_data && Array.isArray(healthRecord.custom_groups_data)) {
        const customGroups = healthRecord.custom_groups_data as DrawingGroup[];
        customGroups.forEach(group => {
           const pages = group.pages || [];
           pages.forEach(p => p.groupName = group.groupName);
           pages.sort((a, b) => a.pageNumber - b.pageNumber);
           allPages = [...allPages, ...pages];
        });
      }

      if (allPages.length === 0) {
        toast.info("No pages to generate.");
        setDownloadingPdfId(null);
        return;
      }

      await generatePdfFromPages(doc, allPages, false);
      
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
      toast.success("PDF Generated Successfully");

    } catch (err) {
      console.error(err);
      toast.error("Error generating PDF");
    } finally {
      setDownloadingPdfId(null);
    }
  };
  */

  const processedRecords = useMemo(
    () => allIpdRecords.map(record => processToBillingRecord(record, formatRoomType)),
    [allIpdRecords, formatRoomType],
  )

  const nonDischargedRecords = useMemo(
    () => processedRecords.filter(record => record.status === "Active"),
    [processedRecords],
  )

  const partiallyDischargedRecords = useMemo(
    () => processedRecords.filter(record => record.status === "Discharged Partially"),
    [processedRecords],
  )

  const filteredActiveRecords = useMemo(() => {
    let currentRecords: BillingRecord[] =
      selectedTab === "non-discharge" ? nonDischargedRecords : partiallyDischargedRecords

    if (selectedWard !== "All") {
      currentRecords = currentRecords.filter(rec => rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }
    if (selectedTPA !== "All") {
      currentRecords = currentRecords.filter(rec => (selectedTPA === "Yes" ? rec.tpa === true : rec.tpa === false))
    }
    const term = searchTerm.trim().toLowerCase()
    if (term) {
      currentRecords = currentRecords.filter(
        rec =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber?.toLowerCase().includes(term) ||
          rec.uhid.toLowerCase().includes(term),
      )
    }
    return currentRecords
  }, [nonDischargedRecords, partiallyDischargedRecords, searchTerm, selectedTab, selectedWard, selectedTPA])

  const filteredDischargedRecords = useMemo(() => {
    if (!hasSearchedDischarged) return [];
    let records = dischargedSearchResults;
    if (selectedWard !== "All") {
      records = records.filter(rec => rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }
    if (selectedTPA !== "All") {
      records = records.filter(rec => (selectedTPA === "Yes" ? rec.tpa === true : rec.tpa === false))
    }
    return records;
  }, [dischargedSearchResults, selectedWard, selectedTPA, hasSearchedDischarged])

  const uniqueWards = useMemo(() => {
    const wards = new Set<string>()
    allIpdRecords.forEach(record => {
      if (record.bed_management?.room_type) {
        wards.add(formatRoomType(record.bed_management.room_type))
      }
    })
    return Array.from(wards)
  }, [allIpdRecords, formatRoomType])

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }, [])

  const handleRowClick = useCallback((record: BillingRecord) => {
    // router.push(`/ipd/billing/${record.ipdId}`)
  }, [router])

  // --- RENDER TABLE FUNCTION ---
  const renderPatientsTable = (
    records: BillingRecord[],
    handleRowClick: (record: BillingRecord) => void,
    isLoading: boolean,
    formatCurrency: (amount: number) => string,
  ) => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-sm text-gray-600">Loading...</p>
        </div>
      )
    }

    if (records.length === 0) {
      return (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-100">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No patients found</h3>
          <p className="text-gray-500 text-sm">No records match your current criteria</p>
        </div>
      )
    }

    return (
      <TooltipProvider>
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs min-w-[200px]">Patient Details</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Contact</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Deposit</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Room</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Doctor</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 text-xs min-w-[140px]">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((record, index) => (
                  <tr
                    key={record.ipdId}
                    className="hover:bg-gray-25 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2 text-gray-600 text-xs font-mono">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm">{record.name}</span>
                          {record.tpa && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs px-1.5 py-0.5">TPA</Badge>
                          )}
                          {record.gender && (
                            <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${record.gender.toLowerCase() === 'male' ? 'bg-blue-50 text-blue-700 border-blue-200' : record.gender.toLowerCase() === 'female' ? 'bg-pink-50 text-pink-700 border-pink-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{record.gender.charAt(0).toUpperCase()}</Badge>
                          )}
                          {record.age && (<span className="text-xs text-gray-500">{record.age}{record.ageUnit ? record.ageUnit.charAt(0) : 'Y'}</span>)}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><span className="font-mono">ID:</span> {record.ipdId}</span>
                          <span className="flex items-center gap-1"><span className="font-mono">UHID:</span> {record.uhid}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-gray-400" />
                        <span className="font-mono text-gray-700">{record.mobileNumber}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-medium text-sm ${record.depositAmount >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(record.depositAmount)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{record.roomType}</Badge>
                        <div className="text-xs text-gray-500">Bed {record.bedNumber}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-1">
                        <UserCheck className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-gray-700 leading-tight">{record.underCareOfDoctor || 'Not Assigned'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {record.status === "Discharged" ? (
                        <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Discharged</Badge>
                      ) : record.status === "Discharged Partially" ? (
                        <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-xs">Partial</Badge>
                      ) : record.status === "Death" ? (
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">Death</Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Active</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">

                        {/* --- Discharge Summary Download --- */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={e => handleDownloadDischargeSummary(e, record)}
                              disabled={downloadingSummaryId === record.ipdId}
                              className="h-8 w-8 text-xs hover:bg-teal-100 text-teal-600 border-teal-200"
                            >
                              {downloadingSummaryId === record.ipdId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Discharge Summary</TooltipContent>
                        </Tooltip>

                        {/* --- Specific Download --- */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={e => handlePrepareSpecificDownload(e, record)}
                              disabled={isPreparingDownload === record.ipdId}
                              className="h-8 w-8 text-xs hover:bg-indigo-100 text-indigo-600 border-indigo-200"
                            >
                              {isPreparingDownload === record.ipdId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileStack className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download Specific Pages</TooltipContent>
                        </Tooltip>

                        {/* --- Preview & Select --- */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/ipd/tpa/${record.ipdId}/preview?source=${selectedDatabase}`);
                              }}
                              className="h-8 w-8 text-xs hover:bg-purple-100 text-purple-600 border-purple-200"
                            >
                              <FileStack className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Preview & Select Pages</TooltipContent>
                        </Tooltip>

                        {/* --- Full Download --- */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={e => handleDownloadFullRecord(e, record)}
                              disabled={downloadingPdfId === record.ipdId}
                              className="h-8 w-8 text-xs hover:bg-orange-100 text-orange-600 border-orange-200"
                            >
                              {downloadingPdfId === record.ipdId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download Full Record</TooltipContent>
                        </Tooltip>

                        {/* --- Google Drive Backup --- */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={e => handleBackupToDrive(e, record)}
                              disabled={isBackingUp === record.ipdId}
                              className="h-8 w-8 text-xs hover:bg-blue-100 text-blue-600 border-blue-200"
                            >
                              {isBackingUp === record.ipdId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CloudUpload className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Backup to Google Drive</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50/50">
        <div className="container mx-auto px-3 py-6 max-w-full">
          {/* Header Banner */}
          <div className="mb-6 flex justify-center">
            <Image
              src="/banner.png"
              alt="Hospital Banner"
              width={1200}
              height={150}
              className="rounded-lg shadow-md h-24 sm:h-32 md:h-40 object-cover"
            />
          </div>

          <Card className="shadow-sm border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)}>
                <div className="space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <TabsList className="bg-gray-100 flex w-full lg:w-auto overflow-x-auto">
                      <TabsTrigger value="non-discharge" className="flex-1 lg:flex-none text-xs sm:text-sm whitespace-nowrap">
                        <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Active ({nonDischargedRecords.length})
                      </TabsTrigger>
                      <TabsTrigger value="discharge-partially" className="flex-1 lg:flex-none text-xs sm:text-sm whitespace-nowrap">
                        <Clipboard className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Partial ({partiallyDischargedRecords.length})
                      </TabsTrigger>
                      <TabsTrigger value="discharge" className="flex-1 lg:flex-none text-xs sm:text-sm whitespace-nowrap">
                        <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Discharged
                      </TabsTrigger>
                    </TabsList>

                    {selectedTab === 'discharge' ? (
                      <div className="flex gap-2 items-center w-full lg:w-auto flex-wrap">
                        <Input
                          type="text"
                          value={dischargedPhoneSearch}
                          onChange={(e) => {
                            setDischargedPhoneSearch(e.target.value);
                            if (e.target.value) {
                              setDischargedUhidSearch('');
                              setDischargedNameSearch('');
                            }
                          }}
                          placeholder="Phone"
                          className="flex-1 min-w-[100px] h-9 text-sm"
                        />
                        <Input
                          type="text"
                          value={dischargedUhidSearch}
                          onChange={(e) => {
                            setDischargedUhidSearch(e.target.value);
                            if (e.target.value) {
                              setDischargedPhoneSearch('');
                              setDischargedNameSearch('');
                            }
                          }}
                          placeholder="UHID"
                          className="flex-1 min-w-[80px] h-9 text-sm"
                        />
                        <Input
                          type="text"
                          value={dischargedNameSearch}
                          onChange={(e) => {
                            setDischargedNameSearch(e.target.value);
                            if (e.target.value) {
                              setDischargedPhoneSearch('');
                              setDischargedUhidSearch('');
                            }
                          }}
                          placeholder="Name"
                          className="flex-1 min-w-[100px] h-9 text-sm"
                        />
                        <Button
                          onClick={handleDischargedSearch}
                          disabled={isSearchingDischarged}
                          size="sm"
                          className="px-3 h-9"
                        >
                          <Search className={`h-3 w-3 sm:h-4 sm:w-4 sm:mr-1 ${isSearchingDischarged ? "animate-spin" : ""}`} />
                          <span className="hidden sm:inline">Search</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center w-full lg:w-auto">
                        <div className="relative flex-1 lg:min-w-[300px]">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                          <Input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search by name, ID, mobile, UHID..."
                            className="pl-8 sm:pl-10 h-9 text-sm"
                          />
                        </div>
                        <Button
                          onClick={fetchIPDRecords}
                          disabled={isRefreshing}
                          variant="outline"
                          size="sm"
                          className="px-3 h-9"
                        >
                          <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          onClick={() => router.push('/ipd/backup')}
                          variant="outline"
                          size="sm"
                          className="px-3 h-9 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Archive className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Backup</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Home className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-800">Room Type</h3>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant={selectedWard === "All" ? "default" : "outline"}
                          onClick={() => setSelectedWard("All")}
                          className="cursor-pointer text-xs px-2 py-1"
                        >
                          All
                        </Badge>
                        {uniqueWards.map(ward => (
                          <Badge
                            key={ward}
                            variant={selectedWard === ward ? "default" : "outline"}
                            onClick={() => setSelectedWard(ward)}
                            className="cursor-pointer text-xs px-2 py-1"
                          >
                            {ward}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <IndianRupeeIcon className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-800">TPA Status</h3>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant={selectedTPA === "All" ? "default" : "outline"}
                          onClick={() => setSelectedTPA("All")}
                          className="cursor-pointer text-xs px-2 py-1"
                        >
                          All
                        </Badge>
                        <Badge
                          variant={selectedTPA === "Yes" ? "default" : "outline"}
                          onClick={() => setSelectedTPA("Yes")}
                          className="cursor-pointer text-xs px-2 py-1 bg-purple-600 text-white hover:bg-purple-700 border-purple-600"
                        >
                          TPA
                        </Badge>
                        <Badge
                          variant={selectedTPA === "No" ? "default" : "outline"}
                          onClick={() => setSelectedTPA("No")}
                          className="cursor-pointer text-xs px-2 py-1 bg-gray-600 text-white hover:bg-gray-700 border-gray-600"
                        >
                          Non-TPA
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-800">Database Source</h3>
                      </div>
                      <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                        <button
                          onClick={() => setSelectedDatabase('granular')}
                          className={`px-3 py-1 text-xs rounded-md transition-all font-semibold ${selectedDatabase === 'granular' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          New DB
                        </button>
                        <button
                          onClick={() => setSelectedDatabase('legacy')}
                          className={`px-3 py-1 text-xs rounded-md transition-all font-semibold ${selectedDatabase === 'legacy' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Old DB
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <TabsContent value="non-discharge" className="mt-0">
                    {renderPatientsTable(filteredActiveRecords, handleRowClick, isLoading, formatCurrency)}
                  </TabsContent>
                  <TabsContent value="discharge-partially" className="mt-0">
                    {renderPatientsTable(filteredActiveRecords, handleRowClick, isLoading, formatCurrency)}
                  </TabsContent>
                  <TabsContent value="discharge" className="mt-0">
                    {!hasSearchedDischarged ? (
                      <div className="text-center py-16 bg-white rounded-lg border border-gray-100">
                        <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-700 mb-2">Search Discharged Patients</h3>
                        <p className="text-gray-500 text-sm">Enter phone number, UHID, or name to search</p>
                      </div>
                    ) :
                      renderPatientsTable(filteredDischargedRecords, handleRowClick, isSearchingDischarged, formatCurrency)
                    }
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* --- SPECIFIC DOWNLOAD MODAL --- */}
      {specificDownloadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Select Pages to Download</h2>
              <Button variant="ghost" size="icon" onClick={() => setSpecificDownloadOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {availableGroups.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No pages found with content.
                </div>
              ) : (
                <div className="space-y-2">
                  {availableGroups.map(group => (
                    <label key={group} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-100 transition-all">
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(group)}
                        onChange={() => toggleGroupSelection(group)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{group}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSpecificDownloadOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerateSpecificPdf}
                disabled={selectedGroups.size === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Download Selected
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* --- GOOGLE SCRIPTS --- */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={handleGisLoaded} />
      <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" onLoad={handleGapiLoaded} />
    </Layout>
  )
}

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}