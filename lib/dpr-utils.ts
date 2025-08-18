import jsPDF from 'jspdf'
import 'jspdf-autotable'

// Types for export data
export interface DPRExportData {
  date: string
  kpiData: {
    totalOPDAppointments: number
    totalIPDAdmissions: number
    totalDischarges: number
    newPatientRegistrations: number
    bedOccupancyRate: number
    doctorsOnDuty: number
    totalRevenue: number
    emergencyCases: number
  }
  doctorPerformance: Array<{
    doctorName: string
    department: string
    patientCount: number
    consultationTime: number
    feedbackScore: number
    noShows: number
  }>
  bedManagement: Array<{
    wardName: string
    totalBeds: number
    occupiedBeds: number
    availableBeds: number
    occupancyRate: number
  }>
  patientStats: {
    totalInPatients: number
    totalOutPatients: number
    readmissions: number
    emergencyCases: number
    newRegistrations: number
  }
  revenueData: {
    opdRevenue: number
    ipdRevenue: number
    pharmacyRevenue: number
    labRevenue: number
    totalRevenue: number
  }
  adminActivities: Array<{
    action: string
    user: string
    timestamp: string
    details: string
  }>
}

export const exportDPRToPDF = (data: DPRExportData) => {
  const doc = new jsPDF()
  
  // Add title
  doc.setFontSize(20)
  doc.text('Daily Performance Report', 20, 20)
  
  // Add date
  doc.setFontSize(12)
  doc.text(`Date: ${data.date}`, 20, 35)
  
  // Add KPI section
  doc.setFontSize(16)
  doc.text('Key Performance Indicators', 20, 50)
  
  doc.setFontSize(10)
  const kpiData = [
    ['OPD Appointments', data.kpiData.totalOPDAppointments.toString()],
    ['IPD Admissions', data.kpiData.totalIPDAdmissions.toString()],
    ['Discharges', data.kpiData.totalDischarges.toString()],
    ['New Patients', data.kpiData.newPatientRegistrations.toString()],
    ['Bed Occupancy Rate', `${data.kpiData.bedOccupancyRate}%`],
    ['Doctors on Duty', data.kpiData.doctorsOnDuty.toString()],
    ['Total Revenue', `₹${data.kpiData.totalRevenue.toLocaleString()}`],
    ['Emergency Cases', data.kpiData.emergencyCases.toString()]
  ]
  
  ;(doc as any).autoTable({
    startY: 60,
    head: [['Metric', 'Value']],
    body: kpiData,
    theme: 'grid'
  })
  
  // Add Doctor Performance section
  doc.setFontSize(16)
  doc.text('Doctor Performance Summary', 20, (doc as any).lastAutoTable.finalY + 20)
  
  const doctorData = data.doctorPerformance.map(doc => [
    doc.doctorName,
    doc.department,
    doc.patientCount.toString(),
    `${doc.consultationTime} min`,
    `${doc.feedbackScore}%`,
    doc.noShows.toString()
  ])
  
  ;(doc as any).autoTable({
    startY: (doc as any).lastAutoTable.finalY + 30,
    head: [['Doctor', 'Department', 'Patients', 'Avg. Consultation', 'Feedback Score', 'No Shows']],
    body: doctorData,
    theme: 'grid'
  })
  
  // Add Bed Management section
  doc.setFontSize(16)
  doc.text('Bed Management Overview', 20, (doc as any).lastAutoTable.finalY + 20)
  
  const bedData = data.bedManagement.map(ward => [
    ward.wardName,
    ward.totalBeds.toString(),
    ward.occupiedBeds.toString(),
    ward.availableBeds.toString(),
    `${ward.occupancyRate}%`
  ])
  
  ;(doc as any).autoTable({
    startY: (doc as any).lastAutoTable.finalY + 30,
    head: [['Ward', 'Total Beds', 'Occupied', 'Available', 'Occupancy Rate']],
    body: bedData,
    theme: 'grid'
  })
  
  // Add Revenue section
  doc.setFontSize(16)
  doc.text('Revenue Breakdown', 20, (doc as any).lastAutoTable.finalY + 20)
  
  const revenueData = [
    ['OPD Revenue', `₹${data.revenueData.opdRevenue.toLocaleString()}`],
    ['IPD Revenue', `₹${data.revenueData.ipdRevenue.toLocaleString()}`],
    ['Pharmacy Revenue', `₹${data.revenueData.pharmacyRevenue.toLocaleString()}`],
    ['Lab Revenue', `₹${data.revenueData.labRevenue.toLocaleString()}`],
    ['Total Revenue', `₹${data.revenueData.totalRevenue.toLocaleString()}`]
  ]
  
  ;(doc as any).autoTable({
    startY: (doc as any).lastAutoTable.finalY + 30,
    head: [['Category', 'Amount']],
    body: revenueData,
    theme: 'grid'
  })
  
  // Add Activity Log section
  doc.setFontSize(16)
  doc.text('Admin Activity Log', 20, (doc as any).lastAutoTable.finalY + 20)
  
  const activityData = data.adminActivities.map(activity => [
    activity.timestamp,
    activity.action,
    activity.user,
    activity.details
  ])
  
  ;(doc as any).autoTable({
    startY: (doc as any).lastAutoTable.finalY + 30,
    head: [['Time', 'Action', 'User', 'Details']],
    body: activityData,
    theme: 'grid'
  })
  
  // Save the PDF
  doc.save(`DPR_${data.date}.pdf`)
}

