-- ═══════════════════════════════════════════════════════════════════════════
-- 00384 — authoritative proposal payment schedule at send
--
-- 00382 is owned by f8d2d44b (spec_book_row_version_compatibility).
-- Function-body lineage: 00176 → 00384 (whole body reproduced below).
--
-- Draft milestone amounts can be stale relative to an edited proposal total.
-- Sending is the irreversible boundary: the browser first reads one opaque,
-- RLS-scoped snapshot; send then locks proposal + children, proves that exact
-- reviewed header/schedule still exists, validates a complete positive 100%
-- schedule, reconciles amount_cents from percentages, assigns any rounding
-- delta to the deterministic final row, proves the child sum equals the
-- proposal total, and only then stamps/supersedes.
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove the legacy callable before creating the token-required revision. A
-- second overload would be an authenticated bypass around optimistic
-- concurrency. The guarded dynamic form keeps direct local re-application
-- safe after the old overload has already been removed.
DO $$
BEGIN
  IF to_regprocedure(
    'public.send_proposal(uuid,text,text,timestamptz)'
  ) IS NOT NULL THEN
    EXECUTE
      'REVOKE ALL ON FUNCTION public.send_proposal(uuid,text,text,timestamptz) '
      'FROM PUBLIC, anon, authenticated';
    EXECUTE
      'DROP FUNCTION public.send_proposal(uuid,text,text,timestamptz)';
  END IF;
END;
$$;

-- Opaque review token. SECURITY INVOKER is deliberate: proposal and milestone
-- RLS determine visibility; a caller who cannot read the proposal receives no
-- snapshot row. `STABLE` promises a read-only result within the statement.
-- JSON arrays define escaping and NULL unambiguously; percentage::text uses
-- the stored NUMERIC(5,2) representation. amount_cents is deliberately absent
-- because send_proposal authoritatively reconciles that derived field.
CREATE OR REPLACE FUNCTION public.get_proposal_send_snapshot(
  p_proposal_id uuid
)
RETURNS TABLE (
  proposal_updated_at timestamptz,
  proposal_total_amount integer,
  schedule_fingerprint text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    proposal.updated_at,
    proposal.total_amount,
    md5(
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_array(
              milestone.id::text,
              milestone.sort_order,
              milestone.label,
              milestone.percentage::text,
              milestone.trigger_condition
            )
            ORDER BY milestone.sort_order, milestone.id
          )::text
          FROM public.proposal_payment_milestones AS milestone
          WHERE milestone.proposal_id = proposal.id
        ),
        '[]'
      )
    )
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id;
$$;

