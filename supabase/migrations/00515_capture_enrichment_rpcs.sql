-- ═══════════════════════════════════════════════════════════════════════════
-- 00515 — capture enrichment RPCs: enqueue, atomic claim, result recording
-- (Phase 3 / C-A1). Depends on 00514 (capture_enrichment_runs / _outbox).
--
-- All three are SECURITY DEFINER, service-role-grant only. Producers
-- (intake commit RPCs, e.g. consume_capture / field-capture commit) call
-- enqueue_capture_enrichment from inside their own transaction. The
-- Cloudflare Queue consumer calls claim_capture_enrichment_run on message
-- receipt, then record_capture_enrichment_result on completion. Cloudflare
-- Queues delivery is at-least-once and unordered, so the DATABASE — not
-- delivery order — is the sole authority on idempotency and current
-- revision (patina-cloudflare-plan.md).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── enqueue_capture_enrichment ─────────────────────────────────────────────
--
-- Inserts the run row + its outbox row in ONE transaction (the outbox
-- pattern — 00514's comment on capture_enrichment_outbox). Idempotent on
-- (target_type, target_id, content_revision) via the unique index from
-- 00514: a re-enqueue of the same revision returns the EXISTING run id and
-- writes no new run or outbox row — never a duplicate. Uses
-- INSERT ... ON CONFLICT DO NOTHING rather than a check-then-insert so two
-- concurrent enqueue calls for the same tuple can't both "win" a race.
CREATE OR REPLACE FUNCTION public.enqueue_capture_enrichment(
  p_target_type      text,
  p_target_id        uuid,
  p_content_revision integer,
  p_content_hash     text DEFAULT NULL,
  p_pipeline_version text DEFAULT NULL,
  p_provenance       jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_run_id   uuid := gen_random_uuid();
  v_trace_id uuid := gen_random_uuid();
  v_inserted_id uuid;
BEGIN
  IF p_target_type NOT IN ('proposal_capture', 'field_capture') THEN
    RAISE EXCEPTION 'enqueue_capture_enrichment: invalid target_type %', p_target_type
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;
  IF p_content_revision < 0 THEN
    RAISE EXCEPTION 'enqueue_capture_enrichment: content_revision must be >= 0, got %', p_content_revision
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.capture_enrichment_runs (
    id, target_type, target_id, content_revision, content_hash,
    pipeline_version, status, provenance
  ) VALUES (
    v_run_id, p_target_type, p_target_id, p_content_revision, p_content_hash,
    p_pipeline_version, 'queued', COALESCE(p_provenance, '{}'::jsonb)
  )
  ON CONFLICT (target_type, target_id, content_revision) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    -- Already enqueued for this exact (target_type, target_id,
    -- content_revision) — idempotent no-op. Return the existing run id;
    -- do NOT touch the outbox (it was already written when that run was
    -- first created).
    SELECT id INTO v_inserted_id
      FROM public.capture_enrichment_runs
     WHERE target_type = p_target_type
       AND target_id = p_target_id
       AND content_revision = p_content_revision;
    RETURN v_inserted_id;
  END IF;

  -- Same transaction as the run insert above — the outbox pattern.
  INSERT INTO public.capture_enrichment_outbox (
    enrichment_run_id, content_revision, trace_id, schema_version
  ) VALUES (
    v_inserted_id, p_content_revision, v_trace_id, 1
  );

  RETURN v_inserted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb) TO service_role;

-- ─── claim_capture_enrichment_run ───────────────────────────────────────────
--
-- The atomic claim. Returns a DISCRIMINATED outcome:
--   'claimed'          — status was 'queued' at the current revision and the
--                         target is still live; status is now 'running'.
--   'ignore_duplicate' — the run already reached a terminal/in-progress
--                         state for this delivery (ready/failed/cancelled,
--                         or already 'running' from a prior claim) — GS-03.
--   'ignore_stale'     — a newer content_revision exists for the same
--                         target, or the caller's declared p_content_revision
--                         does not match this run's own revision — GS-04.
--   'ignore_terminal'  — the run id does not exist, OR the target row is
--                         gone (deleted) or in a state this ledger treats as
--                         final for the purpose of enrichment (dismissed for
--                         either capture ledger; 'consumed' for
--                         proposal_captures; 'saved' for field_captures —
--                         the closest modeled equivalents to "deleted /
--                         dismissed / superseded" available on today's
--                         intake schemas; see migration note below) — GS-05.
--
-- `FOR UPDATE` on the run row serializes concurrent claims for the same run
-- id so two workers can never both observe 'queued' and both transition it.
--
-- Note on "superseded": proposal_captures/field_captures have no explicit
-- supersession column/FK linking an old capture row to a newer one that
-- replaced it (out of this ledger's scope to add — it owns its own tables
-- only). This function approximates "superseded" with each ledger's
-- already-finalized statuses (consumed / saved) since a capture that has
-- already been turned into its final artifact has, in effect, been
-- superseded by that artifact; a true cross-capture supersession FK is a
-- follow-up for whichever intake-ledger migration introduces it.
CREATE OR REPLACE FUNCTION public.claim_capture_enrichment_run(
  p_run_id            uuid,
  p_content_revision  integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_run            public.capture_enrichment_runs%ROWTYPE;
  v_is_stale       boolean;
  v_target_exists  boolean := false;
  v_target_terminal boolean := false;
BEGIN
  SELECT * INTO v_run
    FROM public.capture_enrichment_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'ignore_terminal';
  END IF;

  -- Stale check: is there a run for the SAME target with a strictly higher
  -- content_revision, or does the message's declared revision disagree with
  -- this row's own? Either way this delivery no longer reflects the
  -- current state of the target.
  SELECT EXISTS (
    SELECT 1 FROM public.capture_enrichment_runs r2
     WHERE r2.target_type = v_run.target_type
       AND r2.target_id = v_run.target_id
       AND r2.content_revision > v_run.content_revision
  ) INTO v_is_stale;

  IF v_is_stale OR p_content_revision IS DISTINCT FROM v_run.content_revision THEN
    IF v_run.status = 'queued' THEN
      UPDATE public.capture_enrichment_runs
         SET status = 'cancelled'
       WHERE id = p_run_id;
    END IF;
    RETURN 'ignore_stale';
  END IF;

  -- Duplicate: already resolved (ready/failed/cancelled) or already claimed
  -- and in flight (running). A second delivery of the same message must be
  -- a no-op against ledger state either way.
  IF v_run.status IN ('ready', 'failed', 'cancelled', 'running') THEN
    RETURN 'ignore_duplicate';
  END IF;

  IF v_run.status <> 'queued' THEN
    -- Defensive: any status not explicitly handled above is treated as not
    -- claimable, fail-closed rather than silently claiming it.
    RETURN 'ignore_terminal';
  END IF;

  IF v_run.target_type = 'proposal_capture' THEN
    SELECT true, (status IN ('consumed', 'dismissed'))
      INTO v_target_exists, v_target_terminal
      FROM public.proposal_captures
     WHERE id = v_run.target_id;
  ELSIF v_run.target_type = 'field_capture' THEN
    SELECT true, (status IN ('saved', 'dismissed'))
      INTO v_target_exists, v_target_terminal
      FROM public.field_captures
     WHERE id = v_run.target_id;
  END IF;
  -- (No ELSE: 00514's CHECK constraint already forbids any other
  -- target_type from ever reaching this row.)

  IF NOT COALESCE(v_target_exists, false) OR COALESCE(v_target_terminal, false) THEN
    UPDATE public.capture_enrichment_runs
       SET status = 'cancelled'
     WHERE id = p_run_id;
    RETURN 'ignore_terminal';
  END IF;

  UPDATE public.capture_enrichment_runs
     SET status = 'running',
         attempts = attempts + 1,
         dispatched_at = COALESCE(dispatched_at, now())
   WHERE id = p_run_id;

  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_capture_enrichment_run(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_capture_enrichment_run(uuid, integer) TO service_role;

-- ─── record_capture_enrichment_result ───────────────────────────────────────
--
-- Records the run's terminal outcome (status -> 'ready' | 'failed') plus
-- its suggestions/model_metadata. AI output is always a suggestion.
--
-- Scope of the never-overwrite enforcement: this function NEVER mutates a
-- proposal_captures row's fields (proposal_captures has no descriptive
-- suggestible columns of its own — those live on `products`, out of this
-- ledger's reach — so for target_type='proposal_capture' the suggestions
-- are recorded on the ledger row only, exactly as GS-01 describes: "no
-- designer-entered field is touched").
--
-- For target_type='field_capture', which DOES carry directly-suggestible
-- text columns, this function may fill an ALLOWLISTED column when it is
-- currently NULL/empty (GS-15) but the column-level `WHERE ... IS NULL OR
-- ... = ''` guard on the dynamic UPDATE below is what makes a
-- designer-entered/device-confirmed (i.e. already non-empty) value
-- untouchable — this is the "enforced IN SQL" never-overwrite rule (GS-16).
-- The allowlist is deliberately limited to TEXT columns (category,
-- subcategory, finish, vendor_name, sku) for this migration; the array-
-- typed columns (materials, colors, style_tags, material_tags) are left as
-- ledger-only suggestions (never auto-applied) to avoid conflating "empty
-- array" with "no suggestion yet" — a follow-up can extend the allowlist
-- once that semantic is settled.
CREATE OR REPLACE FUNCTION public.record_capture_enrichment_result(
  p_run_id         uuid,
  p_suggestions    jsonb,
  p_model_metadata jsonb,
  p_status         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_run       public.capture_enrichment_runs%ROWTYPE;
  v_key       text;
  v_allowed   CONSTANT text[] := ARRAY['category', 'subcategory', 'finish', 'vendor_name', 'sku'];
  v_sql       text;
BEGIN
  IF p_status NOT IN ('ready', 'failed') THEN
    RAISE EXCEPTION 'record_capture_enrichment_result: p_status must be ready or failed, got %', p_status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
    FROM public.capture_enrichment_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_capture_enrichment_result: run % not found', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.capture_enrichment_runs
     SET status         = p_status,
         suggestions    = COALESCE(p_suggestions, '{}'::jsonb),
         model_metadata = COALESCE(p_model_metadata, '{}'::jsonb)
   WHERE id = p_run_id;

  IF p_status = 'ready'
     AND v_run.target_type = 'field_capture'
     AND p_suggestions IS NOT NULL
     AND jsonb_typeof(p_suggestions) = 'object'
  THEN
    FOR v_key IN SELECT jsonb_object_keys(p_suggestions)
    LOOP
      IF v_key = ANY (v_allowed) AND jsonb_typeof(p_suggestions -> v_key) = 'string' THEN
        -- %1$I is the allowlisted, validated column name — never raw user
        -- input passed straight to format(). The WHERE guard is the
        -- never-overwrite enforcement point (see anti-vacuity test in
        -- supabase/tests/capture_enrichment/).
        v_sql := format(
          'UPDATE public.field_captures SET %1$I = $1, updated_at = now() ' ||
          'WHERE id = $2 AND (%1$I IS NULL OR %1$I = '''')',
          v_key
        );
        EXECUTE v_sql USING (p_suggestions ->> v_key), v_run.target_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_capture_enrichment_result(uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_capture_enrichment_result(uuid, jsonb, jsonb, text) TO service_role;

-- ─── ACL self-verification ──────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon must not have EXECUTE on enqueue_capture_enrichment';
  END IF;
  IF has_function_privilege('authenticated', 'public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated must not have EXECUTE on enqueue_capture_enrichment';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: service_role must have EXECUTE on enqueue_capture_enrichment';
  END IF;

  IF has_function_privilege('anon', 'public.claim_capture_enrichment_run(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon must not have EXECUTE on claim_capture_enrichment_run';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_capture_enrichment_run(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated must not have EXECUTE on claim_capture_enrichment_run';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_capture_enrichment_run(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: service_role must have EXECUTE on claim_capture_enrichment_run';
  END IF;

  IF has_function_privilege('anon', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon must not have EXECUTE on record_capture_enrichment_result';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated must not have EXECUTE on record_capture_enrichment_result';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: service_role must have EXECUTE on record_capture_enrichment_result';
  END IF;
END $$;

COMMIT;
