-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Editorial Stories (Daily Stories)
-- Description:
--   Hosts editorial content surfaced as "today's story" in the iOS DailyRoom
--   home and (future) web editorial slots. Each row is a published, curated
--   story tied to an optional featured product.
--
--   Authorization model:
--     • Public-read for `published_at <= now()` (anon + authenticated)
--     • Admin write (any authenticated user with a row in user_roles ↦
--       roles.domain = 'admin')
--
--   iOS surface: replaces the hardcoded `DailyStory.mock` in
--     apps/mobile/Patina/Patina/Core/Models/DailyStory.swift
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS editorial_stories (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Editorial metadata
  tag                  TEXT NOT NULL,                        -- e.g. "Maker Spotlight"
  title                TEXT NOT NULL,
  subtitle             TEXT,
  body_md              TEXT,                                 -- markdown body for the long-form view
  read_minutes         INTEGER NOT NULL DEFAULT 3 CHECK (read_minutes > 0),
  hero_image_url       TEXT,
  hero_gradient_key    TEXT,                                 -- iOS gradient lookup key (fallback when no image)

  -- Maker / contributor metadata
  maker_name           TEXT,
  maker_location       TEXT,
  maker_avatar_url     TEXT,
  maker_avatar_gradient_key TEXT,

  -- Optional product spotlight
  featured_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Audience targeting (simple tag list; future: per-domain filters)
  audience_tags        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Publishing controls
  published_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  sort_order           INTEGER NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE editorial_stories IS
  'Editorial / daily-story content. Public-read when published_at <= now(); admin-managed writes.';

-- ───────────────────────────────────────────────────────────────────────────
-- Indexes
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_editorial_stories_published
  ON editorial_stories(published_at DESC NULLS LAST)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editorial_stories_sort
  ON editorial_stories(sort_order, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_stories_featured_product
  ON editorial_stories(featured_product_id)
  WHERE featured_product_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ───────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS editorial_stories_set_updated_at ON editorial_stories;
CREATE TRIGGER editorial_stories_set_updated_at
  BEFORE UPDATE ON editorial_stories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE editorial_stories ENABLE ROW LEVEL SECURITY;

-- Public read of currently published stories (anon + authenticated).
-- "Published" = published_at IS NOT NULL AND published_at <= now()
--   AND (expires_at IS NULL OR expires_at > now()).
DROP POLICY IF EXISTS editorial_stories_public_read ON editorial_stories;
CREATE POLICY editorial_stories_public_read
  ON editorial_stories FOR SELECT
  USING (
    published_at IS NOT NULL
    AND published_at <= NOW()
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Admins can read everything (drafts, scheduled, expired) for editorial review.
DROP POLICY IF EXISTS editorial_stories_admin_read ON editorial_stories;
CREATE POLICY editorial_stories_admin_read
  ON editorial_stories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid()
         AND r.domain = 'admin'
    )
  );

-- Admin-only writes.
DROP POLICY IF EXISTS editorial_stories_admin_write ON editorial_stories;
CREATE POLICY editorial_stories_admin_write
  ON editorial_stories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid()
         AND r.domain = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid()
         AND r.domain = 'admin'
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Seed: a handful of real stories so the iOS DailyRoom has content out of the
-- box. Pure inserts with idempotent ON CONFLICT — safe to re-run.
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO editorial_stories (
  id, tag, title, subtitle, body_md, read_minutes,
  hero_gradient_key, maker_name, maker_location,
  maker_avatar_gradient_key, featured_product_id,
  published_at, sort_order
) VALUES
  (
    'a8b3f8a0-1111-4111-8111-1d1a1a1a1a01'::uuid,
    'Maker Spotlight',
    'The Grain Whisperer of Maine',
    'Jonathan Chilton on 40 years of listening to wood',
    'For four decades, Jonathan Chilton has been making chairs in a small shop on the coast of Maine. He doesn''t sketch first. He listens. "Every board has a direction it wants to go," he says, running his palm across a slab of black walnut drying in the corner. "My job is to find that direction and follow it."

The lounge chair you see on your home screen today began three years ago, as a tree felled by a winter storm. Chilton bought the log from a neighbor for the price of a tank of gas.',
    4,
    'hero',
    'Jonathan Chilton',
    'Freeport, Maine',
    'earth',
    NULL,
    NOW() - INTERVAL '1 day',
    100
  ),
  (
    'a8b3f8a0-2222-4222-8222-2d2a2a2a2a02'::uuid,
    'Editor''s Note',
    'Patina: The slow shape of home',
    'Why the things you live with should age the way you do — gracefully, with intention',
    'Patina is not a finish. It is a record. Every nick on the table is a Tuesday in March, every soft seat the shape of a thousand evenings. The pieces we choose to live with become a quiet autobiography.

This is the idea at the heart of every recommendation you''ll see here: furniture that gets better with use, made by people who care whether you''re still using it twenty years from now.',
    3,
    'walnut',
    'Patina Editorial',
    'New York, NY',
    'linen',
    NULL,
    NOW() - INTERVAL '2 days',
    90
  ),
  (
    'a8b3f8a0-3333-4333-8333-3d3a3a3a3a03'::uuid,
    'Material Study',
    'A defense of imperfect linen',
    'On wrinkles, slubs, and the quiet honesty of natural fibers',
    'A linen sofa wrinkles the first time you sit on it. This is not a flaw. It is the fabric remembering you were there.

The contemporary aversion to wrinkles is largely an artifact of synthetic textiles, which iron themselves flat the way nothing in nature ever does. Real linen — the kind that started as a flax plant — has slubs. It softens with washing. It deepens in color. It records.',
    5,
    'linen',
    'Patina Editorial',
    'Portland, OR',
    'rattan',
    NULL,
    NOW() - INTERVAL '3 days',
    80
  )
ON CONFLICT (id) DO NOTHING;
