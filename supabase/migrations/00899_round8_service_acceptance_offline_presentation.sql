-- ═══════════════════════════════════════════════════════════════════════════
-- 00899 — Round 8 C4 service acceptance: offline presentation, so a
-- paper-only request can reach paper intake (US-52 release review, fix lane
-- F-A defect 4, MEDIUM). Ships INACTIVE.
--
-- A request becomes 'sent' only when a signer's V22 notice is delivered
-- (_service_acceptance_after_send). A required signer with no linked email
-- gets a notice held "no address on file" (00891). So when every required
-- signer is paper-only, nothing can be delivered, the request stays 'draft',
-- and record_service_acceptance_paper_intake (which needs 'sent') can never
-- run. K5 allows paper acceptance; there was no way to reach it.
--
-- New: present_service_acceptance_offline(request, scope hash, evidence hash,
-- client_request_id). A studio owner/admin of an active recorded studio
-- (_is_service_acceptance_studio_admin, 00897) records that they presented a
-- draft request offline. It:
--   * is deny-by-default like every C4 mutation: revoked from every API role,
--     refuses while scope_editions is off, and joins the C4 §2.8 activation
--     plan (authenticated) with its exact inverse;
--   * takes the §2.3 locks (project FOR UPDATE, edition, request, signers);
--   * replays its receipt for the same caller and payload before any
--     lifecycle check (R15), always with lifecycle 'sent' (the effect it
--     recorded, not the request's current lifecycle); another caller or
--     payload under the key is idempotency_key_reused;
--   * needs lifecycle 'draft' (request_not_open), and both presented hashes
--     equal to the request's with its edition still active (stale_scope);
--   * moves the request draft -> sent with sent_at = offline_presented_at =
--     now, and records offline_presented_by, the key and the request hash;
--   * freezes the evidence exactly as a delivered send does
--     (_freeze_service_acceptance_evidence), so paper intake and the client
--     reader bind the same snapshot.
-- It never fabricates a delivery or an answer (K5): no outbound_drafts row is
-- written, claimed or marked, and no response is created. The request's V22
-- notices stay as they are: a held one can still be sent once an address
-- exists, and its after-send finds the request already sent and does nothing.
-- Answers still come only from an authenticated response or a reviewed paper
-- intake.
--
-- The four offline columns are all set or all NULL, offline_presented_at
-- equals sent_at when set, and the request guard lets them change only on the
-- draft -> sent transition (so never after).
--
-- Redefinitions, each copied verbatim from its latest CREATE OR REPLACE with
-- only the marked 00899 delta:
--   _guard_service_acceptance_request   00886 -> 00899 (offline columns)
--   _service_acceptance_after_send      00886 -> 00889 -> 00891 -> 00899 (its
--     evidence freeze moved, unchanged, into _freeze_service_acceptance_evidence)
--   _service_acceptance_request_json    00886 -> 00899 (studio view adds
--     offlinePresentedAt / offlinePresentedBy)
-- New: _freeze_service_acceptance_evidence(uuid),
-- present_service_acceptance_offline(uuid,text,text,text). Both are revoked
-- from every API role, so seed/00-legacy-grants.sql is regenerated. No
-- backfill.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.service_acceptance_requests
  ADD COLUMN IF NOT EXISTS offline_presented_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS offline_presented_at timestamptz,
  ADD COLUMN IF NOT EXISTS offline_present_client_request_id text,
  ADD COLUMN IF NOT EXISTS offline_present_request_hash text;
ALTER TABLE public.service_acceptance_requests DROP CONSTRAINT IF EXISTS service_acceptance_requests_offline_ck;
ALTER TABLE public.service_acceptance_requests ADD CONSTRAINT service_acceptance_requests_offline_ck CHECK (
  (offline_presented_at IS NULL) = (offline_presented_by IS NULL)
  AND (offline_presented_at IS NULL) = (offline_present_client_request_id IS NULL)
  AND (offline_presented_at IS NULL) = (offline_present_request_hash IS NULL)
  AND (offline_presented_at IS NULL OR offline_presented_at IS NOT DISTINCT FROM sent_at));

CREATE OR REPLACE FUNCTION public._guard_service_acceptance_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  mutable text[] := ARRAY['lifecycle','aggregate_outcome','closed_reason','closed_at','signer_policy_revision',
    'sent_at','superseded_reason','superseded_at','withdrawn_by','withdrawn_at','withdraw_reason',
    'withdraw_client_request_id','withdraw_request_hash',
    -- 00899 delta (F-A defect 4): the offline presentation, written once with draft -> sent.
    'offline_presented_by','offline_presented_at','offline_present_client_request_id','offline_present_request_hash'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service_acceptance_record_immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user <> 'postgres' OR current_setting('app.service_acceptance_request_id', true)
     IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE OLD.id END)::text THEN
    RAISE EXCEPTION 'service_acceptance_write_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle <> 'draft' OR NEW.aggregate_outcome <> 'pending' OR NEW.signer_policy_revision <> 1 THEN
      RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable)
     OR OLD.lifecycle IN ('withdrawn','superseded','closed')
     OR (OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at)
     OR NEW.signer_policy_revision NOT IN (OLD.signer_policy_revision, OLD.signer_policy_revision + 1)
     OR (NEW.lifecycle <> OLD.lifecycle AND (OLD.lifecycle, NEW.lifecycle) NOT IN (
       ('draft','sent'),('draft','withdrawn'),('sent','withdrawn'),('draft','superseded'),
       ('sent','superseded'),('sent','closed')))
     -- 00899 delta (F-A defect 4): the offline columns move only on draft -> sent.
     OR ((NEW.offline_presented_by, NEW.offline_presented_at, NEW.offline_present_client_request_id,
          NEW.offline_present_request_hash) IS DISTINCT FROM (OLD.offline_presented_by, OLD.offline_presented_at,
          OLD.offline_present_client_request_id, OLD.offline_present_request_hash)
        AND NOT (OLD.lifecycle = 'draft' AND NEW.lifecycle = 'sent')) THEN
    RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.aggregate_outcome <> OLD.aggregate_outcome
     AND current_setting('app.service_acceptance_outcome_id', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'service_acceptance_outcome_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._freeze_service_acceptance_evidence(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_unresolved integer; v_missing integer;
BEGIN
  -- 00889 delta (SQ-2283): resolve each member once and freeze it as it
  -- stands at send. A member with no projection gets no row (the reader
  -- then refuses the request).
  INSERT INTO public.service_acceptance_evidence_snapshots(request_id, ordinal, member_kind, member_id, title,
    issued_at, content)
  SELECT r.id, x.ord, x.member->>'kind', (x.member->>'id')::uuid, t.title, t.issued_at, t.content
  FROM public.service_acceptance_requests r
  JOIN public.evidence_manifests m ON m.id = r.evidence_manifest_id
  CROSS JOIN LATERAL jsonb_array_elements(m.members) WITH ORDINALITY x(member, ord)
  CROSS JOIN LATERAL public._service_acceptance_client_member(x.member->>'kind', (x.member->>'id')::uuid) t
  WHERE r.id = p_request_id;
  -- Pin every served object under FOR SHARE: an in-flight writer commits
  -- first (the pin takes its committed row) and a later one waits for this
  -- transaction, then meets the freeze trigger. A required file that does not
  -- resolve (SQ-2287 F1), or a served object that is missing (or renamed
  -- away) by then, refuses the send.
  WITH document AS (
    SELECT d.* FROM public.service_acceptance_requests r
    CROSS JOIN LATERAL public._service_acceptance_evidence_documents(r.evidence_manifest_id) d
    WHERE r.id = p_request_id
  ), served AS (
    SELECT s.ordinal, document.path, min(document.title) AS title
    FROM public.service_acceptance_evidence_snapshots s
    JOIN document ON document.member_kind = s.member_kind AND document.member_id = s.member_id
    WHERE s.request_id = p_request_id AND document.path IS NOT NULL
    GROUP BY s.ordinal, document.path
  ), live AS (
    SELECT o.id, o.name, o.version FROM storage.objects o
    WHERE o.bucket_id = 'project-documents' AND o.name IN (SELECT served.path FROM served)
    ORDER BY o.name
    FOR SHARE OF o
  ), pinned AS (
    INSERT INTO public.service_acceptance_evidence_snapshot_objects(request_id, ordinal, bucket_id, object_name,
      object_id, object_version, title)
    SELECT p_request_id, served.ordinal, 'project-documents', served.path, live.id, live.version, served.title
    FROM served JOIN live ON live.name = served.path
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM document WHERE document.path IS NULL),
    (SELECT count(*) FROM served WHERE NOT EXISTS (SELECT 1 FROM live WHERE live.name = served.path))
  INTO v_unresolved, v_missing;
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'service_acceptance_evidence_file_unresolved' USING ERRCODE = 'check_violation';
  END IF;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'service_acceptance_evidence_object_missing' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_after_send()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  -- 00891 delta (SQ-2328): any signer's draft of this request (the trigger's
  -- WHEN fixes kind and ref_type) in the request's project marks it sent once;
  -- a later sibling finds the request no longer in draft and does nothing.
  PERFORM 1 FROM public.service_acceptance_requests
  WHERE id = NEW.ref_id AND project_id = NEW.project_id AND lifecycle = 'draft' AND sent_at IS NULL FOR UPDATE;
  IF FOUND THEN
    PERFORM set_config('app.service_acceptance_request_id', NEW.ref_id::text, true);
    UPDATE public.service_acceptance_requests SET lifecycle = 'sent', sent_at = NEW.delivered_at
    WHERE id = NEW.ref_id AND lifecycle = 'draft' AND sent_at IS NULL;
    PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
    -- 00899 delta (F-A defect 4): the 00889/00891 freeze, unchanged, moved
    -- into _freeze_service_acceptance_evidence so the offline presentation
    -- freezes the same evidence.
    PERFORM public._freeze_service_acceptance_evidence(NEW.ref_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_request_json(p_request_id uuid, p_studio boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'requestId', r.id, 'projectId', r.project_id, 'requestNumber', r.request_number,
    'scopeEditionId', r.scope_edition_id, 'scopeContentHash', r.scope_content_hash,
    'evidenceManifestHash', r.evidence_manifest_hash, 'lifecycle', r.lifecycle,
    'aggregateOutcome', r.aggregate_outcome, 'closedAt', r.closed_at,
    'signerPolicyRevision', r.signer_policy_revision, 'sentAt', r.sent_at,
    'signers', COALESCE((SELECT jsonb_agg(CASE WHEN p_studio THEN jsonb_build_object(
        'signerId', s.id, 'slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
        'householdPersonId', s.household_person_id, 'status', s.status,
        'replacedBySignerId', s.replaced_by_signer_id, 'replacementReason', s.replacement_reason,
        'replacedAt', s.replaced_at, 'response', resp.body)
      ELSE jsonb_build_object('signerId', s.id, 'slot', s.slot, 'required', s.required,
        'response', resp.body - 'responseId') END ORDER BY s.slot, s.created_at, s.id)
      FROM public.service_acceptance_signers s
      LEFT JOIN LATERAL (SELECT jsonb_build_object('responseId', x.id, 'response', x.response,
          'conditions', x.conditions, 'returnReason', x.return_reason, 'method', x.method,
          'respondedAt', x.responded_at) AS body
        FROM public.service_acceptance_responses x WHERE x.signer_id = s.id) resp ON true
      WHERE s.request_id = r.id AND (p_studio OR s.status = 'active')), '[]'::jsonb))
  || CASE WHEN p_studio THEN jsonb_build_object(
      'predecessorRequestId', r.predecessor_request_id, 'evidenceManifestId', r.evidence_manifest_id,
      'closedReason', r.closed_reason, 'supersededReason', r.superseded_reason,
      'supersededAt', r.superseded_at, 'withdrawnAt', r.withdrawn_at, 'withdrawReason', r.withdraw_reason,
      'outboundDraftId', r.outbound_draft_id, 'createdAt', r.created_at,
      -- 00899 delta (F-A defect 4): who presented the request offline, and when.
      'offlinePresentedAt', r.offline_presented_at, 'offlinePresentedBy', r.offline_presented_by,
      'paperIntakes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'intakeId', i.id, 'signerId', i.signer_id, 'storageObjectId', i.storage_object_id,
          'documentSha256', i.document_sha256, 'paperSignedOn', i.paper_signed_on, 'signedName', i.signed_name,
          'disposition', i.disposition, 'conditions', i.conditions, 'returnReason', i.return_reason,
          'presentedSignerPolicyRevision', i.presented_signer_policy_revision, 'reviewState', i.review_state,
          'lapsedReason', i.lapsed_reason, 'recordedBy', i.recorded_by, 'recordedAt', i.recorded_at,
          'reviewedBy', i.reviewed_by, 'reviewedAt', i.reviewed_at, 'reviewNote', i.review_note)
        ORDER BY i.recorded_at, i.id)
        FROM public.service_acceptance_paper_intakes i WHERE i.request_id = r.id), '[]'::jsonb))
    ELSE '{}'::jsonb END
  FROM public.service_acceptance_requests r WHERE r.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public.present_service_acceptance_offline(
  p_request_id uuid, p_scope_content_hash text, p_evidence_manifest_hash text, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_at timestamptz;
  v_request public.service_acceptance_requests%ROWTYPE;
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  v_request := public._lock_service_acceptance_request(p_request_id, true);
  IF NOT public._is_service_acceptance_studio_admin(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id,
    'scopeContentHash', p_scope_content_hash, 'evidenceManifestHash', p_evidence_manifest_hash));
  IF v_request.offline_present_client_request_id = v_key THEN
    IF v_request.offline_presented_by <> v_uid OR v_request.offline_present_request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    -- The receipt is the presentation's effect, so a replay always reads
    -- 'sent', even after a later withdrawal, supersession or close.
    RETURN jsonb_build_object('requestId', v_request.id, 'lifecycle', 'sent',
      'sentAt', v_request.sent_at, 'offlinePresentedAt', v_request.offline_presented_at,
      'offlinePresentedBy', v_request.offline_presented_by, 'replayed', true);
  END IF;
  IF v_request.lifecycle <> 'draft' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_scope_content_hash IS DISTINCT FROM v_request.scope_content_hash
     OR p_evidence_manifest_hash IS DISTINCT FROM v_request.evidence_manifest_hash
     OR (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) <> 'active' THEN
    RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'serialization_failure';
  END IF;
  v_at := clock_timestamp();
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  UPDATE public.service_acceptance_requests SET lifecycle = 'sent', sent_at = v_at, offline_presented_by = v_uid,
    offline_presented_at = v_at, offline_present_client_request_id = v_key, offline_present_request_hash = v_hash
  WHERE id = p_request_id RETURNING * INTO v_request;
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  PERFORM public._freeze_service_acceptance_evidence(p_request_id);
  RETURN jsonb_build_object('requestId', v_request.id, 'lifecycle', v_request.lifecycle,
    'sentAt', v_request.sent_at, 'offlinePresentedAt', v_request.offline_presented_at,
    'offlinePresentedBy', v_request.offline_presented_by, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public._freeze_service_acceptance_evidence(uuid) FROM PUBLIC, anon, authenticated, service_role;
-- Inactive until the C4 activation step (§2.8 grants it to authenticated).
REVOKE ALL ON FUNCTION public.present_service_acceptance_offline(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
