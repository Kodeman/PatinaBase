-- ═══════════════════════════════════════════════════════════════════════════
-- 00800 — transfer_studio_ownership locks both seats in user_id order
--         (pgTAP, US-36, SQ-1086 F6, SQ-1087)
--
-- Seat readers (00563, set_document_client 00796, _k8_rate_row_refusal 00797)
-- share-lock the two seats they judge in ascending (user_id, id) order. Part A
-- is a true two-session interleave over dblink. A "reader" session holds the
-- LOWER seat FOR SHARE, the way those loops take it first. The owner's transfer
-- is started in a second session and must block on that seat while holding
-- nothing on the HIGHER seat. The reader then takes the higher seat FOR SHARE
-- NOWAIT, the second row of its loop. 55P03 there is the lock cycle SQ-1086 F6
-- names: on the 00484 body, an owner holding the lower user_id has already
-- promoted (and so locked) the target. Both orientations run: owner lower
-- (F6) and owner higher, so a lock order that is simply "caller first" fails
-- too. Part B checks that the refusals, their texts, the promote-then-demote
-- result and the grants are unchanged.
--
-- Run: supabase test db supabase/tests/people/us36_transfer_seat_lock_order_test.sql
-- Part A commits its fixtures through dblink (other sessions cannot see this
-- transaction) and deletes them again; its setup first removes any left by an
-- aborted run. Everything else is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(16);

