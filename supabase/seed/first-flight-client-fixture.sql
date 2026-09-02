-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: First Flight — the activeProject client fixture.
--
-- The iOS client app (round one, First Flight) signs in as client@patina.dev
-- and its daily surfaces read seven things. Five were already seeded:
--   1. a `sent` proposal            proposals.sql        (b0000000-…-0002)
--   2. a decision awaiting the client  decisions.sql     (3 rows, status pending)
--   3. an open invoice              invoices.sql         (INV-2026-0142, sent)
--   5. a project                    decisions.sql        (Aspen Loft Refresh)
--   6. an order                     direct-orders-dev.sql (1 fulfillment_orders)
-- Two were not, and this file supplies them:
--   4. a client-visible DOCUMENT — `GAP2.md` recorded documents as "NOT
--      REACHABLE with the seeded client"; the three Aspen Loft rows exist but
--      `client_visible` defaults to false, so `DocumentsAPIClient.listDocuments`
--      (which filters `client_visible = true`) returned an empty list.
--   7. a live MESSAGE THREAD — the app reads `comms_threads` /
--      `comms_messages` (MessagingAPIClient), not the `client_messages` rows
--      messages.sql seeds; there was no comms thread for this client at all.
--
-- Storage note. The client's read of a document's bytes is granted by the
-- storage policy "Project members can read documents", which joins
-- `project_documents.storage_path` to `storage.objects.name` and requires
-- `client_visible = true`. The path must therefore start with the project id.
-- Three states are seeded on purpose, so the walk can see all three:
--   • Service Agreement — a real path (upload bytes to it to test a good open)
--   • Floor Plan        — a path with no object behind it (signed-URL failure)
--   • FF&E Schedule     — no path at all (DocumentError.missingPath)
--
-- Touches only client@patina.dev's house. Idempotent: fixed UUIDs, ON CONFLICT,
-- and UPDATEs that are safe to re-run. Must run after project_documents_tasks.sql
-- (which creates the documents) and decisions.sql (which creates the project).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  uid_client   UUID := 'a0000000-0000-0000-0000-000000000005';  -- Client User
  v_project    UUID := 'b0000000-0000-0000-0000-0000000000d1';  -- Aspen Loft Refresh
  v_thread     UUID := 'c0ff0000-0000-0000-0000-000000000001';
  v_doc_ok     UUID := 'd0c00000-0000-0000-0000-000000000001';  -- Service Agreement (pdf)
  v_doc_gone   UUID := 'd0c00000-0000-0000-0000-000000000002';  -- Floor Plan (dwg)
  v_doc_nopath UUID := 'd0c00000-0000-0000-0000-000000000003';  -- FF&E Schedule (xlsx)
  v_visible    INT;
  v_messages   INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project AND client_id = uid_client) THEN
    RAISE NOTICE 'first-flight-client-fixture.sql: project % is not the dev client''s - run decisions.sql first, skipping', v_project;
    RETURN;
  END IF;

  -- ── 4. Documents the client can actually see, and open, and fail to open ──
  UPDATE public.project_documents
     SET client_visible = TRUE,
         storage_path   = v_project::text || '/service-agreement-aspen-loft.pdf',
         updated_at     = NOW()
   WHERE id = v_doc_ok;

  UPDATE public.project_documents
     SET client_visible = TRUE,
         storage_path   = v_project::text || '/floor-plan-living-dining.dwg',
         updated_at     = NOW()
   WHERE id = v_doc_gone;

  -- Left with storage_path NULL on purpose: the "isn't available to open yet"
  -- branch of DocumentsAPIClient.downloadedFileURL.
  UPDATE public.project_documents
     SET client_visible = TRUE,
         storage_path   = NULL,
         updated_at     = NOW()
   WHERE id = v_doc_nopath;

  -- ── 7. One live project thread the client participates in ────────────────
  INSERT INTO public.comms_threads
    (id, kind, project_id, title, created_by, created_at, updated_at, last_message_at)
  VALUES
    (v_thread, 'project', v_project, 'Aspen Loft Refresh',
     uid_designer, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 hours')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comms_thread_participants
    (thread_id, profile_id, role, joined_at, last_read_at)
  VALUES
    (v_thread, uid_designer, 'designer', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 hour'),
    -- Read up to the client's own last reply, so the designer's closing
    -- message is genuinely unread and the thread carries an unread state.
    (v_thread, uid_client,   'client',   NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day')
  ON CONFLICT (thread_id, profile_id) DO NOTHING;

  INSERT INTO public.comms_messages (id, thread_id, sender_id, body, created_at)
  VALUES
    ('c0ff0000-0000-0000-0000-0000000000a1', v_thread, uid_designer,
     'The living room drawings are in the folder now — the service agreement and the floor plan are both there whenever you want to look.',
     NOW() - INTERVAL '4 days'),
    ('c0ff0000-0000-0000-0000-0000000000a2', v_thread, uid_client,
     'Looked through them last night. The seating plan reads exactly how we talked about it.',
     NOW() - INTERVAL '2 days'),
    ('c0ff0000-0000-0000-0000-0000000000a3', v_thread, uid_designer,
     'Good. One thing left before the workroom starts: the dining chairs. Shaker oak or windsor elm — the decision is waiting for you.',
     NOW() - INTERVAL '2 hours')
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_visible
    FROM public.project_documents
   WHERE project_id = v_project AND client_visible;

  SELECT count(*) INTO v_messages
    FROM public.comms_messages
   WHERE thread_id = v_thread;

  RAISE NOTICE 'first-flight-client-fixture.sql: % client-visible documents, thread % with % messages',
    v_visible, v_thread, v_messages;
END $$;
