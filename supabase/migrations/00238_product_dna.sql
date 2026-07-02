-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00238: Product DNA — canonical attributes, drafts, vocabulary
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md §5.2 + §5.6
-- (§15.4 row "00237 product_dna" — shifted +1, see 00237 header).
--
-- Shape decisions (from the design doc, not re-litigated here):
--   • One 1:1 table with typed columns for every axis the scorer touches,
--     jsonb for narrative, per-attribute confidence/source as jsonb maps
--     keyed by column name. (Rejected: EAV — join fan-out in the hot path;
--     all-jsonb — no CHECKs on scoring axes; columns-on-products — wrong
--     write cadence and an already-wide RLS-hot table.)
--   • product_dna_drafts holds raw Claude output; NEVER the canonical row.
--   • dna_vocab is soft vocabulary (data, not CHECKs) — vocabulary evolves
--     weekly during teaching ramp-up; ingest must never block on a new arm
--     profile. Starter seed below from the product brief's §"Form" /
--     "Material" / "Color" vocabulary.
--   • product_style_spectrum stays canonical and designer-owned; additive
--     columns only (source, confidence). ML never writes that table — draft
--     spectrums live inside product_dna_drafts.draft.
--
-- RLS (§5.6): product-child tables inherit product visibility via an EXISTS
-- subquery on products (runs as the querying role → three-layer law applies
-- transitively). Writes are designer/admin; drafts are written only by the
-- service-role job pipeline (bypasses RLS → no INSERT policy at all).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. product_dna — canonical per-product aesthetic attributes ────────────
CREATE TABLE product_dna (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  -- F1 identity & provenance ⭐ (net-new only; name/brand/category live on products)
  era text, origin_country text, originating_designer text, collection text,
  provenance_story text, edition text,
  -- F2 form & silhouette ⭐ (partial)
  line_quality real CHECK (line_quality BETWEEN -1 AND 1),   -- rectilinear ↔ curvilinear
  visual_scale real CHECK (visual_scale BETWEEN -1 AND 1),   -- airy ↔ commanding
  negative_space real CHECK (negative_space BETWEEN -1 AND 1),
  silhouette text, leg_style text, arm_profile text, back_profile text,
  symmetry text, proportion_notes text,
  -- F3 material & construction ⭐ (materials[]/finish stay on products)
  joinery text, surface_texture text,
  solidity real CHECK (solidity BETWEEN -1 AND 1),
  craftsmanship_tier real CHECK (craftsmanship_tier BETWEEN 0 AND 1),
  maintenance_reality jsonb DEFAULT '{}',                    -- {pets:"caution", kids:"fine", notes}
  -- F4 color & finish ⭐
  dominant_color text, accent_colors text[], palette_family text,
  color_value real CHECK (color_value BETWEEN -1 AND 1),
  color_saturation real CHECK (color_saturation BETWEEN 0 AND 1),
  color_temperature real CHECK (color_temperature BETWEEN -1 AND 1),
  sheen real CHECK (sheen BETWEEN 0 AND 1),
  pattern_density real CHECK (pattern_density BETWEEN 0 AND 1),
  color_histogram jsonb,
  -- F5 patina & aging — the signature dimension, first-class typed
  patina_potential real CHECK (patina_potential BETWEEN 0 AND 1),
  material_honesty real CHECK (material_honesty BETWEEN 0 AND 1),
  character_trajectory text,
  -- F6 style signature ⭐ — spectrums live in product_style_spectrum; archetypes in product_styles
  mood_keywords text[] DEFAULT '{}', ambiance text,
  -- F7 function & ergonomics ⭐ (partial)
  primary_function text,
  comfort real CHECK (comfort BETWEEN 0 AND 1),
  flexibility real CHECK (flexibility BETWEEN 0 AND 1),
  durability_for text[] DEFAULT '{}',                        -- {'kids','pets','high_traffic'}
  -- F8 context ○ — jsonb until the room composer ships
  context jsonb DEFAULT '{}',
  -- F9 commercial ⭐ (partial; price on products)
  price_tier text, value_story text, lead_time_days int, sustainability text[] DEFAULT '{}',
  -- per-attribute confidence & provenance, keyed by column name
  confidence jsonb NOT NULL DEFAULT '{}',    -- {"patina_potential": 0.85, ...}
  attr_source jsonb NOT NULL DEFAULT '{}',   -- {"patina_potential": "ml_predicted"|"designer"|"validated"}
  dna_version int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE product_dna IS
  'Canonical per-product aesthetic DNA (design §5.2). 1:1 with products; typed columns for scoring axes, jsonb maps for per-attribute confidence/source. F10 (learned & behavioral) is never stored here — it is derived. Drafts land in product_dna_drafts and never clobber this table.';

CREATE TRIGGER update_product_dna_updated_at
  BEFORE UPDATE ON product_dna
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 2. product_dna_drafts — raw Claude output; never the canonical row ─────
CREATE TABLE product_dna_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  draft jsonb NOT NULL,                       -- full structured output (§6.3 schema)
  model text NOT NULL, prompt_version text NOT NULL,
  overall_confidence real, created_at timestamptz DEFAULT now(),
  UNIQUE (product_id, prompt_version)
);

