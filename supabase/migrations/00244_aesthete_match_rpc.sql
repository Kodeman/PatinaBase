-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00244: The match — get_aesthete_matches, weights, whys, events
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md
--   §10 COMPLETE (10.1 signature · 10.2 pipeline · 10.3 scoring · 10.4 budget
--   bell · 10.5 exploration · 10.6 why payload; 10.7 frozen contracts are
--   00246) · §9.2/§9.3 (dial formulas + defaults) · §5.5 (match_weight_profiles
--   / why_phrases / match_events DDL) · §5.6 (RLS) · §18 (signatures) ·
--   salvage doc (weight priors, MMR λ=0.8 + caps, rule predicates,
--   utilization curve, score_breakdown → terms/why shape).
-- (§15.4 row "00244 match_rpc" — replaces the G0 reservation in place.)
--
-- What this ships:
--   1. match_weight_profiles + the 'default' v1 seed (§10.3 weights; lineage
--      from the old service's 8-signal priors per the salvage doc §a).
--   2. why_phrases + seed (~26 rows: every §10.3 term × high/mid bands +
--      cautions + the §10.5 stretch phrase). Copy law lives HERE: never
--      "AI", no digits, house voice.
--   3. match_events (§5.5 DDL; RLS = admin SELECT only; all writes happen
--      inside the DEFINER RPC). Query-text law enforced BY SHAPE: the table
--      has no text column and get_aesthete_matches takes no free-text
--      parameter, so source='engine_ask' rows structurally cannot carry ask
--      text (aesthete-ask embeds text edge-side and never passes it here).
--   4. Internal scoring helpers (all EXECUTE-revoked from client roles):
--      _aesthete_product_spectrum (canonical-else-draft read, §5.2),
--      _aesthete_spectrum_term / _aesthete_spectrum_distance (§10.3),
--      _aesthete_material_bucket / _aesthete_material_color_term,
--      _aesthete_budget_term (§10.4 log-bell + value-story softener),
--      _aesthete_function_term, _aesthete_context_term +
--      _aesthete_utilization (salvage §e curve), _aesthete_rule_matches /
--      _aesthete_rule_cond (salvage §c predicate vocabulary),
--      _aesthete_theta_blend (§9.2), _aesthete_phi (§8.1 94-d basis),
--      _aesthete_taste_term (σ(θᵀφ)).
--   5. get_aesthete_matches — §10.1 signature EXACTLY; SECURITY DEFINER,
--      search_path pinned, GRANT anon+authenticated. Full §10.2 pipeline.
--   6. aesthete_search — the Typesense seam (FTS + pg_trgm fallback,
--      SECURITY INVOKER so products RLS keeps it layer-aware).
--   7. Dev-seed section (LOCAL-DEV ONLY, guarded to skip when the seed
--      sentinel product is absent): spectrums (8 canonical + 4 draft-only)
--      + product_dna rows for the 12 seed products, plus 2 extra published
--      demo products so an anon limit-10 walk returns 10 rows.
--
-- Documented deviations / provisional choices (flagged to the conductor):
--   • designer_clients.contraindicated_style_ids does NOT exist yet — the
--     §10.2 contraindication hard filter is skipped with a "Phase-2 column"
--     comment at the filter site.
--   • T_taste (§10.3): the term's weight is scaled by w_eff per the §10.3
--     row ("weight additionally scaled by w_eff so at w = 0 it collapses
--     into pure house") — at w_eff = 0, or when BOTH θ_H and θ_D are NULL
--     (today: house v1 seed has theta NULL; designer θ lands in Wave 4),
--     the term is DROPPED and the remaining weights renormalize. That is
--     the "0.5-neutral degrade": a dropped term and a constant-0.5 term
--     produce the same ranking; dropping is the honest bookkeeping.
--   • θ-blend NULL-handling (§9.2): θ_D NULL → θ_blend = θ_H; θ_H NULL →
--     θ_blend = w_eff·θ_D (house treated as the zero vector); both NULL →
--     no taste term. v_blend: falls back to whichever dense vector exists,
--     else tinting is skipped (v_query = v_client).
--   • w_eff is computed twice: globally (mean designer_style_confidence
--     weight, default 0.4) for ANN tinting + logging, and per-product with
--     c_D(g) of the product's primary archetype (default 0.4 absent) for
--     θ_blend/T_taste — §9.2 defines c_D(g) per style neighborhood.
--   • T_behavioral is affine-calibrated: LEAST(1, smoothed_save_rate/0.2)
--     so the Laplace prior (2/20 = 0.1) and the no-row cold default BOTH
--     read 0.5 — otherwise unseen products would outrank lightly-seen ones.
--   • Exploration floor (§13) applies at every ratio: n_explore =
--     GREATEST(1, floor(ratio·limit)), capped at limit−1 and at pool size.
--     When candidate ranks 20–80 are empty (small catalogs, local dev) the
--     pool falls back to all non-selected candidates — without this the
--     demo catalog could never fill its stretch slots.
--   • Rule scope precedence collapsed to a cumulative ±magnitude sum
--     clamped to ±0.5 (the salvage engine's cumulative-clamp semantics);
--     block is a hard pre-filter. Predicate attrs expose product fields
--     only — the salvage sensitive-attribute blacklist is structural here.
--   • match_events.source is inferred: GUC aesthete.match_source when set
--     (shims/edge fns set it per-transaction), else 'quiz' for anon and
--     'client_portal' for authed callers.
--   • Layer visibility: catalog ⇒ status='published' (anon is FORCED to
--     catalog); personal/studio (authed owners/members only) relax the
--     status filter to exclude deprecated/archived — personal captures are
--     usually drafts and would otherwise never match.
--   • T_context returns 0.5 when the room (or dims) are unknown per §10.3;
--     context reasons/cautions render only when p_room_id was given.
--     Units: rooms are meters; product dimensions honor their jsonb unit
--     (cm|inch, default inch).
--   • φ ordering (§8.1): archetype block ordered by styles.display_order
--     NULLS LAST, name — Wave 4A's refit MUST use the same ordering
--     (documented on _aesthete_phi).
--   • The why's top-level score is round(100·clamp(S,0,1)) (the §10.6
--     example shows 87); the RETURNS column carries the raw real S.
--   • ANN candidates are gathered with an exact scan over the hard-filtered
--     set (§12.3: acceptable ≤ 5×10⁴ products); the hnsw/ivfflat session
--     knobs are still set (guarded by index presence) for the day the CTE
--     is index-shaped.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. match_weight_profiles (§5.5) + 'default' v1 seed (§10.3) ────────────
CREATE TABLE match_weight_profiles (
  name text NOT NULL, version int NOT NULL,
  weights jsonb NOT NULL,                      -- §10.3 term weights
  is_active boolean NOT NULL DEFAULT false, notes text, created_at timestamptz DEFAULT now(),
  PRIMARY KEY (name, version)
);

COMMENT ON TABLE match_weight_profiles IS
  'Versioned scoring-weight profiles (design §5.5/§10.3). Weight changes ship as new version rows — never code edits (Loop 4, §11). The match RPC reads the highest active version of the requested profile name, falling back to ''default''.';

INSERT INTO match_weight_profiles (name, version, weights, is_active, notes) VALUES
  ('default', 1,
   '{"style_dense": 0.30, "spectrum": 0.15, "taste": 0.12, "material_color": 0.10,
     "budget": 0.10, "function": 0.08, "context": 0.05, "patina": 0.05,
     "behavioral": 0.05, "penalty": 0.30}'::jsonb,
   true,
   'v1 — §10.3 weights. Lineage from the deleted service''s 8-signal priors (salvage §a): vec .45 → style_dense .30 (split three ways with spectrum/material_color), rules .15 → taste .12, price .10 → budget .10, size .10 → context .05, pop .05 → behavioral .05, new .05 → patina .05, penalty .30 unchanged.')
ON CONFLICT (name, version) DO NOTHING;

-- ─── 2. why_phrases (§5.5/§10.6) + seed ──────────────────────────────────────
CREATE TABLE why_phrases (
  term text NOT NULL, band text NOT NULL,      -- band: contribution range or condition key
  template text NOT NULL,                      -- "The kind of oak that only gets better"
  sort int DEFAULT 0, PRIMARY KEY (term, band)
);

COMMENT ON TABLE why_phrases IS
  'Server-side match-reason copy (design §5.5/§10.6) — the ONE string source for web + iOS + marketing. Copy law: never "AI", never digits or scores, house voice ("Designer-Taught Intelligence"). Bands: high (T ≥ 0.66), mid (else), plus condition bands (caution_over, value_story, caution, stretch, lead_time, discontinued).';

INSERT INTO why_phrases (term, band, template, sort) VALUES
  -- style_dense — the dense-space read
  ('style_dense',    'high', 'Squarely in the world your choices point to', 0),
  ('style_dense',    'mid',  'In the neighborhood of what you gravitate toward', 1),
  -- spectrum — the interpretable channel
  ('spectrum',       'high', 'Sits right where your taste settles', 0),
  ('spectrum',       'mid',  'Close to the balance you keep coming back to', 1),
  -- taste — the designer/house lean
  ('taste',          'high', 'The kind of piece your designer keeps reaching for', 0),
  ('taste',          'mid',  'Leans the way your designer leans', 1),
  -- material_color
  ('material_color', 'high', 'Materials you said feel like home', 0),
  ('material_color', 'mid',  'A palette that plays well with your favorites', 1),
  -- budget (§10.4)
  ('budget',         'high', 'Comfortably within your range', 0),
  ('budget',         'mid',  'A fair ask for what it is', 1),
  ('budget',         'value_story', 'Costs more up front, built to earn it back', 2),
  ('budget',         'caution_over', 'A stretch past your range — worth it only if you love it', 3),
  -- function
  ('function',       'high', 'Built for the way your household actually lives', 0),
  ('function',       'mid',  'Stands up to daily life', 1),
  -- context (room fit)
  ('context',        'high', 'Sized right for the room', 0),
  ('context',        'mid',  'Should sit comfortably in the space', 1),
  ('context',        'caution', 'On the larger side for your room', 2),
  -- patina — the signature dimension
  ('patina',         'high', 'The kind of oak that only gets better', 0),
  ('patina',         'mid',  'Honest materials that will wear their years well', 1),
  -- behavioral
  ('behavioral',     'high', 'A quiet favorite among people with your leanings', 0),
  ('behavioral',     'mid',  'Earning repeat looks', 1),
  -- exploration (§10.5 — the honest stretch)
  ('exploration',    'stretch', 'A step outside your usual — worth a look', 0),
  -- penalty cautions
  ('penalty',        'lead_time', 'Takes its time to arrive — plan ahead', 0),
  ('penalty',        'discontinued', 'On its way out of production — act soon if it speaks to you', 1),
  -- generic fallbacks (never expected; belt-and-braces so a why is never blank)
  ('generic',        'high', 'A strong fit for the way you answered', 0),
  ('generic',        'mid',  'A solid fit for the way you answered', 1)
ON CONFLICT (term, band) DO NOTHING;

-- ─── 3. match_events (§5.5) ──────────────────────────────────────────────────
CREATE TABLE match_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_key uuid, user_id uuid, designer_id uuid,
  source text NOT NULL,                        -- 'quiz' | 'engine_ask' | 'ios' | 'client_portal'
  context jsonb DEFAULT '{}',
  w real, w_effective real, house_version int, weights_version int,
  results jsonb NOT NULL,                      -- [{product_id, score, terms:{...}, is_exploration}]
  latency_ms int, created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_match_events_time ON match_events (created_at);
CREATE INDEX idx_match_events_session ON match_events (session_key, created_at);

COMMENT ON TABLE match_events IS
  'One row per match call (design §5.5/§12.4): the observability + Loop-4 learning substrate. Full per-term contributions in results; no sampling at this scale. LAW: source=''engine_ask'' rows carry NO query text — enforced by shape (no text column; get_aesthete_matches takes no free-text parameter; context carries only structured keys the RPC builds itself).';

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- admin SELECT only; every write happens inside the DEFINER match RPC.
CREATE POLICY "me_select_admin"
  ON match_events FOR SELECT
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- ─── 4. RLS for the config tables (§5.6: authenticated reads, admin writes) ──
ALTER TABLE match_weight_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE why_phrases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mwp_select_authenticated" ON match_weight_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "mwp_insert_admin" ON match_weight_profiles FOR INSERT TO authenticated WITH CHECK (user_has_role(auth.uid(), 'super_admin'));
CREATE POLICY "mwp_update_admin" ON match_weight_profiles FOR UPDATE TO authenticated USING (user_has_role(auth.uid(), 'super_admin')) WITH CHECK (user_has_role(auth.uid(), 'super_admin'));
CREATE POLICY "mwp_delete_admin" ON match_weight_profiles FOR DELETE TO authenticated USING (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "wp_select_authenticated" ON why_phrases FOR SELECT TO authenticated USING (true);
CREATE POLICY "wp_insert_admin" ON why_phrases FOR INSERT TO authenticated WITH CHECK (user_has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wp_update_admin" ON why_phrases FOR UPDATE TO authenticated USING (user_has_role(auth.uid(), 'super_admin')) WITH CHECK (user_has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wp_delete_admin" ON why_phrases FOR DELETE TO authenticated USING (user_has_role(auth.uid(), 'super_admin'));

-- ─── 5. Internal scoring helpers ─────────────────────────────────────────────
-- All revoked from client roles at the bottom of this file; they run inside
-- the DEFINER match RPC only.

-- 5a. Canonical-else-draft spectrum read (§5.2): product_style_spectrum wins;
-- otherwise the latest product_dna_drafts row's draft->'style'->'spectrums'
-- at reduced confidence (per-dim spectrum_conf else overall_confidence else
-- 0.5, capped at 0.6). Returns zero rows when neither exists (LEFT JOIN
-- LATERAL callers read NULLs).
CREATE OR REPLACE FUNCTION _aesthete_product_spectrum(p_product_id uuid)
RETURNS TABLE (spectrums jsonb, conf jsonb, origin text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_dims text[] := ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'];
  v_row product_style_spectrum;
  v_default real;
  v_s jsonb;
  v_c jsonb;
  v_draft jsonb;
  v_draft_conf jsonb;
  v_overall real;
BEGIN
  SELECT * INTO v_row FROM product_style_spectrum pss WHERE pss.product_id = p_product_id;
  IF FOUND THEN
    v_s := jsonb_strip_nulls(jsonb_build_object(
      'warmth', v_row.warmth, 'complexity', v_row.complexity, 'formality', v_row.formality,
      'timelessness', v_row.timelessness, 'boldness', v_row.boldness, 'craftsmanship', v_row.craftsmanship));
    IF v_s <> '{}'::jsonb THEN
      v_default := CASE WHEN v_row.source = 'validated' THEN 0.95 ELSE 0.7 END;
      SELECT COALESCE(jsonb_object_agg(k, LEAST(1.0, GREATEST(0.0,
               COALESCE((v_row.confidence->>k)::real, v_default)))), '{}'::jsonb)
        INTO v_c
        FROM jsonb_object_keys(v_s) k;
      RETURN QUERY SELECT v_s, v_c,
        CASE WHEN v_row.source = 'validated' THEN 'validated' ELSE 'canonical' END;
      RETURN;
    END IF;
  END IF;

  SELECT d.draft->'style'->'spectrums',
         d.draft->'style'->'spectrum_conf',
         COALESCE((d.draft->>'overall_confidence')::real, 0.5)
    INTO v_draft, v_draft_conf, v_overall
    FROM product_dna_drafts d
   WHERE d.product_id = p_product_id
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT 1;

  IF v_draft IS NOT NULL AND jsonb_typeof(v_draft) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(k, GREATEST(-1.0, LEAST(1.0, (v_draft->>k)::real))), '{}'::jsonb)
      INTO v_s
      FROM unnest(v_dims) k
     WHERE v_draft ? k AND jsonb_typeof(v_draft->k) = 'number';
    IF v_s <> '{}'::jsonb THEN
      SELECT COALESCE(jsonb_object_agg(k, LEAST(0.6, GREATEST(0.0,
               COALESCE((v_draft_conf->>k)::real, v_overall, 0.5)))), '{}'::jsonb)
        INTO v_c
        FROM jsonb_object_keys(v_s) k;
      RETURN QUERY SELECT v_s, v_c, 'draft'::text;
    END IF;
  END IF;
  RETURN;
END $fn$;

COMMENT ON FUNCTION _aesthete_product_spectrum(uuid) IS
  'Canonical-else-draft spectrum read (design §5.2): designer-written product_style_spectrum (validated 0.95 / manual 0.7 per-dim default) else latest draft spectrums capped at 0.6 confidence. Internal — the whole catalog is matchable from drafts while designers work the queue.';

-- 5b. T_spectrum (§10.3): 1 − ½·sqrt( Σ γ c_c c_p (s_c−s_p)² / Σ γ c_c c_p ),
-- γ = (1.2, 1.0, 0.8, 0.6, 1.1, 1.0) — warmth and boldness read loudest.
-- NULL when no dimension is present on both sides (term drops).
CREATE OR REPLACE FUNCTION _aesthete_spectrum_term(
  p_cs jsonb, p_cc jsonb, p_ps jsonb, p_pc jsonb)
RETURNS real
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  r record;
  v_cc real; v_pc real; v_wt real;
  v_num double precision := 0;
  v_den double precision := 0;
BEGIN
  IF p_cs IS NULL OR p_ps IS NULL THEN RETURN NULL; END IF;
  FOR r IN
    SELECT g.dim, g.gamma FROM (VALUES
      ('warmth', 1.2::real), ('complexity', 1.0), ('formality', 0.8),
      ('timelessness', 0.6), ('boldness', 1.1), ('craftsmanship', 1.0)
    ) g(dim, gamma)
  LOOP
    IF (p_cs ? r.dim) AND (p_ps ? r.dim) THEN
      v_cc := COALESCE((p_cc->>r.dim)::real, 0.5);
      v_pc := COALESCE((p_pc->>r.dim)::real, 0.5);
      v_wt := r.gamma * v_cc * v_pc;
      IF v_wt > 0 THEN
        v_num := v_num + v_wt * power((p_cs->>r.dim)::real - (p_ps->>r.dim)::real, 2);
        v_den := v_den + v_wt;
      END IF;
    END IF;
  END LOOP;
  IF v_den <= 0 THEN RETURN NULL; END IF;
  RETURN GREATEST(0.0, LEAST(1.0, 1.0 - 0.5 * sqrt(v_num / v_den)))::real;
END $fn$;

-- 5c. Unweighted spectrum RMS distance — Stage-1 candidate capping for the
-- vector-less path (§10.2). NULL when no shared dims.
CREATE OR REPLACE FUNCTION _aesthete_spectrum_distance(p_cs jsonb, p_ps jsonb)
RETURNS real
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_dim text;
  v_sum double precision := 0;
  v_n int := 0;
BEGIN
  IF p_cs IS NULL OR p_ps IS NULL THEN RETURN NULL; END IF;
  FOREACH v_dim IN ARRAY ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'] LOOP
    IF (p_cs ? v_dim) AND (p_ps ? v_dim) THEN
      v_sum := v_sum + power((p_cs->>v_dim)::real - (p_ps->>v_dim)::real, 2);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  IF v_n = 0 THEN RETURN NULL; END IF;
  RETURN sqrt(v_sum / v_n)::real;
END $fn$;

-- 5d. Material → affinity-bucket map (the §8.1 one-hot vocabulary).
CREATE OR REPLACE FUNCTION _aesthete_material_bucket(p_material text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_material IS NULL THEN NULL
    WHEN p_material ~* 'marble' THEN 'marble'
    WHEN p_material ~* 'ceramic|stoneware|terracotta|porcelain|clay' THEN 'ceramic'
    WHEN p_material ~* 'glass' THEN 'glass'
    WHEN p_material ~* 'leather' THEN 'leather'
    WHEN p_material ~* 'rattan|jute|wicker|cane|seagrass' THEN 'rattan'
    WHEN p_material ~* 'linen|velvet|wool|cotton|fabric|boucl|upholster|down' THEN 'fabric'
    WHEN p_material ~* 'brass|steel|iron|metal|aluminum|chrome|bronze|copper' THEN 'metal'
    WHEN p_material ~* 'stone|granite|travertine|concrete|slate' THEN 'stone'
    WHEN p_material ~* 'oak|walnut|wood|timber|teak|ash|maple|pine|mahogany|birch|lumber|rosewood' THEN 'wood'
    ELSE 'mixed'
  END
$fn$;

-- 5e. T_material_color (§10.3): 0.6·affinity-dot + 0.4·color-temperature
-- agreement + material_compatibility bonus (capped at 1). Halves renormalize
-- onto whichever exists; NULL when neither does. The client''s warmth
-- spectrum proxies color temperature (no direct color question in quiz v1).
CREATE OR REPLACE FUNCTION _aesthete_material_color_term(
  p_aff jsonb, p_materials text[], p_color_temp real, p_client_warmth real)
RETURNS real
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_aff real;
  v_agree real;
  v_bonus real := 0;
  v_top text;
BEGIN
  IF p_aff IS NOT NULL AND p_aff <> '{}'::jsonb AND p_materials IS NOT NULL THEN
    SELECT max((p_aff->>_aesthete_material_bucket(m.x))::real)
      INTO v_aff
      FROM unnest(p_materials) m(x)
     WHERE p_aff ? _aesthete_material_bucket(m.x);
  END IF;
  IF p_color_temp IS NOT NULL AND p_client_warmth IS NOT NULL THEN
    v_agree := GREATEST(0.0, LEAST(1.0, 1.0 - abs(p_client_warmth - p_color_temp) / 2.0));
  END IF;
  IF v_aff IS NULL AND v_agree IS NULL THEN RETURN NULL; END IF;

  IF v_aff IS NOT NULL AND p_materials IS NOT NULL THEN
    SELECT e.k INTO v_top FROM jsonb_each_text(p_aff) e(k, v) ORDER BY e.v::real DESC, e.k LIMIT 1;
    IF v_top IS NOT NULL AND EXISTS (
      SELECT 1
        FROM material_compatibility mcx, unnest(p_materials) pm(x)
       WHERE ((lower(mcx.material_a) = _aesthete_material_bucket(pm.x) AND lower(mcx.material_b) = v_top)
           OR (lower(mcx.material_b) = _aesthete_material_bucket(pm.x) AND lower(mcx.material_a) = v_top))
         AND mcx.compatibility ~* 'complement|pair|excellent|good') THEN
      v_bonus := 0.1;  -- table is empty today; vocab guess documented in 00244 header
    END IF;
  END IF;

  RETURN CASE
    WHEN v_aff IS NOT NULL AND v_agree IS NOT NULL THEN LEAST(1.0, 0.6 * v_aff + 0.4 * v_agree + v_bonus)
    WHEN v_aff IS NOT NULL THEN LEAST(1.0, v_aff + v_bonus)
    ELSE LEAST(1.0, v_agree)
  END::real;
END $fn$;

-- 5f. T_budget (§10.4): log-space bell over the perception anchor with the
-- value-story softener. Returns no row (→ NULLs) when price or budget is
-- absent — the term drops, it never punishes missing data.
CREATE OR REPLACE FUNCTION _aesthete_budget_term(
  p_price int, p_bmin bigint, p_bmax bigint, p_omega real,
  p_craft real, p_has_story boolean)
RETURNS TABLE (t real, over_anchor boolean, softened boolean)
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_anchor numeric;
  v_delta double precision;
  v_mu double precision;
  v_sigma double precision;
  v_t double precision;
  v_soft boolean := false;
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN RETURN; END IF;
  IF p_bmax IS NULL AND p_bmin IS NULL THEN RETURN; END IF;

  v_anchor := CASE
    WHEN COALESCE(p_bmin, 0) > 0 AND p_bmax IS NOT NULL THEN sqrt(p_bmin::numeric * p_bmax::numeric)
    WHEN p_bmax IS NOT NULL THEN 0.8 * p_bmax
    ELSE 1.2 * p_bmin END;                          -- bmax-less anchor: documented deviation
  IF v_anchor <= 0 THEN RETURN; END IF;

  v_delta := ln(p_price / v_anchor::double precision);
  v_mu    := 0.25 * COALESCE(p_omega, 0);
  v_sigma := 0.45 + 0.15 * COALESCE(p_omega, 0);
  v_t     := exp(-power(v_delta - v_mu, 2) / (2 * power(v_sigma, 2)));

  IF v_delta > v_mu AND COALESCE(p_craft, 0) >= 0.6 AND COALESCE(p_has_story, false) THEN
    v_t := LEAST(1.0, v_t + 0.10);                  -- value-story softener (§10.4)
    v_soft := true;
  END IF;

  RETURN QUERY SELECT v_t::real, (v_delta > v_mu), v_soft;
END $fn$;

-- 5g. T_function (§10.3): the client''s Q2 functional priorities vs honest
-- product tags. Mean over known demands (matched 1.0 / contradicted 0.25 /
-- unknown-on-product 0.5); NULL when the profile carries no known demands.
CREATE OR REPLACE FUNCTION _aesthete_function_term(
  p_fp jsonb, p_durability text[], p_comfort real, p_flexibility real,
  p_primary_function text, p_complexity real)
RETURNS real
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_sum double precision := 0;
  v_n int := 0;
BEGIN
  IF p_fp IS NULL OR p_fp = '{}'::jsonb THEN RETURN NULL; END IF;

  IF p_fp->>'durability' = 'kids_pets' THEN
    v_n := v_n + 1;
    v_sum := v_sum + CASE
      WHEN p_durability IS NOT NULL AND p_durability && ARRAY['kids','pets','high_traffic'] THEN 1.0
      WHEN p_durability IS NULL OR array_length(p_durability, 1) IS NULL THEN 0.5
      ELSE 0.25 END;
  END IF;
  IF p_fp ? 'hosting' THEN
    v_n := v_n + 1;
    v_sum := v_sum + CASE
      WHEN GREATEST(COALESCE(p_comfort, 0), COALESCE(p_flexibility, 0)) >= 0.5 THEN 1.0
      WHEN p_comfort IS NULL AND p_flexibility IS NULL THEN 0.5
      ELSE 0.4 END;
  END IF;
  IF p_fp ? 'calm' THEN
    v_n := v_n + 1;
    v_sum := v_sum + CASE
      WHEN p_complexity IS NULL THEN 0.5
      WHEN p_complexity <= 0 THEN 1.0
      ELSE 0.5 END;
  END IF;
  IF p_fp ? 'workspace' THEN
    v_n := v_n + 1;
    v_sum := v_sum + CASE
      WHEN p_primary_function IS NULL THEN 0.5
      WHEN p_primary_function ~* 'desk|work|office|task' THEN 1.0
      ELSE 0.5 END;
  END IF;

  IF v_n = 0 THEN RETURN NULL; END IF;
  RETURN (v_sum / v_n)::real;
END $fn$;

-- 5h. The salvaged utilization curve (salvage §e): optimal 30–60% of the
-- room dimension.
CREATE OR REPLACE FUNCTION _aesthete_utilization(p_ratio double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_ratio IS NULL OR p_ratio <= 0 THEN 0.5
    WHEN p_ratio < 0.2 THEN 0.5
    WHEN p_ratio < 0.3 THEN 0.7 + (p_ratio - 0.2) * 3
    WHEN p_ratio < 0.6 THEN 1.0
    WHEN p_ratio < 0.8 THEN 1.0 - (p_ratio - 0.6) * 2
    ELSE 0.3
  END
$fn$;

-- 5i. T_context (§10.3): utilization curve when room dims are known, else
-- 0.5. Rooms are meters; product dims honor their unit (cm|inch|m, default
-- inch — the @patina/types Dimensions convention).
CREATE OR REPLACE FUNCTION _aesthete_context_term(
  p_dims jsonb, p_room_w real, p_room_l real)
RETURNS real
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_factor double precision;
  v_w double precision;
  v_d double precision;
  v_sum double precision := 0;
  v_n int := 0;
BEGIN
  IF p_room_w IS NULL AND p_room_l IS NULL THEN RETURN 0.5; END IF;
  IF p_dims IS NULL OR jsonb_typeof(p_dims) <> 'object' THEN RETURN 0.5; END IF;

  v_factor := CASE lower(COALESCE(p_dims->>'unit', 'inch'))
    WHEN 'cm' THEN 0.01
    WHEN 'm' THEN 1.0
    ELSE 0.0254 END;

  BEGIN
    v_w := (p_dims->>'width')::double precision * v_factor;
    v_d := (p_dims->>'depth')::double precision * v_factor;
  EXCEPTION WHEN OTHERS THEN
    RETURN 0.5;  -- malformed dims: unknown, never punished
  END;

  IF v_w IS NOT NULL AND p_room_w IS NOT NULL AND p_room_w > 0 THEN
    v_sum := v_sum + _aesthete_utilization(v_w / p_room_w);
    v_n := v_n + 1;
  END IF;
  IF v_d IS NOT NULL AND p_room_l IS NOT NULL AND p_room_l > 0 THEN
    v_sum := v_sum + _aesthete_utilization(v_d / p_room_l);
    v_n := v_n + 1;
  END IF;

  IF v_n = 0 THEN RETURN 0.5; END IF;
  RETURN (v_sum / v_n)::real;
END $fn$;

-- 5j. Rule predicate evaluator (salvage §c → the 00242 taste_rules schema):
-- {"all":[{"attr":"complexity","gte":0.5}, ...]} / {"any":[...]} / a bare
-- condition object. Ops: eq, ne, gt, gte, lt, lte, in, contains (array
-- attrs). Numeric compare when both sides are jsonb numbers, else text.
-- Missing attr ⇒ condition false. Attrs are product-only (spectrums, DNA,
-- category/brand/price/materials) — no user fields exist to blacklist.
CREATE OR REPLACE FUNCTION _aesthete_rule_cond(p_cond jsonb, p_attrs jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_attr text;
  v_val jsonb;
  v_is_num boolean;
  v_num numeric;
  v_txt text;
  v_ops int := 0;
BEGIN
  IF p_cond IS NULL OR jsonb_typeof(p_cond) <> 'object' THEN RETURN false; END IF;
  v_attr := p_cond->>'attr';
  IF v_attr IS NULL OR p_attrs IS NULL OR NOT (p_attrs ? v_attr) THEN RETURN false; END IF;
  v_val := p_attrs->v_attr;
  v_is_num := jsonb_typeof(v_val) = 'number';
  IF v_is_num THEN v_num := (v_val#>>'{}')::numeric; END IF;
  v_txt := v_val#>>'{}';

  IF p_cond ? 'eq' THEN
    v_ops := v_ops + 1;
    IF v_is_num AND jsonb_typeof(p_cond->'eq') = 'number' THEN
      IF NOT (v_num = (p_cond->>'eq')::numeric) THEN RETURN false; END IF;
    ELSIF v_txt IS DISTINCT FROM (p_cond->>'eq') THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'ne' THEN
    v_ops := v_ops + 1;
    IF v_is_num AND jsonb_typeof(p_cond->'ne') = 'number' THEN
      IF NOT (v_num <> (p_cond->>'ne')::numeric) THEN RETURN false; END IF;
    ELSIF v_txt IS NOT DISTINCT FROM (p_cond->>'ne') THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'gt' THEN
    v_ops := v_ops + 1;
    IF NOT v_is_num OR NOT (v_num > (p_cond->>'gt')::numeric) THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'gte' THEN
    v_ops := v_ops + 1;
    IF NOT v_is_num OR NOT (v_num >= (p_cond->>'gte')::numeric) THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'lt' THEN
    v_ops := v_ops + 1;
    IF NOT v_is_num OR NOT (v_num < (p_cond->>'lt')::numeric) THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'lte' THEN
    v_ops := v_ops + 1;
    IF NOT v_is_num OR NOT (v_num <= (p_cond->>'lte')::numeric) THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'in' THEN
    v_ops := v_ops + 1;
    IF jsonb_typeof(p_cond->'in') <> 'array' THEN RETURN false; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_cond->'in') e
                    WHERE e#>>'{}' = v_txt) THEN RETURN false; END IF;
  END IF;
  IF p_cond ? 'contains' THEN
    v_ops := v_ops + 1;
    IF jsonb_typeof(v_val) <> 'array' THEN RETURN false; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_val) e
                    WHERE e#>>'{}' = (p_cond->>'contains')) THEN RETURN false; END IF;
  END IF;

  RETURN v_ops > 0;  -- an op-less condition matches nothing (fail closed)
END $fn$;

CREATE OR REPLACE FUNCTION _aesthete_rule_matches(p_predicate jsonb, p_attrs jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_cond jsonb;
BEGIN
  IF p_predicate IS NULL OR jsonb_typeof(p_predicate) <> 'object' THEN RETURN false; END IF;

  IF p_predicate ? 'all' THEN
    IF jsonb_typeof(p_predicate->'all') <> 'array'
       OR jsonb_array_length(p_predicate->'all') = 0 THEN RETURN false; END IF;
    FOR v_cond IN SELECT e FROM jsonb_array_elements(p_predicate->'all') e LOOP
      IF NOT _aesthete_rule_cond(v_cond, p_attrs) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  ELSIF p_predicate ? 'any' THEN
    IF jsonb_typeof(p_predicate->'any') <> 'array' THEN RETURN false; END IF;
    FOR v_cond IN SELECT e FROM jsonb_array_elements(p_predicate->'any') e LOOP
      IF _aesthete_rule_cond(v_cond, p_attrs) THEN RETURN true; END IF;
    END LOOP;
    RETURN false;
  ELSIF p_predicate ? 'attr' THEN
    RETURN _aesthete_rule_cond(p_predicate, p_attrs);
  END IF;
  RETURN false;
END $fn$;

COMMENT ON FUNCTION _aesthete_rule_matches(jsonb, jsonb) IS
  'taste_rules predicate evaluator (design §5.4, salvage §c): {"all":[...]}/{"any":[...]}/bare condition; ops eq/ne/gt/gte/lt/lte/in/contains over the product attribute jsonb the match RPC builds (spectrums, DNA axes, category/brand/price/materials). Fail-closed on malformed predicates.';

-- 5k. θ_blend (§9.2): θ_H + w_eff·(θ_D − θ_H), with the documented NULL
-- fallbacks (θ_D NULL → θ_H; θ_H NULL → w_eff·θ_D; both NULL → NULL).
CREATE OR REPLACE FUNCTION _aesthete_theta_blend(
  p_theta_h real[], p_theta_d real[], p_w_eff real)
RETURNS real[]
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_theta_h IS NULL AND p_theta_d IS NULL THEN NULL
    WHEN p_theta_d IS NULL THEN p_theta_h
    WHEN p_theta_h IS NULL THEN
      (SELECT array_agg((t.x * COALESCE(p_w_eff, 0))::real ORDER BY t.ord)
         FROM unnest(p_theta_d) WITH ORDINALITY t(x, ord))
    ELSE
      (SELECT array_agg((p_theta_h[i] + COALESCE(p_w_eff, 0) * (p_theta_d[i] - p_theta_h[i]))::real ORDER BY i)
         FROM generate_series(1, LEAST(array_length(p_theta_h, 1), array_length(p_theta_d, 1))) i)
  END
$fn$;

-- 5l. φ(p) — the §8.1 94-d interpretable basis:
--   [1..6]   confidence-weighted spectrums (canonical-else-draft), fixed
--            dim order warmth, complexity, formality, timelessness,
--            boldness, craftsmanship; missing → 0
--   [7..18]  archetype weights over the styles taxonomy, ORDERED BY
--            styles.display_order NULLS LAST, name (Wave 4A''s refit MUST
--            use this same ordering), normalized to sum 1
--   [19..28] materials one-hot: wood, metal, fabric, stone, glass, leather,
--            rattan, marble, ceramic, mixed (mixed = spans ≥ 3 buckets or
--            unmapped material)
--   [29]     patina_potential   [30] craftsmanship_tier
--   [31..94] first 64 dims of aesthete_vector, ℓ2-normalized (zeros when
--            the vector is NULL)
-- No price/budget features — structural guardrail (§8.1/§13), testable.
CREATE OR REPLACE FUNCTION _aesthete_phi(p_product_id uuid)
RETURNS real[]
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_phi real[] := '{}';
  v_spec record;
  v_dim text;
  v_arch real[];
  v_arch_sum real;
  v_mats text[];
  v_bucket text;
  v_buckets text[] := ARRAY['wood','metal','fabric','stone','glass','leather','rattan','marble','ceramic','mixed'];
  v_hit text[];
  v_dna record;
  v_vec real[];
  v_norm double precision;
  i int;
BEGIN
  -- [1..6] spectrums ⊙ confidence
  SELECT ps.spectrums, ps.conf INTO v_spec FROM _aesthete_product_spectrum(p_product_id) ps;
  FOREACH v_dim IN ARRAY ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'] LOOP
    v_phi := v_phi || COALESCE(
      ((v_spec.spectrums->>v_dim)::real * COALESCE((v_spec.conf->>v_dim)::real, 0.5)), 0)::real;
  END LOOP;

  -- [7..18] archetype weights (canonical style ordering — see header)
  SELECT array_agg(COALESCE(pw.wt, 0) ORDER BY s.display_order NULLS LAST, s.name),
         sum(COALESCE(pw.wt, 0))
    INTO v_arch, v_arch_sum
    FROM styles s
    LEFT JOIN LATERAL (
      SELECT COALESCE(ps2.confidence, 1.0)::real AS wt
        FROM product_styles ps2
       WHERE ps2.product_id = p_product_id AND ps2.style_id = s.id
       LIMIT 1) pw ON true;
  IF v_arch IS NULL THEN v_arch := array_fill(0::real, ARRAY[12]); v_arch_sum := 0; END IF;
  FOR i IN 1..array_length(v_arch, 1) LOOP
    v_phi := v_phi || CASE WHEN v_arch_sum > 0 THEN (v_arch[i] / v_arch_sum)::real ELSE 0::real END;
  END LOOP;

  -- [19..28] materials one-hot
  SELECT p.materials INTO v_mats FROM products p WHERE p.id = p_product_id;
  SELECT COALESCE(array_agg(DISTINCT _aesthete_material_bucket(m.x)), '{}')
    INTO v_hit FROM unnest(COALESCE(v_mats, '{}'::text[])) m(x);
  FOREACH v_bucket IN ARRAY v_buckets LOOP
    v_phi := v_phi || CASE
      WHEN v_bucket = 'mixed' AND (array_length(v_hit, 1) >= 3 OR 'mixed' = ANY(v_hit)) THEN 1::real
      WHEN v_bucket <> 'mixed' AND v_bucket = ANY(v_hit) THEN 1::real
      ELSE 0::real END;
  END LOOP;

  -- [29..30] patina_potential, craftsmanship_tier
  SELECT d.patina_potential, d.craftsmanship_tier INTO v_dna
    FROM product_dna d WHERE d.product_id = p_product_id;
  v_phi := v_phi || COALESCE(v_dna.patina_potential, 0)::real;
  v_phi := v_phi || COALESCE(v_dna.craftsmanship_tier, 0)::real;

  -- [31..94] Matryoshka-truncated aesthete_vector, ℓ2-normalized
  SELECT (p.aesthete_vector::real[])[1:64] INTO v_vec
    FROM products p WHERE p.id = p_product_id AND p.aesthete_vector IS NOT NULL;
  IF v_vec IS NULL THEN
    v_phi := v_phi || array_fill(0::real, ARRAY[64]);
  ELSE
    SELECT sqrt(sum(x * x)) INTO v_norm FROM unnest(v_vec) x;
    IF v_norm IS NULL OR v_norm = 0 THEN
      v_phi := v_phi || array_fill(0::real, ARRAY[64]);
    ELSE
      FOR i IN 1..64 LOOP
        v_phi := v_phi || (COALESCE(v_vec[i], 0) / v_norm)::real;
      END LOOP;
    END IF;
  END IF;

  RETURN v_phi;
END $fn$;

COMMENT ON FUNCTION _aesthete_phi(uuid) IS
  'The §8.1 94-d interpretable feature map φ(p). Ordering contract (Wave 4A refit MUST match): 6 conf-weighted spectrums · 12 archetypes by styles.display_order NULLS LAST, name · 10 material one-hots (wood, metal, fabric, stone, glass, leather, rattan, marble, ceramic, mixed) · patina_potential · craftsmanship_tier · 64-d normalized Matryoshka slice of aesthete_vector. NO price/budget features — structural §13 guardrail.';

-- 5m. T_taste = σ(θᵀφ) (§10.3). NULL theta → NULL (term drops).
CREATE OR REPLACE FUNCTION _aesthete_taste_term(p_theta real[], p_product_id uuid)
RETURNS real
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_phi real[];
  v_dot double precision;
BEGIN
  IF p_theta IS NULL THEN RETURN NULL; END IF;
  v_phi := _aesthete_phi(p_product_id);
  SELECT sum(t.x * v_phi[t.ord]) INTO v_dot
    FROM unnest(p_theta) WITH ORDINALITY t(x, ord)
   WHERE t.ord <= array_length(v_phi, 1);
  IF v_dot IS NULL THEN RETURN NULL; END IF;
  RETURN (1.0 / (1.0 + exp(-v_dot)))::real;
END $fn$;

-- ─── 6. get_aesthete_matches — the match (§10.1/§10.2) ───────────────────────
CREATE OR REPLACE FUNCTION get_aesthete_matches(
  p_session_key uuid,                  -- client capability (anon or claimed)
  p_designer_id uuid  DEFAULT NULL,    -- NULL → pure house
  p_w real            DEFAULT NULL,    -- NULL → context default (0 anon, 0.35 assigned)
  p_category text     DEFAULT NULL,
  p_room_id uuid      DEFAULT NULL,
  p_layer text        DEFAULT 'catalog',
  p_limit int         DEFAULT 10,
  p_offset int        DEFAULT 0,
  p_explore_ratio real DEFAULT 0.2,
  p_weights_profile text DEFAULT 'default'
) RETURNS TABLE (product_id uuid, rank int, score real, confidence real,
                 is_exploration boolean, why jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  v_caller uuid := auth.uid();
  v_profile client_style_profiles;
  v_house_version int;
  v_house_vec vector;
  v_theta_h real[];
  v_theta_d real[];
  v_rho real := 0;
  v_cbar real := 0.4;
  v_w real;
  v_w_eff real := 0;
  v_vd vector;
  v_blend vector;
  v_query vector;
  v_weights jsonb;
  v_weights_version int;
  v_w_style real; v_w_spec real; v_w_taste real; v_w_mc real; v_w_budget real;
  v_w_function real; v_w_ctx real; v_w_patina real; v_w_beh real; v_w_pen real;
  v_client_s jsonb;
  v_client_c jsonb;
  v_aff jsonb;
  v_fp jsonb;
  v_patina_aff real;
  v_client_warmth real;
  v_bmin bigint; v_bmax bigint; v_omega real := 0;
  v_demand_kids boolean := false;
  v_layer text;
  v_limit int; v_offset int;
  v_n_explore int; v_exploit_needed int;
  v_total int := 0;
  v_room_w double precision; v_room_l double precision;
  v_pick uuid;
  v_nov double precision; v_nov_calc double precision; v_es_weight double precision;
  v_rank int;
  r record; rr record;
  v_reasons jsonb; v_cautions jsonb; v_used text[]; v_has_concrete boolean;
  v_band text; v_phrase text; v_reason jsonb; v_axis text;
  v_results jsonb := '[]'::jsonb;
  v_why jsonb;
  v_source text;
  v_latency int;
  i int;
BEGIN
  -- ── resolve + validate ──
  IF p_session_key IS NULL THEN
    RAISE EXCEPTION 'get_aesthete_matches: p_session_key is required (§10.1)';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- weights profile: highest active version of the requested name, falling
  -- back to 'default' (§5.5).
  SELECT mwp.weights, mwp.version INTO v_weights, v_weights_version
    FROM match_weight_profiles mwp
   WHERE mwp.name = COALESCE(p_weights_profile, 'default') AND mwp.is_active
   ORDER BY mwp.version DESC LIMIT 1;
  IF v_weights IS NULL AND COALESCE(p_weights_profile, 'default') <> 'default' THEN
    SELECT mwp.weights, mwp.version INTO v_weights, v_weights_version
      FROM match_weight_profiles mwp
     WHERE mwp.name = 'default' AND mwp.is_active
     ORDER BY mwp.version DESC LIMIT 1;
  END IF;
  IF v_weights IS NULL THEN
    RAISE EXCEPTION 'get_aesthete_matches: no active match_weight_profiles row (seed missing?)';
  END IF;
  v_w_style    := COALESCE((v_weights->>'style_dense')::real, 0.30);
  v_w_spec     := COALESCE((v_weights->>'spectrum')::real, 0.15);
  v_w_taste    := COALESCE((v_weights->>'taste')::real, 0.12);
  v_w_mc       := COALESCE((v_weights->>'material_color')::real, 0.10);
  v_w_budget   := COALESCE((v_weights->>'budget')::real, 0.10);
  v_w_function := COALESCE((v_weights->>'function')::real, 0.08);
  v_w_ctx      := COALESCE((v_weights->>'context')::real, 0.05);
  v_w_patina   := COALESCE((v_weights->>'patina')::real, 0.05);
  v_w_beh      := COALESCE((v_weights->>'behavioral')::real, 0.05);
  v_w_pen      := COALESCE((v_weights->>'penalty')::real, 0.30);

  -- client profile by bearer capability: unknown keys 404 (§7.1/§10.2).
  SELECT csp.* INTO v_profile
    FROM client_style_profiles csp
   WHERE csp.session_key = p_session_key AND csp.is_current
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'get_aesthete_matches: unknown session_key' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.user_id IS NOT NULL AND v_caller IS NOT NULL AND v_caller <> v_profile.user_id THEN
    RAISE EXCEPTION 'get_aesthete_matches: this session_key belongs to another account' USING ERRCODE = '42501';
  END IF;

  -- layer visibility — enforced INTERNALLY (DEFINER bypasses RLS, §5.6):
  -- anon ⇒ catalog only, whatever was asked for.
  v_layer := COALESCE(p_layer, 'catalog');
  IF v_layer NOT IN ('personal', 'studio', 'catalog') THEN
    RAISE EXCEPTION 'get_aesthete_matches: p_layer must be personal|studio|catalog, got %', v_layer;
  END IF;
  IF v_caller IS NULL THEN
    v_layer := 'catalog';
  END IF;

  -- house (active row; provisional v1 seed from 00242 until House Hundred).
  SELECT ht.version, ht.taste_vector, ht.theta
    INTO v_house_version, v_house_vec, v_theta_h
    FROM house_taste ht WHERE ht.status = 'active'
   ORDER BY ht.version DESC LIMIT 1;

  -- designer + dial (§9.2/§9.3).
  IF p_designer_id IS NOT NULL THEN
    SELECT COALESCE(dtp.reliability, 0.15), dtp.theta,
           COALESCE(dtp.taste_vector, dtp.portfolio_centroid)
      INTO v_rho, v_theta_d, v_vd
      FROM designer_taste_profiles dtp
     WHERE dtp.designer_id = p_designer_id AND dtp.retired_at IS NULL;
    IF NOT FOUND THEN
      v_rho := 0.15;  -- §9.3 cold start: dial exists from day one, bends slowly
    END IF;
    SELECT COALESCE(avg(dsc.weight), 0.4) INTO v_cbar
      FROM designer_style_confidence dsc WHERE dsc.designer_id = p_designer_id;
  END IF;
  v_w := LEAST(1.0, GREATEST(0.0,
          COALESCE(p_w, CASE WHEN p_designer_id IS NOT NULL THEN 0.35 ELSE 0 END)));
  v_w_eff := v_w * v_rho * v_cbar;   -- global w_eff (tinting + logging; header note)

  -- v_blend (dense, ANN tinting only) with §9.2 NULL-handling.
  IF v_vd IS NOT NULL AND v_house_vec IS NOT NULL THEN
    v_blend := vec_normalize(vec_lerp(v_vd, v_house_vec, v_w_eff));
  ELSIF v_vd IS NOT NULL THEN
    v_blend := v_vd;
  ELSE
    v_blend := v_house_vec;          -- may be NULL → tinting skipped
  END IF;

  -- v_query (§10.2 Stage 1): 0.8·v_client + 0.2·v_blend.
  IF v_profile.style_vector IS NOT NULL THEN
    IF v_blend IS NOT NULL THEN
      v_query := vec_normalize(vec_scale(v_profile.style_vector, 0.8) + vec_scale(v_blend, 0.2));
    ELSE
      v_query := v_profile.style_vector;
    END IF;
  END IF;

  -- client-side scoring inputs.
  v_client_s := jsonb_strip_nulls(jsonb_build_object(
    'warmth', v_profile.warmth, 'complexity', v_profile.complexity,
    'formality', v_profile.formality, 'timelessness', v_profile.timelessness,
    'boldness', v_profile.boldness, 'craftsmanship', v_profile.craftsmanship));
  v_client_c := COALESCE(v_profile.spectrum_confidence, '{}'::jsonb);
  v_aff := COALESCE(v_profile.material_affinities, '{}'::jsonb);
  v_fp := COALESCE(v_profile.functional_priorities, '{}'::jsonb);
  v_patina_aff := COALESCE(v_profile.patina_affinity, 0);
  v_client_warmth := v_profile.warmth;
  v_bmin := NULLIF(v_profile.budget->>'min_cents', '')::bigint;
  v_bmax := NULLIF(v_profile.budget->>'max_cents', '')::bigint;
  v_omega := COALESCE((v_profile.budget->>'value_orientation')::real, 0);
  v_demand_kids := (v_fp->>'durability') = 'kids_pets';

  IF p_room_id IS NOT NULL THEN
    SELECT rm.width_meters, rm.length_meters INTO v_room_w, v_room_l
      FROM rooms rm WHERE rm.id = p_room_id;
  END IF;

  -- ANN session knobs, guarded by which index landed (§5.1/§10.2).
  IF v_query IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_indexes pi WHERE pi.schemaname = 'public' AND pi.indexname = 'idx_products_aesthete_hnsw') THEN
      EXECUTE 'SET LOCAL hnsw.ef_search = 100';
    ELSIF EXISTS (SELECT 1 FROM pg_indexes pi WHERE pi.schemaname = 'public' AND pi.indexname = 'idx_products_aesthete_ivf') THEN
      EXECUTE 'SET LOCAL ivfflat.probes = 10';
    END IF;
  END IF;

  -- ── Stage 0: hard filters + enrichment (§10.2) ──
  DROP TABLE IF EXISTS _ae_base;
  CREATE TEMP TABLE _ae_base (
    pid uuid PRIMARY KEY, pname text, pbrand text, pcategory text, pprice int,
    pmaterials text[], pvec vector(768), pdims jsonb, pstatus text, plead int,
    pspec jsonb, pspec_conf jsonb, pspec_origin text,
    pstyle_id uuid, pstyle_name text,
    ppatina real, phonesty real, pcraft real, pcolor_temp real, pcolor text,
    pdurable text[], pcomfort real, pflex real, pfunction text,
    pvalue_story text, pprovenance text, pdna_conf jsonb, has_dna boolean,
    rattrs jsonb
  ) ON COMMIT DROP;

  INSERT INTO _ae_base
  SELECT p.id, p.name, p.brand, p.category, p.price_retail,
         p.materials, p.aesthete_vector, p.dimensions, p.status, p.lead_time_weeks,
         sp.spectrums, sp.conf, sp.origin,
         prim.style_id, prim.style_name,
         d.patina_potential, d.material_honesty, d.craftsmanship_tier, d.color_temperature,
         d.dominant_color,
         d.durability_for, d.comfort, d.flexibility, d.primary_function,
         d.value_story, d.provenance_story, d.confidence, (d.product_id IS NOT NULL),
         jsonb_strip_nulls(COALESCE(sp.spectrums, '{}'::jsonb) || jsonb_build_object(
           'category', p.category, 'subcategory', p.subcategory, 'brand', p.brand,
           'layer', p.layer, 'price_retail', p.price_retail,
           'materials', CASE WHEN p.materials IS NOT NULL THEN to_jsonb(p.materials) END,
           'style', prim.style_name,
           'patina_potential', d.patina_potential, 'material_honesty', d.material_honesty,
           'craftsmanship_tier', d.craftsmanship_tier, 'color_temperature', d.color_temperature,
           'dominant_color', d.dominant_color, 'palette_family', d.palette_family,
           'sheen', d.sheen, 'pattern_density', d.pattern_density,
           'line_quality', d.line_quality, 'visual_scale', d.visual_scale))
    FROM products p
    LEFT JOIN LATERAL (SELECT ps.spectrums, ps.conf, ps.origin
                         FROM _aesthete_product_spectrum(p.id) ps) sp ON true
    LEFT JOIN product_dna d ON d.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT ps2.style_id, st.name AS style_name
        FROM product_styles ps2 JOIN styles st ON st.id = ps2.style_id
       WHERE ps2.product_id = p.id
       ORDER BY ps2.is_primary DESC NULLS LAST, ps2.confidence DESC NULLS LAST, st.name
       LIMIT 1) prim ON true
   WHERE p.deleted_at IS NULL
     AND p.merged_into_id IS NULL
     AND CASE v_layer
           WHEN 'catalog' THEN p.layer = 'catalog' AND p.status = 'published'
           WHEN 'personal' THEN p.layer = 'personal' AND p.owner_user_id = v_caller
                AND COALESCE(p.status, 'draft') NOT IN ('deprecated', 'archived')
           WHEN 'studio' THEN p.layer = 'studio'
                AND p.studio_id IN (SELECT om.organization_id FROM organization_members om
                                     WHERE om.user_id = v_caller AND om.status = 'active')
                AND COALESCE(p.status, 'draft') NOT IN ('deprecated', 'archived')
         END
     AND (p_category IS NULL OR p.category = p_category)
     -- price ≤ 1.25·budget_max when present; NULL prices pass (missing data
     -- is never an exclusion — T_budget just drops for them) (§10.2/§10.4)
     AND (v_bmax IS NULL OR p.price_retail IS NULL OR p.price_retail::numeric <= 1.25 * v_bmax)
     -- designer contraindications (designer_clients.contraindicated_style_ids):
     -- Phase-2 column — does not exist yet (§7.3); filter lands with it.
     -- kids/pets durability demand (§10.2): exclude only on an explicit
     -- honest contraindication; missing DNA never excludes.
     AND (NOT v_demand_kids
          OR d.maintenance_reality IS NULL
          OR NOT (COALESCE(d.maintenance_reality->>'kids', '') IN ('avoid', 'no')
               OR COALESCE(d.maintenance_reality->>'pets', '') IN ('avoid', 'no')));

  -- taste_rules action='block' — hard pre-filter (§10.2, salvage §c).
  DELETE FROM _ae_base b
   WHERE EXISTS (
     SELECT 1 FROM taste_rules tr
      WHERE tr.status = 'active' AND tr.action = 'block'
        AND (tr.owner_scope = 'house' OR (p_designer_id IS NOT NULL AND tr.designer_id = p_designer_id))
        AND (tr.scope = 'global'
             OR (tr.scope = 'category' AND tr.scope_value = b.pcategory)
             OR (tr.scope = 'style' AND (tr.scope_value = b.pstyle_id::text OR tr.scope_value = b.pstyle_name)))
        AND _aesthete_rule_matches(tr.predicate, b.rattrs));

  -- ── Stage 1: candidates (§10.2) ──
  DROP TABLE IF EXISTS _ae_cand;
  CREATE TEMP TABLE _ae_cand (pid uuid PRIMARY KEY, cdist real) ON COMMIT DROP;

  IF v_query IS NOT NULL THEN
    -- ANN top-200 by aesthete_vector <=> v_query (exact scan over the
    -- hard-filtered set — §12.3 accepts this at MVP scale).
    INSERT INTO _ae_cand (pid, cdist)
    SELECT b.pid, (b.pvec <=> v_query)::real
      FROM _ae_base b
     WHERE b.pvec IS NOT NULL
     ORDER BY b.pvec <=> v_query, b.pid
     LIMIT 200;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM _ae_cand) THEN
    -- Spectrum-only candidate generation — THE working path until product
    -- vectors exist (client style_vector NULL in local dev): every
    -- hard-filtered product with any spectrum row (canonical or draft),
    -- capped 200 by spectrum distance.
    INSERT INTO _ae_cand (pid, cdist)
    SELECT b.pid, COALESCE(_aesthete_spectrum_distance(v_client_s, b.pspec), 2.0)
      FROM _ae_base b
     WHERE b.pspec IS NOT NULL
     ORDER BY COALESCE(_aesthete_spectrum_distance(v_client_s, b.pspec), 2.0), b.pid
     LIMIT 200;
  END IF;

  -- ── Stage 2: scoring (§10.3) ──
  DROP TABLE IF EXISTS _ae_scored;
  CREATE TEMP TABLE _ae_scored (
    pid uuid PRIMARY KEY, pname text, pbrand text, pcolor text, pvec vector(768),
    pprice int, plead int, pstatus text, pspec jsonb, pspec_conf jsonb,
    pdna_conf jsonb, has_dna boolean,
    t_style_dense real, t_spectrum real, t_taste real, t_mc real,
    t_budget real, b_over boolean, b_soft boolean,
    t_function real, t_context real, t_patina real, t_behavioral real,
    pen real, rule_adj real, weff_p real,
    w_avail real, s_score real, row_conf real, contributions jsonb
  ) ON COMMIT DROP;

  INSERT INTO _ae_scored
  SELECT z.pid, z.pname, z.pbrand, z.pcolor, z.pvec, z.pprice, z.plead, z.pstatus,
         z.pspec, z.pspec_conf, z.pdna_conf, z.has_dna,
         z.t_style_dense, z.t_spectrum, z.t_taste, z.t_mc,
         z.t_budget, z.b_over, z.b_soft,
         z.t_function, z.t_context, z.t_patina, z.t_behavioral,
         z.pen, z.rule_adj, z.weff_p,
         z.w_avail,
         -- S = Σ w_t·T_t / Σ w_t(available)  −  w_pen·P  +  soft-rule adj
         (CASE WHEN z.w_avail > 0 THEN
            (COALESCE(z.t_style_dense * v_w_style, 0)
           + COALESCE(z.t_spectrum * v_w_spec, 0)
           + COALESCE(z.t_taste * v_w_taste * z.weff_p, 0)
           + COALESCE(z.t_mc * v_w_mc, 0)
           + COALESCE(z.t_budget * v_w_budget, 0)
           + COALESCE(z.t_function * v_w_function, 0)
           + COALESCE(z.t_context * v_w_ctx, 0)
           + COALESCE(z.t_patina * v_w_patina, 0)
           + COALESCE(z.t_behavioral * v_w_beh, 0)) / z.w_avail
          ELSE 0.5 END
          - v_w_pen * COALESCE(z.pen, 0) + z.rule_adj)::real,
         -- row confidence = Σ(available weights) × mean(attr confidences)
         (z.w_avail * COALESCE((
            SELECT avg(cx.x) FROM unnest(ARRAY[
              CASE WHEN z.t_style_dense IS NOT NULL THEN 1.0 END,
              CASE WHEN z.t_spectrum IS NOT NULL THEN
                (SELECT avg(e.value::numeric)::double precision FROM jsonb_each_text(z.pspec_conf) e) END,
              CASE WHEN z.has_dna THEN COALESCE(
                (SELECT avg(e2.value::numeric)::double precision FROM jsonb_each_text(z.pdna_conf) e2), 0.6) END,
              CASE WHEN z.t_budget IS NOT NULL THEN 1.0 END
            ]) cx(x) WHERE cx.x IS NOT NULL), 0.5))::real,
         -- per-term weighted contributions (renormalized) — the why's terms
         -- map AND the match_events audit payload (salvage §d two-layer idea)
         CASE WHEN z.w_avail > 0 THEN jsonb_strip_nulls(jsonb_build_object(
           'style_dense', CASE WHEN z.t_style_dense IS NOT NULL THEN round((z.t_style_dense * v_w_style / z.w_avail)::numeric, 4) END,
           'spectrum', CASE WHEN z.t_spectrum IS NOT NULL THEN round((z.t_spectrum * v_w_spec / z.w_avail)::numeric, 4) END,
           'taste', CASE WHEN z.t_taste IS NOT NULL THEN round((z.t_taste * v_w_taste * z.weff_p / z.w_avail)::numeric, 4) END,
           'material_color', CASE WHEN z.t_mc IS NOT NULL THEN round((z.t_mc * v_w_mc / z.w_avail)::numeric, 4) END,
           'budget', CASE WHEN z.t_budget IS NOT NULL THEN round((z.t_budget * v_w_budget / z.w_avail)::numeric, 4) END,
           'function', CASE WHEN z.t_function IS NOT NULL THEN round((z.t_function * v_w_function / z.w_avail)::numeric, 4) END,
           'context', CASE WHEN z.t_context IS NOT NULL THEN round((z.t_context * v_w_ctx / z.w_avail)::numeric, 4) END,
           'patina', CASE WHEN z.t_patina IS NOT NULL THEN round((z.t_patina * v_w_patina / z.w_avail)::numeric, 4) END,
           'behavioral', CASE WHEN z.t_behavioral IS NOT NULL THEN round((z.t_behavioral * v_w_beh / z.w_avail)::numeric, 4) END,
           'penalty', CASE WHEN COALESCE(z.pen, 0) > 0 THEN round((-v_w_pen * z.pen)::numeric, 4) END,
           'rule_adj', CASE WHEN z.rule_adj <> 0 THEN round(z.rule_adj::numeric, 4) END))
         ELSE '{}'::jsonb END
  FROM (
    SELECT y.*,
           (CASE WHEN y.t_style_dense IS NOT NULL THEN v_w_style ELSE 0 END
          + CASE WHEN y.t_spectrum IS NOT NULL THEN v_w_spec ELSE 0 END
          + CASE WHEN y.t_taste IS NOT NULL THEN v_w_taste * y.weff_p ELSE 0 END
          + CASE WHEN y.t_mc IS NOT NULL THEN v_w_mc ELSE 0 END
          + CASE WHEN y.t_budget IS NOT NULL THEN v_w_budget ELSE 0 END
          + CASE WHEN y.t_function IS NOT NULL THEN v_w_function ELSE 0 END
          + CASE WHEN y.t_context IS NOT NULL THEN v_w_ctx ELSE 0 END
          + CASE WHEN y.t_patina IS NOT NULL THEN v_w_patina ELSE 0 END
          + CASE WHEN y.t_behavioral IS NOT NULL THEN v_w_beh ELSE 0 END)::real AS w_avail
    FROM (
      SELECT b.pid, b.pname, b.pbrand, b.pcolor, b.pvec, b.pprice, b.plead, b.pstatus,
             b.pspec, b.pspec_conf, b.pdna_conf, b.has_dna,
             -- T_style_dense: affine-calibrated cosine (§10.3)
             CASE WHEN v_query IS NOT NULL AND b.pvec IS NOT NULL
                  THEN LEAST(1.0, GREATEST(0.0, ((1.0 - (b.pvec <=> v_query)) - 0.25) / 0.60))::real
             END AS t_style_dense,
             _aesthete_spectrum_term(v_client_s, v_client_c, b.pspec, b.pspec_conf) AS t_spectrum,
             -- T_taste: σ(θ_blendᵀφ); θ_blend per-product via c_D(g) (§9.2)
             CASE WHEN (v_theta_h IS NOT NULL OR v_theta_d IS NOT NULL) AND (v_w * v_rho) > 0
                  THEN _aesthete_taste_term(
                         _aesthete_theta_blend(v_theta_h, v_theta_d,
                           (v_w * v_rho * COALESCE(dsc.weight, 0.4))::real), b.pid)
             END AS t_taste,
             _aesthete_material_color_term(v_aff, b.pmaterials, b.pcolor_temp, v_client_warmth) AS t_mc,
             bt.t AS t_budget, COALESCE(bt.over_anchor, false) AS b_over, COALESCE(bt.softened, false) AS b_soft,
             _aesthete_function_term(v_fp, b.pdurable, b.pcomfort, b.pflex, b.pfunction,
                                     (b.pspec->>'complexity')::real) AS t_function,
             _aesthete_context_term(b.pdims, v_room_w::real, v_room_l::real) AS t_context,
             CASE WHEN b.ppatina IS NOT NULL OR b.phonesty IS NOT NULL
                  THEN GREATEST(COALESCE(b.ppatina, 0) * v_patina_aff,
                                COALESCE(b.phonesty, 0) * 0.4)::real
             END AS t_patina,
             LEAST(1.0, COALESCE(pbs.smoothed_save_rate, 0.1) / 0.2)::real AS t_behavioral,
             LEAST(1.0,
               CASE WHEN b.pstatus IN ('deprecated', 'archived') THEN 0.7 ELSE 0 END
             + CASE WHEN b.plead >= 20 THEN 0.2 WHEN b.plead >= 12 THEN 0.1 ELSE 0 END)::real AS pen,
             COALESCE(radj.adj, 0)::real AS rule_adj,
             (v_w * v_rho * COALESCE(dsc.weight, 0.4))::real AS weff_p
        FROM _ae_cand c
        JOIN _ae_base b ON b.pid = c.pid
        LEFT JOIN designer_style_confidence dsc
               ON p_designer_id IS NOT NULL
              AND dsc.designer_id = p_designer_id AND dsc.style_id = b.pstyle_id
        LEFT JOIN product_behavior_stats pbs ON pbs.product_id = b.pid
        LEFT JOIN LATERAL _aesthete_budget_term(
               b.pprice, v_bmin, v_bmax, v_omega, b.pcraft,
               (b.pvalue_story IS NOT NULL OR b.pprovenance IS NOT NULL)) bt ON true
        LEFT JOIN LATERAL (
          -- COALESCE inside: GREATEST/LEAST ignore NULLs, so an empty rule
          -- set would otherwise clamp to -0.5 instead of 0.
          SELECT LEAST(0.5, GREATEST(-0.5, COALESCE(
                   sum(CASE tr.action WHEN 'boost' THEN tr.magnitude ELSE -tr.magnitude END), 0)))::real AS adj
            FROM taste_rules tr
           WHERE tr.status = 'active' AND tr.action IN ('boost', 'bury')
             AND (tr.owner_scope = 'house' OR (p_designer_id IS NOT NULL AND tr.designer_id = p_designer_id))
             AND (tr.scope = 'global'
                  OR (tr.scope = 'category' AND tr.scope_value = b.pcategory)
                  OR (tr.scope = 'style' AND (tr.scope_value = b.pstyle_id::text OR tr.scope_value = b.pstyle_name)))
             AND _aesthete_rule_matches(tr.predicate, b.rattrs)) radj ON true
    ) y
  ) z;

  SELECT count(*)::int INTO v_total FROM _ae_scored;

  -- ── deterministic exploration seed (§10.5): per (session_key, day) ──
  PERFORM setseed(GREATEST(-1.0, LEAST(1.0,
    hashtext(p_session_key::text || current_date::text)::double precision / 2147483648.0)));

  -- exploration floor (§10.5/§13): GREATEST(1, floor(ratio·limit)), capped
  -- at limit−1 (a 1-row page stays exploit) and later at pool size.
  v_n_explore := LEAST(
    GREATEST(1, floor(LEAST(GREATEST(COALESCE(p_explore_ratio, 0.2), 0.0), 0.5) * v_limit)::int),
    GREATEST(v_limit - 1, 0));
  v_exploit_needed := v_offset + (v_limit - v_n_explore);

  -- ── MMR diversification (salvage §b: λ = 0.8; caps ≤3/brand, ≤5/color) ──
  DROP TABLE IF EXISTS _ae_out;
  CREATE TEMP TABLE _ae_out (
    pid uuid PRIMARY KEY, sel_order int, page_rank int, explore boolean, why jsonb
  ) ON COMMIT DROP;

  FOR i IN 1..v_exploit_needed LOOP
    EXIT WHEN i > v_total;
    v_pick := NULL;
    SELECT s.pid INTO v_pick
      FROM _ae_scored s
     WHERE NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = s.pid)
       AND (s.pbrand IS NULL OR (SELECT count(*) FROM _ae_out o2 JOIN _ae_scored s2 ON s2.pid = o2.pid
                                  WHERE s2.pbrand = s.pbrand) < 3)
       AND (s.pcolor IS NULL OR (SELECT count(*) FROM _ae_out o3 JOIN _ae_scored s3 ON s3.pid = o3.pid
                                  WHERE s3.pcolor = s.pcolor) < 5)
     ORDER BY
       0.8 * LEAST(1.0, GREATEST(0.0, s.s_score))
       + 0.2 * COALESCE((
           -- diversity vs the already-selected set: 0.6·feature + 0.4·embedding
           -- when vectors exist, feature-only otherwise (salvage §b)
           SELECT CASE
             WHEN s.pvec IS NOT NULL AND bool_or(s5.pvec IS NOT NULL) THEN
               0.6 * (1.0
                 - 0.5 * max(CASE WHEN s.pbrand IS NOT NULL AND s5.pbrand = s.pbrand THEN 1 ELSE 0 END)
                 - 0.5 * max(CASE WHEN s.pcolor IS NOT NULL AND s5.pcolor = s.pcolor THEN 1 ELSE 0 END))
               + 0.4 * LEAST(1.0, min(CASE WHEN s5.pvec IS NOT NULL THEN (s.pvec <=> s5.pvec) END))
             ELSE
               (1.0
                 - 0.5 * max(CASE WHEN s.pbrand IS NOT NULL AND s5.pbrand = s.pbrand THEN 1 ELSE 0 END)
                 - 0.5 * max(CASE WHEN s.pcolor IS NOT NULL AND s5.pcolor = s.pcolor THEN 1 ELSE 0 END))
           END
           FROM _ae_out o5 JOIN _ae_scored s5 ON s5.pid = o5.pid), 1.0) DESC,
       s.pid
     LIMIT 1;

    IF v_pick IS NULL THEN
      -- caps exhausted the pool — relax them rather than return a short page
      SELECT s.pid INTO v_pick FROM _ae_scored s
       WHERE NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = s.pid)
       ORDER BY s.s_score DESC, s.pid LIMIT 1;
    END IF;
    EXIT WHEN v_pick IS NULL;

    INSERT INTO _ae_out (pid, sel_order, page_rank, explore)
    VALUES (v_pick, i, CASE WHEN i > v_offset THEN i - v_offset END, false);
  END LOOP;

  -- ── exploration slots (§10.5): Boltzmann·novelty over ranks 20–80 ──
  DROP TABLE IF EXISTS _ae_pool;
  CREATE TEMP TABLE _ae_pool (pid uuid PRIMARY KEY, s_score real, skey double precision) ON COMMIT DROP;

  INSERT INTO _ae_pool (pid, s_score)
  SELECT rk.rpid, rk.rscore
    FROM (SELECT s.pid AS rpid, s.s_score AS rscore,
                 row_number() OVER (ORDER BY s.s_score DESC, s.pid)::int AS rn
            FROM _ae_scored s) rk
   WHERE rk.rn BETWEEN 20 AND 80
     AND NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = rk.rpid);

  IF NOT EXISTS (SELECT 1 FROM _ae_pool) THEN
    -- small-catalog fallback (header note): all non-selected candidates
    INSERT INTO _ae_pool (pid, s_score)
    SELECT s.pid, s.s_score FROM _ae_scored s
     WHERE NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = s.pid);
  END IF;

  -- Efraimidis–Spirakis weighted sampling without replacement, iterated in a
  -- FIXED order so the seeded random() stream is reproducible within a day.
  FOR rr IN SELECT pl.pid AS ppid, pl.s_score AS pscore FROM _ae_pool pl
             ORDER BY pl.s_score DESC, pl.pid LOOP
    v_nov := 0.7;  -- §10.5 no-history default
    IF v_profile.user_id IS NOT NULL THEN
      SELECT 1.0 - max(1.0 - (sp.pvec <=> hp.aesthete_vector)) INTO v_nov_calc
        FROM _ae_scored sp,
             interactions ia JOIN products hp ON hp.id::text = ia.product_id
       WHERE sp.pid = rr.ppid AND sp.pvec IS NOT NULL
         AND ia.user_id = v_profile.user_id AND ia.event_type = 'save'
         AND hp.aesthete_vector IS NOT NULL;
      IF v_nov_calc IS NOT NULL THEN v_nov := v_nov_calc; END IF;
    END IF;
    v_es_weight := exp(LEAST(1.0, GREATEST(0.0, rr.pscore)) / 0.1) * GREATEST(v_nov, 0.05);
    UPDATE _ae_pool pl SET skey = power(random(), 1.0 / v_es_weight) WHERE pl.pid = rr.ppid;
  END LOOP;

  v_rank := (SELECT count(*)::int FROM _ae_out o WHERE o.page_rank IS NOT NULL);
  FOR rr IN SELECT pl.pid AS ppid FROM _ae_pool pl
             ORDER BY pl.skey DESC NULLS LAST, pl.pid LIMIT v_n_explore LOOP
    v_rank := v_rank + 1;
    INSERT INTO _ae_out (pid, sel_order, page_rank, explore)
    VALUES (rr.ppid, NULL, v_rank, true);
  END LOOP;

  -- ── the "why" payload (§10.6) — computed from the same scored terms ──
  DROP TABLE IF EXISTS _ae_rsn;
  CREATE TEMP TABLE _ae_rsn (term text, tval real, contrib real, concrete boolean) ON COMMIT DROP;

  FOR r IN
    SELECT o.pid AS opid, o.page_rank AS oprank, o.explore AS oexplore,
           s.pprice, s.plead, s.pstatus, s.pspec,
           s.t_style_dense, s.t_spectrum, s.t_taste, s.t_mc,
           s.t_budget, s.b_over, s.b_soft,
           s.t_function, s.t_context, s.t_patina, s.t_behavioral, s.pen,
           s.w_avail, s.s_score, s.row_conf, s.contributions
      FROM _ae_out o JOIN _ae_scored s ON s.pid = o.pid
     WHERE o.page_rank IS NOT NULL
     ORDER BY o.page_rank
  LOOP
    -- candidate reasons: per-term floors keep the copy honest (behavioral
    -- must beat its own prior; patina's ceiling is structurally low).
    -- TRUNCATE, not bare DELETE: PostgREST sessions load safeupdate, which
    -- rejects DELETE without WHERE even on temp tables.
    TRUNCATE _ae_rsn;
    INSERT INTO _ae_rsn (term, tval, contrib, concrete)
    SELECT x.term, x.tval, COALESCE((r.contributions->>x.term)::real, 0), x.concrete
      FROM (VALUES
        ('style_dense',    r.t_style_dense, false, 0.45::real),
        ('spectrum',       r.t_spectrum,    false, 0.45),
        ('taste',          r.t_taste,       false, 0.50),
        ('material_color', r.t_mc,          true,  0.45),
        ('budget',         r.t_budget,      true,  0.50),
        ('function',       r.t_function,    true,  0.50),
        ('context',        CASE WHEN p_room_id IS NOT NULL THEN r.t_context END, true, 0.55),
        ('patina',         r.t_patina,      true,  0.30),
        ('behavioral',     r.t_behavioral,  false, 0.65)
      ) x(term, tval, concrete, floor_t)
     WHERE x.tval IS NOT NULL AND x.tval >= x.floor_t;

    v_reasons := '[]'::jsonb;
    v_used := '{}'::text[];
    v_has_concrete := false;

    FOR rr IN SELECT n.term AS nterm, n.tval AS ntval, n.contrib AS ncontrib, n.concrete AS nconcrete
                FROM _ae_rsn n ORDER BY n.contrib DESC NULLS LAST, n.term LOOP
      EXIT WHEN jsonb_array_length(v_reasons) >= 3;
      v_band := CASE WHEN rr.nterm = 'budget' AND r.b_soft THEN 'value_story'
                     WHEN rr.ntval >= 0.66 THEN 'high' ELSE 'mid' END;
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = rr.nterm AND wp.band = v_band;
      IF v_phrase IS NULL THEN
        SELECT wp.template INTO v_phrase FROM why_phrases wp
         WHERE wp.term = 'generic' AND wp.band = CASE WHEN rr.ntval >= 0.66 THEN 'high' ELSE 'mid' END;
      END IF;
      CONTINUE WHEN v_phrase IS NULL;
      v_reason := jsonb_build_object('term', rr.nterm, 'phrase', v_phrase,
                                     'contribution', round(rr.ncontrib::numeric, 4));
      IF rr.nterm = 'budget' THEN
        v_reason := v_reason || jsonb_build_object('detail', jsonb_build_object(
          'perception', CASE WHEN r.b_over THEN 'stretch' ELSE 'fair' END,
          'price_cents', r.pprice));
      END IF;
      v_reasons := v_reasons || v_reason;
      v_used := v_used || rr.nterm;
      IF rr.nconcrete THEN v_has_concrete := true; END IF;
    END LOOP;

    -- ≥ 1 concrete reason (material/dimension/price — §10.6): swap the last
    -- pick for the best available concrete term when none made the cut.
    IF NOT v_has_concrete THEN
      SELECT n.term AS nterm, n.tval AS ntval, n.contrib AS ncontrib INTO rr
        FROM _ae_rsn n
       WHERE n.concrete AND NOT (n.term = ANY(v_used)) AND n.tval >= 0.40
       ORDER BY n.contrib DESC NULLS LAST, n.term LIMIT 1;
      IF FOUND THEN
        v_band := CASE WHEN rr.nterm = 'budget' AND r.b_soft THEN 'value_story'
                       WHEN rr.ntval >= 0.66 THEN 'high' ELSE 'mid' END;
        SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = rr.nterm AND wp.band = v_band;
        IF v_phrase IS NOT NULL THEN
          v_reason := jsonb_build_object('term', rr.nterm, 'phrase', v_phrase,
                                         'contribution', round(rr.ncontrib::numeric, 4));
          IF rr.nterm = 'budget' THEN
            v_reason := v_reason || jsonb_build_object('detail', jsonb_build_object(
              'perception', CASE WHEN r.b_over THEN 'stretch' ELSE 'fair' END,
              'price_cents', r.pprice));
          END IF;
          IF jsonb_array_length(v_reasons) >= 3 THEN
            v_reasons := (v_reasons - (jsonb_array_length(v_reasons) - 1)) || v_reason;
          ELSE
            v_reasons := v_reasons || v_reason;
          END IF;
        END IF;
      END IF;
    END IF;

    -- cautions (§10.6): budget stretch, room fit, penalty leaks
    v_cautions := '[]'::jsonb;
    IF r.b_over AND r.t_budget IS NOT NULL AND r.t_budget < 0.5 THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'budget' AND wp.band = 'caution_over';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'budget', 'phrase', v_phrase,
          'penalty', round(((r.t_budget - 0.5) * v_w_budget)::numeric, 4));
      END IF;
    END IF;
    IF p_room_id IS NOT NULL AND r.t_context IS NOT NULL AND r.t_context <= 0.45 THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'context' AND wp.band = 'caution';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'context', 'phrase', v_phrase,
          'penalty', round(((r.t_context - 0.5) * v_w_ctx)::numeric, 4));
      END IF;
    END IF;
    IF r.pstatus IN ('deprecated', 'archived') THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'penalty' AND wp.band = 'discontinued';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'penalty', 'phrase', v_phrase,
          'penalty', round((-v_w_pen * 0.7)::numeric, 4));
      END IF;
    END IF;
    IF r.plead >= 12 THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'penalty' AND wp.band = 'lead_time';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'penalty', 'phrase', v_phrase,
          'penalty', round((-v_w_pen * CASE WHEN r.plead >= 20 THEN 0.2 ELSE 0.1 END)::numeric, 4));
      END IF;
    END IF;

    -- stretch copy for exploration rows (§10.5): honest, named axis
    v_axis := NULL;
    IF r.oexplore THEN
      SELECT dx.dim INTO v_axis
        FROM (VALUES
          ('warmth', v_profile.warmth, (r.pspec->>'warmth')::real),
          ('complexity', v_profile.complexity, (r.pspec->>'complexity')::real),
          ('formality', v_profile.formality, (r.pspec->>'formality')::real),
          ('timelessness', v_profile.timelessness, (r.pspec->>'timelessness')::real),
          ('boldness', v_profile.boldness, (r.pspec->>'boldness')::real),
          ('craftsmanship', v_profile.craftsmanship, (r.pspec->>'craftsmanship')::real)
        ) dx(dim, cs, ps)
       WHERE dx.cs IS NOT NULL AND dx.ps IS NOT NULL
       ORDER BY abs(dx.cs - dx.ps) DESC, dx.dim LIMIT 1;

      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'exploration' AND wp.band = 'stretch';
      IF v_phrase IS NOT NULL THEN
        v_reason := jsonb_build_object('term', 'exploration', 'phrase', v_phrase, 'contribution', 0);
        IF jsonb_array_length(v_reasons) >= 3 THEN
          v_reasons := (v_reasons - (jsonb_array_length(v_reasons) - 1)) || v_reason;
        ELSE
          v_reasons := v_reasons || v_reason;
        END IF;
      END IF;
    END IF;

    v_why := jsonb_build_object(
      'score', round((100 * LEAST(1.0, GREATEST(0.0, r.s_score)))::numeric),
      'confidence', round(r.row_conf::numeric, 2),
      'is_exploration', r.oexplore,
      'weights_version', v_weights_version,
      'blend', jsonb_build_object(
        'w', round(v_w::numeric, 4), 'w_effective', round(v_w_eff::numeric, 4),
        'designer_id', p_designer_id, 'house_version', v_house_version),
      'terms', COALESCE(r.contributions, '{}'::jsonb),
      'top_reasons', v_reasons,
      'cautions', v_cautions,
      'stretch_axis', v_axis);

    UPDATE _ae_out o SET why = v_why WHERE o.pid = r.opid;

    v_results := v_results || jsonb_build_object(
      'product_id', r.opid, 'score', round(r.s_score::numeric, 4),
      'terms', COALESCE(r.contributions, '{}'::jsonb), 'is_exploration', r.oexplore);
  END LOOP;

  -- ── log ONE match_events row per call (§5.5/§12.4) ──
  v_source := COALESCE(NULLIF(current_setting('aesthete.match_source', true), ''),
                       CASE WHEN v_caller IS NULL THEN 'quiz' ELSE 'client_portal' END);
  v_latency := round(extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int;

  INSERT INTO match_events
    (session_key, user_id, designer_id, source, context,
     w, w_effective, house_version, weights_version, results, latency_ms)
  VALUES
    (p_session_key, v_profile.user_id, p_designer_id, v_source,
     jsonb_strip_nulls(jsonb_build_object(
       'category', p_category, 'room_id', p_room_id, 'layer', v_layer,
       'limit', v_limit, 'offset', v_offset,
       'explore_ratio', p_explore_ratio, 'candidates', v_total)),
     v_w, v_w_eff, v_house_version, v_weights_version, v_results, v_latency);

  RETURN QUERY
  SELECT o.pid, o.page_rank, s.s_score, s.row_conf, o.explore, o.why
    FROM _ae_out o JOIN _ae_scored s ON s.pid = o.pid
   WHERE o.page_rank IS NOT NULL
   ORDER BY o.page_rank;
END $fn$;

COMMENT ON FUNCTION get_aesthete_matches(uuid, uuid, real, text, uuid, text, int, int, real, text) IS
  'The match (design §10): hard filters → candidates (ANN when vectors exist, spectrum-only otherwise) → 10-term scoring warped by the §9.2 dial → salvaged MMR → 8-exploit + 2-explore slotting (deterministic per session/day) → per-term whys from why_phrases → one match_events row. SECURITY DEFINER with internal layer enforcement (anon ⇒ published catalog only); session_key is a bearer capability (unknown ⇒ P0002).';

-- ─── 7. aesthete_search — the Typesense seam (§3.2 #4, §10.2) ────────────────
-- SEAM CONTRACT: candidate generation ONLY. Callers (aesthete-ask, ⌘K)
-- union these ids into the same scorer — §10.2 Stage 1 is the single point
-- Typesense would ever replace; nothing downstream may depend on FTS
-- internals. SECURITY INVOKER on purpose: products RLS keeps it layer-aware
-- transitively (three-layer law); grant is authenticated-only (§18).
-- p_filters: {"category": text, "layer": text, "limit": int ≤ 200}.
CREATE OR REPLACE FUNCTION aesthete_search(p_query text, p_filters jsonb DEFAULT '{}')
RETURNS TABLE (product_id uuid, rank real, match_source text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE((p_filters->>'limit')::int, 50), 1), 200);
  v_category text := NULLIF(p_filters->>'category', '');
  v_layer text := NULLIF(p_filters->>'layer', '');
  v_tsq tsquery;
BEGIN
  IF p_query IS NULL OR btrim(p_query) = '' THEN RETURN; END IF;
  v_tsq := websearch_to_tsquery('english', p_query);

  RETURN QUERY
  SELECT p.id, ts_rank(p.search_vector, v_tsq)::real, 'fts'::text
    FROM products p
   WHERE p.search_vector @@ v_tsq
     AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
     AND (v_category IS NULL OR p.category = v_category)
     AND (v_layer IS NULL OR p.layer = v_layer)
   ORDER BY 2 DESC, p.id
   LIMIT v_limit;

  IF NOT FOUND THEN
    -- pg_trgm fallback (00056 extension): catches misspellings + names FTS
    -- stems away.
    RETURN QUERY
    SELECT p.id, similarity(p.name, p_query)::real, 'trgm'::text
      FROM products p
     WHERE p.deleted_at IS NULL AND p.merged_into_id IS NULL
       AND (v_category IS NULL OR p.category = v_category)
       AND (v_layer IS NULL OR p.layer = v_layer)
       AND similarity(p.name, p_query) > 0.2
     ORDER BY 2 DESC, p.id
     LIMIT v_limit;
  END IF;
END $fn$;

COMMENT ON FUNCTION aesthete_search(text, jsonb) IS
  'Keyword/facet candidate entry — THE Typesense seam (design §3.2 #4/§10.2): FTS over products.search_vector with a pg_trgm name fallback. SECURITY INVOKER: products RLS enforces the three-layer law transitively. Returns candidate ids + rank only; callers union into the §10 scorer. Replacing this function is the entire Typesense migration.';

-- ─── 8. Grants ───────────────────────────────────────────────────────────────
-- Internal helpers: no client execution.
REVOKE ALL ON FUNCTION _aesthete_product_spectrum(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_spectrum_term(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_spectrum_distance(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_material_bucket(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_material_color_term(jsonb, text[], real, real) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_budget_term(int, bigint, bigint, real, real, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_function_term(jsonb, text[], real, real, text, real) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_utilization(double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_context_term(jsonb, real, real) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_rule_cond(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_rule_matches(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_theta_blend(real[], real[], real) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_phi(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_taste_term(real[], uuid) FROM PUBLIC, anon, authenticated;

-- The match: anon + authenticated (§10.1/§18); service_role for edge fns.
REVOKE ALL ON FUNCTION get_aesthete_matches(uuid, uuid, real, text, uuid, text, int, int, real, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_aesthete_matches(uuid, uuid, real, text, uuid, text, int, int, real, text) TO anon, authenticated, service_role;

-- The seam: authenticated (§18) + service_role.
REVOKE ALL ON FUNCTION aesthete_search(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aesthete_search(text, jsonb) TO authenticated, service_role;

-- ─── 9. LOCAL-DEV DEMO SEED (guarded — skips everywhere the dev seed is
--        absent, i.e. prod) ───────────────────────────────────────────────────
-- The wave-2 demo bar needs quiz → top-10-with-whys to be REAL against the
-- dev catalog, but seed products ship without spectrums/DNA and without
-- vectors. aesthete_dev_demo_seed() (a) gives all 12 seed products
-- designer-plausible spectrums — 8 canonical rows + 4 draft-only rows so
-- the canonical-else-draft path is exercised — (b) gives them product_dna
-- (patina/material/color/function axes), and (c) adds TWO extra published
-- catalog products because only 8 of the 12 seeds are published and an anon
-- limit-10 walk should fill its page. Guard: the seed sentinel product must
-- exist with its seeded name; ON CONFLICT everywhere keeps it re-runnable.
--
-- ⚠ ORDERING REALITY: migrations run BEFORE seed files on `db reset`, so at
-- migration time the seed catalog does not exist and the DO block below
-- no-ops on a fresh database. The seed-phase hook is
-- supabase/seed/aesthete_demo.sql (calls this function); CONDUCTOR TO-DO
-- (single-touch file): append './seed/aesthete_demo.sql' to
-- [db.seed].sql_paths in supabase/config.toml — without it the demo seed
-- silently never runs on reset.
CREATE OR REPLACE FUNCTION aesthete_dev_demo_seed()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $seed$
DECLARE
  v_designer uuid := 'a0000000-0000-0000-0000-000000000004';  -- designer@patina.dev
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p
                  WHERE p.id = 'a0000000-0000-0000-0000-000000000001'
                    AND p.name = 'Heirloom Oak Dining Table') THEN
    RETURN 'skipped: dev seed catalog absent (prod path)';
  END IF;

  -- (c) two extra local-dev demo products (published catalog) — page filler
  INSERT INTO products (id, name, description, category, price_retail, layer, status,
                        patina_managed, brand, materials, source_url, captured_by,
                        captured_at, published_at, tags, quality_score)
  VALUES
    ('ae440000-0000-4000-8000-00000000d001', 'Oak Reading Chair',
     'Low-slung reading chair in white oak with a wool bouclé seat.',
     'chair', 155000, 'catalog', 'published', true, 'Nordic Atelier',
     ARRAY['White oak', 'Wool bouclé'], 'http://dev.invalid/aesthete-demo/1',
     v_designer, now(), now(), ARRAY['aesthete-dev-seed'], 82),
    ('ae440000-0000-4000-8000-00000000d002', 'Wool Kilim Runner',
     'Flat-woven wool runner in faded madder tones.',
     'decor', 68000, 'catalog', 'published', true, 'Studio Piet',
     ARRAY['Wool'], 'http://dev.invalid/aesthete-demo/2',
     v_designer, now(), now(), ARRAY['aesthete-dev-seed'], 74)
  ON CONFLICT (id) DO NOTHING;

  -- (a) canonical spectrums: 8 published-or-review seeds + the 2 demo rows
  INSERT INTO product_style_spectrum
    (product_id, warmth, complexity, formality, timelessness, boldness, craftsmanship,
     assigned_by, source)
  VALUES
    ('a0000000-0000-0000-0000-000000000001',  0.70, -0.20,  0.10,  0.80, -0.10,  0.90, v_designer, 'manual'), -- Heirloom Oak Dining Table
    ('a0000000-0000-0000-0000-000000000002',  0.50,  0.00,  0.20,  0.70,  0.10,  0.80, v_designer, 'manual'), -- Walnut Credenza
    ('a0000000-0000-0000-0000-000000000003',  0.80,  0.30, -0.40,  0.50,  0.40,  0.90, v_designer, 'manual'), -- Live-Edge Coffee Table
    ('a0000000-0000-0000-0000-000000000004',  0.50, -0.30, -0.30,  0.40, -0.20,  0.70, v_designer, 'manual'), -- Ceramic Table Lamp
    ('a0000000-0000-0000-0000-000000000005', -0.10,  0.10, -0.20,  0.60,  0.30,  0.90, v_designer, 'manual'), -- Hand-Forged Iron Shelf
    ('a0000000-0000-0000-0000-000000000010',  0.60, -0.40, -0.30,  0.50, -0.30,  0.60, v_designer, 'manual'), -- Meadow Linen Sectional
    ('a0000000-0000-0000-0000-000000000011',  0.20, -0.10,  0.30,  0.60,  0.40,  0.70, v_designer, 'manual'), -- Brass Arc Floor Lamp
    ('a0000000-0000-0000-0000-000000000012',  0.40,  0.20,  0.40,  0.30,  0.30,  0.50, v_designer, 'manual'), -- Velvet Club Chair
    ('ae440000-0000-4000-8000-00000000d001',  0.65, -0.30, -0.20,  0.60, -0.20,  0.75, v_designer, 'manual'), -- Oak Reading Chair
    ('ae440000-0000-4000-8000-00000000d002',  0.55,  0.20, -0.30,  0.40,  0.20,  0.60, v_designer, 'manual')  -- Wool Kilim Runner
  ON CONFLICT (product_id) DO NOTHING;

  -- draft-ONLY spectrums for the remaining 4 seeds (canonical-else-draft path)
  INSERT INTO product_dna_drafts (product_id, draft, model, prompt_version, overall_confidence)
  VALUES
    ('a0000000-0000-0000-0000-000000000013',
     '{"style": {"spectrums": {"warmth": -0.3, "complexity": -0.2, "formality": 0.5, "timelessness": 0.4, "boldness": 0.1, "craftsmanship": 0.6},
                 "spectrum_conf": {"warmth": 0.7, "complexity": 0.6, "formality": 0.7, "timelessness": 0.6, "boldness": 0.5, "craftsmanship": 0.6}},
       "overall_confidence": 0.66}'::jsonb,
     'dev-seed', 'dev-seed-v1', 0.66),  -- Marble Side Table
    ('a0000000-0000-0000-0000-000000000020',
     '{"style": {"spectrums": {"warmth": 0.5, "complexity": 0.1, "formality": -0.4, "timelessness": 0.3, "boldness": -0.1, "craftsmanship": 0.5}},
       "overall_confidence": 0.61}'::jsonb,
     'dev-seed', 'dev-seed-v1', 0.61),  -- Woven Jute Area Rug
    ('a0000000-0000-0000-0000-000000000021',
     '{"style": {"spectrums": {"warmth": 0.4, "complexity": -0.3, "formality": -0.2, "timelessness": 0.2, "boldness": -0.2, "craftsmanship": 0.4}},
       "overall_confidence": 0.58}'::jsonb,
     'dev-seed', 'dev-seed-v1', 0.58),  -- Linen Throw Pillow Set
    ('a0000000-0000-0000-0000-000000000022',
     '{"style": {"spectrums": {"warmth": 0.6, "complexity": 0.0, "formality": -0.4, "timelessness": 0.4, "boldness": 0.1, "craftsmanship": 0.5}},
       "overall_confidence": 0.63}'::jsonb,
     'dev-seed', 'dev-seed-v1', 0.63)   -- Terracotta Planter Set
  ON CONFLICT (product_id, prompt_version) DO NOTHING;

  -- (b) product_dna for every demo product (patina is the brand dimension)
  INSERT INTO product_dna
    (product_id, patina_potential, material_honesty, craftsmanship_tier,
     color_temperature, dominant_color, palette_family,
     durability_for, comfort, flexibility, primary_function,
     maintenance_reality, value_story, provenance_story, confidence, attr_source)
  VALUES
    ('a0000000-0000-0000-0000-000000000001', 0.90, 0.95, 0.90, 0.60, 'warm oak', 'warm earth',
     ARRAY['kids','pets','high_traffic'], NULL, NULL, 'dining',
     '{"kids": "fine", "pets": "fine"}',
     'Quarter-sawn white oak, joined to outlast its first house.',
     'Bench-made in a two-person shop from a single felled estate oak.',
     '{"patina_potential": 0.85, "craftsmanship_tier": 0.9}', '{"patina_potential": "designer"}'),
    ('a0000000-0000-0000-0000-000000000002', 0.80, 0.90, 0.85, 0.40, 'dark walnut', 'warm earth',
     ARRAY['high_traffic'], NULL, NULL, 'storage',
     '{"kids": "fine"}',
     'Solid black walnut with hand-cut joinery.',
     NULL, '{"patina_potential": 0.8}', '{}'),
    ('a0000000-0000-0000-0000-000000000003', 0.85, 0.95, 0.90, 0.55, 'live-edge hardwood', 'warm earth',
     NULL, NULL, NULL, 'coffee table',
     '{"kids": "caution"}',
     'Reclaimed hardwood slab; the iron base is forged, not cast.',
     'Slab reclaimed from a decommissioned Wisconsin barn.',
     '{"patina_potential": 0.85}', '{}'),
    ('a0000000-0000-0000-0000-000000000004', 0.55, 0.80, 0.75, 0.35, 'cream stoneware', 'warm neutral',
     NULL, NULL, NULL, 'lighting', '{}', NULL,
     'Thrown by a local potter; no two glazes match.',
     '{"patina_potential": 0.55}', '{}'),
    ('a0000000-0000-0000-0000-000000000005', 0.75, 0.90, 0.90, -0.20, 'blackened iron', 'iron + oak',
     ARRAY['high_traffic'], NULL, NULL, 'storage', '{}',
     'Hand-forged iron carries its hammer marks honestly.',
     NULL, '{"patina_potential": 0.75}', '{}'),
    ('a0000000-0000-0000-0000-000000000010', 0.45, 0.70, 0.65, 0.45, 'flax linen', 'warm neutral',
     ARRAY['kids','pets'], 0.90, 0.60, 'seating',
     '{"kids": "fine", "pets": "caution"}',
     'European linen slipcovers that wash and wear in.',
     NULL, '{"comfort": 0.9}', '{}'),
    ('a0000000-0000-0000-0000-000000000011', 0.60, 0.85, 0.70, 0.30, 'aged brass', 'brass + marble',
     NULL, NULL, NULL, 'lighting', '{}',
     'Solid brass that darkens where hands touch it.',
     NULL, '{"patina_potential": 0.6}', '{}'),
    ('a0000000-0000-0000-0000-000000000012', 0.35, 0.60, 0.55, 0.50, 'moss velvet', 'jewel',
     NULL, 0.85, 0.40, 'seating', '{"pets": "caution"}', NULL, NULL, '{}', '{}'),
    ('a0000000-0000-0000-0000-000000000013', 0.50, 0.85, 0.60, -0.30, 'white carrara', 'cool stone',
     NULL, NULL, NULL, 'side table', '{"kids": "caution"}', NULL, NULL, '{}', '{}'),
    ('a0000000-0000-0000-0000-000000000020', 0.55, 0.85, 0.55, 0.35, 'natural jute', 'warm neutral',
     ARRAY['high_traffic'], NULL, NULL, 'rug', '{"pets": "fine"}', NULL, NULL, '{}', '{}'),
    ('a0000000-0000-0000-0000-000000000021', 0.30, 0.70, 0.45, 0.40, 'oat linen', 'warm neutral',
     NULL, 0.70, 0.80, 'decor', '{}', NULL, NULL, '{}', '{}'),
    ('a0000000-0000-0000-0000-000000000022', 0.65, 0.90, 0.55, 0.55, 'terracotta', 'warm earth',
     NULL, NULL, NULL, 'planter', '{}', NULL,
     'Unsealed terracotta blooms and whitens with every season.',
     '{"patina_potential": 0.65}', '{}'),
    ('ae440000-0000-4000-8000-00000000d001', 0.70, 0.85, 0.80, 0.50, 'white oak', 'warm neutral',
     ARRAY['kids'], 0.80, 0.50, 'seating', '{"kids": "fine"}',
     'White oak frame built to be recovered, not replaced.',
     NULL, '{"patina_potential": 0.7}', '{}'),
    ('ae440000-0000-4000-8000-00000000d002', 0.60, 0.85, 0.60, 0.55, 'madder red', 'warm earth',
     ARRAY['high_traffic','pets'], NULL, NULL, 'rug', '{"pets": "fine"}', NULL,
     'Flat-woven in a family workshop; the fade is the feature.',
     '{"patina_potential": 0.6}', '{}')
  ON CONFLICT (product_id) DO NOTHING;

  RETURN 'seeded: demo spectrums (8 canonical + 4 draft-only), DNA ×14, +2 demo products';
END $seed$;

COMMENT ON FUNCTION aesthete_dev_demo_seed() IS
  'LOCAL-DEV demo seed for the wave-2 walk (00244 §9): spectrums (canonical + draft-only), product_dna, and 2 extra published demo products for the 12-product dev catalog. Guarded on the seed sentinel product — a no-op on prod. Idempotent (ON CONFLICT DO NOTHING). Invoked by supabase/seed/aesthete_demo.sql during db reset and by the SQL suites inside their rolled-back transactions.';

REVOKE ALL ON FUNCTION aesthete_dev_demo_seed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aesthete_dev_demo_seed() TO service_role;

-- Best-effort at migration time (no-op on fresh databases — seeds have not
-- run yet; real invocation is the seed file above / suites).
DO $$ BEGIN
  RAISE NOTICE '00244 dev seed: %', aesthete_dev_demo_seed();
END $$;
