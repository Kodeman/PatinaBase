-- 00875 — C5 external fulfilment foundation.
-- Additive over 00868–00871; no native writer is replaced. The only live
-- submittal approval writer is 00808 _resolve_coordination_item_authorized:
-- job-label lock → decision FOR UPDATE → revision approved (never reversed).
-- Capability remains false; X02 owns presence/parity, X04b owns instructions.

CREATE OR REPLACE FUNCTION public._external_units_valid(p_units text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
 SELECT COALESCE(cardinality(p_units)>0 AND array_ndims(p_units)=1
   AND NOT EXISTS (SELECT 1 FROM unnest(p_units) u WHERE u IS NULL OR u !~ '^[a-z0-9][a-z0-9-]{0,31}$')
   AND cardinality(p_units)=(SELECT count(DISTINCT u) FROM unnest(p_units) u),false);
$$;

CREATE TABLE IF NOT EXISTS public.project_external_fulfilments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 scope_edition_id uuid NOT NULL,
 package_key text NOT NULL CHECK (package_key ~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
 units text[] NOT NULL CHECK (public._external_units_valid(units)),
 kind text NOT NULL CHECK (kind IN ('gc_cabinetry','client_furnishing','other_external')),
 buyer_party_kind text NOT NULL CHECK (buyer_party_kind IN ('client','gc','other')),
 payer_party_kind text NOT NULL CHECK (payer_party_kind IN ('client','gc','other')),
 contracting_party_kind text NOT NULL CHECK (contracting_party_kind IN ('client','gc','other','none')),
 party_engagement_id uuid REFERENCES public.project_parties(id) ON DELETE RESTRICT,
 configuration_id uuid REFERENCES public.product_configurations(id) ON DELETE RESTRICT,
 reported_price_cents integer CHECK (reported_price_cents>=0),
 price_visibility text NOT NULL DEFAULT 'studio_only' CHECK (price_visibility IN ('client_visible','studio_only')),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','contracted','issued','instructed','received','installed','cancelled')),
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 client_request_id text NOT NULL CHECK (length(btrim(client_request_id))>0),
 request_hash text NOT NULL,
 UNIQUE (project_id,client_request_id),
 FOREIGN KEY (scope_edition_id,package_key) REFERENCES public.project_scope_edition_packages(edition_id,package_key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS external_fulfilments_project_package ON public.project_external_fulfilments(project_id,package_key);

CREATE TABLE IF NOT EXISTS public.project_external_fulfilment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fulfilment_id uuid NOT NULL REFERENCES public.project_external_fulfilments(id) ON DELETE RESTRICT,
 event_kind text NOT NULL CHECK (event_kind IN ('quote_reported','contract_reported','package_issued','fabrication_instruction','hold','release_hold','received','installed','cancelled')),
 evidence_level text NOT NULL DEFAULT 'reported' CHECK (evidence_level IN ('reported','verified')),
 evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
 affected_units text[],
 releases_event_id uuid REFERENCES public.project_external_fulfilment_events(id) ON DELETE RESTRICT,
 plan_issue_id uuid REFERENCES public.plan_issues(id) ON DELETE RESTRICT,
 authority_id uuid,
 manifest_id uuid,
 manifest_hash text,
 amount_cents integer CHECK (amount_cents>=0),
 actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 evidence_route text,
 coverage jsonb,
 recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 verified_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 verified_at timestamptz,
 event_seq bigint NOT NULL CHECK (event_seq>=1),
 verification_seq bigint CHECK (verification_seq>=1),
 client_request_id text NOT NULL CHECK (length(btrim(client_request_id))>0),
 request_hash text NOT NULL,
 UNIQUE (fulfilment_id,client_request_id),
 UNIQUE (fulfilment_id,event_seq),
 CHECK ((evidence_level='verified' AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND verification_seq IS NOT NULL)
     OR (evidence_level='reported' AND verified_by IS NULL AND verified_at IS NULL AND verification_seq IS NULL)),
 CHECK ((event_kind IN ('hold','fabrication_instruction') AND public._external_units_valid(affected_units))
     OR (event_kind NOT IN ('hold','fabrication_instruction') AND affected_units IS NULL)),
 CHECK ((event_kind='release_hold')=(releases_event_id IS NOT NULL)),
 CHECK ((event_kind='package_issued')=(plan_issue_id IS NOT NULL)),
 -- No instruction writer exists before the shared C3 gate lands.
 CONSTRAINT external_instruction_not_active CHECK (event_kind<>'fabrication_instruction'),
 CHECK (authority_id IS NULL AND manifest_id IS NULL AND manifest_hash IS NULL AND amount_cents IS NULL
        AND actor_id IS NULL AND evidence_route IS NULL AND coverage IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_event_verification_seq ON public.project_external_fulfilment_events(fulfilment_id,verification_seq) WHERE verification_seq IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS external_hold_release_once ON public.project_external_fulfilment_events(releases_event_id) WHERE releases_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_external_fulfilment_evidence_bindings (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 fulfilment_id uuid NOT NULL REFERENCES public.project_external_fulfilments(id) ON DELETE RESTRICT,
 decision_id uuid NOT NULL REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
 units text[] NOT NULL CHECK (public._external_units_valid(units)),
 covers_plan_issue_id uuid REFERENCES public.plan_issues(id) ON DELETE RESTRICT,
 covers_configuration_snapshot_hash text CHECK (covers_configuration_snapshot_hash ~ '^[0-9a-f]{64}$'),
 bound_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 bound_at timestamptz NOT NULL DEFAULT now(),
 client_request_id text NOT NULL CHECK (length(btrim(client_request_id))>0),
 request_hash text NOT NULL,
 PRIMARY KEY (fulfilment_id,decision_id),
 UNIQUE (fulfilment_id,client_request_id)
);

-- Separate immutable receipts keep the event's one permitted UPDATE restricted
-- to the verified tuple; verification retries never modify the event payload.
CREATE TABLE IF NOT EXISTS public.project_external_fulfilment_verifications (
 event_id uuid PRIMARY KEY REFERENCES public.project_external_fulfilment_events(id) ON DELETE RESTRICT,
 fulfilment_id uuid NOT NULL REFERENCES public.project_external_fulfilments(id) ON DELETE RESTRICT,
 client_request_id text NOT NULL CHECK (length(btrim(client_request_id))>0),
 request_hash text NOT NULL,
 verified_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 UNIQUE (fulfilment_id,client_request_id)
);

CREATE OR REPLACE FUNCTION public._external_rail_refusal(p_edition_id uuid,p_package_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT CASE
   WHEN p.responsibilities->>'purchasing'='studio' THEN 'external_rail_studio_buyer'
   WHEN p.responsibilities->>'payer'='studio' OR p.responsibilities->>'fabrication_contract'='studio' THEN 'external_rail_studio_liability'
   WHEN p.responsibilities->>'payer'='none' THEN 'external_rail_payer_unknown'
   WHEN p.inclusion='included' AND p.responsibilities->>'purchasing' IN ('client','gc','other')
     AND p.responsibilities->>'payer' IN ('client','gc','other')
     AND p.responsibilities->>'fabrication_contract' IN ('client','gc','other','none') THEN NULL
   ELSE 'external_rail_responsibilities_invalid' END
 FROM (SELECT 1) seed LEFT JOIN public.project_scope_edition_packages p
 ON p.edition_id=p_edition_id AND p.package_key=p_package_key;
$$;

CREATE OR REPLACE FUNCTION public._fabrication_instructed_amount_cents(p_fulfilment_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT CASE WHEN jsonb_typeof(e.evidence->'contractAmountCents')='number'
     AND (e.evidence->>'contractAmountCents') ~ '^[0-9]+$'
     AND (e.evidence->>'contractAmountCents')::numeric<=2147483647
   THEN (e.evidence->>'contractAmountCents')::integer END
 FROM public.project_external_fulfilment_events e
 WHERE e.fulfilment_id=p_fulfilment_id AND e.event_kind='contract_reported' AND e.evidence_level='verified'
 ORDER BY e.verification_seq DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._external_assert_access(p_project_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF NOT COALESCE(public.can_compose_project_plan(p_project_id),false) THEN
  RAISE EXCEPTION 'external_fulfilment_access' USING ERRCODE='insufficient_privilege';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public._external_assert_replay(p_project_id uuid,p_requester uuid,p_hash text,p_stored_hash text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF auth.uid() IS DISTINCT FROM p_requester THEN
  RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='insufficient_privilege';
 END IF;
 PERFORM public._external_assert_access(p_project_id);
 IF p_hash IS DISTINCT FROM p_stored_hash THEN
  RAISE EXCEPTION 'external_request_changed' USING ERRCODE='serialization_failure';
 END IF;
END $$;

-- Take the active/latest edition BEFORE the fulfilment. Exact receipt replays
-- skip active/rail validation but retain this prefix and current authorization.
CREATE OR REPLACE FUNCTION public._external_lock(p_fulfilment_id uuid)
RETURNS public.project_external_fulfilments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; p uuid;
BEGIN
 SELECT project_id INTO p FROM public.project_external_fulfilments WHERE id=p_fulfilment_id;
 PERFORM public._external_assert_access(p);
 PERFORM public._ffe_lock_job_labels(p);
 PERFORM 1 FROM public.project_scope_editions WHERE id=(SELECT id FROM public.project_scope_editions
  WHERE project_id=p ORDER BY (status='active') DESC,edition_number DESC LIMIT 1) FOR SHARE;
 SELECT * INTO STRICT f FROM public.project_external_fulfilments WHERE id=p_fulfilment_id FOR UPDATE;
 RETURN f;
END $$;

CREATE OR REPLACE FUNCTION public._external_assert_active(p_project_id uuid,p_package_key text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ed uuid; refusal text;
BEGIN
 SELECT id INTO ed FROM public.project_scope_editions WHERE project_id=p_project_id AND status='active';
 IF ed IS NULL THEN RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 refusal:=public._external_rail_refusal(ed,p_package_key);
 IF refusal IS NOT NULL THEN RAISE EXCEPTION '%',refusal USING ERRCODE='check_violation'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public._external_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' AND current_setting('patina.external_writer',true)='00875' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='project_external_fulfilment_events' THEN
  IF current_setting('patina.external_verifier',true)='00875'
   AND OLD.evidence_level='reported' AND NEW.evidence_level='verified'
   AND OLD.verified_by IS NULL AND OLD.verified_at IS NULL AND OLD.verification_seq IS NULL
   AND NEW.verified_by IS NOT NULL AND NEW.verified_at=now() AND NEW.verification_seq IS NOT NULL
   AND (to_jsonb(NEW)-ARRAY['evidence_level','verified_by','verified_at','verification_seq'])
       =(to_jsonb(OLD)-ARRAY['evidence_level','verified_by','verified_at','verification_seq']) THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='project_external_fulfilments'
   AND current_setting('patina.external_writer',true)='00875'
   AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'external_fulfilment_immutable' USING ERRCODE='check_violation';
END $$;

CREATE OR REPLACE FUNCTION public._external_refresh_status(p_fulfilment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s text; old_marker text:=current_setting('patina.external_writer',true);
BEGIN
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events e WHERE e.fulfilment_id=p_fulfilment_id AND e.event_kind='cancelled'
   AND (e.evidence_level='verified' OR NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events c WHERE c.fulfilment_id=p_fulfilment_id AND c.event_kind='contract_reported'))) THEN 'cancelled'
  WHEN EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=p_fulfilment_id AND event_kind='installed' AND evidence_level='verified') THEN 'installed'
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

CREATE OR REPLACE FUNCTION public.create_external_fulfilment(
 p_project_id uuid,p_scope_edition_id uuid,p_package_key text,p_kind text,p_units text[],
 p_party_engagement_id uuid,p_configuration_id uuid,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; ed public.project_scope_editions%ROWTYPE;
 r jsonb; h text; marker text:=current_setting('patina.external_writer',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 PERFORM public._external_assert_access(p_project_id);
 h:=encode(extensions.digest(jsonb_build_array(p_project_id,p_scope_edition_id,p_package_key,p_kind,p_units,p_party_engagement_id,p_configuration_id)::text,'sha256'),'hex');
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 PERFORM public._ffe_lock_job_labels(p_project_id);
 SELECT * INTO f FROM public.project_external_fulfilments WHERE project_id=p_project_id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(p_project_id,f.created_by,h,f.request_hash);
  RETURN jsonb_build_object('fulfilmentId',f.id,'status',f.status,'units',f.units,'replayed',true);
 END IF;
 SELECT * INTO ed FROM public.project_scope_editions WHERE project_id=p_project_id AND status='active' FOR SHARE;
 IF ed.id IS DISTINCT FROM p_scope_edition_id THEN RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 PERFORM public._external_assert_active(p_project_id,p_package_key);
 IF NOT public._external_units_valid(p_units) THEN RAISE EXCEPTION 'fulfilment_units_invalid' USING ERRCODE='check_violation'; END IF;
 IF p_party_engagement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_parties WHERE id=p_party_engagement_id AND project_id=p_project_id) THEN
  RAISE EXCEPTION 'external_party_off_project' USING ERRCODE='check_violation'; END IF;
 IF p_configuration_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_configurations WHERE id=p_configuration_id AND project_id=p_project_id) THEN
  RAISE EXCEPTION 'external_configuration_off_project' USING ERRCODE='check_violation'; END IF;
 SELECT responsibilities INTO r FROM public.project_scope_edition_packages WHERE edition_id=ed.id AND package_key=p_package_key;
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilments(project_id,scope_edition_id,package_key,units,kind,buyer_party_kind,payer_party_kind,contracting_party_kind,
   party_engagement_id,configuration_id,created_by,client_request_id,request_hash)
 VALUES(p_project_id,ed.id,p_package_key,p_units,p_kind,r->>'purchasing',r->>'payer',r->>'fabrication_contract',
   p_party_engagement_id,p_configuration_id,auth.uid(),p_client_request_id,h) RETURNING * INTO f;
 PERFORM set_config('patina.external_writer',COALESCE(marker,''),true);
 RETURN jsonb_build_object('fulfilmentId',f.id,'status',f.status,'units',f.units,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.record_external_fulfilment_event(
 p_fulfilment_id uuid,p_event_kind text,p_evidence jsonb,p_affected_units text[],p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 held public.project_external_fulfilment_events%ROWTYPE; h text; seq bigint; s text;
 marker text:=current_setting('patina.external_writer',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 f:=public._external_lock(p_fulfilment_id);
 h:=encode(extensions.digest(jsonb_build_array(p_event_kind,p_evidence,p_affected_units)::text,'sha256'),'hex');
 SELECT * INTO e FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(f.project_id,e.recorded_by,h,e.request_hash);
  RETURN jsonb_build_object('eventId',e.id,'status',f.status,'evidenceLevel',e.evidence_level,'replayed',true);
 END IF;
 IF p_event_kind='fabrication_instruction' THEN RAISE EXCEPTION 'fabrication_instruction_not_active' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF p_event_kind='package_issued' THEN RAISE EXCEPTION 'package_issue_owner_required' USING ERRCODE='insufficient_privilege'; END IF;
 IF f.status IN ('installed','cancelled') THEN RAISE EXCEPTION 'fulfilment_terminal' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NOT (p_event_kind='cancelled' AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND event_kind='contract_reported')) THEN
  PERFORM public._external_assert_active(f.project_id,f.package_key);
 END IF;
 -- X02 adds the live-presence-line cancellation guard before activation.
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

CREATE OR REPLACE FUNCTION public.verify_external_fulfilment_event(p_event_id uuid,p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; e public.project_external_fulfilment_events%ROWTYPE;
 receipt public.project_external_fulfilment_verifications%ROWTYPE; fid uuid; seq bigint; s text;
 marker text:=current_setting('patina.external_verifier',true); writer text:=current_setting('patina.external_writer',true);
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
 SELECT * INTO STRICT e FROM public.project_external_fulfilment_events WHERE id=p_event_id FOR UPDATE;
 IF e.event_kind='fabrication_instruction' THEN RAISE EXCEPTION 'fabrication_instruction_not_verifiable' USING ERRCODE='check_violation'; END IF;
 IF e.evidence_level='verified' THEN RAISE EXCEPTION 'fulfilment_event_already_verified' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF auth.uid()=e.recorded_by OR NOT EXISTS(SELECT 1 FROM public.organization_members m
   WHERE m.organization_id=public.project_recorded_studio(f.project_id) AND m.user_id=auth.uid() AND m.status='active' AND m.role IN ('owner','admin')) THEN
  RAISE EXCEPTION 'fulfilment_verifier_required' USING ERRCODE='insufficient_privilege'; END IF;
 SELECT COALESCE(max(verification_seq),0)+1 INTO seq FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id;
 PERFORM set_config('patina.external_verifier','00875',true);
 UPDATE public.project_external_fulfilment_events SET evidence_level='verified',verified_by=auth.uid(),verified_at=now(),verification_seq=seq WHERE id=e.id;
 PERFORM set_config('patina.external_verifier',COALESCE(marker,''),true);
 PERFORM set_config('patina.external_writer','00875',true);
 INSERT INTO public.project_external_fulfilment_verifications(event_id,fulfilment_id,client_request_id,request_hash,verified_by)
 VALUES(e.id,f.id,p_client_request_id,p_event_id::text,auth.uid());
 s:=public._external_refresh_status(f.id);
 PERFORM set_config('patina.external_writer',COALESCE(writer,''),true);
 RETURN jsonb_build_object('eventId',e.id,'status',s,'evidenceLevel','verified','replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.bind_fulfilment_evidence(p_fulfilment_id uuid,p_decision_id uuid,p_units text[],p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.project_external_fulfilments%ROWTYPE; b public.project_external_fulfilment_evidence_bindings%ROWTYPE;
 d public.client_decisions%ROWTYPE; h text; issue uuid; snapshot text; marker text:=current_setting('patina.external_writer',true);
BEGIN
 PERFORM public._assert_scope_composition_enabled();
 f:=public._external_lock(p_fulfilment_id);
 h:=encode(extensions.digest(jsonb_build_array(p_decision_id,p_units)::text,'sha256'),'hex');
 SELECT * INTO b FROM public.project_external_fulfilment_evidence_bindings WHERE fulfilment_id=f.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
  PERFORM public._external_assert_replay(f.project_id,b.bound_by,h,b.request_hash);
 ELSE
  PERFORM public._external_assert_active(f.project_id,f.package_key);
  IF f.status='cancelled' THEN RAISE EXCEPTION 'fulfilment_terminal' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  IF NOT public._external_units_valid(p_units) OR NOT p_units<@f.units THEN RAISE EXCEPTION 'fulfilment_units_invalid' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO d FROM public.client_decisions WHERE id=p_decision_id FOR SHARE;
  IF d.project_id IS DISTINCT FROM f.project_id OR d.coordination_kind IS DISTINCT FROM 'submittal' THEN
   RAISE EXCEPTION 'fabrication_evidence_off_project' USING ERRCODE='check_violation'; END IF;
  IF EXISTS(SELECT 1 FROM public.coordination_item_revisions WHERE decision_id=d.id AND status='approved') THEN
   RAISE EXCEPTION 'fabrication_evidence_already_approved' USING ERRCODE='check_violation'; END IF;
  IF f.kind='gc_cabinetry' THEN
   SELECT plan_issue_id INTO issue FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id AND event_kind='package_issued' ORDER BY event_seq DESC LIMIT 1;
   IF issue IS NULL THEN RAISE EXCEPTION 'fabrication_evidence_issue_missing' USING ERRCODE='check_violation'; END IF;
  END IF;
  IF f.configuration_id IS NOT NULL THEN
   SELECT snapshot_hash INTO snapshot FROM public.product_configurations WHERE id=f.configuration_id AND project_id=f.project_id FOR SHARE;
   IF snapshot IS NULL THEN RAISE EXCEPTION 'external_configuration_off_project' USING ERRCODE='check_violation'; END IF;
  END IF;
  PERFORM set_config('patina.external_writer','00875',true);
  INSERT INTO public.project_external_fulfilment_evidence_bindings(fulfilment_id,decision_id,units,covers_plan_issue_id,covers_configuration_snapshot_hash,bound_by,client_request_id,request_hash)
  VALUES(f.id,d.id,p_units,issue,snapshot,auth.uid(),p_client_request_id,h) RETURNING * INTO b;
  PERFORM set_config('patina.external_writer',COALESCE(marker,''),true);
  RETURN jsonb_build_object('bindingId',b.id,'units',b.units,'coversPlanIssueId',b.covers_plan_issue_id,'coversConfigurationSnapshotHash',b.covers_configuration_snapshot_hash,'boundAt',b.bound_at,'replayed',false);
 END IF;
 RETURN jsonb_build_object('bindingId',b.id,'units',b.units,'coversPlanIssueId',b.covers_plan_issue_id,'coversConfigurationSnapshotHash',b.covers_configuration_snapshot_hash,'boundAt',b.bound_at,'replayed',true);
END $$;

CREATE OR REPLACE FUNCTION public.get_project_external_fulfilments(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 PERFORM public._external_assert_access(p_project_id);
 RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id),'[]'::jsonb)
   FROM public.project_external_fulfilments f WHERE f.project_id=p_project_id);
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['project_external_fulfilments','project_external_fulfilment_events','project_external_fulfilment_evidence_bindings','project_external_fulfilment_verifications'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP TRIGGER IF EXISTS external_immutable ON public.%I',t);
  EXECUTE format('CREATE TRIGGER external_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._external_guard()',t);
 END LOOP;
END $$;

-- Keep ACLs top-level so the legacy-grants seed extractor preserves them.
REVOKE ALL ON TABLE public.project_external_fulfilments FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.project_external_fulfilment_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.project_external_fulfilment_evidence_bindings FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.project_external_fulfilment_verifications FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_units_valid(text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_rail_refusal(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._fabrication_instructed_amount_cents(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_assert_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_assert_replay(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_lock(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_assert_active(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._external_refresh_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_external_fulfilment_event(uuid,text,jsonb,text[],text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.verify_external_fulfilment_event(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bind_fulfilment_evidence(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_project_external_fulfilments(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_external_fulfilments(uuid) TO authenticated;
