# Global UHID Counter System

## Overview

This system maintains a continuous UHID sequence across all dates without resetting the counter. For example:
- Day 1: MG-070625-00001, MG-070625-00002, ..., MG-070625-00020
- Day 2: MG-070626-00021, MG-070626-00022, MG-070626-00023, ...

The counter continues incrementing infinitely, never resetting based on date changes.

## Database Setup

### 1. Run the Migration

Execute the SQL migration in your Supabase database:

```sql
-- Create a table to store the global UHID counter
CREATE TABLE IF NOT EXISTS global_uhid_counter (
    id SERIAL PRIMARY KEY,
    counter_value BIGINT NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial counter if table is empty
INSERT INTO global_uhid_counter (counter_value) 
SELECT 0 
WHERE NOT EXISTS (SELECT 1 FROM global_uhid_counter);

-- Create the function to increment the global UHID counter
CREATE OR REPLACE FUNCTION increment_global_uhid_counter()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    new_counter_value BIGINT;
BEGIN
    -- Update the counter and return the new value atomically
    UPDATE global_uhid_counter 
    SET 
        counter_value = counter_value + 1,
        last_updated = NOW()
    WHERE id = 1
    RETURNING counter_value INTO new_counter_value;
    
    -- Return the new counter value
    RETURN new_counter_value;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION increment_global_uhid_counter() TO authenticated;
GRANT SELECT, UPDATE ON global_uhid_counter TO authenticated;
```

### 2. Verify Setup

You can verify the setup by running:

```sql
-- Check if the table exists
SELECT * FROM global_uhid_counter;

-- Test the function
SELECT increment_global_uhid_counter();
```

## Usage

The `generateNextUHID()` function in `components/uhid-generator.ts` now uses the global counter:

```typescript
import { generateNextUHID } from "@/components/uhid-generator"

const result = await generateNextUHID()
if (result.success) {
    console.log("Generated UHID:", result.uhid)
} else {
    console.error("Error:", result.message)
}
```

## Example Output

- First UHID of the day: `MG-070625-00001`
- Last UHID of the day: `MG-070625-00020`
- First UHID of next day: `MG-070626-00021`
- Continues: `MG-070626-00022`, `MG-070626-00023`, etc.

## Benefits

1. **No Reset**: Counter never resets, maintaining continuous sequence
2. **Atomic Operations**: Uses PostgreSQL transactions for thread safety
3. **Scalable**: BIGINT allows for very large numbers
4. **Audit Trail**: `last_updated` timestamp tracks when counter was last used

## Migration from Date-Based Counter

If you were previously using a date-based counter system, you can migrate by:

1. Finding the highest counter value from your existing system
2. Setting the initial value in `global_uhid_counter`:

```sql
UPDATE global_uhid_counter SET counter_value = [your_highest_value] WHERE id = 1;
```

This ensures no UHID conflicts during the transition. 