COMMENT ON TABLE product_dna_drafts IS
  'Raw Claude draft-fill output per product+prompt_version (design §5.2/§6.3). Written only by the aesthete-dna-draft job (service role). The teaching UI prefills from the newest draft; a designer save writes product_dna / product_style_spectrum — drafts themselves are never canonical.';

-- ─── 3. dna_vocab — soft vocabulary for text attributes ─────────────────────
CREATE TABLE dna_vocab (
  family text NOT NULL, attribute text NOT NULL, value text NOT NULL,
  label text, sort int DEFAULT 0, PRIMARY KEY (attribute, value)
);

COMMENT ON TABLE dna_vocab IS
  'Soft vocabulary for product_dna text attributes (design §5.2). Data, not CHECKs — vocabulary evolves during teaching ramp-up and ingest must never block on a new value. Seeded from the product brief''s form/material/color vocabulary.';

-- Starter seed — drawn from the product brief (docs/prds/AE/aesthete-engine-
-- product-brief.md): leg styles + arm profiles (§Form & silhouette), finishes
-- (§Material & construction), palette families (§Color & finish; the brief's
-- list is explicitly open-ended — "warm earth, cool neutral, jewel,
-- monochrome, etc.").
INSERT INTO dna_vocab (family, attribute, value, label, sort) VALUES
  -- leg_style (brief: tapered, cabriole, block, turned, plinth, floating; + common glossary terms)
  ('form',     'leg_style',      'tapered',      'Tapered',        1),
  ('form',     'leg_style',      'cabriole',     'Cabriole',       2),
  ('form',     'leg_style',      'block',        'Block',          3),
  ('form',     'leg_style',      'turned',       'Turned',         4),
  ('form',     'leg_style',      'plinth',       'Plinth',         5),
  ('form',     'leg_style',      'floating',     'Floating',       6),
  ('form',     'leg_style',      'hairpin',      'Hairpin',        7),
  ('form',     'leg_style',      'sled',         'Sled',           8),
  -- arm_profile (brief: track, English roll, Lawson, shelter, rolled; + slope)
  ('form',     'arm_profile',    'track',        'Track',          1),
  ('form',     'arm_profile',    'english_roll', 'English roll',   2),
  ('form',     'arm_profile',    'lawson',       'Lawson',         3),
  ('form',     'arm_profile',    'shelter',      'Shelter',        4),
  ('form',     'arm_profile',    'rolled',       'Rolled',         5),
  ('form',     'arm_profile',    'slope',        'Slope',          6),
  -- finish (brief: natural oil, lacquer, painted, raw, waxed; + aging-honest finishes in the patina spirit)
  ('material', 'finish',         'natural_oil',  'Natural oil',    1),
  ('material', 'finish',         'lacquer',      'Lacquer',        2),
  ('material', 'finish',         'painted',      'Painted',        3),
  ('material', 'finish',         'raw',          'Raw',            4),
  ('material', 'finish',         'waxed',        'Waxed',          5),
  ('material', 'finish',         'stained',      'Stained',        6),
  ('material', 'finish',         'cerused',      'Cerused',        7),
  ('material', 'finish',         'patinated',    'Patinated',      8),
  -- palette_family (brief: warm earth, cool neutral, jewel, monochrome, etc.)
  ('color',    'palette_family', 'warm_earth',   'Warm earth',     1),
  ('color',    'palette_family', 'cool_neutral', 'Cool neutral',   2),
  ('color',    'palette_family', 'warm_neutral', 'Warm neutral',   3),
  ('color',    'palette_family', 'jewel',        'Jewel',          4),
  ('color',    'palette_family', 'monochrome',   'Monochrome',     5),
  ('color',    'palette_family', 'muted_pastel', 'Muted pastel',   6),
  ('color',    'palette_family', 'moody_dark',   'Moody dark',     7),
  ('color',    'palette_family', 'bold_primary', 'Bold primary',   8)
ON CONFLICT (attribute, value) DO NOTHING;

-- ─── 4. product_style_spectrum — additive columns only ──────────────────────
-- Spectrum reuse (§5.2): the table stays canonical and designer-owned. ML
-- never writes it. A designer save writes source='manual' (confidence 0.7 by
-- app convention); peer validation upgrades to 'validated' (0.95). The
-- scorer reads canonical-else-draft.
ALTER TABLE product_style_spectrum
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','validated')),
  ADD COLUMN IF NOT EXISTS confidence jsonb NOT NULL DEFAULT '{}';   -- per-dimension {"warmth": 0.9, ...}

COMMENT ON COLUMN product_style_spectrum.source IS
  'Provenance of the canonical spectrum row: manual (designer save) or validated (peer validation upgrade). ML drafts never write this table (design §5.2).';
COMMENT ON COLUMN product_style_spectrum.confidence IS
  'Per-dimension confidence map, e.g. {"warmth": 0.9}. App convention: 0.7 on designer save, 0.95 on validation.';

-- ─── 5. Role helper — designer-domain check for RLS ─────────────────────────
-- §5.6 says "designer/admin" writes. "Designer" = any role in the designer
-- domain (independent_designer, studio_owner, studio_admin, studio_designer
-- per 00022); "admin" = super_admin via the existing user_has_role (00021).
-- SECURITY DEFINER mirrors user_has_role so the role join is not blocked by
-- RLS on user_roles/roles for the querying role.
CREATE OR REPLACE FUNCTION user_has_role_domain(p_user_id UUID, p_domain VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    -- roles.domain is the role_domain ENUM (00021); compare as text so an
    -- unknown domain string is simply false rather than a cast error.
    WHERE ur.user_id = p_user_id AND r.domain::text = p_domain
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION user_has_role_domain(UUID, VARCHAR) IS
  'True when the user holds any role in the given roles.domain (00022 vocabulary). Companion to user_has_role (00021); used by aesthete RLS for the designer-domain check.';

-- ─── 6. RLS (§5.6) ──────────────────────────────────────────────────────────
ALTER TABLE product_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_dna_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dna_vocab ENABLE ROW LEVEL SECURITY;

-- product_dna: SELECT = product-visibility EXISTS (the subquery runs as the
-- querying role, so the three-layer law applies transitively — anon sees
-- catalog DNA only, owners see their personal DNA, studio members theirs).
CREATE POLICY "product_dna_select_product_visibility"
  ON product_dna FOR SELECT
  TO authenticated, anon
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_dna.product_id));

