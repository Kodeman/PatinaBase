-- 00868 — Round-8 scope composition foundation (C2; inactive).
-- upsert/materialize lineage: 00618; discard: 00575 (native bodies preserved).
-- SQ-2000: proposal-first writer attestation; storage trigger acquires no locks.
-- No execution graft, legacy backfill, signer inference or activation here.
-- Execution/reconciliation are separate slices; C4/C5 do not exist yet.

CREATE TABLE IF NOT EXISTS public.server_capabilities (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.server_capabilities(key, enabled) VALUES ('scope_editions', false)
ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.server_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.server_capabilities FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_author_scope_proposal(p_proposal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.proposals pr WHERE pr.id = p_proposal_id
    AND CASE WHEN pr.studio_id IS NOT NULL THEN
      public.is_active_studio_member(pr.studio_id)
      AND public._can_author_proposal(pr.designer_id)
    ELSE pr.designer_id = (SELECT auth.uid()) END);
$$;
REVOKE ALL ON FUNCTION public.can_author_scope_proposal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_compose_project_plan(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id
    AND CASE WHEN public.project_recorded_studio(p.id) IS NOT NULL THEN
      public.is_active_studio_member(public.project_recorded_studio(p.id))
      AND public.is_design_studio_comember(p.designer_id)
    ELSE p.designer_id = (SELECT auth.uid()) END);
$$;
-- C1 will grant its read predicate when its active composition surface lands.
REVOKE ALL ON FUNCTION public.can_compose_project_plan(uuid) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.project_scope_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  edition_number integer NOT NULL CHECK (edition_number >= 1),
  kind text NOT NULL CHECK (kind IN ('baseline', 'amendment')),
  commercial_document_id uuid NOT NULL UNIQUE REFERENCES public.project_commercial_documents(id),
  source_proposal_id uuid NOT NULL REFERENCES public.proposals(id),
  predecessor_edition_id uuid REFERENCES public.project_scope_editions(id),
  agreement_fingerprint text NOT NULL,
  effective_at timestamptz NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'stale', 'superseded')),
  superseded_at timestamptz,
  superseded_by_edition_id uuid REFERENCES public.project_scope_editions(id),
  stale_at timestamptz,
  stale_reason text,
  stale_commercial_document_id uuid REFERENCES public.project_commercial_documents(id),
  stale_execution_seq bigint CHECK (stale_execution_seq >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, edition_number),
  CHECK ((kind = 'baseline' AND predecessor_edition_id IS NULL)
      OR (kind = 'amendment' AND predecessor_edition_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_scope_one_active
  ON public.project_scope_editions(project_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.project_scope_edition_packages (
  edition_id uuid NOT NULL REFERENCES public.project_scope_editions(id),
  package_key text NOT NULL CHECK (package_key ~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  label text NOT NULL CHECK (btrim(label) <> ''),
  room_ids uuid[] NOT NULL DEFAULT '{}',
  inclusion text NOT NULL CHECK (inclusion IN ('included', 'excluded', 'conditional')),
  condition_text text,
  responsibilities jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}',
  override_of text CHECK (override_of ~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  design_owed_since integer CHECK (design_owed_since >= 1),
  installation_owed_since integer CHECK (installation_owed_since >= 1),
  PRIMARY KEY (edition_id, package_key),
  CHECK (inclusion <> 'conditional' OR btrim(COALESCE(condition_text, '')) <> ''),
  CHECK ((jsonb_typeof(responsibilities) = 'object'
    AND responsibilities ?& ARRAY['design','purchasing','payer','fabrication_contract','installation']
    AND responsibilities - ARRAY['design','purchasing','payer','fabrication_contract','installation'] = '{}'::jsonb
    AND responsibilities->>'design' IN ('studio','client','gc','other','none')
    AND responsibilities->>'purchasing' IN ('studio','client','gc','other','none')
    AND responsibilities->>'payer' IN ('studio','client','gc','other','none')
    AND responsibilities->>'fabrication_contract' IN ('studio','client','gc','other','none')
    AND responsibilities->>'installation' IN ('studio','client','gc','other','none')) IS TRUE)
);
CREATE TABLE IF NOT EXISTS public.project_scope_edition_phases (
  edition_id uuid NOT NULL REFERENCES public.project_scope_editions(id),
  source_proposal_phase_id uuid NOT NULL,
  -- No cascading FK: a removed phase must remain a visible unbound obligation.
  project_phase_id uuid,
  package_key text CHECK (package_key ~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  service_slot text CHECK (service_slot IN ('design', 'installation')),
  bound_in_edition integer CHECK (bound_in_edition >= 1),
  PRIMARY KEY (edition_id, source_proposal_phase_id),
  FOREIGN KEY (edition_id, package_key)
    REFERENCES public.project_scope_edition_packages(edition_id, package_key),
  CHECK ((package_key IS NULL AND service_slot IS NULL AND bound_in_edition IS NULL)
      OR (package_key IS NOT NULL AND service_slot IS NOT NULL AND bound_in_edition IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.project_scope_edition_signers (
  edition_id uuid NOT NULL REFERENCES public.project_scope_editions(id),
  slot text NOT NULL CHECK (btrim(slot) <> ''),
  required boolean NOT NULL,
  profile_id uuid REFERENCES public.profiles(id),
  household_person_id uuid REFERENCES public.studio_contacts(id),
  policy_revision integer NOT NULL CHECK (policy_revision >= 1),
  PRIMARY KEY (edition_id, slot),
  CHECK ((profile_id IS NULL) <> (household_person_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.project_commercial_execution_order (
  project_id uuid NOT NULL REFERENCES public.projects(id),
  execution_seq bigint NOT NULL CHECK (execution_seq >= 1),
  commercial_document_id uuid NOT NULL UNIQUE REFERENCES public.project_commercial_documents(id),
  predecessor_document_id uuid REFERENCES public.project_commercial_documents(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  legacy_order boolean NOT NULL DEFAULT false,
  PRIMARY KEY (project_id, execution_seq)
);
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS drafted_against_scope_edition_id uuid
  REFERENCES public.project_scope_editions(id);

-- Presets are versioned server-owned compositions, not appointments or authority.
-- No product defaults are inferred from the illustrative contract examples.
CREATE TABLE IF NOT EXISTS public.service_arrangements (
  arrangement_key text NOT NULL CHECK (btrim(arrangement_key) <> ''),
  version integer NOT NULL CHECK (version >= 1),
  phase_template_slug text NOT NULL REFERENCES public.phase_templates(slug),
  parts jsonb NOT NULL CHECK (jsonb_typeof(parts) = 'array'),
  PRIMARY KEY (arrangement_key, version)
);
CREATE TABLE IF NOT EXISTS public.proposal_service_arrangement_applications (
  proposal_id uuid NOT NULL REFERENCES public.proposals(id),
  request_id uuid NOT NULL,
  arrangement_key text NOT NULL,
  arrangement_version integer NOT NULL,
  phase_ids uuid[] NOT NULL,
  part_keys text[] NOT NULL,
  effect_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, request_id),
  FOREIGN KEY (arrangement_key, arrangement_version)
    REFERENCES public.service_arrangements(arrangement_key, version)
);

CREATE OR REPLACE FUNCTION public._guard_scope_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'project_scope_editions' AND TG_OP = 'UPDATE' THEN
    IF current_setting('app.scope_edition_id', true) = OLD.id::text
       AND (OLD.status, NEW.status) IN (('active', 'stale'), ('active', 'superseded'), ('stale', 'superseded'))
       AND (to_jsonb(NEW) - ARRAY['status','stale_at','stale_reason','stale_commercial_document_id','stale_execution_seq','superseded_at','superseded_by_edition_id'])
         = (to_jsonb(OLD) - ARRAY['status','stale_at','stale_reason','stale_commercial_document_id','stale_execution_seq','superseded_at','superseded_by_edition_id'])
    THEN RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'scope_record_immutable' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public._guard_scope_immutable() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_scope_editions','project_scope_edition_packages',
      'project_scope_edition_phases','project_scope_edition_signers',
      'project_commercial_execution_order','proposal_service_arrangement_applications','service_arrangements']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS scope_immutable ON public.%I', t);
    EXECUTE format('CREATE TRIGGER scope_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._guard_scope_immutable()', t);
  END LOOP;
END;
$$;

-- Keep ACLs top-level: the legacy-grants seed extractor skips DO bodies.
REVOKE ALL ON public.project_scope_editions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.project_scope_edition_packages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.project_scope_edition_phases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.project_scope_edition_signers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.project_commercial_execution_order FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.proposal_service_arrangement_applications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.service_arrangements FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._assert_scope_composition_enabled()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT COALESCE((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), false) THEN
    RAISE EXCEPTION 'scope_editions_inactive' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_scope_composition_enabled() FROM PUBLIC, anon, authenticated;

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
REVOKE ALL ON FUNCTION public._normalize_scope_package_parts(uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- Sanctioned writers lock/recheck the proposal before touching children. This
-- trigger must never acquire a parent lock: UPDATE/DELETE already own the child.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_scope_package_key_unique
  ON public.proposal_agreement_parts (proposal_id, (payload->>'packageKey'))
  WHERE kind = 'scope_package';

CREATE OR REPLACE FUNCTION public._guard_scope_package_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE parts jsonb; writer text := current_setting('app.scope_parts_writer', true);
BEGIN
  IF (TG_OP <> 'DELETE' AND NEW.kind = 'scope_package')
     OR (TG_OP <> 'INSERT' AND OLD.kind = 'scope_package') THEN
    -- A caller-set marker alone cannot attest the native parent-lock protocol.
    IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(proowner) FROM pg_proc
        WHERE oid = 'public._guard_scope_package_storage()'::regprocedure) THEN
      RAISE EXCEPTION 'scope_parts_sanctioned_writer_required' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM public._assert_scope_composition_enabled();
    IF TG_OP = 'UPDATE' AND OLD.proposal_id IS DISTINCT FROM NEW.proposal_id THEN
      RAISE EXCEPTION 'scope_package_proposal_move_forbidden' USING ERRCODE = 'check_violation';
    END IF;
    IF (TG_OP <> 'DELETE' AND writer IS DISTINCT FROM NEW.proposal_id::text)
       OR (TG_OP <> 'INSERT' AND writer IS DISTINCT FROM OLD.proposal_id::text) THEN
      RAISE EXCEPTION 'scope_parts_sanctioned_writer_required' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.kind = 'scope_package' THEN
    PERFORM public._assert_scope_composition_enabled();
    IF NOT public.can_author_scope_proposal(OLD.proposal_id) THEN
      RAISE EXCEPTION 'scope_proposal_access_denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.kind = 'scope_package' OR (TG_OP = 'UPDATE' AND OLD.kind = 'scope_package') THEN
    PERFORM public._assert_scope_composition_enabled();
    IF NOT public.can_author_scope_proposal(NEW.proposal_id) THEN
      RAISE EXCEPTION 'scope_proposal_access_denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.kind = 'scope_package' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', ap.kind, 'payload', ap.payload)), '[]')
      INTO parts FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = NEW.proposal_id AND ap.id <> NEW.id AND ap.kind = 'scope_package';
      parts := parts || jsonb_build_array(jsonb_build_object('kind',NEW.kind,'payload',NEW.payload));
      IF NOT (NEW.payload ? 'packageKey') THEN
        RAISE EXCEPTION 'scope_package_key_invalid' USING ERRCODE = 'check_violation';
      END IF;
      parts := public._normalize_scope_package_parts(NEW.proposal_id,parts);
      NEW.payload := parts->(jsonb_array_length(parts)-1)->'payload';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_scope_package_storage() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_scope_package_storage ON public.proposal_agreement_parts;
CREATE TRIGGER guard_scope_package_storage BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_agreement_parts
FOR EACH ROW EXECUTE FUNCTION public._guard_scope_package_storage();

CREATE OR REPLACE FUNCTION public._scope_arrangement_effect(p_proposal_id uuid, p_phase_ids uuid[])
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT md5(jsonb_build_object(
    'phases',public._proposal_phase_effect_snapshot(p_proposal_id,p_phase_ids),
    'parts',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',kind,'variant',variant,
      'partKey',part_key,'title',title,'payload',payload,'required',required,
      'clientVisible',client_visible,'sourceTemplateKey',source_template_key,'sourcePartId',source_part_id)
      ORDER BY position) FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id),'[]'::jsonb)
    )::text);
$$;
REVOKE ALL ON FUNCTION public._scope_arrangement_effect(uuid,uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_service_arrangement(p_proposal_id uuid, p_arrangement_key text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pr public.proposals%ROWTYPE; preset public.service_arrangements%ROWTYPE;
  receipt public.proposal_service_arrangement_applications%ROWTYPE;
  phase_ids uuid[]; part_keys text[]; effect text; replayed boolean := false;
BEGIN
  SELECT * INTO pr FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_author_scope_proposal(p_proposal_id) THEN
    RAISE EXCEPTION 'scope_proposal_access_denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._assert_scope_composition_enabled();
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'scope_arrangement_draft_request_required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO receipt FROM public.proposal_service_arrangement_applications
    WHERE proposal_id = p_proposal_id AND request_id = p_request_id;
  IF FOUND AND receipt.arrangement_key IS DISTINCT FROM p_arrangement_key THEN
    RAISE EXCEPTION 'arrangement_already_applied' USING ERRCODE = 'check_violation';
  END IF;
  IF receipt.request_id IS NULL THEN
    SELECT * INTO receipt FROM public.proposal_service_arrangement_applications
      WHERE proposal_id = p_proposal_id ORDER BY created_at, request_id LIMIT 1;
  END IF;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.arrangement_key IS DISTINCT FROM p_arrangement_key THEN
      RAISE EXCEPTION 'arrangement_already_applied' USING ERRCODE = 'check_violation';
    END IF;
    IF receipt.effect_hash IS DISTINCT FROM public._scope_arrangement_effect(p_proposal_id,receipt.phase_ids) THEN
      RAISE EXCEPTION 'arrangement_effect_changed' USING ERRCODE = 'serialization_failure';
    END IF;
    phase_ids := receipt.phase_ids; part_keys := receipt.part_keys; effect := receipt.effect_hash;
    replayed := true;
  ELSE
    IF pr.status <> 'draft' THEN
      RAISE EXCEPTION 'scope_arrangement_draft_request_required' USING ERRCODE = 'check_violation';
    END IF;
    -- Only a new composition selects the latest immutable version. Replays
    -- and aliases above remain bound to the version in their durable receipt.
    SELECT * INTO preset FROM public.service_arrangements WHERE arrangement_key = p_arrangement_key
      ORDER BY version DESC LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'arrangement_not_found' USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(id),'{}') INTO phase_ids
      FROM public.apply_phase_template(p_proposal_id,preset.phase_template_slug,p_request_id) id;
    -- Keep unrelated authored parts; reject key collisions via the native writer.
    PERFORM public.upsert_agreement_parts(p_proposal_id,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',kind,'variant',variant,'partKey',part_key,
        'title',title,'payload',payload,'required',required,'clientVisible',client_visible,
        'sourceTemplateKey',source_template_key,'sourcePartId',source_part_id) ORDER BY position)
        FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id),'[]'::jsonb) || preset.parts,
      'Apply service arrangement');
    SELECT COALESCE(array_agg(part_key ORDER BY position),'{}') INTO part_keys
      FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;
    effect := public._scope_arrangement_effect(p_proposal_id,phase_ids);
  END IF;
  INSERT INTO public.proposal_service_arrangement_applications
    (proposal_id,request_id,arrangement_key,arrangement_version,phase_ids,part_keys,effect_hash,created_by)
  VALUES (p_proposal_id,p_request_id,p_arrangement_key,
    CASE WHEN replayed THEN receipt.arrangement_version ELSE preset.version END,
    phase_ids,part_keys,effect,auth.uid()) ON CONFLICT (proposal_id,request_id) DO NOTHING;
  RETURN jsonb_build_object('proposalId',p_proposal_id,'arrangementKey',p_arrangement_key,
    'arrangementVersion',CASE WHEN replayed THEN receipt.arrangement_version ELSE preset.version END,
    'phaseIds',phase_ids,'partKeys',part_keys,'replayed',replayed);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_service_arrangement(uuid,text,uuid) FROM PUBLIC, anon, authenticated;

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


