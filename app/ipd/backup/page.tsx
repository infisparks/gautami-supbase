"use client"

import React, { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import jsPDF from "jspdf"
import JSZip from "jszip"
import { Loader2, Download, ArrowLeft, Archive, AlertCircle, CheckCircle2, FolderOpen } from "lucide-react"
import { useRouter } from "next/navigation"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Lock } from "lucide-react"
// --- TYPES & CONSTANTS (Copied from ipd/tpa/page.tsx) ---

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
    'Discharge / Dama': 'discharge_dama_data',
    'Casualty Note': 'casualty_note_data',
    'Indoor Patient File': 'indoor_patient_file_data',
    'Icu chart': 'icu_chart_data',
    'Transfer Summary': 'transfer_summary_data',
    'Prescription Sheet': 'prescription_sheet_data',
    'Billing Consent': 'billing_consent_data'
};

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
    'Glucose Monitoring Sheet',
    'Investigation Sheet',
    'Consent',
    'OT',
    'Billing Consent',
    'Patient Charges Form',
    'Transfer Summary',
    'Discharge / Dama'
];

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

// --- HELPER COMPONENTS/FUNCTIONS ---

const compressImage = async (base64: string, quality: number = 0.5): Promise<string> => {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.src = base64;
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            const MAX_DIM = 1200; // Limit max dimension to reduce memory usage

            if (width > height) {
                if (width > MAX_DIM) {
                    height *= MAX_DIM / width;
                    width = MAX_DIM;
                }
            } else {
                if (height > MAX_DIM) {
                    width *= MAX_DIM / height;
                    height = MAX_DIM;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(base64); return; }
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64);
    });
};

// --- MAIN PAGE COMPONENT ---

