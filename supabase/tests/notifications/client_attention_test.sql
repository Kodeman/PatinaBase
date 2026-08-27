-- ═══════════════════════════════════════════════════════════════════════════
-- notify_client_attention tests (migration 00534) — SP-08's durable half
--
-- The bell reads `notification_log` filtered to channel in (in_app, push) and
-- status in (queued, sending, delivered, unconfirmed, opened, clicked). Nothing
-- in the money or decision rail ever wrote a client-facing row there, so the
-- bell said "Nothing yet" while the Studio two screens away listed an overdue
-- decision, a $4,250 invoice and a proposal to review.
--
-- Covers:
--   1. Grant posture (critique M5) — a SECURITY DEFINER writer that inserts for
--      an ARBITRARY user_id must not be reachable by `authenticated`, or any
--      signed-in client could forge notifications for someone else.
--   2. TWO rows per call (critique B6) — one in_app/delivered, one push/queued.
--   3. The row contract lane C decodes: metadata.title / .body / .message /
--      .entity_type / .entity_id / .deep_link, in the spellings
--      NotificationsAPIClient.swift:135-145 and NotificationRouter.swift:61-88
--      actually read.
--   4. The bell survives a failed push — apns-send stamps the row it is handed
--      'failed' on total failure, and 'failed' is excluded from the client's
--      visible filter. Only the PUSH row's id is ever handed over.
--  4b. THE SEAM (review B-D1). Exactly ONE in_app row per entity is what the
--      bell may render. The push envelope sits inside the client's CURRENT
--      status filter in every non-failed state — including 'queued', which is
--      the default until apns-send has tokens to send to — so a feed that asks
--      for channel=in.(in_app,push) reads every attention twice. There is no
--      non-visible notification_status (00041:14-23), so this side cannot fix
--      it; the assertion states the contract lane C must narrow to
--      (channel=eq.in_app), and fails the moment a second in_app row appears.
--   5. De-duplication on entity id (SP-08's own risk note) — a second call for
--      the same open entity updates the in-app row rather than stacking one.
--   6. The AFTER INSERT OR UPDATE OF status trigger on client_decisions, in
--      the 00289 shape: it fires for a pending decision in the client's court,
--      stays silent for a draft or a designer-court row, and can never unwind
--      the write.
--  6b. The UPDATE leg (review M-D1) — the shipped send path is a draft→pending
--      UPDATE (publish_client_decision, 00399:3505; the project-approval send,
--      00464:997), not an INSERT, so an INSERT-only trigger would have left
--      SP-08's decision half writing nothing at all.
--  6c. The copy follows coordination_kind (review minor 1) — a punch item in
--      the client's court is not announced as "A decision needs you".
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/notifications/client_attention_test.sql
--
-- Single transaction; ROLLBACK at the end. Rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d5000000-0000-4000-8000-000000000001', 'ca-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5000000-0000-4000-8000-000000000002', 'ca-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d5000000-0000-4000-8000-000000000001', 'ca-designer@test.invalid', 'CA Designer', true,  NOW(), NOW()),
  ('d5000000-0000-4000-8000-000000000002', 'ca-client@test.invalid',   'CA Client',   false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d5010000-0000-4000-8000-000000000001', 'design_studio', 'CA Studio', 'ca-studio-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('d5020000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
        'd5010000-0000-4000-8000-000000000001', 'owner', 'active', NOW());

-- Two roster rows: one addressed to a real client, one to a not-yet-signed-up
-- client (client_id NULL) — the second proves the trigger stays silent rather
-- than raising when there is nobody to notify.
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES
  ('d5030000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
   'd5000000-0000-4000-8000-000000000002', 'CA Client', 'ca-client@test.invalid', 'active', 'direct'),
  ('d5030000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001',
   NULL, 'CA Unsigned', 'ca-unsigned@test.invalid', 'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('d5040000-0000-4000-8000-000000000001', 'CA Project',
        'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
        'd5000000-0000-4000-8000-000000000002', 'd5010000-0000-4000-8000-000000000001', 'active');

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client  uuid := 'd5000000-0000-4000-8000-000000000002';
  v_invoice uuid := 'd50a0000-0000-4000-8000-000000000001';
  v_project uuid := 'd5040000-0000-4000-8000-000000000001';
  v_push    uuid;
  v_count   int;
  v_meta    jsonb;
  v_visible constant text[] :=
    ARRAY['queued','sending','delivered','unconfirmed','opened','clicked'];
BEGIN
  -- ── 1. grant posture (M5) ──
  ASSERT NOT has_function_privilege('authenticated',
      'public.notify_client_attention(uuid,text,uuid,text,text,jsonb)', 'EXECUTE'),
    'notify_client_attention must NOT be executable by authenticated — it writes for an arbitrary user_id';
  ASSERT NOT has_function_privilege('anon',
      'public.notify_client_attention(uuid,text,uuid,text,text,jsonb)', 'EXECUTE'),
    'notify_client_attention must NOT be executable by anon';
  ASSERT has_function_privilege('service_role',
      'public.notify_client_attention(uuid,text,uuid,text,text,jsonb)', 'EXECUTE'),
    'notify_client_attention must be executable by service_role';

  -- ── 2 + 3. two rows, one call, in the contract lane C decodes ──
  v_push := public.notify_client_attention(
    u_client, 'invoice', v_invoice,
    'An invoice is ready',
    'CA Studio sent invoice INV-2026-0142 for CA Project.',
    jsonb_build_object('project_id', v_project, 'amount_cents', 425000,
                       'due_date', '2026-09-01')
  );
  ASSERT v_push IS NOT NULL, 'notify_client_attention must return the push row id';

  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.metadata->>'entity_id' = v_invoice::text;
  ASSERT v_count = 2,
    'one call must write exactly two rows, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.metadata->>'entity_id' = v_invoice::text
     AND n.channel = 'in_app' AND n.status = 'delivered';
  ASSERT v_count = 1, 'the in-app row must be channel in_app / status delivered';

  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.id = v_push AND n.channel = 'push' AND n.status = 'queued';
  ASSERT v_count = 1, 'the returned id must be the push row, channel push / status queued';

  SELECT n.metadata INTO v_meta FROM public.notification_log n
   WHERE n.user_id = u_client AND n.channel = 'in_app'
     AND n.metadata->>'entity_id' = v_invoice::text;
  ASSERT v_meta->>'entity_type' = 'invoice',
    'entity_type must be the lower-case NotificationRouter vocabulary';
  ASSERT v_meta->>'entity_id' = v_invoice::text, 'entity_id must be the entity uuid as text';
  ASSERT v_meta->>'title' = 'An invoice is ready', 'metadata.title is what the bell prints';
  ASSERT v_meta->>'body' LIKE 'CA Studio sent invoice%',
    'metadata.body is what the bell prints under the title (00289/00388 wrote only "message")';
  ASSERT v_meta->>'message' = v_meta->>'body',
    'metadata.message must mirror body — the client portal inbox reads "message"';
  ASSERT v_meta->>'deep_link' = '/invoices/' || v_invoice::text, 'deep_link must address the invoice';
  ASSERT (v_meta->>'amount_cents')::int = 425000, 'caller metadata must survive the merge';
  ASSERT v_meta->>'project_id' = v_project::text, 'caller metadata must survive the merge';

  -- ── 4. the bell survives a failed push (critique B6) ──
  -- apns-send stamps the row it was handed 'failed' when every token fails.
  UPDATE public.notification_log SET status = 'failed' WHERE id = v_push;
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.metadata->>'entity_id' = v_invoice::text
     AND n.channel IN ('in_app','push') AND n.status::text = ANY(v_visible);
  ASSERT v_count = 1,
    'a failed push must leave the in-app row standing, got ' || v_count || ' visible rows';
  UPDATE public.notification_log SET status = 'queued' WHERE id = v_push;

  -- ── 4b. the seam: ONE bell row, whatever the envelope is doing (B-D1) ──
  -- The push row is back at 'queued' — the DEFAULT state, since apns-send
  -- returns early on no_tokens (apns-send/index.ts:205-207) and never stamps
  -- it. 'queued' is inside the client's status filter, so the ONLY thing
  -- keeping the envelope out of the bell is the channel predicate. This is
  -- what lane C must narrow to; it is asserted here so a regression on this
  -- side (a second in_app row, a bell row handed to apns-send) fails loudly.
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.metadata->>'entity_id' = v_invoice::text
     AND n.channel = 'in_app' AND n.status::text = ANY(v_visible);
  ASSERT v_count = 1,
    'exactly one in_app row may be visible per entity — the bell''s whole feed, got ' || v_count;
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.metadata->>'entity_id' = v_invoice::text
     AND n.channel = 'push' AND n.status::text = ANY(v_visible);
  ASSERT v_count = 1,
    'and the envelope is visible under the CURRENT client filter — which is why NotificationsAPIClient must ask for channel=eq.in_app (d-notes §2(d))';

  -- ── 5. de-duplication on entity id ──
  PERFORM public.notify_client_attention(
    u_client, 'invoice', v_invoice,
    'Your invoice is due soon',
    'Invoice INV-2026-0142 is due Sep 1.',
    jsonb_build_object('project_id', v_project)
  );
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.channel = 'in_app'
     AND n.metadata->>'entity_id' = v_invoice::text;
  ASSERT v_count = 1,
    'a second call for the same open entity must not stack a second bell row, got ' || v_count;
  SELECT n.metadata INTO v_meta FROM public.notification_log n
   WHERE n.user_id = u_client AND n.channel = 'in_app'
     AND n.metadata->>'entity_id' = v_invoice::text;
  ASSERT v_meta->>'title' = 'Your invoice is due soon',
    'the de-duplicated row must carry the LATEST title';

  -- ── 6. the trigger on client_decisions ──
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title,
    decision_type, coordination_kind, court, status, sent_at
  ) VALUES (
    'd5050000-0000-4000-8000-000000000001', 'd5030000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001', v_project, 'Pick the dining chair fabric',
    'material', 'selection', 'client', 'pending', now()
  );
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client
     AND n.metadata->>'entity_id' = 'd5050000-0000-4000-8000-000000000001'
     AND n.metadata->>'entity_type' = 'decision';
  ASSERT v_count = 2,
    'a pending client-court decision must write both rows, got ' || v_count;

  SELECT n.metadata INTO v_meta FROM public.notification_log n
   WHERE n.channel = 'in_app'
     AND n.metadata->>'entity_id' = 'd5050000-0000-4000-8000-000000000001';
  ASSERT v_meta->>'deep_link' = '/decisions/d5050000-0000-4000-8000-000000000001',
    'a decision row must deep-link to the decision';
  ASSERT v_meta->>'body' LIKE '%dining chair fabric%',
    'the decision''s own title is what the client is told about';

  -- a draft writes nothing
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title,
    decision_type, coordination_kind, court, status
  ) VALUES (
    'd5050000-0000-4000-8000-000000000002', 'd5030000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001', v_project, 'Unsent draft',
    'material', 'selection', 'client', 'draft'
  );
  -- a decision sitting in the DESIGNER's court writes nothing
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title,
    decision_type, coordination_kind, court, status, sent_at
  ) VALUES (
    'd5050000-0000-4000-8000-000000000003', 'd5030000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001', v_project, 'Designer-court RFI',
    'product', 'rfi', 'designer', 'pending', now()
  );
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.metadata->>'entity_id' IN ('d5050000-0000-4000-8000-000000000002',
                                      'd5050000-0000-4000-8000-000000000003');
  ASSERT v_count = 0,
    'a draft or designer-court decision must stay silent, got ' || v_count || ' rows';

  -- ── 6b. the UPDATE leg — the path a designer actually sends by (M-D1) ──
  -- publish_client_decision (00399:3505) and the project-approval send
  -- (00464:997) both UPDATE draft→pending over a row inserted 'draft'
  -- (00463:1332). An AFTER INSERT trigger alone never sees them.
  UPDATE public.client_decisions
     SET status = 'pending', sent_at = now()
   WHERE id = 'd5050000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client
     AND n.metadata->>'entity_id' = 'd5050000-0000-4000-8000-000000000002';
  ASSERT v_count = 2,
    'a draft published to pending must reach the bell, got ' || v_count || ' rows';

  -- and a write that names status without changing it must not re-ring it
  UPDATE public.client_decisions
     SET status = 'pending', title = 'Unsent draft, retitled'
   WHERE id = 'd5050000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.user_id = u_client AND n.channel = 'in_app'
     AND n.metadata->>'entity_id' = 'd5050000-0000-4000-8000-000000000002';
  ASSERT v_count = 1,
    'a pending→pending write must not stack a second bell row, got ' || v_count;

  -- ── 6c. the copy follows coordination_kind (minor 1) ──
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title,
    decision_type, coordination_kind, court, status, sent_at
  ) VALUES (
    'd5050000-0000-4000-8000-000000000005', 'd5030000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001', v_project, 'Scuffed baseboard, dining room',
    'approval', 'punch', 'client', 'pending', now()
  );
  SELECT n.metadata INTO v_meta FROM public.notification_log n
   WHERE n.channel = 'in_app'
     AND n.metadata->>'entity_id' = 'd5050000-0000-4000-8000-000000000005';
  ASSERT v_meta->>'title' = 'A punch item needs you',
    'a punch item must not be announced as a decision, got ' || COALESCE(v_meta->>'title', '(no row)');

  -- ── 7. the trigger can never unwind the insert (00289 posture) ──
  -- designer_clients row 2 has client_id NULL: there is nobody to notify.
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title,
    decision_type, coordination_kind, court, status, sent_at
  ) VALUES (
    'd5050000-0000-4000-8000-000000000004', 'd5030000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000001', NULL, 'Decision for an unsigned client',
    'material', 'selection', 'client', 'pending', now()
  );
  ASSERT EXISTS (SELECT 1 FROM public.client_decisions
                  WHERE id = 'd5050000-0000-4000-8000-000000000004'),
    'a decision for a client with no account must still be written';
  SELECT count(*) INTO v_count FROM public.notification_log n
   WHERE n.metadata->>'entity_id' = 'd5050000-0000-4000-8000-000000000004';
  ASSERT v_count = 0, 'and it must notify nobody';

  RAISE NOTICE 'client_attention_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
