-- ═══════════════════════════════════════════════════════════════════════════
-- 00565 — the client page: notes, reading marks, and the restored client payload
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, pg_temp role-assumption helpers, DO blocks of
-- ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00564_client_signoff_approval.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/project_notes_test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Fixture: the seeded designer↔client pair every local reset carries
-- (designer@patina.dev a0000000-…-0004, client@patina.dev a0000000-…-0005,
-- project b0000000-…-00d1 "Aspen Loft Refresh"), plus seed/the-client-page.sql:
--   standing note c0000000-…-c001, retired note c0000000-…-c002, a reading mark
--   for the client at now() - 1 day, and one executed furnishings authorization
--   and one executed trade scope so the repaired selection payload has lines.
-- Third parties: studio_manager@patina.dev a0000000-…-0003 is an ACTIVE
-- non-guest co-member of the project designer's "Local Dev Studio", so it is a
-- studio writer. cf-phase1-alice cf100000-…-0001 owns a different organization
-- and is the second studio. manufacturer@patina.dev a0000000-…-0006 is neither,
-- holds no organization membership and no project, and the project carries no
-- project_parties rows, so he is the stranger. His id is FIXED by
-- seed/dev-accounts.sql — the demo households in designer-clients.sql get a
-- fresh random uuid on every reset, so a stranger picked from those would name a
-- profile that does not exist and every refusal below would pass vacuously.
--
-- Covers:
--   1. a studio co-member who is not the lead designer writes a note, and
--      cannot rewrite authorship, ownership or the send stamp afterwards
--   1c. a coordination party — a VENDOR with a login — reads zero notes
--   2. a second studio's member reads zero notes and cannot insert one
--   3. the client reads the standing note and cannot INSERT or UPDATE
--   4. a stranger reads zero notes
--   5. reading marks are owner-only: read, insert and update
--   6. mark_project_read returns NULL on the first call and the PREVIOUS
--      read_at on the second, and advances the row both times
--   7. the NEW get_client_project_threshold emits the client-facing keys for the
--      seeded project and never a trade cost / vendor / markup key
--      (get_client_project_selections is untouched by 00565 — iOS reads it)
--   8. the grants: authenticated only, anon nowhere
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── helpers ───────────────────────────────────────────────────────────────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_client uuid;
  v_designer uuid;
  v_standing text;
  v_retired text;
  v_marks integer;
BEGIN
  SELECT client_id, designer_id INTO v_client, v_designer
    FROM public.projects
   WHERE id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;

  ASSERT v_client = 'a0000000-0000-0000-0000-000000000005'::uuid,
    'FIXTURE: Aspen Loft Refresh must belong to client@patina.dev';
  ASSERT v_designer = 'a0000000-0000-0000-0000-000000000004'::uuid,
    'FIXTURE: Aspen Loft Refresh must be designer@patina.dev''s project';

  SELECT state INTO v_standing FROM public.project_notes
   WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
  ASSERT v_standing = 'standing',
    'FIXTURE: seed note c001 must be standing, got ' || COALESCE(v_standing, '<missing>');

  SELECT state INTO v_retired FROM public.project_notes
   WHERE id = 'c0000000-0000-0000-0000-00000000c002'::uuid;
  ASSERT v_retired = 'retired',
    'FIXTURE: seed note c002 must be retired, got ' || COALESCE(v_retired, '<missing>');

  SELECT count(*) INTO v_marks FROM public.project_reading_marks
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
     AND user_id    = 'a0000000-0000-0000-0000-000000000005'::uuid;
  ASSERT v_marks = 1, 'FIXTURE: the client must carry one seeded reading mark';

  -- The studio writer under test must be a co-member who is NOT the project's
  -- own designer, or assertion 1 proves nothing about the studio rule.
  ASSERT EXISTS (
    SELECT 1
      FROM public.organization_members me
      JOIN public.organization_members owner
        ON owner.organization_id = me.organization_id
      JOIN public.organizations org
        ON org.id = me.organization_id AND org.status = 'active'
     WHERE me.user_id = 'a0000000-0000-0000-0000-000000000003'::uuid
       AND me.status = 'active' AND me.role <> 'guest'
       AND owner.user_id = v_designer
       AND owner.status = 'active' AND owner.role <> 'guest'
  ), 'FIXTURE: studio_manager@patina.dev must share an active org with the designer';

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_parties
     WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
  ), 'FIXTURE: the project must carry no parties, or the stranger is not a stranger';

  -- The stranger must be a REAL profile with no relationship to the project.
  -- A refusal aimed at a uuid no profile carries proves nothing.
  ASSERT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = 'a0000000-0000-0000-0000-000000000006'::uuid
  ), 'FIXTURE: the stranger must be a real profile, or every refusal below is vacuous';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE user_id = 'a0000000-0000-0000-0000-000000000006'::uuid
  ), 'FIXTURE: the stranger must hold no organization membership';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects
     WHERE id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
       AND 'a0000000-0000-0000-0000-000000000006'::uuid
           IN (client_id, designer_id, lead_designer_id, created_by)
  ), 'FIXTURE: the stranger must have no part in the fixture project';
