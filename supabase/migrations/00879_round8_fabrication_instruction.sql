-- 00879 — C3/C5 one fabrication instruction gate (inactive).
-- Lineage: external event 00875 → 00876; native create_plan_issue 00429.
-- 00880–00883 do not replace these bodies. The 00808 resolver is unchanged.
-- Lock order: job KEY SHARE/labels → edition SHARE → fulfilment UPDATE →
-- package UPDATE → seat SHARE → grants SHARE → manifest SHARE → decisions
-- SHARE (UUID order) → bindings SHARE. Native issuance retains its preceding
-- project UPDATE, excluding composition changes before taking this prefix.
-- 00399 submit_coordination_revision locks its decision UPDATE before adding
-- a round; 00808 resolution takes labels then that decision UPDATE. Neither
-- can change the latest approved round while this gate holds decision SHARE.
-- Configuration content is retained by 00877 a_evidence_member_pinned:
-- mint takes configuration SHARE and verifies the snapshot hash, then retains
-- the typed member atomically. Every subsequent content UPDATE/DELETE refuses,
-- including 00403 transition_custom_commission_revision's snapshot writer.
-- Lifecycle-only updates cannot change project/snapshot/hash. Thus the gate
-- needs no configuration lock (and adds no revision→configuration inversion).

ALTER TABLE public.project_external_fulfilment_events
 DROP CONSTRAINT IF EXISTS external_instruction_not_active;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='public.project_external_fulfilment_events'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%authority_id IS NULL%'
 LOOP EXECUTE format('ALTER TABLE public.project_external_fulfilment_events DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE public.project_external_fulfilment_events
 DROP CONSTRAINT IF EXISTS external_instruction_payload;
ALTER TABLE public.project_external_fulfilment_events ADD CONSTRAINT external_instruction_payload CHECK (
 (event_kind='fabrication_instruction' AND authority_id IS NOT NULL AND manifest_id IS NOT NULL
  AND manifest_hash IS NOT NULL AND manifest_hash ~ '^[0-9a-f]{64}$' AND amount_cents IS NOT NULL
  AND actor_id IS NOT NULL AND actor_id=recorded_by
  AND evidence_route IS NOT NULL AND evidence_route IN ('shop_drawing','configured','approved_submittal')
  AND coverage IS NOT NULL AND jsonb_typeof(coverage)='array' AND jsonb_array_length(coverage)>0)
 OR (event_kind<>'fabrication_instruction' AND authority_id IS NULL AND manifest_id IS NULL
  AND manifest_hash IS NULL AND amount_cents IS NULL AND actor_id IS NULL AND evidence_route IS NULL AND coverage IS NULL));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.project_external_fulfilment_events'::regclass AND conname='external_instruction_authority_fk') THEN
  ALTER TABLE public.project_external_fulfilment_events ADD CONSTRAINT external_instruction_authority_fk
   FOREIGN KEY(authority_id) REFERENCES public.project_party_authority(id) ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.project_external_fulfilment_events'::regclass AND conname='external_instruction_manifest_fk') THEN
  ALTER TABLE public.project_external_fulfilment_events ADD CONSTRAINT external_instruction_manifest_fk
   FOREIGN KEY(manifest_id) REFERENCES public.evidence_manifests(id) ON DELETE RESTRICT;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assert_fabrication_instruction_authority(
 p_fulfilment_id uuid,p_manifest_id uuid,p_authorizing_party_id uuid,p_units text[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.project_external_fulfilments; pkg public.project_packages;
 seat public.project_parties; m public.evidence_manifests; ed uuid; studio uuid;
 authority uuid; amount integer; issue uuid; snapshot text; route text;
 units text[]; coverage jsonb; missing text[];
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 SELECT * INTO f FROM public.project_external_fulfilments WHERE id=p_fulfilment_id;
 IF f.id IS NULL THEN RAISE EXCEPTION 'fabrication_instruction_binding' USING ERRCODE='42501'; END IF;
 PERFORM public._ffe_lock_job_labels(f.project_id);
 SELECT id INTO ed FROM public.project_scope_editions WHERE project_id=f.project_id AND status='active' FOR SHARE;
 IF ed IS NULL THEN RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE='55000'; END IF;
 SELECT * INTO STRICT f FROM public.project_external_fulfilments WHERE id=p_fulfilment_id FOR UPDATE;
 PERFORM public._external_assert_active(f.project_id,f.package_key);
 IF f.status='cancelled' THEN RAISE EXCEPTION 'fabrication_fulfilment_cancelled' USING ERRCODE='55000'; END IF;
 IF f.status='installed' THEN RAISE EXCEPTION 'fulfilment_terminal' USING ERRCODE='55000'; END IF;
 SELECT * INTO pkg FROM public.project_packages WHERE project_id=f.project_id AND package_key=f.package_key FOR UPDATE;
 SELECT * INTO seat FROM public.project_parties WHERE id=p_authorizing_party_id FOR SHARE;
 IF pkg.id IS NULL OR pkg.archived_at IS NOT NULL OR seat.project_id IS DISTINCT FROM f.project_id THEN
  RAISE EXCEPTION 'fabrication_instruction_binding' USING ERRCODE='42501'; END IF;
 studio:=public.project_recorded_studio(f.project_id);
 IF studio IS NULL THEN RAISE EXCEPTION 'fabrication_instruction_binding' USING ERRCODE='42501'; END IF;
 IF NOT COALESCE(public.can_compose_project_plan(f.project_id),false) THEN
  IF auth.uid() IS NOT NULL AND auth.uid()=seat.profile_id THEN
   RAISE EXCEPTION 'fabrication_instruction_verified_inactive' USING ERRCODE='55000'; END IF;
  RAISE EXCEPTION 'fabrication_authority_forbidden' USING ERRCODE='42501';
 END IF;
 IF seat.stage IS DISTINCT FROM 'active' OR seat.off_job_at IS NOT NULL THEN
  RAISE EXCEPTION 'fabrication_authority_seat_closed' USING ERRCODE='23514'; END IF;
 IF NOT public._external_units_valid(p_units) OR NOT p_units<@f.units THEN
  RAISE EXCEPTION 'fabrication_units_invalid' USING ERRCODE='23514'; END IF;
 SELECT array_agg(u ORDER BY u) INTO units FROM unnest(p_units) u;
 amount:=public._fabrication_instructed_amount_cents(f.id);
 IF amount IS NULL THEN RAISE EXCEPTION 'fabrication_amount_unknown' USING ERRCODE='23514'; END IF;
 IF amount<0 THEN RAISE EXCEPTION 'fabrication_amount_invalid' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.project_party_authority WHERE engagement_id=seat.id AND scope='fabrication'
  AND revoked_at IS NULL ORDER BY id FOR SHARE;
 IF NOT public.party_holds_fabrication_authority(seat.id,amount::bigint,current_date) THEN
  RAISE EXCEPTION 'fabrication_authority_insufficient' USING ERRCODE='23514'; END IF;
 SELECT id INTO authority FROM public.project_party_authority a WHERE engagement_id=seat.id AND scope='fabrication'
  AND NOT prepares_only AND revoked_at IS NULL AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
  AND (threshold_cents IS NULL OR amount<=threshold_cents)
  AND fabrication_grant_request->'project_id'=to_jsonb(seat.project_id)
  AND fabrication_grant_request->'profile_id'=COALESCE(to_jsonb(seat.profile_id),'null'::jsonb) ORDER BY id LIMIT 1;
 SELECT * INTO m FROM public.evidence_manifests WHERE id=p_manifest_id FOR SHARE;
 IF m.id IS NULL OR m.project_id IS DISTINCT FROM f.project_id OR m.package_id IS DISTINCT FROM pkg.id
  OR m.purpose IS DISTINCT FROM 'fabrication_instruction' THEN
  RAISE EXCEPTION 'fabrication_instruction_binding' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.client_decisions d WHERE d.id IN
  (SELECT r.decision_id FROM public.evidence_manifest_members mm JOIN public.coordination_item_revisions r
   ON r.id=mm.coordination_item_revision_id WHERE mm.manifest_id=m.id) ORDER BY d.id FOR SHARE;
 PERFORM 1 FROM public.project_external_fulfilment_evidence_bindings b WHERE b.fulfilment_id=f.id
  ORDER BY b.decision_id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.evidence_manifest_members mm JOIN public.coordination_item_revisions r
  ON r.id=mm.coordination_item_revision_id JOIN public.client_decisions d ON d.id=r.decision_id
  WHERE mm.manifest_id=m.id AND (d.project_id IS DISTINCT FROM f.project_id OR d.coordination_kind IS DISTINCT FROM 'submittal'
   OR r.status<>'approved' OR r.rev_number<>(SELECT max(rr.rev_number) FROM public.coordination_item_revisions rr WHERE rr.decision_id=d.id))) THEN
  RAISE EXCEPTION 'fabrication_evidence_not_approved' USING ERRCODE='23514'; END IF;
 IF f.kind IS DISTINCT FROM 'gc_cabinetry' AND f.configuration_id IS NULL
  AND f.kind NOT IN ('client_furnishing','other_external') THEN
  RAISE EXCEPTION 'fabrication_evidence_route_unknown' USING ERRCODE='23514'; END IF;
 IF f.kind='gc_cabinetry' THEN
  SELECT plan_issue_id INTO issue FROM public.project_external_fulfilment_events
   WHERE fulfilment_id=f.id AND event_kind='package_issued' ORDER BY event_seq DESC LIMIT 1;
  IF issue IS NULL OR NOT EXISTS(SELECT 1 FROM public.evidence_manifest_members WHERE manifest_id=m.id AND plan_issue_id=issue) THEN
   RAISE EXCEPTION 'fabrication_evidence_issue_missing' USING ERRCODE='23514'; END IF;
 END IF;
 IF f.configuration_id IS NOT NULL THEN
  SELECT c.snapshot_hash INTO snapshot FROM public.product_configurations c JOIN public.evidence_manifest_members mm
   ON mm.product_configuration_id=c.id AND mm.manifest_id=m.id WHERE c.id=f.configuration_id AND c.project_id=f.project_id;
  IF snapshot IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.members) x
   WHERE x->>'kind'='product_configuration' AND x->>'id'=f.configuration_id::text AND x->>'sha256'=snapshot) THEN
   RAISE EXCEPTION 'fabrication_evidence_configuration_missing' USING ERRCODE='23514'; END IF;
 END IF;
 route:=CASE WHEN issue IS NOT NULL THEN 'shop_drawing' WHEN snapshot IS NOT NULL THEN 'configured' ELSE 'approved_submittal' END;
 SELECT jsonb_agg(jsonb_build_object('unit',u,'revisionIds',revisions) ORDER BY u),array_agg(u) FILTER(WHERE jsonb_array_length(revisions)=0)
 INTO coverage,missing FROM (
  SELECT u,COALESCE((SELECT jsonb_agg(r.id ORDER BY r.id) FROM public.evidence_manifest_members mm
   JOIN public.coordination_item_revisions r ON r.id=mm.coordination_item_revision_id
   JOIN public.project_external_fulfilment_evidence_bindings b ON b.decision_id=r.decision_id AND b.fulfilment_id=f.id
   WHERE mm.manifest_id=m.id AND u=ANY(b.units) AND r.status='approved'
    AND b.covers_plan_issue_id IS NOT DISTINCT FROM issue
    AND b.covers_configuration_snapshot_hash IS NOT DISTINCT FROM snapshot),'[]'::jsonb) revisions FROM unnest(units) u
 ) covered;
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'fabrication_evidence_insufficient: %',array_to_string(missing,',') USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_external_fulfilment_events h WHERE h.fulfilment_id=f.id AND h.event_kind='hold'
  AND h.affected_units&&units AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events r WHERE r.releases_event_id=h.id)) THEN
  RAISE EXCEPTION 'fabrication_hold_open' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('projectId',f.project_id,'studioId',studio,'scopeEditionId',ed,'fulfilmentId',f.id,
  'packageKey',f.package_key,'packageId',pkg.id,'manifestId',m.id,'manifestHash',m.manifest_hash,'partyId',seat.id,
  'authorityId',authority,'amountCents',amount,'units',units,'actorId',auth.uid(),'evidenceStatus','reported','evidenceRoute',route,'coverage',coverage);
