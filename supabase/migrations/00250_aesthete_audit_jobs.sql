-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00250: Aesthete audits + jobs janitor + ask-embed cache (Wave 4C)
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md §12.1
-- (degradation ladder), §12.2 (janitor row), §12.3 (ask-embed cache),
-- §12.4 (match_events substrate), §13 (guardrail audits).
--
-- Contents:
--   1. aesthete_jobs.claimed_at + claim_aesthete_jobs stamps it — closes the
--      00241 gap: 'running' had no timestamp, so a worker that died mid-batch
--      left zombies forever (claim looked only at status='pending').
--   2. aesthete_jobs_janitor(): stale 'running' (> 15 min past claim) →
--      attempts+1 + back to 'pending' (parked as terminal 'failed' at the
--      same attempts ≥ 5 bar complete_aesthete_job uses); also purges
--      expired ask_embed_cache rows. Cron every 10 min (pure SQL — no
--      invoke_edge_function dependency, runs locally too).
--   3. ask_embed_cache — UNLOGGED postgres cache for ⌘K ask-text embeddings.
--      DECISION vs §12.3's Redis intent: §12.3 placed this cache in the
--      shared Redis (sha1 key → 768×f16, TTL 7 d, ≤ 10 MB). Evaluated
--      2026-07-02: the edge runtime has no Redis client seam in this repo,
--      local networking edge-runtime→host-Redis needs the LAN-IP workaround
--      (delivery log G2), prod Redis lives in a different compose stack than
--      the Supabase edge runtime (cross-stack docker networking unproven),
--      and eviction under the shared 256 MB cap fails silently. An UNLOGGED
--      table gives the same semantics (no WAL, truncated on crash — cache
--      law), one fewer moving part, and the edge fn already holds a Postgres
--      path. Sanctioned as the alternative in the delivery log (Wave-4
--      resume brief). Rows store sha1(model_version + ask) + the vector
--      literal ONLY — the ask text itself is never persisted (R31/R38).
--   4. run_aesthete_drift_audit(p_now): the §13 weekly checks → aesthete_audit
--      rows keyed (week, check_name), upserted so re-runs are idempotent.
--      Called by the aesthete-drift-audit edge fn (Sun 04:00 cron below),
--      which emits one PostHog guardrail_audit_result event per check.
--   5. match_events(created_at) index — IF NOT EXISTS (00244 already ships
--      idx_match_events_time; kept here per the audit's read path contract).
--
-- Check semantics + thresholds (documented here, asserted in
-- supabase/tests/aesthete/drift_audit_test.sql):
--
--   house_capture     max designer share in the ACTIVE house_taste
--                     computed_from ≤ 0.35 (+1e-6). Trivially PASS when the
--                     active row is pre-consensus (no per-designer weights:
--                     provisional seed / house-hundred collection) or when
--                     it was computed from < 3 designers — the 0.35 cap is
--                     arithmetically infeasible below 3 (00242
--                     compute_house_taste_draft skips it there by design).
--
--   budget_dignity    over the trailing window's match_events (source <>
--                     'engine_ask'), group served products by the profile's
--                     budget tier (client_style_profiles.budget->>'label',
--                     ranked by min_cents; tiers without min_cents — e.g.
--                     "let's discuss" — excluded). For every tier pair with
--                     ≥ 10 served+DNA'd items each: mean(craftsmanship_tier)
--                     of the LOWER tier must be ≥ mean of the higher tier
--                     − 0.15 (CRAFT_DEGRADE_TOLERANCE, on the 0..1
--                     craftsmanship_tier scale). Fewer than 2 qualifying
--                     tiers → trivially PASS (insufficient data).
--
--   exploration_floor aggregate served exploration share ≥ the aggregate
--                     floor: per event, floor_n = LEAST(GREATEST(1,
--                     floor(ratio·n_served)), n_served−1, pool_headroom)
--                     with ratio = context.explore_ratio else 0.2 (00244
--                     default) and pool_headroom = (context.candidates −
--                     n_served) + n_explore — when every hard-filtered
--                     candidate was served there is no non-selected pool to
--                     stretch into, and 00244 legitimately serves fewer
--                     (its floor is "capped at pool size"). Events serving
--                     < 2 rows skipped. PASS iff Σ served_explore ≥
--                     Σ floor_n. No events → PASS.
--
--   why_coverage      every results element of every windowed match event
--                     (source <> 'engine_ask' — ask rows carry matched_on,
--                     not whys, by §10.6 scope) must carry a non-empty
--                     terms object (≥ 1 reason term). PASS iff violations
--                     = 0. engine_ask rows are excluded and counted in
--                     detail for visibility.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. claimed_at — the missing 'running' timestamp (00241 gap) ────────────
ALTER TABLE aesthete_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN aesthete_jobs.claimed_at IS
  'Stamped by claim_aesthete_jobs when the row flips to running. The janitor (aesthete_jobs_janitor, 00250) requeues running rows whose claim is > 15 min old — batches finish inside the 60 s pg_net window by design (§12.2), so 15 min is dead-worker territory with margin.';

