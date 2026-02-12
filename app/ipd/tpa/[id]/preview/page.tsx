"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Loader2, CheckSquare, Square } from 'lucide-react';
import PageRenderer, { DrawingPage } from '@/components/ipd/PageRenderer';
import jsPDF from 'jspdf';

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

interface DrawingPagePreview extends DrawingPage {
    _uniqueKey: string;
}

interface DrawingGroup {
    id: string;
    groupName: string;
    pages: DrawingPagePreview[];
}

export default function PreviewSelectPage() {
    const params = useParams();
    const router = useRouter();
    const ipdId = params.id as string;

    const searchParams = useSearchParams();
    const sourceParam = searchParams.get('source');

    const [isLoading, setIsLoading] = useState(true);
    const [patientName, setPatientName] = useState("");
    const [uhid, setUhid] = useState("");
    const [groupedPages, setGroupedPages] = useState<{ groupName: string, pages: DrawingPagePreview[] }[]>([]);

    const [selectedPageKeys, setSelectedPageKeys] = useState<Set<string>>(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [dbSource, setDbSource] = useState<'granular' | 'legacy'>(
        (sourceParam === 'legacy' || sourceParam === 'granular') ? sourceParam : 'granular'
    );

    // Filtered Pages based on selected database source
    const filteredGroupedPages = useMemo(() => {
        return groupedPages.map(group => ({
            ...group,
            pages: group.pages.filter(p => p._uniqueKey.startsWith(dbSource))
        })).filter(group => group.pages.length > 0);
    }, [groupedPages, dbSource]);

    const visibleSelectedCount = useMemo(() => {
        let count = 0;
        filteredGroupedPages.forEach(group => {
            group.pages.forEach(p => {
                if (selectedPageKeys.has(p._uniqueKey)) count++;
            });
        });
        return count;
    }, [filteredGroupedPages, selectedPageKeys]);

    // --- FETCH DATA ---
    useEffect(() => {
        const fetchData = async () => {
            if (!ipdId) return;
            setIsLoading(true);
            try {
                // 1. Get Basic Info
                const { data: regData, error: regError } = await supabase
                    .from('ipd_registration')
                    .select('uhid, patient_detail(name)')
                    .eq('ipd_id', ipdId)
                    .single();

                if (regError) throw regError;

                const pName = (regData.patient_detail as any)?.name || (Array.isArray(regData.patient_detail) ? regData.patient_detail[0]?.name : "Unknown");
                const pUhid = regData.uhid;
                setPatientName(pName);
                setUhid(pUhid);

                // 2. Get Health Data (Legacy)
                const { data: healthRecord, error: healthError } = await supabase
                    .from('user_health_details')
                    .select('*')
                    .eq('ipd_registration_id', parseInt(ipdId))
                    .eq('patient_uhid', pUhid)
                    .maybeSingle();

                if (healthError) {
                    console.error("Error fetching legacy health records:", healthError);
                }

                // 3. Process Pages
                const groups: { groupName: string, pages: DrawingPagePreview[] }[] = [];
                const allKeys = new Set<string>();

                // 3a. From Legacy Table (user_health_details)
                if (healthRecord) {
                    IPD_GROUP_ORDER.forEach(groupName => {
                        const colName = GROUP_TO_COLUMN_MAP[groupName];
                        if (healthRecord[colName] && Array.isArray(healthRecord[colName])) {
                            const pages = healthRecord[colName] as DrawingPage[];
                            if (pages.length > 0) {
                                // Ensure pages have groupName and unique key
                                const processedPages: DrawingPagePreview[] = pages.map((p, idx) => ({
                                    ...p,
                                    groupName,
                                    _uniqueKey: `legacy-${groupName}-${p.pageNumber}-${idx}` // Use preficed key
                                }));
                                groups.push({ groupName, pages: processedPages });

                                // Select all by default
                                processedPages.forEach(p => allKeys.add(p._uniqueKey));
                            }
                        }
                    });

                    // From Legacy Custom Groups
                    if (healthRecord.custom_groups_data && Array.isArray(healthRecord.custom_groups_data)) {
                        const customGroups = healthRecord.custom_groups_data as DrawingGroup[];
                        customGroups.forEach(g => {
                            if (g.pages && g.pages.length > 0) {
                                const processedPages: DrawingPagePreview[] = g.pages.map((p, idx) => ({
                                    ...p,
                                    groupName: g.groupName,
                                    _uniqueKey: `legacy-${g.groupName}-${p.pageNumber}-${idx}`
                                }));
                                groups.push({ groupName: g.groupName, pages: processedPages });

                                // Select all by default
                                processedPages.forEach(p => allKeys.add(p._uniqueKey));
                            }
                        });
                    }
                }

                // 3b. From New Granular Table (ipd_pages)
                const { data: newPagesData, error: newPagesError } = await supabase
                    .from('ipd_pages')
                    .select('*')
                    .eq('ipd_id', parseInt(ipdId))
                    .eq('uhid', pUhid);

                if (newPagesError) {
                    console.error("Error fetching ipd_pages:", newPagesError);
                } else if (newPagesData) {
                    newPagesData.forEach((row: any) => {
                        const canvasData = row.canvas_data || {};
                        const page: DrawingPagePreview = {
                            id: row.id.toString(),
                            templateImageUrl: canvasData.template_image_url || row.template_image_url || "",
                            pageNumber: row.page_number || 0,
                            pageName: row.page_name || "Unnamed Page",
                            groupName: row.group_name || "Uncategorized",
                            lines: canvasData.lines || [],
                            texts: canvasData.texts || [],
                            images: canvasData.images || [],
                            locationTag: canvasData.location_tag || row.location_tag || "",
                            _uniqueKey: `granular-${row.id}`
                        };

                        let group = groups.find(g => g.groupName === page.groupName);
                        if (group) {
                            group.pages.push(page);
                        } else {
                            groups.push({ groupName: page.groupName, pages: [page] });
                        }
                        allKeys.add(page._uniqueKey);
                    });
                }

                // 4. Final Sort and Dedup
                groups.forEach(group => {
                    // Sort pages by pageNumber
                    group.pages.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
                });

                // Sort groups by IPD_GROUP_ORDER
                groups.sort((a, b) => {
                    let idxA = IPD_GROUP_ORDER.indexOf(a.groupName);
                    let idxB = IPD_GROUP_ORDER.indexOf(b.groupName);
                    if (idxA === -1) idxA = 999;
                    if (idxB === -1) idxB = 999;
                    return idxA - idxB;
                });

                setGroupedPages(groups);
                setSelectedPageKeys(allKeys);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast.error("Failed to load patient data.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [ipdId]);

    // --- HANDLERS ---
    const togglePageSelection = (key: string) => {
        const newSet = new Set(selectedPageKeys);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setSelectedPageKeys(newSet);
    };

    const toggleGroupSelection = (groupName: string, pages: any[]) => {
        const newSet = new Set(selectedPageKeys);
        const groupKeys = pages.map(p => p._uniqueKey);
        const allSelected = groupKeys.every(k => newSet.has(k));

        if (allSelected) {
            // Deselect all in group
            groupKeys.forEach(k => newSet.delete(k));
        } else {
            // Select all in group
            groupKeys.forEach(k => newSet.add(k));
        }
        setSelectedPageKeys(newSet);
    };

    const scrollToGroup = (groupName: string) => {
        const element = document.getElementById(`group-${groupName}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // --- PDF GENERATION (Copied & Adapted) ---
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
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(base64);
        });
    };

    const handleDownload = async () => {
        if (selectedPageKeys.size === 0) {
            toast.error("Please select at least one page.");
            return;
        }

        setIsGenerating(true);
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            // Flatten pages in order
            let pagesToPrint: DrawingPage[] = [];
            filteredGroupedPages.forEach(group => {
                group.pages.forEach((page: any) => {
                    if (selectedPageKeys.has(page._uniqueKey)) {
                        pagesToPrint.push(page);
                    }
                });
            });

            // --- PDF GENERATION LOGIC ---
            const FLUTTER_CANVAS_WIDTH = 1000;
            const FLUTTER_CANVAS_HEIGHT = 1414;
            const PDF_WIDTH = 210;
            const PDF_HEIGHT = 297;
            const scaleX = PDF_WIDTH / FLUTTER_CANVAS_WIDTH;
            const scaleY = PDF_HEIGHT / FLUTTER_CANVAS_HEIGHT;
            let isFirstPage = true;

            for (const page of pagesToPrint) {
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

                        // Always compress for performance/size
                        imgBase64 = await compressImage(imgBase64, 0.3);

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

                            base64 = await compressImage(base64, 0.3);

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

            const pdfBlob = doc.output('blob');
            const blobUrl = URL.createObjectURL(pdfBlob);
            window.open(blobUrl, '_blank');
            toast.success("PDF Generated Successfully");

        } catch (error) {
            console.error("PDF Gen Error", error);
            toast.error("Failed to generate PDF");
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">
            {/* --- SIDEBAR --- */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
                <div className="p-4 border-b border-gray-100">
                    <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-gray-500" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <h2 className="font-semibold text-gray-800 truncate" title={patientName}>{patientName}</h2>
                    <p className="text-xs text-gray-500 font-mono">UHID: {uhid}</p>
                </div>

                <div className="p-4 border-b border-gray-100 bg-blue-50/50">
                    <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2 block">Database Source</label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setDbSource('granular')}
                            className={`flex-1 text-[11px] py-1.5 rounded-md transition-all font-semibold ${dbSource === 'granular' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            New DB
                        </button>
                        <button
                            onClick={() => setDbSource('legacy')}
                            className={`flex-1 text-[11px] py-1.5 rounded-md transition-all font-semibold ${dbSource === 'legacy' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Old DB
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredGroupedPages.map(group => {
                        // Check if all pages in group are selected
                        const groupKeys = group.pages.map((p: any) => p._uniqueKey);
                        const allSelected = groupKeys.every(k => selectedPageKeys.has(k));
                        const someSelected = groupKeys.some(k => selectedPageKeys.has(k));

                        return (
                            <div
                                key={group.groupName}
                                className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 cursor-pointer group transition-colors"
                                onClick={() => scrollToGroup(group.groupName)}
                            >
                                <span className="text-sm text-gray-700 font-medium truncate flex-1">{group.groupName}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.pages.length}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleGroupSelection(group.groupName, group.pages);
                                        }}
                                        className="text-gray-400 hover:text-blue-600 focus:outline-none"
                                    >
                                        {allSelected ? (
                                            <CheckSquare className="h-4 w-4 text-blue-600" />
                                        ) : someSelected ? (
                                            <div className="h-4 w-4 bg-blue-100 border border-blue-600 rounded flex items-center justify-center">
                                                <div className="h-2 w-2 bg-blue-600 rounded-sm" />
                                            </div>
                                        ) : (
                                            <Square className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex justify-between items-center mb-2 text-sm text-gray-600">
                        <span>Selected:</span>
                        <span className="font-bold text-gray-900">{visibleSelectedCount} Pages</span>
                    </div>
                    <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        onClick={handleDownload}
                        disabled={isGenerating || visibleSelectedCount === 0}
                    >
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                        Download PDF
                    </Button>
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
                <div className="max-w-5xl mx-auto space-y-12 pb-20">
                    {filteredGroupedPages.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-gray-500">No pages found in this database source.</p>
                        </div>
                    ) : (
                        filteredGroupedPages.map(group => (
                            <div key={group.groupName} id={`group-${group.groupName}`} className="scroll-mt-8">
                                <div className="flex items-center gap-4 mb-6">
                                    <h3 className="text-xl font-bold text-gray-800">{group.groupName}</h3>
                                    <div className="h-px bg-gray-200 flex-1"></div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {group.pages.map((page: any) => {
                                        const isSelected = selectedPageKeys.has(page._uniqueKey);
                                        return (
                                            <div key={page._uniqueKey} className="flex flex-col items-center gap-2 group">
                                                <PageRenderer
                                                    page={page}
                                                    width={280}
                                                    isSelected={isSelected}
                                                    onClick={() => togglePageSelection(page._uniqueKey)}
                                                    className="shadow-md hover:shadow-xl transition-all duration-300"
                                                />
                                                <div className="text-xs text-gray-500 font-medium">Page {page.pageNumber}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}