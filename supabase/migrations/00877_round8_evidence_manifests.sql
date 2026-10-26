-- 00877 — C1 immutable evidence manifests, not coverage or instruction authority.
-- Member identity reuses native frozen content; no historical backfill.
-- C7 lineage: latest 00874 helper/guard/escalation + project_package only.

ALTER TABLE public.margin_notes DROP CONSTRAINT IF EXISTS margin_notes_subject_kind_check;
ALTER TABLE public.margin_notes ADD CONSTRAINT margin_notes_subject_kind_check
  CHECK (subject_kind IS NULL OR subject_kind IN (
    'ffe_item', 'project_room', 'plan_print', 'plan_issue', 'purchase_order',
    'field_capture', 'coordination_item', 'project_package'));

CREATE OR REPLACE FUNCTION public._subject_project_id(p_kind text, p_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT project_id FROM (
    SELECT project_id FROM public.project_ffe_items WHERE p_kind = 'ffe_item' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.project_rooms WHERE p_kind = 'project_room' AND id = p_id
    UNION ALL
    SELECT s.project_id FROM public.plan_prints p JOIN public.plan_sheets s ON s.id = p.sheet_id
      WHERE p_kind = 'plan_print' AND p.id = p_id
    UNION ALL
    SELECT project_id FROM public.plan_issues WHERE p_kind = 'plan_issue' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.purchase_orders WHERE p_kind = 'purchase_order' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.field_captures WHERE p_kind = 'field_capture' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.client_decisions WHERE p_kind = 'coordination_item' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.project_packages WHERE p_kind = 'project_package' AND id = p_id
  ) subjects;
$$;
REVOKE ALL ON FUNCTION public._subject_project_id(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guard_margin_note_subject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.subject_kind IS NULL AND NEW.subject_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.subject_kind IS NULL OR NEW.subject_id IS NULL
     OR NEW.subject_kind NOT IN ('ffe_item', 'project_room', 'plan_print',
       'plan_issue', 'purchase_order', 'field_capture', 'coordination_item', 'project_package') THEN
    RAISE EXCEPTION 'subject_invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'subject_requires_project' USING ERRCODE = 'check_violation';
  END IF;
  IF public._subject_project_id(NEW.subject_kind, NEW.subject_id) IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'subject_off_project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_margin_note_subject()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS margin_note_subject_guard ON public.margin_notes;
CREATE TRIGGER margin_note_subject_guard BEFORE INSERT OR UPDATE ON public.margin_notes
  FOR EACH ROW EXECUTE FUNCTION public._guard_margin_note_subject();


CREATE OR REPLACE FUNCTION public.escalate_margin_note(p_note_id uuid, p_decision_id uuid)
RETURNS public.client_decisions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_note public.margin_notes%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_relationship_id uuid;
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'note access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT COALESCE((SELECT enabled FROM public.server_capabilities
                  WHERE key = 'margin_note_escalation'), false) THEN
    RAISE EXCEPTION 'margin_note_escalation_inactive' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_note FROM public.margin_notes WHERE id = p_note_id FOR UPDATE;
  IF NOT FOUND OR NOT public.margin_note_tenant_admits(v_note.project_id,
       v_note.proposal_id, v_note.designer_client_id, v_note.designer_id)
     OR NOT (v_note.designer_id = auth.uid() OR public.is_studio_comember(v_note.designer_id)) THEN
    RAISE EXCEPTION 'note access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision_id IS NULL OR v_note.project_id IS NULL THEN
    RAISE EXCEPTION 'project-bound decision required' USING ERRCODE = 'check_violation';
  END IF;
  IF v_note.subject_kind IS NOT NULL AND (
      v_note.subject_kind NOT IN ('ffe_item', 'project_room', 'plan_print',
        'plan_issue', 'purchase_order', 'field_capture', 'coordination_item', 'project_package')
      OR public._subject_project_id(v_note.subject_kind, v_note.subject_id)
         IS DISTINCT FROM v_note.project_id) THEN
    RAISE EXCEPTION 'subject_off_project' USING ERRCODE = 'check_violation';
  END IF;
  IF v_note.escalated_to_decision_id IS NOT NULL THEN
    IF v_note.escalated_to_decision_id IS DISTINCT FROM p_decision_id THEN
      RAISE EXCEPTION 'note already escalated' USING ERRCODE = 'unique_violation';
    END IF;
    SELECT * INTO v_decision FROM public.client_decisions WHERE id = p_decision_id;
    IF NOT FOUND OR v_decision.project_id IS DISTINCT FROM v_note.project_id THEN
      RAISE EXCEPTION 'decision off project' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN v_decision;
  END IF;
  IF v_note.escalated_to_scope_change_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.client_decisions WHERE id = p_decision_id) THEN
    RAISE EXCEPTION 'escalation conflict' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_note.project_id;
  SELECT id INTO STRICT v_relationship_id FROM public.designer_clients
    WHERE designer_id = v_project.designer_id AND client_id = v_project.client_id;
  -- Inherited decision readers can see drafts: never copy private note text.
  -- The designer writes client-facing text in the decision editor before Send.
  v_decision := public.create_client_decision(p_decision_id, jsonb_build_object(
    'designer_client_id', v_relationship_id, 'project_id', v_note.project_id,
    'title', 'Decision from a studio note',
    'context', NULL, 'status', 'draft', 'court', 'designer',
    'blocking_status', 'non_blocking'), '[]'::jsonb, '{}'::uuid[], '{}'::uuid[]);
  UPDATE public.margin_notes SET escalated_to_decision_id = v_decision.id, updated_at = now()
    WHERE id = v_note.id;
  RETURN v_decision;
