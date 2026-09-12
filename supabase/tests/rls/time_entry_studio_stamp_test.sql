-- ═══════════════════════════════════════════════════════════════════════════
-- stamp_project_pricing_studio — the repair 00606's narrowing promises
-- (migration 00606, section 4; W2 review round 2, finding W2-R2-02)
--
-- 00605/00606 key the owner/admin write and read on the studio that PRICES the
-- work (`is_org_admin_or_owner(project_pricing_studio_id(project_id))`), and both
-- banners said the owner of an unstamped project "loses her studio read until she
-- stamps the project". She could not: `set_project_studio_id`'s authenticated arm
-- (00563) raises `studio_id_not_designer_studio` unless TG_OP = 'INSERT', so
-- projects.studio_id was immutable for every authenticated session once the row
-- existed — and no other writer of it exists. The read HT-10 grants was therefore
-- permanently absent on every legacy NULL-studio project and every
-- ambiguous-designer-tier one. This file measures the absence, the repair, and
-- the refusals that keep the repair from becoming round 1's B1 in a worse form.
--
-- The fixture's project is unstamped AND unpriced the honest way: its designer
-- holds TWO employer seats, so HT-3-b's employer tier is AMBIGUOUS and
-- project_pricing_studio_id answers NULL. No attacker, no manoeuvre, no forged
-- column — until case (d), which needs one.
--
-- Asserted PER ROLE, every call through RLS as the named actor:
--   (a) THE ABSENCE — the studio owner reads 0 of her designer's hours and is
--       REFUSED the project total, on a project she can otherwise open.
--   (b) a plain studio `member` may not stamp.
--   (c) the project's designer may not name a studio she does not belong to.
--   (d) THE ATTACK THE NARROW ARMS EXIST FOR — an attacker who owns only her own
--       org seats the project's DESIGNER in it (one consent-free
--       `organization_members` INSERT, asserted to SUCCEED) and is still refused.
--       Keyed as "an owner/admin of the named studio, where the designer holds a
--       seat", that INSERT would have let her stamp the project with her own org
--       and take the hours, the money and the audit trail permanently.
--   (e) a project a studio ALREADY prices cannot be stamped — this repairs
--       'none', it does not move money.
--   (f) ARM 1 — the project's own designer names a studio she actively belongs to
--       (00563's own INSERT bound, HT-3-c arm (a), now available after the fact).
--   (g) ARM 2 — the studio OWNER stamps, because her studio already holds another
--       project the same designer LEADS AND CREATED. That is HT-3-a's ruled
--       sentence ("the owner fixes 'none' by stamping projects.studio_id"), and
--       `created_by` is the half of it an attacker cannot author — see (k).
--   (h) THE REPAIR, measured — after (g) the owner reads the hour and gets the
--       project total; before it she had neither.
--   (i) a stamped project is final; re-naming the same studio is a no-op.
--   (j) SHAPE — SECURITY DEFINER, search_path pinned, anon refused, authenticated
--       granted.
--   (k) W2-R3-01, THE MEASURED BLOCKER — ARM 2's standing is manufacturable
--       through `reassign_project_lead` unless the sibling was CREATED BY the
--       designer. The attacker seats the victim project's designer in her own org
--       (asserted to succeed), puts that designer in the lead of her OWN project
--       through the SECURITY DEFINER, authenticated-GRANTed
--       `reassign_project_lead` (asserted to succeed — if this precondition ever
--       fails, the vector closed elsewhere and the case is measuring nothing), and
--       is then REFUSED the stamp. Before the fix all three statements succeeded
--       and the pricing studio moved into her org permanently.
--   (l) W2-R3-02, THE MEASURED MAJOR — ARM 1 let the member being priced move her
--       own resolved rate to a number she set. A designer with TWO employer seats
--       (ambiguous tier ⇒ 'none') writes herself 99900 in the one-person workspace
--       00295 provisions at her designer grant, and is now REFUSED the stamp of
--       that workspace while the stamp of a studio that EMPLOYS her succeeds —
--       after which her next hour prices at the employer's 20000, not her 99900,
--       and the employer's owner reads the project.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/time_entry_studio_stamp_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-000000000001', 'stamp-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000002', 'stamp-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000003', 'stamp-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000004', 'stamp-attacker@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000005', 'stamp-outside@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000006', 'stamp-priced@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

UPDATE profiles SET full_name = 'Stamp Owner'    WHERE id = 'c6060000-0000-4000-8000-000000000001';
UPDATE profiles SET full_name = 'Stamp Designer' WHERE id = 'c6060000-0000-4000-8000-000000000002';
UPDATE profiles SET full_name = 'Stamp Member'   WHERE id = 'c6060000-0000-4000-8000-000000000003';
UPDATE profiles SET full_name = 'Stamp Attacker' WHERE id = 'c6060000-0000-4000-8000-000000000004';
UPDATE profiles SET full_name = 'Stamp Outside'  WHERE id = 'c6060000-0000-4000-8000-000000000005';
UPDATE profiles SET full_name = 'Stamp Priced'   WHERE id = 'c6060000-0000-4000-8000-000000000006';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6060000-0000-4000-8000-0000000000a1', 'design_studio', 'Stamp Studio',    'stamp-studio-test',   'active'),
  ('c6060000-0000-4000-8000-0000000000a2', 'design_studio', 'Stamp Second',    'stamp-second-test',   'active'),
  ('c6060000-0000-4000-8000-0000000000a3', 'design_studio', 'Stamp Attacker',  'stamp-attacker-test', 'active'),
  ('c6060000-0000-4000-8000-0000000000a4', 'design_studio', 'Stamp Outside',   'stamp-outside-test',  'active');

-- The designer is SEATED before her designer role is granted, so 00295's
-- provisioning takes its early exit and she owns no workspace — every seat below
-- is an employer seat, and there are TWO of them, which is what makes HT-3-b's
-- employer tier ambiguous and the pricing studio NULL with no manoeuvre at all.
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-0000000000c1', 'c6060000-0000-4000-8000-000000000001',
   'c6060000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-0000000000c2', 'c6060000-0000-4000-8000-000000000002',
   'c6060000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c6060000-0000-4000-8000-0000000000c3', 'c6060000-0000-4000-8000-000000000002',
   'c6060000-0000-4000-8000-0000000000a2', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-0000000000c4', 'c6060000-0000-4000-8000-000000000003',
   'c6060000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-0000000000c5', 'c6060000-0000-4000-8000-000000000004',
   'c6060000-0000-4000-8000-0000000000a3', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-0000000000c6', 'c6060000-0000-4000-8000-000000000005',
   'c6060000-0000-4000-8000-0000000000a4', 'owner',  'active', NOW());

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000001', id FROM roles WHERE name = 'studio_owner';
INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000002', id FROM roles WHERE name = 'studio_designer';