END $$;

-- ─── 1. a studio co-member who is not the lead designer writes a note ──────

SAVEPOINT s1;
DO $$
DECLARE
  v_id uuid;
  v_state text;
  v_visible integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);

  INSERT INTO public.project_notes (project_id, author_id, body, enclosures)
  VALUES (
    'b0000000-0000-0000-0000-0000000000d1'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'The dining chairs are on the bench in Dayton.',
    jsonb_build_array(jsonb_build_object(
      'kind', 'proposal', 'id', 'b0000000-0000-0000-0000-000000000002'
    ))
  )
  RETURNING id, state INTO v_id, v_state;

  ASSERT v_state = 'standing', 'a new note must stand, got ' || v_state;

  SELECT count(*) INTO v_visible FROM public.project_notes
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;
  ASSERT v_visible >= 3,
    'the studio must read its own note plus both seeded ones, saw ' || v_visible;

  -- The studio may retire, and only through the state/retired_at pair.
  UPDATE public.project_notes
     SET state = 'retired', retired_at = now()
   WHERE id = v_id;
  SELECT state INTO v_state FROM public.project_notes WHERE id = v_id;
  ASSERT v_state = 'retired', 'the studio could not retire its own note';

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s1;

-- author_id must be the caller: a studio member cannot write in a colleague's
-- name, which is the only thing the client's "who wrote this" line rests on.
SAVEPOINT s1b;
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);
  BEGIN
    INSERT INTO public.project_notes (project_id, author_id, body)
    VALUES (
      'b0000000-0000-0000-0000-0000000000d1'::uuid,
      'a0000000-0000-0000-0000-000000000004'::uuid,
      'Written in the lead designer''s name.'
    );
    ASSERT false, 'a studio member forged a colleague''s authorship';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'forged authorship must be refused by RLS, got ' || COALESCE(v_sqlstate, '<none>');
END $$;
ROLLBACK TO SAVEPOINT s1b;

-- The INSERT policy's authorship rule is only worth as much as the UPDATE that
-- follows it. author_id, project_id and sent_at carry no UPDATE privilege at all,
-- so a member cannot re-attribute a colleague's note, move it to another of the
-- studio's projects, or forward-date it out of the client's sight (her policy
-- reads sent_at <= now()). What a member MAY do is answer or retire it.
SAVEPOINT s1c;
DO $$
DECLARE
  v_sqlstate text;
  v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004'::uuid);

  BEGIN
    UPDATE public.project_notes
       SET author_id = 'a0000000-0000-0000-0000-000000000003'::uuid
     WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
    ASSERT false, 'a studio member re-attributed a colleague''s note';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'rewriting author_id must be refused by the column grant, got ' || COALESCE(v_sqlstate, '<none>');

  BEGIN
    UPDATE public.project_notes
       SET project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
     WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
    ASSERT false, 'a studio member moved a note to another project';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'rewriting project_id must be refused by the column grant, got ' || COALESCE(v_sqlstate, '<none>');

  BEGIN
    UPDATE public.project_notes
       SET sent_at = now() + interval '30 days'
     WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
    ASSERT false, 'a studio member forward-dated a note out of the client''s sight';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'rewriting sent_at must be refused by the column grant, got ' || COALESCE(v_sqlstate, '<none>');

  UPDATE public.project_notes
     SET state = 'retired', retired_at = now()
   WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'a studio member must still be able to retire a note';

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s1c;

