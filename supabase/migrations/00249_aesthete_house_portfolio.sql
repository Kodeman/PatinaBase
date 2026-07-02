-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00249: House fallback + portfolio ingestion + bias derivation +
--                  designer matching (Aesthete Engine Wave 4B)
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md
--   §4.3 (portfolio geometric-median seed v_D0 → taste_vector when NULL)
--   §8.5 (bias derivation: standardized deviation ≥ 1σ + sign-stability;
--         naming via bias_templates; the edit invariant — derivation NEVER
--         touches confirmed/edited/muted rows)
--   §9.1 (house ops MVP fallback, risk #12: validated-catalog centroid +
--         hand-settable spectrums; draft only — activation stays human)
--   §9.3 (client↔designer matching: sim = ½(1+cos), never a bare %)
--   §18  (match_designers_for_client signature)
--   §12.2 (job orchestration — portfolio_embed drains through the 00241
--          outbox; the drain itself lives in aesthete-embed-worker)
--
-- What this ships:
--   1. PRIVATE `portfolio-items` storage bucket (owner-pathed policies, the
--      capture-media/00234 precedent) for designer portfolio imagery.
--   2. designer_portfolio_items.updated_at (additive; staleness watermark for
--      the nightly centroid sweep) + trigger.
--   3. INSERT/UPDATE-OF-storage_path trigger → enqueue `portfolio_embed`
--      jobs into the 00241 outbox (resurrect-on-conflict idiom). The drain
--      (claim → signed URL → /embed/image → write embedding) is a minimal
--      extension of supabase/functions/aesthete-embed-worker (same wave).
--   4. _aesthete_geometric_median() — Weiszfeld iteration over the 00239 vec
--      helpers (fixed max iterations + convergence check; mean fallback
--      below 3 points, §4.3 "median, not mean").
--   5. recompute_portfolio_centroid(p_designer_id) — geometric median of the
--      designer's embedded portfolio items → designer_taste_profiles
--      .portfolio_centroid, seeding taste_vector when NULL (§4.3).
--   6. seed_house_from_validated_catalog() — the risk-#12 fallback: v_H =
--      geometric median of designer-validated catalog vectors, spectrums =
--      confidence-weighted means of canonical rows; lands as a DRAFT
--      house_taste row (activation stays human via activate_house_taste,
--      where the lead's hand-set values apply as curated_overrides).
--   7. _aesthete_interpretable_groups() — feature-group labels for φ dims
--      1..30 (MUST mirror _aesthete_phi's ordering, 00244).
--   8. derive_signature_biases(p_designer_id) — §8.5 derivation (details in
--      the function header) writing status='proposed' rows only.
--   9. match_designers_for_client(p_session_key) — §18/§9.3; SECURITY
--      DEFINER, authenticated; never returns raw vectors.
--  10. aesthete_house_portfolio_nightly() + its own 03:15 cron — recomputes
--      centroids for stale designers and derives biases for designers with
--      fresh snapshots/corrections, independent of Wave 4A's nightly.
--
-- Documented decisions / deviations (flagged to the conductor):
--   • Stored centroids are UNIT vectors: §4.1 keeps every dense point on
--     S^767, and the §4.3 EMA (normalize(0.97·v_D + 0.03·v_winner)) assumes
--     a unit seed. The geometric-median helper returns the RAW median (the
--     math the suite asserts); write sites normalize.
--   • σ_k floor (§8.5 "bootstrap SE while the roster is small"): σ_k =
--     GREATEST(cross-designer stddev_samp, 0.10), and with fewer than 3
--     fitted profiles the observed std is ignored entirely (σ_k = 0.10) —
--     a 2-designer "population" std is noise.
--   • Sign-stability proxy (§8.5 "≥ 80% of bootstrap refits"): no bootstrap
--     machinery exists in-DB, so stability = sign agreement of (θ_snap,k −
--     θ_H,k) across the designer's last 5 taste snapshots, requiring ≥ 2
--     snapshots and agreement ≥ 0.8. Honest proxy: snapshots are nightly
--     refits over resampled (growing) data. Correction-minted candidates
--     (≥ 3 same-direction corrections on a spectrum dimension) skip the
--     stability filter — they are explicit designer statements, not fits.
--   • θ_H with NULL theta on the active house (true until 4A's consensus or
--     the House-Hundred calibration lands): treated as the zero vector with
--     a NOTICE — deviation-from-neutral-house, better than a dead derivation.
--   • Claude naming seam (§8.5): novel patterns (no bias_templates match)
--     get a deterministic fallback name ("Leans …"); the Claude-proposed
--     naming path is a documented seam in derive_signature_biases (no
--     ANTHROPIC_API_KEY provisioned; approval flow is human either way).
--   • match_designers_for_client returns confidence as jsonb
--     {score, n, label} — the §18 table names the column without a type;
--     §9.3 demands the number never travel alone ("always reported with the
--     confidence map and n"), so the row carries machine score (0..1), the
--     judgment count, and the §10.6 band label surfaces must render.
--   • The 03:15 cron body is direct SQL (SELECT public.aesthete_house_
--     portfolio_nightly()) rather than invoke_edge_function — there is no
--     edge function in this path by design (rule-8 guarded-unschedule idiom
--     kept; the local-safety property holds trivially: pure SQL, idempotent).
--   • The demo seed's 6 portfolio items carry placeholder storage paths;
--     once a live drain runs, their jobs walk the 00241 failure ladder and
--     park — expected demo-theater behavior, documented here.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. portfolio-items bucket (private, owner-pathed — 00234 precedent) ────
-- Layout convention (enforced by policy):
--   portfolio-items/<auth.uid()>/<whatever>.jpg
-- Re-runnable by construction (this migration may be applied by hand against
-- a DB whose ledger is being maintained manually): bucket upsert, DROP-then-
-- CREATE policies/triggers, CREATE OR REPLACE functions, guarded cron.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-items',
  'portfolio-items',
  false,
  52428800, -- 50MB
  ARRAY['image/heic', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Portfolio items owner read" ON storage.objects;
CREATE POLICY "Portfolio items owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'portfolio-items'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Portfolio items owner upload" ON storage.objects;
CREATE POLICY "Portfolio items owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-items'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Portfolio items owner update" ON storage.objects;
CREATE POLICY "Portfolio items owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio-items'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Portfolio items owner delete" ON storage.objects;
CREATE POLICY "Portfolio items owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio-items'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 2. designer_portfolio_items.updated_at (additive watermark) ────────────
-- The nightly centroid sweep needs "did an embedding land since the profile
-- was last written?" — embeddings arrive via UPDATE, so created_at can't
-- answer that. Additive column + the standard trigger.
ALTER TABLE designer_portfolio_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS update_designer_portfolio_items_updated_at ON designer_portfolio_items;
CREATE TRIGGER update_designer_portfolio_items_updated_at
  BEFORE UPDATE ON designer_portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN designer_portfolio_items.updated_at IS
  'Staleness watermark (00249): the portfolio drain''s embedding UPDATE bumps this; aesthete_house_portfolio_nightly recomputes centroids for designers whose newest embedded item outdates their taste profile row.';

-- ─── 3. Enqueue trigger: portfolio item → portfolio_embed job (§12.2) ────────
-- SECURITY DEFINER: owners INSERT their own rows but have no aesthete_jobs
-- INSERT policy (00241 pattern). Resurrect-on-conflict so a storage_path
-- swap after a successful embed re-enqueues (00241 dedupe semantics).
-- Caption edits do NOT re-enqueue — portfolio embeddings are image-only
-- (§4.3: v_D0 is the geometric median of portfolio-IMAGE embeddings).
CREATE OR REPLACE FUNCTION enqueue_portfolio_embed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO aesthete_jobs (kind, payload, dedupe_key)
  VALUES (
    'portfolio_embed',
    jsonb_build_object('portfolio_item_id', NEW.id, 'designer_id', NEW.designer_id),
    NEW.id || ':portfolio_embed:r1'
  )
  ON CONFLICT (dedupe_key) DO UPDATE
    SET status = 'pending', run_after = now(), attempts = 0,
        last_error = NULL, completed_at = NULL,
        payload = EXCLUDED.payload
    WHERE aesthete_jobs.status IN ('done', 'failed');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolio_items_enqueue_embed ON designer_portfolio_items;
CREATE TRIGGER trg_portfolio_items_enqueue_embed
  AFTER INSERT OR UPDATE OF storage_path ON designer_portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_portfolio_embed();

COMMENT ON FUNCTION enqueue_portfolio_embed() IS
  'Enqueue a portfolio_embed job (00241 outbox) on portfolio item INSERT / storage_path change. Drained by aesthete-embed-worker: claim → resolve URL (signed portfolio-items URL, or the storage_path verbatim when it is already http(s) — the dev/demo affordance) → /embed/image → write embedding + status=embedded → recompute_portfolio_centroid for the touched designers.';

-- ─── 4. _aesthete_geometric_median — Weiszfeld over the 00239 helpers ───────
-- Geometric median of a set of same-dimension vectors (§4.3: "median, not
-- mean: one badly lit photo shouldn't drag the centroid").
--   • n = 0 → NULL (method 'empty'); n < 3 → arithmetic mean (method 'mean',
--     §4.3 fallback — with 1–2 points the median IS degenerate anyway).
--   • n ≥ 3 → Weiszfeld iteration from the mean: y ← Σ(xᵢ/dᵢ)/Σ(1/dᵢ),
--     dᵢ = max(‖y − xᵢ‖, 1e-9) (the floor is the standard singularity guard:
--     an iterate landing on a data point pins there, which is correct when
--     that point is the median). Fixed cap 32 iterations; converged when the
--     step moves < 1e-6.
--   • Returns the RAW median — callers normalize for storage (§4.1 unit law).
CREATE OR REPLACE FUNCTION _aesthete_geometric_median(
  p_vectors vector[],
  OUT median vector,
  OUT method text,
  OUT iterations int,
  OUT converged boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_n int := COALESCE(array_length(p_vectors, 1), 0);
  v_y vector;
  v_next vector;
  v_num vector;
  v_den double precision;
  v_it int;
BEGIN
  iterations := 0;
  converged := false;

  IF v_n = 0 THEN
    median := NULL; method := 'empty';
    RETURN;
  END IF;

  -- Arithmetic mean = starting point (and the < 3 fallback).
  SELECT vec_scale(sum(x), (1.0 / v_n)::real) INTO v_y FROM unnest(p_vectors) x;

  IF v_n < 3 THEN
    median := v_y; method := 'mean'; converged := true;
    RETURN;
  END IF;

  method := 'weiszfeld';
  FOR v_it IN 1..32 LOOP
    SELECT sum(vec_scale(s.x, (1.0 / s.d)::real)), sum(1.0 / s.d)
      INTO v_num, v_den
      FROM (
        SELECT x, GREATEST(v_y <-> x, 1e-9) AS d
          FROM unnest(p_vectors) x
      ) s;

    v_next := vec_scale(v_num, (1.0 / v_den)::real);
    iterations := v_it;

    IF (v_next <-> v_y) < 1e-6 THEN
      v_y := v_next;
      converged := true;
      EXIT;
    END IF;
    v_y := v_next;
  END LOOP;

  median := v_y;
END;
$$;

COMMENT ON FUNCTION _aesthete_geometric_median(vector[]) IS
  'Weiszfeld geometric median (design §4.3) over the 00239 vec helpers: mean start, dᵢ floored at 1e-9, ≤ 32 iterations, converged at step < 1e-6. n < 3 → arithmetic mean fallback. Returns the RAW median; write sites normalize (§4.1 unit law). Internal — no client grants.';

-- ─── 5. recompute_portfolio_centroid — v_D0 (§4.3) ───────────────────────────
-- Geometric median of the designer's embedded portfolio items →
-- designer_taste_profiles.portfolio_centroid (normalized), seeding
-- taste_vector when NULL (the §4.3 cold-start seed; the EMA then evolves it,
-- Wave 4A). Bumps sources.portfolio_items. Refuses retired (tombstoned)
-- profiles — retirement must stick (§12.5).
-- Callable by: service_role (drain + nightly), the designer themself, leads.
CREATE OR REPLACE FUNCTION recompute_portfolio_centroid(p_designer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_vecs vector[];
  v_n int;
  v_med record;
  v_centroid vector;
  v_seeded boolean := false;
BEGIN
  IF v_caller IS NOT NULL AND v_caller <> p_designer_id AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'recompute_portfolio_centroid: only the owner, a lead, or the job runner may recompute'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM designer_taste_profiles
              WHERE designer_id = p_designer_id AND retired_at IS NOT NULL) THEN
    RAISE NOTICE 'recompute_portfolio_centroid: designer % is retired (tombstoned) — skipped', p_designer_id;
    RETURN jsonb_build_object('designer_id', p_designer_id, 'updated', false, 'reason', 'retired');
  END IF;

  SELECT array_agg(embedding) INTO v_vecs
    FROM designer_portfolio_items
   WHERE designer_id = p_designer_id
     AND status = 'embedded'
     AND embedding IS NOT NULL;

  v_n := COALESCE(array_length(v_vecs, 1), 0);
  IF v_n = 0 THEN
    RAISE NOTICE 'recompute_portfolio_centroid: designer % has no embedded portfolio items — nothing to compute', p_designer_id;
    RETURN jsonb_build_object('designer_id', p_designer_id, 'updated', false, 'reason', 'no_embedded_items');
  END IF;

  SELECT * INTO v_med FROM _aesthete_geometric_median(v_vecs);
  v_centroid := vec_normalize(v_med.median);

  INSERT INTO designer_taste_profiles (designer_id, portfolio_centroid, taste_vector, sources)
  VALUES (
    p_designer_id, v_centroid, v_centroid,
    jsonb_build_object('portfolio_items', v_n, 'judgments', 0, 'corrections', 0, 'rules', 0)
  )
  ON CONFLICT (designer_id) DO UPDATE
    SET portfolio_centroid = EXCLUDED.portfolio_centroid,
        -- §4.3: seed v_D from v_D0 ONLY when no learned vector exists yet.
        taste_vector = COALESCE(designer_taste_profiles.taste_vector, EXCLUDED.portfolio_centroid),
        sources = jsonb_set(
          COALESCE(designer_taste_profiles.sources, '{}'::jsonb),
          '{portfolio_items}', to_jsonb(v_n))
  RETURNING (taste_vector IS NOT NULL AND taste_vector = portfolio_centroid) INTO v_seeded;

  RETURN jsonb_build_object(
    'designer_id', p_designer_id,
    'updated', true,
    'n_items', v_n,
    'method', v_med.method,
    'iterations', v_med.iterations,
    'converged', v_med.converged,
    'taste_vector_equals_centroid', v_seeded
  );
END;
$$;

COMMENT ON FUNCTION recompute_portfolio_centroid(uuid) IS
  'v_D0 recompute (design §4.3): normalized geometric median (Weiszfeld, mean fallback < 3 items) of the designer''s embedded portfolio images → designer_taste_profiles.portfolio_centroid; seeds taste_vector when NULL. Bumps sources.portfolio_items. Refuses retired profiles. Called by the portfolio drain after each successful batch and by the 03:15 nightly for stale designers.';

-- ─── 6. seed_house_from_validated_catalog — risk-#12 fallback (§9.1) ────────
-- "House Hundred curation stalls → fall back to validated-catalog centroid
-- with hand-set spectrums." Mechanically:
--   • validated set = published catalog products carrying BOTH a fused
--     aesthete_vector and a canonical product_style_spectrum row (canonical
--     rows are designer-written by construction — source ∈ manual|validated,
--     the 00240 CHECK; ml drafts live in product_dna_drafts and cannot
--     qualify).
--   • v_H = normalized geometric median of their aesthete_vectors.
--   • s_H = per-dimension confidence-weighted means of the canonical rows —
--     the COMPUTED starting point; the lead "hand-sets" by attaching
--     curated_overrides (PIN/NUDGE) to the draft before activate_house_taste
--     applies them (00242 §22). Activation stays human, always.
--   • θ_H = the §9.1 "spectrum-aligned weights, zero deviation" literal
--     reading: 94-d vector with dims 1..6 = s_H and everything else 0 —
--     the house prefers products whose confidence-weighted spectrums point
--     the way its own do. Replaced wholesale by 4A's consensus in Phase 2.
-- Lands as a DRAFT row (never touches the active house). Lead-gated.
CREATE OR REPLACE FUNCTION seed_house_from_validated_catalog()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_vecs vector[];
  v_n int;
  v_med record;
  v_vec vector;
  v_warmth real; v_complexity real; v_formality real;
  v_timelessness real; v_boldness real; v_craftsmanship real;
  v_theta real[];
  v_version int;
  v_id uuid;
BEGIN
  IF v_caller IS NOT NULL AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'seed_house_from_validated_catalog: lead role required (see 00242 header)'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(p.aesthete_vector) INTO v_vecs
    FROM products p
    JOIN product_style_spectrum pss ON pss.product_id = p.id
   WHERE p.layer = 'catalog'
     AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL;

  v_n := COALESCE(array_length(v_vecs, 1), 0);
  IF v_n = 0 THEN
    RAISE NOTICE 'seed_house_from_validated_catalog: no validated catalog products with vectors — no draft created';
    RETURN NULL;
  END IF;

  SELECT * INTO v_med FROM _aesthete_geometric_median(v_vecs);
  v_vec := vec_normalize(v_med.median);

  -- s_H: per-dimension confidence-weighted means over canonical rows
  -- (weight = the row's per-dimension confidence, default 0.5 when unset —
  -- the _aesthete_product_spectrum default).
  SELECT
    sum(pss.warmth        * COALESCE((pss.confidence->>'warmth')::real,        0.5)) FILTER (WHERE pss.warmth        IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'warmth')::real,        0.5)) FILTER (WHERE pss.warmth        IS NOT NULL), 0),
    sum(pss.complexity    * COALESCE((pss.confidence->>'complexity')::real,    0.5)) FILTER (WHERE pss.complexity    IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'complexity')::real,    0.5)) FILTER (WHERE pss.complexity    IS NOT NULL), 0),
    sum(pss.formality     * COALESCE((pss.confidence->>'formality')::real,     0.5)) FILTER (WHERE pss.formality     IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'formality')::real,     0.5)) FILTER (WHERE pss.formality     IS NOT NULL), 0),
    sum(pss.timelessness  * COALESCE((pss.confidence->>'timelessness')::real,  0.5)) FILTER (WHERE pss.timelessness  IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'timelessness')::real,  0.5)) FILTER (WHERE pss.timelessness  IS NOT NULL), 0),
    sum(pss.boldness      * COALESCE((pss.confidence->>'boldness')::real,      0.5)) FILTER (WHERE pss.boldness      IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'boldness')::real,      0.5)) FILTER (WHERE pss.boldness      IS NOT NULL), 0),
    sum(pss.craftsmanship * COALESCE((pss.confidence->>'craftsmanship')::real, 0.5)) FILTER (WHERE pss.craftsmanship IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'craftsmanship')::real, 0.5)) FILTER (WHERE pss.craftsmanship IS NOT NULL), 0)
    INTO v_warmth, v_complexity, v_formality, v_timelessness, v_boldness, v_craftsmanship
    FROM products p
    JOIN product_style_spectrum pss ON pss.product_id = p.id
   WHERE p.layer = 'catalog'
     AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL;

  -- θ_H: spectrum-aligned weights, zero deviation (§9.1 MVP reading).
  v_theta := ARRAY[
    COALESCE(v_warmth, 0), COALESCE(v_complexity, 0), COALESCE(v_formality, 0),
    COALESCE(v_timelessness, 0), COALESCE(v_boldness, 0), COALESCE(v_craftsmanship, 0)
  ]::real[] || array_fill(0::real, ARRAY[88]);

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM house_taste;

  INSERT INTO house_taste
    (version, taste_vector, theta,
     warmth, complexity, formality, timelessness, boldness, craftsmanship,
     status, curated_by, notes, computed_from)
  VALUES
    (v_version, v_vec, v_theta,
     v_warmth, v_complexity, v_formality, v_timelessness, v_boldness, v_craftsmanship,
     'draft', v_caller,
     format('validated-catalog fallback draft over %s product(s) — §9.1 MVP / risk #12; lead hand-sets via curated_overrides, then activate_house_taste', v_n),
     jsonb_build_object('collection', 'validated-catalog', 'n_products', v_n))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION seed_house_from_validated_catalog() IS
  'Risk-#12 house fallback (design §9.1): v_H = normalized geometric median of published catalog products carrying both a fused vector and a canonical spectrum row; s_H = confidence-weighted means; θ_H = spectrum-aligned/zero-deviation. Writes a DRAFT house_taste row — activation stays human (activate_house_taste applies the lead''s hand-set curated_overrides). Lead-gated; NULL with a NOTICE when no products qualify.';