-- Two projects led by the designer, both with studio_id NULL (the ambiguous tier
-- leaves 00563's postgres-fixture derivation with two candidates, so it writes
-- nothing), plus ONE already stamped with Stamp Studio — the sibling that gives
-- the studio's owner her standing in case (g). That sibling's `created_by` is the
-- DESIGNER, which is both what every real creation path writes
-- (`_activate_proposal_as_project_impl` and `activate_project_v2` insert the
-- proposal's/caller's designer id) and what ARM 2 now requires (W2-R3-01): it used
-- to be the owner's id here, which made the fixture artificial in precisely the
-- direction the attack in case (k) exploits.
-- 'Stamp Reassign House' is case (k)'s victim project — same shape as Stamp House,
-- a second row so that (k) does not race (g)'s stamp of it.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6060000-0000-4000-8000-0000000000e1', 'Stamp House',   'c6060000-0000-4000-8000-000000000002',
   'c6060000-0000-4000-8000-000000000001', NULL),
  ('c6060000-0000-4000-8000-0000000000e2', 'Stamp Cottage', 'c6060000-0000-4000-8000-000000000002',
   'c6060000-0000-4000-8000-000000000001', NULL),
  ('c6060000-0000-4000-8000-0000000000e3', 'Stamp Sibling', 'c6060000-0000-4000-8000-000000000002',
   'c6060000-0000-4000-8000-000000000002', 'c6060000-0000-4000-8000-0000000000a1'),
  ('c6060000-0000-4000-8000-0000000000e5', 'Stamp Reassign House',
   'c6060000-0000-4000-8000-000000000002', 'c6060000-0000-4000-8000-000000000001', NULL);

