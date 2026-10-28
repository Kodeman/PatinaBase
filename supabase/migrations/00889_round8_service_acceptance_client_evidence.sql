-- 00889 Round 8 C4 client evidence reader (US-52 W5 WP-10C-f). A read, so it
-- is granted to authenticated and stays readable while every C4 mutation is
-- inactive (00886, 00888).
--
-- Contract: docs/design/designer-portal-round8/contracts/C4-evidence-acceptance.md
-- §2.2 (get_my_service_acceptance_evidence), §2.7, §2.8.
--
-- A20: a homeowner reads what they are accepting. get_my_service_acceptance_requests
-- (00886) returns only the bound ids and hashes; this reader returns, for one
-- request, the client-safe content those hashes were taken from:
--   scope     project_scope_editions.content of the bound edition (its
--             content_hash is sha256(content::text), copied to the request at
--             create). Per package: key, label, inclusion, conditionText (the
--             signed agreement's own condition, shown to the client on the
--             agreement page), the design/purchasing/installation parties, and
--             the names of the agreement phases bound to it. Never room ids,
--             provenance, owed-since counters, payer or fabrication contract,
--             signer identities or fees.
--   evidence  evidence_manifests.members of the bound manifest (its
--             manifest_hash is taken over exactly that array, C1 §4). Per
--             member: kind, a client-safe title, an issued time, a per-kind
--             allowlisted content projection (NULL for plan kinds) and the
--             project-documents objects behind plan prints or a ready spec
--             book approval artifact. Never prices, costs, margins, sku,
--             vendor or fabricator identity, internal notes, snapshots,
--             media, drawing URLs or creator ids.
--
-- Per-kind decision (SQ-2272 F1, C4 §2.2): plan_issue, plan_issue_print,
-- plan_print, product_configuration, custom_commission_revision, review_item
-- and approval_artifact are read through allowlists. po_spec_snapshot (the
-- vendor's order record: trade cost, sku, trade notes, no client path) and
-- coordination_item_revision (untyped attachments with no storage binding to
-- freeze or serve, free-text note of no fixed audience) have no client
-- projection: create_service_acceptance_request refuses them, and any other
-- unknown kind, with 23514 service_acceptance_evidence_not_client_readable,
-- and the reader refuses a request whose members do not all project.
--
-- Client predicate (C4 §2.7), exactly get_my_service_acceptance_requests' rule:
-- the request has sent_at, and the caller is an active signer profile on it or
-- the project's client_id. Anything else (draft, replaced signer, another
-- household, GC, maker, studio, missing request) refuses insufficient_privilege
-- without saying which.
--
-- Storage (C4 §2.7): plan-print documents live in the private project-documents
-- bucket. The native client policy admits only projects.client_id and only
-- client_visible rows, so an optional or partner signer could not open the
-- drawings they accept. One permissive SELECT policy admits exactly the
-- documents this reader returns, to exactly the callers it serves, through
-- _can_read_service_acceptance_evidence_object(text). Like 00886's paper
-- predicate, it runs in the caller's role and so is granted to authenticated.
-- It is read-only and the only new helper any API role can execute. A sent
-- request freezes every object it serves (SQ-2273 F1, guard below).

CREATE OR REPLACE FUNCTION public._is_service_acceptance_client_reader(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_acceptance_requests r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = p_request_id AND r.sent_at IS NOT NULL
      AND (p.client_id = auth.uid() OR EXISTS (SELECT 1 FROM public.service_acceptance_signers s
        WHERE s.request_id = r.id AND s.status = 'active' AND s.profile_id = auth.uid())));
$$;

