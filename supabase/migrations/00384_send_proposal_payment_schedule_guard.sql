-- ═══════════════════════════════════════════════════════════════════════════
-- 00384 — authoritative proposal payment schedule at send
--
-- 00382 is owned by f8d2d44b (spec_book_row_version_compatibility).
-- Function-body lineage: 00176 → 00384 (whole body reproduced below).
--
-- Draft milestone amounts can be stale relative to an edited proposal total.
-- Sending is the irreversible boundary: lock proposal + children, validate a
-- complete positive 100% schedule, reconcile amount_cents from percentages,
-- assign any rounding delta to the deterministic final row, prove the child
-- sum equals the proposal total, and only then stamp/supersede.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_proposal(
  p_proposal_id uuid,
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

REVOKE ALL ON FUNCTION public.send_proposal(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_proposal(uuid, text, text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.send_proposal(uuid, text, text, timestamptz) IS
  'Send boundary for proposals: locks and validates a positive 100% payment '
  'schedule, reconciles child cents to the proposal total, then stamps sent '
  'and supersedes eligible siblings in the same transaction.';