-- Case (k) also needs one ordinary project OF THE ATTACKER'S OWN, with a client
-- and the canonical designer_clients row `reassign_project_lead` requires. Every
-- activated proposal leaves one, so this is the ordinary state of a designer who
-- has ever had a client.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c6060000-0000-4000-8000-000000000007', 'stamp-client@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Client' WHERE id = 'c6060000-0000-4000-8000-000000000007';

INSERT INTO designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('c6060000-0000-4000-8000-0000000000d1', 'c6060000-0000-4000-8000-000000000004',
        'c6060000-0000-4000-8000-000000000007', 'Stamp Client', 'stamp-client@test.invalid',
        'active', 'direct');

INSERT INTO projects (id, name, designer_id, created_by, studio_id, client_id)
VALUES ('c6060000-0000-4000-8000-0000000000e6', 'Stamp Attacker House',
        'c6060000-0000-4000-8000-000000000004', 'c6060000-0000-4000-8000-000000000004',
        'c6060000-0000-4000-8000-0000000000a3', 'c6060000-0000-4000-8000-000000000007');

-- Case (e)'s project: its designer holds NO seat anywhere when it is inserted, so
-- 00563's derivation and 00602/00603's stamp all find zero candidates and the
-- column stays NULL. She is seated and given her designer role AFTERWARDS, which
-- makes HT-3-b's employer tier exactly one — so a studio prices the project while
-- its column is still NULL. (A fresh INSERT cannot reach that state: W1's 00602
-- stamps the column the moment the tier answers. It is the legacy shape, built
-- the only way it arises.)
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6060000-0000-4000-8000-0000000000e4', 'Stamp Priced House', 'c6060000-0000-4000-8000-000000000006',
   'c6060000-0000-4000-8000-000000000001', NULL);

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('c6060000-0000-4000-8000-0000000000c7', 'c6060000-0000-4000-8000-000000000006',
        'c6060000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());
INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000006', id FROM roles WHERE name = 'studio_designer';

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
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

-- ─── the hour ──────────────────────────────────────────────────────────────
-- The designer logs 60 billable minutes on the unstamped project. No studio
-- prices it, so W1's resolver files it 'none' — which is exactly the state
-- HT-3-a step 3 describes and which the stamp exists to leave behind.
DO $$
BEGIN
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-0000000000b1', 'c6060000-0000-4000-8000-0000000000e1',
          'c6060000-0000-4000-8000-000000000002', NOW() - INTERVAL '3 hours', 60, true,
          'manual_entry', 'an hour nobody else can see yet');
  PERFORM pg_temp.reset_role();
END
$$;

-- ─── (a) the absence the narrowing created ─────────────────────────────────
DO $$
DECLARE
  v_studio  uuid;
  v_pricing uuid;
  v_rows    integer;
  v_state   text;
  v_min     integer;
  v_legacy  text;
BEGIN
  SELECT studio_id INTO v_studio FROM projects
   WHERE id = 'c6060000-0000-4000-8000-0000000000e1';
  ASSERT v_studio IS NULL,
    'FAIL a0 (precondition): Stamp House must be UNSTAMPED — if 00563 filled the '
    'column at INSERT the whole file is measuring a different shape; got '
    || COALESCE(v_studio::text, 'NULL');

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e1')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL a1 (precondition): the designer holds TWO employer seats, so HT-3-b''s '
    'employer tier is ambiguous and no studio prices this project; got '
    || COALESCE(v_pricing::text, 'NULL');

  -- The column is immutable for an authenticated session: this is W2-R2-02's
  -- measurement, and it is the reason section 4 of 00606 exists at all.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  v_legacy := NULL;
  BEGIN
    UPDATE projects SET studio_id = 'c6060000-0000-4000-8000-0000000000a1'
     WHERE id = 'c6060000-0000-4000-8000-0000000000e1';
  EXCEPTION WHEN OTHERS THEN v_legacy := SQLERRM;
  END;

  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000e1';

  v_state := NULL;
  BEGIN
    SELECT minutes INTO v_min
    FROM public.project_hours_total('c6060000-0000-4000-8000-0000000000e1');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_legacy LIKE '%studio_id_not_designer_studio%',
    'FAIL a2 (W2-R2-02): a plain UPDATE of projects.studio_id must still be '
    'refused by set_project_studio_id''s authenticated arm — if it now succeeds, '
    'the trigger changed and the stamp function''s whole justification must be '
    're-read; got ' || COALESCE(v_legacy, 'NO RAISE');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e1'),
    'FAIL a3: the refused UPDATE must leave the column NULL';
  ASSERT v_rows = 0,
    'FAIL a4 (the absence): with no pricing studio the studio OWNER reads none of '
    'her designer''s hours — this is what 00606 costs until the project names a '
    'studio; rows = ' || v_rows;
  ASSERT v_state = '42501',
    'FAIL a5 (the absence): and the project total is refused her too, because '
    'is_org_admin_or_owner(NULL) is false; got '
    || COALESCE(v_state, 'NO RAISE (minutes = ' || COALESCE(v_min::text, 'NULL') || ')');

  RAISE NOTICE 'stamp_project_pricing_studio: case (a) passed — the absence is real.';
