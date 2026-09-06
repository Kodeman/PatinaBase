-- ═══════════════════════════════════════════════════════════════════════════
-- 00572 — "She sets the pace" contract tests
--
-- Program: "The Decision, Delivered" · Wave 3 · P-28, plus the Wave-2 walk nit
-- W2-n4. Ruling R16 is what most of these assertions are: Patina goes quiet
-- after the overdue notice, push honours 8am–8pm local and releases at 8am, and
-- the in-app row is never deferred.
--
-- Covers:
--   1. The three cadences — the widened CHECK, the new default, the forward
--      mapping, and the trigger that keeps yesterday's portal writing legally.
--   2. decision_snoozes — shape, grant posture, and RLS (a reader may only ever
--      see and write her own row).
--   3. set_decision_snooze — the arithmetic of all four kinds in the caller's
--      own zone, and its refusal of anyone the approval is not addressed to.
--   4. The push window — deliver_after on the envelope minted at midnight,
--      none on the one minted at noon, the bell row never deferred either way,
--      and release_due_client_pushes claiming only the rows whose hour came.
--   5. The receipt is still silent (00569, regrafted here): one already-read
--      in_app row, no push envelope, nothing handed to apns-send.
--   6. The first-notice retry sweep's selection — what it picks up and the
--      five things it leaves alone.
--   7. The studio hand-off row: the sentence, the rail, and its idempotency.
--   8. The why is signed with the display name, and the backfill moves a row
--      00569 signed with a given name.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/notifications/she_sets_the_pace_test.sql
--
-- Single transaction; ROLLBACK at the end. Rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
--
-- Built through the canonical Stage-2 rail (create_project_approval_decision →
-- publish_client_decision), not by hand: `guard_stage2_client_decision_edge`
-- (00464) refuses a hand-written Stage-2 row, and a fixture that has to be
-- forced past the guard would not be the thing the sweep actually reads.

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', p_actor, 'role', p_role))::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_actor(uuid, text) TO PUBLIC;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('e7000000-0000-4000-8000-000000000001', 'sp-designer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e7000000-0000-4000-8000-000000000002', 'sp-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e7000000-0000-4000-8000-000000000003', 'sp-stranger@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- The designer carries BOTH names, and they differ in the way that matters:
-- 00569 would freeze "Leah", the ruling asks for "Leah Kochaver".
INSERT INTO public.profiles (id, email, full_name, display_name, is_designer)
VALUES
  ('e7000000-0000-4000-8000-000000000001', 'sp-designer@test.invalid', 'Leah Kochaver', 'Leah Kochaver', true),
  ('e7000000-0000-4000-8000-000000000002', 'sp-client@test.invalid',   'Anne Brenner',  NULL,            false),
  ('e7000000-0000-4000-8000-000000000003', 'sp-stranger@test.invalid', 'Someone Else',  NULL,            false)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('e7010000-0000-4000-8000-000000000001', 'design_studio', 'Middle West Studio',
        'sp-middle-west-studio', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('e7011000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
        'e7010000-0000-4000-8000-000000000001', 'owner', 'active', now());

-- 00511: every project lead holds a designer-domain role.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT membership.user_id, role.id, membership.user_id
FROM public.organization_members AS membership
CROSS JOIN public.roles AS role
WHERE membership.organization_id = 'e7010000-0000-4000-8000-000000000001'
  AND membership.role = 'owner'
  AND role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('e7030000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
        'e7000000-0000-4000-8000-000000000002', 'Anne Brenner', 'sp-client@test.invalid',
        'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, current_phase)
VALUES ('e7040000-0000-4000-8000-000000000001', 'Cedar Lane Study',
        'e7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000002',
        'e7000000-0000-4000-8000-000000000001', 'e7010000-0000-4000-8000-000000000001',
        'active', 'design');

INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order, lane, follows_phase_id)
VALUES ('e7060000-0000-4000-8000-000000000001', 'e7040000-0000-4000-8000-000000000001',
        'Approval laboratory', 'sp-approval-lab', 'pending', 0, 'thread', NULL);

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
)
SELECT
  ('e7070000-0000-4000-8000-' || lpad(issue_no::text, 12, '0'))::uuid,
  'e7040000-0000-4000-8000-000000000001'::uuid,
  issue_no,
  'Kitchen plan set ' || issue_no,
  'sp-plan-' || issue_no,
  encode(extensions.digest(('sp-request-' || issue_no)::bytea, 'sha256'), 'hex'),
  encode(extensions.digest(('sp-artifact-' || issue_no)::bytea, 'sha256'), 'hex'),
  4 + issue_no,
  'e7000000-0000-4000-8000-000000000001'::uuid
