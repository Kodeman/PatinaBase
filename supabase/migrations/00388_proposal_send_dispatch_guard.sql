-- ═════════════════════════════════════════════════════════════════════════
-- 00388 — immutable proposal-send outbox
--
-- 00387 owns the reviewed-copy checks and guarded draft -> sent transition.
-- This migration wraps that exact function so the business transition and one
-- immutable outbound-send nonce are committed together. The edge function can
-- claim only that existing nonce; it never derives a new send from mutable
-- proposal/profile/studio rows.
--
-- Provider request bytes are written once, before the first provider attempt.
-- Every retry replays those bytes with the same Resend idempotency key. A short
-- lease, a 23-hour retry deadline (inside Resend's 24-hour retention), and a
-- three-attempt ceiling bound ambiguous delivery without risking a late resend.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposals
  ADD COLUMN proposal_send_dispatch_id uuid;

CREATE TABLE public.proposal_send_dispatches (
  id                       uuid        PRIMARY KEY,
  proposal_id              uuid        NOT NULL UNIQUE
                                        REFERENCES public.proposals(id)
                                        ON DELETE CASCADE,
  sent_at                  timestamptz NOT NULL,

  -- Complete immutable render/authorization snapshot, captured by the same
  -- transaction that sends the proposal. Nothing rendered by the edge handler
  -- comes from mutable proposal, profile, project, membership, or studio rows.
  designer_id              uuid        NOT NULL,
  client_id                uuid        NOT NULL,
  project_id               uuid,
  proposal_title           text        NOT NULL,
  personal_message         text,
  cc_email                 text,
  valid_until              timestamptz,
  total_amount             integer,
  recipient_email          text        NOT NULL,
  recipient_name           text,
  designer_name            text        NOT NULL,
  sender_name              text        NOT NULL,
  studio_name              text,
  studio_logo_url          text,
  client_portal_path       text        NOT NULL,

  state                    text        NOT NULL DEFAULT 'pending'
                                        CHECK (state IN (
                                          'pending', 'in_flight', 'delivered',
                                          'suppressed', 'failed', 'ambiguous',
                                          'unconfirmed'
                                        )),
  claim_token              uuid,
  lease_expires_at         timestamptz,
  claimed_from_state       text        CHECK (claimed_from_state IN (
                                          'pending', 'failed', 'ambiguous'
                                        )),

  -- Stable identities for all external/logical side effects.
  provider_idempotency_key text        NOT NULL UNIQUE,
  email_log_id             uuid        NOT NULL UNIQUE,
  in_app_log_id            uuid        NOT NULL UNIQUE,

  -- The exact Resend request. These are NULL until the first authorized edge
  -- attempt persists them atomically; persistence is write-once.
  provider_request_body    text,
  provider_from            text,
  provider_to              text[],
  provider_cc              text[],
  provider_subject         text,
  provider_dry_run         boolean,
  request_persisted_at     timestamptz,

  provider_attempt_count   integer     NOT NULL DEFAULT 0
                                        CHECK (
                                          provider_attempt_count BETWEEN 0 AND 3
                                        ),
  provider_started_at      timestamptz,
  retry_deadline           timestamptz,
  delivered_at             timestamptz,
  provider_id              text,
  last_error               text,
  created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at               timestamptz NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT proposal_send_dispatch_instance_unique
    UNIQUE (id, proposal_id, sent_at),
  CONSTRAINT proposal_send_dispatch_proposal_link_unique
    UNIQUE (proposal_id, id),
  CONSTRAINT proposal_send_dispatch_cc_valid CHECK (
    cc_email IS NULL
    OR (
      cc_email = btrim(cc_email)
      AND octet_length(cc_email) <= 254
      AND octet_length(split_part(cc_email, '@', 1)) BETWEEN 1 AND 64
      AND split_part(cc_email, '@', 1) !~ '(^\.|\.\.|\.$)'
      AND cc_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
    )
  ),
  CONSTRAINT proposal_send_dispatch_claim_state_consistent CHECK (
    (state = 'in_flight') = (claimed_from_state IS NOT NULL)
  ),
  CONSTRAINT proposal_send_dispatch_request_all_or_none CHECK (
    (provider_request_body IS NULL
      AND provider_from IS NULL
      AND provider_to IS NULL
      AND provider_subject IS NULL
      AND provider_dry_run IS NULL
      AND request_persisted_at IS NULL)
    OR
    (provider_request_body IS NOT NULL
      AND provider_from IS NOT NULL
      AND provider_to IS NOT NULL
      AND cardinality(provider_to) > 0
      AND provider_subject IS NOT NULL
      AND provider_dry_run IS NOT NULL
      AND request_persisted_at IS NOT NULL)
  )
);

-- The trigger below limits who may write the proposal-side link. This
-- composite FK independently proves that the linked nonce belongs to that
-- exact proposal row, so even a privileged/manual write cannot cross-link two
-- otherwise valid sends. It is deferred to keep proposal deletion semantics
-- well-defined across the reciprocal ON DELETE CASCADE reference above.
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_send_dispatch_exact_fk
  FOREIGN KEY (id, proposal_send_dispatch_id)
  REFERENCES public.proposal_send_dispatches(proposal_id, id)
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE public.proposal_send_dispatches IS
  'Immutable proposal-send outbox. One nonce per committed proposal send; exact '
  'provider bytes are persisted before attempt one and replayed for every retry.';

ALTER TABLE public.proposal_send_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proposal_send_dispatches
  FROM PUBLIC, anon, authenticated, service_role;

-- The proposal-side nonce is itself an authority boundary. It may be linked
-- exactly once by postgres while the wrapper exposes the exact row/nonce GUC.
CREATE OR REPLACE FUNCTION public.guard_proposal_send_dispatch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.proposal_send_dispatch_id IS NOT NULL
       AND (
         current_user IS DISTINCT FROM 'postgres'
         OR current_setting('app.proposal_send_dispatch_link', true)
            IS DISTINCT FROM NEW.id::text || ':' || NEW.proposal_send_dispatch_id::text
       )
    THEN
      RAISE EXCEPTION
        'proposal send dispatch may only be linked by send_proposal'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.proposal_send_dispatch_id IS DISTINCT FROM OLD.proposal_send_dispatch_id
     AND (
       OLD.proposal_send_dispatch_id IS NOT NULL
       OR NEW.proposal_send_dispatch_id IS NULL
       OR current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_send_dispatch_link', true)
          IS DISTINCT FROM NEW.id::text || ':' || NEW.proposal_send_dispatch_id::text
     )
  THEN
    RAISE EXCEPTION
      'proposal send dispatch link is immutable and owned by send_proposal'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_send_dispatch_link()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_proposal_send_dispatch_link_insert_trg
BEFORE INSERT ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.guard_proposal_send_dispatch_link();

CREATE TRIGGER guard_proposal_send_dispatch_link_update_trg
BEFORE UPDATE OF proposal_send_dispatch_id ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.guard_proposal_send_dispatch_link();

-- Preserve 00387's canonical implementation verbatim instead of copying it.
-- Its narrow active-design-studio authorization, row locks, reviewed-copy
-- fingerprint, payment reconciliation, and lifecycle GUC remain authoritative.
ALTER FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) RENAME TO _commit_proposal_send;

