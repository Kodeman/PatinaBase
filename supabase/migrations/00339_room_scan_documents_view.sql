-- ═══════════════════════════════════════════════════════════════════════════
-- 00339 — room_scan_documents: scan → client/document linkage view
--
-- Program: Room View (Wave 1, Task 4). The Rooms roster needs, per scan, who
-- it belongs to and which Document (The Document surface = document_state,
-- v11/00327) it resolves to — a lens over room_scans, never a copy.
--
-- Resolution chains (verified against Strata: scan fa361ed4 → accepted lead
-- 97ec603e; scan 17c638ca → project 7f6a24c3):
--   • room_scans.project_id                                  → Shape A (project)
--   • leads.room_scan_id (00029) / lead_room_scans (00285)   → leads row
--       → designer_clients.lead_id                            → Shape D (relationship)
--       → proposals.designer_client_id (00327)                → Shape B (proposal)
--                                                              → post-activation Shape A
--       → still-open lead                                     → Shape C (lead)
--
-- document_state (v11, 00327) emits `lead_id` in BOTH Shape C (the open lead
-- itself) and Shape D (dc.lead_id, the graduated relationship) — Shape D's own
-- exclusions mean the two are mutually exclusive per lead in the common case,
-- but the precedence CASE below still orders relationship above lead so a
-- degenerate/legacy overlap resolves deterministically.
--
-- Precedence when more than one document_state row could match a scan's
-- resolved lead/relationship: project → proposal → relationship → lead
-- (Kody-ruled intent, W1-T4 brief). Implemented as an explicit CASE over
-- document_state.engagement_kind ('project' | 'proposal' | 'relationship' |
-- 'lead' — the real Shape A/B/D/C tags), not a positional list, so the
-- ordering survives even if document_state's WHERE legs are reshuffled later.
--
-- security_invoker = true: no independent RLS surface. Every underlying read
-- (room_scans, room_scan_geometry, leads, lead_room_scans, designer_clients,
-- proposals, document_state, profiles) runs under the CALLING user's own
-- privileges — room_scans' own RLS (owner / designer-association / studio
-- co-member, 00014/00020/00316) is therefore the sole gate on which scans a
-- designer can see through this view, exactly as room_scan_geometry (00337)
-- already delegates.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.room_scan_documents
  WITH (security_invoker = true) AS
SELECT
  rs.id                     AS scan_id,
  rs.name                   AS name,
  rs.room_type              AS room_type,
  rs.scanned_at             AS scanned_at,
  rs.created_at             AS created_at,
  rs.quality_grade          AS quality_grade,
  rs.coverage_percentage    AS coverage_percentage,
  rs.status                 AS status,
  rs.user_id                AS user_id,

  -- Room View geometry header (00337) — NULL until the scan is parsed.
  g.width_ft                AS width_ft,
  g.depth_ft                AS depth_ft,
  g.floor_area_sqft         AS floor_area_sqft,
  g.wall_height_ft          AS wall_height_ft,
  g.parse_status            AS parse_status,

  -- The Document surface resolution (document_state v11 shapes A-D).
  ds.engagement_kind        AS engagement_kind,
  ds.engagement_id          AS engagement_id,
  ds.client_name            AS document_client_name,
  ds.active_section         AS active_section,

  -- Scan-owner fallback name for orphan scans (no document resolves at all).
  coalesce(nullif(btrim(owner.display_name), ''), owner.full_name)
                             AS owner_client_name

FROM public.room_scans rs

LEFT JOIN public.room_scan_geometry g
  ON g.scan_id = rs.id

-- Newest lead this scan is attached to, either as the lead's PRIMARY scan
-- (leads.room_scan_id, 00029) or via the full-set junction (lead_room_scans,
-- 00285). A scan can in principle ride more than one design request over
-- time (re-request after decline/expiry) — take the most recent.
LEFT JOIN LATERAL (
  SELECT l.*
  FROM public.leads l
  WHERE l.room_scan_id = rs.id
     OR EXISTS (
          SELECT 1 FROM public.lead_room_scans lrs
          WHERE lrs.scan_id = rs.id AND lrs.lead_id = l.id
        )
  ORDER BY l.created_at DESC
  LIMIT 1
) l ON true

-- The relationship the resolved lead graduated into, if any. lead_id carries
-- no UNIQUE constraint on designer_clients (00331 re-scoped the unique index
-- to (designer_id, client_id) WHERE client_id IS NOT NULL AND status <>
-- 'lead' — lead_id itself was never the uniqueness key), so take the most
-- recently touched relationship defensively.
LEFT JOIN LATERAL (
  SELECT dc.*
  FROM public.designer_clients dc
  WHERE dc.lead_id = l.id
  ORDER BY dc.updated_at DESC NULLS LAST, dc.created_at DESC
  LIMIT 1
) dc ON true

-- The document_state row this scan resolves to, precedence-ordered.
-- Match legs (OR'd — any one qualifies a document_state row as a candidate):
--   (1) the scan's own project link           → normally Shape A
--   (2) the resolved lead's lead_id            → Shape C (open lead) or
--                                                 Shape D (graduated relationship;
--                                                 document_state emits dc.lead_id
--                                                 there too, per 00327 delta 4)
--   (3) a proposal raised for the relationship → Shape B
--   (4) that proposal's activated project      → post-activation Shape A, for
--                                                 households whose project
--                                                 exists but whose SCAN never
--                                                 got rs.project_id stamped
-- Precedence (project → proposal → relationship → lead) is then applied via
-- an explicit CASE over the real engagement_kind tag, not leg order, so a
-- scan with multiple candidates always prefers the most "arrived" shape.
LEFT JOIN LATERAL (
  SELECT ds.*
  FROM public.document_state ds
  WHERE
    (rs.project_id IS NOT NULL AND ds.project_id = rs.project_id)
    OR (l.id IS NOT NULL AND ds.lead_id = l.id)
    OR (dc.id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.proposals p
          WHERE p.designer_client_id = dc.id
            AND p.id = ds.proposal_id
        ))
    OR (dc.id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.proposals p
          WHERE p.designer_client_id = dc.id
            AND p.project_id IS NOT NULL
            AND p.project_id = ds.project_id
        ))
  ORDER BY
    CASE ds.engagement_kind
      WHEN 'project'      THEN 0
      WHEN 'proposal'     THEN 1
      WHEN 'relationship' THEN 2
      WHEN 'lead'         THEN 3
      ELSE 4
    END,
    ds.updated_at DESC NULLS LAST
  LIMIT 1
) ds ON true

LEFT JOIN public.profiles owner
  ON owner.id = rs.user_id;

COMMENT ON VIEW public.room_scan_documents IS
  'Room View (W1-T4): one row per room_scans scan, resolving its client + '
  'document_state (v11) reference for the Rooms roster. Chains: '
  'rs.project_id → Shape A; leads.room_scan_id/lead_room_scans (00029/00285) '
  '→ designer_clients.lead_id → Shape D; proposals.designer_client_id (00327) '
  '→ Shape B / post-activation Shape A; still-open lead → Shape C. Precedence '
  'project > proposal > relationship > lead via document_state.engagement_kind. '
  'security_invoker = true — room_scans RLS (owner/association/studio, '
  '00014/00020/00316) is the sole read gate. owner_client_name is the scan '
  'owner''s profile name, a fallback label for scans with no resolved document.';

GRANT SELECT ON public.room_scan_documents TO authenticated, service_role;
