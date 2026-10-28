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
--             member: kind, a client-safe title, an issued time and the
--             project-documents objects behind plan prints. Never prices,
--             costs, notes, snapshots or creator ids.
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
-- It is read-only and the only new helper any API role can execute.

CREATE OR REPLACE FUNCTION public._is_service_acceptance_client_reader(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_acceptance_requests r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = p_request_id AND r.sent_at IS NOT NULL
      AND (p.client_id = auth.uid() OR EXISTS (SELECT 1 FROM public.service_acceptance_signers s
        WHERE s.request_id = r.id AND s.status = 'active' AND s.profile_id = auth.uid())));
$$;

-- The project-documents objects behind a manifest's plan members: a plan print,
-- an issued sheet's print, or every print of an issued set. Only documents on
-- the manifest's own project.
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
  )
  SELECT DISTINCT print.kind, print.id, d.id, d.storage_path, d.title
  FROM print
  JOIN public.plan_prints pr ON pr.id = print.print_id
  JOIN public.project_documents d ON d.id = pr.project_document_id AND d.project_id = print.project_id
  WHERE btrim(COALESCE(d.storage_path, '')) <> '';
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_client_member(p_manifest_id uuid, p_member jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH member AS (SELECT p_member->>'kind' AS kind, (p_member->>'id')::uuid AS id)
  SELECT jsonb_build_object('kind', member.kind, 'title', t.title, 'issuedAt', t.issued_at,
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('bucket', 'project-documents', 'path', d.path,
        'title', d.title) ORDER BY d.title, d.path)
      FROM public._service_acceptance_evidence_documents(p_manifest_id) d
      WHERE d.member_kind = member.kind AND d.member_id = member.id), '[]'::jsonb))
  FROM member CROSS JOIN LATERAL (
    SELECT i.name AS title, i.issued_at FROM public.plan_issues i
    WHERE member.kind = 'plan_issue' AND i.id = member.id
    UNION ALL
    SELECT ip.sheet_number || ' ' || ip.sheet_title, i.issued_at FROM public.plan_issue_prints ip
    JOIN public.plan_issues i ON i.id = ip.issue_id WHERE member.kind = 'plan_issue_print' AND ip.id = member.id
    UNION ALL
    SELECT s.sheet_number || ' ' || s.title, pr.created_at FROM public.plan_prints pr
    JOIN public.plan_sheets s ON s.id = pr.sheet_id WHERE member.kind = 'plan_print' AND pr.id = member.id
    UNION ALL
    SELECT COALESCE(NULLIF(btrim(c.name), ''), 'Configuration'), COALESCE(c.issued_at, c.approved_at)
    FROM public.product_configurations c WHERE member.kind = 'product_configuration' AND c.id = member.id
    UNION ALL
    SELECT COALESCE(NULLIF(btrim(c.name), ''), 'Commission') || ' revision ' || v.revision_number,
      COALESCE(v.issued_at, v.approved_at)
    FROM public.custom_commission_revisions v JOIN public.product_configurations c ON c.id = v.configuration_id
    WHERE member.kind = 'custom_commission_revision' AND v.id = member.id
    UNION ALL
    SELECT COALESCE(NULLIF(btrim(ri.item_snapshot->>'name'), ''), 'Review item'), ed.published_at
    FROM public.project_review_items ri JOIN public.project_review_editions ed ON ed.id = ri.edition_id
    WHERE member.kind = 'review_item' AND ri.id = member.id
    UNION ALL
    SELECT a.artifact_title, a.created_at FROM public.project_approval_artifacts a
    WHERE member.kind = 'approval_artifact' AND a.id = member.id
    UNION ALL
    SELECT 'Order specification revision ' || o.revision, o.created_at FROM public.po_spec_snapshots o
    WHERE member.kind = 'po_spec_snapshot' AND o.id = member.id
    UNION ALL
    SELECT COALESCE(NULLIF(btrim(cd.title), ''), 'Coordination item') || ' revision ' || cr.rev_number,
      COALESCE(cr.reviewed_at, cr.created_at)
    FROM public.coordination_item_revisions cr JOIN public.client_decisions cd ON cd.id = cr.decision_id
    WHERE member.kind = 'coordination_item_revision' AND cr.id = member.id
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
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.project_documents d
    JOIN public.service_acceptance_requests r ON r.project_id = d.project_id
    WHERE d.storage_path = p_name AND public._is_service_acceptance_client_reader(r.id)
      AND EXISTS (SELECT 1 FROM public._service_acceptance_evidence_documents(r.evidence_manifest_id) x
        WHERE x.document_id = d.id));
$$;

DROP POLICY IF EXISTS service_acceptance_evidence_client_read ON storage.objects;
CREATE POLICY service_acceptance_evidence_client_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND public._can_read_service_acceptance_evidence_object(name));

REVOKE ALL ON FUNCTION public._is_service_acceptance_client_reader(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_evidence_documents(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_client_member(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._can_read_service_acceptance_evidence_object(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._can_read_service_acceptance_evidence_object(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_service_acceptance_evidence(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_service_acceptance_evidence(uuid) TO authenticated;