-- ─── 7. _aesthete_interpretable_groups — φ dims 1..30 labels (§8.1/§8.5) ────
-- MUST mirror _aesthete_phi's ordering exactly (00244):
--   [1..6]   six spectrums, fixed order
--   [7..18]  styles taxonomy ORDER BY display_order NULLS LAST, name
--            (no is_archetype filter — φ iterates ALL styles rows)
--   [19..28] the ten material buckets
--   [29]     patina   [30] craftsmanship_tier
-- Dims 31..94 (the Matryoshka embedding slice) are NOT interpretable and
-- never mint biases.
CREATE OR REPLACE FUNCTION _aesthete_interpretable_groups()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship']
    || COALESCE(
         (SELECT array_agg('archetype:' || btrim(regexp_replace(lower(s.name), '[^a-z0-9]+', '_', 'g'), '_')
                           ORDER BY s.display_order NULLS LAST, s.name)
            FROM styles s),
         '{}'::text[])
    || ARRAY['material:wood','material:metal','material:fabric','material:stone','material:glass',
             'material:leather','material:rattan','material:marble','material:ceramic','material:mixed']
    || ARRAY['patina','craftsmanship_tier'];
$$;

COMMENT ON FUNCTION _aesthete_interpretable_groups() IS
  'Feature-group labels for the interpretable φ dims 1..30 (design §8.1/§8.5) — ordering mirrors _aesthete_phi (00244): 6 spectrums, all styles by display_order NULLS LAST/name, 10 material buckets, patina, craftsmanship_tier. The 64-d embedding slice is not interpretable and never mints biases. Internal — no client grants.';

