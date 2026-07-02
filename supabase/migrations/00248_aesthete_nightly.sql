-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00248: Aesthete nightly — taste-refit plumbing, preview step,
--                  reliability/stats writers, starvation decay, 02:30 cron
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md
--   §8.2 (BT MAP refit orchestration + online preview) · §8.3 (ρ_D) ·
--   §8.4 (confidence map, drift, starvation decay) · §12.2 (nightly phases,
--   stats_writer row) · §14.4 (backtest bars + the dial-unlock gate) ·
--   §4.3 (v_D EMA over judgment winners).
-- Delivery plan: Wave 4A. Number 00248 verified free (repo tip was 00247).
--
-- Architecture (the Wave-4 refinement, delivery plan row 4A): the refit MATH
-- is a stateless HTTP call on services/aesthete-inference (/fit/taste — the
-- request carries judgments + φ features + prior θ_H + hyperparams); the
-- aesthete-nightly EDGE FUNCTION orchestrates. This migration ships the SQL
-- the orchestration consumes, so every deterministic piece is testable in a
-- rolled-back transaction (supabase/tests/aesthete/nightly_test.sql):
--
--   1. _aesthete_primary_archetype(product)   — shared style-group resolver
--   2. get_taste_refit_designers()            — who has unprocessed fuel
--   3. get_taste_refit_payload(designer)      — judgments + φ (via 00244's
--      _aesthete_phi — the 94-d ordering contract lives in SQL and ONLY in
--      SQL; the worker consumes φ verbatim, so parity is by construction)
--   4. apply_taste_refit(designer, θ, …)      — profile write + snapshot
--      version++ + v_D EMA (§4.3) + watermark + preview-flag clear
--   5. preview_taste_update(judgment)         — §8.2 online preview: bounded
--      step, flagged, overwritten by the nightly refit
--   6. get_designer_reliability_inputs(...)   — probe agreement (§8.3) +
--      validation consensus per archetype (§8.4) + per-style counts
--   7. apply_designer_reliability(...)        — ρ_D + confidence_map +
--      designer_style_confidence writer
--   8. refresh_designer_teaching_stats()      — §12.2 stats_writer:
--      designer_teaching_stats.accuracy_score + match_impact_count
--   9. apply_starvation_decay()               — §8.4: c_D×0.95 monthly +
--      deviation shrink exp(−1/12) per idle month after 90 d idle
--  10. cron 'aesthete-nightly' 02:30 → invoke_edge_function (guarded idiom)
--
-- Documented decisions (flagged to the conductor / for the spec fold):
--   • θ_H prior may be NULL — the dev house v1 (00242 §25) ships theta NULL.
--     The payload passes theta_prior: null through and the worker treats a
--     null prior as the ZERO VECTOR (cold house; §8.2's "prior toward house"
--     degrades to plain L2 shrinkage until a real θ_H exists).
--   • Correction-with-replacement rows (product_id AND replacement_product_id
--     both set) become weight-2.0 pairs (replacement ≻ rejected) per §8.2.
--     REJECTION-ONLY corrections (no replacement) are NOT consumed by the v1
--     refit — §8.2's "hinge against a pseudo-item built from the client
--     profile" needs client-profile φ synthesis that doesn't exist yet.
--     Their created_at still advances the watermark (they're processed —
--     processed as "no pairwise evidence").
--   • Event weights r_t (§8.2): judgment 1.0 · probe 1.0 (probes are real
--     judgments, kind is bookkeeping) · rule_pseudo 0.5 · correction 2.0.
--   • style_group = the WINNER's primary archetype (highest-confidence
--     archetype row in product_styles; ties by styles.display_order NULLS
--     LAST, name — same ordering law as φ). neither/both rows carry NULL.
--   • v_D EMA (§4.3) is a FULL RECOMPUTE each refit (chronological EMA over
--     all judgment winners' aesthete_vectors, seeded from portfolio_centroid)
--     — same "judgments are the source of truth; state is a cache"
--     philosophy as θ. Winners without vectors are skipped. Corrections do
--     not feed the EMA (§4.3 names judgment winners only).
--   • The preview flag lives at sources.theta_preview (jsonb) — no schema
--     column; the nightly refit strips it (00242's designer_taste_profiles
--     is untouched structurally).
--   • The starvation-decay month marker lives at sources.starvation_decayed_at
--     (jsonb) for the same reason.
--   • accuracy_score (§12.2 stats_writer) := share of OTHER designers'
--     teaching_validations votes that 'confirm' on products this designer
--     taught (product_style_spectrum.assigned_by). consensus_g (§8.4) is the
--     same statistic grouped by the product's primary archetype.
--   • match_impact_count := match_events rows citing ≥ 1 product whose
--     spectrum the designer taught (results[*].product_id ∩ taught set).
--   • preview step bound: ‖Δθ‖₂ ≤ 0.25 (scaled down when exceeded) — §8.2
--     gives the step formula but no bound; 0.25 keeps a single preview well
--     under typical ‖θ‖ so one tap can never whipsaw the panel.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. _aesthete_primary_archetype — shared style-group resolver ───────────
CREATE OR REPLACE FUNCTION _aesthete_primary_archetype(p_product_id uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT ps.style_id
    FROM product_styles ps
    JOIN styles s ON s.id = ps.style_id AND s.is_archetype
   WHERE ps.product_id = p_product_id
   ORDER BY ps.confidence DESC NULLS LAST, s.display_order NULLS LAST, s.name
   LIMIT 1
$fn$;

COMMENT ON FUNCTION _aesthete_primary_archetype(uuid) IS
  'Primary archetype of a product: highest-confidence archetype row in product_styles, ties broken by the φ ordering law (styles.display_order NULLS LAST, name). Style-group resolver for the nightly refit/reliability (00248).';

-- ─── 2. get_taste_refit_designers — who has unprocessed fuel ────────────────
CREATE OR REPLACE FUNCTION get_taste_refit_designers()
RETURNS TABLE (designer_id uuid, n_unprocessed bigint, last_processed_at timestamptz, drift_flag boolean)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH fuel AS (
    SELECT j.designer_id, j.created_at FROM taste_judgments j
    UNION ALL
    SELECT c.designer_id, c.created_at FROM taste_corrections c
  )
  SELECT f.designer_id,
         count(*) AS n_unprocessed,
         p.judgments_processed_at,
         COALESCE(p.drift_flag, false)   -- drift halves τ for the NEXT refit (§8.4)
    FROM fuel f
    LEFT JOIN designer_taste_profiles p ON p.designer_id = f.designer_id
   WHERE (p.judgments_processed_at IS NULL OR f.created_at > p.judgments_processed_at)
     AND (p.retired_at IS NULL)
   GROUP BY f.designer_id, p.judgments_processed_at, p.drift_flag
$fn$;

COMMENT ON FUNCTION get_taste_refit_designers() IS
  'Nightly phase-1 worklist (design §12.2): designers with judgments/corrections newer than their judgments_processed_at watermark, excluding retired profiles. drift_flag rides along so the edge fn can halve τ for the next refit (§8.4). Consumed by the aesthete-nightly edge fn.';

-- ─── 3. get_taste_refit_payload — the stateless /fit/taste request body ─────
-- φ comes from 00244's _aesthete_phi — the ONLY implementation of the §8.1
-- 94-d ordering contract. The worker never assembles φ.
CREATE OR REPLACE FUNCTION get_taste_refit_payload(p_designer_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH pairs AS (
    -- One pair row per judgment (all kinds) …
    SELECT j.id,
           'judgment:' || j.kind AS source,
           j.product_a AS pa,
           j.product_b AS pb,
           j.choice,
           CASE j.kind WHEN 'rule_pseudo' THEN 0.5 ELSE 1.0 END::real AS weight,
           j.created_at
      FROM taste_judgments j
     WHERE j.designer_id = p_designer_id
    UNION ALL
    -- … plus each correction-with-replacement as (replacement ≻ rejected).
    SELECT c.id,
           'correction',
           c.replacement_product_id,
           c.product_id,
           'a',
           2.0::real,                          -- §8.2 live-client stakes
           c.created_at
      FROM taste_corrections c
     WHERE c.designer_id = p_designer_id
       AND c.product_id IS NOT NULL
       AND c.replacement_product_id IS NOT NULL
  ),
  -- φ memoized per distinct product (a judgment history revisits products).
  phis AS (
    SELECT prods.pid, to_jsonb(_aesthete_phi(prods.pid)) AS phi
      FROM (SELECT DISTINCT pa AS pid FROM pairs
            UNION
            SELECT DISTINCT pb FROM pairs) prods
  ),
  items AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'source', r.source,
             'phi_a', fa.phi,
             'phi_b', fb.phi,
             'choice', r.choice,
             'weight', r.weight,
             'age_days', round((extract(epoch FROM (now() - r.created_at)) / 86400.0)::numeric, 4),
             'style_group', CASE
               WHEN r.choice = 'a' THEN _aesthete_primary_archetype(r.pa)
               WHEN r.choice = 'b' THEN _aesthete_primary_archetype(r.pb)
               ELSE NULL END,
             'created_at', r.created_at
           ) ORDER BY r.created_at, r.id), '[]'::jsonb) AS judgments,
           count(*) FILTER (WHERE r.source LIKE 'judgment:%') AS n_judgments,
           count(*) FILTER (WHERE r.source = 'correction') AS n_corrections
      FROM pairs r
      JOIN phis fa ON fa.pid = r.pa
      JOIN phis fb ON fb.pid = r.pb
  )
  SELECT jsonb_build_object(
    'designer_id', p_designer_id,
    -- SQL NULL → JSON null; the worker treats a null prior as the zero vector.
    'theta_prior', to_jsonb((SELECT h.theta FROM house_taste h WHERE h.status = 'active')),
    'house_version', (SELECT h.version FROM house_taste h WHERE h.status = 'active'),
    -- Watermark: EVERYTHING appended so far counts as processed — including
    -- rejection-only corrections the v1 refit carries no pairwise term for.
    'watermark', greatest(
      (SELECT max(created_at) FROM taste_judgments  WHERE designer_id = p_designer_id),
      (SELECT max(created_at) FROM taste_corrections WHERE designer_id = p_designer_id)),
    'n_judgments', i.n_judgments,
    'n_corrections', i.n_corrections,
    'judgments', i.judgments)
  FROM items i