END;
$$;
REVOKE ALL ON FUNCTION public.escalate_margin_note(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.evidence_manifests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 package_id uuid REFERENCES public.project_packages(id) ON DELETE RESTRICT,
 purpose text NOT NULL CHECK (purpose IN ('fabrication_instruction','service_acceptance','package_issue')),
 members jsonb NOT NULL CHECK (jsonb_typeof(members)='array'),
 manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 idempotency_key text NOT NULL CHECK (btrim(idempotency_key)<>''),
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,idempotency_key),
 UNIQUE NULLS NOT DISTINCT(project_id,package_id,purpose,manifest_hash),
 CHECK (purpose='service_acceptance' OR package_id IS NOT NULL),
 CHECK (purpose='service_acceptance' OR jsonb_array_length(members)>0)
);
CREATE TABLE IF NOT EXISTS public.evidence_manifest_requests (
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 idempotency_key text NOT NULL CHECK (btrim(idempotency_key)<>''),
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 manifest_id uuid NOT NULL REFERENCES public.evidence_manifests(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,idempotency_key)
);
ALTER TABLE public.evidence_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_manifest_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_manifest_read ON public.evidence_manifests;
CREATE POLICY evidence_manifest_read ON public.evidence_manifests FOR SELECT TO authenticated
 USING(public.can_compose_project_plan(project_id));
DROP POLICY IF EXISTS evidence_manifest_read ON public.evidence_manifest_requests;
CREATE POLICY evidence_manifest_read ON public.evidence_manifest_requests FOR SELECT TO authenticated
 USING(public.can_compose_project_plan(project_id));
DROP TRIGGER IF EXISTS evidence_manifest_immutable ON public.evidence_manifests;
CREATE TRIGGER evidence_manifest_immutable BEFORE UPDATE OR DELETE ON public.evidence_manifests
 FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();
DROP TRIGGER IF EXISTS evidence_manifest_immutable ON public.evidence_manifest_requests;
CREATE TRIGGER evidence_manifest_immutable BEFORE UPDATE OR DELETE ON public.evidence_manifest_requests
 FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();
REVOKE ALL ON TABLE public.evidence_manifests FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.evidence_manifest_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.evidence_manifests TO authenticated;
GRANT SELECT ON TABLE public.evidence_manifest_requests TO authenticated;

