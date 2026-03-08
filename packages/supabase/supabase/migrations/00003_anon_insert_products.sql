-- ═══════════════════════════════════════════════════════════════════════════
-- ANONYMOUS INSERT ACCESS FOR DEVELOPMENT
-- Allow anonymous users to insert products (for extension testing)
-- TODO: Remove or restrict in production
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Allow anon insert to products"
    ON products FOR INSERT
    TO anon
    WITH CHECK (true);
