// app/ipd/manage/[ipdId]/InvestigationSheetTab.tsx
"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase"; // Supabase client
import { toast } from "sonner"; // Sonner for toasts
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Table components
import { format } from "date-fns/format";
import { jsPDF } from "jspdf";
import { Eye, Download, X, FileImage, Loader2, Plus, Trash2, History, RefreshCw } from "lucide-react";

/* ───────── Types ───────── */

// Interface for a single investigation entry *within* a test group's entries array
interface InvestigationEntry {
  tempId: string; // Client-side unique ID for managing this entry in the array
  dateTime: string;
  value: string; // URL for images, text for text entries
  type: "text" | "image";
  enteredBy: string; // User who added/last modified this specific entry
  timestamp: string; // Timestamp for this specific entry
  deletedBy?: string; // For soft-deleting individual entries
  deletedAt?: string;
}

// Interface for a test group object *within* the `investigation_detail` JSON array
interface TestGroupInJson {
  testName: string; // e.g., "HIV", "Custom Test"
  customTestName?: string; // Only if testName is "Custom"
  entries: InvestigationEntry[]; // Array of entries for this specific test
}

// Corresponds to the single row in `manage_investigation_records` table for an IPD ID
interface InvestigationRecordSupabase {
  id: string; // PK of the row
  ipd_id: number;
  uhid: string;
  entered_by: string[] | null; // Array of users who modified this main record
  created_at?: string;
  investigation_detail: TestGroupInJson[]; // The array of test groups
}

// Form inputs for a new test to add (main form)
interface TestEntryForm {
  testName: string;
  customTestName: string;
  dateTime: string;
  value: string;
  image?: FileList;
  entryType: "text" | "image";
}

interface InvestigationFormInputs {
  tests: TestEntryForm[];
}

// Form inputs for adding an additional entry to an existing test
interface AdditionalEntryFormInputs {
  dateTime: string;
  value: string;
  image?: FileList;
  entryType: "text" | "image";
}

/* ───────── Test list ───────── */
const testOptions = ["HIV", "HBsAg", "HCV", "HB", "WBC", "PLATELET", "CRP", "ESR", "PT", "INR", "PTT", "BNP", "Custom"];

/* ───────── Image-compression helper ───────── */
const compressImage = (file: File, maxKB = 200, maxW = 1200): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxW) {
          height = (height * maxW) / width;
          width = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);

        const attempt = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject("Compression failed");
              if (blob.size / 1024 <= maxKB || q <= 0.4) {
                resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
              } else {
                attempt(q - 0.1);
              }
            },
            "image/jpeg",
            q,
          );
        };
        attempt(0.8);
      };
      img.onerror = () => reject("Image load error");
      img.src = e.target!.result as string;
    };
    reader.onerror = () => reject("File read error");
    reader.readAsDataURL(file);
  });