-- ─── 1d. a coordination party is not the client ───────────────────────────
-- project_parties.party_kind admits 'vendor' and 'gc'. A note is what the studio
-- writes to its CLIENT, so the client predicate is projects.client_id alone and
-- a party with a login reads nothing here.

SAVEPOINT s1d;
DO $$
DECLARE
  v_rows integer;
  v_sqlstate text;
BEGIN
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name, profile_id, created_by)
  VALUES (
    'c0000000-0000-0000-0000-0000000000f1'::uuid,
    'b0000000-0000-0000-0000-0000000000d1'::uuid,
    'vendor', 'Corbin Finishes',
    'a0000000-0000-0000-0000-000000000006'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid
  );

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);

  SELECT count(*) INTO v_rows FROM public.project_notes
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;
  ASSERT v_rows = 0,
    'a vendor party read ' || v_rows || ' notes the studio wrote to its client';

  BEGIN
    PERFORM public.mark_project_read('b0000000-0000-0000-0000-0000000000d1'::uuid);
    ASSERT false, 'a vendor party stamped the client''s project as read';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'a vendor party must be refused by mark_project_read, got ' || COALESCE(v_sqlstate, '<none>');
END $$;
ROLLBACK TO SAVEPOINT s1d;

-- ─── 2. a second studio's member: zero rows, and no insert ────────────────

SAVEPOINT s2;
DO $$
DECLARE
  v_rows integer;
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001'::uuid);

  SELECT count(*) INTO v_rows FROM public.project_notes
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;
  ASSERT v_rows = 0, 'another studio read ' || v_rows || ' notes on a project it has no part in';

  BEGIN
    INSERT INTO public.project_notes (project_id, author_id, body)
    VALUES (
      'b0000000-0000-0000-0000-0000000000d1'::uuid,
      'cf100000-0000-4000-8000-000000000001'::uuid,
      'A stranger studio writing to someone else''s client.'
    );
    ASSERT false, 'another studio wrote a note on a project it has no part in';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;

  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'a foreign studio insert must be refused by RLS, got ' || COALESCE(v_sqlstate, '<none>');
END $$;
ROLLBACK TO SAVEPOINT s2;

-- ─── 3. the client reads, and only reads ──────────────────────────────────

SAVEPOINT s3;
DO $$
DECLARE
  v_body text;
  v_rows integer;
  v_sqlstate text;
  v_updated integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);

  SELECT body INTO v_body FROM public.project_notes
   WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
  ASSERT v_body IS NOT NULL, 'the client could not read the standing note on her own project';

  -- Retired notes are still hers to read: they are what "Previously" is made of.
  SELECT count(*) INTO v_rows FROM public.project_notes
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;
  ASSERT v_rows = 2, 'the client must read both seeded notes, saw ' || v_rows;

  BEGIN
    INSERT INTO public.project_notes (project_id, author_id, body)
    VALUES (
      'b0000000-0000-0000-0000-0000000000d1'::uuid,
      'a0000000-0000-0000-0000-000000000005'::uuid,
      'The client writing on the studio''s rail.'
    );
    ASSERT false, 'the client wrote a note';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'a client insert must be refused by RLS, got ' || COALESCE(v_sqlstate, '<none>');

  -- No client UPDATE policy exists, so the write finds no row rather than
  -- raising: the row count is the assertion.
  UPDATE public.project_notes
     SET body = 'answered'
   WHERE id = 'c0000000-0000-0000-0000-00000000c001'::uuid;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ASSERT v_updated = 0, 'the client updated a note';

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s3;

-- ─── 4. a stranger reads nothing ──────────────────────────────────────────

SAVEPOINT s4;
DO $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);
  SELECT count(*) INTO v_rows FROM public.project_notes
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0, 'a stranger read ' || v_rows || ' notes';
END $$;
ROLLBACK TO SAVEPOINT s4;

-- ─── 5. reading marks are owner-only ──────────────────────────────────────

