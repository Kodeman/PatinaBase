-- ═══════════════════════════════════════════════════════════════════════════
-- 00900 — Round 8 C5: no external installation while a hold is open or a
-- contracted unit is uninstructed (US-52 RC-7 defect RC7-E4-1, HIGH).
-- Ships INACTIVE: no capability, grant or row changes.
--
-- Defect: _external_refresh_status set a fulfilment 'installed' from any
-- verified 'installed' event, and verify_external_fulfilment_event then marked
-- every bound presence line installed. close_project's installed census passed
-- while a hold was never released and units K3/K4 were never instructed.
-- 'installed' is terminal, so nothing could repair it afterwards.
--
-- Fix: one predicate, _external_install_blocker, refuses an installation:
--   fulfilment_hold_open          a 'hold' event has no 'release_hold'
--                                 (every fulfilment kind);
--   fulfilment_units_uninstructed a unit of f.units is in no
--                                 'fabrication_instruction' event's
--                                 affected_units, ONLY when
--                                 f.contracting_party_kind <> 'none'.
-- Discriminator: contracting_party_kind 'none' means the package has no
-- fabrication contract (e.g. a client-bought chair), so no instruction can
-- exist and none is required; its open holds still refuse.
-- Both raise SQLSTATE 55000 (object_not_in_prerequisite_state).
-- Applied at: record_external_fulfilment_event('installed'),
-- verify_external_fulfilment_event on an 'installed' event, and the
-- 'installed' branch of _external_refresh_status (defence in depth: the
-- status falls through to the next state rather than reaching 'installed').
-- 'installed' stays terminal; there is no partial or unit-scoped installation.
-- All callers hold the fulfilment row FOR UPDATE (_external_lock), the same
-- lock every hold/release/instruction writer takes, so the predicate is stable.
--
-- Lineage (bodies copied verbatim from the grep|sort|tail -1 winner, delta
-- grafted):
--   _external_refresh_status          00875 → 00900
--   record_external_fulfilment_event  00875 → 00876 → 00879 → 00900
--   verify_external_fulfilment_event  00875 → 00876 → 00900
-- ACLs restated from 00875/00879; the new helper is private like its siblings.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._external_install_blocker(p_fulfilment_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT CASE
   WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events h
     WHERE h.fulfilment_id=f.id AND h.event_kind='hold'
       AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events r WHERE r.releases_event_id=h.id))
     THEN 'fulfilment_hold_open'
   WHEN f.contracting_party_kind<>'none' AND EXISTS(SELECT 1 FROM unnest(f.units) u
     WHERE NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events i
       WHERE i.fulfilment_id=f.id AND i.event_kind='fabrication_instruction' AND u=ANY(i.affected_units)))
     THEN 'fulfilment_units_uninstructed'
   END
 FROM public.project_external_fulfilments f WHERE f.id=p_fulfilment_id;
$$;