END $$;

CREATE OR REPLACE FUNCTION public._record_fabrication_instruction(
 p_fulfilment_id uuid,p_manifest_id uuid,p_authorizing_party_id uuid,p_units text[],p_evidence jsonb,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.project_external_fulfilments; e public.project_external_fulfilment_events;
 g jsonb; evidence jsonb; units text[]; h text; seq bigint; s text;
 marker text:=current_setting('patina.external_writer',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'fabrication_evidence_invalid' USING ERRCODE='23514'; END IF;
 evidence:=p_evidence||jsonb_build_object('manifestId',p_manifest_id,'authorizingPartyId',p_authorizing_party_id);
 SELECT array_agg(u ORDER BY u) INTO units FROM unnest(p_units) u;
 h:=encode(extensions.digest(jsonb_build_object('fulfilmentId',p_fulfilment_id,'manifestId',p_manifest_id,
  'authorizingPartyId',p_authorizing_party_id,'units',units,'evidence',evidence-ARRAY['manifestId','authorizingPartyId'])::text,'sha256'),'hex');
 SELECT * INTO f FROM public.project_external_fulfilments WHERE id=p_fulfilment_id;
 IF f.id IS NULL THEN RAISE EXCEPTION 'fabrication_instruction_binding' USING ERRCODE='42501'; END IF;
 -- Labels serialize receipt discovery without taking any C5 row lock before
 -- the gate. Exact replay deliberately skips all mutable evidence/lifecycle.
 PERFORM public._ffe_lock_job_labels(f.project_id);
 SELECT * INTO e FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  SELECT * INTO STRICT f FROM public.project_external_fulfilments WHERE id=p_fulfilment_id FOR SHARE;
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM e.actor_id THEN
   RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='42501'; END IF;
  PERFORM public._external_assert_access(f.project_id);
  IF h IS DISTINCT FROM e.request_hash THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('eventId',e.id,'status',f.status,'evidenceLevel',e.evidence_level,'replayed',true);
 END IF;
 g:=public.assert_fabrication_instruction_authority(f.id,p_manifest_id,p_authorizing_party_id,p_units);
 SELECT COALESCE(max(event_seq),0)+1 INTO seq FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id;
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilment_events(fulfilment_id,event_kind,evidence,evidence_level,affected_units,
  authority_id,manifest_id,manifest_hash,amount_cents,actor_id,evidence_route,coverage,recorded_by,event_seq,client_request_id,request_hash)
 VALUES(f.id,'fabrication_instruction',evidence,g->>'evidenceStatus',ARRAY(SELECT jsonb_array_elements_text(g->'units')),
  (g->>'authorityId')::uuid,(g->>'manifestId')::uuid,g->>'manifestHash',(g->>'amountCents')::integer,
  (g->>'actorId')::uuid,g->>'evidenceRoute',g->'coverage',auth.uid(),seq,p_client_request_id,h) RETURNING * INTO e;
 s:=public._external_refresh_status(f.id);
 PERFORM set_config('patina.external_writer',COALESCE(marker,''),true);
 RETURN jsonb_build_object('eventId',e.id,'status',s,'evidenceLevel',e.evidence_level,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.record_fabrication_instruction(
 p_fulfilment_id uuid,p_manifest_id uuid,p_authorizing_party_id uuid,p_units text[],p_evidence jsonb,p_client_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public._record_fabrication_instruction(p_fulfilment_id,p_manifest_id,p_authorizing_party_id,p_units,p_evidence,p_client_request_id::text);
$$;

CREATE OR REPLACE FUNCTION public.record_external_fulfilment_event(
 p_fulfilment_id uuid,p_event_kind text,p_evidence jsonb,p_affected_units text[],p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 held public.project_external_fulfilment_events%ROWTYPE; h text; seq bigint; s text;
 marker text:=current_setting('patina.external_writer',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 -- Delegate before _external_lock: both routes reach exactly one C3 gate.
 IF p_event_kind='fabrication_instruction' THEN
  RETURN public._record_fabrication_instruction(p_fulfilment_id,(p_evidence->>'manifestId')::uuid,
   (p_evidence->>'authorizingPartyId')::uuid,p_affected_units,p_evidence,p_client_request_id);
 END IF;
 f:=public._external_lock(p_fulfilment_id);
 h:=encode(extensions.digest(jsonb_build_array(p_event_kind,p_evidence,p_affected_units)::text,'sha256'),'hex');
 SELECT * INTO e FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(f.project_id,e.recorded_by,h,e.request_hash);
  RETURN jsonb_build_object('eventId',e.id,'status',f.status,'evidenceLevel',e.evidence_level,'replayed',true);
 END IF;
 IF p_event_kind='package_issued' THEN RAISE EXCEPTION 'package_issue_owner_required' USING ERRCODE='insufficient_privilege'; END IF;
 IF f.status IN ('installed','cancelled') THEN RAISE EXCEPTION 'fulfilment_terminal' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NOT (p_event_kind='cancelled' AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND event_kind='contract_reported')) THEN
  PERFORM public._external_assert_active(f.project_id,f.package_key);
 END IF;
 IF p_event_kind='cancelled' AND EXISTS(SELECT 1 FROM public.project_ffe_items
  WHERE external_fulfilment_id=f.id AND removed_at IS NULL) THEN
  RAISE EXCEPTION 'fulfilment_cancel_lines_live' USING ERRCODE='check_violation';
 END IF;
 IF p_event_kind='hold' THEN
  IF NOT public._external_units_valid(p_affected_units) OR NOT p_affected_units<@f.units THEN
   RAISE EXCEPTION 'fulfilment_units_invalid' USING ERRCODE='check_violation'; END IF;
 ELSIF p_affected_units IS NOT NULL THEN RAISE EXCEPTION 'fulfilment_units_invalid' USING ERRCODE='check_violation'; END IF;
 IF p_event_kind='release_hold' THEN
  SELECT * INTO held FROM public.project_external_fulfilment_events WHERE id=(p_evidence->>'releasesEventId')::uuid
   AND fulfilment_id=f.id AND event_kind='hold';
  IF held.id IS NULL OR EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE releases_event_id=held.id) THEN
   RAISE EXCEPTION 'fulfilment_hold_not_open' USING ERRCODE='check_violation'; END IF;
  -- Until C4 supplies broader approval authorities, only a bound, approved
  -- submittal explicitly named by this hold can release it.
  PERFORM 1 FROM public.client_decisions WHERE id=(held.evidence->>'decisionId')::uuid AND project_id=f.project_id FOR SHARE;
  IF p_evidence->>'decisionId' IS DISTINCT FROM held.evidence->>'decisionId'
    OR NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_evidence_bindings b JOIN public.coordination_item_revisions r ON r.decision_id=b.decision_id
     WHERE b.fulfilment_id=f.id AND b.decision_id=(held.evidence->>'decisionId')::uuid AND r.status='approved' AND held.affected_units<@b.units) THEN
   RAISE EXCEPTION 'fulfilment_hold_evidence_required' USING ERRCODE='check_violation'; END IF;
 END IF;
 SELECT COALESCE(max(event_seq),0)+1 INTO seq FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id;
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilment_events(fulfilment_id,event_kind,evidence,affected_units,releases_event_id,recorded_by,event_seq,client_request_id,request_hash)
 VALUES(f.id,p_event_kind,p_evidence,p_affected_units,held.id,auth.uid(),seq,p_client_request_id,h) RETURNING * INTO e;
 s:=public._external_refresh_status(f.id);
 PERFORM set_config('patina.external_writer',COALESCE(marker,''),true);
 RETURN jsonb_build_object('eventId',e.id,'status',s,'evidenceLevel',e.evidence_level,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.create_plan_issue(
  p_project_id uuid,
  p_name text,
  p_idempotency_key text,
  p_sheet_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_name       text := btrim(COALESCE(p_name, ''));
  v_key        text := btrim(COALESCE(p_idempotency_key, ''));
  v_hash       text;
  v_issue      public.plan_issues%ROWTYPE;
  v_prior      public.plan_issues%ROWTYPE;
  v_ids        uuid[];
  v_checksum   text;
  v_missing    text;
  v_idempotent boolean := false;
  v_sheets     jsonb;
  v_added      jsonb;
  v_changed    jsonb;
  v_removed    jsonb;
  v_unchanged  jsonb;
  v_external public.project_external_fulfilments;
  v_external_seq bigint;
  v_external_snapshot text;
  v_external_marker text := current_setting('patina.external_writer',true);
  v_scope_on boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'issuing a set requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan room for project % not found or access denied', p_project_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'an issue needs a name of 1 to 120 characters'
      USING errcode = 'check_violation';
  END IF;
  IF v_key = '' THEN
    RAISE EXCEPTION 'an issue needs an idempotency key'
      USING errcode = 'check_violation';
  END IF;

  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  SELECT enabled INTO v_scope_on FROM public.server_capabilities WHERE key='scope_editions';
  IF v_scope_on THEN
    PERFORM public._ffe_lock_job_labels(p_project_id);
    PERFORM 1 FROM public.project_scope_editions WHERE project_id=p_project_id AND status='active' FOR SHARE;
  END IF;

  v_hash := encode(extensions.digest(public._plan_room_canonical_json(
    jsonb_build_object(
      'name', v_name,
      -- DISTINCT, because the write path dedupes: [A, A, B] and [A, B] resolve
      -- to the same set, so they must not be two different requests under one
      -- idempotency key.
      'sheetIds', CASE
        WHEN p_sheet_ids IS NULL THEN 'null'::jsonb
        ELSE (SELECT COALESCE(
                jsonb_agg(DISTINCT to_jsonb(x::text) ORDER BY to_jsonb(x::text)),
                '[]'::jsonb)
              FROM unnest(p_sheet_ids) AS x)
      END
    )), 'sha256'), 'hex');

  SELECT * INTO v_issue FROM public.plan_issues
  WHERE project_id = p_project_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_issue.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'idempotency key was reused with a different request'
        USING errcode = 'unique_violation';
    END IF;
    v_idempotent := true;
  ELSE
    SELECT COALESCE(array_agg(s.id ORDER BY upper(btrim(s.sheet_number))), ARRAY[]::uuid[])
      INTO v_ids
      FROM public.plan_sheets s
     WHERE s.project_id = p_project_id
       AND s.current_print_id IS NOT NULL
       AND (p_sheet_ids IS NULL OR s.id = ANY (p_sheet_ids));

    IF p_sheet_ids IS NOT NULL THEN
      SELECT string_agg(x::text, ', ') INTO v_missing
      FROM unnest(p_sheet_ids) AS x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.plan_sheets s
        WHERE s.id = x AND s.project_id = p_project_id AND s.current_print_id IS NOT NULL
      );
      IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
          'these sheets are not in this plan room, or have nothing filed on them: %', v_missing
          USING errcode = 'check_violation';
      END IF;
    END IF;

    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'an issue needs at least one sheet with a filed print'
        USING errcode = 'check_violation';
    END IF;

    SELECT encode(extensions.digest(public._plan_room_canonical_json(
             COALESCE(jsonb_agg(jsonb_build_object(
               'sheetNumber', btrim(s.sheet_number),
               'revLetter', pp.rev_letter,
               'sha256', pp.sha256
             ) ORDER BY upper(btrim(s.sheet_number))), '[]'::jsonb)), 'sha256'), 'hex')
      INTO v_checksum
      FROM public.plan_sheets s
      JOIN public.plan_prints pp ON pp.id = s.current_print_id
     WHERE s.id = ANY (v_ids);

    SELECT * INTO v_prior FROM public.plan_issues
    WHERE project_id = p_project_id
    ORDER BY issue_number DESC
    LIMIT 1;

    INSERT INTO public.plan_issues (
      project_id, issue_number, name, idempotency_key, request_hash,
      prior_issue_id, set_checksum, sheet_count, created_by
    ) VALUES (
      p_project_id, COALESCE(v_prior.issue_number, 0) + 1, v_name, v_key, v_hash,
      v_prior.id, v_checksum, cardinality(v_ids), auth.uid()
    ) RETURNING * INTO v_issue;

    INSERT INTO public.plan_issue_prints (
      issue_id, sheet_id, print_id, sheet_number, sheet_title, rev_letter, sha256
    )
    SELECT v_issue.id, s.id, pp.id, btrim(s.sheet_number), s.title, pp.rev_letter, pp.sha256
    FROM public.plan_sheets s
    JOIN public.plan_prints pp ON pp.id = s.current_print_id
    WHERE s.id = ANY (v_ids);

    -- An issue represents a package only when it contains every sheet linked
    -- to that package, not merely one sheet of a partial set. The project
    -- UPDATE above excludes composition writers for the whole native act.
    -- Replay never manufactures a new external event or rewinds latest issue.
    IF v_scope_on THEN
      FOR v_external IN SELECT f.* FROM public.project_external_fulfilments f
       JOIN public.project_packages p ON p.project_id=f.project_id AND p.package_key=f.package_key
       WHERE f.project_id=p_project_id AND f.kind='gc_cabinetry' AND f.status NOT IN ('installed','cancelled')
        AND p.archived_at IS NULL
        AND EXISTS(SELECT 1 FROM public.plan_sheet_packages sp WHERE sp.package_id=p.id)
        AND NOT EXISTS(SELECT 1 FROM public.plan_sheet_packages sp WHERE sp.package_id=p.id
          AND NOT EXISTS(SELECT 1 FROM public.plan_issue_prints ip WHERE ip.issue_id=v_issue.id AND ip.sheet_id=sp.sheet_id))
       ORDER BY f.id FOR UPDATE OF f
      LOOP
        PERFORM public._external_assert_access(p_project_id);
        PERFORM public._external_assert_active(p_project_id,v_external.package_key);
        PERFORM 1 FROM public.project_packages WHERE project_id=p_project_id AND package_key=v_external.package_key FOR UPDATE;
        SELECT snapshot_hash INTO v_external_snapshot FROM public.product_configurations
          WHERE id=v_external.configuration_id AND project_id=p_project_id;
        SELECT COALESCE(max(event_seq),0)+1 INTO v_external_seq
          FROM public.project_external_fulfilment_events WHERE fulfilment_id=v_external.id;
        PERFORM set_config('patina.external_writer','00875',true);
        INSERT INTO public.project_external_fulfilment_events(fulfilment_id,event_kind,evidence,plan_issue_id,
          recorded_by,event_seq,client_request_id,request_hash)
        VALUES(v_external.id,'package_issued',jsonb_build_object('planIssueId',v_issue.id,
          'configurationSnapshotHash',v_external_snapshot),v_issue.id,auth.uid(),v_external_seq,
          'plan-issue:'||v_issue.id,encode(extensions.digest(jsonb_build_array('package_issued',v_issue.id,v_external_snapshot)::text,'sha256'),'hex'));
        PERFORM public._external_refresh_status(v_external.id);
        PERFORM set_config('patina.external_writer',COALESCE(v_external_marker,''),true);
      END LOOP;
    END IF;
  END IF;

  -- One DTO tail for both arms: the drift is derived from the issue's own
  -- snapshots against its prior's, so a replay answers exactly what the first
  -- call answered.
  WITH mine AS (
    SELECT ip.sheet_id, ip.print_id, ip.sheet_number, ip.sheet_title,
           ip.rev_letter, ip.sha256
    FROM public.plan_issue_prints ip WHERE ip.issue_id = v_issue.id
  ),
  theirs AS (
    SELECT ip.sheet_id, ip.print_id
    FROM public.plan_issue_prints ip WHERE ip.issue_id = v_issue.prior_issue_id
  ),
  drift AS (
    SELECT COALESCE(m.sheet_id, t.sheet_id) AS sheet_id,
           CASE
             WHEN t.sheet_id IS NULL THEN 'added'
             WHEN m.sheet_id IS NULL THEN 'removed'
             WHEN t.print_id IS DISTINCT FROM m.print_id THEN 'changed'
             ELSE 'unchanged'
           END AS kind
    FROM mine m
    FULL OUTER JOIN theirs t ON t.sheet_id = m.sheet_id
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'sheetId', sheet_id, 'printId', print_id, 'sheetNumber', sheet_number,
       'sheetTitle', sheet_title, 'revLetter', rev_letter, 'sha256', sha256
     ) ORDER BY upper(sheet_number)), '[]'::jsonb) FROM mine),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'added'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'changed'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'removed'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'unchanged')
  INTO v_sheets, v_added, v_changed, v_removed, v_unchanged;

  RETURN jsonb_build_object(
    'issue', jsonb_build_object(
      'id', v_issue.id,
      'projectId', v_issue.project_id,
      'issueNumber', v_issue.issue_number,
      'name', v_issue.name,
      'issuedAt', v_issue.issued_at,
      'setChecksum', v_issue.set_checksum,
      'sheetCount', v_issue.sheet_count,
      'priorIssueId', v_issue.prior_issue_id),
    'idempotent', v_idempotent,
    'sheets', v_sheets,
    'drift', jsonb_build_object(
      'added', v_added, 'changed', v_changed,
      'removed', v_removed, 'unchanged', v_unchanged)
  );
END;
$$;

-- Top-level ACLs are consumed by the native legacy-grants replay extractor.
REVOKE ALL ON FUNCTION public.assert_fabrication_instruction_authority(uuid,uuid,uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_external_fulfilment_event(uuid,text,jsonb,text[],text) FROM PUBLIC,anon,authenticated,service_role;
-- Preserve the native issue-owner surface, including while scope is disabled.
REVOKE ALL ON FUNCTION public.create_plan_issue(uuid,text,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_plan_issue(uuid,text,text,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