END
$$;

-- ─── (b) a plain member · (c) a studio the designer does not belong to ──────
DO $$
DECLARE
  v_state text;
  v_got   uuid;
BEGIN
  -- (b) the plain member of Stamp Studio: neither the designer nor an owner/admin.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000003');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL b: a plain studio member may not name a project''s studio — the stamp '
    'decides which studio takes the money and reads the notes; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  -- (c) the designer, naming a studio she does not belong to.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a4') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL c: the stamp must replicate 00563''s own bound — the project''s DESIGNER '
    'must hold an active non-guest seat in the studio she names, or the column '
    'stops being the pricing key HT-3-a reads; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e1'),
    'FAIL bc: neither refusal may have written the column';

  RAISE NOTICE 'stamp_project_pricing_studio: cases (b) and (c) passed.';
END
$$;

-- ─── (d) the self-grant is not standing either (round 1's B1, one step worse) ─
DO $$
DECLARE
  v_seated  integer;
  v_state   text;
  v_got     uuid;
  v_pricing uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000004');

  -- Her one move, exactly as in case (i) of time_entry_admin_write_test.sql.
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('c6060000-0000-4000-8000-000000000002', 'c6060000-0000-4000-8000-0000000000a3', 'member');
  GET DIAGNOSTICS v_seated = ROW_COUNT;

  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a3') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_seated = 1,
    'FAIL d1 (precondition): the attacker''s seat INSERT must actually succeed — '
    'this case exists because `Org owners can insert members` permits it with no '
    'consent gate. If it now fails, the vector closed elsewhere and this case is '
    'measuring nothing';
  ASSERT v_state = '42501',
    'FAIL d2 (W2-R2-02''s fix, and round 1''s B1 one step worse): seating the '
    'project''s DESIGNER in a studio the attacker owns must NOT give her standing '
    'to STAMP the project. Keyed as "an owner/admin of the named studio where the '
    'designer holds a seat", this one INSERT would move the pricing studio '
    'PERMANENTLY — the hours, the money, the invoice composer and the audit '
    'organization all follow projects.studio_id once it is written, and 00563 '
    'then freezes it. The arms are the project''s designer, or an owner/admin of a '
    'studio that already holds one of her projects; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e1'),
    'FAIL d3: the refused stamp must leave the column NULL';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e1')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL d4: her seat made the employer tier wider, not narrower, so the pricing '
    'studio is still nothing; got ' || COALESCE(v_pricing::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (d) passed — the self-grant buys nothing.';
END
$$;

-- ─── (k) W2-R3-01: the lead can be manufactured; `created_by` cannot ──────
-- Runs after (d), which already wrote the attacker's consent-free seat for the
-- designer — the same seat this attack needs, and the one that makes the victim
-- project's employer tier ambiguous so that bound (c) passes.
DO $$
DECLARE
  v_pricing uuid;
  v_state   text;
  v_got     uuid;
  v_lead    uuid;
  v_creator uuid;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = 'c6060000-0000-4000-8000-000000000002'
      AND organization_id = 'c6060000-0000-4000-8000-0000000000a3'
      AND status = 'active' AND role <> 'guest'
  ), 'FAIL k0 (precondition): case (d)''s consent-free seat must already exist — '
     'it is what makes the victim designer a legal reassignment target in the '
     'attacker''s org';
  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e5')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL k1 (precondition): the victim project must be unstamped AND unpriced, or '
    'bound (c) refuses the stamp for the wrong reason; got '
    || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000004');

  -- THE MANOEUVRE: put the victim's designer in the lead of the attacker's OWN
  -- project, which is the standing ARM 2 reads. reassign_project_lead is SECURITY
  -- DEFINER and GRANTed to authenticated (00399:301, :510), and admits the current
  -- lead with any is_designer target seated in that project's studio.
  PERFORM public.reassign_project_lead(
    'c6060000-0000-4000-8000-0000000000e6',
    'c6060000-0000-4000-8000-000000000004',
    'c6060000-0000-4000-8000-000000000002');

  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e5', 'c6060000-0000-4000-8000-0000000000a3') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  SELECT designer_id, created_by INTO v_lead, v_creator FROM projects
   WHERE id = 'c6060000-0000-4000-8000-0000000000e6';
  ASSERT v_lead = 'c6060000-0000-4000-8000-000000000002',
    'FAIL k2 (precondition): reassign_project_lead must actually have SUCCEEDED — '
    'this case exists because an outsider can put somebody else''s designer in the '
    'lead of her own project with one authenticated call. If it now fails, the '
    'vector closed elsewhere and this case is measuring nothing; lead = '
    || COALESCE(v_lead::text, 'NULL');
  ASSERT v_creator = 'c6060000-0000-4000-8000-000000000004',
    'FAIL k3: and it must leave created_by alone — that is the whole basis of the '
    'fix (00563 raises on any UPDATE that moves created_by); got '
    || COALESCE(v_creator::text, 'NULL');

  ASSERT v_state = '42501',
    'FAIL k4 (W2-R3-01, THE BLOCKER): a manufactured lead must NOT be ARM 2 '
    'standing. Measured before the fix: seat + reassign + stamp, three '
    'authenticated statements, moved the victim project''s pricing studio into the '
    'attacker''s org PERMANENTLY — she then read the row, the confidential note '
    'and the per-person rate, got the project total, and could UPDATE and DELETE '
    'the hour, while the studio that did the work read 0 rows, was refused 42501 '
    'on the total and could not re-stamp (set_project_studio_id freezes the '
    'column). ARM 2 must require sibling.created_by = the designer; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e5'),
    'FAIL k5: the refused stamp must leave the victim project unstamped';

  RAISE NOTICE 'stamp_project_pricing_studio: case (k) passed — a manufactured lead buys nothing.';
