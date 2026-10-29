-- 00869 — C2 staged scope execution (B02a).
-- Foundation: 00868. Native graft lineage: countersign 00619; send 00837;
-- addendum creation 00816; copy parts 00577; normalizer 00868.
-- Money bodies remain native. No downstream acceptance/external-work acts exist
-- at this stage. Activation and their transactional extensions have other owners.

CREATE OR REPLACE FUNCTION public._validate_scope_signer_parts(p_proposal_id uuid, p_parts jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  policy jsonb; signer jsonb; proposal public.proposals%ROWTYPE;
  slots text[] := '{}'; people text[] := '{}'; person text; profile uuid; contact uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_parts) p WHERE p->>'kind' = 'acceptance_signer_policy') THEN RETURN; END IF;
  PERFORM public._assert_scope_composition_enabled();
  IF NOT public.can_author_scope_proposal(p_proposal_id) THEN
    RAISE EXCEPTION 'scope_proposal_access_denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT proposal FROM public.proposals WHERE id = p_proposal_id;
  IF (SELECT count(*) FROM jsonb_array_elements(p_parts) p WHERE p->>'kind' = 'acceptance_signer_policy') <> 1 THEN
    RAISE EXCEPTION 'scope_signer_policy_duplicate' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p->'payload' INTO policy FROM jsonb_array_elements(p_parts) p WHERE p->>'kind' = 'acceptance_signer_policy';
  IF jsonb_typeof(policy) IS DISTINCT FROM 'object'
     OR jsonb_typeof(policy->'policyRevision') IS DISTINCT FROM 'number'
     OR COALESCE(policy->>'policyRevision','') !~ '^[1-9][0-9]{0,8}$'
     OR jsonb_typeof(policy->'signers') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'scope_signer_policy_invalid' USING ERRCODE = 'check_violation';
  END IF;
  FOR signer IN SELECT value FROM jsonb_array_elements(policy->'signers') LOOP
    IF jsonb_typeof(signer) IS DISTINCT FROM 'object'
       OR jsonb_typeof(signer->'slot') IS DISTINCT FROM 'string'
       OR btrim(COALESCE(signer->>'slot','')) = ''
       OR jsonb_typeof(signer->'required') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'scope_signer_policy_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF signer->>'slot' = ANY(slots) THEN
      RAISE EXCEPTION 'scope_signer_slot_duplicate' USING ERRCODE = 'check_violation';
    END IF;
    slots := array_append(slots, signer->>'slot');
    IF ((signer->>'profileId') IS NULL) = ((signer->>'householdPersonId') IS NULL) THEN
      RAISE EXCEPTION 'scope_signer_reference_invalid' USING ERRCODE = 'check_violation';
    END IF;
    BEGIN
      profile := (signer->>'profileId')::uuid;
      contact := (signer->>'householdPersonId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'scope_signer_reference_invalid' USING ERRCODE = 'check_violation';
    END;
    IF profile IS NOT NULL AND profile = proposal.client_id THEN
      person := 'profile:' || profile;
    ELSE
      -- designer_clients.household_id is the exact client's household, not
      -- another household that happens to share a designer or a studio.
      SELECT 'profile:' || sc.profile_id INTO person
      FROM public.designer_clients dc
      JOIN public.client_households h ON h.id = dc.household_id
      JOIN public.studio_contacts sc ON sc.id = ANY(h.member_person_ids)
      WHERE dc.id = proposal.designer_client_id AND dc.client_id = proposal.client_id
        AND dc.designer_id = proposal.designer_id AND h.organization_id = proposal.studio_id
        AND sc.organization_id = h.organization_id AND sc.entity_kind = 'person'
        AND sc.merged_into IS NULL
        AND ((profile IS NOT NULL AND sc.profile_id = profile) OR (contact IS NOT NULL AND sc.id = contact));
      IF NOT FOUND THEN
        RAISE EXCEPTION 'scope_signer_outside_household' USING ERRCODE = 'check_violation';
      END IF;
      person := COALESCE(person, 'contact:' || contact);
    END IF;
    IF person = ANY(people) THEN
      RAISE EXCEPTION 'scope_signer_person_duplicate' USING ERRCODE = 'check_violation';
    END IF;
    people := array_append(people, person);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._validate_scope_signer_parts(uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- An amendment keeps every predecessor key. The mint independently repeats
-- this check against its locked predecessor rather than trusting a draft act.
CREATE OR REPLACE FUNCTION public._validate_scope_retained_parts(p_proposal_id uuid, p_parts jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.proposals pr
    JOIN public.project_scope_edition_packages pk ON pk.edition_id = pr.drafted_against_scope_edition_id
    WHERE pr.id = p_proposal_id AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_parts) p
      WHERE p->>'kind' = 'scope_package' AND p->'payload'->>'packageKey' = pk.package_key)
  ) THEN RAISE EXCEPTION 'scope_package_key_dropped' USING ERRCODE = 'check_violation'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._validate_scope_retained_parts(uuid,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._scope_parts_from_edition(p_edition_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(part ORDER BY part->>'partKey'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('kind','scope_package','partKey','scope.'||p.package_key,
      'title',p.label,'payload',jsonb_build_object('packageKey',p.package_key,'label',p.label,
        'roomIds',p.room_ids,'inclusion',p.inclusion,'conditionText',p.condition_text,
        'responsibilities',p.responsibilities,'overrideOf',p.override_of)
        || CASE WHEN p.provenance='{}'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('provenance',p.provenance) END) part
    FROM public.project_scope_edition_packages p WHERE p.edition_id = p_edition_id
    UNION ALL
    SELECT jsonb_build_object('kind','acceptance_signer_policy','partKey','scope.signers',
      'title','Acceptance signers','payload',e.content->'signerPolicy')
    FROM public.project_scope_editions e WHERE e.id = p_edition_id
      AND e.content->'signerPolicy' IS DISTINCT FROM 'null'::jsonb AND e.content ? 'signerPolicy'
  ) parts;
$$;
REVOKE ALL ON FUNCTION public._scope_parts_from_edition(uuid) FROM PUBLIC, anon, authenticated;

-- Only design-service documents traversing countersign participate. Trade and
-- furnishings execution and their invoice writers retain their native bodies.
-- Historical ordering is labelled, never used as an authoritative replay order.
INSERT INTO public.project_commercial_execution_order
  (project_id,execution_seq,commercial_document_id,predecessor_document_id,legacy_order)
SELECT project_id, seq, id, lag(id) OVER (PARTITION BY project_id ORDER BY seq), true
FROM (
  SELECT d.project_id,d.id,row_number() OVER (PARTITION BY d.project_id ORDER BY d.executed_at,d.id) seq
  FROM public.project_commercial_documents d JOIN public.proposals p ON p.id = d.proposal_id
  WHERE d.executed_at IS NOT NULL AND p.commercial_state = 'executed'
    AND d.document_kind IN ('design_services','design_build','service_addendum')
    AND NOT EXISTS (SELECT 1 FROM public.project_commercial_execution_order o WHERE o.project_id = d.project_id)
) historic
ON CONFLICT (commercial_document_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._record_scope_execution(p_document_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE doc public.project_commercial_documents%ROWTYPE; seq bigint; predecessor uuid;
BEGIN
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id = p_document_id;
  PERFORM 1 FROM public.projects WHERE id = doc.project_id FOR UPDATE;
  PERFORM 1 FROM public.proposals WHERE id = doc.proposal_id FOR UPDATE;
  SELECT * INTO doc FROM public.project_commercial_documents
  WHERE id = p_document_id AND project_id = doc.project_id AND proposal_id = doc.proposal_id FOR UPDATE;
  -- 40001 on purpose: the document moved after the unlocked read; PostgREST's
  -- retry re-reads it, bounded: each further attempt needs another concurrent commit (RC7-e2-2).
  IF NOT FOUND THEN RAISE EXCEPTION 'scope_execution_document_moved' USING ERRCODE = 'serialization_failure'; END IF;
  IF doc.document_kind NOT IN ('design_services','design_build','service_addendum')
     OR doc.executed_at IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.proposals p WHERE p.id = doc.proposal_id AND p.commercial_state = 'executed'
         AND p.document_kind = doc.document_kind) THEN
    RAISE EXCEPTION 'scope_execution_document_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT execution_seq INTO seq FROM public.project_commercial_execution_order WHERE commercial_document_id = doc.id;
  IF FOUND THEN RETURN seq; END IF;
  SELECT execution_seq, commercial_document_id INTO seq,predecessor
  FROM public.project_commercial_execution_order WHERE project_id = doc.project_id ORDER BY execution_seq DESC LIMIT 1;
  seq := COALESCE(seq,0) + 1;
  INSERT INTO public.project_commercial_execution_order(project_id,execution_seq,commercial_document_id,predecessor_document_id)
  VALUES(doc.project_id,seq,doc.id,predecessor);
  RETURN seq;
END;
$$;
REVOKE ALL ON FUNCTION public._record_scope_execution(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mint_scope_edition(p_document_id uuid, p_predecessor_id uuid DEFAULT NULL, p_reconciled boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  doc public.project_commercial_documents%ROWTYPE; proposal public.proposals%ROWTYPE;
  predecessor public.project_scope_editions%ROWTYPE; client_signature public.commercial_document_signatures%ROWTYPE;
  studio_signature public.commercial_document_signatures%ROWTYPE;
  v_edition_id uuid := extensions.gen_random_uuid(); v_edition_number integer; parts jsonb;
  packages jsonb; phases jsonb; policy jsonb; content jsonb; seq bigint;
  previous_marker text := current_setting('app.scope_edition_id',true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id = p_document_id;
  PERFORM 1 FROM public.projects WHERE id = doc.project_id FOR UPDATE;
  SELECT * INTO STRICT proposal FROM public.proposals WHERE id = doc.proposal_id FOR UPDATE;
  IF NOT public.can_author_scope_proposal(proposal.id) OR NOT public.can_compose_project_plan(doc.project_id)
     OR (proposal.studio_id IS NOT NULL AND proposal.studio_id IS DISTINCT FROM
         (SELECT studio_id FROM public.projects WHERE id = doc.project_id)) THEN
    RAISE EXCEPTION 'scope_edition_tenant_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO doc FROM public.project_commercial_documents
  WHERE id=p_document_id AND project_id=doc.project_id AND proposal_id=proposal.id FOR UPDATE;
  -- 40001 on purpose: the document moved after the unlocked read; PostgREST's
  -- retry re-reads it, bounded: each further attempt needs another concurrent commit (RC7-e2-2).
  IF NOT FOUND THEN RAISE EXCEPTION 'scope_execution_document_moved' USING ERRCODE = 'serialization_failure'; END IF;
  SELECT id INTO v_edition_id FROM public.project_scope_editions WHERE commercial_document_id = doc.id;
  IF FOUND THEN RETURN v_edition_id; END IF;
  v_edition_id := extensions.gen_random_uuid();
  SELECT execution_seq INTO seq FROM public.project_commercial_execution_order
  WHERE project_id = doc.project_id AND commercial_document_id = doc.id;
  IF seq IS NULL THEN RAISE EXCEPTION 'scope_execution_order_missing' USING ERRCODE = 'check_violation'; END IF;
  IF doc.document_kind NOT IN ('design_services','design_build','service_addendum')
     OR proposal.commercial_state <> 'executed' OR doc.executed_at IS NULL
     OR proposal.document_kind IS DISTINCT FROM doc.document_kind
     OR (proposal.project_id IS NOT NULL AND proposal.project_id <> doc.project_id) THEN
    RAISE EXCEPTION 'scope_execution_document_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO predecessor FROM public.project_scope_editions
  WHERE project_id = doc.project_id AND ((p_predecessor_id IS NULL AND status = 'active') OR id = p_predecessor_id)
  FOR UPDATE;
  IF NOT doc.is_origin AND (predecessor.id IS NULL OR predecessor.status NOT IN ('active','stale')
     OR (NOT p_reconciled AND (predecessor.status <> 'active'
        OR proposal.drafted_against_scope_edition_id IS DISTINCT FROM predecessor.id))) THEN
    RAISE EXCEPTION 'scope_edition_stale' USING ERRCODE = 'PT409';
  END IF;
  IF doc.is_origin AND EXISTS (SELECT 1 FROM public.project_scope_editions WHERE project_id = doc.project_id) THEN
    RAISE EXCEPTION 'scope_edition_origin_exists' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO client_signature FROM public.commercial_document_signatures WHERE proposal_id = proposal.id AND party_role = 'client';
  SELECT * INTO studio_signature FROM public.commercial_document_signatures WHERE proposal_id = proposal.id AND party_role = 'studio';
  IF client_signature.id IS NULL OR studio_signature.id IS NULL
     OR client_signature.signer_user_id IS DISTINCT FROM proposal.client_id
     OR client_signature.evidence_fingerprint IS DISTINCT FROM public._commercial_document_fingerprint(proposal.id)
     OR studio_signature.evidence_fingerprint IS DISTINCT FROM client_signature.evidence_fingerprint THEN
    RAISE EXCEPTION 'scope_edition_signature_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position),'[]') INTO parts
  FROM public.proposal_agreement_parts WHERE proposal_id = proposal.id;
  PERFORM public._normalize_scope_package_parts(proposal.id,parts);
  IF EXISTS (SELECT 1 FROM public.project_scope_edition_packages old WHERE old.edition_id = predecessor.id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(parts) p WHERE p->>'kind' = 'scope_package'
      AND p->'payload'->>'packageKey' = old.package_key)) THEN
    RAISE EXCEPTION 'scope_edition_package_dropped' USING ERRCODE = 'check_violation';
  END IF;
  v_edition_number := COALESCE(predecessor.edition_number,0) + 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'package_key',p->>'packageKey','label',p->>'label','room_ids',COALESCE(p->'roomIds','[]'),
    'inclusion',p->>'inclusion','condition_text',p->>'conditionText','responsibilities',p->'responsibilities',
    'provenance',COALESCE(p->'provenance','{}'),'override_of',p->>'overrideOf',
    'design_owed_since',CASE WHEN p->>'inclusion'='included' AND p->'responsibilities'->>'design'='studio'
       THEN COALESCE(old.design_owed_since,v_edition_number) END,
    'installation_owed_since',CASE WHEN p->>'inclusion'='included' AND p->'responsibilities'->>'installation'='studio'
       THEN COALESCE(old.installation_owed_since,v_edition_number) END) ORDER BY p->>'packageKey'),'[]') INTO packages
  FROM (SELECT value->'payload' p FROM jsonb_array_elements(parts) WHERE value->>'kind'='scope_package') new
  LEFT JOIN public.project_scope_edition_packages old ON old.edition_id=predecessor.id AND old.package_key=p->>'packageKey';
  IF doc.is_origin AND EXISTS (
    SELECT 1 FROM public.proposal_phases pp WHERE pp.proposal_id=proposal.id AND
      (SELECT count(*) FROM public.project_phases jp WHERE jp.project_id=doc.project_id AND jp.source_proposal_phase_id=pp.id) <> 1
  ) THEN RAISE EXCEPTION 'scope_edition_phase_unbound' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(binding) ORDER BY source_proposal_phase_id),'[]') INTO phases FROM (
    SELECT source_proposal_phase_id, project_phase_id,package_key,service_slot,bound_in_edition
    FROM public.project_scope_edition_phases WHERE edition_id=predecessor.id
    UNION ALL
    SELECT pp.id, CASE WHEN doc.is_origin THEN jp.id END, b.package_key,b.service_slot,
      CASE WHEN b.package_key IS NOT NULL THEN v_edition_number END
    FROM public.proposal_phases pp
    LEFT JOIN public.project_phases jp ON doc.is_origin AND jp.project_id=doc.project_id AND jp.source_proposal_phase_id=pp.id
    LEFT JOIN (
      SELECT p->'payload'->>'packageKey' package_key, s.key service_slot, phase.value::text::uuid phase_id
      FROM jsonb_array_elements(parts) p
      CROSS JOIN LATERAL jsonb_each(COALESCE(p->'payload'->'serviceBindings','{}')) s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.value) phase
      WHERE p->>'kind'='scope_package'
    ) b ON b.phase_id=pp.id WHERE pp.proposal_id=proposal.id
  ) binding;
  SELECT p->'payload' INTO policy FROM jsonb_array_elements(parts) p WHERE p->>'kind'='acceptance_signer_policy';
  content := jsonb_build_object('packagesRecorded',EXISTS(SELECT 1 FROM jsonb_array_elements(parts) p WHERE p->>'kind'='scope_package'),
    'packages',packages,'phases',phases,'signerPolicy',policy,'reconciled',p_reconciled);
  PERFORM set_config('app.scope_edition_id',COALESCE(predecessor.id::text,''),true);
  -- One statement lets the immediate self-FK see the new successor while the
  -- one-active index sees the predecessor retired before the INSERT.
  WITH retired AS (
    UPDATE public.project_scope_editions SET status='superseded',superseded_at=studio_signature.signed_at,
      superseded_by_edition_id=v_edition_id WHERE id=predecessor.id RETURNING id
  )
  INSERT INTO public.project_scope_editions(id,project_id,edition_number,kind,commercial_document_id,source_proposal_id,
    predecessor_edition_id,agreement_fingerprint,effective_at,content,content_hash,status)
  SELECT v_edition_id,doc.project_id,v_edition_number,CASE WHEN doc.is_origin THEN 'baseline' ELSE 'amendment' END,
    doc.id,proposal.id,predecessor.id,client_signature.evidence_fingerprint,studio_signature.signed_at,
    content,encode(extensions.digest(convert_to(content::text,'UTF8'),'sha256'),'hex'),'active'
  FROM (SELECT count(*) FROM retired) dependency;
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true);
  INSERT INTO public.project_scope_edition_packages
    (edition_id,package_key,label,room_ids,inclusion,condition_text,responsibilities,provenance,override_of,design_owed_since,installation_owed_since)
  SELECT v_edition_id,p.* FROM jsonb_to_recordset(packages) AS p(package_key text,label text,room_ids uuid[],inclusion text,
    condition_text text,responsibilities jsonb,provenance jsonb,override_of text,design_owed_since integer,installation_owed_since integer);
  INSERT INTO public.project_scope_edition_phases(edition_id,source_proposal_phase_id,project_phase_id,package_key,service_slot,bound_in_edition)
  SELECT v_edition_id,p.* FROM jsonb_to_recordset(phases) AS p(source_proposal_phase_id uuid,project_phase_id uuid,package_key text,service_slot text,bound_in_edition integer);
  INSERT INTO public.project_scope_edition_signers(edition_id,slot,required,profile_id,household_person_id,policy_revision)
  SELECT v_edition_id,s->>'slot',(s->>'required')::boolean,(s->>'profileId')::uuid,(s->>'householdPersonId')::uuid,(policy->>'policyRevision')::integer
  FROM jsonb_array_elements(COALESCE(policy->'signers','[]')) s;
  RETURN v_edition_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true); RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._mint_scope_edition(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._scope_after_execution(p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE doc public.project_commercial_documents%ROWTYPE; edition uuid; seq bigint;
  previous_marker text := current_setting('app.scope_edition_id',true);
BEGIN
  seq := public._record_scope_execution(p_document_id);
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id=p_document_id;
  SELECT id INTO edition FROM public.project_scope_editions WHERE project_id=doc.project_id AND status='active' FOR UPDATE;
  IF COALESCE((SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),false) THEN
    PERFORM public._mint_scope_edition(doc.id);
  ELSIF NOT doc.is_origin AND edition IS NOT NULL THEN
    PERFORM set_config('app.scope_edition_id',edition::text,true);
    UPDATE public.project_scope_editions SET status='stale',stale_at=clock_timestamp(),stale_reason='amended_while_inactive',
      stale_commercial_document_id=doc.id,stale_execution_seq=seq WHERE id=edition;
    PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true); RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._scope_after_execution(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_project_scope_editions(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'scope_project_access_denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',p_project_id,'editions',COALESCE((
    SELECT jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'packages',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.package_key),'[]') FROM public.project_scope_edition_packages p WHERE p.edition_id=e.id),
      'phases',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.source_proposal_phase_id),'[]') FROM public.project_scope_edition_phases p WHERE p.edition_id=e.id),
      'signers',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.slot),'[]') FROM public.project_scope_edition_signers p WHERE p.edition_id=e.id)
    ) ORDER BY e.edition_number) FROM public.project_scope_editions e WHERE e.project_id=p_project_id),'[]'));
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_scope_editions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_scope_editions(uuid) TO authenticated;

