// @/lib/uhid-generator.ts

import { supabase } from "@/lib/supabase"
import { format } from "date-fns"

interface GenerateUHIDResult {
  success: boolean
  uhid?: string
  message?: string
}

/**
 * Generates the next unique Hospital ID (UHID) with a continuous sequence.
 * The format is MG-MMDDYY-XXXX (e.g., MG-070625-0001).
 * The counter continues incrementing across dates without resetting.
 * It uses a PostgreSQL RPC function for atomic counter increment to ensure uniqueness.
 *
 * This function maintains a global counter that doesn't reset based on date changes.
 *
 * @returns {Promise<GenerateUHIDResult>} An object indicating success and the generated UHID or an error message.
 */
export async function generateNextUHID(): Promise<GenerateUHIDResult> {
  try {
    const today = new Date()
    const datePart = format(today, "ddMMyy") // ddmmtt format (e.g., 060725)
    const uhidPrefix = `MF-${datePart}`

    // Call the PostgreSQL RPC function to get the next global counter value
    // This function maintains a continuous sequence across all dates
    const { data: newCount, error: rpcError } = await supabase.rpc("increment_global_uhid_counter");

    if (rpcError) {
      console.error("Error incrementing global UHID counter via RPC:", rpcError);
      throw new Error(`Database error: ${rpcError.message}`);
    }

    if (typeof newCount !== 'number') {
        throw new Error("Invalid response from UHID counter function. Expected a number.");
    }

    const uhidSuffix = String(newCount).padStart(5, "0"); // e.g., 00001, 00002, 00020, 00021
    const generatedUHID = `${uhidPrefix}-${uhidSuffix}`;

    console.log(`Generated UHID: ${generatedUHID} (Global Counter: ${newCount})`);
    return { success: true, uhid: generatedUHID };

  } catch (error: any) {
    console.error("Failed to generate UHID:", error);
    return { success: false, message: `UHID generation failed: ${error.message}` };
  }
}