END
$$;

-- ─── (e) a project a studio already prices is not repairable ────────────────
DO $$
DECLARE
  v_state   text;
  v_got     uuid;
  v_pricing uuid;
BEGIN
  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e4')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL e0 (precondition): Stamp Priced House is unstamped but its designer '
    'holds exactly ONE employer seat, so HT-3-b answers Stamp Studio; got '
    || COALESCE(v_pricing::text, 'NULL');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e4'),
    'FAIL e1 (precondition): its column must still be NULL';

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000006');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e4', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_state = '22023',
    'FAIL e2: where HT-3-b already answers, the owner HAS her read and there is '
    'nothing to repair — the stamp must refuse rather than become a way to move '
    'the money onto another studio''s books; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  RAISE NOTICE 'stamp_project_pricing_studio: case (e) passed.';
END
$$;

-- ─── (f) ARM 1: the project's designer names her studio ────────────────────
DO $$
DECLARE
  v_got     uuid;
  v_pricing uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e2', 'c6060000-0000-4000-8000-0000000000a2') INTO v_got;
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a2',
    'FAIL f1 (ARM 1): the project''s own designer may name a studio she actively, '
    'non-guestly belongs to — the same bound 00563''s authenticated-INSERT arm '
    'applies to this column at creation (HT-3-c arm (a)); got '
    || COALESCE(v_got::text, 'NULL');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a2' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e2'),
    'FAIL f2: the column must actually be written — the DEFINER write must not '
    'meet set_project_studio_id''s authenticated arm';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e2')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000a2',
    'FAIL f3: and HT-3-a step 1 must now answer with it; got '
    || COALESCE(v_pricing::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (f) passed — the designer names it.';
END
$$;

-- ─── (g) ARM 2 + (h) THE REPAIR: the owner stamps and her read comes back ──
DO $$
DECLARE
  v_got     uuid;
  v_rows    integer;
  v_min     integer;
  v_pricing uuid;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM projects
    WHERE studio_id = 'c6060000-0000-4000-8000-0000000000a1'
      AND designer_id = 'c6060000-0000-4000-8000-000000000002'
      AND created_by = 'c6060000-0000-4000-8000-000000000002'
      AND id <> 'c6060000-0000-4000-8000-0000000000e1'
  ), 'FAIL g0 (precondition): ARM 2''s standing is a SIBLING project that the '
     'designer both LEADS and CREATED — Stamp Studio must already hold one. The '
     '`created_by` half is what an attacker cannot manufacture (W2-R3-01, case '
     '(k)): she CAN put a victim designer in the lead of a project, through '
     'reassign_project_lead, but not into its created_by';

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;

  -- Still the same session, so the repair is measured as the owner experiences it.
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000e1';
  SELECT minutes INTO v_min
  FROM public.project_hours_total('c6060000-0000-4000-8000-0000000000e1');
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL g1 (ARM 2, HT-3-a''s ruled sentence): the studio OWNER fixes ''none'' by '
    'stamping projects.studio_id; got ' || COALESCE(v_got::text, 'NULL');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a1' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e1'),
    'FAIL g2: the column must actually be written';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e1')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL h1: HT-3-a step 1 must now answer Stamp Studio; got '
    || COALESCE(v_pricing::text, 'NULL');
  ASSERT v_rows = 1,
    'FAIL h2 (THE REPAIR): the studio owner read 0 of these rows in case (a) and '
    'must read them now — that is the whole of what 00606''s banner promises and '
    'what W2-R2-02 measured as unreachable; rows = ' || v_rows;
  ASSERT v_min = 60,
    'FAIL h3 (THE REPAIR): and the project total must answer her; got '
    || COALESCE(v_min::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: cases (g) and (h) passed — the repair works.';
END
$$;

-- ─── (i) a stamped project is final; the same studio is a no-op ─────────────
DO $$
DECLARE
  v_state text;
  v_got   uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a2') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;

  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  PERFORM pg_temp.reset_role();

  ASSERT v_state = '22023',
    'FAIL i1: a stamped project is FINAL (HT-3-c, 00603 case (z)) — re-pointing it '
    'at another studio would move priced, invoiced hours onto another studio''s '
    'books; got ' || COALESCE(v_state, 'NO RAISE');
  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL i2: naming the studio the project already names is a no-op, so a retry '
    'is safe; got ' || COALESCE(v_got::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (i) passed.';
END
$$;

-- ─── (l) W2-R3-02: the subject may not name a studio whose rates she writes ─
-- A SECOND designer, hired the other way round: her designer role comes FIRST, so
-- 00295's fc_provision_studio_on_designer gives her the one-person workspace she
-- OWNS, and only then is she seated a plain `member` in two employer studios. Her
-- employer tier is therefore ambiguous and her legacy project prices 'none' — with
-- no attacker, no manoeuvre and no forged column.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c6060000-0000-4000-8000-000000000008', 'stamp-hire@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Hire' WHERE id = 'c6060000-0000-4000-8000-000000000008';

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000008', id FROM roles WHERE name = 'studio_designer';

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-000000000008', 'c6060000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-000000000008', 'c6060000-0000-4000-8000-0000000000a2', 'member', 'active', NOW());

-- Each employer prices her. Stamp Second has no owner in this fixture, so its row
-- carries the fixture's own created_by; what matters is that neither number is hers.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES
  ('c6060000-0000-4000-8000-0000000000a1', 'c6060000-0000-4000-8000-000000000008', 20000,
   CURRENT_DATE - 30, 'c6060000-0000-4000-8000-000000000001'),
  ('c6060000-0000-4000-8000-0000000000a2', 'c6060000-0000-4000-8000-000000000008', 21000,
   CURRENT_DATE - 30, 'c6060000-0000-4000-8000-000000000001');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000e7', 'Stamp Hire Legacy House',
        'c6060000-0000-4000-8000-000000000008', 'c6060000-0000-4000-8000-000000000001', NULL);

DO $$
DECLARE
  v_workspace uuid;
  v_pricing   uuid;
  v_rate      integer;
  v_source    text;
  v_state     text;
  v_got       uuid;
  v_rows      integer;
BEGIN
  SELECT organization_id INTO v_workspace
  FROM organization_members
  WHERE user_id = 'c6060000-0000-4000-8000-000000000008' AND role = 'owner';
  ASSERT v_workspace IS NOT NULL,
    'FAIL l0 (precondition): 00295 must have provisioned a workspace she OWNS — '
    'that is the ordinary consequence of a designer grant that precedes the first '
    'seat, and it is the studio this case is about';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e7')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL l1 (precondition): two employer seats ⇒ HT-3-b''s employer tier is '
    'ambiguous ⇒ ''none''; got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000008');

  -- She prices HERSELF in her own workspace. Permitted, and the precondition of
  -- the whole finding: studio_member_rates_admin_insert asks only for
  -- is_org_admin_or_owner(studio_id), and 00295 made her the owner.
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'c6060000-0000-4000-8000-000000000008', 99900, CURRENT_DATE - 30,
          'c6060000-0000-4000-8000-000000000008');

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000b7', 'c6060000-0000-4000-8000-0000000000e7',
          'c6060000-0000-4000-8000-000000000008', NOW() - INTERVAL '5 hours', 90, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b7';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL l2 (precondition): her first hour must price ''none'' (HT-3-a step 3); '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- THE FINDING: stamping the workspace she owns.
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e7', v_workspace) INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;

  ASSERT v_state = '42501',
    'FAIL l3 (W2-R3-02, THE MAJOR): the member being priced must not be able to '
    'name a studio whose rate card she writes. Measured before the fix: she '
    'stamped her own workspace and her next hour came back 99900 / studio_member '
    'instead of either employer''s rate, she read her colleague''s private note and '
    'UPDATEd his hour, and no employer could see the project at all — so HT-3-c '
    'arm (a)''s mitigation ("the composer and the settings page are where a '
    'suspicious studio_member_rates row is seen") could not reach it either. '
    'HT-3-b: a member can only push the outcome toward ''none'', never toward a '
    'number she set; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  -- THE REPAIR SHE IS STILL OWED: a studio that EMPLOYS her.
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e7', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000b8', 'c6060000-0000-4000-8000-0000000000e7',
          'c6060000-0000-4000-8000-000000000008', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b8';
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL l4: and the repair she IS owed must still work — a studio that employs '
    'her, where her seat is neither owner nor admin (HT-3-a''s ''none'' is repaired, '
    'not made permanent); got ' || COALESCE(v_got::text, 'NULL');
  ASSERT v_rate = 20000 AND v_source = 'studio_member',
    'FAIL l5: after the repair her hour must price at the EMPLOYER''S number, not '
    'at the 99900 she wrote for herself; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000e7';
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 2,
    'FAIL l6: and the employer whose client it was must now read the project''s '
    'hours (HT-10''s owner read, reachable); rows = ' || v_rows;

  RAISE NOTICE 'stamp_project_pricing_studio: case (l) passed — the subject cannot price herself.';
END
$$;

-- ─── (j) shape and grants ──────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')),
    'FAIL j1: the stamp must be SECURITY DEFINER — as INVOKER it meets '
    'set_project_studio_id''s authenticated arm and always raises';
  ASSERT (SELECT proconfig::text LIKE '%search_path%' FROM pg_proc
           WHERE oid = to_regprocedure('public.stamp_project_pricing_studio(uuid,uuid)')),
    'FAIL j2: a DEFINER function pins search_path (§0.16)';
  ASSERT NOT has_function_privilege('anon',
    'public.stamp_project_pricing_studio(uuid,uuid)', 'EXECUTE'),
    'FAIL j3: anon must not execute it';
  ASSERT has_function_privilege('authenticated',
    'public.stamp_project_pricing_studio(uuid,uuid)', 'EXECUTE'),
    'FAIL j4: authenticated must execute it, or the repair is unreachable from a '
    'portal';

  RAISE NOTICE 'stamp_project_pricing_studio: case (j) passed.';
END
$$;

ROLLBACK;