REVOKE ALL ON FUNCTION public._commit_proposal_send(
  uuid, timestamptz, integer, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._commit_proposal_send(
  uuid, timestamptz, integer, text, text, text, timestamptz
) IS
  'Private 00387 canonical transition. Called only by the 00388 send_proposal '
  'wrapper so business state and its immutable outbox nonce commit together.';

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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.proposals%ROWTYPE;
  v_dispatch_id uuid := gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_cc_email text := NULLIF(btrim(p_cc_email), '');
BEGIN
  IF v_cc_email IS NOT NULL
     AND (
       octet_length(v_cc_email) > 254
       OR octet_length(split_part(v_cc_email, '@', 1)) NOT BETWEEN 1 AND 64
       OR split_part(v_cc_email, '@', 1) ~ '(^\.|\.\.|\.$)'
       OR v_cc_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
     )
  THEN
    RAISE EXCEPTION 'proposal CC email is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT committed.* INTO v_target
  FROM public._commit_proposal_send(
    p_proposal_id,
    p_expected_updated_at,
    p_expected_total_amount,
    p_expected_schedule_fingerprint,
    p_personal_message,
    v_cc_email,
    p_valid_until
  ) AS committed;

  SELECT profile.email, profile.full_name
  INTO v_client_email, v_client_name
  FROM public.profiles AS profile
  WHERE profile.id = v_target.client_id;

  IF v_client_email IS NULL OR btrim(v_client_email) = '' THEN
    RAISE EXCEPTION 'proposal client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(profile.full_name, profile.display_name)
  INTO v_designer_name
  FROM public.profiles AS profile
  WHERE profile.id = v_target.designer_id;

  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(
    v_target.project_id,
    v_target.designer_id
  ) AS identity;

  v_designer_name := COALESCE(
    NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''),
    'Your designer'
  );
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id,
    proposal_id,
    sent_at,
    designer_id,
    client_id,
    project_id,
    proposal_title,
    personal_message,
    cc_email,
    valid_until,
    total_amount,
    recipient_email,
    recipient_name,
    designer_name,
    sender_name,
    studio_name,
    studio_logo_url,
    client_portal_path,
    provider_idempotency_key,
    email_log_id,
    in_app_log_id
  ) VALUES (
    v_dispatch_id,
    v_target.id,
    v_target.sent_at,
    v_target.designer_id,
    v_target.client_id,
    v_target.project_id,
    v_target.title,
    v_target.personal_message,
    v_cc_email,
    v_target.valid_until,
    v_target.total_amount,
    v_client_email,
    v_client_name,
    v_designer_name,
    v_sender_name,
    v_studio_name,
    v_studio_logo,
    '/proposals/' || v_target.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5(
      'eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text
    ),
    extensions.uuid_generate_v5(
      'eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text
    )
  );

  PERFORM set_config(
    'app.proposal_send_dispatch_link',
    v_target.id::text || ':' || v_dispatch_id::text,
    true
  );
  UPDATE public.proposals
  SET proposal_send_dispatch_id = v_dispatch_id,
      cc_email = v_cc_email
  WHERE id = v_target.id
    AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_target;
  PERFORM set_config('app.proposal_send_dispatch_link', '', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;

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
  '00387 canonical guarded send plus exactly one transactionally linked, '
  'immutable 00388 email outbox nonce returned as proposal_send_dispatch_id.';

-- Deliberately narrower than general organization co-membership. The edge
-- reauthorizes an immutable outbox owner through an active design studio only.
CREATE OR REPLACE FUNCTION public.can_dispatch_proposal_send(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner IS NOT NULL AND public._can_author_proposal(p_owner);
$$;

REVOKE ALL ON FUNCTION public.can_dispatch_proposal_send(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_dispatch_proposal_send(uuid)
  TO authenticated;

-- Private reconciliation primitive used by both service delivery work and the
-- narrow authenticated status observer below. Keeping the state-to-enum cast
-- dynamic lets 00388 define the body before isolated enum migration 00391
-- commits; no migration in between invokes this function.
CREATE OR REPLACE FUNCTION public._sync_proposal_send_email_log(
  p_dispatch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_log_status public.notification_status;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_log_status := CASE v_dispatch.state
    WHEN 'delivered' THEN 'delivered'::public.notification_status
    WHEN 'suppressed' THEN 'suppressed'::public.notification_status
    WHEN 'failed' THEN 'failed'::public.notification_status
    WHEN 'unconfirmed' THEN v_dispatch.state::public.notification_status
    ELSE 'sending'::public.notification_status
  END;

  INSERT INTO public.notification_log AS existing (
    id, user_id, type, channel, status, provider_id, template_id,
    metadata, error, retry_count, sent_at
  ) VALUES (
    v_dispatch.email_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'email',
    v_log_status,
    v_dispatch.provider_id,
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'delivery_state', v_dispatch.state,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path
    ),
    v_dispatch.last_error,
    GREATEST(v_dispatch.provider_attempt_count - 1, 0),
    v_dispatch.delivered_at
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    provider_id = EXCLUDED.provider_id,
    metadata = EXCLUDED.metadata,
    error = EXCLUDED.error,
    retry_count = EXCLUDED.retry_count,
    sent_at = EXCLUDED.sent_at;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_proposal_send_email_log(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.read_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_proposal_id uuid,
  p_sent_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'read_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND proposal_id = p_proposal_id
    AND sent_at = p_sent_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send nonce/timestamp mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'id', v_dispatch.id,
    'proposal_id', v_dispatch.proposal_id,
    'sent_at', v_dispatch.sent_at,
    'designer_id', v_dispatch.designer_id,
    'client_id', v_dispatch.client_id,
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count
  );
END;
$$;

-- Atomic exact-instance claim. This RPC never inserts. A caller with a stale
-- timestamp or a nonce from another proposal gets a hard mismatch, not a new
-- logical send.
CREATE OR REPLACE FUNCTION public.claim_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_proposal_id uuid,
  p_sent_at timestamptz,
  p_lease_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_lease_seconds integer := LEAST(
    60,
    GREATEST(15, COALESCE(p_lease_seconds, 30))
  );
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'claim_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_dispatch_id IS NULL OR p_proposal_id IS NULL OR p_sent_at IS NULL THEN
    RAISE EXCEPTION 'dispatch id, proposal id, and sent_at are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND proposal_id = p_proposal_id
    AND sent_at = p_sent_at
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send nonce/timestamp mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_dispatch.state = 'in_flight'
     AND v_dispatch.lease_expires_at > v_now
  THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', 'in_flight',
      'attempt_count', v_dispatch.provider_attempt_count
    );
  END IF;

  IF v_dispatch.state = 'in_flight' THEN
    -- A stale lease after provider upload began is ambiguous. A stale lease
    -- before provider start restores the semantic state that was claimed.
    UPDATE public.proposal_send_dispatches
    SET state = CASE
          WHEN provider_started_at IS NULL
            THEN COALESCE(claimed_from_state, 'pending')
          ELSE 'ambiguous'
        END,
        claim_token = NULL,
        lease_expires_at = NULL,
        claimed_from_state = NULL,
        updated_at = v_now,
        last_error = CASE
          WHEN provider_started_at IS NULL THEN last_error
          ELSE COALESCE(last_error, 'provider attempt lease expired')
        END
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
  END IF;

  -- An ambiguity outside the bounded retry window is terminal, but it is not
  -- a definitive provider failure. Persist that distinction before returning.
  IF v_dispatch.state = 'ambiguous'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    UPDATE public.proposal_send_dispatches
    SET state = 'unconfirmed',
        claim_token = NULL,
        lease_expires_at = NULL,
        claimed_from_state = NULL,
        last_error = COALESCE(
          last_error,
          'provider delivery could not be confirmed before retry exhaustion'
        ),
        updated_at = v_now
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;

    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);

    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', v_dispatch.state,
      'attempt_count', v_dispatch.provider_attempt_count,
      'retry_exhausted', true,
      'last_error', v_dispatch.last_error
    );
  END IF;

  IF v_dispatch.state IN ('delivered', 'suppressed', 'unconfirmed') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', v_dispatch.state,
      'attempt_count', v_dispatch.provider_attempt_count,
      'retry_exhausted', v_dispatch.state = 'unconfirmed',
      'provider_id', v_dispatch.provider_id
    );
  END IF;

  IF v_dispatch.state = 'failed'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', v_dispatch.state,
      'attempt_count', v_dispatch.provider_attempt_count,
      'retry_exhausted', true,
      'last_error', v_dispatch.last_error
    );
  END IF;

  UPDATE public.proposal_send_dispatches
  SET state = 'in_flight',
      claim_token = gen_random_uuid(),
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      claimed_from_state = v_dispatch.state,
      provider_started_at = NULL,
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  RETURN jsonb_build_object(
    'claimed', true,
    'delivery_state', 'in_flight',
    'claim_token', v_dispatch.claim_token,
    'attempt_count', v_dispatch.provider_attempt_count,
    'previous_delivery_state', v_dispatch.claimed_from_state,
    'retry_deadline', v_dispatch.retry_deadline,
    'provider_idempotency_key', v_dispatch.provider_idempotency_key,
    'provider_request_body', v_dispatch.provider_request_body,
    'provider_from', v_dispatch.provider_from,
    'provider_to', v_dispatch.provider_to,
    'provider_cc', v_dispatch.provider_cc,
    'provider_subject', v_dispatch.provider_subject,
    'provider_dry_run', v_dispatch.provider_dry_run,
    'dispatch', jsonb_build_object(
      'id', v_dispatch.id,
      'proposal_id', v_dispatch.proposal_id,
      'sent_at', v_dispatch.sent_at,
      'designer_id', v_dispatch.designer_id,
      'client_id', v_dispatch.client_id,
      'project_id', v_dispatch.project_id,
      'proposal_title', v_dispatch.proposal_title,
      'personal_message', v_dispatch.personal_message,
      'cc_email', v_dispatch.cc_email,
      'valid_until', v_dispatch.valid_until,
      'total_amount', v_dispatch.total_amount,
      'recipient_email', v_dispatch.recipient_email,
      'recipient_name', v_dispatch.recipient_name,
      'designer_name', v_dispatch.designer_name,
      'sender_name', v_dispatch.sender_name,
      'studio_name', v_dispatch.studio_name,
      'studio_logo_url', v_dispatch.studio_logo_url,
      'client_portal_path', v_dispatch.client_portal_path
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_proposal_send_request(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_request_body text,
  p_from text,
  p_to text[],
  p_cc text[],
  p_subject text,
  p_dry_run boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'persist_proposal_send_request requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_request_body IS NULL OR p_request_body = ''
     OR p_from IS NULL OR btrim(p_from) = ''
     OR p_to IS NULL OR cardinality(p_to) = 0
     OR p_subject IS NULL OR btrim(p_subject) = ''
     OR p_dry_run IS NULL
  THEN
    RAISE EXCEPTION 'complete provider request fields are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND lease_expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_dispatch.provider_request_body IS NULL THEN
    UPDATE public.proposal_send_dispatches
    SET provider_request_body = p_request_body,
        provider_from = p_from,
        provider_to = p_to,
        provider_cc = p_cc,
        provider_subject = p_subject,
        provider_dry_run = p_dry_run,
        request_persisted_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
  ELSIF v_dispatch.provider_request_body IS DISTINCT FROM p_request_body
     OR v_dispatch.provider_from IS DISTINCT FROM p_from
     OR v_dispatch.provider_to IS DISTINCT FROM p_to
     OR v_dispatch.provider_cc IS DISTINCT FROM p_cc
     OR v_dispatch.provider_subject IS DISTINCT FROM p_subject
     OR v_dispatch.provider_dry_run IS DISTINCT FROM p_dry_run
  THEN
    RAISE EXCEPTION 'persisted proposal provider request is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'body', v_dispatch.provider_request_body,
    'from', v_dispatch.provider_from,
    'to', v_dispatch.provider_to,
    'cc', v_dispatch.provider_cc,
    'subject', v_dispatch.provider_subject,
    'dry_run', v_dispatch.provider_dry_run,
    'idempotency_key', v_dispatch.provider_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_proposal_send_provider_attempt(
  p_dispatch_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'begin_proposal_send_provider_attempt requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND lease_expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_dispatch.provider_request_body IS NULL THEN
    RAISE EXCEPTION 'provider request must be persisted before provider start'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_dispatch.provider_attempt_count >= 3
     OR (
       v_dispatch.retry_deadline IS NOT NULL
       AND v_dispatch.retry_deadline <= v_now
     )
  THEN
    RAISE EXCEPTION 'proposal send retry window is exhausted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET provider_attempt_count = provider_attempt_count + 1,
      provider_started_at = v_now,
      retry_deadline = COALESCE(retry_deadline, v_now + interval '23 hours'),
      last_error = NULL,
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  RETURN jsonb_build_object(
    'attempt_count', v_dispatch.provider_attempt_count,
    'retry_deadline', v_dispatch.retry_deadline
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_delivery_state text,
  p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_final_state text;
  v_retry_exhausted boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'complete_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_delivery_state NOT IN (
    'delivered', 'failed', 'ambiguous', 'unconfirmed'
  ) THEN
    RAISE EXCEPTION 'invalid provider completion state %', p_delivery_state
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_delivery_state = 'unconfirmed'
     AND (
       v_dispatch.claimed_from_state IS DISTINCT FROM 'ambiguous'
       OR v_dispatch.provider_started_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION
      'unconfirmed is only valid for a suppressed replay of prior ambiguity'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_delivery_state IN ('delivered', 'failed', 'ambiguous')
     AND v_dispatch.provider_started_at IS NULL
  THEN
    RAISE EXCEPTION 'provider completion requires a started provider attempt'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  v_final_state := CASE
    WHEN p_delivery_state = 'ambiguous'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
      THEN 'unconfirmed'
    ELSE p_delivery_state
  END;

  UPDATE public.proposal_send_dispatches
  SET state = v_final_state,
      claim_token = NULL,
      lease_expires_at = NULL,
      claimed_from_state = NULL,
      delivered_at = CASE
        WHEN v_final_state = 'delivered' THEN v_now
        ELSE NULL
      END,
      provider_id = CASE
        WHEN v_final_state = 'delivered' THEN p_provider_id
        ELSE provider_id
      END,
      last_error = CASE
        WHEN v_final_state = 'delivered' THEN NULL
        ELSE left(COALESCE(p_error, v_final_state), 2000)
      END,
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  v_retry_exhausted := v_dispatch.state = 'unconfirmed'
    OR (
      v_dispatch.state = 'failed'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
    );

  IF v_dispatch.state = 'unconfirmed' THEN
    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'retry_deadline', v_dispatch.retry_deadline,
    'retry_exhausted', v_retry_exhausted,
    'provider_id', v_dispatch.provider_id,
    'last_error', v_dispatch.last_error
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.suppress_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'suppress_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET state = 'suppressed',
      claim_token = NULL,
      lease_expires_at = NULL,
      claimed_from_state = NULL,
      last_error = left(COALESCE(p_reason, 'suppressed'), 2000),
      updated_at = clock_timestamp()
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND claimed_from_state IN ('pending', 'failed')
    AND provider_started_at IS NULL
  RETURNING * INTO v_dispatch;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'only a pending or definitively failed pre-provider claim may suppress'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'last_error', v_dispatch.last_error
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_restore_state text;
  v_retry_exhausted boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'release_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND provider_started_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'only a current pre-provider claim may be released'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  v_restore_state := v_dispatch.claimed_from_state;
  IF v_restore_state = 'ambiguous'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    v_restore_state := 'unconfirmed';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET state = v_restore_state,
      claim_token = NULL,
      lease_expires_at = NULL,
      claimed_from_state = NULL,
      provider_started_at = NULL,
      last_error = left(COALESCE(p_error, 'pre-provider failure'), 2000),
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  v_retry_exhausted := v_dispatch.state = 'unconfirmed'
    OR (
      v_dispatch.state = 'failed'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
    );

  IF v_dispatch.state = 'unconfirmed' THEN
    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'retry_exhausted', v_retry_exhausted,
    'last_error', v_dispatch.last_error
  );
END;
$$;

-- Log reconciliation is deliberately split by channel. Either side effect may
-- fail independently without changing provider state; stable UUIDs guarantee
-- exactly one logical row when a later invocation repairs it.
CREATE OR REPLACE FUNCTION public.sync_proposal_send_email_log(p_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sync_proposal_send_email_log requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public._sync_proposal_send_email_log(p_dispatch_id);
END;
$$;

-- Authenticated polling exposes only delivery semantics for the exact
-- proposal/dispatch/sent_at capability tuple. Authorization is deliberately
-- the same narrow owner-or-active-design-studio-peer rule as authoring.
CREATE OR REPLACE FUNCTION public.get_proposal_send_dispatch_status(
  p_proposal_id uuid,
  p_dispatch_id uuid,
  p_sent_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_retry_exhausted boolean;
  v_retryable boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'proposal send status not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE proposal_id = p_proposal_id
    AND id = p_dispatch_id
    AND sent_at = p_sent_at
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_dispatch.designer_id) THEN
    RAISE EXCEPTION 'proposal send status not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A reopened sheet is also a recovery observer. Never surface a dead lease
  -- as permanently in-flight: pre-provider work restores the claimed semantic
  -- state, while a started provider upload becomes ambiguous.
  IF v_dispatch.state = 'in_flight'
     AND (
       v_dispatch.lease_expires_at IS NULL
       OR v_dispatch.lease_expires_at <= v_now
     )
  THEN
    UPDATE public.proposal_send_dispatches
    SET state = CASE
          WHEN provider_started_at IS NULL
            THEN COALESCE(claimed_from_state, 'pending')
          ELSE 'ambiguous'
        END,
        claim_token = NULL,
        lease_expires_at = NULL,
        claimed_from_state = NULL,
        last_error = CASE
          WHEN provider_started_at IS NULL THEN last_error
          ELSE COALESCE(last_error, 'provider attempt lease expired')
        END,
        updated_at = v_now
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
  END IF;

  IF v_dispatch.state = 'ambiguous'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    UPDATE public.proposal_send_dispatches
    SET state = 'unconfirmed',
        claim_token = NULL,
        lease_expires_at = NULL,
        claimed_from_state = NULL,
        last_error = COALESCE(
          last_error,
          'provider delivery could not be confirmed before retry exhaustion'
        ),
        updated_at = v_now
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;

  END IF;

  v_retry_exhausted := v_dispatch.state = 'unconfirmed'
    OR (
      v_dispatch.state = 'failed'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
    );
  v_retryable := v_dispatch.state IN ('pending', 'in_flight')
    OR (
      v_dispatch.state IN ('failed', 'ambiguous')
      AND NOT v_retry_exhausted
    );

  -- Any terminal state observed here is reconciled in the same transaction;
  -- an expired ambiguity can therefore never remain logged as sending.
  IF v_dispatch.state IN ('delivered', 'suppressed', 'unconfirmed')
     OR (v_dispatch.state = 'failed' AND v_retry_exhausted)
  THEN
    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'retryable', v_retryable,
    'retry_exhausted', v_retry_exhausted,
    'last_error', v_dispatch.last_error
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_proposal_send_in_app_log(p_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sync_proposal_send_in_app_log requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.notification_log (
    id, user_id, type, channel, status, template_id, metadata, sent_at
  ) VALUES (
    v_dispatch.in_app_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'in_app',
    'delivered',
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path
    ),
    v_dispatch.sent_at
  )
  ON CONFLICT (id) DO UPDATE SET
    metadata = EXCLUDED.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_proposal_send_dispatch(
  uuid, uuid, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_proposal_send_dispatch(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_proposal_send_request(
  uuid, uuid, text, text, text[], text[], text, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_proposal_send_provider_attempt(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_proposal_send_dispatch(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suppress_proposal_send_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_proposal_send_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_proposal_send_email_log(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_proposal_send_dispatch_status(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.sync_proposal_send_in_app_log(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_proposal_send_dispatch(
  uuid, uuid, timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_proposal_send_dispatch(
  uuid, uuid, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_proposal_send_request(
  uuid, uuid, text, text, text[], text[], text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_proposal_send_provider_attempt(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_proposal_send_dispatch(
  uuid, uuid, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.suppress_proposal_send_dispatch(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_proposal_send_dispatch(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_proposal_send_email_log(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_proposal_send_dispatch_status(
  uuid, uuid, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_proposal_send_in_app_log(uuid)
  TO service_role;

COMMENT ON FUNCTION public.claim_proposal_send_dispatch(
  uuid, uuid, timestamptz, integer
) IS
  'Service-only claim of one pre-existing exact nonce/proposal/timestamp tuple. '
  'Never inserts; stale/mismatched tuples fail closed.';

COMMENT ON FUNCTION public.persist_proposal_send_request(
  uuid, uuid, text, text, text[], text[], text, boolean
) IS
  'Persists the exact serialized provider request once under the current lease; '
  'later calls may only prove byte/field equality.';

COMMENT ON FUNCTION public.begin_proposal_send_provider_attempt(uuid, uuid) IS
  'Marks one of at most three provider attempts and starts a 23-hour retry '
  'deadline on attempt one.';

COMMENT ON FUNCTION public.get_proposal_send_dispatch_status(
  uuid, uuid, timestamptz
) IS
  'Authenticated exact-tuple delivery status for the proposal owner or an '
  'active non-guest peer in the same active design studio. Returns only '
  'delivery state, attempt count, retryability, exhaustion, and last error; '
  'expired ambiguity is atomically terminalized as unconfirmed.';
