// lib/shared-types.ts

// IDoctor (already used in your Billing page, keep consistent)
export interface IDoctor {
    id: number;
    name: string;
    specialist: string | null;
    department: string | null;
    opdCharge: number | null;
    ipdCharges: { [roomType: string]: number } | null;
}

// ParsedServiceItem (from your BulkServiceModal, keep consistent)
export interface ParsedServiceItem {
    serviceName: string;
    amount: number;
    quantity: number;
    type: "service" | "doctorvisit"; // Or "other" as needed
    doctorName?: string; // For doctor visits
}

// Interface for InvestigationRecord entries within JSONB
export interface InvestigationEntry {
    dateTime: string;
    value: string; // The text value or the image URL
    type: "text" | "image";
}

// Interface for a single investigation record as stored/fetched
export interface InvestigationRecordSupabase {
    id: string; // UUID of the record in DB
    ipd_id: number;
    uhid: string;
    test_name: string;
    entries: InvestigationEntry[]; // JSONB column
    entered_by: string;
    created_at: string;
}

// Define the structure of a single doctor visit item for the DoctorVisitsTab
export interface DoctorVisitSupabase {
    id: string; // UUID from Supabase
    ipd_id: number;
    uhid: string;
    doctor_name: string;
    visit_date_time: string; // ISO string
    entered_by: string;
    created_at: string;
}

// Define the structure of a single glucose reading item for the GlucoseMonitoringTab
export interface GlucoseReadingSupabase {
    id: string; // UUID from Supabase
    ipd_id: number;
    uhid: string;
    blood_sugar: string;
    urine_sugar_ketone: string;
    medication: string | null;
    dose: string | null;
    ordered_by: string | null;
    staff_or_nurse: string | null;
    entered_by: string;
    timestamp: string; // ISO string
    created_at: string;
}

// Define the structure of a single nurse note item for the NurseNoteTab
export interface NurseNoteSupabase {
    id: string; // UUID from Supabase
    ipd_id: number;
    uhid: string;
    observation: string;
    entered_by: string;
    timestamp: string; // ISO string
    created_at: string;
}

// For patient info passed to tabs
export interface PatientMinimalInfo {
    ipdId: string;
    uhid: string;
    name: string;
    patient_id: number; // Patient_detail's ID
}