export const exportDPRToExcel = (data: DPRExportData) => {
  // This would typically use a library like xlsx
  // For now, we'll create a CSV-like structure that can be opened in Excel
  
  let csvContent = 'Daily Performance Report\n'
  csvContent += `Date: ${data.date}\n\n`
  
  // KPI Section
  csvContent += 'Key Performance Indicators\n'
  csvContent += 'Metric,Value\n'
  csvContent += `OPD Appointments,${data.kpiData.totalOPDAppointments}\n`
  csvContent += `IPD Admissions,${data.kpiData.totalIPDAdmissions}\n`
  csvContent += `Discharges,${data.kpiData.totalDischarges}\n`
  csvContent += `New Patients,${data.kpiData.newPatientRegistrations}\n`
  csvContent += `Bed Occupancy Rate,${data.kpiData.bedOccupancyRate}%\n`
  csvContent += `Doctors on Duty,${data.kpiData.doctorsOnDuty}\n`
  csvContent += `Total Revenue,₹${data.kpiData.totalRevenue}\n`
  csvContent += `Emergency Cases,${data.kpiData.emergencyCases}\n\n`
  
  // Doctor Performance Section
  csvContent += 'Doctor Performance Summary\n'
  csvContent += 'Doctor,Department,Patients,Avg. Consultation,Feedback Score,No Shows\n'
  data.doctorPerformance.forEach(doc => {
    csvContent += `${doc.doctorName},${doc.department},${doc.patientCount},${doc.consultationTime} min,${doc.feedbackScore}%,${doc.noShows}\n`
  })
  csvContent += '\n'
  
  // Bed Management Section
  csvContent += 'Bed Management Overview\n'
  csvContent += 'Ward,Total Beds,Occupied,Available,Occupancy Rate\n'
  data.bedManagement.forEach(ward => {
    csvContent += `${ward.wardName},${ward.totalBeds},${ward.occupiedBeds},${ward.availableBeds},${ward.occupancyRate}%\n`
  })
  csvContent += '\n'
  
  // Revenue Section
  csvContent += 'Revenue Breakdown\n'
  csvContent += 'Category,Amount\n'
  csvContent += `OPD Revenue,₹${data.revenueData.opdRevenue}\n`
  csvContent += `IPD Revenue,₹${data.revenueData.ipdRevenue}\n`
  csvContent += `Pharmacy Revenue,₹${data.revenueData.pharmacyRevenue}\n`
  csvContent += `Lab Revenue,₹${data.revenueData.labRevenue}\n`
  csvContent += `Total Revenue,₹${data.revenueData.totalRevenue}\n\n`
  
  // Activity Log Section
  csvContent += 'Admin Activity Log\n'
  csvContent += 'Time,Action,User,Details\n'
  data.adminActivities.forEach(activity => {
    csvContent += `${activity.timestamp},${activity.action},${activity.user},${activity.details}\n`
  })
  
  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `DPR_${data.date}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const shareDPRByEmail = (data: DPRExportData) => {
  const subject = `Daily Performance Report - ${data.date}`
  const body = `
Daily Performance Report for ${data.date}

Key Metrics:
- OPD Appointments: ${data.kpiData.totalOPDAppointments}
- IPD Admissions: ${data.kpiData.totalIPDAdmissions}
- Total Revenue: ₹${data.kpiData.totalRevenue.toLocaleString()}
- Bed Occupancy Rate: ${data.kpiData.bedOccupancyRate}%

Please find the detailed report attached.

Best regards,
Hospital Management System
  `.trim()
  
  const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(mailtoLink)
} 