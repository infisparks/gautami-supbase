// @/app/opd/bill-generator.tsx
"use client"

import { jsPDF } from "jspdf"
import { format } from "date-fns"
import { toWords } from "number-to-words"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IFormInput, ModalitySelection } from "../types"
import { toast } from "@/hooks/use-toast"

interface DoctorLite {
  id: string
  dr_name: string
}

// Define the arguments for the core PDF generation function
interface GeneratePdfArgs {
  appointmentData: IFormInput
  uhid: string // Patient's UHID
  doctors: DoctorLite[]
  billNo: number | null // Bill Number
}

// Core function to generate the jsPDF document
async function generatePdfDocument({ appointmentData, uhid, doctors, billNo }: GeneratePdfArgs): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Try letterhead
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = "/letterhead.png"
    })
    doc.addImage(img, "PNG", 0, 0, pageWidth, pageHeight)
  } catch (e) {
    // no letterhead
    console.warn("Letterhead image not loaded:", e)
  }

  // Helper to get doctor name from ID
  const getDoctorNameById = (doctorId: string): string => {
    if (!doctorId) return "-"
    const doc = doctors.find((d) => d.id === doctorId)
    return doc ? String(doc.dr_name) : String(doctorId) // Ensure name is string
  }

  let yPos = 53
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(
    `Date: ${format(appointmentData.date, "dd/MM/yyyy")} | Time: ${String(appointmentData.time)}`,
    pageWidth - 20,
    yPos,
    { align: "right" }
  )
  yPos += 8

  // Bill Number and UHID display
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text(`Bill No: ${String(billNo || 'N/A')}`, 20, yPos);
  doc.text(`UHID: ${String(uhid || appointmentData.uhid || '-')}`, 20, yPos + 5);
  yPos += 10;


  // Patient Info header
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(240, 248, 255)
  doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
  doc.text("PATIENT INFORMATION", 22, yPos + 2)
  yPos += 10

  // Patient Info columns (parallel)
  const leftX = 22
  const rightX = pageWidth / 2 + 20
  let leftColY = yPos

  // Name (Left)
  doc.setFont("helvetica", "bold")
  doc.text("Name:", leftX, leftColY)
  doc.setFont("helvetica", "normal")
  doc.text(String(appointmentData.name), leftX + 18, leftColY)

  // Phone (Right) - Explicitly convert to String here
  doc.setFont("helvetica", "bold")
  doc.text("Phone:", rightX, leftColY)
  doc.setFont("helvetica", "normal")
  doc.text(String(appointmentData.phone), rightX + 18, leftColY)

  leftColY += 5

  // Age (Left)
  doc.setFont("helvetica", "bold")
  doc.text("Age:", leftX, leftColY)
  doc.setFont("helvetica", "normal")
  doc.text(
    `${String(appointmentData.age ?? "-")} ${String(appointmentData.ageUnit || "years")}`,
    leftX + 18,
    leftColY
  )

  // Gender (Right)
  doc.setFont("helvetica", "bold")
  doc.text("Gender:", rightX, leftColY)
  doc.setFont("helvetica", "normal")
  doc.text(
    appointmentData.gender
      ? String(appointmentData.gender.charAt(0).toUpperCase() + appointmentData.gender.slice(1))
      : "-",
    rightX + 18,
    leftColY
  )

  leftColY += 5

  // Address (Left)
  if (appointmentData.address) {
    doc.setFont("helvetica", "bold")
    doc.text("Address:", leftX, leftColY)
    doc.setFont("helvetica", "normal")
    const addressText = String(appointmentData.address.length > 30
      ? `${appointmentData.address.slice(0, 30)}...`
      : appointmentData.address);
    doc.text(addressText, leftX + 18, leftColY);
    leftColY += 5;
  }

  // Referred By (Right)
  if (appointmentData.referredBy) {
    doc.setFont("helvetica", "bold")
    doc.text("Referred By:", rightX, leftColY)
    doc.setFont("helvetica", "normal")
    doc.text(String(appointmentData.referredBy), rightX + 25, leftColY)
    leftColY += 5
  }

  yPos = leftColY + 5 // Take the max of updated Y positions for patient info

  // Table header
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(220, 220, 220)
  doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
  doc.text("No.", 22, yPos + 1)
  doc.text("Modality", 32, yPos + 1)
  doc.text("Service/Type", 62, yPos + 1)
  doc.text("Doctor/Specialist", 105, yPos + 1)
  doc.text("Charges (Rs.)", pageWidth - 22, yPos + 1, { align: "right" })
  yPos += 7

  doc.setFont("helvetica", "normal")
  let totalCharges = 0

  appointmentData.modalities?.forEach((m: ModalitySelection, i: number) => {
    if (yPos > pageHeight - 50) {
      doc.addPage()
      try {
        const newImg = new Image()
        newImg.crossOrigin = "anonymous"
        new Promise((res) => { newImg.onload = res; newImg.src = "/letterhead.png"; })
        doc.addImage(newImg, "PNG", 0, 0, pageWidth, pageHeight)
      } catch { }
      yPos = 30
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.setFillColor(220, 220, 220)
      doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
      doc.text("No.", 22, yPos + 1)
      doc.text("Modality", 32, yPos + 1)
      doc.text("Service/Type", 62, yPos + 1)
      doc.text("Doctor/Specialist", 105, yPos + 1)
      doc.text("Charges (Rs.)", pageWidth - 22, yPos + 1, { align: "right" })
      yPos += 7
      doc.setFont("helvetica", "normal")
    }

    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(20, yPos - 1, pageWidth - 40, 4, "F")
    }

    const modalityType = String(m.type.charAt(0).toUpperCase() + m.type.slice(1))
    let serviceDetails = ""
    let doctorOrSpecialistInfo = ""
    const doctorName = getDoctorNameById(m.doctor || ""); // Get doctor name once

    if (m.type === "consultation") {
      serviceDetails = String(m.visitType ? `${m.visitType.charAt(0).toUpperCase() + m.visitType.slice(1)} Visit` : "")
      doctorOrSpecialistInfo = `${doctorName} (${String(m.specialist || 'N/A')})`
    } else if (m.type === "custom") {
      serviceDetails = String(m.service || "Custom Service")
      doctorOrSpecialistInfo = doctorName ? `Dr. ${doctorName}` : "-"
    } else {
      // For all other modalities (xray, pathology, etc.)
      serviceDetails = String(m.service || "-")
      doctorOrSpecialistInfo = doctorName ? `Dr. ${doctorName}` : "-" // Display doctor name if available
    }

    const amt = Number(m.charges) || 0
    doc.text(String(i + 1), 22, yPos + 1)
    doc.text(modalityType.length > 15 ? `${modalityType.slice(0, 15)}…` : modalityType, 32, yPos + 1)
    doc.text(serviceDetails.length > 30 ? `${serviceDetails.slice(0, 30)}…` : serviceDetails, 62, yPos + 1)
    doc.text(doctorOrSpecialistInfo.length > 25 ? `${doctorOrSpecialistInfo.slice(0, 25)}…` : doctorOrSpecialistInfo, 105, yPos + 1)
    doc.text(`Rs. ${amt.toFixed(2)}`, pageWidth - 22, yPos + 1, { align: "right" })
    totalCharges += amt
    yPos += 4
  })
  yPos += 7

  // Payment summary
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(240, 248, 255)
  doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
  doc.text("PAYMENT SUMMARY", 22, yPos + 2)
  yPos += 10
  const discount = Number(appointmentData.discount) || 0
  const cash = Number(appointmentData.cashAmount) || 0
  const online = Number(appointmentData.onlineAmount) || 0
  const paid = cash + online
  const net = totalCharges - discount
  const due = net - paid
  const sx = pageWidth - 70

  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("Total Charges:", sx - 35, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(`Rs. ${totalCharges.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
  yPos += 4

  if (discount > 0) {
    doc.setFont("helvetica", "bold")
    doc.setTextColor(200, 0, 0)
    doc.text("Discount:", sx - 35, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(`Rs. ${discount.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
    doc.setTextColor(0, 0, 0)
    yPos += 4
  }

  doc.setDrawColor(0, 0, 0)
  doc.line(sx - 35, yPos, pageWidth - 20, yPos)
  yPos += 3

  doc.setFont("helvetica", "bold")
  doc.text("Net Amount:", sx - 35, yPos)
  doc.text(`Rs. ${net.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
  yPos += 5

  // Paid breakdown
  if (appointmentData.appointmentType === "visithospital") {
    doc.setFont("helvetica", "normal")
    const line = (lbl: string, val: number) => {
      doc.text(lbl, sx - 35, yPos)
      doc.text(`Rs. ${val.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
      yPos += 5
    }
    if (String(appointmentData.paymentMethod) === "mixed") {
      line("Cash Paid:", cash)
      line("Online Paid:", online)
    } else if (String(appointmentData.paymentMethod) === "cash") {
      line("Cash Paid:", cash)
    } else if (
      String(appointmentData.paymentMethod) === "online" ||
      String(appointmentData.paymentMethod) === "card-credit" ||
      String(appointmentData.paymentMethod) === "card-debit"
    ) {
      line(String(appointmentData.paymentMethod) === "online" ? "Online Paid:" : "Card Paid:", online)
    }
    doc.setFont("helvetica", "bold")
    doc.text("Total Paid:", sx - 35, yPos)
    doc.text(`Rs. ${paid.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 5
  }

  // Due amount
  if (due > 0) {
    doc.setFont("helvetica", "bold")
    doc.setTextColor(200, 0, 0)
    doc.text("Due Amount:", sx - 35, yPos)
    doc.text(`Rs. ${due.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
    doc.setTextColor(0, 0, 0)
    yPos += 5
  }

  // Amounts in words
  doc.setFontSize(9)
  doc.setFont("helvetica", "italic")
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  yPos += 5
  doc.text(`Total Paid (in words): ${capitalize(toWords(paid))} only`, 20, yPos)
  yPos += 5
  if (due > 0) {
    doc.text(`Due Amount (in words): ${capitalize(toWords(due))} only`, 20, yPos)
    yPos += 5
  }

  // Footer
  // doc.setFontSize(8)
  // doc.text("Thank you for choosing Medford Healthcare.", 14, pageHeight - 20)
  // doc.text("This is an auto-generated bill and does not require a signature.", 14, pageHeight - 15)

  return doc
}

interface BillGeneratorProps {
  appointmentData: IFormInput
  uhid: string // This should be the UHID
  doctors?: DoctorLite[]
  billNo: number | null // Ensure billNo is passed
  className?: string
}

export function BillGenerator({
  appointmentData,
  uhid, // Changed from patientId to uhid directly
  doctors = [],
  billNo, // Destructured billNo
  className = "",
}: BillGeneratorProps) {

  // Function to generate and download PDF
  const downloadPDF = async () => {
    const doc = await generatePdfDocument({ appointmentData, uhid, doctors, billNo });
    const fileName = `Bill_${String(appointmentData.name).replace(/\s+/g, "_")}__${format(new Date(appointmentData.date), "ddMMyyyy")}.pdf`
    doc.save(fileName)
  }

  // Function to generate PDF and view in new tab
  const viewPDF = async () => {
    const doc = await generatePdfDocument({ appointmentData, uhid, doctors, billNo });
    const pdfBlob = doc.output("blob")
    const blobUrl = URL.createObjectURL(pdfBlob)

    const newWindow = window.open(blobUrl, "_blank")
    if (newWindow) {
      newWindow.focus()
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
      }, 1000) // Revoke after a short delay
    } else {
      // Replaced alert with console.error and toast for better UX
      // console.error("Failed to open new window. Pop-ups might be blocked.");
      // toast.error("Failed to open bill. Please allow pop-ups for this site.");
      URL.revokeObjectURL(blobUrl); // Revoke immediately if popup blocked
    }
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={viewPDF} className={`gap-2 ${className}`}>
        <Eye className="h-4 w-4" /> View Bill
      </Button>
      <Button type="button" variant="outline" onClick={downloadPDF} className={`gap-2 ${className}`}>
        <Download className="h-4 w-4" /> Download Bill
      </Button>
    </div>
  )
}

// Utility function for opening in new tab programmatically (export for page.tsx)
// This function will now simply call the reusable generatePdfDocument
export async function openBillInNewTabProgrammatically(
  appointmentData: IFormInput,
  uhid: string,
  doctors: DoctorLite[] = [],
  billNo: number | null // Ensure this is also passed here
) {
  try {
    const doc = await generatePdfDocument({ appointmentData, uhid, doctors, billNo });
    const pdfBlob = doc.output("blob")
    const blobUrl = URL.createObjectURL(pdfBlob)

    const newWindow = window.open(blobUrl, "_blank")
    if (newWindow) {
      newWindow.focus()
      // Revoke the Object URL when the window is closed or after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000); // Revoke after 30 seconds
    } else {
      // Replaced alert with console.error and toast for better UX
      // console.error("Failed to open new window. Pop-ups might be blocked.");
      // toast.error("Failed to open bill. Pop-ups might be blocked.");
      throw new Error("Failed to open new window. Pop-ups might be blocked.");
    }
  } catch (error) {
    console.error("Error in openBillInNewTabProgrammatically:", error);
    // toast.error(`Error generating bill: ${(error as Error).message || "Unknown error"}`);
    throw error; // Re-throw to be caught by the calling function (handleViewBill in page.tsx)
  }
}
