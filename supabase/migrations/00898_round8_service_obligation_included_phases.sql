-- ═══════════════════════════════════════════════════════════════════════════
-- 00898 — Round 8 C6: an excluded package's phases stop blocking completion
-- (US-52 release review, fix lane F-A defect 3, HIGH). Ships INACTIVE.
--
-- An amendment edition copies its predecessor's phase bindings
-- (project_scope_edition_phases) unchanged (_mint_scope_edition, 00886). So
-- when an amendment excludes a package, that package's design phase is still
-- in the new edition, and _service_obligation_items emitted
-- agreed_phase_unbound / agreed_phase_open for it, whatever the package's
-- inclusion. Excluded work therefore kept blocking completion. K3 says
-- included studio obligations block; excluded work stays visible and never
-- blocks. Every other package-scoped blocker here already reads
-- pk.inclusion = 'included'.
--
-- Now the ph rows (which feed agreed_phase_unbound, agreed_phase_open and the
-- design/installation discharge checks) leave out a phase whose package_key
-- names a package of the edition with inclusion <> 'included' (excluded or
-- conditional). Fail-closed for anything else: a phase with no package key, or
-- a key that names no package of the edition, still blocks. The edition's
-- phase rows are not touched, and the package_excluded informational item
-- still lists the package, so the excluded work stays visible as history.
-- studio_design_unbound / studio_installation_unbound read ph only for
-- included packages, so they are unchanged.
--
-- Redefinition, copied verbatim from its only CREATE OR REPLACE with the
-- marked delta:
--   _service_obligation_items   00888 -> 00898
-- Signature, return shape and ACL are unchanged (CREATE OR REPLACE keeps the
-- 00888 revoke), so this file has no GRANT/REVOKE. No backfill.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._service_obligation_items(p_project_id uuid, p_edition_id uuid)
RETURNS TABLE(kind text, code text, package_key text, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH pk AS (
    SELECT p.package_key, p.inclusion, p.responsibilities->>'design' AS design,
      p.responsibilities->>'purchasing' AS purchasing, p.responsibilities->>'installation' AS installation,
      p.design_owed_since, p.installation_owed_since
    FROM public.project_scope_edition_packages p WHERE p.edition_id = p_edition_id
  ), live AS (
    SELECT i.id, i.scope_package_key, i.status, i.external_fulfilment_id IS NULL AS studio
    FROM public.project_ffe_items i
    WHERE i.project_id = p_project_id AND i.removed_at IS NULL AND i.trade_scope_document_id IS NULL
      AND i.design_disposition IS DISTINCT FROM 'not_selected' AND i.design_disposition IS DISTINCT FROM 'superseded'
  ), ful AS (
    SELECT f.id, f.package_key, f.status,
      EXISTS (SELECT 1 FROM public.project_external_fulfilment_events e WHERE e.fulfilment_id = f.id
        AND e.event_kind = 'installed' AND e.evidence_level = 'verified') AS install_verified
    FROM public.project_external_fulfilments f WHERE f.project_id = p_project_id AND f.status <> 'cancelled'
  ), ph AS (
    SELECT ep.package_key, ep.service_slot, ep.bound_in_edition, pp.id IS NOT NULL AS bound, pp.status AS phase_status
    FROM public.project_scope_edition_phases ep
    LEFT JOIN public.project_phases pp ON pp.id = ep.project_phase_id AND pp.project_id = p_project_id
    WHERE ep.edition_id = p_edition_id
      -- 00898 delta (F-A defect 3, K3): a phase bound to a package this edition
      -- does not include owes nothing. A phase with no package key, or a key in
      -- no package of the edition, still counts.
      AND NOT EXISTS (SELECT 1 FROM pk WHERE pk.package_key = ep.package_key AND pk.inclusion <> 'included')
  ), items(kind, code, package_key, n) AS (
    SELECT 'blocker', 'agreed_phase_unbound', ph.package_key, count(*) FROM ph WHERE NOT ph.bound GROUP BY ph.package_key
    UNION ALL
    SELECT 'blocker', 'agreed_phase_open', ph.package_key, count(*) FROM ph
    WHERE ph.bound AND ph.phase_status IS DISTINCT FROM 'completed' GROUP BY ph.package_key
    UNION ALL
    SELECT 'blocker', 'studio_line_open', l.scope_package_key, count(*) FROM live l JOIN pk ON pk.package_key = l.scope_package_key
    WHERE l.studio AND pk.inclusion = 'included' AND pk.purchasing = 'studio' AND l.status IS DISTINCT FROM 'installed'
    GROUP BY l.scope_package_key
    UNION ALL
    SELECT 'blocker', 'studio_installation_open', x.package_key, sum(x.n)::bigint FROM (
      SELECT l.scope_package_key AS package_key, count(*) AS n FROM live l JOIN pk ON pk.package_key = l.scope_package_key
      WHERE pk.inclusion = 'included' AND pk.installation = 'studio' AND l.status IS DISTINCT FROM 'installed'
      GROUP BY l.scope_package_key
      UNION ALL
      SELECT f.package_key, count(*) FROM ful f JOIN pk ON pk.package_key = f.package_key
      WHERE pk.inclusion = 'included' AND pk.installation = 'studio' AND NOT f.install_verified
      GROUP BY f.package_key) x GROUP BY x.package_key
    UNION ALL
    SELECT 'blocker', 'studio_design_unbound', pk.package_key, 1 FROM pk
    WHERE pk.inclusion = 'included' AND pk.design = 'studio'
      AND NOT EXISTS (SELECT 1 FROM ph WHERE ph.package_key = pk.package_key AND ph.service_slot = 'design'
        AND ph.bound_in_edition >= pk.design_owed_since)
    UNION ALL
    SELECT 'blocker', 'studio_installation_unbound', pk.package_key, 1 FROM pk
    WHERE pk.inclusion = 'included' AND pk.installation = 'studio'
      AND NOT EXISTS (SELECT 1 FROM live l WHERE l.scope_package_key = pk.package_key)
      AND NOT EXISTS (SELECT 1 FROM ful f WHERE f.package_key = pk.package_key)
      AND NOT EXISTS (SELECT 1 FROM ph WHERE ph.package_key = pk.package_key AND ph.service_slot = 'installation'
        AND ph.bound_in_edition >= pk.installation_owed_since)
    UNION ALL
    SELECT 'blocker', 'ffe_unassigned_to_package', NULL, count(*) FROM live l
    WHERE l.studio AND l.scope_package_key IS NULL HAVING count(*) > 0
    UNION ALL
    SELECT 'blocker', 'package_key_not_in_edition', x.package_key, sum(x.n)::bigint FROM (
      SELECT l.scope_package_key AS package_key, count(*) AS n FROM live l
      WHERE l.scope_package_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pk WHERE pk.package_key = l.scope_package_key)
      GROUP BY l.scope_package_key
      UNION ALL
      SELECT f.package_key, count(*) FROM ful f WHERE NOT EXISTS (SELECT 1 FROM pk WHERE pk.package_key = f.package_key)
      GROUP BY f.package_key) x
    WHERE p_edition_id IS NOT NULL GROUP BY x.package_key
    UNION ALL
    SELECT 'blocker', 'client_decision_unresolved', NULL, count(*) FROM public.client_decisions d
    WHERE d.project_id = p_project_id AND d.status IS DISTINCT FROM 'responded' AND d.status IS DISTINCT FROM 'expired'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'blocker', 'scope_change_unresolved', NULL, count(*) FROM public.scope_change_requests s
    WHERE s.project_id = p_project_id AND s.applied_at IS NULL AND s.status IS DISTINCT FROM 'declined'
      AND s.status IS DISTINCT FROM 'cancelled'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'info', 'package_excluded', pk.package_key,
      (SELECT count(*) FROM live l WHERE l.scope_package_key = pk.package_key)
      + (SELECT count(*) FROM ful f WHERE f.package_key = pk.package_key)
    FROM pk WHERE pk.inclusion <> 'included'
    UNION ALL
    SELECT 'info', 'external_fulfilment_open', f.package_key, count(*) FROM ful f JOIN pk ON pk.package_key = f.package_key
    WHERE f.status <> 'installed' AND NOT (pk.inclusion = 'included' AND pk.installation = 'studio')
    GROUP BY f.package_key
    UNION ALL
    SELECT 'info', 'trade_scope_open', NULL, count(*) FROM public.trade_scope_terms t
    JOIN public.proposals pr ON pr.id = t.proposal_id
    WHERE pr.project_id = p_project_id AND t.progress_state <> 'accepted' HAVING count(*) > 0
    UNION ALL
    SELECT 'info', 'punch_item_open', NULL, count(*) FROM public.install_punch_items u
    WHERE u.project_id = p_project_id AND u.resolved_at IS NULL HAVING count(*) > 0
  )
  SELECT kind, code, package_key, n FROM items;
$$;