-- Same signature/semantics as 00241, plus the claimed_at stamp.
CREATE OR REPLACE FUNCTION claim_aesthete_jobs(p_kind text, p_batch int)
RETURNS SETOF aesthete_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE aesthete_jobs
     SET status = 'running'
       , attempts = attempts + 1
       , claimed_at = now()
   WHERE id IN (
     SELECT id
       FROM aesthete_jobs
      WHERE kind = p_kind
        AND status = 'pending'
        AND run_after <= now()
      ORDER BY run_after, id
      LIMIT GREATEST(p_batch, 0)
        FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
$$;

-- 00241 already revoked/granted this signature; re-assert for safety after
-- the replace (privileges survive CREATE OR REPLACE, but be explicit).
REVOKE ALL ON FUNCTION claim_aesthete_jobs(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_aesthete_jobs(text, int) TO service_role;

-- ─── 2. ask_embed_cache (§12.3 — see the header DECISION note) ──────────────
CREATE UNLOGGED TABLE IF NOT EXISTS ask_embed_cache (
  cache_key text PRIMARY KEY,                  -- sha1(model_version || '\n' || ask) — one-way; NO ask text
  embedding text NOT NULL,                     -- pgvector literal '[…]', passed straight back into aesthete_ask_knn
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

COMMENT ON TABLE ask_embed_cache IS
  'UNLOGGED cache of ⌘K ask-text embeddings (design §12.3; Redis-intent deviation documented in 00250 header). Key = sha1(model_version + ask) — the ask text is NEVER stored (R31/R38). TTL 7 d; purged by aesthete_jobs_janitor. UNLOGGED: no WAL, truncated on crash recovery — correct cache semantics. Service-role only.';

ALTER TABLE ask_embed_cache ENABLE ROW LEVEL SECURITY;
-- No policies: reads/writes come exclusively from the aesthete-ask edge fn's
-- service-role client (bypasses RLS). Belt-and-braces on grants too:
REVOKE ALL ON ask_embed_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON ask_embed_cache TO service_role;

-- ─── 3. aesthete_jobs_janitor — stale-running requeue + cache purge ─────────
CREATE OR REPLACE FUNCTION aesthete_jobs_janitor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requeued int := 0;
  v_parked int := 0;
  v_purged int := 0;
BEGIN
  -- Park zombies that already spent their attempts (the complete_aesthete_job
  -- bar: attempts ≥ 5 is terminal). claimed_at is NULL only for rows claimed
  -- before 00250 — fall back to run_after/created_at (both ≤ claim time).
  WITH parked AS (
    UPDATE aesthete_jobs
       SET status = 'failed'
         , completed_at = now()
         , last_error = 'janitor: stale running job (claim > 15 min old), attempts exhausted'
     WHERE status = 'running'
       AND COALESCE(claimed_at, run_after, created_at) < now() - interval '15 minutes'
       AND attempts >= 5
    RETURNING id
  )
  SELECT count(*) INTO v_parked FROM parked;

  -- Requeue the rest: attempts+1 (a 15-minute hang is a consumed try — the
  -- claim's own increment covered the claim, this one prices the hang) and
  -- back to pending with a 1-minute backoff (mirrors the first-failure rung).
  WITH requeued AS (
    UPDATE aesthete_jobs
       SET status = 'pending'
         , attempts = attempts + 1
         , run_after = now() + interval '1 minute'
         , last_error = 'janitor: requeued stale running job (claim > 15 min old)'
     WHERE status = 'running'
       AND COALESCE(claimed_at, run_after, created_at) < now() - interval '15 minutes'
    RETURNING id
  )
  SELECT count(*) INTO v_requeued FROM requeued;

  DELETE FROM ask_embed_cache WHERE expires_at < now();
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  RETURN jsonb_build_object(
    'requeued', v_requeued, 'parked', v_parked, 'cache_purged', v_purged);
END;
$$;

COMMENT ON FUNCTION aesthete_jobs_janitor() IS
  'Every-10-min janitor (00250, design §12.2): requeues aesthete_jobs stuck in running > 15 min past their claim (attempts+1, 1 min backoff; terminal failed at the 00241 attempts ≥ 5 bar) and purges expired ask_embed_cache rows. Pure SQL — the cron calls it directly, no edge function.';

REVOKE ALL ON FUNCTION aesthete_jobs_janitor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aesthete_jobs_janitor() TO service_role;

-- ─── 4. run_aesthete_drift_audit — the §13 weekly checks ────────────────────
CREATE OR REPLACE FUNCTION run_aesthete_drift_audit(p_now timestamptz DEFAULT now())
RETURNS TABLE (check_name text, passed boolean, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- The RETURNS TABLE out-params (check_name/passed/detail) collide with the
-- aesthete_audit column names inside the final upsert; prefer columns —
-- every out-param read below is table-qualified.
#variable_conflict use_column
DECLARE
  v_week date := date_trunc('week', p_now)::date;
  v_from timestamptz := p_now - interval '7 days';

  -- Documented thresholds (00250 header).
  c_house_cap constant real := 0.35;
  c_craft_tolerance constant real := 0.15;
  c_min_tier_items constant int := 10;
  c_default_explore_ratio constant real := 0.2;   -- 00244 p_explore_ratio default

  v_cf jsonb;
  v_max_share real;
  v_n_designers int;
  v_house_pass boolean;
  v_house_detail jsonb;

  v_budget_pass boolean;
  v_budget_detail jsonb;
  v_tiers jsonb;
  v_worst jsonb;

  v_explore_pass boolean;
  v_explore_detail jsonb;
  v_served bigint; v_explored bigint; v_floor bigint; v_events bigint;

  v_why_pass boolean;
  v_why_detail jsonb;
  v_results bigint; v_violations bigint; v_ask_rows bigint;
BEGIN
  -- ── house_capture ──────────────────────────────────────────────────────
  SELECT h.computed_from INTO v_cf FROM house_taste h WHERE h.status = 'active' LIMIT 1;

  SELECT max((v.value->>'weight')::real), count(*)
    INTO v_max_share, v_n_designers
    FROM jsonb_each(COALESCE(v_cf, '{}'::jsonb)) v
   WHERE jsonb_typeof(v.value) = 'object' AND v.value ? 'weight';

  IF v_cf IS NULL OR COALESCE(v_n_designers, 0) = 0 THEN
    v_house_pass := true;   -- pre-consensus (provisional seed / curated collection)
    v_house_detail := jsonb_build_object(
      'trivial', true, 'reason', 'active house is pre-consensus (no per-designer weights)',
      'computed_from', COALESCE(v_cf, 'null'::jsonb));
  ELSIF v_n_designers < 3 THEN
    v_house_pass := true;   -- cap arithmetically infeasible below 3 (00242 skips it)
    v_house_detail := jsonb_build_object(
      'trivial', true, 'reason', '0.35 cap infeasible below 3 designers (§9.1)',
      'designers', v_n_designers, 'max_share', round(v_max_share::numeric, 4));
  ELSE
    v_house_pass := v_max_share <= c_house_cap + 1e-6;
    v_house_detail := jsonb_build_object(
      'designers', v_n_designers, 'max_share', round(v_max_share::numeric, 4),
      'cap', c_house_cap);
  END IF;

  -- ── budget_dignity ─────────────────────────────────────────────────────
  WITH ev AS (
    SELECT me.id, me.session_key, me.user_id, me.results
      FROM match_events me
     WHERE me.created_at >= v_from AND me.created_at < p_now
       AND me.source <> 'engine_ask'
  ), tiered AS (
    SELECT ev.id, ev.results, prof.label, prof.min_cents
      FROM ev
      JOIN LATERAL (
        SELECT csp.budget->>'label' AS label, (csp.budget->>'min_cents')::bigint AS min_cents
          FROM client_style_profiles csp
         WHERE csp.is_current
           AND ((ev.session_key IS NOT NULL AND csp.session_key = ev.session_key)
             OR (ev.session_key IS NULL AND ev.user_id IS NOT NULL AND csp.user_id = ev.user_id))
         ORDER BY csp.version DESC
         LIMIT 1
      ) prof ON prof.label IS NOT NULL AND prof.min_cents IS NOT NULL
  ), served AS (
    SELECT t.label, t.min_cents, (r->>'product_id')::uuid AS product_id
      FROM tiered t
     CROSS JOIN LATERAL jsonb_array_elements(t.results) r
  ), craft AS (
    SELECT s.label, min(s.min_cents) AS min_cents,
           avg(d.craftsmanship_tier)::real AS mean_craft, count(*) AS n
      FROM served s
      JOIN product_dna d ON d.product_id = s.product_id
     WHERE d.craftsmanship_tier IS NOT NULL
     GROUP BY s.label
    HAVING count(*) >= c_min_tier_items
  ), pairs AS (
    SELECT lo.label AS lower_tier, hi.label AS higher_tier,
           lo.mean_craft AS lower_mean, hi.mean_craft AS higher_mean,
           (lo.mean_craft < hi.mean_craft - c_craft_tolerance) AS degraded
      FROM craft lo JOIN craft hi ON lo.min_cents < hi.min_cents
  )
  SELECT
    (SELECT count(*) FROM craft) < 2 OR NOT EXISTS (SELECT 1 FROM pairs WHERE degraded),
    COALESCE((SELECT jsonb_object_agg(c.label,
                jsonb_build_object('mean_craftsmanship', round(c.mean_craft::numeric, 4), 'n', c.n))
                FROM craft c), '{}'::jsonb),
    (SELECT to_jsonb(p) FROM pairs p WHERE p.degraded
      ORDER BY p.higher_mean - p.lower_mean DESC LIMIT 1)
    INTO v_budget_pass, v_tiers, v_worst;

  v_budget_detail := jsonb_strip_nulls(jsonb_build_object(
    'tiers', v_tiers,
    'tolerance', c_craft_tolerance,
    'min_tier_items', c_min_tier_items,
    'trivial', CASE WHEN v_tiers = '{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(v_tiers)) < 2
                    THEN true ELSE NULL END,
    'worst_degradation', v_worst));

  -- ── exploration_floor ──────────────────────────────────────────────────
  WITH ev AS (
    SELECT me.context, me.results
      FROM match_events me
     WHERE me.created_at >= v_from AND me.created_at < p_now
       AND me.source <> 'engine_ask'
  ), per AS (
    SELECT jsonb_array_length(ev.results) AS n_served,
           (SELECT count(*) FROM jsonb_array_elements(ev.results) r
             WHERE (r->>'is_exploration')::boolean) AS n_explore,
           LEAST(GREATEST(COALESCE((ev.context->>'explore_ratio')::real,
                                   c_default_explore_ratio), 0.0), 0.5) AS ratio,
           (ev.context->>'candidates')::int AS candidates
      FROM ev
     WHERE jsonb_array_length(ev.results) >= 2
  )
  SELECT COALESCE(sum(n_served), 0), COALESCE(sum(n_explore), 0),
         -- floor per event, capped at the non-selected pool headroom the RPC
         -- actually had (00244: the floor is "capped at pool size" — when
         -- every candidate was served, 0 explore slots is compliant).
         COALESCE(sum(LEAST(
           GREATEST(1, floor(ratio * n_served)::int),
           n_served - 1,
           GREATEST(COALESCE(candidates, 2147483647) - n_served, 0) + n_explore)), 0),
         count(*)
    INTO v_served, v_explored, v_floor, v_events
    FROM per;

  v_explore_pass := v_explored >= v_floor;
  v_explore_detail := jsonb_build_object(
    'events', v_events, 'served', v_served, 'explored', v_explored,
    'floor', v_floor,
    'served_share', CASE WHEN v_served > 0 THEN round(v_explored::numeric / v_served, 4) ELSE NULL END,
    'trivial', CASE WHEN v_events = 0 THEN true ELSE NULL END);
  v_explore_detail := jsonb_strip_nulls(v_explore_detail);

  -- ── why_coverage ───────────────────────────────────────────────────────
  SELECT
    COALESCE(sum(jsonb_array_length(me.results)) FILTER (WHERE me.source <> 'engine_ask'), 0),
    COALESCE(sum((SELECT count(*) FROM jsonb_array_elements(me.results) r
                   WHERE NOT (r ? 'terms')
                      OR jsonb_typeof(r->'terms') <> 'object'
                      OR r->'terms' = '{}'::jsonb))
             FILTER (WHERE me.source <> 'engine_ask'), 0),
    count(*) FILTER (WHERE me.source = 'engine_ask')
    INTO v_results, v_violations, v_ask_rows
    FROM match_events me
   WHERE me.created_at >= v_from AND me.created_at < p_now;

  v_why_pass := v_violations = 0;
  v_why_detail := jsonb_build_object(
    'results_checked', v_results, 'violations', v_violations,
    'engine_ask_rows_excluded', v_ask_rows);

  -- ── upsert keyed (week, check_name) + return ───────────────────────────
  RETURN QUERY
  WITH checks(name, ok, det) AS (
    VALUES ('house_capture',     v_house_pass,   v_house_detail),
           ('budget_dignity',    v_budget_pass,  v_budget_detail),
           ('exploration_floor', v_explore_pass, v_explore_detail),
           ('why_coverage',      v_why_pass,     v_why_detail)
  ), up AS (
    INSERT INTO aesthete_audit AS a (week, check_name, passed, detail)
    SELECT v_week, c.name, c.ok,
           c.det || jsonb_build_object('window_from', v_from, 'window_to', p_now)
      FROM checks c
    ON CONFLICT (week, check_name) DO UPDATE
      SET passed = EXCLUDED.passed, detail = EXCLUDED.detail, created_at = now()
    RETURNING a.check_name, a.passed, a.detail
  )
  SELECT up.check_name, up.passed, up.detail FROM up;
END;
$$;

COMMENT ON FUNCTION run_aesthete_drift_audit(timestamptz) IS
  'The §13 weekly guardrail audit (00250): house_capture / budget_dignity / exploration_floor / why_coverage over the trailing 7 days, upserted into aesthete_audit keyed (week, check_name). p_now is injectable for tests. Called by the aesthete-drift-audit edge fn (Sun 04:00), which emits one PostHog guardrail_audit_result event per row. Thresholds documented in the 00250 header.';

REVOKE ALL ON FUNCTION run_aesthete_drift_audit(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION run_aesthete_drift_audit(timestamptz) TO service_role;

-- ─── 5. match_events(created_at) index — the audit's read path ──────────────
-- 00244 ships idx_match_events_time; IF NOT EXISTS keeps this a no-op there
-- and a guarantee everywhere else.
CREATE INDEX IF NOT EXISTS idx_match_events_time ON match_events (created_at);

-- ─── 6. Crons (00081/00092/00189 guarded idiom) ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Janitor: pure SQL every 10 minutes (no GUC/edge dependency — runs locally).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-jobs-janitor') THEN
    PERFORM cron.unschedule('aesthete-jobs-janitor');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-jobs-janitor',
  '*/10 * * * *',
  $$
  SELECT public.aesthete_jobs_janitor();
  $$
);

-- Weekly drift audit: Sunday 04:00 → the edge fn (GUC-guarded invoke;
-- locally the GUCs are unset so invoke_edge_function WARNs and no-ops).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-drift-audit') THEN
    PERFORM cron.unschedule('aesthete-drift-audit');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-drift-audit',
  '0 4 * * 0',
  $$
  SELECT public.invoke_edge_function('aesthete-drift-audit', '{}'::jsonb);
  $$
);

-- Best-effort extension comment (00092/00189 idiom).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Aesthete engine: aesthete-embed (1 min), aesthete-dna-draft (2 min), aesthete-behavior-stats (03:20), aesthete-quiz-janitor (03:45), aesthete-jobs-janitor (10 min, 00250), aesthete-drift-audit (Sun 04:00, 00250). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
