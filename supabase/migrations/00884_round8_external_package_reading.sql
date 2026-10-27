-- 00884 — Authoritative external package evidence reading (inactive writers).
-- Lineage: get_project_external_fulfilments 00875; retained evidence 00877/00879.
-- Preserve every header field and the existing access/EXECUTE contract. All
-- projections and linkage checks share one statement snapshot. A broken required
-- reference refuses the entire read; it must never become false-empty evidence.
CREATE OR REPLACE FUNCTION public.get_project_external_fulfilments(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE result jsonb; valid boolean;
BEGIN
 PERFORM public._external_assert_access(p_project_id);
 WITH fulfilments AS MATERIALIZED (
  SELECT f.*,p.id AS reading_package_id FROM public.project_external_fulfilments f
  LEFT JOIN public.project_packages p ON p.project_id=f.project_id AND p.package_key=f.package_key
  WHERE f.project_id=p_project_id
 ), events AS MATERIALIZED (
  SELECT e.* FROM public.project_external_fulfilment_events e
  JOIN fulfilments f ON f.id=e.fulfilment_id
 ), bindings AS MATERIALIZED (
  SELECT b.* FROM public.project_external_fulfilment_evidence_bindings b
  JOIN fulfilments f ON f.id=b.fulfilment_id
 ), receipts AS MATERIALIZED (
  SELECT v.* FROM public.project_external_fulfilment_verifications v
  WHERE EXISTS(SELECT 1 FROM fulfilments f WHERE f.id=v.fulfilment_id)
     OR EXISTS(SELECT 1 FROM events e WHERE e.id=v.event_id)
 ), manifests AS MATERIALIZED (
  SELECT m.* FROM public.evidence_manifests m
  WHERE EXISTS(SELECT 1 FROM events e WHERE e.manifest_id=m.id)
 )
 SELECT COALESCE((SELECT jsonb_agg(
  (to_jsonb(f)-'reading_package_id')||jsonb_build_object('reading',jsonb_build_object(
   'package_id',f.reading_package_id,
   'events',COALESCE((SELECT jsonb_agg(to_jsonb(e)-ARRAY['client_request_id','request_hash'] ORDER BY e.event_seq,e.id)
    FROM events e WHERE e.fulfilment_id=f.id),'[]'::jsonb),
   'bindings',COALESCE((SELECT jsonb_agg(to_jsonb(b)-ARRAY['client_request_id','request_hash'] ORDER BY b.decision_id,b.id)
    FROM bindings b WHERE b.fulfilment_id=f.id),'[]'::jsonb),
   'verifications',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',v.event_id,
    'fulfilment_id',v.fulfilment_id,'verified_by',v.verified_by) ORDER BY v.event_id)
    FROM receipts v WHERE v.fulfilment_id=f.id),'[]'::jsonb),
   'manifests',COALESCE((SELECT jsonb_agg(
    (to_jsonb(m)-ARRAY['idempotency_key','request_hash'])||jsonb_build_object('typed_members',
     COALESCE((SELECT jsonb_agg(to_jsonb(mm) ORDER BY mm.id) FROM public.evidence_manifest_members mm
      WHERE mm.manifest_id=m.id),'[]'::jsonb)) ORDER BY m.id)
    FROM manifests m WHERE EXISTS(SELECT 1 FROM events e WHERE e.fulfilment_id=f.id AND e.manifest_id=m.id)),'[]'::jsonb)
  )) ORDER BY f.created_at,f.id) FROM fulfilments f),'[]'::jsonb),
  NOT EXISTS(
   SELECT 1 FROM events e JOIN fulfilments f ON f.id=e.fulfilment_id
   LEFT JOIN manifests m ON m.id=e.manifest_id
   LEFT JOIN public.plan_issues i ON i.id=e.plan_issue_id
   LEFT JOIN events h ON h.id=e.releases_event_id
   LEFT JOIN receipts v ON v.event_id=e.id
   WHERE (e.manifest_id IS NOT NULL AND (m.id IS NULL OR m.project_id IS DISTINCT FROM f.project_id
     OR m.package_id IS DISTINCT FROM f.reading_package_id OR f.reading_package_id IS NULL
     OR m.manifest_hash IS DISTINCT FROM e.manifest_hash OR m.purpose IS DISTINCT FROM 'fabrication_instruction'
     OR e.evidence->>'manifestId' IS DISTINCT FROM e.manifest_id::text))
    OR (e.affected_units IS NOT NULL AND NOT e.affected_units<@f.units)
    OR (e.event_kind='fabrication_instruction' AND (jsonb_array_length(e.coverage)<>cardinality(e.affected_units)
     OR (SELECT count(DISTINCT unit->>'unit') FROM jsonb_array_elements(e.coverage) unit)<>cardinality(e.affected_units)))
    OR (e.plan_issue_id IS NOT NULL AND (i.id IS NULL OR i.project_id IS DISTINCT FROM f.project_id))
    OR (e.releases_event_id IS NOT NULL AND (h.id IS NULL OR h.fulfilment_id IS DISTINCT FROM f.id
     OR h.event_kind IS DISTINCT FROM 'hold' OR h.event_seq>=e.event_seq))
    OR (e.evidence_level='verified' AND (v.event_id IS NULL OR v.fulfilment_id IS DISTINCT FROM f.id
     OR v.verified_by IS DISTINCT FROM e.verified_by OR e.verified_by IS NULL OR e.verified_at IS NULL
     OR e.verification_seq IS NULL OR e.verified_by=e.recorded_by))
    OR (e.evidence_level<>'verified' AND (v.event_id IS NOT NULL OR e.verified_by IS NOT NULL
     OR e.verified_at IS NOT NULL OR e.verification_seq IS NOT NULL))
  ) AND NOT EXISTS(
   SELECT 1 FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.coverage) c
   WHERE e.event_kind='fabrication_instruction' AND (
    NOT ((c->>'unit')=ANY(e.affected_units)) OR jsonb_array_length(c->'revisionIds')=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(c->'revisionIds') revision_id
     WHERE NOT EXISTS(SELECT 1 FROM public.evidence_manifest_members mm
      JOIN public.coordination_item_revisions r ON r.id=mm.coordination_item_revision_id
      JOIN bindings b ON b.decision_id=r.decision_id AND b.fulfilment_id=e.fulfilment_id
      WHERE mm.manifest_id=e.manifest_id AND r.id::text=revision_id AND (c->>'unit')=ANY(b.units)
       AND (b.covers_plan_issue_id IS NULL OR EXISTS(SELECT 1 FROM public.evidence_manifest_members pinned
        WHERE pinned.manifest_id=e.manifest_id AND pinned.plan_issue_id=b.covers_plan_issue_id))
       AND (b.covers_configuration_snapshot_hash IS NULL OR EXISTS(SELECT 1 FROM manifests m,
        jsonb_array_elements(m.members) pinned WHERE m.id=e.manifest_id
         AND pinned->>'kind'='product_configuration' AND pinned->>'sha256'=b.covers_configuration_snapshot_hash))))
   )
  ) AND NOT EXISTS(
   SELECT 1 FROM bindings b JOIN fulfilments f ON f.id=b.fulfilment_id
   LEFT JOIN public.client_decisions d ON d.id=b.decision_id
   LEFT JOIN public.plan_issues i ON i.id=b.covers_plan_issue_id
   WHERE d.id IS NULL OR d.project_id IS DISTINCT FROM f.project_id OR NOT b.units<@f.units
    OR (b.covers_plan_issue_id IS NOT NULL AND (i.id IS NULL OR i.project_id IS DISTINCT FROM f.project_id))
  ) AND NOT EXISTS(
   SELECT 1 FROM receipts v LEFT JOIN events e ON e.id=v.event_id
   WHERE e.id IS NULL OR e.fulfilment_id IS DISTINCT FROM v.fulfilment_id
    OR e.evidence_level IS DISTINCT FROM 'verified' OR e.verified_by IS DISTINCT FROM v.verified_by
  ) AND NOT EXISTS(
   SELECT 1 FROM manifests m WHERE jsonb_typeof(m.members) IS DISTINCT FROM 'array'
    OR jsonb_array_length(m.members)<>(SELECT count(*) FROM public.evidence_manifest_members mm WHERE mm.manifest_id=m.id)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(m.members) member
     WHERE NOT EXISTS(SELECT 1 FROM public.evidence_manifest_members mm WHERE mm.manifest_id=m.id
      AND CASE member->>'kind'
       WHEN 'plan_issue' THEN mm.plan_issue_id::text
       WHEN 'plan_issue_print' THEN mm.plan_issue_print_id::text
       WHEN 'plan_print' THEN mm.plan_print_id::text
       WHEN 'product_configuration' THEN mm.product_configuration_id::text
       WHEN 'custom_commission_revision' THEN mm.custom_commission_revision_id::text
       WHEN 'review_item' THEN mm.review_item_id::text
       WHEN 'approval_artifact' THEN mm.approval_artifact_id::text
       WHEN 'po_spec_snapshot' THEN mm.po_spec_snapshot_id::text
       WHEN 'coordination_item_revision' THEN mm.coordination_item_revision_id::text
      END=member->>'id'))
  ) INTO result,valid;
 IF NOT valid THEN
  RAISE EXCEPTION 'external_fulfilment_reading_invalid' USING ERRCODE='23514';
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.get_project_external_fulfilments(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_external_fulfilments(uuid) TO authenticated;
