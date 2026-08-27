-- ═══════════════════════════════════════════════════════════════════════════
-- 00533 — The piece contract says size, lead time and maker
--
-- SP-10, server half. For a $4,000 chair the app can offer a name, a joined
-- materials line, a price and a match pill — and no dimension, no lead time,
-- no finish, no provenance link. Every one of those columns has existed on
-- `products` since 00001/00152; none of them was ever returned to iOS.
--
-- Lineage for get_recommendations: 00067 → 00246 → 00533.
--   Verified sole prior definitions:
--     grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_recommendations" \
--       supabase/migrations/*.sql   →   00067, 00246
--   The 00246 body is copied VERBATIM below; the delta is confined to the
--   RETURNS TABLE and the tail of the RETURN QUERY select list.
--
-- ⚠ NON-ADDITIVE STEP. `get_recommendations` carries a RETURNS TABLE its own
--   comment calls a FROZEN iOS contract. A RETURNS TABLE cannot be widened by
--   CREATE OR REPLACE (it is the function's OUT parameter list), so this is a
--   DROP + CREATE. DROP also drops the ACL, so BOTH grants from 00246:307-308
--   are re-applied at the bottom. The argument list is byte-identical, so the
--   `get_recommendations(uuid,text,int,int)` regprocedure every caller and
--   test names still resolves.
--
--   The freeze that matters is the PREFIX: the first fourteen output columns
--   keep their names, types and order exactly as 00067 wrote them, so an older
--   install decoding by key keeps working. New columns are appended, never
--   inserted. Anything added after this migration appends too.
--
--   `maker_name` deliberately keeps COALESCE(v.name,'Unknown Maker'). SP-10's
--   "prefer products.brand, vendor as fallback" is a CLIENT composition now
--   that `brand` ships in the same row — changing the projection here would
--   break the frozen prefix and the shim contract test with it.
--
-- Callers re-verified before the drop (critique M6 counted four; three are real):
--   • packages/supabase/src/database.types.ts        — regenerated, this wave
--   • supabase/tests/aesthete/shim_contract_test.sql — updated, same commit
--   • supabase/seed/00-legacy-grants.sql             — regenerated (GENERATED
--       file; python3 scripts/generate-legacy-grants.py, never hand-edited)
--   • apps/client-portal/src/app/api/feed/[roomId]/route.ts — NOT a caller.
--       It reads `products` directly and names get_recommendations only in a
--       comment explaining that it mirrors the RPC's tier derivation. That
--       comment stays true; no change.
--
-- Two columns the projection needs do not exist yet and are added first:
-- `photo_verified_at` (zero hits across supabase/ before this file) and
-- `shipping_flat_cents` (same) — critique B4.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. the two missing columns ─────────────────────────────────────────────

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS photo_verified_at   timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_flat_cents integer;

COMMENT ON COLUMN public.products.photo_verified_at IS
  'When a human last confirmed the photography on this row is the piece it claims to be. NULL means nobody has — the app says nothing rather than implying verification (C5).';
COMMENT ON COLUMN public.products.shipping_flat_cents IS
  'Flat freight in integer cents, when the piece has one. NULL means shipping is not a known number yet; no purchase surface may invent one.';

-- ─── 2. get_recommendations — DROP + CREATE with the widened projection ─────

DROP FUNCTION IF EXISTS public.get_recommendations(uuid, text, int, int);

CREATE FUNCTION get_recommendations(
  p_room_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  -- ── the 00067 frozen prefix — do not reorder, rename or retype ──
  id TEXT,
  name TEXT,
  price_cents INT,
  match_score INT,
  maker_name TEXT,
  maker_location TEXT,
  maker_story TEXT,
  image_url TEXT,
  usdz_url TEXT,
  style_tags TEXT[],
  material_tags TEXT[],
  badges TEXT[],
  category TEXT,
  tier TEXT,
  -- ── appended by 00533 (SP-10) ──
  dimensions JSONB,
  lead_time_weeks INT,
  brand TEXT,
  description TEXT,
  published_at TIMESTAMPTZ,
  finish TEXT,
  patina_managed BOOLEAN,
  photo_verified_at TIMESTAMPTZ,
  source_url TEXT,
  shipping_flat_cents INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_sk uuid;
  v_neutral uuid := 'ae460000-0000-4000-8000-00000000e057';  -- shared neutral profile key
  v_signals user_style_signals;
BEGIN
  -- 1. The caller's current engine profile, newest first.
  IF v_user IS NOT NULL THEN
    SELECT csp.session_key INTO v_sk
      FROM client_style_profiles csp
     WHERE csp.user_id = v_user AND csp.is_current
     ORDER BY csp.updated_at DESC
     LIMIT 1;

    -- 2. Bridge legacy user_style_signals → a 'derived' profile (§10.7).
    --    Inverse of the 00243 claim mapping: warmth = 2·warmth01 − 1,
    --    complexity = 1 − 2·openness, formality from the level bands; only
    --    those three dims carry (low) confidence — the rest drop in scoring.
    IF v_sk IS NULL THEN
      SELECT uss.* INTO v_signals FROM user_style_signals uss WHERE uss.user_id = v_user;
      IF FOUND THEN
        v_sk := gen_random_uuid();
        INSERT INTO client_style_profiles
          (user_id, session_key, source, warmth, complexity, formality,
           spectrum_confidence, budget, confidence, is_current, version)
        VALUES
          (v_user, v_sk, 'derived',
           GREATEST(-1.0, LEAST(1.0, 2 * COALESCE(v_signals.warmth_preference, 0.5) - 1))::real,
           GREATEST(-1.0, LEAST(1.0, 1 - 2 * COALESCE(v_signals.openness_preference, 0.5)))::real,
           CASE v_signals.formality_level WHEN 'structured' THEN 0.4 WHEN 'relaxed' THEN -0.4 ELSE 0 END::real,
           '{"warmth": 0.4, "complexity": 0.3, "formality": 0.3}'::jsonb,
           '{}'::jsonb, 0.3, true, 1);
      END IF;
    END IF;
  END IF;

  -- 3. Neutral shared profile (anon / signal-less callers) — get-or-create
  --    at a fixed key so the 00243 janitor purging it self-heals.
  IF v_sk IS NULL THEN
    SELECT csp.session_key INTO v_sk
      FROM client_style_profiles csp
     WHERE csp.session_key = v_neutral AND csp.is_current;
    IF v_sk IS NULL THEN
      INSERT INTO client_style_profiles
        (session_key, source, spectrum_confidence, budget, confidence, is_current, version)
      VALUES (v_neutral, 'derived', '{}'::jsonb, '{}'::jsonb, 0.2, true, 1)
      ON CONFLICT DO NOTHING;
      v_sk := v_neutral;
    END IF;
  END IF;

  -- match_events attribution (§5.5): these calls are the iOS path.
  PERFORM set_config('aesthete.match_source', 'ios', true);

  RETURN QUERY
  SELECT p.id::text,
         p.name,
         COALESCE(p.price_retail, 0) AS price_cents,
         LEAST(100, GREATEST(0, round((m.score * 100)::numeric)))::int AS match_score,
         COALESCE(v.name, 'Unknown Maker') AS maker_name,
         v.made_in AS maker_location,
         v.brand_story::text AS maker_story,
         CASE WHEN p.images IS NOT NULL AND array_length(p.images, 1) > 0
              THEN p.images[1] END AS image_url,
         NULL::text AS usdz_url,
         COALESCE(p.style_tags, ARRAY[]::text[]) AS style_tags,
         COALESCE(p.materials, ARRAY[]::text[]) AS material_tags,
         COALESCE(p.tags, ARRAY[]::text[]) AS badges,
         COALESCE(p.category, 'decor') AS category,
         CASE
           WHEN COALESCE(p.quality_score, 0) >= 80 THEN 'designer_selection'
           WHEN p.published_at IS NOT NULL THEN 'style_match'
           ELSE 'new_arrival'
         END AS tier,
         -- ── appended by 00533 (SP-10). Every one of these is a plain column
         --    read; NULL stays NULL so the app can omit the line honestly
         --    instead of printing a placeholder (C5).
         p.dimensions,
         p.lead_time_weeks,
         p.brand,
         p.description,
         p.published_at,
         p.finish,
         p.patina_managed,
         p.photo_verified_at,
         p.source_url,
         p.shipping_flat_cents
    FROM get_aesthete_matches(
           p_session_key := v_sk,
           p_category := p_category,
           p_room_id := p_room_id,
           p_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50),
           p_offset := GREATEST(COALESCE(p_offset, 0), 0)) m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN vendors v ON p.vendor_id = v.id
   ORDER BY m.rank;
END $fn$;

COMMENT ON FUNCTION get_recommendations(uuid, text, int, int) IS
  'FROZEN iOS contract, widened by 00533 (design §10.7; SP-10): shim over get_aesthete_matches. The FIRST FOURTEEN output columns are the 00067 contract — never reorder, rename or retype them; new columns append. Resolves the caller''s client_style_profiles, else bridges legacy user_style_signals into a derived profile, else serves the shared neutral profile; maps engine score → 0–100 int and joins the product/vendor columns iOS reads. maker_name keeps its Unknown Maker fallback for the freeze; clients prefer the brand column that now ships beside it. Sets aesthete.match_source=ios for match_events.';

-- Re-apply BOTH grants dropped with the function (00246:307-308). Post-flip
-- creation no longer grants anything implicitly, so these are load-bearing.
GRANT EXECUTE ON FUNCTION get_recommendations(uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recommendations(uuid, text, int, int) TO anon;
