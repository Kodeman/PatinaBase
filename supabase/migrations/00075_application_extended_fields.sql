-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Extended Application Fields
-- Description: Adds PRD-mandated fields to both application tables.
--   Designer: location, sourcing_process
--   Maker:    location, materials, trade_program
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE founding_designer_applications
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS sourcing_process TEXT;

ALTER TABLE maker_applications
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS materials TEXT,
  ADD COLUMN IF NOT EXISTS trade_program TEXT;