-- ── Part A: two-session interleave ─────────────────────────────────────────
--   lower  10870000-0000-4000-8000-000000000001
--   higher 10870000-0000-4000-8000-000000000002
--   …0f1: lower owns, higher is admin (F6)   …0f2: higher owns, lower is admin
DO $setup$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
BEGIN
  PERFORM extensions.dblink_connect('sq1087_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'sq1087_setup',
    'SET lock_timeout = ''5s''; SET statement_timeout = ''30s'''
  );
  -- Only service_role may delete a studio's last owner seat (00484 guard).
  PERFORM extensions.dblink_exec('sq1087_setup', $clean$
    SET ROLE service_role;
    DELETE FROM public.organization_members
    WHERE organization_id IN ('10870000-0000-4000-8000-0000000000f1',
                              '10870000-0000-4000-8000-0000000000f2');
    RESET ROLE;
  $clean$);
  PERFORM extensions.dblink_exec('sq1087_setup', $fixture$
    DELETE FROM public.organizations
    WHERE id IN ('10870000-0000-4000-8000-0000000000f1',
                 '10870000-0000-4000-8000-0000000000f2');
    DELETE FROM public.profiles
    WHERE id IN ('10870000-0000-4000-8000-000000000001',
                 '10870000-0000-4000-8000-000000000002');
    DELETE FROM auth.users
    WHERE id IN ('10870000-0000-4000-8000-000000000001',
                 '10870000-0000-4000-8000-000000000002');

    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      instance_id, aud, role
    ) VALUES
      ('10870000-0000-4000-8000-000000000001', 'sq1087-lower@test.invalid', '',
       now(), now(), now(), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated'),
      ('10870000-0000-4000-8000-000000000002', 'sq1087-higher@test.invalid', '',
       now(), now(), now(), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated');
    INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
    VALUES
      ('10870000-0000-4000-8000-000000000001', 'sq1087-lower@test.invalid',
       'SQ1087 Lower', now(), now()),
      ('10870000-0000-4000-8000-000000000002', 'sq1087-higher@test.invalid',
       'SQ1087 Higher', now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (id, type, name, slug)
    VALUES
      ('10870000-0000-4000-8000-0000000000f1', 'design_studio',
       'SQ1087 Lower Owns', 'sq1087-lower-owns-test'),
      ('10870000-0000-4000-8000-0000000000f2', 'design_studio',
       'SQ1087 Higher Owns', 'sq1087-higher-owns-test');
    -- Each owner seat is its studio's first row (00484 bootstrap).
    INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
    VALUES
      ('10870000-0000-4000-8000-000000000001', '10870000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
      ('10870000-0000-4000-8000-000000000002', '10870000-0000-4000-8000-0000000000f2', 'owner', 'active', now());
    INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
    VALUES
      ('10870000-0000-4000-8000-000000000002', '10870000-0000-4000-8000-0000000000f1', 'admin', 'active', now()),
      ('10870000-0000-4000-8000-000000000001', '10870000-0000-4000-8000-0000000000f2', 'admin', 'active', now());
  $fixture$);
END
$setup$;

-- One interleave: p_owner (signed in) transfers p_org to p_target.
CREATE FUNCTION pg_temp.sq1087_interleave(p_org uuid, p_owner uuid, p_target uuid)
RETURNS TABLE (
  transfer_blocked boolean,
  reader_took_higher text,
  transfer_outcome text,
  seats text
)
LANGUAGE plpgsql
AS $interleave$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_lower uuid := LEAST(p_owner, p_target);
  v_higher uuid := GREATEST(p_owner, p_target);
  v_reader_pid integer;
  v_transfer_pid integer;
  v_deadline timestamptz;
BEGIN
  PERFORM extensions.dblink_connect('sq1087_reader', v_conninfo);
  PERFORM extensions.dblink_connect('sq1087_transfer', v_conninfo);
  PERFORM extensions.dblink_exec(
    'sq1087_reader',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'sq1087_transfer',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec('sq1087_transfer', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'sq1087_transfer',
    format(
      'SET request.jwt.claims = %L',
      jsonb_build_object('sub', p_owner, 'role', 'authenticated')::text
    )
  );
  SELECT remote.pid INTO v_reader_pid
  FROM extensions.dblink('sq1087_reader', 'SELECT pg_backend_pid()') AS remote(pid integer);
  SELECT remote.pid INTO v_transfer_pid
  FROM extensions.dblink('sq1087_transfer', 'SELECT pg_backend_pid()') AS remote(pid integer);

  -- The reader's first row.
  PERFORM extensions.dblink_exec('sq1087_reader', 'BEGIN');
  PERFORM extensions.dblink_exec('sq1087_reader', format(
    'SELECT 1 FROM public.organization_members
      WHERE organization_id = %L AND user_id = %L FOR SHARE',
    p_org, v_lower
  ));

  PERFORM extensions.dblink_send_query('sq1087_transfer', format(
    'SELECT public.transfer_studio_ownership(%L, %L)::text', p_org, p_target
  ));

  v_deadline := clock_timestamp() + interval '10 seconds';
  transfer_blocked := false;
  LOOP
    IF v_reader_pid = ANY(pg_blocking_pids(v_transfer_pid)) THEN
      transfer_blocked := true;
      EXIT;
    END IF;
    EXIT WHEN clock_timestamp() > v_deadline;
    PERFORM pg_sleep(0.02);
  END LOOP;

  -- The reader's second row, while the transfer waits on its first.
  IF extensions.dblink_exec('sq1087_reader', format(
       'SELECT 1 FROM public.organization_members
         WHERE organization_id = %L AND user_id = %L FOR SHARE NOWAIT',
       p_org, v_higher
     ), false) = 'ERROR' THEN
    reader_took_higher := extensions.dblink_error_message('sq1087_reader');
  ELSE
    reader_took_higher := 'OK';
  END IF;
  PERFORM extensions.dblink_exec('sq1087_reader', 'ROLLBACK');

  PERFORM 1
  FROM extensions.dblink_get_result('sq1087_transfer', false) AS remote(result text);
  transfer_outcome := extensions.dblink_error_message('sq1087_transfer');

  SELECT remote.seats INTO seats
  FROM extensions.dblink('sq1087_setup', format(
    'SELECT string_agg(format(''%%s:%%s:%%s'', user_id, role, status), '','' ORDER BY user_id)
       FROM public.organization_members WHERE organization_id = %L',
    p_org
  )) AS remote(seats text);

  PERFORM extensions.dblink_disconnect('sq1087_transfer');
  PERFORM extensions.dblink_disconnect('sq1087_reader');
  RETURN NEXT;
END
$interleave$;

CREATE TEMP TABLE sq1087_observed (
  orientation text PRIMARY KEY,
  transfer_blocked boolean,
  reader_took_higher text,
  transfer_outcome text,
  seats text
);
INSERT INTO sq1087_observed
SELECT 'lower owns', observed.*
FROM pg_temp.sq1087_interleave(
  '10870000-0000-4000-8000-0000000000f1',
  '10870000-0000-4000-8000-000000000001',
  '10870000-0000-4000-8000-000000000002'
) AS observed;
INSERT INTO sq1087_observed
SELECT 'higher owns', observed.*
FROM pg_temp.sq1087_interleave(
  '10870000-0000-4000-8000-0000000000f2',
  '10870000-0000-4000-8000-000000000002',
  '10870000-0000-4000-8000-000000000001'
) AS observed;

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_exec('sq1087_setup', $clean$
    SET ROLE service_role;
    DELETE FROM public.organization_members
    WHERE organization_id IN ('10870000-0000-4000-8000-0000000000f1',
                              '10870000-0000-4000-8000-0000000000f2');
    RESET ROLE;
  $clean$);
  PERFORM extensions.dblink_exec('sq1087_setup', $clean$
    DELETE FROM public.organizations
    WHERE id IN ('10870000-0000-4000-8000-0000000000f1',
                 '10870000-0000-4000-8000-0000000000f2');
    DELETE FROM public.profiles
    WHERE id IN ('10870000-0000-4000-8000-000000000001',
                 '10870000-0000-4000-8000-000000000002');
    DELETE FROM auth.users
    WHERE id IN ('10870000-0000-4000-8000-000000000001',
                 '10870000-0000-4000-8000-000000000002');
  $clean$);
  PERFORM extensions.dblink_disconnect('sq1087_setup');
END
$cleanup$;

SELECT ok(
  (SELECT transfer_blocked FROM sq1087_observed WHERE orientation = 'lower owns'),
  'F6, owner holds the lower user_id: the transfer waits on the seat the reader holds'
);
SELECT is(
  (SELECT reader_took_higher FROM sq1087_observed WHERE orientation = 'lower owns'),
  'OK',
  'F6, owner holds the lower user_id: while it waits, the transfer holds no lock on the target''s higher seat, so the reader takes it without waiting (no 40P01 cycle)'
);
SELECT is(
  (SELECT transfer_outcome FROM sq1087_observed WHERE orientation = 'lower owns'),
  'OK',
  'F6, owner holds the lower user_id: once the reader lets go, the transfer completes'
);
SELECT is(
  (SELECT seats FROM sq1087_observed WHERE orientation = 'lower owns'),
  '10870000-0000-4000-8000-000000000001:admin:active,10870000-0000-4000-8000-000000000002:owner:active',
  'F6, owner holds the lower user_id: the target is promoted and the owner demoted'
);
SELECT ok(
  (SELECT transfer_blocked FROM sq1087_observed WHERE orientation = 'higher owns'),
  'owner holds the higher user_id: the transfer waits on the seat the reader holds'
);
SELECT is(
  (SELECT reader_took_higher FROM sq1087_observed WHERE orientation = 'higher owns'),
  'OK',
  'owner holds the higher user_id: while it waits, the transfer holds no lock on the caller''s own higher seat'
);
SELECT is(
  (SELECT transfer_outcome FROM sq1087_observed WHERE orientation = 'higher owns'),
  'OK',
  'owner holds the higher user_id: once the reader lets go, the transfer completes'
);
SELECT is(
  (SELECT seats FROM sq1087_observed WHERE orientation = 'higher owns'),
  '10870000-0000-4000-8000-000000000001:owner:active,10870000-0000-4000-8000-000000000002:admin:active',
  'owner holds the higher user_id: the target is promoted and the owner demoted'
);

-- ── Part B: refusals, result and grants (rolled back) ──────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('10870000-0000-4000-8000-0000000000b1', 'sq1087-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('10870000-0000-4000-8000-0000000000b2', 'sq1087-admin@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('10870000-0000-4000-8000-0000000000b3', 'sq1087-suspended@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('10870000-0000-4000-8000-0000000000b4', 'sq1087-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('10870000-0000-4000-8000-0000000000b1', 'sq1087-owner@test.invalid', 'SQ1087 Owner', now(), now()),
  ('10870000-0000-4000-8000-0000000000b2', 'sq1087-admin@test.invalid', 'SQ1087 Admin', now(), now()),
  ('10870000-0000-4000-8000-0000000000b3', 'sq1087-suspended@test.invalid', 'SQ1087 Suspended', now(), now()),
  ('10870000-0000-4000-8000-0000000000b4', 'sq1087-outsider@test.invalid', 'SQ1087 Outsider', now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
VALUES ('10870000-0000-4000-8000-0000000000f3', 'design_studio', 'SQ1087 Refusals', 'sq1087-refusals-test');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('10870000-0000-4000-8000-0000000000b1', '10870000-0000-4000-8000-0000000000f3', 'owner', 'active', now());
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('10870000-0000-4000-8000-0000000000b2', '10870000-0000-4000-8000-0000000000f3', 'admin', 'active', now()),
  ('10870000-0000-4000-8000-0000000000b3', '10870000-0000-4000-8000-0000000000f3', 'member', 'suspended', now());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10870000-0000-4000-8000-0000000000b2","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.transfer_studio_ownership('10870000-0000-4000-8000-0000000000f3', '10870000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'not_owner',
  'an admin cannot transfer ownership: not_owner'
);

SET LOCAL request.jwt.claims = '{"sub":"10870000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.transfer_studio_ownership('10870000-0000-4000-8000-0000000000ff', '10870000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'not_owner',
  'an unknown studio: not_owner'
);
SELECT throws_ok(
  $$SELECT public.transfer_studio_ownership('10870000-0000-4000-8000-0000000000f3', '10870000-0000-4000-8000-0000000000b1')$$,
  'P0001', 'target_not_active_member',
  'the owner herself: target_not_active_member'
);
SELECT throws_ok(
  $$SELECT public.transfer_studio_ownership('10870000-0000-4000-8000-0000000000f3', '10870000-0000-4000-8000-0000000000b4')$$,
  'P0001', 'target_not_active_member',
  'someone with no seat: target_not_active_member'
);
SELECT throws_ok(
  $$SELECT public.transfer_studio_ownership('10870000-0000-4000-8000-0000000000f3', '10870000-0000-4000-8000-0000000000b3')$$,
  'P0001', 'target_not_active_member',
  'a suspended seat: target_not_active_member'
);
SELECT lives_ok(
  $$SELECT public.transfer_studio_ownership('10870000-0000-4000-8000-0000000000f3', '10870000-0000-4000-8000-0000000000b2')$$,
  'the owner transfers to her active admin'
);
RESET ROLE;

SELECT is(
  (SELECT string_agg(format('%s:%s:%s', user_id, role, status), ',' ORDER BY user_id)
   FROM public.organization_members
   WHERE organization_id = '10870000-0000-4000-8000-0000000000f3'),
  '10870000-0000-4000-8000-0000000000b1:admin:active,10870000-0000-4000-8000-0000000000b2:owner:active,10870000-0000-4000-8000-0000000000b3:member:suspended',
  'the refusals wrote nothing, and the transfer promoted the target and demoted the owner'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.transfer_studio_ownership(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.transfer_studio_ownership(uuid, uuid)', 'EXECUTE'),
  'grants unchanged: authenticated may execute, anon may not'
);

SELECT * FROM finish();
ROLLBACK;
