-- ═══════════════════════════════════════════════════════════════════════════
-- 00620 — HT-3-g(2): the one-off legacy stamp, and the tier rule it applies
--
-- HT-3-g (RULED BY KODY 2026-09-12) deletes every read-time derivation, so a
-- project whose studio_id is NULL prices 'none' (HT-26's "rate pending") for
-- everyone. Migration 00620 is what keeps that from being the permanent state of
-- the legacy book: ONCE, at ship, it applies HT-3-b's tier rule to every
-- projects row with studio_id IS NULL — unambiguous rows get their studio,
-- ambiguous rows stay NULL.
--
-- The migration cannot be re-run inside a test (it has already run at replay, and
-- its statement is bounded `WHERE studio_id IS NULL`), so this file measures THE
-- RULE IT APPLIES, through the same shared body the migration calls —
-- public.designer_tier_pricing_studio — plus the migration's own statement run
-- verbatim over a fixture the test creates. Five shapes:
--   (a) ONE EMPLOYER        → that employer, tier 'employer'
--   (b) TWO EMPLOYERS       → NULL, tier 'none' (ambiguity is an answer, HT-3-b)
--   (c) OWNED ONLY, one     → that studio, tier 'owned'
--   (d) NOTHING             → NULL, tier 'none'
--   (e) THE HONEST PRINCIPAL of the HT-3-f(2) COST NOTE (W2-R10-03): she owns her
--       studio, holds no employer seat, and her own ASSISTANT opened her legacy
--       project. HT-3-f(2) — now DISSOLVED — would have refused her the owned tier
--       because created_by is not hers, and HT-3-g(3) refuses her the stamp too, so
--       under HT-3-f(2) this row would price 'none' FOR EVER with no act available
--       to anybody. It is the reason the shared tier body deliberately carries no
--       project-authorship test, and (e) is the leg that proves it: after the
--       migration's own statement she prices from her own studio.
--   (f) IDEMPOTENCE and P-4: a second run of the statement writes nothing, and no
--       time entry is touched in either run.
--   (g) the ambiguous shapes are STILL NULL after the live migration ran, which is
--       the end-state form of the migration's own postcondition (a).
--   (h) W2-R12-01, THE ATTRITION SHAPE and its controls: a designer who has LEFT her
--       employer before the ship owns one workspace, so the tier rule answers it —
--       and the project her FORMER EMPLOYER'S ASSISTANT opened is left NULL anyway,
--       because 00620's owned tier is keyed on the AUTHOR's own studio standing
--       (public.project_author_books_elsewhere). Her hour there prices 'none' with her
--       own 99900 sitting in the workspace, so a 'none' is the key and nothing else;
--       the employer cannot repair it either (HT-3-g cost note (ii)), which is the
--       cost the key buys. TWO CONTROLS IN THE SAME FIXTURE: the same designer's
--       SELF-OPENED legacy project IS stamped to her workspace (HT-3-f(3)'s recorded
--       outcome, aj6 — asserted as PASSING and labelled), and shapes (c) and (e) above
--       are the honest shapes the key must not touch.
--   (i) and the EMPLOYER tier is NOT keyed on the author at all: a project opened by
--       an outsider who holds a seat in another studio is still stamped to the one
--       studio that employs its designer, because a single employer seat IS the book
--       the project belongs to, whoever opened it.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/legacy_project_studio_stamp_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6200000-0000-4000-8000-000000000001', 'l620-one-employer@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000002', 'l620-two-employers@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000003', 'l620-owned-only@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000004', 'l620-seatless@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000005', 'l620-principal@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000006', 'l620-assistant@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000007', 'l620-employer-owner@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- (h) W2-R12-01's attrition shape: the departed hire, the former employer's
  -- assistant who OPENED her client work, that employer's owner, and (i)'s hired
  -- designer plus the outside author of her project.
  ('c6200000-0000-4000-8000-000000000008', 'l620-departed-hire@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000009', 'l620-former-assistant@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-00000000000a', 'l620-former-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-00000000000b', 'l620-hired-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-00000000000c', 'l620-outside-author@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

UPDATE public.profiles SET full_name = 'L620 One Employer'   WHERE id = 'c6200000-0000-4000-8000-000000000001';
UPDATE public.profiles SET full_name = 'L620 Two Employers'  WHERE id = 'c6200000-0000-4000-8000-000000000002';
UPDATE public.profiles SET full_name = 'L620 Owned Only'     WHERE id = 'c6200000-0000-4000-8000-000000000003';
UPDATE public.profiles SET full_name = 'L620 Seatless'       WHERE id = 'c6200000-0000-4000-8000-000000000004';
UPDATE public.profiles SET full_name = 'L620 Principal'      WHERE id = 'c6200000-0000-4000-8000-000000000005';
UPDATE public.profiles SET full_name = 'L620 Assistant'      WHERE id = 'c6200000-0000-4000-8000-000000000006';
UPDATE public.profiles SET full_name = 'L620 Employer Owner' WHERE id = 'c6200000-0000-4000-8000-000000000007';
UPDATE public.profiles SET full_name = 'L620 Departed Hire'  WHERE id = 'c6200000-0000-4000-8000-000000000008';
UPDATE public.profiles SET full_name = 'L620 Former Assistant' WHERE id = 'c6200000-0000-4000-8000-000000000009';
UPDATE public.profiles SET full_name = 'L620 Former Owner'   WHERE id = 'c6200000-0000-4000-8000-00000000000a';
UPDATE public.profiles SET full_name = 'L620 Hired Designer' WHERE id = 'c6200000-0000-4000-8000-00000000000b';
UPDATE public.profiles SET full_name = 'L620 Outside Author' WHERE id = 'c6200000-0000-4000-8000-00000000000c';

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c6200000-0000-4000-8000-0000000000a1', 'design_studio', 'L620 Employer One',  'l620-employer-one-test',  'active'),
  ('c6200000-0000-4000-8000-0000000000a2', 'design_studio', 'L620 Employer Two',  'l620-employer-two-test',  'active'),
  ('c6200000-0000-4000-8000-0000000000a3', 'design_studio', 'L620 Owned Studio',  'l620-owned-studio-test',  'active'),
  ('c6200000-0000-4000-8000-0000000000a4', 'design_studio', 'L620 Principal Studio', 'l620-principal-studio-test', 'active'),
  -- (h)/(i): the departed hire's own 00295 workspace, the employer she left (which is
  -- also (i)'s employer), and the unrelated studio (i)'s author is seated in.
  ('c6200000-0000-4000-8000-0000000000a5', 'design_studio', 'L620 Departed WS',    'l620-departed-ws-test',    'active'),
  ('c6200000-0000-4000-8000-0000000000a6', 'design_studio', 'L620 Former Employer','l620-former-employer-test','active'),
  ('c6200000-0000-4000-8000-0000000000a7', 'design_studio', 'L620 Outside Studio', 'l620-outside-studio-test', 'active');

-- Every project is inserted BEFORE any seat exists, so 00563's one-candidate
-- discovery and 00602/00603's INSERT stamp both find nothing and the column stays
-- NULL. That is the only way the legacy shape arises, and it is the shape 00620 is
-- for.
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6200000-0000-4000-8000-0000000000e1', 'L620 One-Employer House',
   'c6200000-0000-4000-8000-000000000001', 'c6200000-0000-4000-8000-000000000001', NULL),
  ('c6200000-0000-4000-8000-0000000000e2', 'L620 Two-Employer House',
   'c6200000-0000-4000-8000-000000000002', 'c6200000-0000-4000-8000-000000000002', NULL),
  ('c6200000-0000-4000-8000-0000000000e3', 'L620 Owned-Only House',
   'c6200000-0000-4000-8000-000000000003', 'c6200000-0000-4000-8000-000000000003', NULL),
  ('c6200000-0000-4000-8000-0000000000e4', 'L620 Seatless House',
   'c6200000-0000-4000-8000-000000000004', 'c6200000-0000-4000-8000-000000000004', NULL),
  -- (e) the honest principal's project: her ASSISTANT is its author.
  ('c6200000-0000-4000-8000-0000000000e5', 'L620 Assistant-Opened House',
   'c6200000-0000-4000-8000-000000000005', 'c6200000-0000-4000-8000-000000000006', NULL),
  -- (h) the attrition shape: the departed hire leads it, her FORMER EMPLOYER'S
  -- assistant opened it. Her employer seat is simply absent — at the ONE instant this
  -- migration runs, a seat she deleted (probe C) and a seat an admin set
  -- status = 'removed' (probe D2) are the same fixture, which is exactly why the
  -- taking needed no second party.
  ('c6200000-0000-4000-8000-0000000000e6', 'L620 Former Employer Client House',
   'c6200000-0000-4000-8000-000000000008', 'c6200000-0000-4000-8000-000000000009', NULL),
  -- (h) CONTROL: the same designer's SELF-OPENED legacy project. HT-3-f(3)'s recorded
  -- outcome (aj6) — the key asks about the AUTHOR, and here the author is her.
  ('c6200000-0000-4000-8000-0000000000e7', 'L620 Her Own House',
   'c6200000-0000-4000-8000-000000000008', 'c6200000-0000-4000-8000-000000000008', NULL),
  -- (i) the employer tier: an OUTSIDE author, seated in a studio of his own.
  ('c6200000-0000-4000-8000-0000000000e8', 'L620 Outside-Opened House',
   'c6200000-0000-4000-8000-00000000000b', 'c6200000-0000-4000-8000-00000000000c', NULL);

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  -- (a) exactly one employer seat
  ('c6200000-0000-4000-8000-0000000000c1', 'c6200000-0000-4000-8000-000000000007',
   'c6200000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000c2', 'c6200000-0000-4000-8000-000000000001',
   'c6200000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  -- (b) two employer seats
  ('c6200000-0000-4000-8000-0000000000c3', 'c6200000-0000-4000-8000-000000000002',
   'c6200000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000c4', 'c6200000-0000-4000-8000-000000000002',
   'c6200000-0000-4000-8000-0000000000a2', 'admin',  'active', NOW()),
  -- (c) owned only, exactly one
  ('c6200000-0000-4000-8000-0000000000c5', 'c6200000-0000-4000-8000-000000000003',
   'c6200000-0000-4000-8000-0000000000a3', 'owner',  'active', NOW()),
  -- (e) the principal owns her studio; her assistant is its admin
  ('c6200000-0000-4000-8000-0000000000c6', 'c6200000-0000-4000-8000-000000000005',
   'c6200000-0000-4000-8000-0000000000a4', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000c7', 'c6200000-0000-4000-8000-000000000006',
   'c6200000-0000-4000-8000-0000000000a4', 'admin',  'active', NOW()),
  -- (h) the departed hire owns her workspace and holds NO employer seat anywhere,
  -- which is the whole of the manoeuvre's state at this instant.
  ('c6200000-0000-4000-8000-0000000000c8', 'c6200000-0000-4000-8000-000000000008',
   'c6200000-0000-4000-8000-0000000000a5', 'owner',  'active', NOW()),
  -- the former employer she left: its owner, and the assistant who opened her project.
  ('c6200000-0000-4000-8000-0000000000c9', 'c6200000-0000-4000-8000-00000000000a',
   'c6200000-0000-4000-8000-0000000000a6', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000ca', 'c6200000-0000-4000-8000-000000000009',
   'c6200000-0000-4000-8000-0000000000a6', 'member', 'active', NOW()),
  -- (i) the hired designer's ONE employer seat, and her project's outside author
  -- seated in a studio of his own.
  ('c6200000-0000-4000-8000-0000000000cb', 'c6200000-0000-4000-8000-00000000000b',
   'c6200000-0000-4000-8000-0000000000a6', 'member', 'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000cc', 'c6200000-0000-4000-8000-00000000000c',
   'c6200000-0000-4000-8000-0000000000a7', 'member', 'active', NOW());
-- (d) the seatless designer gets no row at all.

-- Granted AFTER the seats so 00295's fc_provision_studio_on_designer takes its
-- early exit (it provisions a workspace only for a designer who holds NO membership
-- row at all), and required by 00563's owner-executed arm when the stamp writes the
-- column. The SEATLESS designer of shape (d) is deliberately left OUT of this grant:
-- given the designer role she would be provisioned a one-person workspace and stop
-- being seatless, which is the shape (d) exists to measure.
INSERT INTO public.user_roles (user_id, role_id)
SELECT unnest(ARRAY['c6200000-0000-4000-8000-000000000001'::uuid,
                    'c6200000-0000-4000-8000-000000000002'::uuid,
                    'c6200000-0000-4000-8000-000000000003'::uuid,
                    'c6200000-0000-4000-8000-000000000005'::uuid,
                    'c6200000-0000-4000-8000-000000000008'::uuid,
                    'c6200000-0000-4000-8000-00000000000b'::uuid]),
       id FROM public.roles WHERE name = 'studio_designer'
ON CONFLICT DO NOTHING;

-- Rate cards: each studio's own number for the designer it holds, and the
-- principal's own card in the studio she OWNS (HT-3-e(2)'s owner exemption prices
-- it, which is what makes leg (e) a measurement of the tier rule alone).
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES
  ('c6200000-0000-4000-8000-0000000000a1', 'c6200000-0000-4000-8000-000000000001', 24000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000007'),
  ('c6200000-0000-4000-8000-0000000000a3', 'c6200000-0000-4000-8000-000000000003', 30000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000003'),
  ('c6200000-0000-4000-8000-0000000000a4', 'c6200000-0000-4000-8000-000000000005', 31000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000005'),
  -- (h) the departed hire's own 99900 in the workspace she OWNS: HT-3-e(2)'s owner
  -- exemption prices it the moment an owned tier is reached, so a number that is
  -- never 99900 on her former employer's project is W2-R12-01's key and nothing else.
  ('c6200000-0000-4000-8000-0000000000a5', 'c6200000-0000-4000-8000-000000000008', 99900,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000008'),
  -- (i) the employer's arm's-length card for the designer it employs.
  ('c6200000-0000-4000-8000-0000000000a6', 'c6200000-0000-4000-8000-00000000000b', 26000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-00000000000a');

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

-- ─── (a)-(e) the RULE, asked exactly as 00620 asks it ──────────────────────
DO $$
DECLARE
  v_studio uuid;
  v_tier   text;
BEGIN
  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000001') AS answer;
  ASSERT v_studio = 'c6200000-0000-4000-8000-0000000000a1' AND v_tier = 'employer',
    'FAIL a1 (HT-3-b, ONE EMPLOYER): exactly one employer seat answers that employer, '
    'and the tier is reported so 00602''s INSERT stamp can override a studio 00563 '
    'merely DERIVED (W1-R11-02) while 00620 simply writes it; got '
    || COALESCE(v_studio::text, 'NULL') || ' / ' || COALESCE(v_tier, 'NULL');

  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000002') AS answer;
  ASSERT v_studio IS NULL AND v_tier = 'none',
    'FAIL b1 (HT-3-b, TWO EMPLOYERS): ambiguity is an ANSWER, not a contest — every '
    'key that ever chose between two employer candidates was measured manufacturable '
    'with one signup or one consent-free INSERT (W1-R4-01/R5-02/R6-01/R7-01). A studio '
    'here means a ranking key came back; got ' || COALESCE(v_studio::text, 'NULL')
    || ' / ' || COALESCE(v_tier, 'NULL');

  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000003') AS answer;
  ASSERT v_studio = 'c6200000-0000-4000-8000-0000000000a3' AND v_tier = 'owned',
    'FAIL c1 (HT-3-b, OWNED ONLY): with no employer seat at all, one owned studio '
    'answers — and the tier is ''owned'' so the INSERT stamp fills only a NULL column '
    'with it; got ' || COALESCE(v_studio::text, 'NULL') || ' / ' || COALESCE(v_tier, 'NULL');

  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000004') AS answer;
  ASSERT v_studio IS NULL AND v_tier = 'none',
    'FAIL d1 (HT-3-b, NOTHING): a designer with no active non-guest seat anywhere '
    'answers nothing, and her legacy projects stay NULL — ''none'' until a studio '
    'seats her and stamps them (HT-3-g(3)); got ' || COALESCE(v_studio::text, 'NULL')
    || ' / ' || COALESCE(v_tier, 'NULL');

  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000005') AS answer;
  ASSERT v_studio = 'c6200000-0000-4000-8000-0000000000a4' AND v_tier = 'owned',
    'FAIL e1 (HT-3-f(2) DISSOLVED, and THE REASON): the honest principal of the '
    'HT-3-f(2) COST NOTE (W2-R10-03) answers her OWN studio even though her ASSISTANT '
    'opened the project. HT-3-f(2) would have refused the owned tier here on '
    'created_by <> designer_id — and HT-3-g(3) refuses her the stamp — so carrying it '
    'into this body leaves her legacy book at ''none'' for ever with no act available '
    'to anybody. The rule is asked about the DESIGNER''s seats and nothing else; got '
    || COALESCE(v_studio::text, 'NULL') || ' / ' || COALESCE(v_tier, 'NULL');

  -- The rule is asked about HER SEATS, not about the project: a NULL designer is
  -- the defensive leg 00620's WHERE clause already excludes.
  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio(NULL) AS answer;
  ASSERT v_studio IS NULL AND v_tier = 'none',
    'FAIL f1: a NULL designer answers ''none'' rather than raising — 00620 excludes '
    'those rows in its WHERE clause, and a raise here would abort the whole ship '
    'migration over a row it never meant to touch';

  RAISE NOTICE 'legacy_project_studio_stamp: the tier rule answers all five shapes.';
END
$$;

-- ─── 00620's own statement, verbatim, over this fixture ─────────────────────
DO $$
DECLARE
  v_stamped        integer := 0;
  v_again          integer := 0;
  v_entries_before bigint;
  v_entries_after  bigint;
  v_rate_before    bigint;
  v_rate_after     bigint;
  v_rate           integer;
  v_source         text;
BEGIN
  -- an hour BEFORE the stamp, on the principal's project: 'none' (HT-3-g(1)).
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000005');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b1', 'c6200000-0000-4000-8000-0000000000e5',
          'c6200000-0000-4000-8000-000000000005', NOW() - INTERVAL '3 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b1';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL g0 (HT-3-g(1)): before the stamp her own hour on her own project prices '
    '''rate pending'' — which is what 00620 exists to end for the legacy book; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_before, v_rate_before
  FROM public.project_time_entries;

  -- 00620's statement, copied rather than paraphrased — W2-R12-01's key included,
  -- because a copy without it measures a statement the migration no longer runs.
  WITH tiered AS (
    SELECT project.id         AS project_id,
           project.created_by AS author_id,
           answer.studio_id,
           answer.tier
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
  )
  UPDATE public.projects AS project
     SET studio_id = tiered.studio_id
    FROM tiered
   WHERE project.id = tiered.project_id
     AND tiered.studio_id IS NOT NULL
     AND project.studio_id IS NULL
     AND (
       tiered.tier = 'employer'
       OR NOT public.project_author_books_elsewhere(tiered.author_id, tiered.studio_id)
     );
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_after, v_rate_after
  FROM public.project_time_entries;

  ASSERT v_stamped >= 5,
    'FAIL g1: the statement must have stamped at least this file''s five stampable '
    'fixtures (one employer, owned only, the principal, the departed hire''s own '
    'SELF-OPENED project, and the employer-tier project an outsider opened); stamped '
    || v_stamped;
  ASSERT v_entries_after = v_entries_before AND v_rate_after = v_rate_before,
    'FAIL g2 (P-4): 00620''s statement writes projects.studio_id and NOTHING else — '
    'no time entry is added, removed or re-rated. ' || v_entries_before || ' rows '
    'summing ' || v_rate_before || ' before, ' || v_entries_after || ' summing '
    || v_rate_after || ' after';

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e1')
         = 'c6200000-0000-4000-8000-0000000000a1',
    'FAIL g3 (ONE EMPLOYER): her one employer now owns the hours';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e3')
         = 'c6200000-0000-4000-8000-0000000000a3',
    'FAIL g4 (OWNED ONLY): the sole proprietor''s studio now owns hers';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e5')
         = 'c6200000-0000-4000-8000-0000000000a4',
    'FAIL g5 (THE HONEST PRINCIPAL): and the assistant-opened project is hers — the '
    'single most important row in this file, because HT-3-g(3) gives her no act of '
    'her own and HT-3-f(2) would have left it NULL for ever (W2-R10-03)';
  ASSERT (SELECT studio_id IS NULL FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e2')
     AND (SELECT studio_id IS NULL FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e4'),
    'FAIL g6 (AMBIGUITY IS LEFT ALONE): two employers and no seat at all both stay '
    'NULL — they price ''none'' until an owner/admin of a studio that EMPLOYS the '
    'designer stamps them, which is the cost HT-3-g accepts';

  -- ── (h) W2-R12-01: the attrition shape, and its two controls ──────────────
  ASSERT (SELECT studio_id IS NULL FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e6'),
    'FAIL g10 (W2-R12-01 — THE WHOLE POINT): a designer who has LEFT her employer '
    'before the ship owns one workspace, so HT-3-b''s tier rule ANSWERS it (g10a '
    'below proves that) — and her former employer''s client work, opened by that '
    'employer''s own assistant, must NOT be stamped to her workspace. 00606''s bound '
    '(b) makes the column final and HT-3-g(3) gives the employer no arm to repair it, '
    'so a studio_id here is a taking no party can undo, on a project she did not '
    'create, in ONE account with no second party';
  ASSERT (SELECT answer.studio_id = 'c6200000-0000-4000-8000-0000000000a5'
                 AND answer.tier = 'owned'
            FROM public.designer_tier_pricing_studio(
                   'c6200000-0000-4000-8000-000000000008') AS answer),
    'FAIL g10a (the rule still answers): g10 must be the AUTHOR KEY leaving that row, '
    'not an ambiguous tier. If the tier rule stops answering her workspace this '
    'fixture has drifted and g10 is measuring nothing';
  ASSERT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000009',
           'c6200000-0000-4000-8000-0000000000a5'),
    'FAIL g10b: the key itself — her former employer''s assistant holds an active, '
    'non-guest seat in an active design_studio OTHER than her workspace, so the '
    'project visibly belongs to that studio''s book';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e7')
         = 'c6200000-0000-4000-8000-0000000000a5',
    'FAIL g11 (CONTROL, and HT-3-f(3)''s RECORDED OUTCOME — asserted as PASSING): '
    'the SAME designer''s SELF-OPENED legacy project IS stamped to her own workspace. '
    'The key asks about the AUTHOR, and here the author is her, so this is the '
    'outcome rulings.md already records at aj6 (a project that predates the ship is '
    'handed to the studio she owns when her tier answers one) — not a defect, and the '
    'exact line the key draws';
  ASSERT NOT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000008',
           'c6200000-0000-4000-8000-0000000000a5')
     AND NOT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000006',
           'c6200000-0000-4000-8000-0000000000a4')
     AND NOT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000003',
           'c6200000-0000-4000-8000-0000000000a3'),
    'FAIL g11a (THE HONEST SHAPES THE KEY MUST NOT TOUCH): her own hand on her own '
    'workspace, the HT-3-f(2) COST NOTE principal''s ASSISTANT inside her own studio '
    '(g5 above), and the sole proprietor''s own hand (g4) all answer FALSE. A TRUE '
    'here is the key over-reaching into the two shapes 00620 exists for';

  -- ── (i) the EMPLOYER tier is not keyed on the author at all ───────────────
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e8')
         = 'c6200000-0000-4000-8000-0000000000a6',
    'FAIL g12 (THE EMPLOYER TIER IS UNKEYED): a project opened by an OUTSIDER who '
    'holds a seat in a studio of his own is still stamped to the ONE studio that '
    'employs its designer — a single employer seat IS the book the project belongs '
    'to, whoever opened it. Keying this tier on the author would re-open HT-3-g cost '
    'note (i) across the honest hire as well';
  ASSERT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-00000000000c',
           'c6200000-0000-4000-8000-0000000000a6'),
    'FAIL g12a: and the predicate is TRUE of that author, so g12 measures the TIER '
    'BRANCH rather than a predicate that happens to answer false';

  -- IDEMPOTENCE: the same statement again writes nothing.
  WITH tiered AS (
    SELECT project.id         AS project_id,
           project.created_by AS author_id,
           answer.studio_id,
           answer.tier
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
  )
  UPDATE public.projects AS project
     SET studio_id = tiered.studio_id
    FROM tiered
   WHERE project.id = tiered.project_id
     AND tiered.studio_id IS NOT NULL
     AND project.studio_id IS NULL
     AND (
       tiered.tier = 'employer'
       OR NOT public.project_author_books_elsewhere(tiered.author_id, tiered.studio_id)
     );
  GET DIAGNOSTICS v_again = ROW_COUNT;
  ASSERT v_again = 0,
    'FAIL g7 (IDEMPOTENCE): a second run writes NOTHING — the `WHERE studio_id IS '
    'NULL` predicate is the whole of it, and a non-zero count here would mean the '
    'migration re-points columns on replay (P-4); wrote ' || v_again;

  -- AND THE MONEY: her next hour prices from the studio the stamp wrote, while the
  -- hour logged before it keeps its 'none'.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000005');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b2', 'c6200000-0000-4000-8000-0000000000e5',
          'c6200000-0000-4000-8000-000000000005', NOW() - INTERVAL '1 hour', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_again
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b2';
  ASSERT v_rate = 31000 AND v_source = 'studio_member' AND v_again = 62000,
    'FAIL g8 (THE HONEST PRINCIPAL — the money): after the one-off stamp her own '
    'studio''s 31000 prices her hour (62000 for 120 min). Her own card prices it '
    'because HT-3-e(2)''s exemption is OWNERSHIP and she owns that studio — HT-3-c''s '
    'sole proprietor, unchanged; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_again::text, 'NULL');
  ASSERT (SELECT hourly_rate_cents IS NULL AND rate_source = 'none'
            FROM public.project_time_entries
           WHERE id = 'c6200000-0000-4000-8000-0000000000b1'),
    'FAIL g9 (P-4): and the hour logged before the stamp keeps its ''none'' — no hour '
    'is re-rated in either direction';

  RAISE NOTICE 'legacy_project_studio_stamp: 00620''s statement stamps the unambiguous shapes, leaves the ambiguous ones, is idempotent and re-rates nothing.';
END
$$;

-- ─── (h) THE MONEY, and what the key COSTS, through RLS ─────────────────────
-- The statement above has run. Her 99900 is in the workspace she OWNS, so HT-3-e(2)'s
-- owner exemption prices it the moment an owned tier is reached — which makes the
-- number on each of her two hours the whole measurement: 'none' on her former
-- employer's project, 99900 on the one she opened herself.
DO $$
DECLARE
  v_rate   integer;
  v_source text;
  v_amount integer;
  v_state  text;
  v_got    uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000008');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b3', 'c6200000-0000-4000-8000-0000000000e6',
          'c6200000-0000-4000-8000-000000000008', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry'),
         ('c6200000-0000-4000-8000-0000000000b4', 'c6200000-0000-4000-8000-0000000000e7',
          'c6200000-0000-4000-8000-000000000008', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b3';
  ASSERT v_rate IS NULL AND v_source = 'none' AND v_amount IS NULL,
    'FAIL h10 (W2-R12-01 — THE MONEY): her hour on her FORMER EMPLOYER''S project '
    'prices ''none'' (HT-26''s "rate pending"), not the 99900 she wrote for herself. '
    'Before the key this hour came back 99900 / studio_member / 199800 against the '
    'employer''s own 26000, in ONE account with no second party; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b4';
  ASSERT v_rate = 99900 AND v_source = 'studio_member' AND v_amount = 199800,
    'FAIL h11 (CONTROL — HT-3-f(3)''s RECORDED OUTCOME, asserted as PASSING): on the '
    'project she opened HERSELF her own workspace''s 99900 does price her hour. That '
    'is rulings.md''s aj6 and HT-3-c''s sole proprietor, and it is the line the key '
    'draws: the AUTHOR, not the designer; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');

  -- WHAT THE KEY COSTS: nobody can stamp the row it left. HT-3-g(3)'s seat test is a
  -- LIVE-seat test (cost note (ii)), and she holds no seat at her former employer.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6200000-0000-4000-8000-0000000000e6',
      'c6200000-0000-4000-8000-0000000000a6') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL h12 (THE FIFTH COST NOTE, measured): the former employer''s OWNER cannot '
    'repair the row either — HT-3-g(3) asks for a LIVE non-guest seat for the '
    'designer in the studio named, and she has left. So the project prices ''none'' '
    'until some studio seats her. That is the cost this key buys, stated here rather '
    'than discovered later; got ' || COALESCE(v_state, 'NO RAISE (returned '
    || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e6'),
    'FAIL h13: and the refusal wrote nothing';

  RAISE NOTICE 'legacy_project_studio_stamp: W2-R12-01 — the departed hire''s former employer keeps its book, her own project is still hers, and the cost is a ''none'' nobody can stamp.';
END
$$;

-- ─── (g) the LIVE migration's end state, re-asserted here ──────────────────
-- 00620 ran at replay, before this file's fixtures existed. Its own postcondition
-- asserted the end state then; this leg asserts it again over whatever rows the
-- seeds left, so a seed change that re-introduces an unstamped-but-answerable
-- project is caught by the test suite as well as by the migration.
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.projects AS project
  CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
  WHERE project.studio_id IS NULL
    AND project.designer_id IS NOT NULL
    AND answer.studio_id IS NOT NULL
    AND (
      answer.tier = 'employer'
      OR NOT public.project_author_books_elsewhere(project.created_by, answer.studio_id)
    );
  ASSERT v_left = 0,
    'FAIL h1 (00620''s end state): no project the migration was WILLING to stamp may '
    'be left with studio_id NULL — one left behind prices ''none'' for ever and '
    'HT-3-g(3) gives its own studio no act. The predicate is the migration''s own, '
    'W2-R12-01''s key included: a row the key deliberately left is not a row the '
    'statement failed to reach. Count = ' || v_left;

  ASSERT to_regprocedure('public.owned_tier_prices_project(uuid,uuid)') IS NULL,
    'FAIL h2 (HT-3-f(2) DISSOLVED): the project-authorship gate must not exist — '
    'resurrected as a filter on the one-off stamp it leaves the honest principal of '
    'W2-R10-03 at ''none'' for ever. W2-R12-01''s key is a DIFFERENT question: not '
    '"did the designer open it" but "does its AUTHOR stand in someone else''s '
    'studio", which is what keeps that principal''s assistant-opened project hers';

  ASSERT to_regprocedure('public.project_author_books_elsewhere(uuid,uuid)') IS NOT NULL,
    'FAIL h3 (W2-R12-01): the owned tier''s key must exist on the live stack — the '
    'migration''s own statement calls it, and without it the departed hire is handed '
    'her former employer''s legacy book finally and irreparably';
  ASSERT NOT COALESCE(has_function_privilege('authenticated',
           'public.project_author_books_elsewhere(uuid,uuid)', 'EXECUTE'), false),
    'FAIL h4 (HT-3-g(1)): and no authenticated caller may hold EXECUTE on it. It is a '
    'migration-time key; reachable at read time it is a derivation, and the AUTHOR''s '
    'seats move as freely as the designer''s';

  RAISE NOTICE 'legacy_project_studio_stamp: the live migration left nothing answerable unstamped.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All legacy_project_studio_stamp assertions passed.'; END $$;

ROLLBACK;
