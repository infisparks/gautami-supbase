// lib/shared-types.ts

// Define IDoctor consistently as number for 'id'
export interface IDoctor {
    id: number; // Assuming bigint in DB, so number in TS
    name: string;
    specialist: string;
    department: "OPD" | "IPD" | "Both";
    opdCharge?: number;
    ipdCharges?: Record<string, number>;
  }
  
  // Define ParsedServiceItem consistently
  export interface ParsedServiceItem {
    id: string;
    serviceName: string;
    quantity: number;
    amount: number;
    doctorName?: string; // Optional for consultant services
    type: "service" | "doctorvisit"; // Must match type in ServiceDetailItemSupabase
  }
  
  // MasterServiceOption (still defined in BillingPage for now, but consider moving if used elsewhere)
  // export interface MasterServiceOption {
  //   value: string; // MasterService.id (UUID, string)
  //   label: string;
  //   amount: number;
  //   is_consultant?: boolean; // Now optional if column dropped
  //   doctor_id?: number | null; // Now optional if column dropped
  // }