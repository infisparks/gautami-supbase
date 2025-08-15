"use client"

import { jsPDF } from "jspdf"
import { format } from "date-fns"
import { toWords } from "number-to-words"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IFormInput } from "../app/opd/types" // Import AgeUnit

interface DoctorLite {
  id: string
  name: string
}

interface BillGeneratorProps {
  appointmentData: IFormInput
  appointmentId?: string // This is the opd_id which will act as bill number
  patientId?: string
  doctors?: DoctorLite[] // for resolving name from id
  className?: string
}

export function BillGenerator({
  appointmentData,
  appointmentId, // Renamed from appointmentId to billNo for clarity in PDF
  patientId,
  doctors = [],
  className = "",
}: BillGeneratorProps) {
  // Helper to map doctor ID to name
  const getDoctorNameById = (doctorId: string): string => {
    if (!doctorId) return "-"
    const doc = doctors.find((d) => d.id === doctorId)
    return doc ? doc.name : doctorId
  }

  const commonPdfGenerationLogic = async (doc: jsPDF, billNo?: string) => {
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
    } catch {
      // no letterhead
    }

    let yPos = 48

    // Bill No. and Date/Time on top-right
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")

    // Place Bill No. here, slightly adjusted for better alignment with content
    if (billNo) {
      doc.text(`Bill No: ${billNo}`, pageWidth - 20, yPos, { align: "right" })
      yPos += 4 // Increment yPos after Bill No.
    }

    doc.text(
      `Date: ${format(appointmentData.date, "dd/MM/yyyy")} | Time: ${appointmentData.time}`,
      pageWidth - 20,
      yPos,
      { align: "right" },
    )
    yPos += 8

    // Patient Info header
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 248, 255)
    doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
    doc.text("PATIENT INFORMATION", 22, yPos + 2)
    yPos += 10

    // Info columns
    const leftX = 22
    // Adjust rightX to align with the left column's content starting point
    // A good starting point might be leftX + 50 or similar, or calculate precisely.
    // For now, let's set it to align vertically with the start of 'Name:'
    const rightX = leftX + 95; // Adjusted to align more horizontally with left column. Experiment with this value.
    const rightValueXOffset = 18; // Same offset for value as left column

    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")

    const writePair = (label: string, value: string, xOffset = 0, initialY = yPos) => {
      doc.setFont("helvetica", "bold")
      doc.text(label, leftX + xOffset, initialY)
      doc.setFont("helvetica", "normal")
      // Ensure value is explicitly a string here
      doc.text(String(value), leftX + 18 + xOffset, initialY)
      return initialY + 5
    }

    let currentYLeft = yPos;
    // Explicitly convert values to string to prevent `doc.text` from failing on null/undefined
    currentYLeft = writePair("Name:", String(appointmentData.name || '-'), 0, currentYLeft);
    currentYLeft = writePair("Phone:", String(appointmentData.phone || '-'), 0, currentYLeft);
    currentYLeft = writePair(
      "Gender:",
      appointmentData.gender ? appointmentData.gender.charAt(0).toUpperCase() + appointmentData.gender.slice(1) : "-",
      0,
      currentYLeft
    );

    // Now for the right column, start at the same y-position as the left column's first item,
    // and increment its own y-position independently.
    let currentYRight = yPos; // Start right column at the same height as the left column

    if (patientId) {
        doc.setFont("helvetica", "bold");
        doc.text("UHID:", rightX, currentYRight);
        doc.setFont("helvetica", "normal");
        doc.text(String(patientId), rightX + rightValueXOffset, currentYRight);
        currentYRight += 5;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Age:", rightX, currentYRight);
    doc.setFont("helvetica", "normal");
    doc.text(`${String(appointmentData.age ?? "-")} ${String(appointmentData.ageUnit || "years")}`, rightX + rightValueXOffset, currentYRight);
    currentYRight += 5;

    // Ensure the main yPos continues from the lowest point of either column
    yPos = Math.max(currentYLeft, currentYRight) + 5;


    // Table header
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(220, 220, 220)
    doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
    doc.text("No.", 22, yPos + 1)
    doc.text("Service", 32, yPos + 1)
    doc.text("Doctor/Specialist", 75, yPos + 1)
    doc.text("Details", 125, yPos + 1)
    doc.text("Amount", pageWidth - 22, yPos + 1, { align: "right" })
    yPos += 7

    doc.setFont("helvetica", "normal")
    let totalCharges = 0
    appointmentData.modalities?.forEach((m, i) => {
      if (yPos > pageHeight - 50) {
        doc.addPage()
        try {
          doc.addImage("/letterhead.png", "PNG", 0, 0, pageWidth, pageHeight)
        } catch {}
        yPos = 30 // Reset yPos for new page
        // Re-draw table header on new page
        doc.setFontSize(8)
        doc.setFont("helvetica", "bold")
        doc.setFillColor(220, 220, 220)
        doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
        doc.text("No.", 22, yPos + 1)
        doc.text("Service", 32, yPos + 1)
        doc.text("Doctor/Specialist", 75, yPos + 1)
        doc.text("Details", 125, yPos + 1)
        doc.text("Amount", pageWidth - 22, yPos + 1, { align: "right" })
        yPos += 7
        doc.setFont("helvetica", "normal")
      }

      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250)
        doc.rect(20, yPos - 1, pageWidth - 40, 4, "F")
      }
      const svc = m.type.charAt(0).toUpperCase() + m.type.slice(1)
      const docName = getDoctorNameById(m.doctor || "")
      const details = m.service || m.specialist || "-"
      const amt = m.charges || 0
      doc.text(String(i + 1), 22, yPos + 1)
      doc.text(svc.length > 15 ? `${svc.slice(0, 15)}…` : svc, 32, yPos + 1)
      doc.text(docName.length > 18 ? `${docName.slice(0, 18)}…` : docName, 75, yPos + 1)
      doc.text(details.length > 20 ? `${details.slice(0, 20)}…` : details, 125, yPos + 1)
      doc.text(`Rs. ${amt}`, pageWidth - 22, yPos + 1, { align: "right" })
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
    doc.text(`Rs. ${totalCharges}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 4

    if (discount > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(200, 0, 0)
      doc.text("Discount:", sx - 35, yPos)
      doc.setFont("helvetica", "normal")
      doc.text(`Rs. ${discount}`, pageWidth - 22, yPos, { align: "right" })
      doc.setTextColor(0, 0, 0)
      yPos += 4
    }

    doc.setDrawColor(0, 0, 0)
    doc.line(sx - 35, yPos, pageWidth - 20, yPos)
    yPos += 3

    doc.setFont("helvetica", "bold")
    doc.text("Net Amount:", sx - 35, yPos)
    doc.text(`Rs. ${net}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 5

    // Paid breakdown
    if (appointmentData.appointmentType === "visithospital") {
      doc.setFont("helvetica", "normal")
      const line = (lbl: string, val: number) => {
        doc.text(lbl, sx - 35, yPos)
        doc.text(`Rs. ${val}`, pageWidth - 22, yPos, { align: "right" })
        yPos += 5
      }

      if (appointmentData.paymentMethod === "mixed") {
        line("Cash Paid:", cash)
        if (appointmentData.cashThrough) {
          doc.setFontSize(7); // Smaller font for 'Via' text
          doc.text(`(Via: ${appointmentData.cashThrough.charAt(0).toUpperCase() + appointmentData.cashThrough.slice(1)})`, sx - 35, yPos - 1.5); // Adjust yPos relative to the current line
          doc.setFontSize(9); // Reset font size
          yPos += 3; // Add extra space after 'Via' line
        }
        line("Online Paid:", online)
        if (appointmentData.onlineThrough) {
          doc.setFontSize(7); // Smaller font for 'Via' text
          doc.text(`(Via: ${appointmentData.onlineThrough.charAt(0).toUpperCase() + appointmentData.onlineThrough.slice(1)})`, sx - 35, yPos - 1.5); // Adjust yPos relative to the current line
          doc.setFontSize(9); // Reset font size
          yPos += 3; // Add extra space after 'Via' line
        }
      } else if (appointmentData.paymentMethod === "cash") {
        line("Cash Paid:", cash)
        if (appointmentData.cashThrough) {
          doc.setFontSize(7);
          doc.text(`(Via: ${appointmentData.cashThrough.charAt(0).toUpperCase() + appointmentData.cashThrough.slice(1)})`, sx - 35, yPos - 1.5);
          doc.setFontSize(9);
          yPos += 3;
        }
      } else if (
        appointmentData.paymentMethod === "online" ||
        appointmentData.paymentMethod === "card-credit" ||
        appointmentData.paymentMethod === "card-debit"
      ) {
        line(appointmentData.paymentMethod === "online" ? "Online Paid:" : "Card Paid:", online)
         if (appointmentData.onlineThrough) {
            doc.setFontSize(7);
            doc.text(`(Via: ${appointmentData.onlineThrough.charAt(0).toUpperCase() + appointmentData.onlineThrough.slice(1)})`, sx - 35, yPos - 1.5);
            doc.setFontSize(9);
            yPos += 3;
         }
      }

      // Ensure the yPos for "Total Paid" is correctly calculated
      doc.setFont("helvetica", "bold")
      doc.text("Total Paid:", sx - 35, yPos)
      doc.text(`Rs. ${paid}`, pageWidth - 22, yPos, { align: "right" })
      yPos += 5 // This increments yPos for the next element (Due Amount)
    }

    // Due amount
    if (due > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(200, 0, 0)
      doc.text("Due Amount:", sx - 35, yPos)
      doc.text(`Rs. ${due}`, pageWidth - 22, yPos, { align: "right" })
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
  }

  const generatePDF = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    await commonPdfGenerationLogic(doc, appointmentId)
    const fname = `Bill_${(appointmentData.name || "patient").replace(/\s+/g, "_")}__${format(appointmentData.date, "ddMMyyyy")}.pdf`
    doc.save(fname)
  }

  const viewPDF = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    await commonPdfGenerationLogic(doc, appointmentId)
    const pdfBlob = doc.output("blob")
    const blobUrl = URL.createObjectURL(pdfBlob)

    const newWindow = window.open(blobUrl, "_blank")
    if (newWindow) {
      newWindow.focus()
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
      }, 1000)
    } else {
      alert("Please allow popups to view the bill in a new tab")
      URL.revokeObjectURL(blobUrl)
    }
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={viewPDF} className={`gap-2 ${className}`}>
        <Eye className="h-4 w-4" /> View Bill
      </Button>
      <Button type="button" variant="outline" onClick={generatePDF} className={`gap-2 ${className}`}>
        <Download className="h-4 w-4" /> Download Bill
      </Button>
    </div>
  )
}

// Utility function for programmatically opening bill PDF in a new tab
export async function openBillInNewTabProgrammatically(
  appointmentData: IFormInput,
  appointmentId?: string, // Pass opdId as appointmentId for bill number
  patientId?: string,
  doctors: DoctorLite[] = []
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  // Reuse the common logic
  await commonPdfGenerationLogic(doc, appointmentId); // Pass appointmentId as billNo

  const pdfBlob = doc.output("blob")
  const blobUrl = URL.createObjectURL(pdfBlob)
  const newWindow = window.open(blobUrl, "_blank")
  if (newWindow) {
    newWindow.focus()
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl)
    }, 1000)
  } else {
    alert("Please allow popups to view the bill in a new tab")
    URL.revokeObjectURL(blobUrl)
  }
}

function commonPdfGenerationLogic(doc: jsPDF, appointmentId: string | undefined) {
  throw new Error("Function not implemented.")
}
