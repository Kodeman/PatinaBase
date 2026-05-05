-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Per-template frequency caps
-- Description: Adds two columns to email_templates so individual templates
--   (e.g. price_drop, weekly_inspiration) can define their own per-recipient
--   frequency cap, overriding the default global "3 marketing emails / 7d"
--   logic in audience.ts. NULL means: no template-specific cap; fall back
--   to global behavior.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS frequency_cap_count INTEGER
    CHECK (frequency_cap_count IS NULL OR frequency_cap_count > 0);

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS frequency_cap_window_days INTEGER
    CHECK (frequency_cap_window_days IS NULL OR frequency_cap_window_days > 0);

COMMENT ON COLUMN email_templates.frequency_cap_count IS
  'Maximum number of times this template may be delivered to the same user inside frequency_cap_window_days. NULL = no per-template cap (global cap still applies).';

COMMENT ON COLUMN email_templates.frequency_cap_window_days IS
  'Window length (days) for frequency_cap_count. NULL = no per-template cap.';

-- Sensible defaults for high-frequency templates
UPDATE email_templates SET frequency_cap_count = 1, frequency_cap_window_days = 7  WHERE slug = 'price-drop'              AND frequency_cap_count IS NULL;
UPDATE email_templates SET frequency_cap_count = 1, frequency_cap_window_days = 14 WHERE slug = 'back-in-stock'           AND frequency_cap_count IS NULL;
UPDATE email_templates SET frequency_cap_count = 1, frequency_cap_window_days = 7  WHERE slug = 'weekly-inspiration'      AND frequency_cap_count IS NULL;
UPDATE email_templates SET frequency_cap_count = 1, frequency_cap_window_days = 30 WHERE slug = 'founding-circle-update'  AND frequency_cap_count IS NULL;
UPDATE email_templates SET frequency_cap_count = 1, frequency_cap_window_days = 30 WHERE slug = 'campaign-reengagement'   AND frequency_cap_count IS NULL;