SAVEPOINT s5;
DO $$
DECLARE
  v_rows integer;
  v_sqlstate text;
  v_updated integer;
BEGIN
  -- The client sees her own mark and nobody else's.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  SELECT count(*) INTO v_rows FROM public.project_reading_marks;
  ASSERT v_rows = 1, 'the client saw ' || v_rows || ' reading marks, expected only her own';

  INSERT INTO public.project_reading_marks (project_id, user_id, read_at)
  VALUES (
    'b0000000-0000-0000-0000-0000000000d1'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid,
    now()
  )
  ON CONFLICT (project_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at;

  BEGIN
    INSERT INTO public.project_reading_marks (project_id, user_id)
    VALUES (
      'b0000000-0000-0000-0000-0000000000d1'::uuid,
      'a0000000-0000-0000-0000-000000000004'::uuid
    );
    ASSERT false, 'the client stamped somebody else''s reading mark';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'a foreign reading-mark insert must be refused by RLS, got ' || COALESCE(v_sqlstate, '<none>');
  PERFORM pg_temp.reset_role();

  -- The designer sees none of the client's, and cannot move it.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004'::uuid);
  SELECT count(*) INTO v_rows FROM public.project_reading_marks;
  ASSERT v_rows = 0, 'the designer saw ' || v_rows || ' of the client''s reading marks';

  UPDATE public.project_reading_marks SET read_at = now()
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005'::uuid;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ASSERT v_updated = 0, 'the designer moved the client''s reading mark';
  PERFORM pg_temp.reset_role();

  -- Owning the row is not enough. mark_project_read refuses a non-party, and the
  -- table grant must not be a side door around it: an unrelated user stamping
  -- arbitrary real project ids is an existence oracle and unbounded row growth.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);
  BEGIN
    INSERT INTO public.project_reading_marks (project_id, user_id)
    VALUES (
      'b0000000-0000-0000-0000-0000000000d1'::uuid,
      'a0000000-0000-0000-0000-000000000006'::uuid
    );
    ASSERT false, 'an unrelated user stamped a reading mark on somebody else''s project';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'an unrelated reading-mark insert must be refused by RLS, got ' || COALESCE(v_sqlstate, '<none>');
END $$;
ROLLBACK TO SAVEPOINT s5;

-- ─── 6. mark_project_read hands back the PREVIOUS timestamp ───────────────

SAVEPOINT s6;
DO $$
DECLARE
  v_first timestamptz;
  v_second timestamptz;
  v_third timestamptz;
  v_before timestamptz;
  v_now timestamptz;
  v_sqlstate text;
BEGIN
  -- A studio member who has never opened the page: the first call is NULL.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);
  v_first := public.mark_project_read('b0000000-0000-0000-0000-0000000000d1'::uuid);
  ASSERT v_first IS NULL,
    'the first mark must report no previous reading, got ' || v_first::text;

  SELECT read_at INTO v_now FROM public.project_reading_marks
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
     AND user_id = 'a0000000-0000-0000-0000-000000000003'::uuid;
  ASSERT v_now IS NOT NULL, 'the first mark did not stamp a row';

  v_second := public.mark_project_read('b0000000-0000-0000-0000-0000000000d1'::uuid);
  ASSERT v_second = v_now,
    'the second mark must report the first one''s stamp, got ' || v_second::text;
  PERFORM pg_temp.reset_role();

  -- A client who already carries a mark is handed exactly the stamp that was
  -- standing, whatever it was. Asserting a literal age here would make this file
  -- order-dependent: any earlier committed visit would move the seeded value and
  -- fail a run that proves nothing about the contract.
  SELECT read_at INTO v_before FROM public.project_reading_marks
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
     AND user_id = 'a0000000-0000-0000-0000-000000000005'::uuid;
  ASSERT v_before IS NOT NULL, 'FIXTURE: the client must carry a seeded mark';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  v_third := public.mark_project_read('b0000000-0000-0000-0000-0000000000d1'::uuid);
  ASSERT v_third = v_before,
    'the client must be handed the stamp that was standing (' || v_before::text
      || '), got ' || COALESCE(v_third::text, '<null>');
  SELECT read_at INTO v_now FROM public.project_reading_marks
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
     AND user_id = 'a0000000-0000-0000-0000-000000000005'::uuid;
  ASSERT v_now >= v_third, 'the client''s mark did not advance';
  PERFORM pg_temp.reset_role();

  -- A stranger is refused rather than silently stamped.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);
  BEGIN
    PERFORM public.mark_project_read('b0000000-0000-0000-0000-0000000000d1'::uuid);
    ASSERT false, 'a stranger marked somebody else''s project read';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'a stranger must be refused with insufficient_privilege, got ' || COALESCE(v_sqlstate, '<none>');