$fn$;

COMMENT ON FUNCTION get_taste_refit_payload(uuid) IS
  'Assembles the stateless /fit/taste request (design §8.2/§12.2): the designer''s full pair history (judgments + weight-2.0 replacement corrections) with φ per 00244''s _aesthete_phi (94-d ordering contract lives HERE), decay ages, event weights, θ_H prior (null when the active house has no theta — worker treats as zero vector), and the processing watermark.';

-- ─── 4. apply_taste_refit — the phase-1 write path ───────────────────────────
CREATE OR REPLACE FUNCTION apply_taste_refit(
  p_designer_id uuid,
  p_theta real[],
  p_watermark timestamptz,
  p_diagnostics jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profile designer_taste_profiles;
  v_new_version int;
  v_vd vector;
  v_winner vector;
  v_rec record;
  v_sources jsonb;
  v_n_judgments int;
  v_n_corrections int;
BEGIN
  IF p_theta IS NULL OR array_length(p_theta, 1) IS DISTINCT FROM 94 THEN
    RAISE EXCEPTION 'apply_taste_refit: p_theta must be the 94-d basis (§8.1), got length %',
      COALESCE(array_length(p_theta, 1), 0);
  END IF;
  IF p_watermark IS NULL THEN
    RAISE EXCEPTION 'apply_taste_refit: p_watermark is required (the refit consumed through some instant)';
  END IF;

  -- Profile shell first (a designer can be refit before ever touching the
  -- teaching UI if corrections arrived via other surfaces).
  INSERT INTO designer_taste_profiles (designer_id, sources)
  VALUES (p_designer_id, '{}'::jsonb)
  ON CONFLICT (designer_id) DO NOTHING;

  SELECT * INTO v_profile FROM designer_taste_profiles
   WHERE designer_id = p_designer_id FOR UPDATE;

  IF v_profile.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'apply_taste_refit: designer % is retired (§12.5) — refits are not applied', p_designer_id;
  END IF;

  -- §4.3 v_D EMA, full recompute: chronological over judgment winners'
  -- aesthete_vectors, seeded from the portfolio centroid (which never decays).
  v_vd := v_profile.portfolio_centroid;
  FOR v_rec IN
    SELECT CASE j.choice WHEN 'a' THEN pa.aesthete_vector ELSE pb.aesthete_vector END AS w
      FROM taste_judgments j
      JOIN products pa ON pa.id = j.product_a
      JOIN products pb ON pb.id = j.product_b
     WHERE j.designer_id = p_designer_id
       AND j.choice IN ('a', 'b')
     ORDER BY j.created_at, j.id
  LOOP
    v_winner := v_rec.w;
    CONTINUE WHEN v_winner IS NULL;
    IF v_vd IS NULL THEN
      v_vd := vec_normalize(v_winner);
    ELSE
      v_vd := vec_normalize(vec_scale(v_vd, 0.97) + vec_scale(vec_normalize(v_winner), 0.03));
    END IF;
  END LOOP;

  -- Canonical source counters (the RPC-side bump counters are provisional).
  SELECT count(*) INTO v_n_judgments FROM taste_judgments WHERE designer_id = p_designer_id;
  SELECT count(*) INTO v_n_corrections FROM taste_corrections WHERE designer_id = p_designer_id;

  v_new_version := v_profile.version + 1;
  v_sources := (COALESCE(v_profile.sources, '{}'::jsonb) - 'theta_preview')
               || jsonb_build_object(
                    'judgments', v_n_judgments,
                    'corrections', v_n_corrections,
                    'portfolio_items',
                      (SELECT count(*) FROM designer_portfolio_items WHERE designer_id = p_designer_id),
                    'rules',
                      (SELECT count(*) FROM taste_rules
                        WHERE owner_scope = 'designer' AND designer_id = p_designer_id));

  UPDATE designer_taste_profiles
     SET theta = p_theta,
         taste_vector = COALESCE(v_vd, taste_vector),
         judgments_processed_at = p_watermark,
         drift_flag = COALESCE((p_diagnostics->>'drift')::boolean, drift_flag),
         sources = v_sources,
         version = v_new_version
   WHERE designer_id = p_designer_id;

  -- Append-only snapshot (§5.4): the version row IS the materialization.
  INSERT INTO designer_taste_snapshots
    (designer_id, version, taste_vector, theta, spectrums, reliability, sources)
  VALUES
    (p_designer_id, v_new_version, COALESCE(v_vd, v_profile.taste_vector), p_theta,
     jsonb_build_object(
       'warmth', v_profile.warmth, 'complexity', v_profile.complexity,
       'formality', v_profile.formality, 'timelessness', v_profile.timelessness,
       'boldness', v_profile.boldness, 'craftsmanship', v_profile.craftsmanship),
     v_profile.reliability,
     v_sources || jsonb_build_object('refit', COALESCE(p_diagnostics, '{}'::jsonb)));

  RETURN jsonb_build_object(
    'version', v_new_version,
    'watermark', p_watermark,
    'v_d_updated', v_vd IS NOT NULL,
    'theta_dim', array_length(p_theta, 1)
  );
END $fn$;

COMMENT ON FUNCTION apply_taste_refit(uuid, real[], timestamptz, jsonb) IS
  'Nightly phase-1 write path (design §8.2/§12.2): writes θ_D, recomputes the §4.3 v_D EMA over judgment winners (seeded from the never-decaying portfolio centroid), advances judgments_processed_at, bumps version, appends a designer_taste_snapshots row carrying the refit diagnostics, and strips the §8.2 preview flag. Refuses retired profiles. Diagnostics key "drift" sets drift_flag.';

-- ─── 5. preview_taste_update — the §8.2 online preview ───────────────────────
-- θ_D ← θ_D + 0.05·r·(1−p̂)·(φ_i − φ_j), applied immediately after a teaching
-- judgment so "Your Eye" visibly moves; flagged sources.theta_preview and
-- OVERWRITTEN by the nightly refit (θ is a cache; judgments are truth).
CREATE OR REPLACE FUNCTION preview_taste_update(p_judgment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_j taste_judgments;
  v_theta real[];
  v_theta_h real[];
  v_phi_w real[];   -- winner
  v_phi_l real[];   -- loser
  v_r real;
  v_dot double precision := 0;
  v_p_hat double precision;
  v_eta double precision;
  v_step_sq double precision := 0;
  v_step_norm double precision;
  v_scale double precision := 1.0;
  v_bounded boolean := false;
  i int;
BEGIN
  SELECT * INTO v_j FROM taste_judgments WHERE id = p_judgment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview_taste_update: no judgment %', p_judgment_id;
  END IF;
  -- Owner-only for JWT callers; auth.uid() IS NULL = service/postgres path
  -- (the EXECUTE grants restrict who gets here).
  IF v_caller IS NOT NULL AND v_caller <> v_j.designer_id THEN
    RAISE EXCEPTION 'preview_taste_update: judgment % belongs to another designer', p_judgment_id
      USING ERRCODE = '42501';
  END IF;

  IF v_j.choice NOT IN ('a', 'b') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_pairwise_preference');
  END IF;

  v_r := CASE v_j.kind WHEN 'rule_pseudo' THEN 0.5 ELSE 1.0 END;
  v_phi_w := _aesthete_phi(CASE v_j.choice WHEN 'a' THEN v_j.product_a ELSE v_j.product_b END);
  v_phi_l := _aesthete_phi(CASE v_j.choice WHEN 'a' THEN v_j.product_b ELSE v_j.product_a END);

  -- Base θ: current θ_D, else θ_H, else the zero vector (cold everything).
  SELECT p.theta INTO v_theta FROM designer_taste_profiles p
   WHERE p.designer_id = v_j.designer_id;
  IF v_theta IS NULL THEN
    SELECT h.theta INTO v_theta_h FROM house_taste h WHERE h.status = 'active';
    v_theta := COALESCE(v_theta_h, array_fill(0::real, ARRAY[94]));
  END IF;
  IF array_length(v_theta, 1) IS DISTINCT FROM 94 THEN
    RAISE EXCEPTION 'preview_taste_update: stored theta is %-d, expected the 94-d basis',
      COALESCE(array_length(v_theta, 1), 0);
  END IF;

  FOR i IN 1..94 LOOP
    v_dot := v_dot + v_theta[i] * (v_phi_w[i] - v_phi_l[i]);
  END LOOP;
  v_p_hat := 1.0 / (1.0 + exp(-v_dot));
  v_eta := 0.05 * v_r * (1.0 - v_p_hat);

  FOR i IN 1..94 LOOP
    v_step_sq := v_step_sq + (v_eta * (v_phi_w[i] - v_phi_l[i]))^2;
  END LOOP;
  v_step_norm := sqrt(v_step_sq);
  IF v_step_norm > 0.25 THEN                      -- the documented bound
    v_scale := 0.25 / v_step_norm;
    v_bounded := true;
  END IF;

  FOR i IN 1..94 LOOP
    v_theta[i] := (v_theta[i] + v_scale * v_eta * (v_phi_w[i] - v_phi_l[i]))::real;
  END LOOP;

  -- Preview writes θ + the flag ONLY: no version bump, no snapshot, no
  -- watermark movement — the nightly refit recomputes from truth.
  INSERT INTO designer_taste_profiles (designer_id, theta, sources)
  VALUES (v_j.designer_id, v_theta, jsonb_build_object('theta_preview', true))
  ON CONFLICT (designer_id) DO UPDATE
    SET theta = EXCLUDED.theta,
        sources = COALESCE(designer_taste_profiles.sources, '{}'::jsonb)
                  || jsonb_build_object('theta_preview', true);

  RETURN jsonb_build_object(
    'applied', true,
    'p_hat', round(v_p_hat::numeric, 6),
    'step_norm', round((v_scale * v_step_norm)::numeric, 6),
    'bounded', v_bounded,
    'preview', true
  );
END $fn$;

COMMENT ON FUNCTION preview_taste_update(bigint) IS
  'The §8.2 online preview: θ_D ← θ_D + 0.05·r·(1−p̂)·(φ_winner − φ_loser) applied immediately after a judgment, step bounded at ‖Δθ‖₂ ≤ 0.25, flagged sources.theta_preview, OVERWRITTEN by the nightly refit (which strips the flag). Owner-gated for JWT callers; never bumps version or writes snapshots.';

-- ─── 6. get_designer_reliability_inputs — §8.3/§8.4 evidence ─────────────────
CREATE OR REPLACE FUNCTION get_designer_reliability_inputs(p_designer_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'designer_id', p_designer_id,
    'n_judgments', (SELECT count(*) FROM taste_judgments WHERE designer_id = p_designer_id),
    'n_usable',    (SELECT count(*) FROM taste_judgments
                     WHERE designer_id = p_designer_id AND choice IN ('a','b')),
    'last_judgment_at', (SELECT max(created_at) FROM taste_judgments WHERE designer_id = p_designer_id),
    -- §8.3 blind-repeat probe agreement: the probe row stores the REVERSED
    -- pair, so agreement = the choice flipped (a↔b); neither/both agree with
    -- themselves.
    'probe', (
      SELECT jsonb_build_object(
        'n', count(*),
        'agreement', CASE WHEN count(*) = 0 THEN NULL
          ELSE round(avg(CASE
            WHEN (sj.choice = 'a' AND aj.choice = 'b')
              OR (sj.choice = 'b' AND aj.choice = 'a')
              OR (sj.choice IN ('neither','both') AND aj.choice = sj.choice)
            THEN 1.0 ELSE 0.0 END)::numeric, 4) END)
        FROM taste_probe_queue q
        JOIN taste_judgments sj ON sj.id = q.source_judgment_id
        JOIN taste_judgments aj ON aj.id = q.answered_judgment_id
       WHERE q.designer_id = p_designer_id AND q.status = 'answered'),
    -- §8.4 consensus_g: agreement (confirm share) of OTHER designers'
    -- validations on products this designer taught, per primary archetype.
    'consensus', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'style_id', g.style_id, 'n', g.n, 'agreement', g.agreement))
        FROM (
          SELECT _aesthete_primary_archetype(pss.product_id) AS style_id,
                 count(tv.id) AS n,
                 round(avg(CASE WHEN tv.vote = 'confirm' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS agreement
            FROM product_style_spectrum pss
            JOIN teaching_validations tv ON tv.product_id = pss.product_id
                                        AND tv.validator_id <> pss.assigned_by
           WHERE pss.assigned_by = p_designer_id
           GROUP BY 1) g
       WHERE g.style_id IS NOT NULL), '[]'::jsonb),
    -- Judgment exposure per archetype (winner's primary archetype — the same
    -- grouping the refit payload carries).
    'style_counts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('style_id', s.style_id, 'n', s.n))
        FROM (
          SELECT _aesthete_primary_archetype(
                   CASE j.choice WHEN 'a' THEN j.product_a ELSE j.product_b END) AS style_id,
                 count(*) AS n
            FROM taste_judgments j
           WHERE j.designer_id = p_designer_id AND j.choice IN ('a','b')
           GROUP BY 1) s
       WHERE s.style_id IS NOT NULL), '[]'::jsonb)
  )