-- The project-documents objects behind a manifest's members: a plan print, an
-- issued sheet's print, every print of an issued set (directly or under an
-- approval artifact), or a ready spec book approval artifact's file. Only
-- documents on the manifest's own project.
CREATE OR REPLACE FUNCTION public._service_acceptance_evidence_documents(p_manifest_id uuid)
RETURNS TABLE(member_kind text, member_id uuid, document_id uuid, path text, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH member AS (
    SELECT m.project_id, e->>'kind' AS kind, (e->>'id')::uuid AS id
    FROM public.evidence_manifests m CROSS JOIN LATERAL jsonb_array_elements(m.members) e
    WHERE m.id = p_manifest_id
  ), print AS (
    SELECT member.project_id, member.kind, member.id, member.id AS print_id FROM member WHERE member.kind = 'plan_print'
    UNION ALL
    SELECT member.project_id, member.kind, member.id, ip.print_id FROM member
    JOIN public.plan_issue_prints ip ON ip.id = member.id WHERE member.kind = 'plan_issue_print'
    UNION ALL
    SELECT member.project_id, member.kind, member.id, ip.print_id FROM member
    JOIN public.plan_issue_prints ip ON ip.issue_id = member.id WHERE member.kind = 'plan_issue'
    UNION ALL
    SELECT member.project_id, member.kind, member.id, ip.print_id FROM member
    JOIN public.project_approval_artifacts a ON a.id = member.id AND a.project_id = member.project_id
      AND a.source_kind = 'plan_issue'
    JOIN public.plan_issue_prints ip ON ip.issue_id = a.source_id WHERE member.kind = 'approval_artifact'
  )
  SELECT DISTINCT print.kind, print.id, d.id, d.storage_path, d.title
  FROM print
  JOIN public.plan_prints pr ON pr.id = print.print_id
  JOIN public.project_documents d ON d.id = pr.project_document_id AND d.project_id = print.project_id
  WHERE btrim(COALESCE(d.storage_path, '')) <> ''
  UNION
  -- An approval artifact over a spec book: the ready artifact's own path, which
  -- 00380 freezes (its Folio row is not frozen, so the path never comes from it).
  SELECT member.kind, member.id, d.id, s.storage_path, d.title FROM member
  JOIN public.project_approval_artifacts a ON a.id = member.id AND a.project_id = member.project_id
    AND a.source_kind = 'spec_book_artifact'
  JOIN public.spec_book_artifacts s ON s.id = a.source_id AND s.status = 'ready' AND s.storage_bucket = 'project-documents'
  JOIN public.project_documents d ON d.id = s.project_document_id AND d.project_id = member.project_id
  WHERE member.kind = 'approval_artifact' AND btrim(COALESCE(s.storage_path, '')) <> '';
$$;

-- The projects whose evidence could name these project-documents objects: by a
-- Folio row's path or by a spec book artifact's frozen path. Narrows the
-- storage predicate and the guard below to that project's requests.
CREATE OR REPLACE FUNCTION public._service_acceptance_object_projects(p_names text[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.project_id FROM public.project_documents d WHERE d.storage_path = ANY (p_names)
  UNION
  SELECT d.project_id FROM public.spec_book_artifacts s JOIN public.project_documents d ON d.id = s.project_document_id
  WHERE s.storage_path = ANY (p_names);
$$;

-- The allowlist projection: of an object, the listed keys whose values are
-- strings, numbers or booleans (never nested values, never blank strings); of
-- an array, that projection of each object element, in order. NULL when empty.
CREATE OR REPLACE FUNCTION public._service_acceptance_scalars(p_value jsonb, p_keys text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH item AS (
    SELECT y.n, (SELECT jsonb_object_agg(e.key, e.value)
        FROM jsonb_each(CASE jsonb_typeof(y.x) WHEN 'object' THEN y.x END) e
        WHERE e.key = ANY (p_keys) AND jsonb_typeof(e.value) IN ('string', 'number', 'boolean')
          AND (jsonb_typeof(e.value) <> 'string' OR btrim(e.value #>> '{}') <> '')) AS obj
    FROM jsonb_array_elements(CASE jsonb_typeof(p_value) WHEN 'object' THEN jsonb_build_array(p_value)
      WHEN 'array' THEN p_value END) WITH ORDINALITY y(x, n)
  )
  SELECT CASE jsonb_typeof(p_value) WHEN 'object' THEN (SELECT obj FROM item)
    ELSE (SELECT jsonb_agg(obj ORDER BY n) FROM item WHERE obj IS NOT NULL) END;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_client_member(p_manifest_id uuid, p_member jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH member AS (SELECT p_member->>'kind' AS kind, (p_member->>'id')::uuid AS id)
  SELECT jsonb_build_object('kind', member.kind, 'title', t.title, 'issuedAt', t.issued_at, 'content', t.content,
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('bucket', 'project-documents', 'path', d.path,
        'title', d.title) ORDER BY d.title, d.path)
      FROM public._service_acceptance_evidence_documents(p_manifest_id) d
      WHERE d.member_kind = member.kind AND d.member_id = member.id), '[]'::jsonb))
  FROM member CROSS JOIN LATERAL (
    SELECT i.name AS title, i.issued_at, NULL::jsonb AS content FROM public.plan_issues i
    WHERE member.kind = 'plan_issue' AND i.id = member.id
    UNION ALL
    SELECT ip.sheet_number || ' ' || ip.sheet_title, i.issued_at, NULL FROM public.plan_issue_prints ip
    JOIN public.plan_issues i ON i.id = ip.issue_id WHERE member.kind = 'plan_issue_print' AND ip.id = member.id
    UNION ALL
    SELECT s.sheet_number || ' ' || s.title, pr.created_at, NULL FROM public.plan_prints pr
    JOIN public.plan_sheets s ON s.id = pr.sheet_id WHERE member.kind = 'plan_print' AND pr.id = member.id
    UNION ALL
    -- snapshot (hashed by _configuration_snapshot_hash), allowlisted. Never
    -- prices, price deltas, sku/vendorSku, the variant, mill, shipTo, sidemark,
    -- notes or customCommission.
    SELECT COALESCE(NULLIF(btrim(c.name), ''), 'Configuration'), COALESCE(c.issued_at, c.approved_at),
      jsonb_strip_nulls(COALESCE(public._service_acceptance_scalars(c.snapshot, ARRAY['productName', 'leadTimeWeeks']), '{}'::jsonb)
        || jsonb_build_object(
          'selections', public._service_acceptance_scalars(c.snapshot->'selections', ARRAY['groupName', 'valueLabel']),
          'components', public._service_acceptance_scalars(c.snapshot->'components', ARRAY['name', 'quantity', 'handedness']),
          'dimensions', public._service_acceptance_scalars(c.snapshot->'dimensions', ARRAY['width', 'depth', 'height',
            'length', 'diameter', 'seatHeight', 'armHeight', 'unit']),
          'fabric', public._service_acceptance_scalars(c.snapshot->'comDetails', ARRAY['fabricName', 'pattern'])))
    FROM public.product_configurations c WHERE member.kind = 'product_configuration' AND c.id = member.id
    UNION ALL
    -- brief and drawings (hashed with quote and provenance), allowlisted. Never
    -- the quote, fabricator, budget, allowance, notes, approvals or drawing URLs
    -- (free-form, not storage objects, so they are named, not served).
    SELECT COALESCE(NULLIF(btrim(c.name), ''), 'Commission') || ' revision ' || v.revision_number,
      COALESCE(v.issued_at, v.approved_at),
      jsonb_strip_nulls(COALESCE(public._service_acceptance_scalars(v.brief, ARRAY['summary', 'intent', 'siteConditions',
          'requirements', 'materials', 'finish', 'targetDate']), '{}'::jsonb)
        || jsonb_build_object('revision', v.revision_number,
          'measurements', public._service_acceptance_scalars(v.brief->'measurements', ARRAY['label', 'value', 'unit']),
          'drawings', public._service_acceptance_scalars(v.drawings, ARRAY['name', 'revision'])))
    FROM public.custom_commission_revisions v JOIN public.product_configurations c ON c.id = v.configuration_id
    WHERE member.kind = 'custom_commission_revision' AND v.id = member.id
    UNION ALL
    -- item_snapshot (content_hash), the client review projection (00443),
    -- allowlisted. Never the client prices, media ids/checksums (review media
    -- stay off client paths, 00443), the room id, or the clientFields note.
    SELECT COALESCE(public._service_acceptance_scalars(ri.item_snapshot, ARRAY['name'])->>'name', 'Review item'),
      ed.published_at,
      jsonb_strip_nulls(COALESCE(public._service_acceptance_scalars(ri.item_snapshot, ARRAY['docCode', 'category',
          'quantity']), '{}'::jsonb)
        || jsonb_build_object('room', public._service_acceptance_scalars(ri.item_snapshot->'room', ARRAY['name'])->'name',
          'details', public._service_acceptance_scalars(ri.item_snapshot->'clientFields', ARRAY['description', 'dimensions',
            'finish', 'material', 'color', 'leadTime', 'care'])))
    FROM public.project_review_items ri JOIN public.project_review_editions ed ON ed.id = ri.edition_id
    WHERE member.kind = 'review_item' AND ri.id = member.id
    UNION ALL
    -- The question asked and what the artifact is; its file comes through
    -- documents. Never context, why, cost or schedule deltas, or source_snapshot.
    SELECT a.artifact_title, a.created_at, jsonb_strip_nulls(jsonb_build_object('source', a.source_kind, 'question', a.question))
    FROM public.project_approval_artifacts a
    WHERE member.kind = 'approval_artifact' AND a.id = member.id
    -- po_spec_snapshot and coordination_item_revision have no client-safe
    -- projection (create_service_acceptance_request below refuses them), so
    -- they resolve to nothing and the reader refuses the request.
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.get_my_service_acceptance_evidence(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.service_acceptance_requests%ROWTYPE; e public.project_scope_editions%ROWTYPE;
  m public.evidence_manifests%ROWTYPE;
BEGIN
  IF NOT public._is_service_acceptance_client_reader(p_request_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT r FROM public.service_acceptance_requests WHERE id = p_request_id;
  SELECT * INTO STRICT e FROM public.project_scope_editions WHERE id = r.scope_edition_id;
  SELECT * INTO STRICT m FROM public.evidence_manifests WHERE id = r.evidence_manifest_id;
  -- Every member must read as itself (A20): a kind with no client projection,
  -- or a member row that no longer resolves, refuses the whole read rather
  -- than presenting a title-only or partial manifest as reviewable.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(m.members) x
      WHERE public._service_acceptance_client_member(m.id, x) IS NULL) THEN
    RAISE EXCEPTION 'service_acceptance_evidence_not_client_readable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object('requestId', r.id, 'requestNumber', r.request_number,
    'scope', jsonb_build_object('editionId', e.id, 'contentHash', r.scope_content_hash,
      'packages', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'key', pk->>'package_key', 'label', pk->>'label', 'inclusion', pk->>'inclusion',
          'conditionText', pk->>'condition_text',
          'responsibilities', jsonb_build_object('design', pk->'responsibilities'->>'design',
            'purchasing', pk->'responsibilities'->>'purchasing',
            'installation', pk->'responsibilities'->>'installation'),
          'phases', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', pp.name, 'service', ph->>'service_slot')
              ORDER BY pp.sort_order, pp.name, pp.id)
            FROM jsonb_array_elements(e.content->'phases') ph
            JOIN public.proposal_phases pp ON pp.id = (ph->>'source_proposal_phase_id')::uuid
            WHERE ph->>'package_key' = pk->>'package_key'), '[]'::jsonb))
          ORDER BY pk->>'package_key')
        FROM jsonb_array_elements(e.content->'packages') pk), '[]'::jsonb)),
    'evidence', jsonb_build_object('manifestId', m.id, 'manifestHash', r.evidence_manifest_hash,
      'members', COALESCE((SELECT jsonb_agg(public._service_acceptance_client_member(m.id, x.member) ORDER BY x.ord)
        FROM jsonb_array_elements(m.members) WITH ORDINALITY AS x(member, ord)), '[]'::jsonb)));