-- Native evidence is retained by relational RESTRICT FKs, including cascades.
-- Only fixture teardown under session_replication_role=replica may bypass this.
CREATE TABLE IF NOT EXISTS public.evidence_manifest_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 manifest_id uuid NOT NULL REFERENCES public.evidence_manifests(id) ON DELETE RESTRICT,
 plan_issue_id uuid REFERENCES public.plan_issues(id) ON DELETE RESTRICT,
 plan_issue_print_id uuid REFERENCES public.plan_issue_prints(id) ON DELETE RESTRICT,
 plan_print_id uuid REFERENCES public.plan_prints(id) ON DELETE RESTRICT,
 product_configuration_id uuid REFERENCES public.product_configurations(id) ON DELETE RESTRICT,
 custom_commission_revision_id uuid REFERENCES public.custom_commission_revisions(id) ON DELETE RESTRICT,
 review_item_id uuid REFERENCES public.project_review_items(id) ON DELETE RESTRICT,
 approval_artifact_id uuid REFERENCES public.project_approval_artifacts(id) ON DELETE RESTRICT,
 po_spec_snapshot_id uuid REFERENCES public.po_spec_snapshots(id) ON DELETE RESTRICT,
 coordination_item_revision_id uuid REFERENCES public.coordination_item_revisions(id) ON DELETE RESTRICT,
 CHECK (num_nonnulls(plan_issue_id,plan_issue_print_id,plan_print_id,product_configuration_id,custom_commission_revision_id,review_item_id,approval_artifact_id,po_spec_snapshot_id,coordination_item_revision_id)=1)
);
CREATE INDEX IF NOT EXISTS evidence_manifest_members_manifest ON public.evidence_manifest_members(manifest_id);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_plan_issue_id ON public.evidence_manifest_members(plan_issue_id,manifest_id) WHERE plan_issue_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_plan_issue_print_id ON public.evidence_manifest_members(plan_issue_print_id,manifest_id) WHERE plan_issue_print_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_plan_print_id ON public.evidence_manifest_members(plan_print_id,manifest_id) WHERE plan_print_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_product_configuration_id ON public.evidence_manifest_members(product_configuration_id,manifest_id) WHERE product_configuration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_custom_commission_revision_id ON public.evidence_manifest_members(custom_commission_revision_id,manifest_id) WHERE custom_commission_revision_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_review_item_id ON public.evidence_manifest_members(review_item_id,manifest_id) WHERE review_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_approval_artifact_id ON public.evidence_manifest_members(approval_artifact_id,manifest_id) WHERE approval_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_po_spec_snapshot_id ON public.evidence_manifest_members(po_spec_snapshot_id,manifest_id) WHERE po_spec_snapshot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_manifest_members_coordination_item_revision_id ON public.evidence_manifest_members(coordination_item_revision_id,manifest_id) WHERE coordination_item_revision_id IS NOT NULL;
ALTER TABLE public.evidence_manifest_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evidence_manifest_members FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS evidence_manifest_immutable ON public.evidence_manifest_members;
CREATE TRIGGER evidence_manifest_immutable BEFORE UPDATE OR DELETE ON public.evidence_manifest_members
 FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();