FROM generate_series(1, 6) AS issue_no;

CREATE TEMP TABLE sp_decisions (
  label text PRIMARY KEY,
  decision_id uuid NOT NULL,
  authority_revision integer NOT NULL,
  artifact_hash text NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON sp_decisions TO authenticated, service_role;

SELECT pg_temp.assume_actor('e7000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;

SELECT public.set_project_decision_authority(
  'e7040000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000002', NULL, 0
);

RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.make_approval(
  p_label text,
  p_issue_no integer,
  p_due interval,
  p_why text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_project_approval_decision(
    'e7040000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'title', 'Approve ' || p_label,
      'question', 'Does ' || p_label || ' read right to you?',
      'dueAt', (now() + p_due)::text,
      'phaseId', 'e7060000-0000-4000-8000-000000000001',
      'sectionKey', 'project',
      'artifactKind', 'plan_issue',
      'artifactId', ('e7070000-0000-4000-8000-' ||
                     lpad(p_issue_no::text, 12, '0'))::uuid,
      'costCentsDelta', 0,
      'scheduleDaysDelta', 0,
      'leadTimeDaysDelta', 0
    ),
    'sp-create-' || p_label,
    p_why
  );
  INSERT INTO sp_decisions(label, decision_id, authority_revision, artifact_hash)
  VALUES (p_label, (v_result->>'decisionId')::uuid,
          (v_result->>'authorityRevision')::integer,
          v_result->>'artifactHash');
  RETURN (v_result->>'decisionId')::uuid;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.make_approval(text, integer, interval, text) TO PUBLIC;

SET LOCAL ROLE authenticated;
-- The sweep's candidate, and the one carrying a why for the W2-n4 assertions.
SELECT pg_temp.make_approval('fresh', 1, interval '3 days',
  'The pantry door swings into the hall now.');
-- Published long before 00568 existed.
SELECT pg_temp.make_approval('catalogue', 2, interval '3 days');
-- Already written to.
SELECT pg_temp.make_approval('written', 3, interval '3 days');
-- Attempted eight minutes ago.
SELECT pg_temp.make_approval('attempted', 4, interval '3 days');
-- Its date passes while this test runs.
SELECT pg_temp.make_approval('lapsing', 5, interval '2 seconds');
-- Never published: still a draft in the studio's hands.
SELECT pg_temp.make_approval('draft', 6, interval '3 days');

RESET ROLE;

-- The lead confirms she has read each one; publish refuses without it.
SELECT pg_temp.assume_actor('e7000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;

SELECT public.confirm_project_decision_review(
         row.decision_id,
         jsonb_build_object(
           'authorityRevision', row.authority_revision,
           'artifactHash', row.artifact_hash,
           'reviewMethod', 'portal_clickthrough'
         ),
         'sp-confirm-' || row.label
       )
FROM sp_decisions AS row
WHERE row.label <> 'draft'
ORDER BY row.label;

RESET ROLE;
SELECT pg_temp.assume_actor('e7000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;

SELECT public.publish_client_decision(row.decision_id)
FROM sp_decisions AS row
WHERE row.label <> 'draft'
ORDER BY row.label;

RESET ROLE;

-- sent_at is one of the columns the Stage-2 rail may move (00464's guard), so
-- the fixture backdates through the rail's own lever rather than around it.
DO $backdate$
DECLARE
  v_id uuid;
BEGIN
  SELECT decision_id INTO v_id FROM sp_decisions WHERE label = 'catalogue';
  PERFORM set_config('app.project_approval_decision_write_id', v_id::text, true);
  PERFORM set_config('app.client_decision_write_id', v_id::text, true);
  UPDATE public.client_decisions
     SET sent_at = '2026-08-01T12:00:00Z', updated_at = now()
   WHERE id = v_id;
  PERFORM set_config('app.project_approval_decision_write_id', '', true);
  PERFORM set_config('app.client_decision_write_id', '', true);
END
$backdate$;

-- The letter that already went out, and the attempt eight minutes ago.
INSERT INTO public.notification_log
  (user_id, type, channel, status, template_id, metadata, sent_at)
SELECT 'e7000000-0000-4000-8000-000000000002', 'decision_required', 'email', 'sent',
       'decision-required',
       jsonb_build_object('decisionId', row.decision_id::text, 'notice', 'first'),
       now()
FROM sp_decisions AS row WHERE row.label = 'written';

INSERT INTO public.decision_first_notice_attempts (decision_id, attempts, last_attempt_at)
SELECT row.decision_id, 1, now() - interval '8 minutes'
FROM sp_decisions AS row WHERE row.label = 'attempted';

-- The approval whose date has passed. `due_at` is frozen evidence — the
-- creating RPC refuses a date in the past and no lever moves one afterwards —
-- and a transaction's now() never advances, so waiting cannot produce this
-- state inside a test. The replication-role escape (the same one 00569's
-- contract test uses) writes it directly, and only this row.
SET LOCAL session_replication_role = replica;
UPDATE public.client_decisions
   SET due_date = now() - interval '1 day'
 WHERE id IN (SELECT decision_id FROM sp_decisions WHERE label = 'lapsing');
SET LOCAL session_replication_role = origin;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client   uuid := 'e7000000-0000-4000-8000-000000000002';
  u_designer uuid := 'e7000000-0000-4000-8000-000000000001';
  u_stranger uuid := 'e7000000-0000-4000-8000-000000000003';
  d_one      uuid;
  d_lapsing  uuid;
  v_result   jsonb;
  v_until    timestamptz;
  v_count    integer;
  v_text     text;
  v_push     uuid;
  v_deliver  timestamptz;
BEGIN
  SELECT decision_id INTO d_one FROM sp_decisions WHERE label = 'fresh';
  SELECT decision_id INTO d_lapsing FROM sp_decisions WHERE label = 'lapsing';
  -- ══ 1. The three cadences ════════════════════════════════════════════════

  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'notification_preferences'
             AND column_name = 'reminder_cadence') = '''daily''::text',
    'the default cadence is daily — the quietest one that still answers on time';

  INSERT INTO public.notification_preferences (user_id, timezone)
  VALUES (u_client, 'America/New_York');
  ASSERT (SELECT reminder_cadence FROM public.notification_preferences
           WHERE user_id = u_client) = 'daily',
    'a fresh preferences row takes the new default';

  -- Yesterday's portal, writing the retired spelling, is normalised not refused.
  UPDATE public.notification_preferences
     SET reminder_cadence = 'daily_digest' WHERE user_id = u_client;
  ASSERT (SELECT reminder_cadence FROM public.notification_preferences
           WHERE user_id = u_client) = 'daily',
    'daily_digest maps forward to daily on write';
  UPDATE public.notification_preferences
     SET reminder_cadence = 'immediate' WHERE user_id = u_client;
  ASSERT (SELECT reminder_cadence FROM public.notification_preferences
           WHERE user_id = u_client) = 'right_away',
    'immediate maps forward to right_away on write';

  UPDATE public.notification_preferences
     SET reminder_cadence = 'weekly_sunday' WHERE user_id = u_client;
  ASSERT (SELECT reminder_cadence FROM public.notification_preferences
           WHERE user_id = u_client) = 'weekly_sunday',
    'the third cadence is storable';

  BEGIN
    UPDATE public.notification_preferences
       SET reminder_cadence = 'hourly' WHERE user_id = u_client;
    RAISE EXCEPTION 'a cadence outside the three must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.notification_preferences
     SET reminder_cadence = 'right_away' WHERE user_id = u_client;

  -- ══ 2. decision_snoozes: grants and RLS ══════════════════════════════════

  ASSERT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.decision_snoozes'::regclass),
    'decision_snoozes has row-level security enabled';
  ASSERT NOT has_table_privilege('anon', 'public.decision_snoozes', 'SELECT'),
    'anon may not read a snooze';
  ASSERT has_table_privilege('authenticated', 'public.decision_snoozes', 'SELECT'),
    'a signed-in reader may read her own snoozes (RLS narrows it)';
  ASSERT NOT has_function_privilege('anon',
      'public.set_decision_snooze(uuid,text)', 'EXECUTE'),
    'anon may not set a snooze';
  ASSERT has_function_privilege('authenticated',
      'public.set_decision_snooze(uuid,text)', 'EXECUTE'),
    'a signed-in reader may set her own snooze';
  ASSERT NOT has_function_privilege('authenticated',
      'public.release_due_client_pushes(integer)', 'EXECUTE'),
    'the push release is service-side only';
  ASSERT NOT has_function_privilege('authenticated',
      'public.sweep_decision_first_notices(integer)', 'EXECUTE'),
    'the retry sweep is service-side only';
  ASSERT NOT has_function_privilege('authenticated',
      'public.record_decision_studio_handoff(uuid)', 'EXECUTE'),
    'the hand-off row is written by the service, never by a browser';

  -- ══ 3. set_decision_snooze — the arithmetic, in her zone ═════════════════

  PERFORM pg_temp.assume_actor(u_client);

  v_result := public.set_decision_snooze(d_one, 'tomorrow_morning');
  v_until := (SELECT snoozed_until FROM public.decision_snoozes
               WHERE user_id = u_client AND decision_id = d_one);
  ASSERT v_until > now(), 'tomorrow morning is in the future';
  ASSERT extract(hour FROM (v_until AT TIME ZONE 'America/New_York')) = 8,
    'tomorrow morning is 8am in HER zone';
  ASSERT (v_until AT TIME ZONE 'America/New_York')::date
         = ((now() AT TIME ZONE 'America/New_York')::date + 1),
    'tomorrow morning is tomorrow, not today';
  ASSERT v_result->>'timeZone' = 'America/New_York',
    'the RPC says which zone it computed in';

  v_result := public.set_decision_snooze(d_one, 'sunday');
  v_until := (SELECT snoozed_until FROM public.decision_snoozes
               WHERE user_id = u_client AND decision_id = d_one);
  ASSERT extract(dow FROM (v_until AT TIME ZONE 'America/New_York')) = 0,
    '"I''ll ask you Sunday" lands on a Sunday';
  ASSERT extract(hour FROM (v_until AT TIME ZONE 'America/New_York')) = 8,
    'and at eight in the morning';
  ASSERT v_until > now(), 'and never in the past';
  ASSERT (SELECT count(*) FROM public.decision_snoozes
           WHERE user_id = u_client AND decision_id = d_one) = 1,
    'choosing again replaces the standing snooze rather than stacking one';

  v_result := public.set_decision_snooze(d_one, 'when_due');
  ASSERT (SELECT snoozed_until FROM public.decision_snoozes
           WHERE user_id = u_client AND decision_id = d_one)
         = (SELECT due_date FROM public.client_decisions WHERE id = d_one),
    '"when it''s due" is the approval''s own date, never an invented one';

  v_result := public.set_decision_snooze(d_one, 'never');
  ASSERT (SELECT snoozed_until FROM public.decision_snoozes
           WHERE user_id = u_client AND decision_id = d_one)
         = 'infinity'::timestamptz,
    '"don''t remind me" is a standing quiet';
  ASSERT v_result->>'snoozedUntil' IS NULL,
    'and the RPC returns no date for it, because there is none to show';

  BEGIN
    PERFORM public.set_decision_snooze(d_one, 'in_a_bit');
    RAISE EXCEPTION 'an unknown snooze kind must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- A stranger — including a studio co-member — cannot silence her mail.
  PERFORM pg_temp.assume_actor(u_stranger);
  BEGIN
    PERFORM public.set_decision_snooze(d_one, 'never');
    RAISE EXCEPTION 'only the person being asked may snooze the ask';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- RLS, read from inside the role the browser actually holds: the postgres
  -- role owning this test bypasses every policy, so the check is worthless
  -- without the role change.
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT count(*) FROM public.decision_snoozes) = 0,
    'a stranger sees none of her snoozes';
  PERFORM pg_temp.assume_actor(u_client);
  ASSERT (SELECT count(*) FROM public.decision_snoozes) = 1,
    'and she sees her own';
  BEGIN
    INSERT INTO public.decision_snoozes (user_id, decision_id, snoozed_until, kind)
    VALUES (u_stranger, d_one, now() + interval '1 day', 'sunday');
    RAISE EXCEPTION 'a reader must not be able to write a snooze for someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM pg_temp.assume_actor(NULL);

  -- ══ 4. The push window ═══════════════════════════════════════════════════

  ASSERT public.notification_time_zone(u_client) = 'America/New_York',
    'the zone resolver reads her preference';
  ASSERT public.notification_time_zone(u_stranger) = 'America/New_York',
    'and falls back to the rail''s own default when there is no row';

  -- 05:00 in New York — outside the window.
  v_deliver := public.push_deliver_after(u_client, '2026-10-07T09:00:00Z');
  ASSERT v_deliver IS NOT NULL, 'an envelope minted at 5am waits';
  ASSERT extract(hour FROM (v_deliver AT TIME ZONE 'America/New_York')) = 8,
    'and waits exactly until eight';
  ASSERT v_deliver = '2026-10-07T12:00:00Z'::timestamptz,
    'the same morning, not the next one';

  -- 23:00 in New York — the release is the NEXT morning.
  v_deliver := public.push_deliver_after(u_client, '2026-10-07T03:00:00Z');
  ASSERT v_deliver = '2026-10-07T12:00:00Z'::timestamptz,
    'a late-night envelope waits for the coming morning';

  -- 12:00 in New York — inside the window, nothing to wait for.
  ASSERT public.push_deliver_after(u_client, '2026-10-07T16:00:00Z') IS NULL,
    'an envelope minted at noon goes now';
  -- 20:00 exactly is the far edge, and outside.
  ASSERT public.push_deliver_after(u_client, '2026-10-08T00:00:00Z') IS NOT NULL,
    'eight in the evening is the edge of the window, not inside it';

  DELETE FROM public.notification_log WHERE user_id = u_client;
  v_push := public.notify_client_attention(
    u_client, 'decision', d_one, 'Approve the issued set', 'It is ready.',
    '{}'::jsonb);

  ASSERT (SELECT count(*) FROM public.notification_log
           WHERE user_id = u_client AND channel = 'in_app') = 1,
    'the bell row is written exactly once';
  ASSERT (SELECT deliver_after FROM public.notification_log
           WHERE user_id = u_client AND channel = 'in_app') IS NULL,
    'the in-app row is NEVER deferred (R16)';
  ASSERT (SELECT count(*) FROM public.notification_log
           WHERE user_id = u_client AND channel = 'push') = 1,
    'and one push envelope beside it';

  -- The release only claims rows whose hour has come.
  UPDATE public.notification_log
     SET deliver_after = now() + interval '4 hours'
   WHERE user_id = u_client AND channel = 'push';
  ASSERT public.release_due_client_pushes(50) = 0,
    'a row whose hour has not come is skipped';
  ASSERT (SELECT status FROM public.notification_log
           WHERE user_id = u_client AND channel = 'push')::text = 'queued',
    'and is left exactly as it was';

  UPDATE public.notification_log
     SET deliver_after = now() - interval '1 minute'
   WHERE user_id = u_client AND channel = 'push';
  ASSERT public.release_due_client_pushes(50) = 1,
    'a row whose hour has come is dispatched';
  ASSERT (SELECT status FROM public.notification_log
           WHERE user_id = u_client AND channel = 'push')::text = 'sending',
    'and is claimed, so a second pass cannot ring the same phone twice';
  ASSERT public.release_due_client_pushes(50) = 0,
    'the second pass finds nothing';

  -- ══ 5. The receipt is still silent (00569, regrafted) ════════════════════

  DELETE FROM public.notification_log WHERE user_id = u_client;
  PERFORM public.notify_client_attention(
    u_client, 'decision', d_one, 'Your answer is recorded.',
    'It releases the piece that was waiting on it.',
    jsonb_build_object('kind', 'decision_receipt'));

  ASSERT (SELECT count(*) FROM public.notification_log
           WHERE user_id = u_client AND channel = 'push') = 0,
    'a receipt writes no push envelope — no sound, no badge, no buzz';
  ASSERT (SELECT count(*) FROM public.notification_log
           WHERE user_id = u_client AND channel = 'in_app'
             AND opened_at IS NOT NULL) = 1,
    'the receipt is written already read, so it adds nothing to clear';

  -- ══ 6. The sweep's selection ═════════════════════════════════════════════

  DELETE FROM public.notification_log WHERE user_id = u_client;
  INSERT INTO public.notification_log
    (user_id, type, channel, status, template_id, metadata, sent_at)
  SELECT u_client, 'decision_required', 'email', 'sent', 'decision-required',
         jsonb_build_object('decisionId', row.decision_id::text, 'notice', 'first'),
         now()
    FROM sp_decisions AS row WHERE row.label = 'written';

  ASSERT public._decision_first_notice_sweep_cutoff()
         = '2026-09-05T00:00:00Z'::timestamptz,
    'the cutoff is the day 00568 landed — the back catalogue is never mailed';

  -- The sweep dispatches for exactly one of the six: the approval that was
  -- published, is still open, and never got a letter.
  v_count := public.sweep_decision_first_notices(50);
  ASSERT v_count = 1,
    'the sweep sees exactly one candidate among the six fixtures — got ' || v_count;
  ASSERT (SELECT count(*) FROM public.decision_first_notice_attempts) = 2,
    'and recorded its attempt beside the one already on file';
  ASSERT (SELECT count(*) FROM public.decision_first_notice_attempts
           WHERE decision_id = d_one) = 1,
    'the attempt it recorded is the fresh approval''s';
  ASSERT (SELECT last_attempt_at FROM public.decision_first_notice_attempts
           WHERE decision_id = d_one) > now() - interval '1 minute',
    'the cooldown starts from that attempt, because a skipped letter logs nothing';

  ASSERT public.sweep_decision_first_notices(50) = 0,
    'so a second pass a moment later dispatches nothing at all';

  -- Prove each exclusion is the one claimed, by lifting them one at a time.
  DELETE FROM public.decision_first_notice_attempts;
  ASSERT public.sweep_decision_first_notices(50) = 2,
    'lifting the cooldown lets the approval attempted eight minutes ago back in';

  DELETE FROM public.decision_first_notice_attempts;
  DELETE FROM public.notification_log WHERE user_id = u_client;
  ASSERT public.sweep_decision_first_notices(50) = 3,
    'and the approval already written to joins once its letter is gone';

  ASSERT (SELECT count(*) FROM public.decision_first_notice_attempts AS attempt
            JOIN sp_decisions AS row ON row.decision_id = attempt.decision_id
           WHERE row.label IN ('catalogue', 'lapsing', 'draft')) = 0,
    'the back catalogue, the lapsed approval and the unpublished draft are never swept';

  -- ══ 7. The studio hand-off ═══════════════════════════════════════════════

  DELETE FROM public.notification_log WHERE user_id = u_designer;
  PERFORM public.record_decision_studio_handoff(d_one);
  SELECT metadata->>'body' INTO v_text
    FROM public.notification_log
   WHERE user_id = u_designer AND type = 'decision_studio_handoff';
  ASSERT v_text = 'Patina has stopped reminding Anne Brenner; it is yours to chase.',
    'the hand-off says who, and whose it is now — got: ' || COALESCE(v_text, '<none>');
  ASSERT (SELECT channel FROM public.notification_log
           WHERE user_id = u_designer AND type = 'decision_studio_handoff')::text
         = 'in_app',
    'on the designer''s own inbox rail, never as mail';

  PERFORM public.record_decision_studio_handoff(d_one);
  ASSERT (SELECT count(*) FROM public.notification_log
           WHERE user_id = u_designer AND type = 'decision_studio_handoff') = 1,
    'a second call writes no second line — one silence, one notice';

  -- ══ 8. The why is signed with the display name (W2-n4) ═══════════════════

  -- End to end: the ask created through the rail above carries the studio's
  -- shown name under the sentence, not the first word of it (W2-n4).
  ASSERT (SELECT why_author_name FROM public.project_approval_artifacts
           WHERE decision_id = d_one) = 'Leah Kochaver',
    'the creating RPC freezes the composer''s DISPLAY name';
  ASSERT (SELECT why FROM public.project_approval_artifacts
           WHERE decision_id = d_one)
         = 'The pantry door swings into the hall now.',
    'and the sentence beside it is untouched';

  ASSERT public._why_author_display_name(u_designer) = 'Leah Kochaver',
    'the display name wins over the given name';
  ASSERT public._why_author_display_name(u_client) = 'Anne Brenner',
    'and the whole full_name stands in when there is no display name';
  ASSERT public._why_author_display_name(
           '00000000-0000-4000-8000-000000000000'::uuid) IS NULL,
    'an unknown author is dropped, never invented';

  -- The row as 00569 would have frozen it: the given name alone. Written
  -- through the same lever the backfill uses, because the table is immutable.
  ALTER TABLE public.project_approval_artifacts
    DISABLE TRIGGER a_guard_project_approval_artifact_edge_trg;
  UPDATE public.project_approval_artifacts
     SET why_author_name = 'Leah' WHERE decision_id = d_one;
  ALTER TABLE public.project_approval_artifacts
    ENABLE TRIGGER a_guard_project_approval_artifact_edge_trg;

  v_count := public.backfill_why_author_display_names();
  ASSERT v_count = 1, 'the backfill moves the row 00569 signed with a given name';
  ASSERT (SELECT why_author_name FROM public.project_approval_artifacts
           WHERE decision_id = d_one) = 'Leah Kochaver',
    'to the name the studio shows';
  ASSERT public.backfill_why_author_display_names() = 0,
    'and moves nothing on a second run';

  RAISE NOTICE 'she_sets_the_pace_test: all assertions passed';
END $$;

ROLLBACK;
