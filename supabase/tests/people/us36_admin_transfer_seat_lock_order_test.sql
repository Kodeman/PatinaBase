-- ═══════════════════════════════════════════════════════════════════════════
-- 00832 — Platform transfer seat/seat order (SQ-1147 F3 only, SQ-1400)
-- Native two-session dblink interleave, matching us36_transfer_seat_lock_order.
-- A reader holds the lower seat FOR SHARE; pg_blocking_pids proves the RPC
-- waits on it. The reader must still take the higher seat FOR SHARE NOWAIT.
-- The 00556 target-first body fails that assertion when the owner is lower.
-- Both orientations and a second co-owner run. F1 org/seat and F2 role/seat
-- are deliberately not exercised or repaired here.
-- Remote fixtures are committed, cleaned before/after; Part B rolls back.
-- Run: supabase test db supabase/tests/people/us36_admin_transfer_seat_lock_order_test.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(28);

DO $setup$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
BEGIN
  PERFORM extensions.dblink_connect('sq1400_setup', v_conninfo);
  PERFORM extensions.dblink_exec('sq1400_setup',
    'SET lock_timeout = ''5s''; SET statement_timeout = ''30s''');
  PERFORM extensions.dblink_exec('sq1400_setup', $clean$
    SET ROLE service_role;
    DELETE FROM public.organization_members
    WHERE organization_id IN ('14000000-0000-4000-8000-0000000000f1',
                              '14000000-0000-4000-8000-0000000000f2',
                              '14000000-0000-4000-8000-0000000000f3');
    RESET ROLE;
    DELETE FROM public.organizations
    WHERE id IN ('14000000-0000-4000-8000-0000000000f1',
                 '14000000-0000-4000-8000-0000000000f2',
                 '14000000-0000-4000-8000-0000000000f3');
    DELETE FROM public.profiles
    WHERE id IN ('14000000-0000-4000-8000-000000000001',
                 '14000000-0000-4000-8000-000000000002',
                 '14000000-0000-4000-8000-000000000003',
                 '14000000-0000-4000-8000-000000000009');
    DELETE FROM auth.users
    WHERE id IN ('14000000-0000-4000-8000-000000000001',
                 '14000000-0000-4000-8000-000000000002',
                 '14000000-0000-4000-8000-000000000003',
                 '14000000-0000-4000-8000-000000000009');
  $clean$);
  PERFORM extensions.dblink_exec('sq1400_setup', $fixture$
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, instance_id, aud, role)
    SELECT ('14000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           'sq1400-' || n || '@test.invalid', '', now(), now(), now(),
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
    FROM unnest(ARRAY[1,2,3,9]) AS n;
    INSERT INTO public.profiles (id, email, full_name)
    SELECT id, email, 'SQ1400 seat order' FROM auth.users
    WHERE email IN ('sq1400-1@test.invalid', 'sq1400-2@test.invalid',
                    'sq1400-3@test.invalid', 'sq1400-9@test.invalid')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT '14000000-0000-4000-8000-000000000009', id
    FROM public.roles WHERE name = 'support_agent';
    INSERT INTO public.organizations (id, type, name, slug) VALUES
      ('14000000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ1400 Lower Owns', 'sq1400-lower-owns'),
      ('14000000-0000-4000-8000-0000000000f2', 'design_studio', 'SQ1400 Higher Owns', 'sq1400-higher-owns'),
      ('14000000-0000-4000-8000-0000000000f3', 'design_studio', 'SQ1400 Co-owners', 'sq1400-co-owners');
    SET ROLE service_role;
    INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
      ('14000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
      ('14000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-0000000000f1', 'admin', 'active', now()),
      ('14000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-0000000000f2', 'owner', 'active', now()),
      ('14000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-0000000000f2', 'admin', 'active', now()),
      ('14000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-0000000000f3', 'owner', 'active', now()),
      ('14000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-0000000000f3', 'owner', 'active', now()),
      ('14000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-0000000000f3', 'admin', 'active', now());
    RESET ROLE;
  $fixture$);
END
$setup$;

-- One interleave: a platform admin transfers p_org to p_target.
-- p_owner selects the owner seat the reader holds (also tests a second co-owner).
CREATE FUNCTION pg_temp.sq1400_interleave(p_org uuid, p_owner uuid, p_target uuid)
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
  PERFORM extensions.dblink_connect('sq1400_reader', v_conninfo);
  PERFORM extensions.dblink_connect('sq1400_transfer', v_conninfo);
  PERFORM extensions.dblink_exec(
    'sq1400_reader',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'sq1400_transfer',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec('sq1400_transfer', 'SET ROLE service_role');
  PERFORM extensions.dblink_exec(
    'sq1400_transfer',
    format(
      'SET request.jwt.claims = %L',
      jsonb_build_object('sub', '14000000-0000-4000-8000-000000000009', 'role', 'service_role')::text
    )
  );
  SELECT remote.pid INTO v_reader_pid
  FROM extensions.dblink('sq1400_reader', 'SELECT pg_backend_pid()') AS remote(pid integer);
  SELECT remote.pid INTO v_transfer_pid
  FROM extensions.dblink('sq1400_transfer', 'SELECT pg_backend_pid()') AS remote(pid integer);

  -- The reader's first row.
  PERFORM extensions.dblink_exec('sq1400_reader', 'BEGIN');
  PERFORM 1
  FROM extensions.dblink('sq1400_reader', format(
    'SELECT 1 FROM public.organization_members
      WHERE organization_id = %L AND user_id = %L FOR SHARE',
    p_org, v_lower
  )) AS remote(one integer);

  PERFORM extensions.dblink_send_query('sq1400_transfer', format(
    'SELECT public.admin_transfer_studio_ownership(%L, %L, %L)::text',
    '14000000-0000-4000-8000-000000000009', p_org, p_target
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
  PERFORM 1
  FROM extensions.dblink('sq1400_reader', format(
    'SELECT 1 FROM public.organization_members
      WHERE organization_id = %L AND user_id = %L FOR SHARE NOWAIT',
    p_org, v_higher
  ), false) AS remote(one integer);
  reader_took_higher := extensions.dblink_error_message('sq1400_reader');
  PERFORM extensions.dblink_exec('sq1400_reader', 'ROLLBACK');

  PERFORM 1
  FROM extensions.dblink_get_result('sq1400_transfer', false) AS remote(result text);
  transfer_outcome := extensions.dblink_error_message('sq1400_transfer');

  SELECT remote.seats INTO seats
  FROM extensions.dblink('sq1400_setup', format(
    'SELECT string_agg(format(''%%s:%%s:%%s'', user_id, role, status), '','' ORDER BY user_id)
       FROM public.organization_members WHERE organization_id = %L',
    p_org
  )) AS remote(seats text);

  PERFORM extensions.dblink_disconnect('sq1400_transfer');
  PERFORM extensions.dblink_disconnect('sq1400_reader');
  RETURN NEXT;
END
$interleave$;

CREATE TEMP TABLE sq1400_observed (
  orientation text PRIMARY KEY,
  transfer_blocked boolean,
  reader_took_higher text,
  transfer_outcome text,
  seats text
);
INSERT INTO sq1400_observed
SELECT 'lower owns', observed.*
FROM pg_temp.sq1400_interleave(
  '14000000-0000-4000-8000-0000000000f1',
  '14000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000002'
) AS observed;
INSERT INTO sq1400_observed
SELECT 'higher owns', observed.*
FROM pg_temp.sq1400_interleave(
  '14000000-0000-4000-8000-0000000000f2',
  '14000000-0000-4000-8000-000000000002',
  '14000000-0000-4000-8000-000000000001'
) AS observed;

INSERT INTO sq1400_observed
SELECT 'second co-owner', observed.*
FROM pg_temp.sq1400_interleave(
  '14000000-0000-4000-8000-0000000000f3',
  '14000000-0000-4000-8000-000000000002',
  '14000000-0000-4000-8000-000000000003'
) AS observed;

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_exec('sq1400_setup', $clean$
    SET ROLE service_role;
    DELETE FROM public.organization_members
    WHERE organization_id IN ('14000000-0000-4000-8000-0000000000f1',
                              '14000000-0000-4000-8000-0000000000f2',
                              '14000000-0000-4000-8000-0000000000f3');
    RESET ROLE;
    DELETE FROM public.organizations
    WHERE id IN ('14000000-0000-4000-8000-0000000000f1',
                 '14000000-0000-4000-8000-0000000000f2',
                 '14000000-0000-4000-8000-0000000000f3');
    DELETE FROM public.profiles
    WHERE id IN ('14000000-0000-4000-8000-000000000001',
                 '14000000-0000-4000-8000-000000000002',
                 '14000000-0000-4000-8000-000000000003',
                 '14000000-0000-4000-8000-000000000009');
    DELETE FROM auth.users
    WHERE id IN ('14000000-0000-4000-8000-000000000001',
                 '14000000-0000-4000-8000-000000000002',
                 '14000000-0000-4000-8000-000000000003',
                 '14000000-0000-4000-8000-000000000009');
  $clean$);
  PERFORM extensions.dblink_disconnect('sq1400_setup');
END
$cleanup$;

SELECT ok(
  (SELECT transfer_blocked FROM sq1400_observed WHERE orientation = 'lower owns'),
  'F3, owner holds the lower user_id: the transfer waits on the seat the reader holds'
);
SELECT is(
  (SELECT reader_took_higher FROM sq1400_observed WHERE orientation = 'lower owns'),
  'OK',
  'F3, owner holds the lower user_id: while it waits, the transfer holds no lock on the target''s higher seat, so the reader takes it without waiting (no 40P01 cycle)'
);
SELECT is(
  (SELECT transfer_outcome FROM sq1400_observed WHERE orientation = 'lower owns'),
  'OK',
  'F3, owner holds the lower user_id: once the reader lets go, the transfer completes'
);
SELECT is(
  (SELECT seats FROM sq1400_observed WHERE orientation = 'lower owns'),
  '14000000-0000-4000-8000-000000000001:admin:active,14000000-0000-4000-8000-000000000002:owner:active',
  'F3, owner holds the lower user_id: the target is promoted and the owner demoted'
);
SELECT ok(
  (SELECT transfer_blocked FROM sq1400_observed WHERE orientation = 'higher owns'),
  'owner holds the higher user_id: the transfer waits on the seat the reader holds'
);
SELECT is(
  (SELECT reader_took_higher FROM sq1400_observed WHERE orientation = 'higher owns'),
  'OK',
  'owner holds the higher user_id: while it waits, the transfer holds no lock on the owner''s higher seat'
);
SELECT is(
  (SELECT transfer_outcome FROM sq1400_observed WHERE orientation = 'higher owns'),
  'OK',
  'owner holds the higher user_id: once the reader lets go, the transfer completes'
);
SELECT is(
  (SELECT seats FROM sq1400_observed WHERE orientation = 'higher owns'),
  '14000000-0000-4000-8000-000000000001:owner:active,14000000-0000-4000-8000-000000000002:admin:active',
  'owner holds the higher user_id: the target is promoted and the owner demoted'
);

SELECT ok(
  (SELECT transfer_blocked FROM sq1400_observed WHERE orientation = 'second co-owner'),
  'multiple owners: transfer waits on the second co-owner held by the reader'
);
SELECT is(
  (SELECT reader_took_higher FROM sq1400_observed WHERE orientation = 'second co-owner'),
  'OK',
  'multiple owners: all co-owners are ordered before the higher target, not just the first owner'
);
SELECT is(
  (SELECT transfer_outcome FROM sq1400_observed WHERE orientation = 'second co-owner'),
  'OK',
  'multiple owners: once the reader lets go, the transfer completes'
);
SELECT is(
  (SELECT seats FROM sq1400_observed WHERE orientation = 'second co-owner'),
  '14000000-0000-4000-8000-000000000001:admin:active,14000000-0000-4000-8000-000000000002:admin:active,14000000-0000-4000-8000-000000000003:owner:active',
  'multiple owners: the target is promoted and every prior owner demoted'
);

-- Part B: authorization, refusals, multi-owner repair and deferred role sync.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, instance_id, aud, role)
SELECT ('14000000-0000-4000-8000-0000000000b' || n)::uuid,
       'sq1400-b' || n || '@test.invalid', '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM unnest(ARRAY[1,2,3,4,9]) AS n;
INSERT INTO public.profiles (id, email, full_name)
SELECT id, email, 'SQ1400 refusals' FROM auth.users
WHERE email IN ('sq1400-b1@test.invalid', 'sq1400-b2@test.invalid',
                'sq1400-b3@test.invalid', 'sq1400-b4@test.invalid', 'sq1400-b9@test.invalid')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id)
SELECT '14000000-0000-4000-8000-0000000000b9', id
FROM public.roles WHERE name = 'support_agent';
INSERT INTO public.organizations (id, type, name, slug) VALUES
  ('14000000-0000-4000-8000-0000000000fb', 'design_studio', 'SQ1400 Refusals', 'sq1400-refusals');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('14000000-0000-4000-8000-0000000000b1', '14000000-0000-4000-8000-0000000000fb', 'owner', 'active', now()),
  ('14000000-0000-4000-8000-0000000000b2', '14000000-0000-4000-8000-0000000000fb', 'admin', 'active', now()),
  ('14000000-0000-4000-8000-0000000000b3', '14000000-0000-4000-8000-0000000000fb', 'guest', 'active', now()),
  ('14000000-0000-4000-8000-0000000000b4', '14000000-0000-4000-8000-0000000000fb', 'member', 'suspended', now());
-- Grant after seating, so provision_studio_on_designer cannot mint extra studios.
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id FROM public.profiles AS u CROSS JOIN public.roles AS r
WHERE u.id IN ('14000000-0000-4000-8000-0000000000b1',
               '14000000-0000-4000-8000-0000000000b2')
  AND r.name = 'studio_designer';
-- Start with the outgoing owner's grant, so demotion must revoke it too.
INSERT INTO public.user_roles (user_id, role_id)
SELECT '14000000-0000-4000-8000-0000000000b1', id
FROM public.roles WHERE name = 'studio_owner';

SELECT ok(
  has_function_privilege('service_role', 'public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role)', 'EXECUTE')
  AND (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
       FROM pg_proc WHERE oid = 'public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role)'::regprocedure),
  'service-only ACL and pinned SECURITY DEFINER search_path are unchanged'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'service_role_only', 'even a platform admin must use the service-role path'
);
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b1', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'actor_not_platform_admin', 'a studio owner is not a platform admin'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2', NULL)$$,
  'P0001', 'invalid_role', 'NULL demoted role is still refused'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2', 'owner')$$,
  'P0001', 'invalid_role', 'owner demoted role is still refused'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000ff', '14000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'studio_not_found', 'unknown studio is still refused'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b9')$$,
  'P0001', 'target_not_active_member', 'a target with no seat is still refused'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b3')$$,
  'P0001', 'target_not_active_member', 'a guest target is still refused'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b4')$$,
  'P0001', 'target_not_active_member', 'a suspended target is still refused'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b1')$$,
  'P0001', 'already_owner', 'a sole-owner target is still refused'
);
SELECT lives_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2', 'member')$$,
  'the platform admin promotes the target with a non-default demoted role'
);
SELECT is(
  (SELECT string_agg(role::text || ':' || status, ',' ORDER BY user_id)
   FROM public.organization_members WHERE organization_id = '14000000-0000-4000-8000-0000000000fb'),
  'member:active,owner:active,guest:active,member:suspended',
  'refusals wrote nothing; promotion demotes only active owners to the requested role'
);
SET CONSTRAINTS sync_studio_owner_role_from_seat IMMEDIATE;
SELECT ok(
  EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = '14000000-0000-4000-8000-0000000000b2' AND r.name = 'studio_owner')
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                  WHERE ur.user_id = '14000000-0000-4000-8000-0000000000b1' AND r.name = 'studio_owner'),
  'existing deferred role synchronization grants the target and revokes the former owner'
);
SET CONSTRAINTS sync_studio_owner_role_from_seat DEFERRED;
UPDATE public.organization_members SET role = 'owner'
WHERE organization_id = '14000000-0000-4000-8000-0000000000fb'
  AND user_id = '14000000-0000-4000-8000-0000000000b1';
SELECT lives_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2')$$,
  'an already-owner target still repairs a multi-owner studio'
);
SELECT is(
  (SELECT string_agg(role::text || ':' || status, ',' ORDER BY user_id)
   FROM public.organization_members WHERE organization_id = '14000000-0000-4000-8000-0000000000fb'),
  'admin:active,owner:active,guest:active,member:suspended',
  'repair keeps exactly the named owner and uses the default admin demotion'
);
SELECT throws_ok(
  $$SELECT public.admin_transfer_studio_ownership('14000000-0000-4000-8000-0000000000b9', '14000000-0000-4000-8000-0000000000fb', '14000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'already_owner', 'a repaired sole-owner studio still refuses a repeated transfer'
);
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