-- Do not lock parents from child triggers: mint already holds source FOR SHARE.
-- Preserve native lifecycle-only configuration/revision updates; their content
-- comparisons are the existing 00403 immutability comparisons.
CREATE OR REPLACE FUNCTION public._guard_evidence_member_pinned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pinned boolean; ignored text[]:='{}';
BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='product_configurations' THEN
   ignored:=ARRAY['status','name','updated_at','issued_at','is_library_template','promoted_at','ffe_item_id'];
  ELSIF TG_TABLE_NAME='custom_commission_revisions' THEN
   ignored:=ARRAY['status','issued_at','transition_note','updated_at'];
  END IF;
  IF (to_jsonb(NEW)-ignored) IS NOT DISTINCT FROM (to_jsonb(OLD)-ignored) THEN RETURN NEW; END IF;
 END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.evidence_manifest_members WHERE %I=$1)',TG_ARGV[0])
  INTO pinned USING OLD.id;
 IF pinned THEN
  RAISE EXCEPTION 'evidence_member_pinned' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._guard_evidence_member_pinned() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.plan_issues;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.plan_issues
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('plan_issue_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.plan_issue_prints;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.plan_issue_prints
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('plan_issue_print_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.plan_prints;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.plan_prints
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('plan_print_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.product_configurations;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.product_configurations
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('product_configuration_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.custom_commission_revisions;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.custom_commission_revisions
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('custom_commission_revision_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.project_review_items;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.project_review_items
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('review_item_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.project_approval_artifacts;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.project_approval_artifacts
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('approval_artifact_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.po_spec_snapshots;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.po_spec_snapshots
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('po_spec_snapshot_id');
DROP TRIGGER IF EXISTS a_evidence_member_pinned ON public.coordination_item_revisions;
CREATE TRIGGER a_evidence_member_pinned BEFORE UPDATE OR DELETE ON public.coordination_item_revisions
 FOR EACH ROW EXECUTE FUNCTION public._guard_evidence_member_pinned('coordination_item_revision_id');

-- Resolve and lock one native member. File hashes are re-read from immutable
-- print rows; JSON snapshots use the native canonicalizer, never caller hashes.
CREATE OR REPLACE FUNCTION public._evidence_manifest_member(p_project_id uuid,p_member jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 k text:=p_member->>'kind'; i uuid; r jsonb; j uuid; v jsonb; h text; v_configuration_id uuid; frozen boolean:=true;
BEGIN
 IF jsonb_typeof(p_member) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'manifest_member_invalid' USING ERRCODE='check_violation';
 END IF;
 BEGIN i:=(p_member->>'id')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'manifest_member_invalid' USING ERRCODE='check_violation'; END;
 CASE k
 WHEN 'plan_issue' THEN
  SELECT to_jsonb(t),t.project_id INTO r,j FROM public.plan_issues t WHERE id=i FOR SHARE;
  v:=jsonb_build_object('version',r->'issue_number'); h:=r->>'set_checksum';
 WHEN 'plan_issue_print' THEN
  SELECT to_jsonb(t),s.project_id INTO r,j FROM public.plan_issue_prints t
   JOIN public.plan_issues s ON s.id=t.issue_id WHERE t.id=i FOR SHARE OF t,s;
  v:=jsonb_build_object('rev',r->'rev_letter'); h:=r->>'sha256';
 WHEN 'plan_print' THEN
  SELECT to_jsonb(t),s.project_id INTO r,j FROM public.plan_prints t
   JOIN public.plan_sheets s ON s.id=t.sheet_id WHERE t.id=i FOR SHARE OF t,s;
  v:=jsonb_build_object('rev',r->'rev_letter'); h:=r->>'sha256';
 WHEN 'product_configuration' THEN
  SELECT to_jsonb(t),t.project_id INTO r,j FROM public.product_configurations t WHERE id=i FOR SHARE;
  v:=jsonb_build_object('version',r->'version');
  frozen:=(r->>'status') IN ('approved','issued','superseded','archived');
  h:=public._configuration_snapshot_hash(r->'snapshot');
  IF h IS DISTINCT FROM r->>'snapshot_hash' THEN frozen:=false; END IF;
 WHEN 'custom_commission_revision' THEN
  SELECT t.configuration_id INTO v_configuration_id FROM public.custom_commission_revisions t WHERE t.id=i;
  SELECT c.project_id INTO j FROM public.product_configurations c WHERE c.id=v_configuration_id FOR SHARE;
  SELECT to_jsonb(t) INTO r FROM public.custom_commission_revisions t
   WHERE t.id=i AND t.configuration_id=v_configuration_id FOR SHARE;
  v:=jsonb_build_object('rev',r->'revision_number'); frozen:=(r->>'status') IN ('approved','issued');
  h:=encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object(
   'configurationId',r->'configuration_id','revision',r->'revision_number',
   'brief',r->'brief','drawings',r->'drawings','quote',r->'quote','provenance',r->'provenance')),'sha256'),'hex');
 WHEN 'review_item' THEN
  SELECT to_jsonb(t),s.project_id,jsonb_build_object('version',s.edition_number),s.status<>'draft'
   INTO r,j,v,frozen FROM public.project_review_items t JOIN public.project_review_editions s
   ON s.id=t.edition_id WHERE t.id=i FOR SHARE OF t,s;
  h:=r->>'content_hash';
 WHEN 'approval_artifact' THEN
  SELECT to_jsonb(t),t.project_id INTO r,j FROM public.project_approval_artifacts t WHERE id=i FOR SHARE;
  v:=jsonb_build_object('version',r->'source_version'); h:=r->>'artifact_hash';
 WHEN 'po_spec_snapshot' THEN
  SELECT to_jsonb(t),s.project_id INTO r,j FROM public.po_spec_snapshots t
   JOIN public.purchase_orders s ON s.id=t.purchase_order_id WHERE t.id=i FOR SHARE OF t,s;
  v:=jsonb_build_object('rev',r->'revision');
  h:=encode(extensions.digest(public._plan_room_canonical_json(r->'spec'),'sha256'),'hex');
 WHEN 'coordination_item_revision' THEN
  SELECT to_jsonb(t),s.project_id INTO r,j FROM public.coordination_item_revisions t
   JOIN public.client_decisions s ON s.id=t.decision_id WHERE t.id=i FOR SHARE OF t,s;
  v:=jsonb_build_object('rev',r->'rev_number'); frozen:=(r->>'status')='approved';
  h:=encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object(
   'decisionId',r->'decision_id','rev',r->'rev_number','attachments',r->'attachments','note',r->'note')),'sha256'),'hex');
 ELSE RAISE EXCEPTION 'manifest_member_not_frozen' USING ERRCODE='check_violation';
 END CASE;
 IF r IS NULL OR j IS DISTINCT FROM p_project_id THEN
  RAISE EXCEPTION 'manifest_member_off_project' USING ERRCODE='check_violation';
 END IF;
 IF frozen IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'manifest_member_not_frozen' USING ERRCODE='check_violation';
 END IF;
 IF NOT (p_member @> v) OR h IS NULL OR h !~ '^[0-9a-f]{64}$'
    OR p_member->>'sha256' IS DISTINCT FROM h THEN
  RAISE EXCEPTION 'manifest_member_identity_mismatch' USING ERRCODE='check_violation';
 END IF;
 RETURN jsonb_build_object('kind',k,'id',i,'sha256',h)||v;
END $$;
REVOKE ALL ON FUNCTION public._evidence_manifest_member(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_evidence_manifest(
 p_project_id uuid,p_package_id uuid,p_purpose text,p_members jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 m jsonb; members jsonb:='[]'; mh text; rh text; manifest public.evidence_manifests%ROWTYPE;
 receipt public.evidence_manifest_requests%ROWTYPE; pkg public.project_packages%ROWTYPE;
 minted boolean:=false;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR KEY SHARE;
 IF NOT FOUND OR NOT public.can_compose_project_plan(p_project_id) THEN
  RAISE EXCEPTION 'manifest_access_denied' USING ERRCODE='insufficient_privilege';
 END IF;
 -- Shared C5 serialization precedes package/member locks (native placement 00808/00809).
 PERFORM public._ffe_lock_job_labels(p_project_id);
 IF p_purpose IS NULL OR p_purpose NOT IN ('fabrication_instruction','service_acceptance','package_issue')
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key)='' OR jsonb_typeof(p_members) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'manifest_request_invalid' USING ERRCODE='check_violation';
 END IF;
 IF p_package_id IS NULL AND p_purpose<>'service_acceptance' THEN
  RAISE EXCEPTION 'manifest_package_required' USING ERRCODE='check_violation'; END IF;
 IF p_package_id IS NOT NULL THEN
  SELECT * INTO pkg FROM public.project_packages WHERE id=p_package_id FOR SHARE;
  IF NOT FOUND OR pkg.project_id IS DISTINCT FROM p_project_id OR pkg.archived_at IS NOT NULL THEN
   RAISE EXCEPTION 'manifest_package_off_project' USING ERRCODE='check_violation'; END IF;
 END IF;
 IF p_purpose<>'service_acceptance' AND jsonb_array_length(p_members)=0 THEN
  RAISE EXCEPTION 'manifest_members_empty' USING ERRCODE='check_violation'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_members) e GROUP BY e->>'kind', (e->>'id')::uuid HAVING count(*)>1) THEN
  RAISE EXCEPTION 'manifest_member_duplicate' USING ERRCODE='check_violation'; END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(p_members) ORDER BY value->>'kind',(value->>'id')::uuid LOOP
  members:=members||jsonb_build_array(public._evidence_manifest_member(p_project_id,m));
 END LOOP;
 mh:=encode(extensions.digest(public._plan_room_canonical_json(members),'sha256'),'hex');
 rh:=encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object(
  'projectId',p_project_id,'packageId',p_package_id,'purpose',p_purpose,'manifestHash',mh)),'sha256'),'hex');
 SELECT * INTO receipt FROM public.evidence_manifest_requests WHERE project_id=p_project_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF receipt.request_hash<>rh THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='unique_violation'; END IF;
  SELECT * INTO STRICT manifest FROM public.evidence_manifests WHERE id=receipt.manifest_id;
 ELSE
  INSERT INTO public.evidence_manifests(project_id,package_id,purpose,members,manifest_hash,request_hash,idempotency_key,created_by)
   VALUES(p_project_id,p_package_id,p_purpose,members,mh,rh,p_idempotency_key,auth.uid())
   ON CONFLICT DO NOTHING RETURNING * INTO manifest;
  minted:=FOUND;
  IF minted THEN
   INSERT INTO public.evidence_manifest_members(manifest_id,plan_issue_id,plan_issue_print_id,plan_print_id,product_configuration_id,custom_commission_revision_id,review_item_id,approval_artifact_id,po_spec_snapshot_id,coordination_item_revision_id)
    SELECT manifest.id,
     CASE WHEN value->>'kind'='plan_issue' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='plan_issue_print' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='plan_print' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='product_configuration' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='custom_commission_revision' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='review_item' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='approval_artifact' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='po_spec_snapshot' THEN (value->>'id')::uuid END,
     CASE WHEN value->>'kind'='coordination_item_revision' THEN (value->>'id')::uuid END
    FROM jsonb_array_elements(members);
  END IF;
  IF NOT minted THEN
   -- A concurrent same-key call must be compared before accepting dedupe.
   SELECT * INTO receipt FROM public.evidence_manifest_requests WHERE project_id=p_project_id AND idempotency_key=p_idempotency_key;
   IF FOUND AND receipt.request_hash<>rh THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='unique_violation'; END IF;
   SELECT * INTO manifest FROM public.evidence_manifests WHERE project_id=p_project_id AND package_id IS NOT DISTINCT FROM p_package_id
    AND purpose=p_purpose AND manifest_hash=mh;
   IF NOT FOUND THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='unique_violation'; END IF;
  END IF;
  INSERT INTO public.evidence_manifest_requests(project_id,idempotency_key,request_hash,manifest_id,created_by)
   VALUES(p_project_id,p_idempotency_key,rh,manifest.id,auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT receipt FROM public.evidence_manifest_requests WHERE project_id=p_project_id AND idempotency_key=p_idempotency_key;
  IF receipt.request_hash<>rh THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='unique_violation'; END IF;
 END IF;
 RETURN jsonb_build_object('manifestId',manifest.id,'manifestHash',mh,'replayed',NOT minted);
END $$;
REVOKE ALL ON FUNCTION public.create_evidence_manifest(uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_evidence_manifest(uuid,uuid,text,jsonb,text) TO service_role;
