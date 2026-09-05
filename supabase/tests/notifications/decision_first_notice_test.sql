-- ═══════════════════════════════════════════════════════════════════════════
-- decision_dispatch_first_notice tests (migration 00568) — P-02's producer
--
-- Until 00568 nothing produced an email when an approval was published.
-- publish_client_decision (00464) wrote an in-app row through
-- _enqueue_decision_notification (00466) and stopped; the only decision letter
-- a homeowner received came from the decision-reminders cron (00092), 48 hours
-- before the due date. She read a reminder for a send she was never mailed
-- about. This trigger is the missing producer.
--
-- Covers:
--   1. Grant posture — a SECURITY DEFINER trigger function that dispatches an
--      edge function with the service-role key must not be reachable by anon
--      or authenticated, and must pin its search_path.
--   2. Trigger shape — AFTER INSERT OR UPDATE on client_decisions, row-level,
--      the same firing edge as notify_client_decision_raised (00534) so the
--      letter and the bell agree on what "put to the client" means.
--   3. The UPDATE leg — the shipped send path is a draft→pending UPDATE
--      (publish_client_decision, 00464), so an INSERT-only trigger would
--      produce nothing at all. The dispatch is observable locally because
--      99-local-edge-settings seeds the Vault entries invoke_edge_function
--      reads, and pg_net records the request in net.http_request_queue.
--   4. Silence where there is no ask — a draft, and a designer-court row,
--      dispatch nothing.
--   5. Once per send — a republish-shaped UPDATE that names status without
--      changing it must not announce the same approval twice.
--   6. Non-fatal — the designer's write survives a dispatch that fails.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/notifications/decision_first_notice_test.sql
--
-- Single transaction; ROLLBACK at the end. Rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'fn-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f1000000-0000-4000-8000-000000000002', 'fn-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'fn-designer@test.invalid', 'FN Designer', true,  NOW(), NOW()),
  ('f1000000-0000-4000-8000-000000000002', 'fn-client@test.invalid',   'FN Client',   false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('f1030000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000002', 'FN Client', 'fn-client@test.invalid', 'active', 'direct');

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_designer  uuid := 'f1000000-0000-4000-8000-000000000001';
  v_rel       uuid := 'f1030000-0000-4000-8000-000000000001';
  v_published uuid := 'f1050000-0000-4000-8000-000000000001';
  v_draft     uuid := 'f1050000-0000-4000-8000-000000000002';
  v_desk      uuid := 'f1050000-0000-4000-8000-000000000003';
  v_count     int;
  v_before    int;
  v_dispatch  boolean;
BEGIN
  -- ── 1. grant posture ──
  ASSERT NOT has_function_privilege('authenticated',
      'public.decision_dispatch_first_notice()', 'EXECUTE'),
    'decision_dispatch_first_notice must NOT be executable by authenticated — it dispatches with the service-role key';
  ASSERT NOT has_function_privilege('anon',
      'public.decision_dispatch_first_notice()', 'EXECUTE'),
    'decision_dispatch_first_notice must NOT be executable by anon';
  ASSERT has_function_privilege('service_role',
      'public.decision_dispatch_first_notice()', 'EXECUTE'),
    'decision_dispatch_first_notice must be executable by service_role';

  SELECT count(*) INTO v_count FROM pg_proc
   WHERE proname = 'decision_dispatch_first_notice'
     AND prosecdef
     AND proconfig @> ARRAY['search_path=public, pg_temp'];
  ASSERT v_count = 1,
    'decision_dispatch_first_notice must be SECURITY DEFINER with a pinned search_path';

  -- ── 2. trigger shape (the 00534 firing edge) ──
  SELECT count(*) INTO v_count
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname = 'decision_first_notice_dispatch'
     AND c.relname = 'client_decisions'
     AND NOT t.tgisinternal
     AND (t.tgtype & 1) = 1    -- FOR EACH ROW
     AND (t.tgtype & 2) = 0    -- AFTER, not BEFORE
     AND (t.tgtype & 4) = 4    -- ON INSERT
     AND (t.tgtype & 16) = 16; -- ON UPDATE
  ASSERT v_count = 1,
    'decision_first_notice_dispatch must be an AFTER INSERT OR UPDATE row trigger on client_decisions';

  -- ── 3. the UPDATE leg dispatches ──
  -- Draft first: the publish path is a transition, not an insert-at-pending.
  INSERT INTO public.client_decisions
    (id, designer_id, designer_client_id, title, status, court, due_date)
  VALUES (v_published, v_designer, v_rel, 'FN published ask', 'draft', 'client',
          (now() + interval '20 days')::date);

  SELECT count(*) INTO v_before FROM net.http_request_queue
   WHERE url LIKE '%/functions/v1/decision-first-notice';

  UPDATE public.client_decisions SET status = 'pending' WHERE id = v_published;

  SELECT count(*) > v_before INTO v_dispatch FROM net.http_request_queue
   WHERE url LIKE '%/functions/v1/decision-first-notice';
  ASSERT v_dispatch,
    'the draft→pending publish must dispatch decision-first-notice';

  SELECT count(*) INTO v_count FROM net.http_request_queue
   WHERE url LIKE '%/functions/v1/decision-first-notice'
     AND convert_from(body, 'UTF8')::jsonb->>'decision_id' = v_published::text;
  ASSERT v_count = 1,
    'the dispatch must carry the published decision id exactly once, got ' || v_count;

  -- ── 5. once per send: a republish-shaped write announces nothing new ──
  UPDATE public.client_decisions
     SET status = 'pending', due_date = (now() + interval '25 days')::date
   WHERE id = v_published;

  SELECT count(*) INTO v_count FROM net.http_request_queue
   WHERE url LIKE '%/functions/v1/decision-first-notice'
     AND convert_from(body, 'UTF8')::jsonb->>'decision_id' = v_published::text;
  ASSERT v_count = 1,
    'a write that names status without changing it must not announce twice, got ' || v_count;

  -- ── 4. silence where there is no ask ──
  INSERT INTO public.client_decisions
    (id, designer_id, designer_client_id, title, status, court, due_date)
  VALUES (v_draft, v_designer, v_rel, 'FN unsent ask', 'draft', 'client',
          (now() + interval '20 days')::date),
         (v_desk, v_designer, v_rel, 'FN designer-court ask', 'pending', 'designer',
          (now() + interval '20 days')::date);

  SELECT count(*) INTO v_count FROM net.http_request_queue
   WHERE url LIKE '%/functions/v1/decision-first-notice'
     AND convert_from(body, 'UTF8')::jsonb->>'decision_id' IN (v_draft::text, v_desk::text);
  ASSERT v_count = 0,
    'a draft and a designer-court row must dispatch nothing, got ' || v_count;

  -- ── 6. non-fatal: the designer's write survives a broken dispatch ──
  -- Point the bridge at an unresolvable setting so invoke_edge_function raises,
  -- and prove the status flip still commits.
  PERFORM set_config('app.settings.supabase_url', '', true);
  UPDATE public.client_decisions SET status = 'draft'  WHERE id = v_draft;
  UPDATE public.client_decisions SET status = 'pending' WHERE id = v_draft;
  SELECT count(*) INTO v_count FROM public.client_decisions
   WHERE id = v_draft AND status = 'pending';
  ASSERT v_count = 1,
    'a dispatch failure must never unwind the designer''s write';

  RAISE NOTICE 'decision_first_notice_test: all assertions passed';
END $$;

ROLLBACK;
