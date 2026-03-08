-- Fix: teaching_queue has no INSERT policy, causing [42501] when
-- the auto_add_to_teaching_queue trigger fires on product creation.
--
-- Two fixes applied:
-- 1. Make the trigger function SECURITY DEFINER so it bypasses RLS
-- 2. Add an INSERT policy for direct inserts by authenticated users

-- Fix the trigger function to use SECURITY DEFINER
CREATE OR REPLACE FUNCTION add_product_to_teaching_queue()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO teaching_queue (product_id, status, priority)
    VALUES (NEW.id, 'pending', 'normal')
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also add an INSERT policy for completeness
CREATE POLICY "Authenticated users can insert teaching queue items"
    ON teaching_queue FOR INSERT
    TO authenticated
    WITH CHECK (true);