-- ─── 8. derive_signature_biases — §8.5, the honest derivation ────────────────
-- Two minting paths, one upsert law:
--
--   A. Deviation path: d_k = (θ_D,k − θ_H,k)/σ_k over φ dims 1..30.
--      σ_k = GREATEST(stddev_samp of θ_k across ≥ 3 unretired fitted
--      profiles, 0.10) — the floor stands in for bootstrap SE on a small
--      roster (header note). Candidates need |d_k| ≥ 1.0 AND sign-stability:
--      the sign of (θ_snap,k − θ_H,k) agrees with the current deviation in
--      ≥ 80% of the designer's last 5 snapshots (≥ 2 required). Evidence:
--      d/σ/agreement + up to 3 exemplar product ids — recent judgment
--      winners with the strongest φ_k in the deviation's direction.
--
--   B. Correction-minted path: ≥ 3 same-direction corrections citing the
--      same spectrum dimension (taste_corrections.direction keys) mint a
--      candidate directly, citing the correction ids. Explicit statements —
--      no stability filter.
--
--   Naming: candidates match bias_templates by pattern — compound patterns
--   ('warmth+ ∧ material:metal') are tried first (most conjuncts wins) and
--   consume their constituent dims; leftovers match single patterns
--   ('warmth+'); novel patterns get a deterministic fallback name.
--   ── CLAUDE NAMING SEAM (§8.5.2) ──: when ANTHROPIC_API_KEY exists, novel
--   patterns may instead be named by Claude from the evidence set via
--   internal tooling, with designer/lead approval before display. Unwired
--   here by design (no key provisioned); the fallback name keeps the row
--   honest and editable meanwhile.
--
--   THE EDIT INVARIANT (§8.5.3): this function writes rows with
--   status='proposed' ONLY. An existing row on the same (feature_group,
--   direction) with status confirmed/edited/muted is NEVER touched — not
--   its strengths, not its name, not its evidence. Stale 'proposed' rows
--   not re-minted by this run are deleted (machine housekeeping of machine
--   rows); human-touched rows are permanent until the human says otherwise.
CREATE OR REPLACE FUNCTION derive_signature_biases(p_designer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_theta_d real[];
  v_theta_h real[];
  v_labels text[] := _aesthete_interpretable_groups();
  v_n_labels int := array_length(_aesthete_interpretable_groups(), 1);
  v_roster int;

  -- deviation candidates (parallel arrays)
  v_ks int[]; v_ds real[]; v_sigmas real[];
  v_agree real;
  v_snap_n int;

  -- winner φ cache for exemplars
  v_wids uuid[]; v_wphis real[];  -- flattened: winner i dim k at [(i-1)*94 + k]
  v_phi real[];
  v_i int;

  -- unified candidate set: pattern → candidate record fields
  v_cand_patterns text[] := '{}';
  v_cand_groups   text[] := '{}';
  v_cand_dirs     text[] := '{}';
  v_cand_strength real[] := '{}';
  v_cand_evidence jsonb[] := '{}';
  v_consumed boolean[];

  v_k int; v_d real; v_sigma real; v_dir text; v_group text;
  v_exemplars uuid[];
  r record; v_tpl record;

  v_kept uuid[] := '{}';
  v_existing signature_biases;
  v_name text; v_desc text;
  v_minted int := 0; v_updated int := 0; v_skipped_locked int := 0; v_deleted int := 0;
  v_deviation_ran boolean := false;
  v_conjuncts text[];
  v_all_present boolean;
  v_j int;
  v_id uuid;
BEGIN
  IF v_caller IS NOT NULL AND v_caller <> p_designer_id AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'derive_signature_biases: only the owner, a lead, or the job runner may derive'
      USING ERRCODE = '42501';
  END IF;

  SELECT dtp.theta INTO v_theta_d
    FROM designer_taste_profiles dtp
   WHERE dtp.designer_id = p_designer_id AND dtp.retired_at IS NULL;

  SELECT ht.theta INTO v_theta_h
    FROM house_taste ht WHERE ht.status = 'active'
   ORDER BY ht.version DESC LIMIT 1;

  IF v_theta_h IS NULL THEN
    RAISE NOTICE 'derive_signature_biases: active house has no theta yet — deviations measured against the neutral (zero) house (00249 header)';
  END IF;

  -- ── A. deviation candidates ────────────────────────────────────────────────
  IF v_theta_d IS NOT NULL THEN
    v_deviation_ran := true;

    SELECT count(*) INTO v_roster
      FROM designer_taste_profiles p
     WHERE p.retired_at IS NULL AND p.theta IS NOT NULL;

    SELECT array_agg(q.k ORDER BY q.k),
           array_agg(q.d ORDER BY q.k),
           array_agg(q.sigma_k ORDER BY q.k)
      INTO v_ks, v_ds, v_sigmas
      FROM (
        SELECT d.k,
               ((d.theta_d - d.theta_h) / s.sigma_k)::real AS d,
               s.sigma_k
          FROM (
            SELECT t.ord::int AS k, t.x::real AS theta_d,
                   COALESCE(v_theta_h[t.ord], 0)::real AS theta_h
              FROM unnest(v_theta_d) WITH ORDINALITY t(x, ord)
             WHERE t.ord <= v_n_labels
          ) d
          CROSS JOIN LATERAL (
            -- σ_k with the documented small-roster floor.
            SELECT GREATEST(
                     CASE WHEN v_roster >= 3
                          THEN COALESCE((SELECT stddev_samp(tt.x)
                                           FROM designer_taste_profiles p2
                                          CROSS JOIN LATERAL unnest(p2.theta) WITH ORDINALITY tt(x, ord)
                                          WHERE p2.retired_at IS NULL AND p2.theta IS NOT NULL
                                            AND tt.ord = d.k), 0)
                          ELSE 0 END,
                     0.10)::real AS sigma_k
          ) s
         WHERE abs((d.theta_d - d.theta_h) / s.sigma_k) >= 1.0
      ) q;

    -- exemplar substrate: the designer's ≤ 40 most recent distinct judgment
    -- winners, φ computed once each (flattened cache, stride = φ length).
    IF v_ks IS NOT NULL THEN
      SELECT array_agg(q.pid) INTO v_wids FROM (
        SELECT (CASE choice WHEN 'a' THEN product_a ELSE product_b END) AS pid,
               max(created_at) AS latest
          FROM taste_judgments
         WHERE designer_id = p_designer_id AND choice IN ('a', 'b')
         GROUP BY 1
         ORDER BY latest DESC
         LIMIT 40
      ) q;

      v_wphis := '{}';
      IF v_wids IS NOT NULL THEN
        FOR v_i IN 1..array_length(v_wids, 1) LOOP
          v_phi := _aesthete_phi(v_wids[v_i]);
          v_wphis := v_wphis || v_phi;  -- flattened; stride = array_length(v_phi)
        END LOOP;
      END IF;

      FOR v_i IN 1..array_length(v_ks, 1) LOOP
        v_k := v_ks[v_i]; v_d := v_ds[v_i]; v_sigma := v_sigmas[v_i];

        -- sign-stability across the last 5 snapshots (≥ 2 required, ≥ 0.8).
        SELECT count(*) FILTER (WHERE sign(s.theta[v_k] - COALESCE(v_theta_h[v_k], 0)) = sign(v_d))::real
                 / NULLIF(count(*), 0),
               count(*)
          INTO v_agree, v_snap_n
          FROM (
            SELECT theta FROM designer_taste_snapshots
             WHERE designer_id = p_designer_id AND theta IS NOT NULL
             ORDER BY version DESC LIMIT 5
          ) s;

        IF COALESCE(v_snap_n, 0) < 2 OR COALESCE(v_agree, 0) < 0.8 THEN
          CONTINUE;  -- the stability filter kills noise-minted "signature moves"
        END IF;

        v_group := v_labels[v_k];
        v_dir := CASE WHEN v_d > 0 THEN '+' ELSE '-' END;

        -- exemplars: top 3 winners by φ_k in the deviation's direction.
        v_exemplars := NULL;
        IF v_wids IS NOT NULL THEN
          SELECT array_agg(pid) INTO v_exemplars FROM (
            SELECT v_wids[i] AS pid
              FROM generate_series(1, array_length(v_wids, 1)) i
             WHERE v_wphis[(i - 1) * array_length(v_phi, 1) + v_k] IS NOT NULL
             ORDER BY (v_wphis[(i - 1) * array_length(v_phi, 1) + v_k]
                       * CASE WHEN v_d > 0 THEN 1 ELSE -1 END) DESC
             LIMIT 3
          ) e;
        END IF;

        v_cand_patterns := v_cand_patterns || (v_group || v_dir);
        v_cand_groups   := v_cand_groups   || v_group;
        v_cand_dirs     := v_cand_dirs     || v_dir;
        v_cand_strength := v_cand_strength || abs(v_d)::real;
        v_cand_evidence := v_cand_evidence || jsonb_build_object(
          'source', 'deviation',
          'd', round(v_d::numeric, 3),
          'sigma', round(v_sigma::numeric, 3),
          'agreement', round(v_agree::numeric, 2),
          'snapshots', v_snap_n,
          'exemplar_product_ids', COALESCE(to_jsonb(v_exemplars), '[]'::jsonb));
      END LOOP;
    END IF;
  ELSE
    RAISE NOTICE 'derive_signature_biases: designer % has no fitted theta — deviation path skipped (corrections path still runs)', p_designer_id;
  END IF;

  -- ── B. correction-minted candidates (≥ 3 same-direction on a dimension) ──
  FOR r IN
    SELECT dim.key AS dim_key,
           CASE WHEN (dim.value)::real > 0 THEN '+' ELSE '-' END AS dir,
           count(*) AS n,
           array_agg(c.id ORDER BY c.created_at DESC) AS correction_ids
      FROM taste_corrections c
      CROSS JOIN LATERAL jsonb_each_text(c.direction) dim(key, value)
     WHERE c.designer_id = p_designer_id
       AND dim.key IN ('warmth','complexity','formality','timelessness','boldness','craftsmanship')
       AND dim.value ~ '^-?[0-9.]+$'
       AND (dim.value)::real <> 0
     GROUP BY dim.key, CASE WHEN (dim.value)::real > 0 THEN '+' ELSE '-' END
    HAVING count(*) >= 3
  LOOP
    -- corrections outrank a deviation candidate on the same pattern
    -- (explicit statement > fit) — replace it.
    IF (r.dim_key || r.dir) = ANY(v_cand_patterns) THEN
      v_i := array_position(v_cand_patterns, r.dim_key || r.dir);
      v_cand_strength[v_i] := r.n::real;
      v_cand_evidence[v_i] := jsonb_build_object(
        'source', 'corrections',
        'count', r.n,
        'correction_ids', to_jsonb(r.correction_ids));
      CONTINUE;
    END IF;
    v_cand_patterns := v_cand_patterns || (r.dim_key || r.dir);
    v_cand_groups   := v_cand_groups   || r.dim_key;
    v_cand_dirs     := v_cand_dirs     || r.dir;
    v_cand_strength := v_cand_strength || r.n::real;
    v_cand_evidence := v_cand_evidence || jsonb_build_object(
      'source', 'corrections',
      'count', r.n,
      'correction_ids', to_jsonb(r.correction_ids));
  END LOOP;

  -- ── mint: compound templates first (most conjuncts wins), then singles ───
  IF array_length(v_cand_patterns, 1) IS NOT NULL THEN
    v_consumed := array_fill(false, ARRAY[array_length(v_cand_patterns, 1)]);

    FOR v_tpl IN
      SELECT bt.pattern, bt.name, bt.description,
             array_length(string_to_array(bt.pattern, ' ∧ '), 1) AS n_conj
        FROM bias_templates bt
       WHERE bt.pattern LIKE '%∧%'
       ORDER BY n_conj DESC, bt.pattern
    LOOP
      v_conjuncts := string_to_array(v_tpl.pattern, ' ∧ ');
      v_all_present := true;
      FOR v_j IN 1..array_length(v_conjuncts, 1) LOOP
        v_i := array_position(v_cand_patterns, v_conjuncts[v_j]);
        IF v_i IS NULL OR v_consumed[v_i] THEN v_all_present := false; EXIT; END IF;
      END LOOP;
      CONTINUE WHEN NOT v_all_present;

      -- anchor row = the first conjunct's candidate; evidence carries the pattern.
      v_i := array_position(v_cand_patterns, v_conjuncts[1]);
      SELECT * INTO v_existing FROM signature_biases sb
       WHERE sb.designer_id = p_designer_id
         AND sb.feature_group = v_cand_groups[v_i]
         AND sb.direction = v_cand_dirs[v_i]
       ORDER BY sb.updated_at DESC LIMIT 1;

      IF FOUND AND v_existing.status <> 'proposed' THEN
        v_skipped_locked := v_skipped_locked + 1;
        v_kept := v_kept || v_existing.id;  -- human-owned; spare from housekeeping
      ELSIF FOUND THEN
        UPDATE signature_biases
           SET learned_strength = v_cand_strength[v_i],
               evidence = v_cand_evidence[v_i] || jsonb_build_object('pattern', v_tpl.pattern),
               version = version + 1
         WHERE id = v_existing.id;
        v_updated := v_updated + 1;
        v_kept := v_kept || v_existing.id;
      ELSE
        INSERT INTO signature_biases
          (designer_id, feature_group, direction, learned_strength, name, description, status, evidence)
        VALUES
          (p_designer_id, v_cand_groups[v_i], v_cand_dirs[v_i], v_cand_strength[v_i],
           v_tpl.name, v_tpl.description, 'proposed',
           v_cand_evidence[v_i] || jsonb_build_object('pattern', v_tpl.pattern))
        RETURNING id INTO v_id;
        v_minted := v_minted + 1;
        v_kept := v_kept || v_id;
      END IF;

      -- consume every conjunct so singles don't double-mint.
      FOR v_j IN 1..array_length(v_conjuncts, 1) LOOP
        v_consumed[array_position(v_cand_patterns, v_conjuncts[v_j])] := true;
      END LOOP;
    END LOOP;

    -- singles
    FOR v_i IN 1..array_length(v_cand_patterns, 1) LOOP
      CONTINUE WHEN v_consumed[v_i];

      SELECT bt.name, bt.description INTO v_name, v_desc
        FROM bias_templates bt WHERE bt.pattern = v_cand_patterns[v_i];
      IF v_name IS NULL THEN
        -- Deterministic fallback name for a novel pattern — see the CLAUDE
        -- NAMING SEAM note in the function header. Copy law: no scores, no "AI".
        v_name := CASE WHEN v_cand_dirs[v_i] = '+'
                       THEN initcap(replace(replace(v_cand_groups[v_i], ':', ' '), '_', ' ')) || ' lean'
                       ELSE 'Away from ' || replace(replace(v_cand_groups[v_i], ':', ' '), '_', ' ') END;
        v_desc := 'A consistent lean your teaching keeps showing. Rename it to make it yours.';
      END IF;

      SELECT * INTO v_existing FROM signature_biases sb
       WHERE sb.designer_id = p_designer_id
         AND sb.feature_group = v_cand_groups[v_i]
         AND sb.direction = v_cand_dirs[v_i]
       ORDER BY sb.updated_at DESC LIMIT 1;

      IF FOUND AND v_existing.status <> 'proposed' THEN
        v_skipped_locked := v_skipped_locked + 1;
        v_kept := v_kept || v_existing.id;
      ELSIF FOUND THEN
        UPDATE signature_biases
           SET learned_strength = v_cand_strength[v_i],
               evidence = v_cand_evidence[v_i],
               version = version + 1
         WHERE id = v_existing.id;
        v_updated := v_updated + 1;
        v_kept := v_kept || v_existing.id;
      ELSE
        INSERT INTO signature_biases
          (designer_id, feature_group, direction, learned_strength, name, description, status, evidence)
        VALUES
          (p_designer_id, v_cand_groups[v_i], v_cand_dirs[v_i], v_cand_strength[v_i],
           v_name, v_desc, 'proposed', v_cand_evidence[v_i])
        RETURNING id INTO v_id;
        v_minted := v_minted + 1;
        v_kept := v_kept || v_id;
      END IF;
    END LOOP;
  END IF;

  -- ── housekeeping: retire stale machine proposals (proposed-only, ever) ───
  -- Correction candidates are recomputed every run; deviation candidates only
  -- when a fitted theta exists — so without one, deviation-sourced proposals
  -- are left alone rather than falsely "stale".
  DELETE FROM signature_biases sb
   WHERE sb.designer_id = p_designer_id
     AND sb.status = 'proposed'
     AND NOT (sb.id = ANY(COALESCE(v_kept, '{}'::uuid[])))
     AND (sb.evidence->>'source' = 'corrections'
          OR (sb.evidence->>'source' = 'deviation' AND v_deviation_ran));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'designer_id', p_designer_id,
    'candidates', COALESCE(array_length(v_cand_patterns, 1), 0),
    'minted', v_minted,
    'updated', v_updated,
    'skipped_locked', v_skipped_locked,
    'deleted_stale', v_deleted
  );
