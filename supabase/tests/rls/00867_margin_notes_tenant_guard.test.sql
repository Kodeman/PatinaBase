-- ═══════════════════════════════════════════════════════════════════════════
-- 00867 — margin_notes tenant-first guard: the actor matrix (SQ-1846 F1/F2)
--
-- Plain psql script (supabase/tests/** is not pgTAP): BEGIN, fixtures,
-- probes, ROLLBACK, under ON_ERROR_STOP=1. Nothing survives the run.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls/00867_margin_notes_tenant_guard.test.sql
--
-- HOW IT PROVES BOTH DIRECTIONS IN ONE RUN
--   1. The guard is DROPPED inside this transaction, so the table is back on
--      its pre-00867 policies (00196 designer_all, 00316 studio_read, 00584
--      insert/update/delete), whether or not the DB already carries 00867.
--   2. Fixture rows, legacy studio-less rows included, are seeded as postgres
--      and snapshotted.
--   3. Every case runs as an authenticated actor (never an RLS-exempt role)
--      against the PRE-00867 policies; the outcome is recorded.
--   4. The migration file itself is applied (\ir), exactly as shipped.
--   5. Every case runs again. POST must equal the expectation. A `closes`
--      case must have differed from it before the migration (the negative
--      assertion fails on the old policies); a `keeps` case must not have.
--   Each probe runs in a subtransaction that is rolled back, so no probe can
--   feed another. The privileged readback at the end runs the forbidden
--   writes for real and compares every fixture row with the snapshot.
--
-- ACTORS: D designer seated in studios A and B · A1 only A · B1 only B ·
--   U outsider (own studio C) · CL the client (with a client team seat) ·
--   AG guest / AS suspended / AR removed seats in A · BT a member of B only
--   holding a team seat on A's job (a wrong-studio team seat).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';

-- ─── 1 · pre-00867 state ────────────────────────────────────────────────────
DROP POLICY IF EXISTS margin_notes_tenant_guard ON public.margin_notes;

CREATE TEMP TABLE m867_pre_policy AS
SELECT polname, polcmd, polpermissive, polroles,
       pg_get_expr(polqual, polrelid)      AS qual,
       pg_get_expr(polwithcheck, polrelid) AS with_check
  FROM pg_policy
 WHERE polrelid = 'public.margin_notes'::regclass;

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM m867_pre_policy) = 5
     AND (SELECT bool_and(polpermissive) FROM m867_pre_policy),
    'PRE: margin_notes must carry exactly the five permissive pre-00867 policies';
  ASSERT (SELECT array_agg(polname::text ORDER BY polname) FROM m867_pre_policy)
       = ARRAY['margin_notes_designer_all', 'margin_notes_studio_delete',
               'margin_notes_studio_insert', 'margin_notes_studio_read',
               'margin_notes_studio_update'],
    'PRE: unexpected pre-00867 policy set';
END $$;

-- ─── 2 · ids ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE m867_id (label text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO m867_id (label, id)
SELECT label, ('86700000-0000-4000-8000-' || suffix)::uuid
  FROM (VALUES
    ('D',   '000000000d01'), ('A1',  '000000000a01'), ('B1',  '000000000b01'),
    ('U',   '000000000c01'), ('CL',  '000000000e01'), ('AG',  '000000000a02'),
    ('AS',  '000000000a03'), ('AR',  '000000000a04'), ('BT',  '000000000b02'),
    ('SA',  '00000000f0a0'), ('SB',  '00000000f0b0'), ('SC',  '00000000f0c0'),
    ('PA',  '0000000010a0'), ('PB',  '0000000010b0'), ('P0',  '000000001000'),
    ('PU',  '0000000010c0'),
    ('QA',  '0000000020a0'), ('QB',  '0000000020b0'), ('Q0',  '000000002000'),
    ('HA',  '0000000030a0'), ('RA',  '0000000040a0'), ('R0',  '000000004000'),
    ('FC',  '000000005000'), ('SCR', '000000006000'),
    ('N1',  '000000007001'), ('N2',  '000000007002'), ('N3',  '000000007003'),
    ('N4',  '000000007004'), ('N5',  '000000007005'), ('N6',  '000000007006'),
    ('N7',  '000000007007'), ('N8',  '000000007008'), ('N9',  '000000007009'),
    ('N10', '000000007010'), ('N11', '000000007011'), ('N12', '000000007012'),
    ('N13', '000000007013')
  ) AS v(label, suffix);
GRANT SELECT ON m867_id TO PUBLIC;

-- {LABEL} → '<uuid>'::uuid
CREATE FUNCTION pg_temp.sql_of(p_template text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record; v_sql text := p_template;
BEGIN
  IF v_sql IS NULL THEN RETURN NULL; END IF;
  FOR r IN SELECT label, id FROM m867_id LOOP
    v_sql := replace(v_sql, '{' || r.label || '}', quote_literal(r.id::text) || '::uuid');
  END LOOP;
  ASSERT v_sql !~ '\{[A-Z0-9]+\}', 'unresolved label in ' || v_sql;
  RETURN v_sql;
END $$;

CREATE FUNCTION pg_temp.id(p_label text) RETURNS uuid
LANGUAGE sql AS $$ SELECT id FROM m867_id WHERE label = p_label $$;

-- ─── 3 · probes ─────────────────────────────────────────────────────────────
-- pg_temp.probe runs p_setup as postgres, then p_sql as the authenticated
-- actor, then raises to roll the whole subtransaction back (state, role and
-- JWT claims alike). Outcome: the SELECT's text value, 'rows=N', or 'denied'
-- (42501, a row-level-security refusal).
CREATE FUNCTION pg_temp.probe(p_actor uuid, p_sql text, p_setup text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_out text; v_rows bigint;
BEGIN
  BEGIN
    IF p_setup IS NOT NULL THEN EXECUTE p_setup; END IF;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF p_sql ~* '^\s*select' THEN
      EXECUTE p_sql INTO v_out;
      v_out := COALESCE(v_out, 'null');
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_out := 'rows=' || v_rows;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'U0867', MESSAGE = 'probe rollback';
  EXCEPTION
    WHEN SQLSTATE 'U0867' THEN RETURN v_out;
    WHEN insufficient_privilege THEN RETURN 'denied';
    WHEN OTHERS THEN RETURN 'error ' || SQLSTATE || ': ' || SQLERRM;
  END;
END $$;

-- pg_temp.act is the same call WITHOUT the rollback, for the readback.
CREATE FUNCTION pg_temp.act(p_actor uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_rows bigint; v_out text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_out := 'rows=' || v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN v_out := 'denied';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN v_out;
END $$;

-- ─── 4 · fixtures (as postgres, RLS-exempt) ────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, instance_id, aud, role)
SELECT id, label || '-867@test.invalid', '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  FROM m867_id WHERE label IN ('D','A1','B1','U','CL','AG','AS','AR','BT');

INSERT INTO public.profiles (id, email, full_name)
SELECT id, label || '-867@test.invalid', '867 ' || label
  FROM m867_id WHERE label IN ('D','A1','B1','U','CL','AG','AS','AR','BT')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug)
VALUES (pg_temp.id('SA'), 'design_studio', '867 Studio A', 'sq1847-867-studio-a'),
       (pg_temp.id('SB'), 'design_studio', '867 Studio B', 'sq1847-867-studio-b'),
       (pg_temp.id('SC'), 'design_studio', '867 Studio C', 'sq1847-867-studio-c');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES (pg_temp.id('D'),  pg_temp.id('SA'), 'owner',  'active',    now()),
       (pg_temp.id('A1'), pg_temp.id('SA'), 'member', 'active',    now()),
       (pg_temp.id('AG'), pg_temp.id('SA'), 'guest',  'active',    now()),
       (pg_temp.id('AS'), pg_temp.id('SA'), 'member', 'suspended', now()),
       (pg_temp.id('AR'), pg_temp.id('SA'), 'member', 'removed',   now()),
       (pg_temp.id('B1'), pg_temp.id('SB'), 'owner',  'active',    now()),
       (pg_temp.id('D'),  pg_temp.id('SB'), 'member', 'active',    now()),
       (pg_temp.id('BT'), pg_temp.id('SB'), 'member', 'active',    now()),
       (pg_temp.id('U'),  pg_temp.id('SC'), 'owner',  'active',    now());

INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id)
VALUES (pg_temp.id('PA'), '867 A job', pg_temp.id('D'), pg_temp.id('D'), pg_temp.id('CL'), pg_temp.id('SA')),
       (pg_temp.id('PB'), '867 B job', pg_temp.id('D'), pg_temp.id('D'), NULL, pg_temp.id('SB')),
       (pg_temp.id('P0'), '867 legacy job', pg_temp.id('D'), pg_temp.id('D'), NULL, NULL),
       (pg_temp.id('PU'), '867 stranger job', pg_temp.id('U'), pg_temp.id('U'), NULL, NULL);
-- The insert triggers may derive a studio; the record must say exactly this.
UPDATE public.projects SET studio_id = pg_temp.id('SA') WHERE id = pg_temp.id('PA');
UPDATE public.projects SET studio_id = pg_temp.id('SB') WHERE id = pg_temp.id('PB');
UPDATE public.projects SET studio_id = NULL WHERE id IN (pg_temp.id('P0'), pg_temp.id('PU'));

INSERT INTO public.project_team_members (project_id, user_id, role)
VALUES (pg_temp.id('PA'), pg_temp.id('BT'), 'support_designer'),
       (pg_temp.id('PA'), pg_temp.id('CL'), 'client');

INSERT INTO public.proposals (id, designer_id, title, status)
VALUES (pg_temp.id('QA'), pg_temp.id('D'), '867 A proposal', 'draft'),
       (pg_temp.id('QB'), pg_temp.id('D'), '867 B proposal', 'draft'),
       (pg_temp.id('Q0'), pg_temp.id('D'), '867 legacy proposal', 'draft');
UPDATE public.proposals SET studio_id = pg_temp.id('SA') WHERE id = pg_temp.id('QA');
UPDATE public.proposals SET studio_id = pg_temp.id('SB') WHERE id = pg_temp.id('QB');
UPDATE public.proposals SET studio_id = NULL WHERE id = pg_temp.id('Q0');

INSERT INTO public.client_households (id, organization_id, designer_id, display_name)
VALUES (pg_temp.id('HA'), pg_temp.id('SA'), pg_temp.id('D'), '867 A household');
INSERT INTO public.designer_clients (id, designer_id, client_id, household_id, status)
VALUES (pg_temp.id('RA'), pg_temp.id('D'), pg_temp.id('CL'), pg_temp.id('HA'), 'active'),
       (pg_temp.id('R0'), pg_temp.id('D'), NULL, NULL, 'lead');

INSERT INTO public.field_captures (id, client_capture_id, designer_id, title)
VALUES (pg_temp.id('FC'), gen_random_uuid(), pg_temp.id('D'), '867 legacy capture');
INSERT INTO public.scope_change_requests (id, project_id, requested_by, title, description)
VALUES (pg_temp.id('SCR'), pg_temp.id('P0'), pg_temp.id('D'), '867 scope change', 'escalated from a legacy note');

-- Notes. N6–N8 and N13 are the legacy studio-less rows; N6 carries every
-- column the readback must preserve (anchor, due, escalation, field capture).
INSERT INTO public.margin_notes
  (id, project_id, proposal_id, designer_client_id, designer_id, body,
   anchor_kind, anchor_id, due_date, escalated_to_scope_change_id, field_capture_id)
VALUES
  (pg_temp.id('N1'),  pg_temp.id('PA'), NULL, NULL, pg_temp.id('D'),  'N1 D on A job', 'line', pg_temp.id('FC'), '2026-11-02 17:00+00', NULL, NULL),
  (pg_temp.id('N2'),  pg_temp.id('PA'), NULL, NULL, pg_temp.id('A1'), 'N2 A1 on A job', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N3'),  pg_temp.id('PB'), NULL, NULL, pg_temp.id('D'),  'N3 D on B job', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N4'),  NULL, pg_temp.id('QA'), NULL, pg_temp.id('D'),  'N4 proposal-only A', 'section', NULL, NULL, NULL, NULL),
  (pg_temp.id('N5'),  NULL, NULL, pg_temp.id('RA'), pg_temp.id('D'),  'N5 discovery-only A household', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N6'),  pg_temp.id('P0'), NULL, NULL, pg_temp.id('D'),  'N6 legacy job note, spoken on site', 'section', pg_temp.id('SCR'), '2026-11-09 17:00+00', pg_temp.id('SCR'), pg_temp.id('FC')),
  (pg_temp.id('N7'),  NULL, pg_temp.id('Q0'), NULL, pg_temp.id('D'),  'N7 legacy proposal note', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N8'),  NULL, NULL, pg_temp.id('R0'), pg_temp.id('D'),  'N8 legacy discovery note', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N9'),  pg_temp.id('PA'), pg_temp.id('QA'), NULL, pg_temp.id('D'),  'N9 A job + A proposal', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N10'), pg_temp.id('PA'), pg_temp.id('QB'), NULL, pg_temp.id('D'),  'N10 A job + B proposal', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N11'), pg_temp.id('PA'), pg_temp.id('Q0'), NULL, pg_temp.id('A1'), 'N11 A job + unstamped proposal', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N12'), pg_temp.id('PU'), pg_temp.id('QA'), NULL, pg_temp.id('A1'), 'N12 stranger job masked by A proposal', 'letterhead', NULL, NULL, NULL, NULL),
  (pg_temp.id('N13'), pg_temp.id('P0'), NULL, NULL, pg_temp.id('A1'), 'N13 coauthored legacy note', 'letterhead', NULL, NULL, NULL, NULL);

DO $$
BEGIN
  ASSERT (SELECT studio_id FROM public.projects WHERE id = pg_temp.id('PA')) = pg_temp.id('SA')
     AND (SELECT studio_id FROM public.projects WHERE id = pg_temp.id('PB')) = pg_temp.id('SB')
     AND (SELECT studio_id IS NULL FROM public.projects WHERE id = pg_temp.id('P0'))
     AND (SELECT studio_id IS NULL FROM public.projects WHERE id = pg_temp.id('PU')),
    'FIXTURE: job tenancy is not as recorded';
  ASSERT (SELECT studio_id FROM public.proposals WHERE id = pg_temp.id('QA')) = pg_temp.id('SA')
     AND (SELECT studio_id FROM public.proposals WHERE id = pg_temp.id('QB')) = pg_temp.id('SB')
     AND (SELECT studio_id IS NULL FROM public.proposals WHERE id = pg_temp.id('Q0')),
    'FIXTURE: proposal tenancy is not as recorded';
  -- The F1 premise: the shared helper admits B1 (and A1) to D's rows.
  ASSERT pg_temp.probe(pg_temp.id('B1'),
           format('SELECT public.is_studio_comember(%L::uuid)::text', pg_temp.id('D')), NULL) = 'true'
     AND pg_temp.probe(pg_temp.id('A1'),
           format('SELECT public.is_studio_comember(%L::uuid)::text', pg_temp.id('D')), NULL) = 'true',
    'FIXTURE: D must be a co-member of both A1 and B1 or F1 is not exercised';
  ASSERT pg_temp.probe(pg_temp.id('U'),
           format('SELECT public.is_studio_comember(%L::uuid)::text', pg_temp.id('D')), NULL) = 'false',
    'FIXTURE: U must share no studio with D';
END $$;

CREATE TEMP TABLE m867_snapshot AS
SELECT * FROM public.margin_notes
 WHERE id IN (SELECT id FROM m867_id WHERE label LIKE 'N%');

-- ─── 5 · cases ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE m867_case (
  name   text PRIMARY KEY,
  actor  text NOT NULL,
  setup  text,
  probe  text NOT NULL,
  expect text NOT NULL,
  kind   text NOT NULL CHECK (kind IN ('closes', 'keeps')),
  pre    text,
  post   text
);

-- Templates. {X} resolves to the fixture uuid.
CREATE FUNCTION pg_temp.sel(p_note text) RETURNS text LANGUAGE sql AS $$
  SELECT 'SELECT count(*)::text FROM public.margin_notes WHERE id = {' || p_note || '}' $$;
CREATE FUNCTION pg_temp.upd(p_note text, p_set text DEFAULT 'body = body || '' (edited)''')
RETURNS text LANGUAGE sql AS $$
  SELECT 'UPDATE public.margin_notes SET ' || p_set || ' WHERE id = {' || p_note || '}' $$;
CREATE FUNCTION pg_temp.del(p_note text) RETURNS text LANGUAGE sql AS $$
  SELECT 'DELETE FROM public.margin_notes WHERE id = {' || p_note || '}' $$;
CREATE FUNCTION pg_temp.ins(p_project text, p_proposal text, p_relationship text, p_author text)
RETURNS text LANGUAGE sql AS $$
  SELECT 'INSERT INTO public.margin_notes (project_id, proposal_id, designer_client_id, designer_id, body) VALUES ('
      || COALESCE('{' || p_project || '}', 'NULL') || ', '
      || COALESCE('{' || p_proposal || '}', 'NULL') || ', '
      || COALESCE('{' || p_relationship || '}', 'NULL') || ', {'
      || p_author || '}, ''867 probe'')' $$;
CREATE FUNCTION pg_temp.view_sel(p_note text) RETURNS text LANGUAGE sql AS $$
  SELECT 'SELECT count(*)::text FROM public.margin_items WHERE kind = ''note'' AND item_id = {' || p_note || '}' $$;
CREATE FUNCTION pg_temp.row_md5(p_note text) RETURNS text LANGUAGE sql AS $$
  SELECT 'SELECT md5(n::text) FROM public.margin_notes AS n WHERE n.id = {' || p_note || '}' $$;

-- Setups (run as postgres inside the probe's own rolled-back subtransaction).
CREATE FUNCTION pg_temp.remove_a1() RETURNS text LANGUAGE sql AS $$
  SELECT 'UPDATE public.organization_members SET status = ''removed'' WHERE user_id = {A1} AND organization_id = {SA}' $$;
CREATE FUNCTION pg_temp.suspend_a() RETURNS text LANGUAGE sql AS $$
  SELECT 'UPDATE public.organizations SET status = ''suspended'' WHERE id = {SA}' $$;
CREATE FUNCTION pg_temp.suspend_a_seat_a1_in_b() RETURNS text LANGUAGE sql AS $$
  SELECT 'WITH s AS (UPDATE public.organizations SET status = ''suspended'' WHERE id = {SA} RETURNING id) '
      || 'INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) '
      || 'SELECT {A1}, {SB}, ''member'', ''active'', now() FROM s' $$;

INSERT INTO m867_case (name, actor, setup, probe, expect, kind) VALUES
  -- F1 · a designer seated in A and B; her notes on each studio's job
  ('F1-01 D reads her note on A job',                'D',  NULL, pg_temp.sel('N1'), '1', 'keeps'),
  ('F1-02 A1 reads D note on A job',                 'A1', NULL, pg_temp.sel('N1'), '1', 'keeps'),
  ('F1-03 B1 reads D note on A job',                 'B1', NULL, pg_temp.sel('N1'), '0', 'closes'),
  ('F1-04 A1 reads D note on B job',                 'A1', NULL, pg_temp.sel('N3'), '0', 'closes'),
  ('F1-05 B1 reads D note on B job',                 'B1', NULL, pg_temp.sel('N3'), '1', 'keeps'),
  ('F1-06 B1 updates D note on A job',               'B1', NULL, pg_temp.upd('N1'), 'rows=0', 'closes'),
  ('F1-07 B1 deletes D note on A job',               'B1', NULL, pg_temp.del('N1'), 'rows=0', 'closes'),
  ('F1-08 B1 inserts D-authored note on A job',      'B1', NULL, pg_temp.ins('PA', NULL, NULL, 'D'), 'denied', 'closes'),
  ('F1-09 A1 updates D note on A job',               'A1', NULL, pg_temp.upd('N1'), 'rows=1', 'keeps'),
  ('F1-10 A1 inserts self-authored note on A job',   'A1', NULL, pg_temp.ins('PA', NULL, NULL, 'A1'), 'rows=1', 'keeps'),
  ('F1-11 A1 inserts D-authored note on A job',      'A1', NULL, pg_temp.ins('PA', NULL, NULL, 'D'), 'rows=1', 'keeps'),
  ('F1-12 A1 deletes own note on A job',             'A1', NULL, pg_temp.del('N2'), 'rows=1', 'keeps'),
  ('F1-13 D updates A1 note on A job',               'D',  NULL, pg_temp.upd('N2'), 'rows=1', 'keeps'),
  ('F1-14 D inserts self-authored note on B job',    'D',  NULL, pg_temp.ins('PB', NULL, NULL, 'D'), 'rows=1', 'keeps'),
  ('F1-15 D deletes her note on B job',              'D',  NULL, pg_temp.del('N3'), 'rows=1', 'keeps'),
  -- F2 · self-authored rows on a foreign job (permissive 00196 ALL)
  ('F2-01 U inserts self-authored note on A job',    'U',  NULL, pg_temp.ins('PA', NULL, NULL, 'U'), 'denied', 'closes'),
  ('F2-02 client inserts self-authored on A job',    'CL', NULL, pg_temp.ins('PA', NULL, NULL, 'CL'), 'denied', 'closes'),
  ('F2-03 B1 inserts self-authored note on A job',   'B1', NULL, pg_temp.ins('PA', NULL, NULL, 'B1'), 'denied', 'closes'),
  ('F2-04 U reads D note on A job',                  'U',  NULL, pg_temp.sel('N1'), '0', 'keeps'),
  ('F2-05 client (client team seat) reads D note',   'CL', NULL, pg_temp.sel('N1'), '0', 'closes'),
  ('F2-06 U updates D note on A job',                'U',  NULL, pg_temp.upd('N1'), 'rows=0', 'keeps'),
  ('F2-07 U deletes D note on A job',                'U',  NULL, pg_temp.del('N1'), 'rows=0', 'keeps'),
  ('F2-08 client deletes D note on A job',           'CL', NULL, pg_temp.del('N1'), 'rows=0', 'keeps'),
  -- S · guest, suspended and removed seats in A
  ('S-01 A guest seat reads D note',                 'AG', NULL, pg_temp.sel('N1'), '0', 'keeps'),
  ('S-02 A guest seat inserts self-authored',        'AG', NULL, pg_temp.ins('PA', NULL, NULL, 'AG'), 'denied', 'closes'),
  ('S-03 A guest seat updates D note',               'AG', NULL, pg_temp.upd('N1'), 'rows=0', 'keeps'),
  ('S-04 A suspended seat reads D note',             'AS', NULL, pg_temp.sel('N1'), '0', 'keeps'),
  ('S-05 A suspended seat inserts self-authored',    'AS', NULL, pg_temp.ins('PA', NULL, NULL, 'AS'), 'denied', 'closes'),
  ('S-06 A removed seat reads D note',               'AR', NULL, pg_temp.sel('N1'), '0', 'keeps'),
  ('S-07 A removed seat inserts self-authored',      'AR', NULL, pg_temp.ins('PA', NULL, NULL, 'AR'), 'denied', 'closes'),
  -- T · a B member holding a team seat on A's job
  ('T-01 wrong-studio team seat reads D note',       'BT', NULL, pg_temp.sel('N1'), '0', 'closes'),
  ('T-02 wrong-studio team seat inserts self',       'BT', NULL, pg_temp.ins('PA', NULL, NULL, 'BT'), 'denied', 'closes'),
  ('T-03 wrong-studio team seat updates D note',     'BT', NULL, pg_temp.upd('N1'), 'rows=0', 'closes'),
  -- W · UPDATE images: reparenting, author change, anchor swap
  ('W-01 A1 moves D note to B job',                  'A1', NULL, pg_temp.upd('N1', 'project_id = {PB}'), 'denied', 'closes'),
  ('W-02 D moves her note to stranger studio-less job', 'D', NULL, pg_temp.upd('N1', 'project_id = {PU}'), 'denied', 'closes'),
  ('W-03 B1 takes authorship of D note on A job',    'B1', NULL, pg_temp.upd('N1', 'designer_id = {B1}'), 'rows=0', 'closes'),
  ('W-04 A1 adds B proposal to A job note',          'A1', NULL, pg_temp.upd('N1', 'proposal_id = {QB}'), 'denied', 'closes'),
  ('W-05 D adds B proposal to A job note',           'D',  NULL, pg_temp.upd('N1', 'proposal_id = {QB}'), 'denied', 'closes'),
  ('W-06 A1 adds stranger job to A proposal note',   'A1', NULL, pg_temp.upd('N4', 'project_id = {PU}'), 'denied', 'closes'),
  ('W-07 A1 adds job designer unstamped proposal',   'A1', NULL, pg_temp.upd('N1', 'proposal_id = {Q0}'), 'rows=1', 'keeps'),
  ('W-08 B1 moves D note from B job to A job',       'B1', NULL, pg_temp.upd('N3', 'project_id = {PA}'), 'denied', 'closes'),
  ('W-09 A1 hands D note authorship to B1',          'A1', NULL, pg_temp.upd('N1', 'designer_id = {B1}'), 'denied', 'keeps'),
  -- P · proposal-only and Discovery-only rows
  ('P-01 A1 reads proposal-only A note',             'A1', NULL, pg_temp.sel('N4'), '1', 'keeps'),
  ('P-02 B1 reads proposal-only A note',             'B1', NULL, pg_temp.sel('N4'), '0', 'closes'),
  ('P-03 B1 inserts D-authored proposal-only A note','B1', NULL, pg_temp.ins(NULL, 'QA', NULL, 'D'), 'denied', 'closes'),
  ('P-04 D reads Discovery-only A note',             'D',  NULL, pg_temp.sel('N5'), '1', 'keeps'),
  ('P-05 A1 reads Discovery-only A note',            'A1', NULL, pg_temp.sel('N5'), '0', 'keeps'),
  ('P-06 B1 inserts D-authored Discovery A note',    'B1', NULL, pg_temp.ins(NULL, NULL, 'RA', 'D'), 'denied', 'closes'),
  ('P-07 A1 inserts self-authored Discovery A note', 'A1', NULL, pg_temp.ins(NULL, NULL, 'RA', 'A1'), 'rows=1', 'keeps'),
  ('P-08 B1 inserts self-authored Discovery A note', 'B1', NULL, pg_temp.ins(NULL, NULL, 'RA', 'B1'), 'denied', 'closes'),
  -- X · several anchors on one row
  ('X-01 A1 reads A job + A proposal note',          'A1', NULL, pg_temp.sel('N9'), '1', 'keeps'),
  ('X-02 B1 reads A job + A proposal note',          'B1', NULL, pg_temp.sel('N9'), '0', 'closes'),
  ('X-03 D reads conflicting-anchor note',           'D',  NULL, pg_temp.sel('N10'), '0', 'closes'),
  ('X-04 A1 reads conflicting-anchor note',          'A1', NULL, pg_temp.sel('N10'), '0', 'closes'),
  ('X-05 B1 reads conflicting-anchor note',          'B1', NULL, pg_temp.sel('N10'), '0', 'closes'),
  ('X-06 D inserts conflicting anchors',             'D',  NULL, pg_temp.ins('PA', 'QB', NULL, 'D'), 'denied', 'closes'),
  ('X-07 A1 reads A job + unstamped proposal note',  'A1', NULL, pg_temp.sel('N11'), '1', 'keeps'),
  ('X-08 B1 reads A job + unstamped proposal note',  'B1', NULL, pg_temp.sel('N11'), '0', 'closes'),
  ('X-09 A1 inserts A job + unstamped proposal',     'A1', NULL, pg_temp.ins('PA', 'Q0', NULL, 'A1'), 'rows=1', 'keeps'),
  ('X-10 A1 reads stranger job masked by A proposal','A1', NULL, pg_temp.sel('N12'), '0', 'closes'),
  ('X-11 U reads masked note on own job',            'U',  NULL, pg_temp.sel('N12'), '0', 'closes'),
  ('X-12 D reads masked note',                       'D',  NULL, pg_temp.sel('N12'), '0', 'closes'),
  ('X-13 A1 inserts stranger job masked by A proposal', 'A1', NULL, pg_temp.ins('PU', 'QA', NULL, 'A1'), 'denied', 'closes'),
  ('X-14 A1 inserts A job + D Discovery (A household)', 'A1', NULL, pg_temp.ins('PA', NULL, 'RA', 'A1'), 'rows=1', 'keeps'),
  ('X-15 B1 inserts B job + D Discovery (A household)', 'B1', NULL, pg_temp.ins('PB', NULL, 'RA', 'B1'), 'denied', 'closes'),
  -- L · legacy studio-less rows, seeded before 00867
  ('L-01 D reads legacy job note identically',       'D',  NULL, pg_temp.row_md5('N6'),  'snapshot:N6',  'keeps'),
  ('L-02 D reads legacy proposal note identically',  'D',  NULL, pg_temp.row_md5('N7'),  'snapshot:N7',  'keeps'),
  ('L-03 D reads legacy Discovery note identically', 'D',  NULL, pg_temp.row_md5('N8'),  'snapshot:N8',  'keeps'),
  ('L-04 D reads coauthored legacy note identically','D',  NULL, pg_temp.row_md5('N13'), 'snapshot:N13', 'keeps'),
  ('L-05 A1 reads legacy job note',                  'A1', NULL, pg_temp.sel('N6'), '0', 'closes'),
  ('L-06 A1 reads legacy proposal note',             'A1', NULL, pg_temp.sel('N7'), '0', 'closes'),
  ('L-07 A1 reads legacy Discovery note',            'A1', NULL, pg_temp.sel('N8'), '0', 'keeps'),
  ('L-08 B1 reads legacy job note',                  'B1', NULL, pg_temp.sel('N6'), '0', 'closes'),
  ('L-09 A1 reads own coauthored legacy note',       'A1', NULL, pg_temp.sel('N13'), '0', 'closes'),
  ('L-10 A1 updates legacy job note',                'A1', NULL, pg_temp.upd('N6'), 'rows=0', 'closes'),
  ('L-11 A1 inserts self-authored on legacy job',    'A1', NULL, pg_temp.ins('P0', NULL, NULL, 'A1'), 'denied', 'closes'),
  ('L-12 D inserts A1-authored note on legacy job',  'D',  NULL, pg_temp.ins('P0', NULL, NULL, 'A1'), 'denied', 'closes'),
  ('L-13 D inserts self-authored on legacy job',     'D',  NULL, pg_temp.ins('P0', NULL, NULL, 'D'), 'rows=1', 'keeps'),
  ('L-14 D moves legacy note due date',              'D',  NULL, pg_temp.upd('N6', 'due_date = due_date + interval ''1 day'''), 'rows=1', 'keeps'),
  ('L-15 D deletes legacy proposal note',            'D',  NULL, pg_temp.del('N7'), 'rows=1', 'keeps'),
  ('L-16 U inserts self-authored on D legacy job',   'U',  NULL, pg_temp.ins('P0', NULL, NULL, 'U'), 'denied', 'closes'),
  ('L-17 D inserts self-authored legacy Discovery',  'D',  NULL, pg_temp.ins(NULL, NULL, 'R0', 'D'), 'rows=1', 'keeps'),
  ('L-18 A1 inserts self-authored legacy Discovery', 'A1', NULL, pg_temp.ins(NULL, NULL, 'R0', 'A1'), 'denied', 'closes'),
  -- M · membership removal and studio suspension (setup inside the probe)
  ('M-01 removed A1 reads own note on A job',        'A1', pg_temp.remove_a1(), pg_temp.sel('N2'), '0', 'closes'),
  ('M-02 removed A1 inserts self-authored on A job', 'A1', pg_temp.remove_a1(), pg_temp.ins('PA', NULL, NULL, 'A1'), 'denied', 'closes'),
  ('M-03 removed A1 reads D note on A job',          'A1', pg_temp.remove_a1(), pg_temp.sel('N1'), '0', 'keeps'),
  ('M-04 A suspended: A1 seated in B reads D note',  'A1', pg_temp.suspend_a_seat_a1_in_b(), pg_temp.sel('N1'), '0', 'closes'),
  ('M-05 A suspended: A1 seated in B updates D note','A1', pg_temp.suspend_a_seat_a1_in_b(), pg_temp.upd('N1'), 'rows=0', 'closes'),
  ('M-06 A suspended: A1 seated in B inserts as D',  'A1', pg_temp.suspend_a_seat_a1_in_b(), pg_temp.ins('PA', NULL, NULL, 'D'), 'denied', 'closes'),
  ('M-07 A suspended: A1 seated in B reads own note','A1', pg_temp.suspend_a_seat_a1_in_b(), pg_temp.sel('N2'), '1', 'keeps'),
  ('M-08 A suspended: D reads her note',             'D',  pg_temp.suspend_a(), pg_temp.sel('N1'), '1', 'keeps'),
  ('M-09 A suspended: D reads A1 note on her job',   'D',  pg_temp.suspend_a(), pg_temp.sel('N2'), '1', 'keeps'),
  ('M-10 A suspended: A1 (A only) reads D note',     'A1', pg_temp.suspend_a(), pg_temp.sel('N1'), '0', 'keeps'),
  -- V · the margin_items projection (SECURITY INVOKER, 00613)
  ('V-01 B1 margin_items: D note on A job',          'B1', NULL, pg_temp.view_sel('N1'), '0', 'closes'),
  ('V-02 A1 margin_items: D note on A job',          'A1', NULL, pg_temp.view_sel('N1'), '1', 'keeps'),
  ('V-03 A1 margin_items: legacy job note',          'A1', NULL, pg_temp.view_sel('N6'), '0', 'closes'),
  ('V-04 D margin_items: legacy field note body',    'D',  NULL,
     'SELECT (payload->>''body'') FROM public.margin_items WHERE kind = ''note'' AND item_id = {N6}',
     'N6 legacy job note, spoken on site', 'keeps'),
  ('V-05 B1 margin_items: D note on B job',          'B1', NULL, pg_temp.view_sel('N3'), '1', 'keeps'),
  ('V-06 A1 margin_items: D note on B job',          'A1', NULL, pg_temp.view_sel('N3'), '0', 'closes');

UPDATE m867_case AS c
   SET expect = (SELECT md5(s::text) FROM m867_snapshot AS s
                  WHERE s.id = pg_temp.id(substr(c.expect, length('snapshot:') + 1)))
 WHERE c.expect LIKE 'snapshot:%';

-- ─── 6 · PRE: the policies as they stand before 00867 ─────────────────────
UPDATE m867_case
   SET pre = pg_temp.probe(pg_temp.id(actor), pg_temp.sql_of(probe), pg_temp.sql_of(setup));

-- ─── 7 · the migration, exactly as shipped ─────────────────────────────────
\ir ../../migrations/00867_margin_notes_tenant_guard.sql

-- ─── 8 · POST ───────────────────────────────────────────────────────────────
UPDATE m867_case
   SET post = pg_temp.probe(pg_temp.id(actor), pg_temp.sql_of(probe), pg_temp.sql_of(setup));

SELECT name, actor, expect, pre, post,
       CASE WHEN post IS DISTINCT FROM expect THEN 'FAIL'
            WHEN kind = 'closes' AND pre IS NOT DISTINCT FROM expect THEN 'FAIL (not a defect before 00867)'
            WHEN kind = 'keeps'  AND pre IS DISTINCT FROM expect THEN 'FAIL (behaviour changed)'
            ELSE 'ok' END AS verdict
  FROM m867_case
 ORDER BY name;

DO $$
DECLARE
  v_failed text;
  v_closes integer;
  v_keeps  integer;
BEGIN
  SELECT string_agg(format('%s [%s] expect=%s pre=%s post=%s', name, kind, expect, pre, post), E'\n' ORDER BY name)
    INTO v_failed
    FROM m867_case
   WHERE post IS DISTINCT FROM expect
      OR (kind = 'closes' AND pre IS NOT DISTINCT FROM expect)
      OR (kind = 'keeps'  AND pre IS DISTINCT FROM expect)
      -- A probe that errored for any reason other than RLS proves nothing,
      -- least of all a `closes` case whose PRE merely had to differ.
      OR pre LIKE 'error %' OR post LIKE 'error %';
  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION E'00867 actor matrix FAILED:\n%', v_failed;
  END IF;
  SELECT count(*) FILTER (WHERE kind = 'closes'), count(*) FILTER (WHERE kind = 'keeps')
    INTO v_closes, v_keeps FROM m867_case;
  RAISE NOTICE '00867 actor matrix passed: % cases close a pre-00867 reach (each failed its assertion before the migration), % keep pre-00867 behaviour', v_closes, v_keeps;
END $$;

-- ─── 9 · catalog ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_guard record;
  v_fn    regprocedure := 'public.margin_note_tenant_admits(uuid, uuid, uuid, uuid, boolean)';
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.margin_notes'::regclass),
    'CATALOG: RLS must stay enabled on margin_notes';

  SELECT polcmd, polpermissive, polroles,
         pg_get_expr(polqual, polrelid) AS qual,
         pg_get_expr(polwithcheck, polrelid) AS with_check
    INTO v_guard
    FROM pg_policy
   WHERE polrelid = 'public.margin_notes'::regclass
     AND polname = 'margin_notes_tenant_guard';
  ASSERT FOUND, 'CATALOG: margin_notes_tenant_guard is missing';
  ASSERT NOT v_guard.polpermissive, 'CATALOG: the guard must be RESTRICTIVE';
  ASSERT v_guard.polcmd = '*', 'CATALOG: the guard must cover ALL commands';
  ASSERT v_guard.polroles = ARRAY['authenticated'::regrole]::oid[],
    'CATALOG: the guard must apply TO authenticated';
  ASSERT v_guard.qual LIKE 'margin_note_tenant_admits(project_id, proposal_id, designer_client_id, designer_id, false)',
    'CATALOG: guard USING is not the old-row tenant gate: ' || v_guard.qual;
  ASSERT v_guard.with_check LIKE 'margin_note_tenant_admits(project_id, proposal_id, designer_client_id, designer_id, true)',
    'CATALOG: guard WITH CHECK is not the new-row tenant gate: ' || v_guard.with_check;

  -- The five permissive policies are untouched: 00867 only narrows them.
  ASSERT NOT EXISTS (
    (SELECT polname, polcmd, polpermissive, polroles,
            pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
       FROM pg_policy
      WHERE polrelid = 'public.margin_notes'::regclass
        AND polname <> 'margin_notes_tenant_guard')
    EXCEPT
    SELECT * FROM m867_pre_policy
  ) AND (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.margin_notes'::regclass) = 6,
    'CATALOG: the five permissive policies must be byte-identical and the guard the only addition';
  ASSERT (SELECT count(*) FROM pg_policy
           WHERE polrelid = 'public.margin_notes'::regclass AND NOT polpermissive) = 1,
    'CATALOG: exactly one restrictive policy';

  ASSERT (SELECT prosecdef AND provolatile = 's'
                 AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
            FROM pg_proc WHERE oid = v_fn),
    'CATALOG: the helper must be SECURITY DEFINER, STABLE, with a pinned search_path';
  ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'),
    'CATALOG: authenticated must EXECUTE the helper (the policy runs as the caller)';
  ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'CATALOG: service_role must EXECUTE the helper';
  ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'),
    'CATALOG: anon must not EXECUTE the helper';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc, aclexplode(proacl) AS acl
                      WHERE oid = v_fn AND acl.grantee = 0),
    'CATALOG: PUBLIC must not EXECUTE the helper';
  ASSERT has_table_privilege('authenticated', 'public.margin_notes', 'SELECT, INSERT, UPDATE, DELETE'),
    'CATALOG: authenticated keeps the four verbs the policies govern';

  RAISE NOTICE '00867 catalog passed: one RESTRICTIVE ALL guard over both images, five permissive policies unchanged, helper SECURITY DEFINER + pinned search_path, EXECUTE to authenticated/service_role only';
END $$;

-- ─── 10 · privileged readback: forbidden writes, run for real ─────────────
DO $$
DECLARE
  v_outcome text;
  v_drift   integer;
BEGIN
  v_outcome := pg_temp.act(pg_temp.id('B1'), pg_temp.sql_of(pg_temp.upd('N1')));
  ASSERT v_outcome = 'rows=0', 'READBACK: B1 update of N1 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('B1'), pg_temp.sql_of(pg_temp.del('N1')));
  ASSERT v_outcome = 'rows=0', 'READBACK: B1 delete of N1 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('B1'), pg_temp.sql_of(pg_temp.upd('N1', 'designer_id = {B1}')));
  ASSERT v_outcome = 'rows=0', 'READBACK: B1 authorship grab of N1 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('BT'), pg_temp.sql_of(pg_temp.del('N9')));
  ASSERT v_outcome = 'rows=0', 'READBACK: wrong-studio team delete of N9 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('A1'), pg_temp.sql_of(pg_temp.upd('N6')));
  ASSERT v_outcome = 'rows=0', 'READBACK: A1 update of legacy N6 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('A1'), pg_temp.sql_of(pg_temp.del('N7')));
  ASSERT v_outcome = 'rows=0', 'READBACK: A1 delete of legacy N7 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('D'), pg_temp.sql_of(pg_temp.del('N10')));
  ASSERT v_outcome = 'rows=0', 'READBACK: D delete of conflicting N10 reached ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('A1'), pg_temp.sql_of(pg_temp.upd('N1', 'project_id = {PB}')));
  ASSERT v_outcome = 'denied', 'READBACK: A1 reparenting N1 to B was ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('U'), pg_temp.sql_of(pg_temp.ins('PA', NULL, NULL, 'U')));
  ASSERT v_outcome = 'denied', 'READBACK: U foreign insert was ' || v_outcome;
  v_outcome := pg_temp.act(pg_temp.id('CL'), pg_temp.sql_of(pg_temp.ins('PA', NULL, NULL, 'CL')));
  ASSERT v_outcome = 'denied', 'READBACK: client insert was ' || v_outcome;

  ASSERT current_user = 'postgres', 'READBACK: must read back as postgres, not ' || current_user;
  SELECT count(*) INTO v_drift FROM (
    (SELECT * FROM public.margin_notes WHERE id IN (SELECT id FROM m867_id WHERE label LIKE 'N%')
     EXCEPT SELECT * FROM m867_snapshot)
    UNION ALL
    (SELECT * FROM m867_snapshot
     EXCEPT SELECT * FROM public.margin_notes WHERE id IN (SELECT id FROM m867_id WHERE label LIKE 'N%'))
  ) AS drift;
  ASSERT v_drift = 0, 'READBACK: fixture notes drifted from the snapshot: ' || v_drift;
  ASSERT (SELECT count(*) FROM public.margin_notes
           WHERE project_id IN (pg_temp.id('PA'), pg_temp.id('PB'), pg_temp.id('P0'), pg_temp.id('PU'))
              OR proposal_id IN (pg_temp.id('QA'), pg_temp.id('QB'), pg_temp.id('Q0'))
              OR designer_client_id IN (pg_temp.id('RA'), pg_temp.id('R0'))) = 13,
    'READBACK: a forbidden write left a row behind';

  RAISE NOTICE '00867 readback passed: 10 forbidden writes ran for real, all 13 fixture notes byte-identical to the pre-00867 snapshot';
END $$;

ROLLBACK;
