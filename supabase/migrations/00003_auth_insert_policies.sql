-- ═══════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED INSERT POLICIES
-- Ensure inserts require authentication and validate captured_by field
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop any existing anon insert policy on products (if exists)
DROP POLICY IF EXISTS "Allow anon insert to products" ON products;

-- Drop the broad "all" policy for products to replace with specific policies
DROP POLICY IF EXISTS "Allow authenticated access to products" ON products;

-- Products: Authenticated users can read all products
CREATE POLICY "Authenticated users can read products"
    ON products FOR SELECT
    TO authenticated
    USING (true);

-- Products: Authenticated users can insert their own products
-- Validates that captured_by matches the authenticated user's ID
CREATE POLICY "Authenticated users can insert own products"
    ON products FOR INSERT
    TO authenticated
    WITH CHECK (captured_by = auth.uid());

-- Products: Users can update their own products
CREATE POLICY "Users can update own products"
    ON products FOR UPDATE
    TO authenticated
    USING (captured_by = auth.uid())
    WITH CHECK (captured_by = auth.uid());

-- Products: Users can delete their own products
CREATE POLICY "Users can delete own products"
    ON products FOR DELETE
    TO authenticated
    USING (captured_by = auth.uid());

-- ─── PRODUCT STYLES ──────────────────────────────────────────────────────────

-- Drop broad policy to replace with specific ones
DROP POLICY IF EXISTS "Allow authenticated access to product_styles" ON product_styles;

-- Product styles: Authenticated users can read all
CREATE POLICY "Authenticated users can read product_styles"
    ON product_styles FOR SELECT
    TO authenticated
    USING (true);

-- Product styles: Authenticated users can insert with their ID
CREATE POLICY "Authenticated users can insert own product_styles"
    ON product_styles FOR INSERT
    TO authenticated
    WITH CHECK (assigned_by = auth.uid());

-- Product styles: Users can update their own assignments
CREATE POLICY "Users can update own product_styles"
    ON product_styles FOR UPDATE
    TO authenticated
    USING (assigned_by = auth.uid())
    WITH CHECK (assigned_by = auth.uid());

-- Product styles: Users can delete their own assignments
CREATE POLICY "Users can delete own product_styles"
    ON product_styles FOR DELETE
    TO authenticated
    USING (assigned_by = auth.uid());

-- ─── PRODUCT RELATIONS ───────────────────────────────────────────────────────

-- Drop broad policy to replace with specific ones
DROP POLICY IF EXISTS "Allow authenticated access to product_relations" ON product_relations;

-- Product relations: Authenticated users can read all
CREATE POLICY "Authenticated users can read product_relations"
    ON product_relations FOR SELECT
    TO authenticated
    USING (true);

-- Product relations: Authenticated users can insert with their ID
CREATE POLICY "Authenticated users can insert own product_relations"
    ON product_relations FOR INSERT
    TO authenticated
    WITH CHECK (assigned_by = auth.uid());

-- Product relations: Users can update their own relations
CREATE POLICY "Users can update own product_relations"
    ON product_relations FOR UPDATE
    TO authenticated
    USING (assigned_by = auth.uid())
    WITH CHECK (assigned_by = auth.uid());

-- Product relations: Users can delete their own relations
CREATE POLICY "Users can delete own product_relations"
    ON product_relations FOR DELETE
    TO authenticated
    USING (assigned_by = auth.uid());
