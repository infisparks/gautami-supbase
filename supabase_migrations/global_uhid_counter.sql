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