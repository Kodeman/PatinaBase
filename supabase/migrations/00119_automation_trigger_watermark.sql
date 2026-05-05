-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Automation Trigger Watermark
-- Description: Adds last_triggered_at to automated_sequences so the
--   automation-processor can sweep for new trigger matches incrementally
--   instead of re-scanning history every run.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE automated_sequences
  ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

COMMENT ON COLUMN automated_sequences.last_triggered_at IS
  'Highest created_at / last_active_at watermark observed at the previous trigger sweep. The automation-processor only considers candidates strictly newer than this.';