REVOKE ALL ON FUNCTION public.get_proposal_send_snapshot(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_send_snapshot(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_proposal_send_snapshot(uuid) IS
  'RLS-scoped opaque review token for send_proposal: exact proposal updated_at '
  'and total plus md5(JSONB schedule rows [id, sort_order, label, percentage, '
  'trigger_condition] ordered by sort_order/id). Derived amount_cents is '
  'deliberately excluded because send reconciles it.';

CREATE OR REPLACE FUNCTION public.send_proposal(
  p_proposal_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_total_amount integer,
  p_expected_schedule_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_cc_email text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target             public.proposals%ROWTYPE;
  v_root_id            uuid;
  v_milestone          record;
  v_milestone_count    integer;
  v_percent_sum        numeric;
  v_running_cents      bigint := 0;
  v_canonical_cents    bigint;
  v_persisted_cents    bigint;
  v_schedule_fingerprint text;
BEGIN
  -- RLS-filtered and locked: only the owning designer sees/updates the row.
  -- The parent row lock also prevents a concurrent child INSERT from taking
  -- its FK key-share lock while this schedule is being finalized.
  SELECT * INTO v_target
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'send_proposal: proposal % not found or access denied', p_proposal_id;
  END IF;

  IF p_expected_updated_at IS NULL
     OR p_expected_total_amount IS NULL
     OR p_expected_schedule_fingerprint IS NULL
     OR v_target.updated_at IS DISTINCT FROM p_expected_updated_at
     OR v_target.total_amount IS DISTINCT FROM p_expected_total_amount
  THEN
    RAISE EXCEPTION
      'proposal changed after send review; refresh and review again'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(v_target.total_amount, 0) <= 0 THEN
    RAISE EXCEPTION
      'proposal total must be greater than zero before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.proposal_payment_milestones
  WHERE proposal_id = p_proposal_id
  ORDER BY sort_order, id
  FOR UPDATE;

  SELECT md5(
    COALESCE(
      jsonb_agg(
        jsonb_build_array(
          milestone.id::text,
          milestone.sort_order,
          milestone.label,
          milestone.percentage::text,
          milestone.trigger_condition
        )
        ORDER BY milestone.sort_order, milestone.id
      )::text,
      '[]'
    )
  )
  INTO v_schedule_fingerprint
  FROM public.proposal_payment_milestones AS milestone
  WHERE milestone.proposal_id = p_proposal_id;

  IF v_schedule_fingerprint IS DISTINCT FROM p_expected_schedule_fingerprint THEN
    RAISE EXCEPTION
      'proposal changed after send review; refresh and review again'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), COALESCE(sum(percentage), 0)
  INTO v_milestone_count, v_percent_sum
  FROM public.proposal_payment_milestones
  WHERE proposal_id = p_proposal_id;

  IF v_milestone_count = 0 THEN
    RAISE EXCEPTION
      'proposal payment schedule is required before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
      AND btrim(label) = ''
  ) THEN
    RAISE EXCEPTION
      'proposal payment milestone labels cannot be blank'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
      AND percentage <= 0
  ) THEN
    RAISE EXCEPTION
      'proposal payment percentages must all be greater than zero'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_percent_sum <> 100 THEN
    RAISE EXCEPTION
      'proposal payment percentages must total 100'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_milestone IN
    SELECT
      id,
      percentage,
      row_number() OVER (ORDER BY sort_order, id) AS row_number
    FROM public.proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, id
  LOOP
    IF v_milestone.row_number < v_milestone_count THEN
      v_canonical_cents := round(
        v_target.total_amount::numeric * v_milestone.percentage / 100
      )::bigint;
    ELSE
      -- The deterministic final positive row absorbs the rounding delta.
      v_canonical_cents := v_target.total_amount - v_running_cents;
    END IF;

    IF v_canonical_cents <= 0 THEN
      RAISE EXCEPTION
        'proposal payment milestones must each resolve to a positive amount'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.proposal_payment_milestones
    SET amount_cents = v_canonical_cents::integer
    WHERE id = v_milestone.id;

    v_running_cents := v_running_cents + v_canonical_cents;
  END LOOP;

  SELECT COALESCE(sum(amount_cents), 0)
  INTO v_persisted_cents
  FROM public.proposal_payment_milestones
  WHERE proposal_id = p_proposal_id;

  IF v_persisted_cents <> v_target.total_amount THEN
    RAISE EXCEPTION
      'proposal payment amounts must reconcile to proposal total'
      USING ERRCODE = 'check_violation';
  END IF;

  v_root_id := COALESCE(v_target.parent_proposal_id, v_target.id);

  UPDATE public.proposals
  SET status           = 'sent',
      sent_at          = now(),
      personal_message = COALESCE(p_personal_message, personal_message),
      cc_email         = COALESCE(p_cc_email, cc_email),
      valid_until      = COALESCE(p_valid_until, valid_until),
      updated_at       = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_target;

  -- Supersede sibling versions in the same chain so a stale version can no
  -- longer be viewed-as-pending or signed by the client (sign route + RLS
  -- both require status IN ('sent','viewed')). Never touches accepted /
  -- declined / expired / draft — a concurrent client sign that commits first
  -- leaves that row 'accepted' and this clause skips it.
  UPDATE public.proposals
  SET status     = 'revised',
      updated_at = now()
  WHERE (id = v_root_id OR parent_proposal_id = v_root_id)
    AND id <> p_proposal_id
    AND status IN ('sent', 'viewed', 'revised');

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) IS
  'Token-required send boundary: locks the proposal and schedule, rejects any '
  'change from the RLS-scoped reviewed snapshot, validates a positive 100% '
  'schedule, reconciles derived child cents to total, then stamps sent and '
  'supersedes eligible siblings in the same transaction.';

-- Compatibility phase: the previously shipped designer portal always sends
-- all four named arguments below (including explicit NULLs). Keep that exact,
-- non-defaulted signature until portal adoption is confirmed. It cannot skip
-- the new schedule checks: the wrapper obtains an RLS-scoped snapshot and the
-- canonical seven-argument function locks and revalidates it before sending.
CREATE OR REPLACE FUNCTION public.send_proposal(
  p_proposal_id uuid,
  p_personal_message text,
  p_cc_email text,
  p_valid_until timestamptz
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot record;
  v_result public.proposals;
BEGIN
  SELECT * INTO v_snapshot
  FROM public.get_proposal_send_snapshot(p_proposal_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'send_proposal: proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sent.* INTO v_result
  FROM public.send_proposal(
    p_proposal_id,
    v_snapshot.proposal_updated_at,
    v_snapshot.proposal_total_amount,
    v_snapshot.schedule_fingerprint,
    p_personal_message,
    p_cc_email,
    p_valid_until
  ) AS sent;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.send_proposal(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.send_proposal(uuid, text, text, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.send_proposal(uuid, text, text, timestamptz) IS
  'Temporary non-defaulted compatibility wrapper for the previously shipped '
  'designer portal. It derives then revalidates the canonical send snapshot; '
  'remove only after old portal rollback support is retired.';