END;
$$;

COMMENT ON FUNCTION derive_signature_biases(uuid) IS
  'Your-Eye bias derivation (design §8.5): standardized deviation d_k = (θ_D,k − θ_H,k)/σ_k over the interpretable φ dims (σ floor 0.10, roster < 3 → floor only), candidates |d_k| ≥ 1 with sign-stability ≥ 0.8 across the last 5 snapshots (≥ 2 required; documented bootstrap proxy); ≥ 3 same-direction corrections mint directly with citations. Names via bias_templates (compound patterns first) else a deterministic fallback (Claude naming seam documented in-body). Writes status=proposed ONLY — confirmed/edited/muted rows are never touched; stale proposed rows are pruned.';

-- ─── 9. match_designers_for_client — §18 / §9.3 ─────────────────────────────
-- sim = ½(1 + cos(v_client, v_D)) — never surfaced as a bare % (§9.3): every
-- row carries confidence jsonb {score, n, label} where score = mean
-- confidence_map score (fallback: the designer's reliability ρ_D — a
-- portfolio-only designer honestly reads "early read"), n = judgment count,
-- label = the §10.6 band (early read / good / strong). Raw vectors never
-- leave the function. v_D = taste_vector, else portfolio_centroid (§4.3
-- cold start). Bearer-capability access mirrors get_aesthete_matches: the
-- caller must be authenticated and, when the profile is claimed, be its
-- owner (or a lead).
CREATE OR REPLACE FUNCTION match_designers_for_client(p_session_key uuid)
RETURNS TABLE (designer_id uuid, similarity real, confidence jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile client_style_profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'match_designers_for_client: authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_key IS NULL THEN
    RAISE EXCEPTION 'match_designers_for_client: p_session_key is required';
  END IF;

  SELECT csp.* INTO v_profile
    FROM client_style_profiles csp
   WHERE csp.session_key = p_session_key AND csp.is_current
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_designers_for_client: unknown session_key' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.user_id IS NOT NULL AND v_profile.user_id <> v_caller
     AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'match_designers_for_client: this session_key belongs to another account' USING ERRCODE = '42501';
  END IF;

  IF v_profile.style_vector IS NULL THEN
    -- Legitimate state (00243: style_vector is NULLABLE by design) — an
    -- empty result, not an error.
    RAISE NOTICE 'match_designers_for_client: profile has no style_vector yet — no matches';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.designer_id,
         (1.0 - (COALESCE(p.taste_vector, p.portfolio_centroid) <=> v_profile.style_vector) / 2.0)::real,
         jsonb_build_object(
           'score', round(COALESCE(cm.score, p.reliability)::numeric, 3),
           'n', COALESCE((p.sources->>'judgments')::int, 0),
           'label', CASE
             WHEN COALESCE(cm.score, p.reliability) >= 0.7 THEN 'strong'
             WHEN COALESCE(cm.score, p.reliability) >= 0.4 THEN 'good'
             ELSE 'early read' END
         )
    FROM designer_taste_profiles p
    LEFT JOIN LATERAL (
      SELECT avg((e.value->>'score')::real) AS score
        FROM jsonb_each(COALESCE(p.confidence_map, '{}'::jsonb)) e
       WHERE (e.value->>'score') ~ '^-?[0-9.]+$'
    ) cm ON true
   WHERE p.retired_at IS NULL
     AND COALESCE(p.taste_vector, p.portfolio_centroid) IS NOT NULL
   ORDER BY 2 DESC
   LIMIT 10;
END;
$$;

COMMENT ON FUNCTION match_designers_for_client(uuid) IS
  'Client↔designer alignment (design §9.3/§18): sim = ½(1+cos(v_client, v_D)) with v_D = taste_vector else portfolio_centroid; each row carries confidence {score, n, label} — never a bare percentage. SECURITY DEFINER, authenticated only; bearer-capability access mirrors get_aesthete_matches; raw vectors never returned. Empty set when the profile has no style_vector (legitimate 00243 state).';

-- ─── 10. aesthete_house_portfolio_nightly — the 4B wrapper (self-contained) ──
-- Runs independently of Wave 4A's nightly (merge-order safety):
--   phase 1: recompute_portfolio_centroid for STALE designers — an embedded
--            item newer than the profile row, or no centroid yet.
--   phase 2: derive_signature_biases for designers with fresh fuel — a θ
--            snapshot or a correction in the last 48 h.
-- Per-designer isolation: one failure logs and moves on.
CREATE OR REPLACE FUNCTION aesthete_house_portfolio_nightly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_centroids int := 0;
  v_derived int := 0;
  v_errors int := 0;
BEGIN
  -- phase 1: stale centroids
  FOR r IN
    SELECT DISTINCT i.designer_id AS did
      FROM designer_portfolio_items i
      LEFT JOIN designer_taste_profiles p ON p.designer_id = i.designer_id
     WHERE i.status = 'embedded' AND i.embedding IS NOT NULL
       AND (p.designer_id IS NULL OR p.retired_at IS NULL)
       AND (p.designer_id IS NULL
            OR p.portfolio_centroid IS NULL
            OR i.updated_at > p.updated_at)
  LOOP
    BEGIN
      PERFORM recompute_portfolio_centroid(r.did);
      v_centroids := v_centroids + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'aesthete_house_portfolio_nightly: centroid recompute failed for %: %', r.did, SQLERRM;
    END;
  END LOOP;

  -- phase 2: fresh-fuel bias derivation
  FOR r IN
    SELECT DISTINCT f.did
      FROM (
        SELECT s.designer_id AS did FROM designer_taste_snapshots s
         WHERE s.created_at > now() - interval '48 hours' AND s.theta IS NOT NULL
        UNION
        SELECT c.designer_id FROM taste_corrections c
         WHERE c.created_at > now() - interval '48 hours'
      ) f
      LEFT JOIN designer_taste_profiles p ON p.designer_id = f.did
     WHERE p.designer_id IS NULL OR p.retired_at IS NULL
  LOOP
    BEGIN
      PERFORM derive_signature_biases(r.did);
      v_derived := v_derived + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'aesthete_house_portfolio_nightly: bias derivation failed for %: %', r.did, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'centroids_recomputed', v_centroids,
    'biases_derived_for', v_derived,
    'errors', v_errors,
    'ran_at', now());