END $$;
ROLLBACK TO SAVEPOINT s6;

-- ─── 7. the client payload the new reader carries ─────────────────────────

SAVEPOINT s7;
DO $$
DECLARE
  v_payload jsonb;
  v_keys text[];
  v_required text[] := ARRAY[
    'id', 'kind', 'name', 'roomId', 'roomName', 'quantity',
    'clientLineTotalCents', 'itemType', 'logisticsStatus', 'instrument', 'updatedAt'
  ];
  v_stamp timestamptz;
  v_key text;
  v_kinds text[];
  v_leak text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  v_payload := public.get_client_project_threshold(
    'b0000000-0000-0000-0000-0000000000d1'::uuid
  );
  PERFORM pg_temp.reset_role();

  ASSERT v_payload->>'origin' = 'commercial',
    'origin must resolve commercial for the seeded project, got '
      || COALESCE(v_payload->>'origin', '<missing>');

  ASSERT jsonb_array_length(v_payload->'selections') >= 2,
    'the seeded project must carry a furnishings line and a trade line, got '
      || jsonb_array_length(v_payload->'selections');

  -- Every key the client page reads must be on the furnishings line.
  SELECT array_agg(k) INTO v_keys
    FROM jsonb_object_keys((v_payload->'selections')->0) AS k;
  FOREACH v_key IN ARRAY v_required LOOP
    ASSERT v_key = ANY(v_keys),
      'the repaired payload dropped ' || v_key || '; it emits ' || array_to_string(v_keys, ', ');
  END LOOP;

  ASSERT 'clientUnitPriceCents' = ANY(v_keys) OR 'allowance' = ANY(v_keys),
    'a furnishings line must carry the client''s own price';

  -- updatedAt is GREATEST(item.updated_at, item.last_status_change_at,
  -- doc.executed_at). Every line on both branches joins an executed instrument,
  -- so it is never null here, and it must parse as a timestamp — the page reads
  -- it to say what has moved since the client last looked. It is a TIME: the
  -- money/vendor rule below covers it like every other key.
  FOR v_key IN
    SELECT line->>'updatedAt'
      FROM jsonb_array_elements(v_payload->'selections') AS line
  LOOP
    ASSERT v_key IS NOT NULL,
      'every selection must carry updatedAt';
    BEGIN
      v_stamp := v_key::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      ASSERT false, 'updatedAt must be an ISO timestamp, got ' || v_key;
    END;
    ASSERT v_stamp <= now(),
      'updatedAt must not be in the future, got ' || v_key;
  END LOOP;

  -- Both branches are present, and the trade one carries its journey.
  SELECT array_agg(DISTINCT s->>'kind') INTO v_kinds
    FROM jsonb_array_elements(v_payload->'selections') AS s;
  ASSERT 'furnishings' = ANY(v_kinds) AND 'trade' = ANY(v_kinds),
    'both selection kinds must appear, got ' || array_to_string(v_kinds, ', ');

  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payload->'selections') AS s
     WHERE s->>'kind' = 'trade' AND s->>'tradeJourney' IS NOT NULL
  ), 'a trade line must carry tradeJourney';

  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payload->'selections') AS s
     WHERE s->'instrument'->>'proposalId' IS NOT NULL
       AND s->'instrument'->>'documentId' IS NOT NULL
  ), 'a line must name the instrument it stands under';

  -- The rule the whole repair is bounded by: never the studio's side of the
  -- money. Checked over every key at every depth of every line.
  SELECT string_agg(DISTINCT k, ', ') INTO v_leak
    FROM jsonb_array_elements(v_payload->'selections') AS s
    CROSS JOIN LATERAL (
      SELECT jsonb_object_keys(s) AS k
      UNION ALL
      SELECT jsonb_object_keys(s->'instrument')
       WHERE jsonb_typeof(s->'instrument') = 'object'
      UNION ALL
      SELECT jsonb_object_keys(s->'allowance')
       WHERE jsonb_typeof(s->'allowance') = 'object'
    ) AS keys
   WHERE k ~* '(trade_price|tradeprice|vendor|cost|markup|margin)';
  ASSERT v_leak IS NULL,
    'the client payload leaks the studio''s side of the money: ' || v_leak;
