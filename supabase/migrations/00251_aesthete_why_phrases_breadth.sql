-- ─────────────────────────────────────────────────────────────────────────────
-- 00251  aesthete: why-phrase breadth (Wave 5A hardening)
-- ─────────────────────────────────────────────────────────────────────────────
-- Design §10.6 (the "why" payload) · delivery-log G3/G4 flag: the exploit-row
-- copy is monotonous — "Sits right where your taste settles" (spectrum/high)
-- dominates because 00244's `get_aesthete_matches` serves exactly ONE template
-- per (term, band) via an unordered `SELECT template INTO v_phrase FROM
-- why_phrases WHERE term=? AND band=?` on a (term, band)-PK table.
--
-- WHY A NEW TABLE (not more why_phrases rows):
--   why_phrases' PRIMARY KEY is (term, band) — it CANNOT hold alternates, and
--   widening it would make the frozen RPC's single-row SELECT INTO return an
--   arbitrary (heap-order) row = a determinism regression on a shipped, frozen
--   contract. So the breadth lands in a NEW, additive `why_phrase_alts` table
--   plus a deterministic selector `_ae_pick_why_phrase(term, band, seed)`.
--   `get_aesthete_matches` is NOT modified here (Wave 5A is additive/tidy — no
--   runtime-logic change to the match RPC). The library + selector are staged,
--   tested, and ready; wiring is a 3-line swap of the three phrase SELECTs in a
--   future, reviewed match-RPC revision (owned by 2A):
--       v_phrase := _ae_pick_why_phrase(rr.nterm, v_band, r.opid::text);
--   Until then output is unchanged — this migration is a no-op on the served
--   copy and safe to ship ahead of that revision.
--
-- COPY LAW (§10.6): every template is copy-law clean — no digits, never a
-- standalone "AI", house voice ("Designer-Taught Intelligence"), concrete where
-- the term allows. The `why_phrases_breadth_test.sql` suite re-asserts this.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. The alternates table (additive; mirrors why_phrases' RLS posture) ─────
CREATE TABLE IF NOT EXISTS why_phrase_alts (
  term text NOT NULL,
  band text NOT NULL,
  variant smallint NOT NULL DEFAULT 0,   -- 0 = the canonical why_phrases copy
  template text NOT NULL,
  sort int DEFAULT 0,
  PRIMARY KEY (term, band, variant)
);

COMMENT ON TABLE why_phrase_alts IS
  'Design §10.6: deterministic-rotation alternates for the match-reason copy, keyed (term, band, variant). variant 0 mirrors the canonical why_phrases template; 1..N are equal-standing alternates. Read via _ae_pick_why_phrase(term, band, seed); NOT yet wired into get_aesthete_matches (00244 frozen) — staged for a future match-RPC revision. Copy law: never "AI", never digits/scores, one string source for web + iOS + marketing.';

ALTER TABLE why_phrase_alts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpa_select_authenticated" ON why_phrase_alts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wpa_insert_admin" ON why_phrase_alts
  FOR INSERT TO authenticated WITH CHECK (user_has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wpa_update_admin" ON why_phrase_alts
  FOR UPDATE TO authenticated USING (user_has_role(auth.uid(), 'super_admin'))
                              WITH CHECK (user_has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wpa_delete_admin" ON why_phrase_alts
  FOR DELETE TO authenticated USING (user_has_role(auth.uid(), 'super_admin'));

-- ─── 2. Seed: ≥ 3 alternates per high-frequency exploit (term, band) ──────────
-- variant 0 repeats the shipped why_phrases copy so the curated original stays
-- in rotation; variants 1..3 are the new breadth. All in the §10.6 voice.
INSERT INTO why_phrase_alts (term, band, variant, template, sort) VALUES
  -- spectrum — the interpretable channel (the flagged dominator)
  ('spectrum',       'high', 0, 'Sits right where your taste settles', 0),
  ('spectrum',       'high', 1, 'Right in the pocket of what you keep choosing', 1),
  ('spectrum',       'high', 2, 'The balance your answers kept circling back to', 2),
  ('spectrum',       'high', 3, 'Tuned to the taste you described', 3),
  ('spectrum',       'mid',  0, 'Close to the balance you keep coming back to', 0),
  ('spectrum',       'mid',  1, 'In easy reach of the balance you favor', 1),
  ('spectrum',       'mid',  2, 'A near neighbor to your usual leanings', 2),
  ('spectrum',       'mid',  3, 'Close to where your choices tend to land', 3),
  -- style_dense — the dense-space read
  ('style_dense',    'high', 0, 'Squarely in the world your choices point to', 0),
  ('style_dense',    'high', 1, 'Deep in the world your saves point toward', 1),
  ('style_dense',    'high', 2, 'The heart of the look you keep returning to', 2),
  ('style_dense',    'high', 3, 'Straight down the line your picks draw', 3),
  ('style_dense',    'mid',  0, 'In the neighborhood of what you gravitate toward', 0),
  ('style_dense',    'mid',  1, 'A short step from your usual territory', 1),
  ('style_dense',    'mid',  2, 'Circling the look you keep choosing', 2),
  ('style_dense',    'mid',  3, 'Adjacent to the world you lean into', 3),
  -- taste — the designer/house lean
  ('taste',          'high', 0, 'The kind of piece your designer keeps reaching for', 0),
  ('taste',          'high', 1, 'The sort of thing your designer reaches for first', 1),
  ('taste',          'high', 2, 'Squarely in your designer''s wheelhouse', 2),
  ('taste',          'high', 3, 'A piece your designer would pull without hesitating', 3),
  ('taste',          'mid',  0, 'Leans the way your designer leans', 0),
  ('taste',          'mid',  1, 'Runs with the way your designer works', 1),
  ('taste',          'mid',  2, 'In step with your designer''s instincts', 2),
  ('taste',          'mid',  3, 'The direction your designer tends to favor', 3),
  -- material_color — concrete channel
  ('material_color', 'high', 0, 'Materials you said feel like home', 0),
  ('material_color', 'high', 1, 'Made of the materials you called home', 1),
  ('material_color', 'high', 2, 'A palette in the family you singled out', 2),
  ('material_color', 'high', 3, 'Finishes that echo the ones you loved', 3),
  -- function — concrete channel
  ('function',       'high', 0, 'Built for the way your household actually lives', 0),
  ('function',       'high', 1, 'Made for how your household really lives', 1),
  ('function',       'high', 2, 'Built to keep up with everyday life at home', 2),
  ('function',       'high', 3, 'Suited to the way the room gets used', 3),
  -- patina — the signature dimension
  ('patina',         'high', 0, 'The kind of oak that only gets better', 0),
  ('patina',         'high', 1, 'The kind of material that only deepens with time', 1),
  ('patina',         'high', 2, 'Honest wood that grows richer as it ages', 2),
  ('patina',         'high', 3, 'A finish that earns its character over the years', 3),
  -- behavioral — the quiet-favorite read
  ('behavioral',     'high', 0, 'A quiet favorite among people with your leanings', 0),
  ('behavioral',     'high', 1, 'A quiet favorite with people who lean like you', 1),
  ('behavioral',     'high', 2, 'Kept coming up for taste like yours', 2),
  ('behavioral',     'high', 3, 'A steady pick among kindred eyes', 3),
  -- budget — the range read (§10.4)
  ('budget',         'high', 0, 'Comfortably within your range', 0),
  ('budget',         'high', 1, 'Sits easily inside your range', 1),
  ('budget',         'high', 2, 'Priced right for what you set out to spend', 2),
  ('budget',         'high', 3, 'Comfortable for the budget you gave', 3),
  -- context — room fit
  ('context',        'high', 0, 'Sized right for the room', 0),
  ('context',        'high', 1, 'Scaled to fit the room well', 1),
  ('context',        'high', 2, 'Proportioned for the space you''re filling', 2),
  ('context',        'high', 3, 'A comfortable fit for the room''s footprint', 3),
  -- exploration — the honest stretch (§10.5; one shared slot copy today)
  ('exploration',    'stretch', 0, 'A step outside your usual — worth a look', 0),
  ('exploration',    'stretch', 1, 'A little past your usual — worth a look', 1),
  ('exploration',    'stretch', 2, 'Off your beaten path, but promising', 2),
  ('exploration',    'stretch', 3, 'A stretch from your regulars — give it a look', 3)
ON CONFLICT (term, band, variant) DO NOTHING;

-- ─── 3. Deterministic selector (staged; a drop-in for the RPC's 3 SELECTs) ────
-- Same phrase for the same (term, band, seed) → deterministic (the ranking suite
-- stays green); different seed → different phrase → breadth across a top-10.
-- Falls back to the canonical why_phrases row when a (term, band) has no alts,
-- so it is a safe 1:1 replacement for the RPC's current single-row SELECT.
-- Seed the product id (`r.opid::text`) for per-card variety that is stable per
-- product; no digits/scores enter the copy, only the choice of copy.
CREATE OR REPLACE FUNCTION _ae_pick_why_phrase(p_term text, p_band text, p_seed text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH pool AS (
    SELECT a.template,
           row_number() OVER (ORDER BY a.variant) - 1 AS idx,
           count(*)     OVER ()                        AS n
      FROM why_phrase_alts a
     WHERE a.term = p_term AND a.band = p_band
  )
  SELECT COALESCE(
    (SELECT p.template
       FROM pool p
      WHERE p.idx = ((hashtextextended(COALESCE(p_seed, ''), 0) % p.n) + p.n) % p.n
      LIMIT 1),
    -- no alternates for this (term, band): the canonical copy, unchanged
    (SELECT wp.template FROM why_phrases wp WHERE wp.term = p_term AND wp.band = p_band)
  );
$$;

COMMENT ON FUNCTION _ae_pick_why_phrase(text, text, text) IS
  'Design §10.6: deterministic per-seed pick over why_phrase_alts (falls back to why_phrases when no alternate exists). Staged for a future get_aesthete_matches revision — NOT yet called at runtime. STABLE, search_path-pinned; runs in the DEFINER match-RPC context.';

-- Internal scoring helper — revoked from client roles like 00244's helpers; it
-- would run inside the DEFINER match RPC (owner), never called by clients.
REVOKE ALL ON FUNCTION _ae_pick_why_phrase(text, text, text) FROM PUBLIC;
