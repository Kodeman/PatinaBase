-- First Flight · W0 · L0.7 — the activeProject client fixture probe.
--
-- The seven items PROGRAM.md §3 W0 L0.7 requires the seed to carry for
-- client@patina.dev (a0000000-0000-0000-0000-000000000005), counted exactly as
-- the iOS app reads them. Run before and after `pnpm supabase:reset`.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -qAt \
--     -f artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/l07-fixture-probe.sql
--
-- Read-only. Local stack only — never point this at Strata.

WITH c AS (SELECT 'a0000000-0000-0000-0000-000000000005'::uuid AS uid)
SELECT '1_proposal_sent'        AS item, count(*) AS n FROM public.proposals p, c
  WHERE p.client_id = c.uid AND p.status = 'sent'
UNION ALL
SELECT '2_decision_pending', count(*) FROM public.client_decisions d
  JOIN public.projects pr ON pr.id = d.project_id, c
  WHERE pr.client_id = c.uid AND d.status = 'pending'
UNION ALL
SELECT '3_invoice_open', count(*) FROM public.invoices i, c
  WHERE i.client_id = c.uid AND i.status IN ('sent', 'overdue', 'partially_paid')
UNION ALL
SELECT '4_document_client_visible', count(*) FROM public.project_documents pd
  JOIN public.projects pr ON pr.id = pd.project_id, c
  WHERE pr.client_id = c.uid AND pd.client_visible
UNION ALL
SELECT '4a_document_openable_path', count(*) FROM public.project_documents pd
  JOIN public.projects pr ON pr.id = pd.project_id, c
  WHERE pr.client_id = c.uid AND pd.client_visible AND pd.storage_path IS NOT NULL
UNION ALL
SELECT '4b_document_null_path', count(*) FROM public.project_documents pd
  JOIN public.projects pr ON pr.id = pd.project_id, c
  WHERE pr.client_id = c.uid AND pd.client_visible AND pd.storage_path IS NULL
UNION ALL
SELECT '5_project', count(*) FROM public.projects pr, c WHERE pr.client_id = c.uid
UNION ALL
SELECT '6_order_fulfillment', count(*) FROM public.fulfillment_orders fo, c
  WHERE fo.client_profile_id = c.uid
UNION ALL
SELECT '7_comms_thread_project', count(*) FROM public.comms_threads t
  JOIN public.comms_thread_participants tp
    ON tp.thread_id = t.id AND tp.left_at IS NULL, c
  WHERE t.kind = 'project' AND tp.profile_id = c.uid
UNION ALL
SELECT '7a_comms_messages', count(*) FROM public.comms_messages m
  JOIN public.comms_thread_participants tp
    ON tp.thread_id = m.thread_id AND tp.left_at IS NULL, c
  WHERE tp.profile_id = c.uid AND m.deleted_at IS NULL
ORDER BY 1;
