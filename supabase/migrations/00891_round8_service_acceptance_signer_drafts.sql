-- ═══════════════════════════════════════════════════════════════════════════
-- 00891 — Round 8 C4 service acceptance: one V22 draft per required signer
-- (US-52 W6 pre-activation debt, SQ-2328; finding SQ-2327 F1). Ships INACTIVE.
--
-- Before: create composed one draft, addressed to projects.client_id. Under K4
-- every named required signer must respond, so a required household partner
-- got no notice, and an observer project client was the only person told.
-- Now create writes one awaiting_review draft per required signer of the
-- edition policy (ordered by slot). Each is addressed to that signer: a profile
-- signer by to_client_id; a household-card signer by to_contact_id, plus the
-- card's linked profile as to_client_id. The address is that profile's email,
-- trimmed, and NULL when there is none, so Ready-to-send holds that draft with
-- "no address on file". The project client gets a draft only as a required
-- signer. Nothing is sent: the designer sends each draft (V22).
--
-- Why a direct INSERT, not compose_outbound_draft: compose (00783) supersedes
-- every other awaiting_review draft of the same studio, project, ref and kind
-- right after its INSERT, so a second signer's draft would supersede the first.
-- Scoping compose's supersede by recipient would change live kinds (for
-- example site_request_due reassignment), so compose is untouched. The INSERT
-- writes exactly the columns compose writes (status takes its awaiting_review
-- default; outbound_drafts has no INSERT trigger). Compose's supersede has
-- nothing to act on here: the ref is a request id minted in this call. The
-- dedupe key is per slot, 'service_acceptance_request:<request>:<slot>', and a
-- retried create replays its receipt before composing anything.
--
-- Redefinitions, each copied verbatim from its latest CREATE OR REPLACE (no
-- later file redefines them) with only the marked delta:
--   create_service_acceptance_request   00886 -> 00889 -> 00890 -> 00891
--     (the per-signer drafts above; outbound_draft_id keeps the first signer's
--     draft, so outboundDraftId and every reader and projection are unchanged)
--   _service_acceptance_after_send      00886 -> 00889 -> 00891
--     (binds any service_acceptance_request draft of this request in its
--     project, not only outbound_draft_id: the first delivered signer notice
--     marks the request sent, and later sibling deliveries are no-ops)
--   _service_acceptance_create_receipt  00886 -> 00891
--     (adds outboundDraftIds, every draft of the request in slot order)
-- Withdraw and supersede already discard every awaiting_review draft of the
-- request through resolve_outbound_drafts(ref), siblings included.
--
-- The kind renderer (supabase/functions/_shared/outbound-kinds/
-- service_acceptance_request.ts) binds each draft to an active required signer
-- of its request. CREATE OR REPLACE keeps every function's ACL (inactive until
-- the C4 activation step), so this file has no GRANT/REVOKE and
-- seed/00-legacy-grants.sql is unchanged. No backfill (nothing is on Strata).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_service_acceptance_request(
  p_project_id uuid, p_scope_edition_id uuid, p_evidence_manifest_id uuid, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_project public.projects%ROWTYPE;
  v_edition public.project_scope_editions%ROWTYPE; v_manifest public.evidence_manifests%ROWTYPE;
  v_existing public.service_acceptance_requests%ROWTYPE; v_prior public.service_acceptance_requests%ROWTYPE;
  v_signers jsonb; v_studio uuid; v_draft uuid; v_number integer; v_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF v_uid IS NULL OR v_project.id IS NULL OR NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_edition FROM public.project_scope_editions
  WHERE id = p_scope_edition_id AND project_id = p_project_id FOR SHARE;
  v_hash := public._service_acceptance_hash(jsonb_build_object('projectId', p_project_id,
    'scopeEditionId', p_scope_edition_id, 'evidenceManifestId', p_evidence_manifest_id));
  SELECT * INTO v_existing FROM public.service_acceptance_requests
  WHERE project_id = p_project_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_hash <> v_hash OR v_existing.created_by <> v_uid THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_acceptance_create_receipt(v_existing.id, true);
  END IF;
  IF v_edition.id IS NULL OR v_edition.status <> 'active' THEN
    RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_manifest FROM public.evidence_manifests WHERE id = p_evidence_manifest_id;
  IF v_manifest.id IS NULL OR v_manifest.project_id <> p_project_id OR v_manifest.purpose <> 'service_acceptance' THEN
    RAISE EXCEPTION 'evidence_manifest_invalid' USING ERRCODE = 'check_violation';
  END IF;
  -- 00889 delta (SQ-2275): every member must have a client projection in
  -- get_my_service_acceptance_evidence (A20), so a signer is never asked to
  -- accept what they cannot read. po_spec_snapshot and coordination_item_revision
  -- (and any later kind) are refused before anything is written.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_manifest.members) e WHERE (e->>'kind') IS NULL OR e->>'kind' NOT IN
      ('plan_issue', 'plan_issue_print', 'plan_print', 'product_configuration', 'custom_commission_revision',
       'review_item', 'approval_artifact')) THEN
    RAISE EXCEPTION 'service_acceptance_evidence_not_client_readable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
      'householdPersonId', s.household_person_id) ORDER BY s.slot), '[]'::jsonb) INTO v_signers
  FROM public.project_scope_edition_signers s WHERE s.edition_id = v_edition.id;
  IF jsonb_typeof(v_edition.content->'signerPolicy') IS DISTINCT FROM 'object' OR jsonb_array_length(v_signers) = 0 THEN
    RAISE EXCEPTION 'signer_policy_missing' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._validate_service_acceptance_signers(v_edition.source_proposal_id, v_signers);
  v_studio := public.project_recorded_studio(p_project_id);
  IF v_studio IS NULL OR v_project.client_id IS NULL THEN
    RAISE EXCEPTION 'service_acceptance_recipient_missing' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_prior FROM public.service_acceptance_requests WHERE project_id = p_project_id
  ORDER BY request_number DESC LIMIT 1 FOR UPDATE;
  IF v_prior.lifecycle IN ('draft','sent') THEN
    PERFORM public._supersede_service_acceptance_request(v_prior.id, 'successor_request');
  END IF;
  v_number := COALESCE(v_prior.request_number, 0) + 1;
  -- 00891 delta (SQ-2328): one V22 draft per required signer, addressed to that
  -- signer (NULL address, the Ready-to-send hold, when their profile has no
  -- email). The request records the first signer's draft.
  WITH composed AS (
    INSERT INTO public.outbound_drafts (organization_id, project_id, kind, channel, recipient_kind,
      to_contact_id, to_client_id, to_party_id, to_address, subject, body, payload, ref_type, ref_id, dedupe_key,
      due_at, expires_at, composed_by)
    SELECT v_studio, p_project_id, 'service_acceptance_request', 'email', 'client',
      s.household_person_id, COALESCE(s.profile_id, sc.profile_id), NULL, NULLIF(btrim(p.email), ''),
      'Review the agreed services',
      'Your studio has prepared the agreed services for your review. Open your project to accept them, '
        || 'accept them with conditions, or return them with a note.',
      jsonb_build_object('requestId', v_id, 'projectId', p_project_id, 'requestNumber', v_number,
        'scopeEditionId', v_edition.id),
      'service_acceptance_request', v_id, 'service_acceptance_request:' || v_id || ':' || s.slot, NULL, NULL,
      v_uid::text
    FROM public.project_scope_edition_signers s
    LEFT JOIN public.studio_contacts sc ON sc.id = s.household_person_id
    LEFT JOIN public.profiles p ON p.id = COALESCE(s.profile_id, sc.profile_id)
    WHERE s.edition_id = v_edition.id AND s.required
    RETURNING id, dedupe_key
  )
  SELECT id INTO v_draft FROM composed ORDER BY dedupe_key LIMIT 1;
  PERFORM set_config('app.service_acceptance_request_id', v_id::text, true);
  INSERT INTO public.service_acceptance_requests(id, project_id, scope_edition_id, scope_content_hash,
    evidence_manifest_id, evidence_manifest_hash, request_number, predecessor_request_id, outbound_draft_id,
    client_request_id, request_hash, created_by)
  VALUES (v_id, p_project_id, v_edition.id, v_edition.content_hash, v_manifest.id, v_manifest.manifest_hash,
    v_number, v_prior.id, v_draft, v_key, v_hash, v_uid);
  INSERT INTO public.service_acceptance_signers(request_id, slot, required, profile_id, household_person_id, policy_slot)
  SELECT v_id, s.slot, s.required, s.profile_id, s.household_person_id, s.slot
  FROM public.project_scope_edition_signers s WHERE s.edition_id = v_edition.id;
  PERFORM public._derive_service_acceptance_outcome(v_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN public._service_acceptance_create_receipt(v_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_create_receipt(p_request_id uuid, p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('requestId', r.id, 'lifecycle', r.lifecycle, 'outboundDraftId', r.outbound_draft_id,
    'signerPolicyRevision', r.signer_policy_revision, 'replayed', p_replayed,
    'signers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('signerId', s.id, 'slot', s.slot,
        'required', s.required, 'profileId', s.profile_id, 'householdPersonId', s.household_person_id)
        ORDER BY s.slot), '[]'::jsonb)
      FROM public.service_acceptance_signers s WHERE s.request_id = r.id AND s.status = 'active'),
    -- 00891 delta (SQ-2328): every V22 draft of the request, in slot order.
    'outboundDraftIds', (SELECT COALESCE(jsonb_agg(d.id ORDER BY d.dedupe_key), '[]'::jsonb)
      FROM public.outbound_drafts d WHERE d.ref_type = 'service_acceptance_request' AND d.ref_id = r.id
        AND d.kind = 'service_acceptance_request'))
  FROM public.service_acceptance_requests r WHERE r.id = p_request_id;
