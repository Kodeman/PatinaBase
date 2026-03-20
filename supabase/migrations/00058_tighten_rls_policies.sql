-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Tighten RLS Policies
-- Description: Replace overly permissive FOR ALL USING (true) policies on
--   vendors, project_products, and vendor_certifications with proper
--   ownership and role-based access controls.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── VENDORS ─────────────────────────────────────────────────────────────────
-- Previously: any authenticated user could INSERT/UPDATE/DELETE any vendor.
-- New policy: all authenticated users can read; only the product capturer who
-- first referenced a vendor (or an admin) can update; inserts remain open
-- (designers need to create vendors during product capture).

DROP POLICY IF EXISTS "Allow authenticated access to vendors" ON vendors;

-- Anyone authenticated can read vendors (catalog browsing)
CREATE POLICY "Authenticated users can read vendors"
    ON vendors FOR SELECT
    TO authenticated
    USING (true);

-- Any authenticated user can create vendors (needed during product capture)
CREATE POLICY "Authenticated users can insert vendors"
    ON vendors FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Only admins can update vendors (prevent accidental edits to shared data)
CREATE POLICY "Admins can update vendors"
    ON vendors FOR UPDATE
    TO authenticated
    USING (
        user_has_role(auth.uid(), 'super_admin')
        OR user_has_role(auth.uid(), 'quality_control')
    )
    WITH CHECK (
        user_has_role(auth.uid(), 'super_admin')
        OR user_has_role(auth.uid(), 'quality_control')
    );

-- Only admins can delete vendors
CREATE POLICY "Admins can delete vendors"
    ON vendors FOR DELETE
    TO authenticated
    USING (
        user_has_role(auth.uid(), 'super_admin')
    );

-- ─── PROJECT_PRODUCTS ────────────────────────────────────────────────────────
-- Previously: any authenticated user could add/remove products from ANY project.
-- New policy: only the project owner can manage project_products for their projects.

DROP POLICY IF EXISTS "Allow authenticated access to project_products" ON project_products;

-- Users can read project_products for projects they own
CREATE POLICY "Users can read own project products"
    ON project_products FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_products.project_id
            AND projects.created_by = auth.uid()
        )
    );

-- Users can add products to their own projects
CREATE POLICY "Users can insert into own projects"
    ON project_products FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_products.project_id
            AND projects.created_by = auth.uid()
        )
    );

-- Users can update their own project products (notes, position)
CREATE POLICY "Users can update own project products"
    ON project_products FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_products.project_id
            AND projects.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_products.project_id
            AND projects.created_by = auth.uid()
        )
    );

-- Users can remove products from their own projects
CREATE POLICY "Users can delete from own projects"
    ON project_products FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_products.project_id
            AND projects.created_by = auth.uid()
        )
    );

-- ─── VENDOR_CERTIFICATIONS ──────────────────────────────────────────────────
-- Previously: "Admin write access" policy actually allowed ALL authenticated
-- users to write. Now properly restrict to admin roles.

DROP POLICY IF EXISTS "Admin write access to vendor_certifications" ON vendor_certifications;

-- Keep existing public read policy (already SELECT-only, no change needed)

-- Admin-only write access (insert, update, delete)
CREATE POLICY "Admins can manage vendor certifications"
    ON vendor_certifications FOR ALL
    TO authenticated
    USING (
        user_has_role(auth.uid(), 'super_admin')
        OR user_has_role(auth.uid(), 'quality_control')
    )
    WITH CHECK (
        user_has_role(auth.uid(), 'super_admin')
        OR user_has_role(auth.uid(), 'quality_control')
    );