-- product_dna: INSERT/UPDATE = designer/admin, on products they can see.
CREATE POLICY "product_dna_insert_designer_admin"
  ON product_dna FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_dna.product_id)
    AND (user_has_role_domain(auth.uid(), 'designer') OR user_has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "product_dna_update_designer_admin"
  ON product_dna FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_dna.product_id)
    AND (user_has_role_domain(auth.uid(), 'designer') OR user_has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_dna.product_id)
    AND (user_has_role_domain(auth.uid(), 'designer') OR user_has_role(auth.uid(), 'super_admin'))
  );

-- product_dna: DELETE = admin only.
CREATE POLICY "product_dna_delete_admin"
  ON product_dna FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- product_dna_drafts: SELECT = designer/admin, scoped through product
-- visibility (a designer never reads drafts for products the three-layer law
-- hides from them). INSERT/UPDATE: none — only the service-role job pipeline
-- writes drafts, and service_role bypasses RLS. DELETE = admin.
CREATE POLICY "product_dna_drafts_select_designer_admin"
  ON product_dna_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_dna_drafts.product_id)
    AND (user_has_role_domain(auth.uid(), 'designer') OR user_has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "product_dna_drafts_delete_admin"
  ON product_dna_drafts FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- dna_vocab: config data — readable by all authenticated; admin-managed.
CREATE POLICY "dna_vocab_select_authenticated"
  ON dna_vocab FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "dna_vocab_insert_admin"
  ON dna_vocab FOR INSERT
  TO authenticated
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "dna_vocab_update_admin"
  ON dna_vocab FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "dna_vocab_delete_admin"
  ON dna_vocab FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));