CREATE OR REPLACE FUNCTION public._external_refresh_status(p_fulfilment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s text; old_marker text:=current_setting('patina.external_writer',true);
BEGIN
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events e WHERE e.fulfilment_id=p_fulfilment_id AND e.event_kind='cancelled'
   AND (e.evidence_level='verified' OR NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events c WHERE c.fulfilment_id=p_fulfilment_id AND c.event_kind='contract_reported'))) THEN 'cancelled'
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=p_fulfilment_id AND event_kind='installed' AND evidence_level='verified')
   AND public._external_install_blocker(p_fulfilment_id) IS NULL THEN 'installed'
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=p_fulfilment_id AND event_kind='received') THEN 'received'
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=p_fulfilment_id AND event_kind='fabrication_instruction') THEN 'instructed'
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=p_fulfilment_id AND event_kind='package_issued') THEN 'issued'
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=p_fulfilment_id AND event_kind='contract_reported') THEN 'contracted'
  ELSE 'planned' END INTO s;
 PERFORM set_config('patina.external_writer','00875',true);
 UPDATE public.project_external_fulfilments SET status=s WHERE id=p_fulfilment_id;
 PERFORM set_config('patina.external_writer',COALESCE(old_marker,''),true);
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.record_external_fulfilment_event(
 p_fulfilment_id uuid,p_event_kind text,p_evidence jsonb,p_affected_units text[],p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 held public.project_external_fulfilment_events%ROWTYPE; h text; seq bigint; s text; blocker text;
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
 IF p_event_kind='installed' THEN
  blocker:=public._external_install_blocker(f.id);
  IF blocker IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=blocker,ERRCODE='object_not_in_prerequisite_state'; END IF;
 END IF;
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

CREATE OR REPLACE FUNCTION public.verify_external_fulfilment_event(p_event_id uuid,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 receipt public.project_external_fulfilment_verifications%ROWTYPE; fid uuid; seq bigint; s text; blocker text;
 marker text:=current_setting('patina.external_verifier',true); writer text:=current_setting('patina.external_writer',true);
 install_marker text:=current_setting('patina.external_install_event',true);
 mutation_marker text:=current_setting('app.ffe_mutation_rpc',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 SELECT fulfilment_id INTO fid FROM public.project_external_fulfilment_events WHERE id=p_event_id;
 f:=public._external_lock(fid);
 SELECT * INTO receipt FROM public.project_external_fulfilment_verifications WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(f.project_id,receipt.verified_by,p_event_id::text,receipt.request_hash);
  RETURN jsonb_build_object('eventId',p_event_id,'status',f.status,'evidenceLevel','verified','replayed',true);
 END IF;
 PERFORM public._external_assert_active(f.project_id,f.package_key);
 -- The fulfilment lock serializes binding changes; item locks precede the
 -- target event lock, including when a transaction began before the reporter.
 IF EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE id=p_event_id AND event_kind='installed') THEN
  PERFORM 1 FROM public.project_ffe_items WHERE external_fulfilment_id=f.id ORDER BY id FOR UPDATE;
 END IF;
 SELECT * INTO STRICT e FROM public.project_external_fulfilment_events WHERE id=p_event_id FOR UPDATE;
 IF e.event_kind='cancelled' AND EXISTS(SELECT 1 FROM public.project_ffe_items WHERE external_fulfilment_id=f.id AND removed_at IS NULL) THEN
  RAISE EXCEPTION 'fulfilment_cancel_lines_live' USING ERRCODE='check_violation';
 END IF;
 IF e.event_kind='fabrication_instruction' THEN RAISE EXCEPTION 'fabrication_instruction_not_verifiable' USING ERRCODE='check_violation'; END IF;
 IF e.evidence_level='verified' THEN RAISE EXCEPTION 'fulfilment_event_already_verified' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF auth.uid()=e.recorded_by OR NOT EXISTS(SELECT 1 FROM public.organization_members m
   WHERE m.organization_id=public.project_recorded_studio(f.project_id) AND m.user_id=auth.uid() AND m.status='active' AND m.role IN ('owner','admin')) THEN
  RAISE EXCEPTION 'fulfilment_verifier_required' USING ERRCODE='insufficient_privilege'; END IF;
 IF e.event_kind='installed' THEN
  blocker:=public._external_install_blocker(f.id);
  IF blocker IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=blocker,ERRCODE='object_not_in_prerequisite_state'; END IF;
 END IF;
 SELECT COALESCE(max(verification_seq),0)+1 INTO seq FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id;
 PERFORM set_config('patina.external_verifier','00875',true);
 UPDATE public.project_external_fulfilment_events SET evidence_level='verified',verified_by=auth.uid(),verified_at=now(),verification_seq=seq WHERE id=e.id;
 PERFORM set_config('patina.external_verifier',COALESCE(marker,''),true);
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilment_verifications(event_id,fulfilment_id,client_request_id,request_hash,verified_by)
 VALUES(e.id,f.id,p_client_request_id,p_event_id::text,auth.uid());
 IF e.event_kind='installed' THEN
  PERFORM set_config('patina.external_install_event',e.id::text,true);
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  -- Retained archived identities must already be installed when restored.
  UPDATE public.project_ffe_items SET status='installed'
   WHERE external_fulfilment_id=f.id AND status IS DISTINCT FROM 'installed';
  PERFORM set_config('app.ffe_mutation_rpc',COALESCE(mutation_marker,''),true);
  PERFORM set_config('patina.external_install_event',COALESCE(install_marker,''),true);
 END IF;
 s:=public._external_refresh_status(f.id);
 PERFORM set_config('patina.external_writer',COALESCE(writer,''),true);
 RETURN jsonb_build_object('eventId',e.id,'status',s,'evidenceLevel','verified','replayed',false);
END $$;

REVOKE ALL ON FUNCTION public._external_install_blocker(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_refresh_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_external_fulfilment_event(uuid,text,jsonb,text[],text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.verify_external_fulfilment_event(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