$fn$;

COMMENT ON FUNCTION get_designer_reliability_inputs(uuid) IS
  'Nightly phase-2 evidence (design §8.3/§8.4): probe agreement from answered taste_probe_queue rows (reversed-pair semantics), validation consensus per archetype on products the designer taught, judgment exposure per archetype. The AUC halves come from /fit/taste/backtest; the edge fn combines.';

-- ─── 7. apply_designer_reliability — ρ_D + confidence writer ─────────────────
-- p_style_confidence: jsonb array of {style_id, level, judgment_count}.
CREATE OR REPLACE FUNCTION apply_designer_reliability(
  p_designer_id uuid,
  p_reliability real,
  p_confidence_map jsonb DEFAULT '{}'::jsonb,
  p_style_confidence jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_item jsonb;
  v_rows int := 0;
BEGIN
  IF p_reliability IS NULL OR p_reliability < 0 OR p_reliability > 1 THEN
    RAISE EXCEPTION 'apply_designer_reliability: reliability must be in [0,1], got %', p_reliability;
  END IF;
  IF jsonb_typeof(COALESCE(p_style_confidence, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'apply_designer_reliability: p_style_confidence must be a jsonb array';
  END IF;

  INSERT INTO designer_taste_profiles (designer_id, reliability, confidence_map)
  VALUES (p_designer_id, p_reliability, COALESCE(p_confidence_map, '{}'::jsonb))
  ON CONFLICT (designer_id) DO UPDATE
    SET reliability = EXCLUDED.reliability,
        confidence_map = EXCLUDED.confidence_map;

  -- Full replace (recompute-overwrite — idempotent by construction).
  DELETE FROM designer_style_confidence WHERE designer_id = p_designer_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_style_confidence, '[]'::jsonb)) LOOP
    IF (v_item->>'level') NOT IN ('learning','advanced','expert') THEN
      RAISE EXCEPTION 'apply_designer_reliability: level must be learning|advanced|expert, got %',
        v_item->>'level';
    END IF;
    INSERT INTO designer_style_confidence (designer_id, style_id, level, judgment_count)
    VALUES (p_designer_id, (v_item->>'style_id')::uuid, v_item->>'level',
            COALESCE((v_item->>'judgment_count')::int, 0));
    v_rows := v_rows + 1;
  END LOOP;

  RETURN jsonb_build_object('reliability', p_reliability, 'style_rows', v_rows);
END $fn$;

COMMENT ON FUNCTION apply_designer_reliability(uuid, real, jsonb, jsonb) IS
  'Nightly phase-2 writer (design §8.3/§8.4): ρ_D + confidence_map jsonb (style entries; may carry a _dial key with the §14.4 unlock verdict) on designer_taste_profiles, and a full replace of designer_style_confidence rows. Recompute-overwrite — same inputs, same state.';

-- ─── 8. refresh_designer_teaching_stats — the §12.2 stats_writer ─────────────
CREATE OR REPLACE FUNCTION refresh_designer_teaching_stats()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n int;
BEGIN
  WITH designers AS (
    SELECT DISTINCT assigned_by AS designer_id FROM product_style_spectrum
    UNION
    SELECT DISTINCT validator_id FROM teaching_validations
  ),
  accuracy AS (
    -- Validation-consensus agreement on the designer's taught products:
    -- confirm votes by OTHERS / all votes by others. No votes → 0 (honest
    -- cold state; the CHECK constraint needs a number).
    SELECT pss.assigned_by AS designer_id,
           avg(CASE WHEN tv.vote = 'confirm' THEN 1.0 ELSE 0.0 END) AS score
      FROM product_style_spectrum pss
      JOIN teaching_validations tv ON tv.product_id = pss.product_id
                                  AND tv.validator_id <> pss.assigned_by
     GROUP BY pss.assigned_by
  ),
  impact AS (
    -- match_events rows citing ≥ 1 product whose spectrum the designer taught.
    SELECT d.designer_id, count(*) AS n
      FROM designers d
      JOIN match_events me ON EXISTS (
        SELECT 1
          FROM jsonb_array_elements(me.results) r
          JOIN product_style_spectrum pss
            ON pss.product_id = (r->>'product_id')::uuid
           AND pss.assigned_by = d.designer_id)
     GROUP BY d.designer_id
  )
  INSERT INTO designer_teaching_stats (designer_id, accuracy_score, match_impact_count)
  SELECT d.designer_id,
         COALESCE(a.score, 0)::real,
         COALESCE(i.n, 0)::int
    FROM designers d
    LEFT JOIN accuracy a ON a.designer_id = d.designer_id
    LEFT JOIN impact i ON i.designer_id = d.designer_id
  ON CONFLICT (designer_id) DO UPDATE
    SET accuracy_score = EXCLUDED.accuracy_score,
        match_impact_count = EXCLUDED.match_impact_count;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $fn$;

COMMENT ON FUNCTION refresh_designer_teaching_stats() IS
  'The §12.2 stats_writer, finally real: accuracy_score = confirm share of other designers'' teaching_validations on products this designer taught; match_impact_count = match_events rows citing ≥ 1 product whose spectrum they taught. Recompute-overwrite (idempotent); other designer_teaching_stats columns are untouched (owned by the teaching surfaces).';

-- ─── 9. apply_starvation_decay — §8.4 idle decay ──────────────────────────────
CREATE OR REPLACE FUNCTION apply_starvation_decay()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_theta_h real[];
  v_p record;
  v_key text;
  v_entry jsonb;
  v_new_map jsonb;
  v_score numeric;
  v_level text;
  v_theta real[];
  v_decayed int := 0;
  i int;
BEGIN
  SELECT h.theta INTO v_theta_h FROM house_taste h WHERE h.status = 'active';

  FOR v_p IN
    SELECT p.*, f.last_fuel_at
      FROM designer_taste_profiles p
      CROSS JOIN LATERAL (
        SELECT greatest(
                 (SELECT max(created_at) FROM taste_judgments  WHERE designer_id = p.designer_id),
                 (SELECT max(created_at) FROM taste_corrections WHERE designer_id = p.designer_id)
               ) AS last_fuel_at) f
     WHERE p.retired_at IS NULL
       AND p.theta IS NOT NULL
       AND f.last_fuel_at IS NOT NULL
       AND f.last_fuel_at < now() - interval '90 days'
       AND (p.sources->>'starvation_decayed_at' IS NULL
            OR (p.sources->>'starvation_decayed_at')::timestamptz < now() - interval '1 month')
  LOOP
    -- c_D(g) ← 0.95·c_D(g) on the style entries (keys starting '_' are
    -- diagnostics, untouched); labels re-derived at the §8.4 thresholds.
    v_new_map := '{}'::jsonb;
    FOR v_key, v_entry IN SELECT * FROM jsonb_each(COALESCE(v_p.confidence_map, '{}'::jsonb)) LOOP
      IF left(v_key, 1) = '_'
         OR v_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         OR jsonb_typeof(v_entry) <> 'object'
         OR v_entry->>'score' IS NULL THEN
        v_new_map := v_new_map || jsonb_build_object(v_key, v_entry);
        CONTINUE;
      END IF;
      v_score := round((v_entry->>'score')::numeric * 0.95, 4);
      v_level := CASE WHEN v_score >= 0.7 THEN 'expert'
                      WHEN v_score >= 0.4 THEN 'advanced'
                      ELSE 'learning' END;
      v_new_map := v_new_map || jsonb_build_object(
        v_key, v_entry || jsonb_build_object('score', v_score, 'label', v_level));
      UPDATE designer_style_confidence
         SET level = v_level
       WHERE designer_id = v_p.designer_id AND style_id = v_key::uuid;
    END LOOP;

    -- Deviation shrink: θ_D ← θ_H + exp(−1/12)·(θ_D − θ_H), one month's worth
    -- per application (the month marker gates re-application). θ_H NULL →
    -- zero vector (shrink toward nothing-learned, same posture as the prior).
    v_theta := v_p.theta;
    FOR i IN 1..array_length(v_theta, 1) LOOP
      v_theta[i] := (COALESCE(v_theta_h[i], 0)
                     + exp(-1.0/12.0) * (v_theta[i] - COALESCE(v_theta_h[i], 0)))::real;
    END LOOP;

    UPDATE designer_taste_profiles
       SET confidence_map = v_new_map,
           theta = v_theta,
           sources = COALESCE(sources, '{}'::jsonb)
                     || jsonb_build_object('starvation_decayed_at', now())
     WHERE designer_id = v_p.designer_id;

    v_decayed := v_decayed + 1;
  END LOOP;

  RETURN jsonb_build_object('decayed', v_decayed);
END $fn$;

COMMENT ON FUNCTION apply_starvation_decay() IS
  'The §8.4 starvation decay (nightly phase 4): after 90 idle days, monthly (gated by sources.starvation_decayed_at) c_D(g) ← 0.95·c_D(g) with labels re-derived, and the deviation θ_D − θ_H shrinks by exp(−1/12). The portfolio centroid never decays — it''s who they are, not what they did lately.';

-- ─── 9b. refresh_style_centroids — safeupdate-compatible re-issue ────────────
-- FOUND during the Wave-4A live dry run: 00242's body opens with a bare
-- `DELETE FROM style_centroids;`, which the pg-safeupdate extension (preloaded
-- on PostgREST/authenticator sessions in local Supabase) rejects with
-- "DELETE requires a WHERE clause" — so the nightly's phase-4 RPC call failed
-- while direct psql runs passed. Body identical to 00242 §23 except the
-- `WHERE true` (and this note). Migrations are append-only; the fix lands here.
CREATE OR REPLACE FUNCTION refresh_style_centroids()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  DELETE FROM style_centroids WHERE true;  -- full refresh; WHERE satisfies safeupdate

  INSERT INTO style_centroids (style_id, centroid, n_products, computed_at)
  SELECT s.id,
         vec_normalize(sum(vec_normalize(p.aesthete_vector))),
         count(*)::int,
         now()
    FROM styles s
    JOIN product_styles ps ON ps.style_id = s.id
                          AND ps.source IN ('manual', 'validated')
    JOIN products p ON p.id = ps.product_id
   WHERE s.is_archetype = TRUE
     AND p.layer = 'catalog'
     AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL
   GROUP BY s.id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION refresh_style_centroids() IS
  'Full recompute of style_centroids (design §4.3/§12.2 nightly phase 4): per-archetype normalized centroid of designer-confirmed (manual/validated), published, catalog-layer aesthete_vectors. Skips archetypes with no vectors. Returns the number of centroids written. (Re-issued in 00248: bare DELETE → DELETE WHERE true for pg-safeupdate sessions.)';

-- ─── 10. Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION _aesthete_primary_archetype(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_taste_refit_designers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_taste_refit_payload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apply_taste_refit(uuid, real[], timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION preview_taste_update(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_designer_reliability_inputs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apply_designer_reliability(uuid, real, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION refresh_designer_teaching_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apply_starvation_decay() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_taste_refit_designers() TO service_role;
GRANT EXECUTE ON FUNCTION get_taste_refit_payload(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apply_taste_refit(uuid, real[], timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION preview_taste_update(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_designer_reliability_inputs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apply_designer_reliability(uuid, real, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_designer_teaching_stats() TO service_role;
GRANT EXECUTE ON FUNCTION apply_starvation_decay() TO service_role;

-- ─── 11. Cron: 02:30 nightly (guarded-unschedule string-body idiom) ──────────
-- Locally the GUCs are unset so invoke_edge_function WARNs and no-ops (00081).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-nightly') THEN
    PERFORM cron.unschedule('aesthete-nightly');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-nightly',
  '30 2 * * *',
  $$
  SELECT public.invoke_edge_function('aesthete-nightly', '{}'::jsonb);
  $$
);