END;
$$;

COMMENT ON FUNCTION aesthete_house_portfolio_nightly() IS
  'Wave-4B nightly wrapper (03:15 cron, 00249): recompute_portfolio_centroid for designers with embedded items newer than their profile (or no centroid), then derive_signature_biases for designers with a θ snapshot or correction in the last 48 h. Per-designer error isolation. Independent of the Wave-4A aesthete-nightly by design.';

-- ─── 11. Cron: 03:15 daily (guarded idiom, rule 8) ──────────────────────────
-- Direct-SQL body — there is no edge function in this path (documented
-- deviation, header). Pure SQL + idempotent ⇒ locally safe by construction.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-house-portfolio') THEN
    PERFORM cron.unschedule('aesthete-house-portfolio');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-house-portfolio',
  '15 3 * * *',
  $$
  SELECT public.aesthete_house_portfolio_nightly();
  $$
);

-- ─── 12. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION enqueue_portfolio_embed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_geometric_median(vector[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_interpretable_groups() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION recompute_portfolio_centroid(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seed_house_from_validated_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION derive_signature_biases(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION match_designers_for_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aesthete_house_portfolio_nightly() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recompute_portfolio_centroid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seed_house_from_validated_catalog() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION derive_signature_biases(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_designers_for_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION aesthete_house_portfolio_nightly() TO service_role;
GRANT EXECUTE ON FUNCTION _aesthete_geometric_median(vector[]) TO service_role;
GRANT EXECUTE ON FUNCTION _aesthete_interpretable_groups() TO service_role;
