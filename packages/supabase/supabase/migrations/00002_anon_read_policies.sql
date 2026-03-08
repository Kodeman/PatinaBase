-- ═══════════════════════════════════════════════════════════════════════════
-- ANONYMOUS READ ACCESS POLICIES
-- Allow public read access to styles, products, vendors for portal browsing
-- ═══════════════════════════════════════════════════════════════════════════

-- Styles: Public read access (anyone can browse styles)
CREATE POLICY "Allow anon read access to styles"
    ON styles FOR SELECT
    TO anon
    USING (true);

-- Products: Public read access (anyone can browse products)
CREATE POLICY "Allow anon read access to products"
    ON products FOR SELECT
    TO anon
    USING (true);

-- Vendors: Public read access (anyone can see vendor info)
CREATE POLICY "Allow anon read access to vendors"
    ON vendors FOR SELECT
    TO anon
    USING (true);

-- Product styles: Public read access (for filtering by style)
CREATE POLICY "Allow anon read access to product_styles"
    ON product_styles FOR SELECT
    TO anon
    USING (true);

-- Projects: Keep authenticated-only (private to designers)
-- No changes needed

-- Client profiles: Keep authenticated-only (private)
-- No changes needed