/* =================================================================== */
export default function InvestigationSheet() {
  const { ipdId } = useParams<{ ipdId: string }>(); // Only ipdId is available directly

  /* State */
  const [investigationDataRow, setInvestigationDataRow] = useState<InvestigationRecordSupabase | null>(null); // Holds the single row
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [imgPreviews, setImgPreviews] = useState<{ [key: number]: string }>({}); // For main form image previews
  const [addFormImgPreview, setAddFormImgPreview] = useState<string | null>(null); // For add-entry form preview
  const [addRowTestName, setAddRowTestName] = useState<string | null>(null); // Name of the test group to add an entry to
  const [galleryOpen, setGalleryOpen] = useState(false); // For image gallery dialog
  const [selectedRecForGallery, setSelectedRecForGallery] = useState<TestGroupInJson | null>(null); // For selected test group in gallery
  const [fullImg, setFullImg] = useState<string | null>(null); // For full-screen image view
  const [pdfBusy, setPdfBusy] = useState(false); // For PDF generation loading state
  const [showDeletedHistory, setShowDeletedHistory] = useState(false); // State for deleted history dialog

  /* Refs */
  const fileRefs = useRef<{ [key: number]: HTMLInputElement | null }>({}); // Refs for main form file inputs
  const addFileRef = useRef<HTMLInputElement | null>(null); // Ref for add-entry form file input
  const channelRef = useRef<any>(null); // Ref for Supabase real-time channel

  /* RHF main form with field array */
  const { register, handleSubmit, control, reset, watch, setValue } = useForm<InvestigationFormInputs>({
    defaultValues: {
      tests: [
        {
          testName: "",
          customTestName: "",
          dateTime: new Date().toISOString().slice(0, 16),
          value: "",
          entryType: "text",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tests",
  });

  const watchedTests = watch("tests"); // Watch form fields for conditional rendering

  /* RHF add-entry form */
  const {
    register: rAdd,
    handleSubmit: hAdd,
    reset: resetAdd,
    watch: wAdd,
    setValue: setValAdd,
  } = useForm<AdditionalEntryFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      value: "",
      entryType: "text",
    },
  });

  const entryTypeAdd = wAdd("entryType"); // Watch entry type for add-entry form

  /* Supabase paths */
  const investigationsTable = 'manage_investigation_records';
  const storageBucket = 'investigation-images'; // Ensure this bucket exists in Supabase Storage

  /* Fetch investigations from Supabase */
  const fetchInvestigationDataRow = useCallback(async () => {
    if (!ipdId) {
      setInvestigationDataRow(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from(investigationsTable)
        .select('*')
        .eq('ipd_id', Number(ipdId))
        .single(); // Expecting a single row for this ipd_id

      if (error && error.code !== "PGRST116") { // PGRST116 means "No rows found"
        console.error("Error fetching investigation data row:", error.message);
        toast.error("Failed to load investigation records.");
        setInvestigationDataRow(null);
      } else if (data) {
        setInvestigationDataRow(data as InvestigationRecordSupabase);
      } else {
        setInvestigationDataRow(null); // No data found
      }
    } catch (error: any) {
      console.error("An unexpected error occurred during fetch:", error.message);
      toast.error("An unexpected error occurred while loading investigations.");
      setInvestigationDataRow(null);
    } finally {
      setIsLoading(false);
    }
  }, [ipdId]);

  // Real-time subscription and initial fetch logic
  useEffect(() => {
    if (!ipdId) return;

    const ipdNum = Number(ipdId);
    let channel: any; // Declare channel here for proper cleanup

    // Initial fetch
    fetchInvestigationDataRow();

    // Set up real-time subscription
    channel = supabase
      .channel(`investigation_records_ipd_${ipdNum}`) // Unique channel name per IPD
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: investigationsTable,
          filter: `ipd_id=eq.${ipdNum}`,
        },
        async (payload) => {
          console.log("Realtime change detected for investigations:", payload);
          toast.info(`Investigation record ${payload.eventType.toLowerCase()}d.`);
          // Refetch all data to update the UI
          await fetchInvestigationDataRow();
        }
      )
      .subscribe();

    // Cleanup function: unsubscribe when component unmounts or ipdId changes
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [ipdId, fetchInvestigationDataRow]);

  // Polling for initial row existence (if it doesn't exist yet, for first save)
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (!investigationDataRow && ipdId && !isLoading) {
      interval = setInterval(fetchInvestigationDataRow, 2000);
    }
    if ((investigationDataRow || !ipdId) && interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [investigationDataRow, ipdId, isLoading, fetchInvestigationDataRow]);


  /* Progress helper for uploads */
  const tickProgress = () => {
    setUploadPct(0);
    const iv = setInterval(() => {
      setUploadPct((p) => (p >= 85 ? p : p + 10));
    }, 200);
    return () => clearInterval(iv);
  };

  /* Upload image to Supabase Storage and get URL */
  const uploadImageAndGetUrl = async (file: File) => {
    setIsUploading(true);
    const stopProgress = tickProgress();
    try {
      const compressed = await compressImage(file, 200, 1200);
      const fileName = `${Date.now()}_${compressed.name.replace(/[^a-zA-Z0-9.]/g, '_')}`; // Sanitize filename
      const filePath = `${ipdId}/${fileName}`; // Store images under ipdId folder in bucket

      const { data, error } = await supabase.storage
        .from(storageBucket)
        .upload(filePath, compressed, {
          cacheControl: '3600',
          upsert: false, // Do not overwrite existing files with the same name
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from(storageBucket)
        .getPublicUrl(filePath);

      if (!publicUrlData || !publicUrlData.publicUrl) throw new Error("Failed to get public URL.");

      stopProgress();
      setUploadPct(100);
      await new Promise((r) => setTimeout(r, 300)); // Small delay for UI feedback
      return publicUrlData.publicUrl;
    } catch (err: any) {
      stopProgress();
      console.error("🔥 Upload error:", err.message);
      toast.error(`Image upload failed: ${err.message || 'Unknown error'}`);
      throw err;
    } finally {
      setIsUploading(false);
      setUploadPct(0);
    }
  };

  /* Submit multiple tests */
  const onSubmit: SubmitHandler<InvestigationFormInputs> = async (data) => {
    try {
      // 1. Get current user email
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // 2. Fetch UHID from ipd_registration using ipdId
      const { data: ipdRecord, error: ipdError } = await supabase
        .from('ipd_registration')
        .select('uhid')
        .eq('ipd_id', Number(ipdId))
        .single();

      if (ipdError || !ipdRecord) {
        toast.error("Failed to get patient UHID. Cannot save investigations.");
        console.error("UHID fetch error:", ipdError?.message);
        return;
      }
      const uhid = ipdRecord.uhid; // This is the correct UHID

      let currentInvestigationDetail: TestGroupInJson[] = [];
      let mainRecordEnteredBy: string[] = [];
      let mainRecordIdToUpdate: string | null = null;

      // 3. Fetch the current state of the main investigation row
      const { data: currentMainRowData, error: fetchMainRowError } = await supabase
        .from(investigationsTable)
        .select("id, investigation_detail, entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();

      if (fetchMainRowError && fetchMainRowError.code !== "PGRST116") {
        console.error("Error fetching current main investigation row data before update:", fetchMainRowError.message);
        toast.error("Failed to retrieve current investigation data. Please try again.");
        return;
      }

      if (currentMainRowData) {
        mainRecordIdToUpdate = currentMainRowData.id;
        currentInvestigationDetail = currentMainRowData.investigation_detail || [];
        if (Array.isArray(currentMainRowData.entered_by)) {
          mainRecordEnteredBy = [...currentMainRowData.entered_by];
        } else if (typeof currentMainRowData.entered_by === "string" && currentMainRowData.entered_by) {
          mainRecordEnteredBy = [currentMainRowData.entered_by];
        }
      }

      for (const test of data.tests) {
        const finalTestName = test.testName === "Custom" ? test.customTestName : test.testName;

        if (!finalTestName.trim()) {
          toast.error("Please provide a test name for all entries.");
          return;
        }

        const file = test.image?.[0];
        const wantsImg = test.entryType === "image";

        if (wantsImg && !file) {
          toast.error(`Select an image for ${finalTestName} test.`);
          return;
        }

        let value = test.value;
        let type: "text" | "image" = "text";

        if (wantsImg && file) {
          value = await uploadImageAndGetUrl(file);
          type = "image";
        }

        const newEntry: InvestigationEntry = {
          tempId: Date.now().toString(), // Client-side unique ID
          dateTime: test.dateTime,
          value,
          type,
          enteredBy: currentUserEmail,
          timestamp: new Date().toISOString(),
        };

        // Find or create the test group within the investigation_detail array
        let existingTestGroup = currentInvestigationDetail.find((tg) => tg.testName === finalTestName);

        if (existingTestGroup) {
          // If test group exists, add new entry to its entries array
          existingTestGroup.entries.push(newEntry);
        } else {
          // If test group does not exist, create a new one and add the entry
          currentInvestigationDetail.push({
            testName: finalTestName,
            customTestName: test.testName === "Custom" ? test.customTestName : undefined,
            entries: [newEntry],
          });
        }
      }

      // Update the main record's 'entered_by' list if current user not present
      if (!mainRecordEnteredBy.includes(currentUserEmail)) {
        mainRecordEnteredBy.push(currentUserEmail);
      }

      const updatePayload: Partial<InvestigationRecordSupabase> = {
        investigation_detail: currentInvestigationDetail,
        entered_by: mainRecordEnteredBy,
      };

      // 5. Perform the database operation (UPDATE or INSERT)
      if (mainRecordIdToUpdate) {
        // Update existing row
        const { error } = await supabase
          .from(investigationsTable)
          .update(updatePayload)
          .eq('id', mainRecordIdToUpdate);

        if (error) throw error;
      } else {
        // Insert new row if no existing data for this ipd_id
        const newRowPayload: Omit<InvestigationRecordSupabase, "id" | "created_at"> = {
          ipd_id: Number(ipdId),
          uhid: uhid,
          // No 'test_name' column at the top level in the new schema
          investigation_detail: currentInvestigationDetail,
          entered_by: mainRecordEnteredBy,
        };
        const { error } = await supabase
          .from(investigationsTable)
          .insert(newRowPayload);

        if (error) throw error;
      }
      toast.success("All investigations added successfully!");
      // Reset form after successful submission
      reset({
        tests: [
          {
            testName: "",
            customTestName: "",
            dateTime: new Date().toISOString().slice(0, 16),
            value: "",
            entryType: "text",
          },
        ],
      });
      setImgPreviews({}); // Clear all image previews for the main form
    } catch (err: any) {
      console.error("🔥 Submit error:", err.message);
      toast.error(`Error adding investigations: ${err.message || 'Unknown error'}`);
    } finally {
      // Manually refetch to update UI instantly (even if real-time is on, for immediate feedback)
      await fetchInvestigationDataRow();
    }
  };

  /* Submit additional entry to an existing test */
  const onSubmitAdd: SubmitHandler<AdditionalEntryFormInputs> = async (d) => {
    try {
      if (!addRowTestName || !investigationDataRow) return; // addRowTestName identifies the group

      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Deep copy the investigation_detail array to ensure immutability
      const currentInvestigationDetail = JSON.parse(JSON.stringify(investigationDataRow.investigation_detail || [])) as TestGroupInJson[];
      const testGroupToUpdate = currentInvestigationDetail.find(tg => tg.testName === addRowTestName);

      if (!testGroupToUpdate) {
        toast.error("Test group not found for adding entry.");
        return;
      }

      const file = d.image?.[0];
      const wantsImg = d.entryType === "image";

      if (wantsImg && !file) {
        toast.error("Select an image before submitting.");
        return;
      }

      let value = d.value;
      let type: "text" | "image" = "text";

      if (wantsImg && file) {
        value = await uploadImageAndGetUrl(file);
        type = "image";
      }

      const newEntry: InvestigationEntry = {
        tempId: Date.now().toString(),
        dateTime: d.dateTime,
        value,
        type,
        enteredBy: currentUserEmail,
        timestamp: new Date().toISOString(),
      };

      testGroupToUpdate.entries.push(newEntry);

      const updatedEnteredBy = Array.from(new Set([...(investigationDataRow.entered_by || []), currentUserEmail]));

      const { error } = await supabase
        .from(investigationsTable)
        .update({ investigation_detail: currentInvestigationDetail, entered_by: updatedEnteredBy })
        .eq('id', investigationDataRow.id); // Update the main row

      if (error) throw error;

      toast.success("Additional entry added successfully!");
      // Reset add-entry form and close it
      resetAdd({
        dateTime: new Date().toISOString().slice(0, 16),
        value: "",
        entryType: "text",
      });
      addFileRef.current && (addFileRef.current.value = "");
      setAddRowTestName(null); // Close the add entry form
      setAddFormImgPreview(null); // Clear preview for add-entry form
    } catch (err: any) {
      console.error("🔥 ADD entry error:", err.message);
      toast.error(`Error adding additional entry: ${err.message || 'Unknown error'}`);
    } finally {
      await fetchInvestigationDataRow(); // Manually refetch to update UI instantly
    }
  };

  /* Soft delete an individual entry within an investigation record */
  const handleDeleteEntry = useCallback(async (testName: string, tempIdToDelete: string) => {
    if (!window.confirm("Are you sure you want to delete this specific investigation entry?")) {
      return;
    }

    if (!investigationDataRow) {
      toast.error("No investigation data found to delete from.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";

      // Create a deep copy of investigation_detail to modify
      const updatedInvestigationDetail = JSON.parse(JSON.stringify(investigationDataRow.investigation_detail || [])) as TestGroupInJson[];

      const testGroupToUpdate = updatedInvestigationDetail.find(tg => tg.testName === testName);

      if (!testGroupToUpdate) {
        toast.error("Test group not found for deletion.");
        return;
      }

      const updatedEntries = testGroupToUpdate.entries.map(entry => {
        if (entry.tempId === tempIdToDelete) {
          return {
            ...entry,
            deletedBy: currentUserEmail,
            deletedAt: new Date().toISOString(),
          };
        }
        return entry;
      });

      testGroupToUpdate.entries = updatedEntries; // Update the entries array within the group

      const updatedEnteredBy = Array.from(new Set([...(investigationDataRow.entered_by || []), currentUserEmail]));

      const { error } = await supabase
        .from(investigationsTable)
        .update({ investigation_detail: updatedInvestigationDetail, entered_by: updatedEnteredBy })
        .eq('id', investigationDataRow.id); // Update the main row

      if (error) throw error;

      toast.success("Investigation entry deleted successfully!");
    } catch (err: any) {
      console.error("🔥 Delete entry error:", err.message);
      toast.error(`Error deleting entry: ${err.message || 'Unknown error'}`);
    } finally {
      await fetchInvestigationDataRow(); // Manually refetch to update UI instantly
    }
  }, [investigationDataRow]); // Dependency on investigationDataRow


  /* Preview image for main form */
  const preview = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const rd = new FileReader();
    rd.onloadend = () => {
      setImgPreviews((prev) => ({ ...prev, [index]: rd.result as string }));
    };
    rd.readAsDataURL(f);
    setValue(`tests.${index}.entryType`, "image");
  };

  /* Preview image for additional entry form */
  const previewAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const rd = new FileReader();
    rd.onloadend = () => {
      setAddFormImgPreview(rd.result as string);
    };
    rd.readAsDataURL(f);
    setValAdd("entryType", "image");
  };

  /* Generate PDF with all images merged */
  const generatePDF = async () => {
    if (!selectedRecForGallery) return; // Use selectedRecForGallery

    setPdfBusy(true);
    try {
      const imgs = selectedRecForGallery.entries.filter((e) => e.type === "image" && !e.deletedBy); // Only active images
      if (imgs.length === 0) {
        toast.info("No active images to export for this test.");
        return;
      }

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      let currentY = margin;

      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${selectedRecForGallery.testName} - Investigation Images`, margin, currentY); // Use testName
      currentY += 15;

      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Total Images: ${imgs.length}`, margin, currentY);
      currentY += 10;
      pdf.text(`Generated: ${format(new Date(), "PPpp")}`, margin, currentY);
      currentY += 15;

      for (let i = 0; i < imgs.length; i++) {
        const entry = imgs[i];

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Image ${i + 1}:`, margin, currentY);
        currentY += 5;

        pdf.setFont("helvetica", "normal");
        pdf.text(`Date: ${format(new Date(entry.dateTime), "PPpp")}`, margin, currentY);
        currentY += 10;

        try {
          const img = new Image();
          img.crossOrigin = "anonymous";

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = entry.value;
          });

          const imgAspectRatio = img.width / img.height;
          let imgWidth = usableWidth;
          let imgHeight = imgWidth / imgAspectRatio;

          const maxImageHeight = pageHeight - currentY - margin - 20;
          if (imgHeight > maxImageHeight) {
            imgHeight = maxImageHeight;
            imgWidth = imgHeight * imgAspectRatio;
          }

          if (currentY + imgHeight > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }

          pdf.addImage(img, "JPEG", margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight + 15;

          if (i < imgs.length - 1) {
            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 10;
          }
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          pdf.setTextColor(255, 0, 0);
          pdf.text(`Error loading image ${i + 1}`, margin, currentY);
          pdf.setTextColor(0, 0, 0);
          currentY += 10;
        }
      }
      pdf.save(`${selectedRecForGallery.testName}_All_Images_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`);
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Error generating PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const ImgBtn = ({ url }: { url: string }) => (
    <Button variant="ghost" size="sm" className="flex items-center text-xs" onClick={() => setFullImg(url)}>
      <FileImage size={14} className="mr-1" />
      View Image
    </Button>
  );

  // Filter out deleted entries for main display
  // This memoized value will now be an array of TestGroupInJson (only active entries)
  const activeInvestigations = useMemo(() => {
    if (!investigationDataRow || !investigationDataRow.investigation_detail) return [];
    
    // Filter out test groups if they contain only deleted entries
    return investigationDataRow.investigation_detail
      .map(testGroup => ({
        ...testGroup,
        entries: (testGroup.entries || []).filter(entry => !entry.deletedBy)
      }))
      .filter(testGroup => testGroup.entries.length > 0) // Only show test groups that have active entries
      .sort((a, b) => a.testName.localeCompare(b.testName)); // Sort test groups by name
  }, [investigationDataRow]);

  // Filter for only deleted entries for the history popup
  const deletedInvestigationEntries = useMemo(() => {
    const deleted: (InvestigationEntry & { testName: string; recordId: string })[] = [];
    if (investigationDataRow && investigationDataRow.investigation_detail) {
      investigationDataRow.investigation_detail.forEach(testGroup => {
        (testGroup.entries || []).forEach(entry => {
          if (entry.deletedBy) {
            deleted.push({ ...entry, testName: testGroup.testName, recordId: investigationDataRow.id });
          }
        });
      });
    }
    // Sort by most recent deletion
    return deleted.sort((a, b) => new Date(b.deletedAt || '').getTime() - new Date(a.deletedAt || '').getTime());
  }, [investigationDataRow]);


  return (
    <div className="container mx-auto px-4 py-6">
      {/* Forms and other components */}
      <Card className="mb-8 shadow">
        <CardHeader className="bg-slate-50">
          <div className="flex justify-between items-center">
            <CardTitle>Add New Investigations</CardTitle>
            {deletedInvestigationEntries.length > 0 && (
              <Dialog open={showDeletedHistory} onOpenChange={setShowDeletedHistory}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    aria-label="View deleted history"
                  >
                    <History className="h-4 w-4" /> {/* History icon */}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-gray-600" /> Deleted Investigation Entries History
                    </DialogTitle>
                    <DialogDescription>
                      View individual investigation entries that were previously deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {deletedInvestigationEntries.length === 0 ? (
                      <p className="text-center text-gray-500">No deleted entries found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Test Name</TableHead>
                            <TableHead>Original Value</TableHead>
                            <TableHead>Deleted By</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead>Original Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedInvestigationEntries.map((entry, index) => (
                            <TableRow key={entry.tempId}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{entry.testName}</TableCell>
                              <TableCell>
                                {entry.type === 'text' ? entry.value : <ImgBtn url={entry.value} />}
                              </TableCell>
                              <TableCell>{entry.deletedBy || 'N/A'}</TableCell>
                              <TableCell>
                                {entry.deletedAt ? format(new Date(entry.deletedAt), "MMM dd, yyyy hh:mm a") : 'N/A'}
                              </TableCell>
                              <TableCell>
                                {format(new Date(entry.dateTime), "MMM dd, yyyy hh:mm a")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 py-6">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 bg-slate-50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Test {index + 1}</h3>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        remove(index);
                        delete fileRefs.current[index];
                        setImgPreviews((prev) => {
                          const newPrev = { ...prev };
                          delete newPrev[index];
                          return newPrev;
                        });
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium">Test Name</label>
                    <Select
                      value={watchedTests[index]?.testName || ""}
                      onValueChange={(value) => setValue(`tests.${index}.testName`, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Test" />
                      </SelectTrigger>
                      <SelectContent>
                        {testOptions.map((test) => (
                          <SelectItem key={test} value={test}>
                            {test}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {watchedTests[index]?.entryType === "text" && (
                    <div>
                      <label className="text-sm font-medium">Test Value</label>
                      <Input type="text" {...register(`tests.${index}.value`)} placeholder="Enter test value" />
                    </div>
                  )}
                </div>
                {watchedTests[index]?.testName === "Custom" && (
                  <div className="mb-4">
                    <label className="text-sm font-medium">Custom Test Name</label>
                    <Input {...register(`tests.${index}.customTestName`)} placeholder="Enter custom test name" />
                  </div>
                )}
                <div className="mb-4">
                  <label className="text-sm font-medium">Date & Time</label>
                  <Input type="datetime-local" {...register(`tests.${index}.dateTime`)} />
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium">Entry Type</label>
                  <div className="flex space-x-6 mt-1">
                    {["text", "image"].map((type) => (
                      <label key={type} className="flex items-center">
                        <input 
                          type="radio" 
                          value={type} 
                          {...register(`tests.${index}.entryType`)} 
                          className="mr-2"
                          onChange={() => setValue(`tests.${index}.entryType`, type as "image" | "text")} // Explicit onChange
                        />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                {watchedTests[index]?.entryType === "image" && (
                  <div className="mt-4">
                    <label className="text-sm font-medium">Upload Image</label>
                    <Input
                      type="file"
                      accept="image/*"
                      {...register(`tests.${index}.image`)}
                      ref={(el) => {
                        register(`tests.${index}.image`).ref(el);
                        fileRefs.current[index] = el;
                      }}
                      onChange={(e) => preview(e, index)}
                      disabled={isUploading}
                    />
                    {isUploading && <p className="text-xs mt-1">{uploadPct}%</p>}
                    {imgPreviews[index] && (
                      <img src={imgPreviews[index] || "/placeholder.svg"} className="h-24 mt-2 rounded" alt="Preview" />
                    )}
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append({
                  testName: "",
                  customTestName: "",
                  dateTime: new Date().toISOString().slice(0, 16),
                  value: "",
                  entryType: "text",
                })
              }
              className="w-full"
            >
              <Plus size={16} className="mr-2" />
              Add Another Test
            </Button>
            <Button type="submit" disabled={isUploading} className="w-full">
              {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add All Investigations
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold mb-2">Investigation Records</h2>
      {isLoading ? (
        <p>Loading…</p>
      ) : activeInvestigations.length === 0 ? (
        <p>No active records.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="w-full text-sm border">
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="border px-4 py-2">Test</TableHead>
                <TableHead className="border px-4 py-2">Date & Time</TableHead>
                <TableHead className="border px-4 py-2">Value / Image</TableHead>
                <TableHead className="border px-4 py-2">Entered By</TableHead> {/* NEW COLUMN */}
                <TableHead className="border px-4 py-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeInvestigations.map((rec) => {
                const hasImg = rec.entries.some((e) => e.type === "image" && !e.deletedBy); // Check active images
                return (
                  <React.Fragment key={rec.testName}> {/* Key by testName now */}
                    {rec.entries.map((e, i) => (
                      <TableRow key={`${rec.testName}-${e.tempId}`} className="odd:bg-slate-50 hover:bg-slate-100">
                        {i === 0 && (
                          <TableCell className="border px-4 py-2 align-top" rowSpan={rec.entries.length}>
                            <div className="font-medium">{rec.testName}</div> {/* Use testName from TestGroupInJson */}
                            {investigationDataRow?.entered_by && investigationDataRow.entered_by.length > 0 && ( // Display overall entered_by from main row
                              <p className="text-xs text-slate-500 mt-1">
                                Main Record By: {investigationDataRow.entered_by.join(", ")}
                              </p>
                            )}
                            {hasImg && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center text-xs mt-2"
                                onClick={() => {
                                  setSelectedRecForGallery(rec); // Pass the test group
                                  setGalleryOpen(true);
                                }}
                              >
                                <Eye size={14} className="mr-1" />
                                Gallery
                              </Button>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="border px-4 py-2">{format(new Date(e.dateTime), "PPpp")}</TableCell>
                        <TableCell className="border px-4 py-2">
                          {e.type === "text" ? <span className="font-medium">{e.value}</span> : <ImgBtn url={e.value} />}
                        </TableCell>
                        <TableCell className="border px-4 py-2">{e.enteredBy}</TableCell> {/* Individual entry enteredBy */}
                        <TableCell className="border px-4 py-2 align-top">
                          <div className="flex flex-col gap-2"> {/* Use flex column for buttons */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAddRowTestName(rec.testName); // Pass the testName
                                setAddFormImgPreview(null);
                                resetAdd({
                                  dateTime: new Date().toISOString().slice(0, 16),
                                  value: "",
                                  entryType: "text",
                                });
                              }}
                            >
                              Add More
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteEntry(rec.testName, e.tempId)} // Pass testName and tempId
                            >
                                <Trash2 size={16} className="mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Add new entry form row */}
                    {addRowTestName === rec.testName && ( // Show form if testName matches
                      <TableRow className="bg-slate-100">
                        <TableCell colSpan={5} className="p-4">
                          <form className="space-y-4" onSubmit={hAdd(onSubmitAdd)}>
                            <div className="flex flex-col md:flex-row gap-4">
                              <Input type="datetime-local" {...rAdd("dateTime")} className="flex-1" />
                              <div className="flex-1 flex space-x-6">
                                {["text", "image"].map((t) => (
                                  <label key={t} className="flex items-center">
                                    <input
                                      type="radio"
                                      value={t}
                                      {...rAdd("entryType")}
                                      onChange={() => setValAdd("entryType", t as "image" | "text")}
                                      checked={entryTypeAdd === t}
                                      className="mr-2"
                                    />
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                  </label>
                                ))}
                              </div>
                            </div>
                            {entryTypeAdd === "text" ? (
                              <Input type="text" {...rAdd("value")} placeholder="Value" />
                            ) : (
                              <>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  {...rAdd("image")}
                                  ref={(el) => {
                                    rAdd("image").ref(el);
                                    addFileRef.current = el;
                                  }}
                                  onChange={previewAdd}
                                  disabled={isUploading}
                                />
                                {isUploading && <p className="text-xs">{uploadPct}%</p>}
                                {addFormImgPreview && (
                                  <img src={addFormImgPreview} className="h-20 rounded mt-2" alt="Add more preview" />
                                )}
                              </>
                            )}
                            <div className="flex space-x-2">
                              <Button size="sm" type="submit" disabled={isUploading}>
                                {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setAddRowTestName(null);
                                  setAddFormImgPreview(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Image Gallery Dialog */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>{selectedRecForGallery?.testName} – Images</span> {/* Use testName */}
              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
                disabled={pdfBusy}
                onClick={generatePDF}
              >
                <Download size={14} className="mr-1" />
                {pdfBusy ? "Generating PDF..." : "Download All Images PDF"}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedRecForGallery && (
            <Carousel className="w-full">
              <CarouselContent>
                {selectedRecForGallery.entries
                  .filter((e) => e.type === "image" && !e.deletedBy) // Filter for active images
                  .sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime))
                  .map((e, i) => (
                    <CarouselItem key={e.tempId}> {/* Use tempId for key */}
                      <div className="p-1">
                        <img
                          src={e.value || "/placeholder.svg"}
                          className="max-h-[60vh] w-full object-contain cursor-pointer"
                          onClick={() => setFullImg(e.value)}
                          alt={`Investigation image ${i + 1}`}
                        />
                        <p className="text-center text-sm text-gray-600 mt-2">{format(new Date(e.dateTime), "PPpp")}</p>
                        <p className="text-center text-xs text-gray-500">Entered by: {e.enteredBy}</p>
                      </div>
                    </CarouselItem>
                  ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-screen Image View Dialog */}
      <Dialog open={!!fullImg} onOpenChange={(o) => !o && setFullImg(null)}>
        <DialogContent className="max-w-7xl h-[90vh] flex items-center justify-center p-0 bg-black/80 border-none">
          <div className="relative w-full h-full flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70"
              onClick={() => setFullImg(null)}
            >
              <X />
            </Button>
            {fullImg && <img src={fullImg || "/placeholder.svg"} className="max-w-full max-h-full object-contain" alt="Full screen investigation" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}