$$;

-- V22 after-send hook, copied verbatim from 00889 with one delta: the binding.
CREATE OR REPLACE FUNCTION public._service_acceptance_after_send()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous_marker text := current_setting('app.service_acceptance_request_id', true);
  v_unresolved integer; v_missing integer;
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
    WHERE r.id = NEW.ref_id;
    -- Pin every served object under FOR SHARE: an in-flight writer commits
    -- first (the pin takes its committed row) and a later one waits for this
    -- transaction, then meets the freeze trigger. A required file that does not
    -- resolve (SQ-2287 F1), or a served object that is missing (or renamed
    -- away) by then, refuses the send.
    WITH document AS (
      SELECT d.* FROM public.service_acceptance_requests r
      CROSS JOIN LATERAL public._service_acceptance_evidence_documents(r.evidence_manifest_id) d
      WHERE r.id = NEW.ref_id
    ), served AS (
      SELECT s.ordinal, document.path, min(document.title) AS title
      FROM public.service_acceptance_evidence_snapshots s
      JOIN document ON document.member_kind = s.member_kind AND document.member_id = s.member_id
      WHERE s.request_id = NEW.ref_id AND document.path IS NOT NULL
      GROUP BY s.ordinal, document.path
    ), live AS (
      SELECT o.id, o.name, o.version FROM storage.objects o
      WHERE o.bucket_id = 'project-documents' AND o.name IN (SELECT served.path FROM served)
      ORDER BY o.name
      FOR SHARE OF o
    ), pinned AS (
      INSERT INTO public.service_acceptance_evidence_snapshot_objects(request_id, ordinal, bucket_id, object_name,
        object_id, object_version, title)
      SELECT NEW.ref_id, served.ordinal, 'project-documents', served.path, live.id, live.version, served.title
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
  END IF;
  RETURN NULL;
END;
$$;