-- Native _normalize_scope_package_parts from 00868_round8_scope_composition.sql:197; bounded C2 graft only.
CREATE OR REPLACE FUNCTION public._normalize_scope_package_parts(p_proposal_id uuid, p_parts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  part jsonb; payload jsonb; result jsonb := '[]';
  used_keys text[] := '{}'; key text; slug text; suffix integer;
  slot text; phase jsonb; phase_id uuid; bound_ids uuid[] := '{}';
  responsibilities jsonb; bindings jsonb; room jsonb;
BEGIN
  IF jsonb_typeof(p_parts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'scope_parts_array_required' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._validate_scope_signer_parts(p_proposal_id,p_parts);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_parts) p WHERE p->>'kind' = 'scope_package') THEN
    RETURN p_parts;
  END IF;
  PERFORM public._assert_scope_composition_enabled();
  IF NOT public.can_author_scope_proposal(p_proposal_id) THEN
    RAISE EXCEPTION 'scope_proposal_access_denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Reserve explicit keys first, so an earlier allocated part never steals one.
  FOR part IN SELECT value FROM jsonb_array_elements(p_parts) WHERE value->>'kind' = 'scope_package' LOOP
    payload := part->'payload';
    IF payload ? 'packageKey' THEN
      key := payload->>'packageKey';
      IF jsonb_typeof(payload->'packageKey') IS DISTINCT FROM 'string'
          OR key !~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN
        RAISE EXCEPTION 'scope_package_key_invalid' USING ERRCODE = 'check_violation';
      END IF;
      IF key = ANY(used_keys) THEN
        RAISE EXCEPTION 'scope_package_key_duplicate' USING ERRCODE = 'check_violation';
      END IF;
      used_keys := array_append(used_keys, key);
    END IF;
  END LOOP;
  FOR part IN SELECT value FROM jsonb_array_elements(p_parts) LOOP
    IF part->>'kind' IS DISTINCT FROM 'scope_package' THEN
      result := result || jsonb_build_array(part); CONTINUE;
    END IF;
    payload := part->'payload';
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
        OR jsonb_typeof(payload->'label') IS DISTINCT FROM 'string'
        OR btrim(payload->>'label') = ''
        OR COALESCE(payload->>'inclusion', '') NOT IN ('included','excluded','conditional') THEN
      RAISE EXCEPTION 'scope_package_payload_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF payload->>'inclusion' = 'conditional' AND
       (jsonb_typeof(payload->'conditionText') IS DISTINCT FROM 'string' OR btrim(payload->>'conditionText') = '') THEN
      RAISE EXCEPTION 'scope_package_condition_required' USING ERRCODE = 'check_violation';
    END IF;
    responsibilities := payload->'responsibilities';
    IF jsonb_typeof(responsibilities) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'scope_package_responsibilities_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(responsibilities)) <> 5 THEN
      RAISE EXCEPTION 'scope_package_responsibilities_invalid' USING ERRCODE = 'check_violation';
    END IF;
    FOREACH slot IN ARRAY ARRAY['design','purchasing','payer','fabrication_contract','installation'] LOOP
      IF jsonb_typeof(responsibilities->slot) IS DISTINCT FROM 'string'
          OR COALESCE(responsibilities->>slot,'') NOT IN ('studio','client','gc','other','none') THEN
        RAISE EXCEPTION 'scope_package_responsibilities_invalid' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    IF payload ? 'roomIds' THEN
      IF jsonb_typeof(payload->'roomIds') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'scope_package_rooms_invalid' USING ERRCODE = 'check_violation';
      END IF;
      FOR room IN SELECT value FROM jsonb_array_elements(payload->'roomIds') LOOP
        IF jsonb_typeof(room) <> 'string' OR (room #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'scope_package_rooms_invalid' USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
    END IF;
    IF payload ? 'overrideOf' AND payload->'overrideOf' <> 'null'::jsonb AND
       (jsonb_typeof(payload->'overrideOf') <> 'string' OR payload->>'overrideOf' !~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$') THEN
      RAISE EXCEPTION 'scope_package_override_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF payload ? 'provenance' AND (jsonb_typeof(payload->'provenance') <> 'object'
       OR jsonb_typeof(payload#>'{provenance,arrangementKey}') IS DISTINCT FROM 'string'
       OR COALESCE(payload#>>'{provenance,arrangementKey}', '') = ''
       OR COALESCE(payload#>>'{provenance,arrangementVersion}', '') !~ '^[1-9][0-9]*$') THEN
      RAISE EXCEPTION 'scope_package_provenance_invalid' USING ERRCODE = 'check_violation';
    END IF;
    bindings := COALESCE(payload->'serviceBindings', '{}'::jsonb);
    IF jsonb_typeof(bindings) IS DISTINCT FROM 'object' OR
       (bindings - ARRAY['design','installation']) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'scope_package_bindings_invalid' USING ERRCODE = 'check_violation';
    END IF;
    FOREACH slot IN ARRAY ARRAY['design','installation'] LOOP
      IF NOT (bindings ? slot) THEN CONTINUE; END IF;
      IF jsonb_typeof(bindings->slot) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'scope_package_bindings_invalid' USING ERRCODE = 'check_violation';
      END IF;
      FOR phase IN SELECT value FROM jsonb_array_elements(bindings->slot) LOOP
        IF payload->>'inclusion' <> 'included' OR responsibilities->>slot <> 'studio' THEN
          RAISE EXCEPTION 'scope_package_binding_slot_not_owed' USING ERRCODE = 'check_violation';
        END IF;
        IF jsonb_typeof(phase) <> 'string' OR (phase #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'scope_package_phase_unknown' USING ERRCODE = 'check_violation';
        END IF;
        phase_id := (phase #>> '{}')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.proposal_phases WHERE id = phase_id AND proposal_id = p_proposal_id) THEN
          RAISE EXCEPTION 'scope_package_phase_unknown' USING ERRCODE = 'check_violation';
        END IF;
        IF phase_id = ANY(bound_ids) THEN
          RAISE EXCEPTION 'scope_package_phase_shared' USING ERRCODE = 'check_violation';
        END IF;
        bound_ids := array_append(bound_ids, phase_id);
      END LOOP;
    END LOOP;
    IF bindings = '{}'::jsonb THEN payload := payload - 'serviceBindings'; END IF;
    IF NOT (payload ? 'packageKey') THEN
      slug := rtrim(left(btrim(regexp_replace(lower(btrim(payload->>'label')), '[^a-z0-9]+', '-', 'g'), '-'),56),'-');
      IF slug = '' THEN slug := 'package'; END IF;
      key := 'pkg.' || slug; suffix := 2;
      WHILE key = ANY(used_keys) LOOP
        key := 'pkg.' || slug || '-' || suffix; suffix := suffix + 1;
      END LOOP;
      used_keys := array_append(used_keys,key);
      payload := jsonb_set(payload, '{packageKey}', to_jsonb(key));
    END IF;
    result := result || jsonb_build_array(jsonb_set(part, '{payload}', payload));
  END LOOP;
  RETURN result;
END;
$$;

-- Native upsert_agreement_parts from 00868_round8_scope_composition.sql:461; bounded C2 graft only.
CREATE OR REPLACE FUNCTION public.upsert_agreement_parts(
  p_proposal_id uuid,
  p_parts jsonb,
  p_why text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_existing public.proposal_service_terms%ROWTYPE;
  v_terms jsonb;
  v_rates jsonb;
  v_version integer;
  v_duplicate text;
  v_part jsonb;
  v_payload jsonb;
  v_kind text;
  v_variant text;
  v_key text;
  v_title text;
  v_keys text[] := ARRAY[]::text[];
  v_role jsonb;
  v_role_name text;
  v_role_names text[];
  -- 00618 (HT-4)
  v_roster_role text;
  v_roster_roles text[];
  v_percent numeric;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_projection text := current_setting('app.agreement_projection', true);
  -- 00577
  v_before jsonb;
  v_after jsonb;
  v_fee_basis text;
  v_fee_amount_cents integer;
  v_fee_schedule jsonb;
  v_phase jsonb;
  -- 00578
  v_message text;
BEGIN
  IF auth.uid() IS NULL
     OR jsonb_typeof(COALESCE(p_parts, 'null'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'agreement parts require an authenticated author and an ordered array'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum', 'design_build') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Scope validation precedes the existing money validation and projection.
  p_parts := public._normalize_scope_package_parts(p_proposal_id, p_parts);
  PERFORM public._validate_scope_retained_parts(p_proposal_id,p_parts);

  -- ─────────────────────────────────────────────────────────────────────────
  -- R7 (N-7) and R2 (N-6): every refusal a composition can earn is worded
  -- HERE, in the designer's words, and asked BEFORE anything is written.
  --
  -- Everything below this loop lands rows whose CHECK constraints, unique
  -- indexes and NOT NULLs would otherwise answer for us — and Postgres
  -- answers with the name of a constraint, a column or a table, which the
  -- composer prints verbatim as its save note. A designer must never read
  -- one.
  --
  -- The money halves are asked with jsonb_typeof BEFORE any cast, exactly as
  -- _agreement_floor_unmet asks them, so the floor and the projection can
  -- never read one payload two ways: a rate stated as the string "22500" is
  -- refused here rather than billing hours against a cap the floor is blind
  -- to, and a ceiling stated as a string earns its own sentence rather than
  -- the floor's.
  --
  -- Nothing here is a UI courtesy duplicated in SQL: upsert_agreement_parts
  -- is GRANTed to authenticated, so this loop is the only thing standing
  -- between a hand-made payload and the money row the authority snapshots.
  -- ─────────────────────────────────────────────────────────────────────────
  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts)
  LOOP
    IF jsonb_typeof(v_part) <> 'object' THEN
      RAISE EXCEPTION 'this agreement could not be read as a list of parts'
        USING ERRCODE = 'check_violation';
    END IF;

    v_kind    := btrim(COALESCE(v_part->>'kind', ''));
    v_variant := NULLIF(btrim(COALESCE(v_part->>'variant', '')), '');
    v_key     := btrim(COALESCE(v_part->>'partKey', ''));
    v_title   := btrim(COALESCE(v_part->>'title', ''));
    v_payload := COALESCE(v_part->'payload', '{}'::jsonb);

    IF v_kind = '' OR v_key = '' THEN
      RAISE EXCEPTION 'every part of an agreement needs a name and a type'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_title = '' THEN
      RAISE EXCEPTION 'every part of an agreement needs a title'
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' THEN
      RAISE EXCEPTION 'the part titled "%" could not be read', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    -- The uniqueness the table states as uniq_agreement_part_key, asked in
    -- the words of the rail rather than in the words of the index.
    IF v_key = ANY (v_keys) THEN
      RAISE EXCEPTION 'this agreement lists the part titled "%" twice', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    v_keys := v_keys || v_key;

    -- The three fields the INSERT below casts. Postgres answers a bad cast
    -- with `invalid input syntax for type boolean` and the like, and the
    -- composer prints the RPC's text verbatim as its save note — so these are
    -- asked here, in the words of the room, exactly as every money figure is.
    IF v_part ? 'required'
       AND jsonb_typeof(v_part->'required') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'whether the part titled "%" is required is a yes or a no', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_part ? 'clientVisible'
       AND jsonb_typeof(v_part->'clientVisible') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'whether the client sees the part titled "%" is a yes or a no', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(btrim(COALESCE(v_part->>'sourcePartId', '')), '') IS NOT NULL
       AND btrim(v_part->>'sourcePartId') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'the part that "%" was copied from could not be read', v_title
        USING ERRCODE = 'check_violation';
    END IF;

    -- R48 (W3R2-01) — THE PRICE IS NEVER HIDDEN.
    --
    -- R39's visibility act is general, and a general act applied to the
    -- pricing basis took the whole of a design-build agreement's money off
    -- the paper: the redacted projection dropped the part, the client's copy
    -- printed a draw schedule against a price it did not name, and the walk
    -- signed it. The draw schedule is the same kind of term — it is what she
    -- is asked to pay, and when.
    --
    -- So the two turnkey parts that state the money are client-visible by
    -- construction, refused here rather than caught downstream. The composer
    -- no longer offers the toggle on either; this is what holds for a payload
    -- that arrives any other way.
    IF COALESCE((v_part->>'clientVisible')::boolean, true) IS NOT TRUE
       AND v_kind = 'schedule'
       AND v_variant IN ('pricing_basis', 'draws') THEN
      RAISE EXCEPTION
        'your client signs the price and the draws, so "%" cannot be hidden from her',
        v_title
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'rate_card' THEN
      IF v_payload ? 'roles' AND jsonb_typeof(v_payload->'roles') <> 'array' THEN
        RAISE EXCEPTION 'a rate card is a list of roles and their hourly rates'
          USING ERRCODE = 'check_violation';
      END IF;
      v_role_names := ARRAY[]::text[];
      v_roster_roles := ARRAY[]::text[];
      FOR v_role IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_payload->'roles') = 'array'
               THEN v_payload->'roles' ELSE '[]'::jsonb END)
      LOOP
        IF jsonb_typeof(v_role) <> 'object' THEN
          RAISE EXCEPTION 'a rate card is a list of roles and their hourly rates'
            USING ERRCODE = 'check_violation';
        END IF;
        v_role_name := btrim(COALESCE(v_role->>'roleName', ''));
        IF v_role_name = '' THEN
          RAISE EXCEPTION 'every role on the rate card needs a name'
            USING ERRCODE = 'check_violation';
        END IF;
        -- The rates table is unique on (proposal, version, role name), and
        -- the projection btrims the name exactly as this does.
        IF v_role_name = ANY (v_role_names) THEN
          RAISE EXCEPTION 'the rate card names % twice', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        v_role_names := v_role_names || v_role_name;
        -- ── 00618 (HT-4): the role binding is an enum, asked at the door ────
        -- The rate card binds to the roster role, and the four values are the
        -- billable subset of project_team_members.role (00084:164-165, a TEXT
        -- CHECK whose full set also carries 'client'). Asked here rather than
        -- left to the column CHECK so the room hears a sentence instead of a
        -- 23514 from two functions down, the discipline every other refusal in
        -- this loop already follows.
        v_roster_role := NULLIF(btrim(COALESCE(v_role->>'rosterRole', '')), '');
        IF v_roster_role IS NOT NULL
           AND v_roster_role NOT IN
               ('lead_designer', 'support_designer', 'bookkeeper', 'vendor') THEN
          RAISE EXCEPTION '% is not a role the studio roster carries', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        -- One rate per role, or the resolver's exact-one card match (00618's
        -- tier 1) finds two and strands the hour it was meant to price — the
        -- stranding defect HT-4 exists to close, arriving by a second door.
        IF v_roster_role IS NOT NULL AND v_roster_role = ANY (v_roster_roles) THEN
          RAISE EXCEPTION 'the rate card prices % twice', v_roster_role
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_roster_role IS NOT NULL THEN
          v_roster_roles := v_roster_roles || v_roster_role;
        END IF;
        IF v_role->'hourlyRateCents' IS NULL
           OR jsonb_typeof(v_role->'hourlyRateCents') = 'null' THEN
          RAISE EXCEPTION 'every role on the rate card needs an hourly rate'
            USING ERRCODE = 'check_violation';
        END IF;
        PERFORM public._agreement_assert_cents(v_role, 'hourlyRateCents', 'hourly rate');
        IF v_role ? 'sortOrder'
           AND jsonb_typeof(v_role->'sortOrder') NOT IN ('number', 'null') THEN
          RAISE EXCEPTION 'the rate card''s order could not be read at %', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        -- (B-9) A date the projection cannot read would reach
        -- proposal_service_rates as a raw cast error. Asked here instead.
        IF NULLIF(btrim(COALESCE(v_role->>'effectiveAt', '')), '') IS NOT NULL THEN
          BEGIN
            PERFORM (v_role->>'effectiveAt')::timestamptz;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'the date % takes effect could not be read', v_role_name
              USING ERRCODE = 'check_violation';
          END;
        END IF;
      END LOOP;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'ceiling' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'ceiling');
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'retainer' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'retainer');
      IF NULLIF(btrim(COALESCE(v_payload->>'activationPolicy', '')), '') IS NOT NULL
         AND v_payload->>'activationPolicy' NOT IN ('immediate', 'retainer_paid') THEN
        RAISE EXCEPTION 'a retainer starts either right away or once it is paid'
          USING ERRCODE = 'check_violation';
      END IF;
      -- 00577: the credit rule reaches proposal_service_terms now, and its
      -- CHECK would answer a designer with the name of a constraint.
      IF NULLIF(btrim(COALESCE(v_payload->>'creditRule', '')), '') IS NOT NULL
         AND v_payload->>'creditRule'
             NOT IN ('credited', 'non_refundable', 'replenishing') THEN
        RAISE EXCEPTION 'a retainer is credited against fees, non-refundable, or replenishing'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 00577 (P5). The two Wave-2 fee shapes, asked the way every other money
    -- figure in this loop is asked: jsonb_typeof BEFORE any cast, so a
    -- malformed payload earns a sentence rather than reaching the money row
    -- as a raw cast error.
    IF v_kind = 'schedule' AND v_variant = 'flat' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'flat fee');
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'per_phase' THEN
      IF v_payload ? 'phases' AND jsonb_typeof(v_payload->'phases') <> 'array' THEN
        RAISE EXCEPTION 'a per-phase fee is a list of phases and what each one costs'
          USING ERRCODE = 'check_violation';
      END IF;
      FOR v_phase IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_payload->'phases') = 'array'
               THEN v_payload->'phases' ELSE '[]'::jsonb END)
      LOOP
        IF jsonb_typeof(v_phase) <> 'object' THEN
          RAISE EXCEPTION 'a per-phase fee is a list of phases and what each one costs'
            USING ERRCODE = 'check_violation';
        END IF;
        IF btrim(COALESCE(v_phase->>'label', '')) = '' THEN
          RAISE EXCEPTION 'every phase of a per-phase fee needs a name'
            USING ERRCODE = 'check_violation';
        END IF;
        PERFORM public._agreement_assert_cents(v_phase, 'cents', 'phase fee');
      END LOOP;
    END IF;

    -- 00578: 'per_draw' is legal in the money row from this migration on
    -- (PART 2 widened both cadence CHECKs), so it joins the sentence rather
    -- than being refused by it.
    IF v_kind = 'schedule' AND v_variant = 'cadence' THEN
      IF NULLIF(btrim(COALESCE(v_payload->>'cadence', '')), '') IS NOT NULL
         AND v_payload->>'cadence'
             NOT IN ('monthly', 'biweekly', 'milestone', 'per_draw') THEN
        RAISE EXCEPTION 'billing runs monthly, every two weeks, at milestones, or on each draw'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 00578 (P9): the three turnkey money payloads, asked ONLY once the
    -- designer has filled the shape enough to be judged. See the header note
    -- (c): an empty basis and an empty draw list are what a materialized
    -- template looks like, and Save must not refuse them.
    IF v_kind = 'schedule' AND v_variant = 'pricing_basis'
       AND NULLIF(btrim(COALESCE(v_payload->>'basis', '')), '') IS NOT NULL
       AND jsonb_typeof(v_payload->'costLines') = 'array'
       AND jsonb_array_length(v_payload->'costLines') > 0 THEN
      v_message := public._validate_pricing_basis_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'draws'
       AND jsonb_typeof(v_payload->'draws') = 'array'
       AND jsonb_array_length(v_payload->'draws') > 1 THEN
      v_message := public._validate_draws_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'allowances'
       AND jsonb_typeof(v_payload->'allowances') = 'array'
       AND jsonb_array_length(v_payload->'allowances') > 0 THEN
      v_message := public._validate_allowances_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'procurement' THEN
      IF v_payload->'depositPercent' IS NOT NULL
         AND jsonb_typeof(v_payload->'depositPercent') <> 'null' THEN
        IF jsonb_typeof(v_payload->'depositPercent') <> 'number' THEN
          RAISE EXCEPTION 'a furnishings deposit is a percentage between 0 and 100'
            USING ERRCODE = 'check_violation';
        END IF;
        v_percent := (v_payload->'depositPercent' #>> '{}')::numeric;
        IF v_percent < 0 OR v_percent > 100 THEN
          RAISE EXCEPTION 'a furnishings deposit is a percentage between 0 and 100'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 00578 (§4.3, research 02 §9 item 6). SUPERVISION IS PAID ONCE. This is
  -- not incompleteness — a half-written draft cannot accidentally state both
  -- a supervision fee and a markup on the trades — so unlike the three
  -- payload validators above it is asked at every Save, in the same sentence
  -- the composer and the send door use.
  v_message := public._validate_no_double_count(p_parts);
  IF v_message IS NOT NULL THEN
    RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  -- 00577 (P8): the set as it stood. Captured before the write, because the
  -- write is DELETE-then-INSERT and there is no other moment it exists.
  SELECT COALESCE(jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at' - 'proposal_id'
                            ORDER BY ap.position, ap.id), '[]'::jsonb)
  INTO v_before
  FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id;

  SET CONSTRAINTS uniq_agreement_part_position DEFERRED;
  PERFORM set_config('app.scope_parts_writer', p_proposal_id::text, true);
  DELETE FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible, source_template_key, source_part_id
  )
  SELECT
    p_proposal_id,
    e.ord::integer,
    e.part->>'kind',
    NULLIF(e.part->>'variant', ''),
    e.part->>'partKey',
    btrim(e.part->>'title'),
    COALESCE(e.part->'payload', '{}'::jsonb),
    COALESCE((e.part->>'required')::boolean, false),
    COALESCE((e.part->>'clientVisible')::boolean, true),
    NULLIF(e.part->>'sourceTemplateKey', ''),
    NULLIF(e.part->>'sourcePartId', '')::uuid
  FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS e(part, ord);
  PERFORM set_config('app.scope_parts_writer', '', true);

  -- One of each money part. The projection below reads a money part by its
  -- shape, so two ceilings — however they are keyed — would leave the money
  -- row picking between them. The Add menu offers every schedule variant;
  -- this is the sentence that answers "add a second ceiling", in the words a
  -- designer uses for the part rather than the words the table uses.
  SELECT CASE ap.variant
           WHEN 'rate_card'     THEN 'rate card'
           WHEN 'ceiling'       THEN 'ceiling'
           WHEN 'retainer'      THEN 'retainer'
           WHEN 'cadence'       THEN 'billing cadence'
           WHEN 'procurement'   THEN 'furnishings deposit'
           WHEN 'pricing_basis' THEN 'pricing basis'
           WHEN 'draws'         THEN 'draw schedule'
           WHEN 'allowances'    THEN 'allowances list'
         END
    INTO v_duplicate
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule'
    AND ap.variant IN ('rate_card', 'ceiling', 'retainer', 'cadence',
                       'procurement', 'pricing_basis', 'draws', 'allowances')
  GROUP BY ap.variant
  HAVING count(*) > 1
  ORDER BY 1
  LIMIT 1;
  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION 'an agreement carries only one %', v_duplicate
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00577 (P5, R9): ONE FEE BASIS. A flat fee and a per-phase schedule both
  -- answer "what does the work cost", and the projection below writes
  -- fee_basis from whichever is present — so two of them, in any combination,
  -- leave that column choosing between two answers. W1's refusal above cannot
  -- say this: it asks about one variant at a time, and flat-beside-per_phase
  -- is one of each.
  IF (SELECT count(*) FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.client_visible
        AND ap.variant IN ('flat', 'per_phase')) > 1 THEN
    RAISE EXCEPTION 'an agreement carries one fee basis'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R4'S FLOOR IS NOT ASKED HERE. A DRAFT IS ALLOWED TO BE UNFINISHED.
  --
  -- R22 places the floor at the doors a document LEAVES DRAFT by — send, sign
  -- and the paper door — and Wave 1 also asked it here, at Save. The walk
  -- showed what that costs: a freshly materialized composition seeds a rate
  -- card from the studio's defaults with no ceiling beside it and no fee typed
  -- yet, so the first Save of the first sentence the designer writes is
  -- refused, and every Save after it, until a fee AND a cap are typed. There
  -- is no order of work that reaches a saved draft. Composing an agreement is
  -- writing, and writing is saved half-done.
  --
  -- Nothing is lost by moving it: _agreement_floor_unmet and
  -- _agreement_fee_unnamed are asked at send_commercial_document,
  -- _sign_design_services_agreement_authorized and
  -- _issue_design_services_agreement_on_paper, and parts freeze when the
  -- document leaves draft (R6) — so no composition below the floor can reach
  -- a homeowner. The readiness panel names both blockers in the room the
  -- moment the rail renders, which is where the designer needs to read them.
  --
  -- The duplicate refusal above STAYS at this door: it is not a floor, it is
  -- the projection's precondition — two ceilings leave the money row picking
  -- between them, and there is no half-composed state that wants that.

  SELECT * INTO v_existing FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id;
  v_version := COALESCE(v_existing.current_rate_version, 1);

  -- WHAT PROJECTS, AND ON WHAT GROUND.
  --
  -- The four prose columns are read from the four standard keys: 'the scope'
  -- and 'the terms' are named slots on the legacy row, and two clauses cannot
  -- both be the scope. UNIQUE (proposal_id, part_key) makes each of those a
  -- scalar, and each subquery also asserts the kind — a schedule keyed
  -- patina.services is not the scope.
  --
  -- The five money figures are read by SHAPE — kind 'schedule' plus variant —
  -- under whatever key the composition gave them, because the composer mints
  -- a fresh key for every part it adds and the figure on the page must be the
  -- figure in the money row. The duplicate refusal above makes each of these
  -- a scalar too.
  --
  -- Both halves still insist on the shape, so a clause keyed patina.ceiling
  -- is prose that happens to mention a cap and writes nothing (R5), and every
  -- variant outside these five — flat, per_phase, percent_of_cost, draws,
  -- allowances — is recorded and hashed and reaches the money row not at all,
  -- until R9's Wave-2 columns exist to hold it.
  --
  -- patina.retainer's payload->>'creditRule' is READ AND DISCARDED in Wave 1:
  -- the column arrives on proposal_service_terms in Wave 2 (D-2). It is not a
  -- dropped field, it is a field with nowhere to land yet.
  v_terms := jsonb_build_object(
    'scope', COALESCE((
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.services'
        AND ap.kind = 'clause'
    ), ''),
    'deliverables', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.deliverables'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.exclusions'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'terms', (
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.terms'
        AND ap.kind = 'clause'
    ),
    'billingCeilingCents', (
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'ceiling'
    ),
    'retainerAmountCents', COALESCE((
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 0),
    'retainerActivationPolicy', COALESCE((
      SELECT NULLIF(ap.payload->>'activationPolicy', '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'immediate'),
    'billingCadence', COALESCE((
      SELECT NULLIF(ap.payload->>'cadence', '') FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'cadence'
    -- 00578 (R9): a turnkey agreement bills on each draw, and that is the ONE
    -- authority this class writes. A design-build composition that carries no
    -- cadence part of its own still projects 'per_draw'; every other class
    -- keeps 00577's 'monthly'.
    ), CASE WHEN v_proposal.document_kind = 'design_build'
            THEN 'per_draw' ELSE 'monthly' END),
    'furnishingsDepositPercent', (
      SELECT (ap.payload->>'depositPercent')::numeric FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'procurement'
    ),
    'currency', COALESCE(v_existing.currency, 'USD'),
    'currentRateVersion', v_version
  );

  -- (B-9) effectiveAt rides through the parts door. Without it the
  -- projection falls to now() for every role, and
  -- classify_project_time_entry_authority filters authority rates on
  -- `effective_at <= started_at` — so a rate written for January stopped
  -- applying to January's hours the first time the agreement was opened in
  -- the Contract Room. A role that carries no date still falls to now(),
  -- which is what a rate written today means.
  v_rates := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'version', v_version,
      'roleName', e.rate->>'roleName',
      -- 00618 (HT-4). The enum rides to the projection beside the label.
      'rosterRole', NULLIF(e.rate->>'rosterRole', ''),
      'hourlyRateCents', (e.rate->>'hourlyRateCents')::integer,
      'sortOrder', COALESCE((e.rate->>'sortOrder')::integer, 0),
      'effectiveAt', NULLIF(e.rate->>'effectiveAt', '')
    ) ORDER BY e.ord)
    FROM public.proposal_agreement_parts ap
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ap.payload->'roles') = 'array'
           THEN ap.payload->'roles' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(rate, ord)
    WHERE ap.proposal_id = p_proposal_id
      AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
  ), '[]'::jsonb);

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  --
  -- R17(a): the GUC is set for exactly the width of the projection and put
  -- back after, so guard_agreement_projection_write refuses every other
  -- writer of the money row while this document has parts. Transaction-local
  -- (set_config's third argument), so it cannot leak past this statement.
  -- 00577 (P5, R9). WHAT CREATES AUTHORITY AND WHAT ONLY GETS RECORDED.
  -- flat and per_phase name the fee; a rate card means hourly; everything
  -- else a schedule can be — percent_of_cost, percent_of_spend, cost_plus,
  -- day_rate, package, pricing_basis, draws, allowances — writes NOTHING
  -- here. The rule lives in the projection rather than behind a chip in the
  -- room, because this RPC is GRANTed to authenticated: a hand-crafted
  -- cost_plus part sent straight through it must still leave fee_basis NULL.
  -- Read by SHAPE, like every other money figure in this body.
  --
  -- R33 — AND ONLY WHAT SHE CAN SEE. Every fee read here is client_visible,
  -- because the fee set is what CHARGES her: a studio-only flat fee beside a
  -- visible rate card used to send `flat / $8,000` to the money row and onto
  -- the executed authority, while the sentence she ticked named the rates and
  -- the keepsake she keeps never mentioned the eight thousand. Three surfaces
  -- of one agreement disagreeing, and the one that disagreed was the one that
  -- billed. compose_agreement_consent, _render_agreement_snapshot_html and
  -- R22's floor all read client_visible already; this was the only reader that
  -- did not. A hidden fee is recorded on the agreement and reaches the money
  -- row not at all — the same answer R9 gives a cost_plus.
  --
  -- proposal_service_rates is NOT filtered that way, and deliberately: R33
  -- names proposal_service_terms and the authority, and the rate rows are a
  -- third thing — the send door refuses a rate card with no rate rows behind
  -- it, in words about role rates rather than about a fee. A hidden rate card
  -- still cannot bill: it writes no fee_basis here, and R22's floor refuses
  -- the send while it is the only fee on the paper.
  SELECT ap.variant,
         CASE WHEN ap.variant = 'flat'
              THEN CASE WHEN jsonb_typeof(ap.payload->'cents') = 'number'
                        THEN (ap.payload->>'cents')::integer END
              ELSE (SELECT sum((e.phase->>'cents')::integer)
                    FROM jsonb_array_elements(
                           CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                                THEN ap.payload->'phases' ELSE '[]'::jsonb END)
                      AS e(phase)
                    WHERE jsonb_typeof(e.phase->'cents') = 'number') END,
         CASE WHEN ap.variant = 'per_phase'
              THEN CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                        THEN ap.payload->'phases' ELSE '[]'::jsonb END END
    INTO v_fee_basis, v_fee_amount_cents, v_fee_schedule
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule' AND ap.variant IN ('flat', 'per_phase')
    AND ap.client_visible;

  IF v_fee_basis IS NULL THEN
    v_fee_amount_cents := NULL;
    v_fee_schedule := NULL;
    IF EXISTS (SELECT 1 FROM public.proposal_agreement_parts ap
               WHERE ap.proposal_id = p_proposal_id
                 AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
                 AND ap.client_visible) THEN
      v_fee_basis := 'hourly';
    END IF;
  END IF;

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  --
  -- R17(a): the GUC is set for exactly the width of the projection and put
  -- back after, so guard_agreement_projection_write refuses every other
  -- writer of the money row while this document has parts. Transaction-local
  -- (set_config's third argument), so it cannot leak past this statement.
  PERFORM set_config('app.agreement_projection', p_proposal_id::text, true);
  PERFORM public._project_agreement_terms(p_proposal_id, v_terms, v_rates, true);

  -- 00577: the four Wave-2 figures, written inside the SAME projection window
  -- and as their own statement rather than as four more arguments to
  -- _project_agreement_terms — that helper is ALSO the seven-facet room's
  -- writer, and the flag-off door must keep writing exactly what 00422 wrote.
  UPDATE public.proposal_service_terms t SET
    retainer_credit_rule = COALESCE((
      SELECT NULLIF(btrim(COALESCE(ap.payload->>'creditRule', '')), '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'credited'),
    fee_basis = v_fee_basis,
    fee_amount_cents = v_fee_amount_cents,
    fee_schedule = v_fee_schedule,
    updated_at = now()
  WHERE t.proposal_id = p_proposal_id;

  PERFORM set_config('app.agreement_projection', COALESCE(v_previous_projection, ''), true);

  -- 00577 (P8): what moved, and the designer's one line about why. A no-op
  -- save writes nothing at all — the diff is empty — so a room that autosaves
  -- does not fill the history strip with silence.
  SELECT COALESCE(jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at' - 'proposal_id'
                            ORDER BY ap.position, ap.id), '[]'::jsonb)
  INTO v_after
  FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id;
  PERFORM public._log_agreement_part_events(p_proposal_id, v_before, v_after, p_why);

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  -- The saved rows come back, in order, exactly as materialize_standard_parts
  -- returns them. The write is DELETE-then-INSERT and does not carry `id`
  -- through, so every part has a NEW uuid — a room that kept the array it
  -- sent would be holding ids the table no longer has, and the next save
  -- would look like a rename of nine parts. One round trip, one truth.
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy'
                         THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'partCount', jsonb_array_length(p_parts),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id),
    'parts', COALESCE((
      SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.agreement_projection', COALESCE(v_previous_projection, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- Native send_commercial_document from 00837_commercial_send_conflict_status.sql:8; bounded C2 graft only.
CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw_total bigint;
  v_allocation_total bigint;
  v_allocation_count integer;
  v_section_count integer;
  v_draw_count integer;
  v_gate_count integer;
  v_gate_sort integer;
  v_max_sort integer;
  v_first_gates boolean;
  v_percentage_count integer;
  v_percentage_total numeric;
  -- 00578
  v_pricing_basis jsonb;
  v_draws jsonb;
  v_allowances jsonb;
  v_contract_sum bigint;
  v_message text;
  v_disclosure text;
  v_draw_gross bigint;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Validate the signed C2 input at the last mutable door, independently of save.
  PERFORM public._normalize_scope_package_parts(p_proposal_id, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
    FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  PERFORM public._validate_scope_retained_parts(p_proposal_id, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
    FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'PT409';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: role rates are required only when the agreement bills time — a
  -- document with no parts (every pre-00575 and every flag-off document)
  -- still owes them, and so does one carrying a rate_card part. A composed
  -- flat-fee or retainer-only agreement owes none.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR (public._agreement_requires_rate_card(p_proposal_id)
        AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms, and role rates whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: R4's floor is asked at the door too, not only where the parts were
  -- written. A composition can reach 'draft' by more than one road —
  -- materialize_standard_parts seeds from a terms row a co-member may have
  -- edited — so the last gate before the client sees the document asks again.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_floor_unmet(p_proposal_id) THEN
    RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
      USING ERRCODE = 'check_violation';
  END IF;
  -- R22: and the fee half of the same floor, in the room's own sentence.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_fee_unnamed(p_proposal_id) THEN
    RAISE EXCEPTION 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00423: the trade arm. A scope is only a document when it says WHO does the
  -- work, WHAT the work is, WHAT it costs, and WHEN the client pays — and when
  -- the last two agree to the cent.
  IF v_proposal.document_kind = 'trade_scope' THEN
    SELECT * INTO v_terms FROM public.trade_scope_terms
    WHERE proposal_id = p_proposal_id;
    IF v_terms.proposal_id IS NULL OR v_terms.party_id IS NULL
       OR COALESCE(v_terms.client_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'trade scope send requires a named party and a client price'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_section_count FROM public.trade_scope_sections
    WHERE proposal_id = p_proposal_id;
    IF v_section_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one scope section'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), COALESCE(sum(amount_cents), 0),
           count(*) FILTER (WHERE gates_on_acceptance),
           max(sort_order),
           max(sort_order) FILTER (WHERE gates_on_acceptance)
    INTO v_draw_count, v_draw_total, v_gate_count, v_max_sort, v_gate_sort
    FROM public.trade_scope_draws WHERE proposal_id = p_proposal_id;
    IF v_draw_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw_total IS DISTINCT FROM v_terms.client_price_cents::bigint THEN
      RAISE EXCEPTION 'trade scope draw schedule must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_count <> 1 THEN
      RAISE EXCEPTION 'trade scope draw schedule must have exactly one acceptance-gated draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_sort IS DISTINCT FROM v_max_sort THEN
      RAISE EXCEPTION 'the acceptance-gated draw must be the last draw in the schedule'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The one-gate and gate-is-last rules hold TRIVIALLY on a single-draw
    -- schedule: with one row, min sort_order = max sort_order, so a lone 100%
    -- "Final · on acceptance" draw satisfies every check above. Execution then
    -- bills the lowest-sort draw at signature — which would invoice the client
    -- the whole scope price the moment they sign, on the strength of a document
    -- that says the money is due on acceptance. The first draw is the deposit by
    -- construction, so it is the one draw that cannot gate. Same selector the
    -- execute rail uses (sort_order, id), so the two can never disagree about
    -- which draw is first.
    SELECT w.gates_on_acceptance INTO v_first_gates
    FROM public.trade_scope_draws w
    WHERE w.proposal_id = p_proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1;
    IF COALESCE(v_first_gates, false) THEN
      RAISE EXCEPTION 'the first draw is billed at signature, so it must not be the acceptance-gated one'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Percentage is display and amount_cents is the money, but a display figure
    -- that contradicts the money beside it is a second payment plan on the same
    -- page — and the client's document renders both. So when the studio states
    -- percentages at all, they must total 100 and each must describe its own
    -- amount. The tolerances are the honest ones: half a point for the total (a
    -- 33.3/33.3/33.4 schedule is a real schedule), and a dollar per line for the
    -- rounding an exact-cents split of an odd price forces.
    SELECT count(*) FILTER (WHERE w.percentage IS NOT NULL),
           COALESCE(sum(w.percentage), 0)
    INTO v_percentage_count, v_percentage_total
    FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id;
    IF v_percentage_count > 0 THEN
      IF abs(v_percentage_total - 100) > 0.5 THEN
        RAISE EXCEPTION 'trade scope draw percentages must total 100'
          USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trade_scope_draws w
        WHERE w.proposal_id = p_proposal_id AND w.percentage IS NOT NULL
          AND abs(round(v_terms.client_price_cents * w.percentage / 100.0)
                  - w.amount_cents) > 100
      ) THEN
        RAISE EXCEPTION 'each trade scope draw percentage must match the amount beside it'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Allocations are optional as a SET. Once the studio starts apportioning the
    -- price across rooms, the apportionment must be complete and exact — a
    -- half-allocated scope tells the client a room costs $X and leaves the rest
    -- of the money unaccounted for.
    SELECT count(*) FILTER (WHERE allocation_cents IS NOT NULL),
           COALESCE(sum(allocation_cents), 0)
    INTO v_allocation_count, v_allocation_total
    FROM public.trade_scope_sections WHERE proposal_id = p_proposal_id;
    IF v_allocation_count > 0
       AND (v_allocation_count <> v_section_count
            OR v_allocation_total IS DISTINCT FROM v_terms.client_price_cents::bigint) THEN
      RAISE EXCEPTION 'trade scope section allocations must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 00578: the design-build arm (P9, P10, P11, R4, R11) ────────────────
  IF v_proposal.document_kind = 'design_build' THEN
    -- R48 (W3R2-01) — the door asks the same question upsert_agreement_parts
    -- asks, because a part hidden before this refusal existed is still on the
    -- stack. _agreement_design_build_part reads the AUTHORED row, so without
    -- this the arm below validates a price the client's projection has
    -- already dropped and the homeowner signs a paper naming none.
    IF EXISTS (
      SELECT 1 FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.variant IN ('pricing_basis', 'draws')
        AND NOT ap.client_visible
    ) THEN
      RAISE EXCEPTION
        'your client signs the price and the draws, so neither can be hidden from her'
        USING ERRCODE = 'check_violation';
    END IF;

    v_pricing_basis := public._agreement_design_build_part(
      p_proposal_id, 'pricing_basis');
    IF v_pricing_basis IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a pricing basis'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_pricing_basis_payload(v_pricing_basis);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- R48 — and the fee half of R22's floor, asked of this class in its own
    -- words. _agreement_fee_unnamed reads pricing_basis through the same
    -- client_visible filter as every other fee, so this is the second reading
    -- of the same rule: whatever else is true, the paper she signs names a
    -- price she can read.
    IF public._agreement_fee_unnamed(p_proposal_id) THEN
      RAISE EXCEPTION 'this agreement names no price your client can read'
        USING ERRCODE = 'check_violation';
    END IF;

    v_draws := public._agreement_design_build_part(p_proposal_id, 'draws');
    IF v_draws IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a draw schedule'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_draws_payload(v_draws);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    v_allowances := public._agreement_design_build_part(
      p_proposal_id, 'allowances');
    IF v_allowances IS NOT NULL THEN
      v_message := public._validate_allowances_payload(
        v_allowances, v_pricing_basis);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_message := public._validate_no_double_count(
      public._agreement_parts_json(p_proposal_id));
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- One contract, one answer about how the trades are priced to the client
    -- (research 02 §9 item 5). It is authored on the sub-disclosure clause,
    -- where the composer's selector lives; the build sheet also allows it
    -- inside the pricing basis, so both are read and a DISAGREEMENT is
    -- refused rather than silently resolved.
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
    IF v_disclosure = 'conflict' THEN
      RAISE EXCEPTION 'this agreement says the trades are priced open-book in one place and closed-book in another'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_disclosure IS NULL THEN
      RAISE EXCEPTION 'say whether the trades are priced open-book or closed-book'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R43: under closed book the schedule of values is the studio's own, not
    -- derived from the cost lines — so there has to be one. Its arithmetic was
    -- already checked by _validate_pricing_basis_payload above; this is the
    -- door that asks for it at all.
    IF v_disclosure <> 'open_book'
       AND jsonb_array_length(
             public._agreement_schedule_of_values(
               v_pricing_basis, v_disclosure)) = 0 THEN
      RAISE EXCEPTION 'a closed-book agreement needs a schedule of values written for your client'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R10: the gate holds at send too, not only at template selection. An
    -- attestation can lapse between composing and sending.
    IF NOT public.studio_has_live_license_attestation(
             public._agreement_studio_id(p_proposal_id, auth.uid())) THEN
      RAISE EXCEPTION 'the design-build template needs a current licensing attestation on file'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11: a notice counsel has not enabled never reaches a client's page,
    -- however the attachment part came to name it.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      JOIN public.agreement_jurisdiction_notices notice
        ON notice.state = NULLIF(btrim(ap.payload->>'jurisdiction'), '')
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND NOT notice.enabled
    ) THEN
      RAISE EXCEPTION 'that jurisdiction notice is held for counsel review and cannot be sent'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11's other half — AN ATTESTATION OF RECEIPT NEEDS SOMETHING RECEIVED.
    -- An attachment on the homeowner's copy that asks her to tick "I received
    -- this" must carry the words she is attesting she received; the tick is
    -- recorded onto her signature row by `part_key`, and a leaf whose wording
    -- is still with counsel would put an empty document into that record.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND ap.client_visible
        AND (ap.payload->'acknowledgeRequired') = 'true'::jsonb
        AND NULLIF(btrim(COALESCE(ap.payload->>'body', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'an attachment your client must confirm she received needs its wording first'
        USING ERRCODE = 'check_violation';
    END IF;

    v_contract_sum := public._agreement_contract_sum_cents(v_pricing_basis);
    SELECT COALESCE(sum(row.gross_cents), 0) INTO v_draw_gross
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    WHERE NOT row.is_retainage_release;
    IF v_draw_gross IS DISTINCT FROM v_contract_sum THEN
      RAISE EXCEPTION 'the draw schedule must come to the contract sum, to the cent'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM 1 FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_sections
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_draws
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'PT409';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    total_amount = CASE
      WHEN v_proposal.document_kind = 'trade_scope'
        THEN COALESCE(v_terms.client_price_cents, total_amount)
      -- 00578: the turnkey prime's total IS the contract sum the pricing
      -- basis names, so the send snapshot, the dispatch row and the client's
      -- bundle all report one number.
      WHEN v_proposal.document_kind = 'design_build'
        THEN COALESCE(v_contract_sum, total_amount)
      ELSE total_amount END,
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  -- The UPDATE above writes hashed fields — total_amount for a trade scope, and
  -- valid_until / personal_message on every rail — so the fingerprint verified
  -- twice before the write is no longer the hash of the document that just left.
  -- Recompute, so what the caller is handed is what
  -- _commercial_document_fingerprint answers about this document now. (Nothing
  -- after this point touches a hashed column: proposal_send_dispatch_id, status,
  -- sent_at and updated_at are all outside _proposal_review_fingerprint.)
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  -- 00578: the draw ledger, laid out from the now-frozen payload. Machine
  -- state, so it lands AFTER the fingerprint that records the authored
  -- document and changes nothing about it (RC-8). Re-send is impossible —
  -- the send door refuses a non-draft — so a plain INSERT is enough, and the
  -- ledger guard admits it because this body is SECURITY DEFINER owned by
  -- postgres.
  IF v_proposal.document_kind = 'design_build' THEN
    INSERT INTO public.agreement_draw_invoices (
      proposal_id, draw_key, sort_order, label,
      gross_cents, retainage_cents, net_cents, is_retainage_release
    )
    SELECT p_proposal_id, row.draw_key, row.sort_order, row.label,
           row.gross_cents, row.retainage_cents, row.net_cents,
           row.is_retainage_release
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    ORDER BY row.sort_order
    ON CONFLICT (proposal_id, draw_key) DO NOTHING;
  END IF;

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;

-- Native _countersign_design_services_agreement_impl from 00619_countersign_rate_binding_carry.sql:33; bounded C2 graft only.
CREATE OR REPLACE FUNCTION public._countersign_design_services_agreement_impl(
  p_proposal_id uuid,
  p_signer_name text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_authority_studio_id uuid;
  v_client_signature public.commercial_document_signatures%ROWTYPE;
  v_studio_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_fingerprint text;
  v_project_id uuid;
  v_document_id uuid;
  v_authority_id uuid;
  v_retainer_invoice_id uuid;
  v_authorized_cents bigint := 0;
  v_pending_entry record;
  v_newly_executed boolean := false;
  v_name text := btrim(COALESCE(p_signer_name, ''));
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_activation text;   -- 00578, R52
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4180 record;
  v_row_4359 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum', 'design_build')
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_commercial_documents AS document
        JOIN public.projects AS project ON project.id = document.project_id
        JOIN public.organizations AS studio ON studio.id = project.studio_id
        JOIN public.organization_members AS actor_membership
          ON actor_membership.organization_id = project.studio_id
         AND actor_membership.user_id = v_actor
        JOIN public.organization_members AS lead_membership
          ON lead_membership.organization_id = project.studio_id
         AND lead_membership.user_id = project.designer_id
        JOIN public.user_roles AS user_role
          ON user_role.user_id = project.designer_id
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE document.proposal_id = proposal.id
          AND document.document_kind = proposal.document_kind
          AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
          AND project.client_id = proposal.client_id
          AND project.status = 'active'
          AND studio.type = 'design_studio'
          AND studio.status = 'active'
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND lead_membership.status = 'active'
          AND lead_membership.role <> 'guest'
          AND role.domain = 'designer'
      )
      OR (
        proposal.document_kind IN ('design_services', 'design_build')
        AND proposal.project_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.project_commercial_documents AS bound_document
          WHERE bound_document.proposal_id = proposal.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_roles AS user_role
          JOIN public.roles AS role ON role.id = user_role.role_id
          WHERE user_role.user_id = proposal.designer_id
            AND role.domain = 'designer'
        )
        -- 00566. Same count-to-membership correction as the signature guard.
        AND EXISTS (
          SELECT 1
          FROM public.organizations AS studio
          JOIN public.organization_members AS lead_membership
            ON lead_membership.organization_id = studio.id
           AND lead_membership.user_id = proposal.designer_id
          JOIN public.organization_members AS actor_membership
            ON actor_membership.organization_id = studio.id
           AND actor_membership.user_id = v_actor
          WHERE studio.type = 'design_studio'
            AND studio.status = 'active'
            AND lead_membership.status = 'active'
            AND lead_membership.role <> 'guest'
            AND actor_membership.status = 'active'
            AND actor_membership.role <> 'guest'
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.project_id, project
  INTO v_row_4180
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS actor_membership
    ON actor_membership.organization_id = project.studio_id
   AND actor_membership.user_id = v_actor
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = v_proposal.document_kind
    AND (v_proposal.project_id IS NULL OR v_proposal.project_id = project.id)
    AND project.client_id = v_proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND actor_membership.status = 'active'
    AND actor_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';

  v_document_id := v_row_4180.id;
  v_project_id := v_row_4180.project_id;
  v_project := v_row_4180.project;

  IF FOUND THEN
    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = v_project_id
      AND project.client_id = v_proposal.client_id
      AND project.designer_id = v_project.designer_id
      AND project.studio_id = v_project.studio_id
      AND project.status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_authority_studio_id := v_project.studio_id;
  ELSE
    -- 00566. The candidate set is EXACTLY 00563's (00563:255-278): the LEAD
    -- designer's own active non-guest memberships in active design studios,
    -- in 00563's order — a studio already hosting a project for this exact
    -- designer-client pair first, then 00317's owner-first, earliest-joined
    -- rule, organization id last for a total order. 00563 also carries
    -- has_designer_domain_role(designer_id) in that set; it is a per-designer
    -- predicate, already required of this lead by the access leg above, so
    -- the two sets are the same rows.
    --
    -- Resolving over the lead-AND-actor intersection instead (as the lowest-
    -- uuid body did) would let this function bind one studio while the
    -- project insert below runs set_project_studio_id, which sees only the
    -- LEAD's studios, and stamps another: a lead in studios A+B countersigned
    -- by a co-member of B alone bound B here and A there, and the trigger
    -- refused in its own opaque words. Both sides now answer the same
    -- question, and the countersigner's standing in the answer is stated
    -- immediately below. No row lock is taken, so the canonical
    -- roles -> user_roles -> memberships -> organization acquisition order
    -- below is unchanged.
    SELECT studio.id
    INTO v_authority_studio_id
    FROM public.organizations AS studio
    JOIN public.organization_members AS lead_membership
      ON lead_membership.organization_id = studio.id
     AND lead_membership.user_id = v_proposal.designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND lead_membership.status = 'active'
      AND lead_membership.role <> 'guest'
    ORDER BY
      EXISTS (
        SELECT 1
        FROM public.projects AS sibling
        WHERE sibling.studio_id = studio.id
          AND sibling.designer_id = v_proposal.designer_id
          AND sibling.client_id = v_proposal.client_id
      ) DESC,
      (lead_membership.role = 'owner') DESC,
      lead_membership.joined_at NULLS LAST,
      lead_membership.created_at,
      studio.id
    LIMIT 1;

    -- The studio above is the LEAD's answer, so the countersigner's own
    -- standing in it is asserted rather than assumed — the same check 00563
    -- makes of set_project_studio_id's actor before it returns. Refusing here
    -- names the failure at the point it happens; the authority legs further
    -- down re-check it under lock. Zero shared studios still fails closed.
    IF v_authority_studio_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      WHERE actor_membership.organization_id = v_authority_studio_id
        AND actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
    ) THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum', 'design_build')
    AND (
      v_project_id IS NULL
      OR proposal.project_id IS NULL
      OR proposal.project_id = v_project_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_document_id IS NOT NULL THEN
    PERFORM document.id
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.proposal_id = v_proposal.id
      AND document.project_id = v_project_id
      AND document.document_kind = v_proposal.document_kind
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = COALESCE(v_project.designer_id, v_proposal.designer_id)
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF v_authority_studio_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_authority_studio_id
    AND membership.user_id = ANY(ARRAY[
      COALESCE(v_project.designer_id, v_proposal.designer_id), v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_authority_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_authority_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = COALESCE(
           v_project.designer_id, v_proposal.designer_id
         )
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR (
       v_project_id IS NULL
       -- 00566. Was `1 <> count(...)`. The lead designer must still hold a
       -- live studio, but plural studios are no longer a refusal: the exact
       -- studio this countersign binds to was resolved above and its lead and
       -- actor memberships are re-checked immediately before this leg.
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_members AS membership
         JOIN public.organizations AS studio
           ON studio.id = membership.organization_id
         WHERE membership.user_id = v_proposal.designer_id
           AND membership.status = 'active'
           AND membership.role <> 'guest'
           AND studio.type = 'design_studio'
           AND studio.status = 'active'
       )
     )
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR SHARE;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_client_signature.id IS NULL
     OR v_client_signature.signer_user_id IS DISTINCT FROM v_proposal.client_id
     OR v_client_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
  THEN
    RAISE EXCEPTION 'studio countersign requires the exact current client consent fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state = 'executed' THEN
    SELECT document.id AS document_id, document.project_id AS project_id,
           authority.id AS authority_id,
           authority.retainer_invoice_id AS retainer_invoice_id,
           project AS project_row
    INTO v_row_4359
    FROM public.project_commercial_documents AS document
    JOIN public.projects AS project ON project.id = document.project_id
    JOIN public.project_billing_authorities AS authority
      ON authority.commercial_document_id = document.id
    WHERE document.proposal_id = p_proposal_id;

    v_document_id := v_row_4359.document_id;
    v_project_id := v_row_4359.project_id;
    v_authority_id := v_row_4359.authority_id;
    v_retainer_invoice_id := v_row_4359.retainer_invoice_id;
    v_project := v_row_4359.project_row;

    SELECT * INTO v_studio_signature FROM public.commercial_document_signatures
    WHERE proposal_id = p_proposal_id AND party_role = 'studio';
    IF v_document_id IS NULL OR v_studio_signature.id IS NULL
       OR v_studio_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'executed agreement has incomplete authority topology'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'client_signed' THEN
    IF EXISTS (SELECT 1 FROM public.proposal_items i WHERE i.proposal_id = p_proposal_id) THEN
      RAISE EXCEPTION 'design services agreement must not carry furnishing items'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_terms FROM public.proposal_service_terms
    WHERE proposal_id = p_proposal_id;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'studio', v_actor, v_name, v_fingerprint,
      jsonb_build_object('via', 'countersign_design_services_agreement')
    ) RETURNING * INTO v_studio_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_client_signature.signed_at,
      signed_by_name = v_client_signature.signed_name,
      -- 00414: signed_ip is NOT mirrored onto proposals (see the execution
      -- rail above and the column grant at the foot of this file). The
      -- client signature row keeps the IP; public.proposals does not.
      accepted_at = v_studio_signature.signed_at,
      updated_at = now()
    WHERE id = p_proposal_id;

    IF v_proposal.document_kind IN ('design_services', 'design_build') THEN
      -- Current private bridge is the 00398 wrapper around the long-lived
      -- 00331 implementation. It preserves every project/proposal guard.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id, current_date
      );
      SELECT project.* INTO STRICT v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR UPDATE;
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, v_proposal.document_kind, true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;

      -- R52 (W3R2-12) — the deposit joins the house it opened.
      --
      -- The origin deposit was billed at client_signed, when there was no
      -- project to bill it against; the project exists as of the line above.
      -- The GUC is set and restored here rather than left to
      -- _activate_proposal_as_project_authorized, which clears its own.
      IF v_proposal.document_kind = 'design_build' THEN
        v_previous_activation :=
          current_setting('app.proposal_activation_id', true);
        PERFORM set_config(
          'app.proposal_activation_id', p_proposal_id::text, true);
        UPDATE public.invoices AS invoice
        SET project_id = v_project_id
        FROM public.agreement_draw_invoices AS draw
        WHERE draw.proposal_id = p_proposal_id
          AND draw.invoice_id = invoice.id
          AND invoice.project_id IS NULL
          AND invoice.status <> 'void';
        PERFORM set_config(
          'app.proposal_activation_id',
          COALESCE(v_previous_activation, ''), true);
      END IF;

      -- 00475 (R109 ceremony class): execution IS the engagement start.
      -- Anchors the first main-lane phase to the day authority took effect.
      -- Only the origin agreement anchors — an addendum re-executes billing
      -- authority, not the engagement.
      v_anchor_phase_id := public._schedule_engagement_start_phase(v_project_id);
      IF v_anchor_phase_id IS NOT NULL THEN
        PERFORM public._commit_schedule_edit_authorized(
          v_project_id,
          jsonb_build_array(jsonb_build_object(
            'kind', 'phase-anchor',
            'phase_id', v_anchor_phase_id,
            'anchor_date', to_char(current_date, 'YYYY-MM-DD'),
            'source_ref', p_proposal_id
          )),
          'Design services agreement executed',
          p_disclosed_impact,
          'ceremony:design-services-executed'
        );
      END IF;
    ELSE
      SELECT document.id, document.project_id
      INTO v_document_id, v_project_id
      FROM public.project_commercial_documents AS document
      WHERE document.proposal_id = p_proposal_id
        AND document.document_kind = 'service_addendum';
      SELECT project.* INTO v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR UPDATE;
      PERFORM document.id
      FROM public.project_commercial_documents AS document
      WHERE document.id = v_document_id
        AND document.project_id = v_project_id
      FOR UPDATE;
      IF v_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_commercial_documents origin
        JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
        WHERE origin.project_id = v_project_id AND origin.is_origin
          AND origin_proposal.commercial_state = 'executed'
      ) THEN
        RAISE EXCEPTION 'service addendum has no executed project origin'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Different addenda lock different proposal rows. Serialize their
      -- authority replacement on the shared project before ending/inserting
      -- the one active authority enforced by the partial unique index.
      PERFORM 1 FROM public.projects
      WHERE id = v_project_id
      FOR UPDATE;
      UPDATE public.project_commercial_documents
      SET executed_at = v_studio_signature.signed_at
      WHERE id = v_document_id;
      UPDATE public.project_billing_authorities
      SET status = 'superseded', ended_at = v_studio_signature.signed_at
      WHERE project_id = v_project_id AND status = 'active';
    END IF;

    -- Assignment is unconditional; only minting may be paused.
    PERFORM public._scope_after_execution(v_document_id);

    IF v_terms.retainer_amount_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_project_id, v_project.designer_id, v_proposal.client_id, 'draft', 'USD',
        v_terms.retainer_amount_cents, 0, 0, v_terms.retainer_amount_cents,
        'Design services retainer · ' || v_proposal.title
      ) RETURNING id INTO v_retainer_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_retainer_invoice_id, 'adhoc', 'Design services retainer', 1,
        v_terms.retainer_amount_cents, v_terms.retainer_amount_cents,
        jsonb_build_object('commercialDocumentId', v_document_id, 'kind', 'design_services_retainer')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_retainer_invoice_id, current_date, v_actor
      );
    END IF;

    -- 00577 (P5): the four Wave-2 fee columns snapshot with the rest of the
    -- terms row. An authority that cannot say what the fee basis was is an
    -- authority that forgot the agreement the moment it executed.
    INSERT INTO public.project_billing_authorities (
      project_id, commercial_document_id, source_proposal_id,
      billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
      billing_cadence, retainer_invoice_id, effective_at,
      retainer_credit_rule, fee_basis, fee_amount_cents, fee_schedule
    ) VALUES (
      v_project_id, v_document_id, p_proposal_id,
      v_terms.billing_ceiling_cents, v_terms.retainer_amount_cents,
      v_terms.retainer_activation_policy, v_terms.billing_cadence, v_retainer_invoice_id,
      v_studio_signature.signed_at,
      COALESCE(v_terms.retainer_credit_rule, 'credited'),
      v_terms.fee_basis, v_terms.fee_amount_cents, v_terms.fee_schedule
    ) RETURNING id INTO v_authority_id;

    -- 00577 (R12, P6): THE COPY SHE KEEPS. Composed server-side from the
    -- parts she could actually read, stamped with the very fingerprint both
    -- parties signed against, and never re-rendered on a later read — that is
    -- what makes it a keepsake rather than a view. No PDF (R12).
    --
    -- ON CONFLICT DO NOTHING because countersign is retry-safe, and guarded on
    -- the document having parts because a legacy agreement has no composition
    -- to freeze — it executes exactly as it did before this file.
    --
    -- Placed after the authority INSERT, which is after every lock this
    -- function takes, so the authority-lock-order contract is untouched.
    IF EXISTS (SELECT 1 FROM public.proposal_agreement_parts pp
               WHERE pp.proposal_id = p_proposal_id) THEN
      INSERT INTO public.agreement_execution_snapshots (
        proposal_id, html, part_set, document_hash
      ) VALUES (
        p_proposal_id,
        public._render_agreement_snapshot_html(p_proposal_id),
        COALESCE((SELECT jsonb_agg(to_jsonb(pp) - 'created_at' - 'updated_at'
                                   ORDER BY pp.position)
                  FROM public.proposal_agreement_parts pp
                  WHERE pp.proposal_id = p_proposal_id), '[]'::jsonb),
        v_fingerprint
      ) ON CONFLICT (proposal_id) DO NOTHING;
    END IF;

    -- 00619 (HT-4). THE ONE DELTA: the role binding is carried onto the
    -- immutable snapshot. Without it the enum the designer picked lives only on
    -- the proposal, and the card the resolver reads after countersign is a
    -- label again — which is the string match HT-4 deletes.
    INSERT INTO public.project_billing_authority_rates (
      billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents,
      roster_role
    ) SELECT v_authority_id, r.id, r.version, r.role_name, r.hourly_rate_cents,
             r.roster_role
      FROM public.proposal_service_rates r
      WHERE r.proposal_id = p_proposal_id
      ORDER BY r.version, r.sort_order, r.role_name;

    IF v_proposal.document_kind = 'service_addendum' THEN
      SELECT COALESCE(sum(entry.rated_amount_cents), 0)
      INTO v_authorized_cents
      FROM public.project_time_entries entry
      WHERE entry.project_id = v_project_id
        AND entry.billing_state = 'authorized'
        AND entry.billable AND entry.duration_minutes IS NOT NULL;

      -- A replacement ceiling is cumulative across the project. Promote only
      -- the oldest already-rated pending work that now fits; its historical
      -- authority/rate/amount snapshots never change.
      FOR v_pending_entry IN
        SELECT entry.id, entry.rated_amount_cents
        FROM public.project_time_entries entry
        JOIN public.project_billing_authorities prior_authority
          ON prior_authority.id = entry.billing_authority_id
        WHERE entry.project_id = v_project_id
          AND entry.billing_state = 'pending_authorization'
          AND entry.billable AND entry.duration_minutes IS NOT NULL
          AND entry.rated_amount_cents IS NOT NULL
          AND entry.authority_rate_id IS NOT NULL
          AND entry.billing_authority_id <> v_authority_id
          AND (
            prior_authority.retainer_activation_policy = 'immediate'
            OR prior_authority.retainer_amount_cents = 0
            OR EXISTS (
              SELECT 1 FROM public.invoices paid_retainer
              WHERE paid_retainer.id = prior_authority.retainer_invoice_id
                AND paid_retainer.status = 'paid'
                AND paid_retainer.amount_paid_cents >= paid_retainer.total_cents
            )
          )
        ORDER BY entry.started_at, entry.id
        FOR UPDATE OF entry
      LOOP
        -- 00575 (F-2): a NULL ceiling is UNCAPPED. Left as written, the
        -- comparison evaluates NULL, the IF takes the false branch, and
        -- nothing is ever authorized on an uncapped agreement.
        IF v_terms.billing_ceiling_cents IS NULL
           OR v_authorized_cents + v_pending_entry.rated_amount_cents
              <= v_terms.billing_ceiling_cents THEN
          UPDATE public.project_time_entries
          SET billing_state = 'authorized', updated_at = now()
          WHERE id = v_pending_entry.id;
          v_authorized_cents := v_authorized_cents + v_pending_entry.rated_amount_cents;
        END IF;
      END LOOP;
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_executed := true;
  ELSE
    RAISE EXCEPTION 'design services agreement % is not ready to countersign (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'executed',
    'projectId', v_project_id,
    'billingAuthorityId', v_authority_id,
    'retainerInvoiceId', v_retainer_invoice_id,
    'newlyExecuted', v_newly_executed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- The addendum has no commercial-document row yet when its pointer is set.
-- Its recorded billing-source document supplies the project, without new locks.
CREATE OR REPLACE FUNCTION public._guard_proposal_scope_edition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.drafted_against_scope_edition_id IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW.drafted_against_scope_edition_id IS NOT DISTINCT FROM OLD.drafted_against_scope_edition_id) THEN
    RETURN NEW;
  END IF;
  IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid = 'public.create_service_addendum(uuid,text)'::regprocedure)
     OR current_setting('app.scope_edition_writer',true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'scope_edition_sanctioned_writer_required' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.drafted_against_scope_edition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_scope_editions edition
    JOIN public.project_commercial_documents source ON source.project_id = edition.project_id
    WHERE edition.id = NEW.drafted_against_scope_edition_id
      AND source.proposal_id = NEW.parent_proposal_id
      AND NEW.document_kind = 'service_addendum'
      AND (NEW.project_id IS NULL OR NEW.project_id = edition.project_id)
      AND NOT EXISTS (SELECT 1 FROM public.project_commercial_documents document
        WHERE document.proposal_id = NEW.id AND document.project_id <> edition.project_id)
  ) THEN
    RAISE EXCEPTION 'scope_edition_project_mismatch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_proposal_scope_edition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_proposal_scope_edition ON public.proposals;
CREATE TRIGGER guard_proposal_scope_edition BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public._guard_proposal_scope_edition();

-- Native create_service_addendum from 00816_us37_proposal_stamp_residuals.sql:358; bounded C2 graft only.
CREATE OR REPLACE FUNCTION public.create_service_addendum(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_origin public.proposals%ROWTYPE;
  v_source_proposal_id uuid;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_title text := btrim(COALESCE(p_title, ''));
  v_scope_edition_id uuid;
  v_scope_parts jsonb;
  v_scope_part jsonb;
  v_scope_position integer := 1;
  v_previous_scope_writer text := current_setting('app.scope_parts_writer',true);
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'service addendum requires an authenticated author and title'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT origin_proposal.*
  INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin_proposal.commercial_state = 'executed'
    AND public._can_author_proposal(origin_proposal.designer_id)
    -- 00816 (SQ-1258, Astra SQ-1256 F2): the job's team, not any studio the
    -- caller shares with the lead.
    AND public.can_buy_for_project(p_project_id)
  LIMIT 1;
  IF v_origin.id IS NULL THEN
    RAISE EXCEPTION 'project % has no executed design-services authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- Lock order project -> proposal -> document (C2 §2.5): KEY SHARE is the weakest
  -- mode that waits on reconcile/countersign's project FOR UPDATE, and the one the
  -- document FK insert below would take anyway, only now before the source proposal's.
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR KEY SHARE;
  SELECT authority.source_proposal_id
  INTO v_source_proposal_id
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = p_project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC
  LIMIT 1;
  IF v_source_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project % has no active billing authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE((SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),false) THEN
    IF NOT public.can_compose_project_plan(p_project_id) OR NOT public.can_author_scope_proposal(v_origin.id) THEN
      RAISE EXCEPTION 'scope_proposal_access_denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Immutable input may become an old edition immediately after this read;
    -- that is precisely why execution rechecks drafted_against under the job lock.
    SELECT id INTO v_scope_edition_id FROM public.project_scope_editions
    WHERE project_id=p_project_id AND status='active';
  END IF;

  -- 00813 (SQ-1244, F1): this paper is bound to p_project_id below; its
  -- stamp reads that job (stamp_proposal_studio).
  PERFORM set_config('app.proposal_stamp_project_id', p_project_id::text, true);
  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    total_amount, status, version, parent_proposal_id, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_origin.designer_id, v_origin.client_id,
    v_origin.designer_client_id, v_title, 'Additional design-services authority',
    0, 'draft', 1, v_source_proposal_id, v_origin.project_address,
    v_origin.client_visibility_tier, v_origin.feedback_enabled,
    'service_addendum', 'draft'
  );
  PERFORM set_config('app.proposal_stamp_project_id', '', true);
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) SELECT
    v_proposal_id, t.scope, t.deliverables, t.exclusions,
    t.billing_ceiling_cents, 0, 'immediate', t.billing_cadence,
    t.currency, t.terms, t.current_rate_version, t.furnishings_deposit_percent
  FROM public.proposal_service_terms t WHERE t.proposal_id = v_source_proposal_id;
  INSERT INTO public.proposal_service_rates (
    proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
  ) SELECT v_proposal_id, r.version + 1, r.role_name, r.hourly_rate_cents,
      r.sort_order, now()
  FROM public.proposal_service_rates r WHERE r.proposal_id = v_source_proposal_id;
  UPDATE public.proposal_service_terms SET current_rate_version = current_rate_version + 1
  WHERE proposal_id = v_proposal_id;
  IF v_scope_edition_id IS NOT NULL THEN
    PERFORM set_config('app.scope_edition_writer',v_proposal_id::text,true);
    UPDATE public.proposals SET drafted_against_scope_edition_id=v_scope_edition_id WHERE id=v_proposal_id;
    PERFORM set_config('app.scope_edition_writer','',true);
    v_scope_parts := public._scope_parts_from_edition(v_scope_edition_id);
    PERFORM public._normalize_scope_package_parts(v_proposal_id,v_scope_parts);
    PERFORM set_config('app.scope_parts_writer',v_proposal_id::text,true);
    FOR v_scope_part IN SELECT value FROM jsonb_array_elements(v_scope_parts) LOOP
      -- Copy money natively before installing parts, so the existing composed-
      -- projection guard remains effective. The copy RPC later composes money.
      INSERT INTO public.proposal_agreement_parts(proposal_id,position,kind,part_key,title,payload)
      VALUES(v_proposal_id,v_scope_position,v_scope_part->>'kind',v_scope_part->>'partKey',
        v_scope_part->>'title',v_scope_part->'payload');
      v_scope_position := v_scope_position+1;
    END LOOP;
    PERFORM set_config('app.scope_parts_writer',COALESCE(v_previous_scope_writer,''),true);
  END IF;
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, source_proposal_id, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'service_addendum', v_source_proposal_id, v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id, 'documentId', v_document_id,
    'projectId', p_project_id, 'documentKind', 'service_addendum',
    'commercialState', 'draft'
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_parts_writer',COALESCE(v_previous_scope_writer,''),true);
  RAISE;
END;
$$;

-- Native copy_agreement_parts_from_authority from 00577_agreement_fee_schedules.sql:2861; bounded C2 graft only.
CREATE OR REPLACE FUNCTION public.copy_agreement_parts_from_authority(
  p_proposal_id uuid,
  p_why text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_project_id uuid;
  v_source_proposal_id uuid;
  v_parts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'composing an addendum requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind <> 'service_addendum' THEN
    RAISE EXCEPTION 'only an addendum carries the parts already in force'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT document.project_id INTO v_project_id
  FROM public.project_commercial_documents document
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'service_addendum';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'this addendum is not bound to a project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The same read create_service_addendum makes at 00422:1849-1858.
  SELECT authority.source_proposal_id INTO v_source_proposal_id
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = v_project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC
  LIMIT 1;
  IF v_source_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project % has no active billing authority', v_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verbatim, in the same order, with new ids: upsert_agreement_parts is
  -- DELETE-then-INSERT and re-keys every row. sourceTemplateKey and
  -- sourcePartId ride across, because an addendum's part came from wherever
  -- the origin's did.
  SELECT jsonb_agg(jsonb_build_object(
           'kind', ap.kind,
           'variant', ap.variant,
           'partKey', ap.part_key,
           'title', ap.title,
           'payload', ap.payload,
           'required', ap.required,
           'clientVisible', ap.client_visible,
           'sourceTemplateKey', ap.source_template_key,
           'sourcePartId', ap.source_part_id
         ) ORDER BY ap.position, ap.id)
  INTO v_parts
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = v_source_proposal_id;

  IF v_proposal.drafted_against_scope_edition_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.project_scope_editions
      WHERE id = v_proposal.drafted_against_scope_edition_id AND project_id = v_project_id) THEN
      RAISE EXCEPTION 'scope_edition_project_mismatch' USING ERRCODE = 'check_violation';
    END IF;
    -- Scope comes from the frozen predecessor, not mutable billing-source
    -- parts. Inherited bindings are carried in the edition, never re-declared.
    SELECT COALESCE(jsonb_agg(p ORDER BY ord),'[]') INTO v_parts
    FROM jsonb_array_elements(COALESCE(v_parts,'[]')) WITH ORDINALITY AS e(p,ord)
    WHERE p->>'kind' NOT IN ('scope_package','acceptance_signer_policy');
    v_parts := v_parts || public._scope_parts_from_edition(v_proposal.drafted_against_scope_edition_id);
  END IF;

  IF v_parts IS NULL OR jsonb_array_length(v_parts) = 0 THEN
    -- The agreement in force was never composed. That is not an error: the
    -- addendum simply starts from the seven facets it inherited, and the room
    -- seeds the standard parts on first open exactly as it does elsewhere.
    RETURN 0;
  END IF;

  PERFORM public.upsert_agreement_parts(p_proposal_id, v_parts, p_why);
  RETURN jsonb_array_length(v_parts);
END;
$$;

REVOKE ALL ON FUNCTION public._normalize_scope_package_parts(uuid,jsonb) FROM PUBLIC, anon, authenticated;