export default function IPDBackupPage() {
    const router = useRouter()
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [statusMessage, setStatusMessage] = useState("")
    const [processedCount, setProcessedCount] = useState(0)
    const [totalCount, setTotalCount] = useState(0)
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
    const [password, setPassword] = useState("")
    const [fileHandle, setFileHandle] = useState<any>(null)
    const [dbSource, setDbSource] = useState<'granular' | 'legacy'>('granular');

    const handleSelectSaveLocation = async () => {
        if (!('showSaveFilePicker' in window)) {
            toast.error("Your browser doesn't support picking a specific save location. The file will be downloaded to your default Downloads folder.");
            toast.error("Your browser doesn't support picking a specific save location. The file will be downloaded to your default Downloads folder.");
            return;
        }

        if (!startDate || !endDate) {
            toast.error("Please select start and end dates first.");
            return;
        }

        try {
            const defaultName = startDate && endDate
                ? `IPD_Backup_${startDate}_to_${endDate}_Full.zip`
                : "IPD_Backup.zip"

            const handle = await (window as any).showSaveFilePicker({
                suggestedName: defaultName,
                startIn: 'documents',
                types: [{
                    description: 'ZIP Archive',
                    accept: { 'application/zip': ['.zip'] },
                }],
            })
            setFileHandle(handle)
            toast.success(`Selected output file: ${handle.name}`)
        } catch (err: any) {
            if (err.name !== "AbortError") {
                console.error(err)
                toast.error("Failed to select save location")
            }
        }
    }

    // --- PDF GENERATION LOGIC ---

    const generatePdfFromPages = async (doc: jsPDF, allPages: DrawingPage[], highCompression: boolean = false) => {
        const FLUTTER_CANVAS_WIDTH = 1000;
        const FLUTTER_CANVAS_HEIGHT = 1414;
        const PDF_WIDTH = 210;
        const PDF_HEIGHT = 297;
        const scaleX = PDF_WIDTH / FLUTTER_CANVAS_WIDTH;
        const scaleY = PDF_HEIGHT / FLUTTER_CANVAS_HEIGHT;
        let isFirstPage = true;

        // IMPORTANT: If doc already has content (e.g. reused), we might need to addPage first if we are not at start?
        // But usually this function is called on a fresh doc or as the first step. 
        // If we append discharge summary LATER, this function runs FIRST.
        // However, doc starts with 1 page by default.
        // We should check if we are at page 1 and it's empty? 
        // Simple way: doc always starts with 1 blank page. We use it for the first drawing page.

        // Actually, if we are appending to a doc that might be manipulated, we should be careful.
        // But here we create a new doc for each patient.

        // Check if doc is empty? jsPDF doesn't expose "isEmpty". 
        // We will assume this is the first content.

        for (const page of allPages) {
            if (!isFirstPage) {
                doc.addPage();
            }
            isFirstPage = false;

            // A. Template
            if (page.templateImageUrl) {
                try {
                    const imageUrl = page.templateImageUrl.startsWith('http')
                        ? page.templateImageUrl
                        : `https://apimmedford.infispark.in/${page.templateImageUrl}`;

                    const imgResponse = await fetch(imageUrl);
                    const imgBlob = await imgResponse.blob();
                    let imgBase64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(imgBlob);
                    });

                    if (highCompression) {
                        imgBase64 = await compressImage(imgBase64, 0.5);
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
                        const imgUrl = img.imageUrl.startsWith('http')
                            ? img.imageUrl
                            : `https://apimmedford.infispark.in/${img.imageUrl}`;

                        const response = await fetch(imgUrl);
                        const blob = await response.blob();
                        let base64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });

                        if (highCompression) {
                            base64 = await compressImage(base64, 0.5);
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
                        } else if (typeof rawPoints[0] === 'object') {
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
    };

    const drawDischargeSummary = async (doc: jsPDF, summaryData: any) => {
        // Add new page for discharge summary
        doc.addPage();

        // Load Letterhead
        // Note: Assuming /letterhead.png is available in public folder
        const letterheadUrl = '/letterhead.png';
        try {
            const imgResponse = await fetch(letterheadUrl);
            const imgBlob = await imgResponse.blob();
            const letterheadBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(imgBlob);
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            const primaryColor = [23, 117, 137];
            const accentColor = [250, 250, 250];

            let currentY = 62;
            const marginX = 10;
            const contentWidth = pageWidth - (marginX * 2);

            const addBackground = () => {
                doc.addImage(letterheadBase64, 'PNG', 0, 0, pageWidth, pageHeight);
            };

            const checkPageBreak = (heightNeeded: number) => {
                if (currentY + heightNeeded > pageHeight - 20) {
                    doc.addPage();
                    addBackground();
                    currentY = 45;
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

                // Value
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');

                textLines.forEach(line => {
                    if (line.trim() === '') {
                        currentY += 2;
                        return;
                    }
                    const splitText = doc.splitTextToSize(line, contentWidth - 4);
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

            // --- START DRAWING ---
            addBackground();

            // Title
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('DISCHARGE SUMMARY', pageWidth / 2, 55, { align: 'center' });
            doc.setLineWidth(0.5);
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.line((pageWidth / 2) - 30, 56, (pageWidth / 2) + 30, 56);

            // Address
            const fullAddress = `${summaryData.detailedAddress || ''} ${summaryData.detailedAddress2 || ''}`;
            const addressColumnWidth = (contentWidth / 2) - 5;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            const addressLines = doc.splitTextToSize(fullAddress, addressColumnWidth);
            const extraHeight = (addressLines.length > 1) ? (addressLines.length - 1) * 5 : 0;
            const boxHeight = 38 + extraHeight;

            // Card
            doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.1);
            doc.roundedRect(marginX, currentY, contentWidth, boxHeight, 1, 1, 'FD');

            const col1X = marginX + 4;
            const col2X = marginX + (contentWidth / 2) + 4;
            let cardY = currentY + 5;

            drawPatientInfoItem('PATIENT NAME', summaryData.patientName, col1X, cardY, (contentWidth / 2) - 5);
            drawPatientInfoItem('AGE / SEX', summaryData.ageSex, col2X, cardY, (contentWidth / 2) - 5);

            cardY += 8;
            doc.setDrawColor(200, 200, 200);
            doc.line(marginX + 2, cardY - 2, marginX + contentWidth - 2, cardY - 2);

            drawPatientInfoItem('UHID / IPD NO.', summaryData.uhidIpdNumber, col1X, cardY, (contentWidth / 2) - 5);
            drawPatientInfoItem('CONSULTANT', summaryData.consultantInCharge, col2X, cardY, (contentWidth / 2) - 5);

            cardY += 8;
            doc.line(marginX + 2, cardY - 2, marginX + contentWidth - 2, cardY - 2);

            drawPatientInfoItem('ADMISSION DATE', summaryData.admissionDateAndTime, col1X, cardY, (contentWidth / 2) - 5);
            drawPatientInfoItem('DISCHARGE DATE', summaryData.dischargeDateAndTime, col2X, cardY, (contentWidth / 2) - 5);

            cardY += 8;
            drawPatientInfoItem('DISCHARGE TYPE', summaryData.typeOfDischarge, col1X, cardY, (contentWidth / 2) - 5);
            drawPatientInfoItem('ADDRESS', fullAddress, col2X, cardY, addressColumnWidth);

            currentY += boxHeight + 8;

            // Sections
            drawSectionHeader('Clinical Diagnosis');
            drawPdfSection('Provisional Diagnosis', summaryData.provisionalDiagnosis);
            drawPdfSection('Final Diagnosis', `${summaryData.finalDiagnosis || ''}\n${summaryData.finalDiagnosis2 || ''}`.trim());
            drawPdfSection('Procedure / Surgeries', `${summaryData.procedure || ''}\n${summaryData.procedure2 || ''}\n${summaryData.surgeryProcedureDetails || ''}`.trim());

            drawSectionHeader('Clinical Summary');
            drawPdfSection('History of Present Illness', summaryData.historyOfPresentIllness);
            drawPdfSection('General Physical Examination', summaryData.generalPhysicalExamination);
            drawPdfSection('Systemic Examination', summaryData.systemicExamination);
            drawPdfSection('Investigations', summaryData.investigations);
            drawPdfSection('Treatment Given', summaryData.treatmentGiven);
            drawPdfSection('Hospital Course', summaryData.hospitalCourse);

            drawSectionHeader('Discharge Advice');
            drawPdfSection('Condition at Discharge', summaryData.conditionAtDischarge);

            if (summaryData.dischargeMedications) {
                checkPageBreak(30);
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text('Discharge Medications', marginX, currentY);
                currentY += 2;

                const splitMeds = doc.splitTextToSize(summaryData.dischargeMedications, contentWidth - 4);
                const medBoxHeight = (splitMeds.length * 4.5) + 4;
                checkPageBreak(medBoxHeight);

                doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
                doc.setDrawColor(200, 200, 200);
                doc.roundedRect(marginX, currentY, contentWidth, medBoxHeight, 1, 1, 'FD');
                doc.setTextColor(0, 0, 0);
                doc.setFont('helvetica', 'normal');
                doc.text(splitMeds, marginX + 2, currentY + 4);
                currentY += medBoxHeight + 4;
            }

            drawPdfSection('Follow Up', summaryData.followUp);
            drawPdfSection('Instructions', summaryData.dischargeInstruction);

            if (summaryData.reportImmediatelyIf) {
                checkPageBreak(25);
                currentY += 2;
                doc.setFillColor(254, 242, 242);
                doc.setDrawColor(153, 27, 27);
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

            checkPageBreak(40);
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.1);
            doc.line(marginX, currentY, pageWidth - marginX, currentY);
            currentY += 5;

            const footerY = currentY;
            doc.setFontSize(9);
            if (summaryData.emergencyContact) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`Emergency Contact: ${summaryData.emergencyContact}`, marginX, footerY + 5);
            }
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`Date: ${summaryData.date || ''}   Time: ${summaryData.time || ''}`, marginX, footerY + 10);

            // Signatures
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

        } catch (error) {
            console.error("Error drawing discharge summary:", error);
        }
    };

    const executeBackup = async () => {
        setIsPasswordModalOpen(false);
        setPassword("");

        if (!startDate || !endDate) {
            toast.error("Please select start and end dates.");
            return;
        }

        setIsProcessing(true);
        setStatusMessage("Fetching records...");
        setProgress(0);
        setProcessedCount(0);
        setTotalCount(0);

        try {
            // 1. Fetch Patients discharged in range
            const { data: records, error } = await supabase
                .from("ipd_registration")
                .select(`
          ipd_id, discharge_date, uhid, created_at,
          patient_detail (name)
        `)
                .gte("discharge_date", startDate)
                .lte("discharge_date", endDate);

            if (error) throw error;

            if (!records || records.length === 0) {
                toast.info("No discharged patients found in this date range.");
                setIsProcessing(false);
                return;
            }

            const totalRecords = records.length;
            setTotalCount(totalRecords);

            setStatusMessage(`Found ${totalRecords} records. Starting backup...`);

            const zip = new JSZip();
            const CONCURRENCY_LIMIT = 3; // Process 3 PDFs in parallel to save memory
            let completedCount = 0;

            // Helper function to process individual record
            const processRecord = async (record: any) => {
                const patientName = Array.isArray(record.patient_detail)
                    ? record.patient_detail[0]?.name
                    : record.patient_detail?.name || "Unknown";
                const dischargeDateStr = record.discharge_date ? record.discharge_date : 'UnknownDate';
                const fileName = `${patientName.replace(/[^a-zA-Z0-9]/g, '_')}_Discharge_${dischargeDateStr}.pdf`;

                try {
                    let allPages: DrawingPage[] = [];
                    let healthRecord: any = null;

                    if (dbSource === 'legacy') {
                        // A. Legacy Data
                        const { data, error } = await supabase
                            .from('user_health_details')
                            .select('*')
                            .eq('ipd_registration_id', record.ipd_id)
                            .eq('patient_uhid', record.uhid)
                            .maybeSingle();

                        if (error) throw error;
                        healthRecord = data;

                        if (healthRecord) {
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
                        }
                    } else {
                        // B. Granular Data
                        const { data: granularPages, error } = await supabase
                            .from('ipd_pages')
                            .select('*')
                            .eq('ipd_id', record.ipd_id)
                            .eq('uhid', record.uhid);

                        if (error) throw error;

                        if (granularPages) {
                            granularPages.forEach((row: any) => {
                                const canvasData = row.canvas_data || {};
                                allPages.push({
                                    id: row.id.toString(),
                                    templateImageUrl: canvasData.template_image_url || row.template_image_url || "",
                                    pageNumber: row.page_number || 0,
                                    pageName: row.page_name || "Unnamed Page",
                                    groupName: row.group_name || "Uncategorized",
                                    lines: canvasData.lines || [],
                                    texts: canvasData.texts || [],
                                    images: canvasData.images || [],
                                    locationTag: canvasData.location_tag || row.location_tag || ""
                                });
                            });
                        }
                    }

                    if (allPages.length === 0 && dbSource === 'granular') {
                        // For granular, if no records found, maybe check if they have legacy?
                        // No, the user explicitly chose granular.
                    }

                    const doc = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4',
                        compress: true
                    });

                    // 3. Final Global Sort
                    allPages.sort((a, b) => {
                        let idxA = IPD_GROUP_ORDER.indexOf(a.groupName);
                        let idxB = IPD_GROUP_ORDER.indexOf(b.groupName);
                        if (idxA === -1) idxA = 999;
                        if (idxB === -1) idxB = 999;

                        if (idxA !== idxB) return idxA - idxB;
                        return (a.pageNumber || 0) - (b.pageNumber || 0);
                    });

                    if (allPages.length > 0) {
                        await generatePdfFromPages(doc, allPages, true);
                    } else {
                        doc.text("No daily monitoring records found from the selected database.", 10, 10);
                    }

                    // For discharge summary, we might still need the legacy record if it's ONLY stored there
                    // Let's quickly fetch it if we don't have it yet
                    let finalHealthRecord = healthRecord;
                    if (!finalHealthRecord) {
                        const { data } = await supabase
                            .from('user_health_details')
                            .select('dischare_summary_written')
                            .eq('ipd_registration_id', record.ipd_id)
                            .eq('patient_uhid', record.uhid)
                            .maybeSingle();
                        finalHealthRecord = data;
                    }

                    const summaryData = finalHealthRecord?.dischare_summary_written;
                    if (summaryData && (Array.isArray(summaryData) ? summaryData.length > 0 : true)) {
                        const actualSummary = Array.isArray(summaryData) ? summaryData[0] : summaryData;
                        await drawDischargeSummary(doc, actualSummary);
                    }

                    const pdfBlob = doc.output('blob');
                    zip.file(fileName, pdfBlob);

                } catch (err) {
                    console.error(`Error processing ${patientName}`, err);
                } finally {
                    completedCount++;
                    setProgress(Math.round((completedCount / totalRecords) * 100));
                    setProcessedCount(completedCount);
                    setStatusMessage(`Processing: ${patientName} (${completedCount}/${totalRecords})`);
                }
            };

            // Process records in chunks
            for (let i = 0; i < records.length; i += CONCURRENCY_LIMIT) {
                const chunk = records.slice(i, i + CONCURRENCY_LIMIT);
                await Promise.all(chunk.map(record => processRecord(record)));
            }

            setStatusMessage("Compressing and generating ZIP...");
            const content = await zip.generateAsync({ type: "blob" });
            const zipFileName = `IPD_Backup_${startDate}_to_${endDate}_Full.zip`;

            if (fileHandle) {
                try {
                    // Write directly to the file handle selected by the user
                    const writable = await fileHandle.createWritable()
                    await writable.write(content)
                    await writable.close()
                    toast.success("Backup saved to selected location!")
                } catch (err) {
                    console.error("Error saving to file:", err)
                    toast.error("Failed to save to selected file, falling back to download.")
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(content);
                    link.download = zipFileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(content);
                link.download = zipFileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            if (!fileHandle) {
                toast.success("All backups downloaded successfully in one ZIP!");
            }

        } catch (err: any) {
            console.error("Backup Global Error:", err);
            toast.error(`Backup failed: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const initiateBackup = () => {
        if (!startDate || !endDate) {
            toast.error("Please select start and end dates.");
            return;
        }
        setIsPasswordModalOpen(true);
    }

    const handlePasswordSubmit = () => {
        if (password === "medford") {
            executeBackup();
        } else {
            toast.error("Incorrect Password. Storage access denied.");
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <Card className="w-full max-w-lg bg-white shadow-xl rounded-2xl overflow-hidden border-0">
                <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Button variant="ghost" className="text-white hover:bg-white/20 p-2 h-auto" onClick={() => router.back()}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="p-2 bg-white/20 rounded-lg">
                            <Archive className="h-6 w-6 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">IPD Advanced Backup</CardTitle>
                    <CardDescription className="text-blue-100">
                        Export full patient records including discharge summaries.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="start-date" className="text-gray-700 font-medium">Start Date (Discharge)</Label>
                            <Input
                                id="start-date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end-date" className="text-gray-700 font-medium">End Date (Discharge)</Label>
                            <Input
                                id="end-date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-gray-700 font-medium">Backup Destination</Label>
                            <div className="flex gap-2">
                                <Input
                                    readOnly
                                    value={fileHandle ? fileHandle.name : (startDate && endDate ? `IPD_Backup_${startDate}_to_${endDate}_Full.zip` : "Select dates to generate filename")}
                                    className="h-11 border-gray-300 bg-gray-50 text-gray-500 font-medium"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleSelectSaveLocation}
                                    className="h-11 px-4 border-gray-300 hover:bg-gray-50"
                                >
                                    <FolderOpen className="h-5 w-5 text-gray-600" />
                                </Button>
                            </div>
                            <p className="text-xs text-gray-400">
                                Click folder icon to choose where to save the backup file.
                            </p>
                        </div>
                        <div className="space-y-4 pt-4 border-t">
                            <Label className="text-sm font-semibold text-gray-700">Database Source</Label>
                            <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                                <button
                                    onClick={() => setDbSource('granular')}
                                    className={`px-4 py-2 text-sm rounded-md transition-all font-semibold ${dbSource === 'granular' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    New DB (Granular)
                                </button>
                                <button
                                    onClick={() => setDbSource('legacy')}
                                    className={`px-4 py-2 text-sm rounded-md transition-all font-semibold ${dbSource === 'legacy' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Old DB (Legacy)
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 italic">Select which database source to retrieve clinical pages from. By default, the new granular database is used.</p>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button
                            onClick={initiateBackup}
                            disabled={isProcessing}
                            className="w-full h-12 text-lg font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md transition-all active:scale-[0.98]"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Download className="mr-2 h-5 w-5" />
                                    Download Backup
                                </>
                            )}
                        </Button>
                    </div>

                    {isProcessing && (
                        <div className="space-y-3 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-sm font-medium text-gray-700">
                                    <span>Progress</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600 transition-all duration-300 ease-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 px-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <p className="truncate">{statusMessage}</p>
                            </div>
                            {totalCount > 0 && (
                                <p className="text-xs text-center text-gray-400">
                                    {processedCount} of {totalCount} records processed
                                </p>
                            )}
                        </div>
                    )}

                    {!isProcessing && statusMessage && totalCount > 0 && progress === 100 && (
                        <div className="p-4 bg-green-50 border border-green-100 rounded-lg flex items-center gap-3 text-green-700 animate-in fade-in">
                            <CheckCircle2 className="h-5 w-5" />
                            <div className="text-sm font-medium">Backup completed successfully!</div>
                        </div>
                    )}

                    <div className="mt-4 bg-blue-50 p-4 rounded-lg flex gap-3 text-sm text-blue-700">
                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <p>
                            This will download a ZIP file containing individual PDFs for each patient discharged within the selected date range. Each PDF includes all clinical notes and the Discharge Summary.
                        </p>
                    </div>
                </CardContent>
            </Card>
            {/* Password Verification Dialog */}
            <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5 text-red-500" />
                            Admin Verification Required
                        </DialogTitle>
                        <DialogDescription>
                            Performing a bulk backup puts significant load on the server. Please verify your identity to proceed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="password">Administrator Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password..."
                            className="mt-2"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handlePasswordSubmit();
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancel</Button>
                        <Button onClick={handlePasswordSubmit} className="bg-red-600 hover:bg-red-700">Verify & Start</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
