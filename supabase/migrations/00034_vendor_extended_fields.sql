-- ═══════════════════════════════════════════════════════════════════════════
-- VENDOR EXTENDED FIELDS
-- Adds columns used by the Chrome extension vendor capture flow
-- ═══════════════════════════════════════════════════════════════════════════

-- hero_image_url: Large banner/hero image from the vendor's website
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

-- social_links: Social media profile URLs (Instagram, Pinterest, Facebook, etc.)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- brand_story: Structured narrative about the vendor (mission, philosophy, history, craftsmanship)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS brand_story JSONB;

-- made_in: Country/region of manufacture (e.g., "USA", "Italy", "North Carolina")
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS made_in TEXT;
