-- ═══════════════════════════════════════════════════════════════════════════
-- 00388 — proposal-send dispatch authorization and durable idempotency
--
-- The guarded send_proposal transaction establishes business state. Email is
-- best-effort afterward, but repeated edge-function invocations must not send
-- the same proposal/send instance more than once. This service-only claim row
-- gives each (proposal_id, sent_at) one durable notification id and a leased
-- attempt. Resend receives the same deterministic idempotency key as a second
-- guard around the crash window between provider acceptance and our receipt.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposal_send_dispatches (
  proposal_id         uuid        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  sent_at             timestamptz NOT NULL,
  status              text        NOT NULL DEFAULT 'claimed'
                                  CHECK (status IN ('claimed', 'delivered', 'failed')),
  claim_token         uuid        NOT NULL DEFAULT gen_random_uuid(),
  notification_log_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  attempt_count       integer     NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  claimed_at          timestamptz NOT NULL DEFAULT now(),
  delivered_at        timestamptz,
  provider_id         text,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, sent_at)
);

COMMENT ON TABLE public.proposal_send_dispatches IS
  'Service-only idempotency ledger for proposal-send. One row per committed '
  'proposal sent_at instance; notification_log_id is stable across retries.';

ALTER TABLE public.proposal_send_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proposal_send_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proposal_send_dispatches TO service_role;

-- Deliberately narrower than 00315's general co-membership helper: proposal
-- dispatch is permitted only through an ACTIVE design-studio organization,
-- with both memberships active and neither role guest. Membership in a
-- manufacturer/contractor/admin organization never inherits send authority.
CREATE OR REPLACE FUNCTION public.can_dispatch_proposal_send(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_owner IS NOT NULL AND (
    p_owner = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS me
      JOIN public.organization_members AS owner
        ON owner.organization_id = me.organization_id
      JOIN public.organizations AS organization
        ON organization.id = me.organization_id
      WHERE me.user_id = (SELECT auth.uid())
        AND me.status = 'active'
        AND me.role <> 'guest'
        AND owner.user_id = p_owner
        AND owner.status = 'active'
        AND owner.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_dispatch_proposal_send(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_dispatch_proposal_send(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.can_dispatch_proposal_send(uuid) IS
  'Authenticated proposal-send authorization: exact owner, or a non-guest '
  'active co-member of the owner in an active design_studio organization. '
  'SECURITY DEFINER resolves co-members despite organization_members RLS.';

CREATE OR REPLACE FUNCTION public.claim_proposal_send_dispatch(
  p_proposal_id         uuid,
  p_sent_at             timestamptz,
  p_stale_after_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'claim_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_proposal_id IS NULL OR p_sent_at IS NULL THEN
    RAISE EXCEPTION 'proposal id and sent_at are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  -- Do not mint a dispatch claim for a draft, terminal regression, or stale
  -- send timestamp. The edge handler repeats this check for a clear response;
  -- this is the authority boundary for the service-role write itself.
  PERFORM 1
  FROM public.proposals AS proposal
  WHERE id = p_proposal_id
    AND status = 'sent'
    AND sent_at = p_sent_at
    -- send_proposal stamps both from the same transaction timestamp. Any
    -- later header edit changes updated_at and therefore cannot silently alter
    -- the payload behind an already-issued provider idempotency key.
    AND updated_at = sent_at
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal is not at this sent instance'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.proposal_send_dispatches (proposal_id, sent_at)
  VALUES (p_proposal_id, p_sent_at)
  ON CONFLICT (proposal_id, sent_at) DO NOTHING
  RETURNING * INTO v_dispatch;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'claimed', true,
      'duplicate', false,
      'in_flight', false,
      'claim_token', v_dispatch.claim_token,
      'notification_log_id', v_dispatch.notification_log_id,
      'attempt_count', v_dispatch.attempt_count
    );
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE proposal_id = p_proposal_id
    AND sent_at = p_sent_at
  FOR UPDATE;

  IF v_dispatch.status = 'delivered' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'duplicate', true,
      'in_flight', false,
      'notification_log_id', v_dispatch.notification_log_id,
      'attempt_count', v_dispatch.attempt_count
    );
  END IF;

  IF v_dispatch.status = 'claimed'
     AND v_dispatch.claimed_at > now() - make_interval(
       secs => GREATEST(COALESCE(p_stale_after_seconds, 300), 1)
     )
  THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'duplicate', true,
      'in_flight', true,
      'notification_log_id', v_dispatch.notification_log_id,
      'attempt_count', v_dispatch.attempt_count
    );
  END IF;

  UPDATE public.proposal_send_dispatches
  SET status = 'claimed',
      claim_token = gen_random_uuid(),
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      delivered_at = NULL,
      provider_id = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE proposal_id = p_proposal_id
    AND sent_at = p_sent_at
  RETURNING * INTO v_dispatch;

  RETURN jsonb_build_object(
    'claimed', true,
    'duplicate', true,
    'in_flight', false,
    'claim_token', v_dispatch.claim_token,
    'notification_log_id', v_dispatch.notification_log_id,
    'attempt_count', v_dispatch.attempt_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_proposal_send_dispatch(
  p_proposal_id uuid,
  p_sent_at     timestamptz,
  p_claim_token uuid,
  p_succeeded  boolean,
  p_provider_id text DEFAULT NULL,
  p_error       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'complete_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET status = CASE WHEN p_succeeded THEN 'delivered' ELSE 'failed' END,
      delivered_at = CASE WHEN p_succeeded THEN now() ELSE NULL END,
      provider_id = CASE WHEN p_succeeded THEN p_provider_id ELSE NULL END,
      last_error = CASE WHEN p_succeeded THEN NULL ELSE LEFT(COALESCE(p_error, 'send_failed'), 2000) END,
      updated_at = now()
  WHERE proposal_id = p_proposal_id
    AND sent_at = p_sent_at
    AND claim_token = p_claim_token
    AND status = 'claimed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_proposal_send_dispatch(uuid, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_proposal_send_dispatch(uuid, timestamptz, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_proposal_send_dispatch(uuid, timestamptz, uuid, boolean, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_proposal_send_dispatch(uuid, timestamptz, uuid, boolean, text, text)
  TO service_role;

COMMENT ON FUNCTION public.claim_proposal_send_dispatch(uuid, timestamptz, integer) IS
  'Service-only atomic claim for one committed proposal send instance. Delivered '
  'instances dedupe permanently; failed or stale claims are safely retried.';

COMMENT ON FUNCTION public.complete_proposal_send_dispatch(uuid, timestamptz, uuid, boolean, text, text) IS
  'Completes only the current claim token, preventing stale attempts from '
  'overwriting a newer proposal-send dispatch result.';