END $$;
ROLLBACK TO SAVEPOINT s7;

-- A stranger cannot call it at all.
SAVEPOINT s7b;
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);
  BEGIN
    PERFORM public.get_client_project_threshold(
      'b0000000-0000-0000-0000-0000000000d1'::uuid
    );
    ASSERT false, 'a stranger read another household''s selections';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'a stranger must be refused with insufficient_privilege, got ' || COALESCE(v_sqlstate, '<none>');
END $$;
ROLLBACK TO SAVEPOINT s7b;

-- ─── 8. the grants ────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.mark_project_read(uuid)', 'EXECUTE'),
    'authenticated must be able to call mark_project_read';
  ASSERT NOT has_function_privilege('anon', 'public.mark_project_read(uuid)', 'EXECUTE'),
    'anon must never call mark_project_read';
  ASSERT has_function_privilege('authenticated', 'public.get_client_project_threshold(uuid)', 'EXECUTE'),
    'authenticated must be able to call get_client_project_selections';
  ASSERT NOT has_function_privilege('anon', 'public.get_client_project_threshold(uuid)', 'EXECUTE'),
    'anon must never call get_client_project_selections';

  ASSERT has_table_privilege('authenticated', 'public.project_notes', 'SELECT, INSERT'),
    'authenticated must be able to read and write project_notes through RLS';
  ASSERT NOT has_table_privilege('authenticated', 'public.project_notes', 'DELETE'),
    'nothing deletes a note; it is retired';
  -- UPDATE is column-level, so the table-level privilege is deliberately absent.
  ASSERT NOT has_table_privilege('authenticated', 'public.project_notes', 'UPDATE'),
    'a table-wide UPDATE grant would undo the INSERT policy''s authorship rule';
  ASSERT has_column_privilege('authenticated', 'public.project_notes', 'body', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.project_notes', 'enclosures', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.project_notes', 'state', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.project_notes', 'answered_at', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.project_notes', 'retired_at', 'UPDATE'),
    'a studio must be able to answer, edit and retire a note';
  ASSERT NOT has_column_privilege('authenticated', 'public.project_notes', 'author_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.project_notes', 'project_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.project_notes', 'sent_at', 'UPDATE'),
    'authorship, ownership and the send stamp are not the studio''s to rewrite';
  ASSERT NOT has_table_privilege('anon', 'public.project_notes', 'SELECT'),
    'anon must never read project_notes';
  ASSERT NOT has_table_privilege('anon', 'public.project_reading_marks', 'SELECT'),
    'anon must never read project_reading_marks';

  ASSERT NOT has_function_privilege('anon', 'app_private.is_project_studio_member(uuid)', 'EXECUTE'),
    'anon must never reach the policy predicates';
  ASSERT has_function_privilege('authenticated', 'app_private.is_project_studio_member(uuid)', 'EXECUTE'),
    'authenticated needs EXECUTE on a predicate PostgreSQL evaluates inside a policy';
  ASSERT has_function_privilege('authenticated', 'app_private.is_project_client(uuid)', 'EXECUTE'),
    'authenticated needs EXECUTE on a predicate PostgreSQL evaluates inside a policy';

  ASSERT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public' AND tablename = 'project_notes'
  ), 'project_notes must be published to realtime, or a sent note never arrives';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'project_rooms'
       AND indexname = 'idx_project_rooms_project_sort'
  ), 'the plan key reads rooms in (project_id, sort_order)';
END $$;

ROLLBACK;