-- Native proposal-first writers; only attestation lines are added.
CREATE OR REPLACE FUNCTION public.materialize_standard_parts(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_defaults public.studio_agreement_defaults%ROWTYPE;
  v_studio_id uuid;
  v_existing integer;
  v_deliverables jsonb;
  v_exclusions jsonb;
  v_rate_card jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'materializing the standard parts requires an authenticated author'
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
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent: two tabs opening the room do not double-seed.
  SELECT count(*) INTO v_existing FROM public.proposal_agreement_parts
  WHERE proposal_id = p_proposal_id;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object(
      'proposalId', p_proposal_id,
      'materialized', false,
      'partCount', v_existing,
      'parts', COALESCE((
        SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
        FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
      ), '[]'::jsonb)
    );
  END IF;

  SELECT * INTO v_terms FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id;

  -- Read-only studio resolution. The project's studio when the document is
  -- bound; otherwise the lead designer's own studio in set_project_studio_id's
  -- order (00563:266-277), minus the sibling-project leg, which needs a client
  -- this read does not have. A missing defaults row is not an error.
  SELECT pr.studio_id INTO v_studio_id
  FROM public.projects pr WHERE pr.id = v_proposal.project_id;
  IF v_studio_id IS NULL THEN
    SELECT membership.organization_id INTO v_studio_id
    FROM public.organization_members AS membership
    JOIN public.organizations AS studio
      ON studio.id = membership.organization_id
    WHERE membership.user_id = v_proposal.designer_id
      AND membership.status = 'active'
      AND membership.role <> 'guest'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
    ORDER BY
      (membership.role = 'owner') DESC,
      membership.joined_at NULLS LAST,
      membership.created_at,
      membership.organization_id
    LIMIT 1;
  END IF;
  IF v_studio_id IS NOT NULL THEN
    SELECT * INTO v_defaults FROM public.studio_agreement_defaults
    WHERE studio_id = v_studio_id;
  END IF;

  v_deliverables := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', extensions.gen_random_uuid()::text, 'text', d.value #>> '{}'
    ) ORDER BY d.ord)
    FROM jsonb_array_elements(COALESCE(v_terms.deliverables, '[]'::jsonb))
      WITH ORDINALITY AS d(value, ord)
  ), '[]'::jsonb);
  IF jsonb_array_length(v_deliverables) = 0 THEN
    v_deliverables := (
      SELECT jsonb_agg(jsonb_build_object(
        'id', extensions.gen_random_uuid()::text, 'text', d.value
      ) ORDER BY d.ord)
      FROM unnest(ARRAY[
        'Concept presentation', 'Design documentation', 'Selection schedules'
      ]) WITH ORDINALITY AS d(value, ord)
    );
  END IF;

  v_exclusions := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', extensions.gen_random_uuid()::text, 'text', x.value #>> '{}'
    ) ORDER BY x.ord)
    FROM jsonb_array_elements(COALESCE(v_terms.exclusions, '[]'::jsonb))
      WITH ORDINALITY AS x(value, ord)
  ), '[]'::jsonb);
  IF jsonb_array_length(v_exclusions) = 0 THEN
    v_exclusions := COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', extensions.gen_random_uuid()::text, 'text', x.value #>> '{}'
      ) ORDER BY x.ord)
      FROM jsonb_array_elements(COALESCE(v_defaults.default_exclusions, '[]'::jsonb))
        WITH ORDINALITY AS x(value, ord)
    ), '[]'::jsonb);
  END IF;
  IF jsonb_array_length(v_exclusions) = 0 THEN
    v_exclusions := (
      SELECT jsonb_agg(jsonb_build_object(
        'id', extensions.gen_random_uuid()::text, 'text', x.value
      ) ORDER BY x.ord)
      FROM unnest(ARRAY[
        'Construction labor', 'Furnishings, freight, tax, and installation'
      ]) WITH ORDINALITY AS x(value, ord)
    );
  END IF;

  -- (B-9) The date each rate took effect is seeded with it, so opening the
  -- Contract Room and saving does not re-stamp a back-dated rate to today.
  -- (HT-4, 00618 delta 1) The binding rides with the label. Without it the
  -- composer re-opens a bound card as unbound, the designer picks again, and
  -- the save DELETE-then-INSERTs the row with roster_role NULL — the binding
  -- is lost on the round trip through the room it was made in.
  v_rate_card := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents,
      'sortOrder', r.sort_order,
      'rosterRole', r.roster_role,
      'effectiveAt', r.effective_at
    ) ORDER BY r.sort_order, r.role_name)
    FROM public.proposal_service_rates r
    WHERE r.proposal_id = p_proposal_id
      AND r.version = COALESCE(v_terms.current_rate_version, 1)
  ), '[]'::jsonb);
  -- (HT-4, 00618 delta 2) And so does the STUDIO's default card, which is the
  -- card a studio actually configures: this arm is what seeds a brand-new
  -- agreement, and a seed that dropped the binding would hand every new
  -- document the stranding defect back. Projected key by key rather than
  -- passed through whole, so a value outside the four (or a label with no
  -- binding beside it) reaches the part as the unchosen state instead of as a
  -- card `upsert_agreement_parts` will refuse to save.
  IF jsonb_array_length(v_rate_card) = 0 THEN
    v_rate_card := COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'roleName', COALESCE(d.value->>'roleName', ''),
        'hourlyRateCents',
          CASE WHEN d.value->>'hourlyRateCents' ~ '^[0-9]+(\.[0-9]+)?$'
            THEN round((d.value->>'hourlyRateCents')::numeric)
            ELSE 0 END,
        'sortOrder',
          CASE WHEN d.value->>'sortOrder' ~ '^[0-9]+$'
            THEN (d.value->>'sortOrder')::integer
            ELSE (d.ord - 1)::integer END,
        'rosterRole',
          CASE WHEN d.value->>'rosterRole' IN
                 ('lead_designer', 'support_designer', 'bookkeeper', 'vendor')
            THEN d.value->>'rosterRole' END
      ) ORDER BY
        CASE WHEN d.value->>'sortOrder' ~ '^[0-9]+$'
          THEN (d.value->>'sortOrder')::integer
          ELSE (d.ord - 1)::integer END,
        d.ord)
      FROM jsonb_array_elements(COALESCE(v_defaults.rate_card, '[]'::jsonb))
        WITH ORDINALITY AS d(value, ord)
      WHERE jsonb_typeof(d.value) = 'object'
        AND COALESCE(d.value->>'roleName', '') <> ''
    ), '[]'::jsonb);
  END IF;

  -- (B-7) The same widen upsert_agreement_parts performs at its own door.
  -- Seeding is the act that makes a document composed, and the client's
  -- bundle takes the RETIRED early-return for document_kind 'legacy' — so
  -- nine parts would be hashed into the fingerprint she signs against and
  -- invisible on the page she reads. commercial_state is deliberately NOT
  -- touched here: seeding lays out what already exists, and the first real
  -- save through upsert_agreement_parts is what authors.
  UPDATE public.proposals
  SET document_kind = 'design_services', updated_at = now()
  WHERE id = p_proposal_id AND document_kind = 'legacy';

  PERFORM set_config('app.scope_parts_writer', p_proposal_id::text, true);
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible
  ) VALUES
    (p_proposal_id, 1, 'clause', NULL, 'patina.services', 'Services',
     jsonb_build_object('body', COALESCE(NULLIF(v_terms.scope, ''),
       'Interior design services, including concept development, design documentation, and selections.')),
     true, true),
    (p_proposal_id, 2, 'list', NULL, 'patina.deliverables', 'Deliverables',
     jsonb_build_object('items', v_deliverables), false, true),
    (p_proposal_id, 3, 'list', NULL, 'patina.exclusions', 'Exclusions',
     jsonb_build_object('items', v_exclusions), false, true),
    (p_proposal_id, 4, 'schedule', 'rate_card', 'patina.role_rates', 'Role rates',
     jsonb_build_object('roles', v_rate_card), false, true),
    (p_proposal_id, 5, 'schedule', 'ceiling', 'patina.ceiling', 'Ceiling',
     jsonb_build_object('cents', v_terms.billing_ceiling_cents), false, true),
    -- (R3-5) The deposit is seeded ONLY from a percent somebody set — this
    -- document's own, or the studio's default. The 50 the furnishings
    -- authorization falls back to is a house constant, not a term of this
    -- agreement: seeded here it printed "50% deposit" on the page the
    -- homeowner signs, three paragraphs above the sentence saying furnishings
    -- require a separate named authorization. Unset stays unset, and the
    -- client's copy prints no deposit term at all.
    (p_proposal_id, 6, 'schedule', 'procurement', 'patina.deposit', 'Furnishings deposit',
     jsonb_build_object('depositPercent',
       COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent)),
     false, true),
    -- (R28) Nothing the designer did not type prints as a MONEY term. A
    -- retainer is an amount, and an amount nobody wrote is unwritten: the old
    -- COALESCE(..., 0) invented a figure for a draft with no terms row. Unset
    -- stays unset; the room's readiness panel asks for it, and the projection
    -- still falls to 0 when it writes the money row, exactly as before.
    -- (A billing cadence is not an amount — see the amendment below it.)
    (p_proposal_id, 7, 'schedule', 'retainer', 'patina.retainer', 'Retainer',
     jsonb_build_object(
       'cents', v_terms.retainer_amount_cents,
       'creditRule', COALESCE(v_defaults.retainer_credit_rule, 'credited'),
       'activationPolicy', COALESCE(v_terms.retainer_activation_policy, 'immediate')),
     false, true),
    -- (R28 amended — re-gate 2, F1, rulings-2026-09-06.md.) billing_cadence is
    -- NOT NULL DEFAULT 'monthly', so on any document that HAS a terms row this
    -- part is seeded 'monthly' whatever the COALESCE says. Ruled deliberate: a
    -- cadence saved from the seven-facet room counts as chosen — the room shows
    -- the select with Monthly preselected and the designer saves it, exactly as
    -- today's shipped agreement does, and the composed room shows the cadence
    -- part the same way.
    --
    -- The last COALESCE arm is the FRESH DRAFT, which the amendment did not
    -- have in view: a document with no terms row at all seeded {"cadence":
    -- null} while the composed room's select showed Monthly preselected, so
    -- readiness demanded a cadence the designer could see was already chosen —
    -- and re-picking the selected option fires no change event, so there was no
    -- act that cleared it. The seven-facet room writes 'monthly' onto exactly
    -- this draft (emptyTerms), so 'monthly' is what the part carries here too.
    -- The part says what the editor shows, on every road in.
    (p_proposal_id, 8, 'schedule', 'cadence', 'patina.cadence', 'Billing cadence',
     jsonb_build_object('cadence',
       COALESCE(v_terms.billing_cadence, v_defaults.cadence, 'monthly')),
     false, true),
    (p_proposal_id, 9, 'clause', NULL, 'patina.terms', 'Terms',
     jsonb_build_object('body', COALESCE(v_terms.terms, '')), true, true);
  PERFORM set_config('app.scope_parts_writer', '', true);

  -- R4's floor is deliberately NOT asked here. Seeding is not composing: this
  -- reads a state that already exists — a terms row a co-member may have
  -- cleared the ceiling on while the document was a draft
  -- (proposal_service_terms_studio_rw, 00412:318), or a studio default rate
  -- card with no default ceiling beside it — and lays it out as parts so the
  -- room can show it. Refusing here would lock that studio out of the
  -- composer altogether, with a sentence about a part it has not been shown
  -- yet. The room's readiness panel names the missing ceiling the moment the
  -- rail renders, and send / sign / the paper door each refuse to let the
  -- document leave draft — which is where the harm was: an uncapped hourly
  -- agreement that seeded, and then SENT. The save door does not ask it
  -- either, for the same reason this one does not: a draft is allowed to be
  -- unfinished (see upsert_agreement_parts).
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'materialized', true,
    'partCount', 9,
    'parts', COALESCE((
      SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_agreement_parts(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_discarded integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'leaving the parts behind requires an authenticated author'
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
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.scope_parts_writer', p_proposal_id::text, true);
  DELETE FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;
  GET DIAGNOSTICS v_discarded = ROW_COUNT;
  PERFORM set_config('app.scope_parts_writer', '', true);

  -- The fingerprint goes back to what it was before the first part landed:
  -- the 'parts' key is conditional (F-1), so a parts-less document hashes
  -- byte-identically to today.
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'discarded', v_discarded,
    'partCount', 0,
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id)
  );
END;
$$;