END;
$$;

CREATE OR REPLACE FUNCTION public._can_read_service_acceptance_evidence_object(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_acceptance_requests r
    WHERE r.project_id IN (SELECT public._service_acceptance_object_projects(ARRAY[p_name]))
      AND public._is_service_acceptance_client_reader(r.id)
      AND EXISTS (SELECT 1 FROM public._service_acceptance_evidence_documents(r.evidence_manifest_id) x
        WHERE x.path = p_name));
$$;

DROP POLICY IF EXISTS service_acceptance_evidence_client_read ON storage.objects;
CREATE POLICY service_acceptance_evidence_client_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND public._can_read_service_acceptance_evidence_object(name));

-- Bound evidence objects are frozen (SQ-2273 F1). The policy above names an
-- object by path, and 00584 lets studio members INSERT, UPDATE and DELETE at
-- that path; 00429 freezes the project_documents row, not storage.objects.
-- Once a SENT request binds a plan print or a spec book approval artifact,
-- the object at that path may not be updated (overwrite, move, metadata),
-- deleted, or created (rename or insert onto the path). Refusing DELETE also defeats delete-and-recreate:
-- bucketid_objname keeps one row per (bucket_id, name), so nothing new can
-- take the name while the bound row stands, and refusing INSERT covers a bound
-- path whose object was already gone at send. This is the 00835 / 00886
-- immutable-object trigger, keyed by the documents
-- _service_acceptance_evidence_documents resolves for the manifest of every
-- request with sent_at (lifecycle does not matter: sent history stays
-- readable). Like those guards it binds every role that writes through SQL,
-- service_role and supabase_storage_admin included; only a session that skips
-- triggers (session_replication_role = replica, or the table owner disabling
-- the trigger) is outside it, as for them. Unbound paths stay mutable.
CREATE OR REPLACE FUNCTION public._guard_service_acceptance_evidence_object()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_names text[] := '{}';
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.bucket_id = 'project-documents' THEN v_names := v_names || OLD.name; END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.bucket_id = 'project-documents' THEN v_names := v_names || NEW.name; END IF;
  END IF;
  IF cardinality(v_names) > 0 AND EXISTS (SELECT 1 FROM public.service_acceptance_requests r
      WHERE r.sent_at IS NOT NULL AND r.project_id IN (SELECT public._service_acceptance_object_projects(v_names))
        AND EXISTS (SELECT 1 FROM public._service_acceptance_evidence_documents(r.evidence_manifest_id) x
          WHERE x.path = ANY (v_names))) THEN
    RAISE EXCEPTION 'Acceptance evidence bound by a sent request cannot be changed, deleted or replaced'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS immutable_service_acceptance_evidence_object ON storage.objects;
CREATE TRIGGER immutable_service_acceptance_evidence_object BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public._guard_service_acceptance_evidence_object();

-- Admission (SQ-2272 F1): create_service_acceptance_request, copied verbatim from
-- 00886 (its only definition) with one delta, the readable-kind check after the
-- manifest is validated. CREATE OR REPLACE keeps 00886's ACL (inactive until activation).
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
  v_draft := public.compose_outbound_draft('service_acceptance_request', v_studio, p_project_id, 'email', 'client',
    jsonb_build_object('client_id', v_project.client_id), 'Review the agreed services',
    'Your studio has prepared the agreed services for your review. Open your project to accept them, '
      || 'accept them with conditions, or return them with a note.',
    jsonb_build_object('requestId', v_id, 'projectId', p_project_id, 'requestNumber', v_number,
      'scopeEditionId', v_edition.id),
    'service_acceptance_request', v_id, 'service_acceptance_request:' || v_id, NULL, NULL, v_uid::text);
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

REVOKE ALL ON FUNCTION public._is_service_acceptance_client_reader(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_evidence_documents(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_scalars(jsonb,text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_client_member(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_object_projects(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._can_read_service_acceptance_evidence_object(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._can_read_service_acceptance_evidence_object(text) TO authenticated;
REVOKE ALL ON FUNCTION public._guard_service_acceptance_evidence_object() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_service_acceptance_evidence(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_service_acceptance_evidence(uuid) TO authenticated;
