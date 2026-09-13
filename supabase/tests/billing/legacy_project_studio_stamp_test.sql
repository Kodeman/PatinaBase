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
--   (j) HT-3-g AMENDED (a) — THE ROSTER KEY, the round-13 amendment's own question, and
--       the first one in this file that is asked about the PROJECT rather than about a
--       person: a project whose live project_team_members roster carries somebody who
--       answers to a studio the designer does NOT own is left NULL, while the Leah
--       shape — a sole proprietor whose own assistant opened her project and sits on
--       its roster — is stamped. Both keys must pass for an owned-tier answer, and
--       (j-i) is measured to be a row the author key alone would have stamped.
--   (k) W2-R13-01 FORM S and (l) FORM H — the two residuals the keys do NOT reach,
--       asserted as PASSING and loudly labelled, each followed by the remedy of HT-3-g
--       AMENDED (b) measured leg by leg: the employer's own owner is REFUSED the
--       reassignment that reaches the arm (reassign_project_lead is pinned to the
--       project's current studio); ROUND 14 adds the one statement HT-3-g(b) CORRECTED
--       costs the recovery — while she holds the courtesy seat the taker had to give
--       her in the workspace being replaced, that workspace EMPLOYS her and the
--       overwrite is refused (k4b / l8b), so she drops the seat (k4d / l8c) — and then
--       her one stamp overwrites the workspace, audits both studios under the DISPLACED
--       studio's organization_id, and the designer's next hour prices from the
--       employer's card again.
--   (m) the remedy arm's own surface, and ROUND 14's MAJOR: refused to a designer who is
--       only an ADMIN of the studio she names, refused to an OWNER who is not the
--       project's lead, and — HT-3-g(b) CORRECTED (orchestrator 2026-09-13, resolving
--       W2-R14-01) — REFUSED to the project's own lead-and-owner while the studio being
--       replaced EMPLOYS her, which is what stops an honest employer's stamped project
--       being re-pointed in one statement. What is left is asserted as PASSING and
--       loudly labelled: she can reach her own studio by LEAVING the employer's seat
--       first, two statements with a seat act in them, which HT-3-g AMENDED (c) grades
--       a residual. m7/m7a are W2-R14-03 — the overwrite's audit row is filed under the
--       DISPLACED studio and its owner reads it through RLS.
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
  ('c6200000-0000-4000-8000-00000000000c', 'l620-outside-author@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- ROUND 13 (HT-3-g AMENDED): W2-R13-01 form S's seatless author; the client every
  -- reassign_project_lead needs a canonical relationship to; form H's hire, the
  -- assistant whose seat she removes and her employer's owner; the roster key's three
  -- shapes; and case (m)'s designer who owns one studio and merely administers another.
  ('c6200000-0000-4000-8000-00000000000d', 'l620-seatless-author@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-00000000000e', 'l620-remedy-designer@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-00000000000f', 'l620-remedy-client@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000010', 'l620-formh-hire@test.invalid',       '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000011', 'l620-formh-assistant@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000012', 'l620-formh-owner@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000013', 'l620-roster-outsider@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000014', 'l620-leah-assistant@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000015', 'l620-leah@test.invalid',             '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000016', 'l620-roster-principal@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6200000-0000-4000-8000-000000000017', 'l620-foreign-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

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
UPDATE public.profiles SET full_name = 'L620 Seatless Author'  WHERE id = 'c6200000-0000-4000-8000-00000000000d';
UPDATE public.profiles SET full_name = 'L620 Remedy Designer'  WHERE id = 'c6200000-0000-4000-8000-00000000000e';
UPDATE public.profiles SET full_name = 'L620 Remedy Client'    WHERE id = 'c6200000-0000-4000-8000-00000000000f';
UPDATE public.profiles SET full_name = 'L620 Form H Hire'      WHERE id = 'c6200000-0000-4000-8000-000000000010';
UPDATE public.profiles SET full_name = 'L620 Form H Assistant' WHERE id = 'c6200000-0000-4000-8000-000000000011';
UPDATE public.profiles SET full_name = 'L620 Form H Owner'     WHERE id = 'c6200000-0000-4000-8000-000000000012';
UPDATE public.profiles SET full_name = 'L620 Roster Outsider'  WHERE id = 'c6200000-0000-4000-8000-000000000013';
UPDATE public.profiles SET full_name = 'L620 Leah Assistant'   WHERE id = 'c6200000-0000-4000-8000-000000000014';
UPDATE public.profiles SET full_name = 'L620 Leah'             WHERE id = 'c6200000-0000-4000-8000-000000000015';
UPDATE public.profiles SET full_name = 'L620 Roster Principal' WHERE id = 'c6200000-0000-4000-8000-000000000016';
UPDATE public.profiles SET full_name = 'L620 Foreign Owner'    WHERE id = 'c6200000-0000-4000-8000-000000000017';

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
  ('c6200000-0000-4000-8000-0000000000a7', 'design_studio', 'L620 Outside Studio', 'l620-outside-studio-test', 'active'),
  -- ROUND 13 (HT-3-g AMENDED): case (m)'s pair (one she merely administers, one she
  -- OWNS), form H's employer and her own workspace, and the roster key's three studios.
  ('c6200000-0000-4000-8000-0000000000a8', 'design_studio', 'L620 Remedy Admin Studio', 'l620-remedy-admin-studio-test', 'active'),
  ('c6200000-0000-4000-8000-0000000000a9', 'design_studio', 'L620 Form H Employer',     'l620-formh-employer-test',      'active'),
  ('c6200000-0000-4000-8000-0000000000aa', 'design_studio', 'L620 Form H Workspace',    'l620-formh-workspace-test',     'active'),
  ('c6200000-0000-4000-8000-0000000000ab', 'design_studio', 'L620 Roster Studio',       'l620-roster-studio-test',       'active'),
  ('c6200000-0000-4000-8000-0000000000ac', 'design_studio', 'L620 Foreign Studio',      'l620-foreign-studio-test',      'active'),
  ('c6200000-0000-4000-8000-0000000000ad', 'design_studio', 'L620 Leah Studio',         'l620-leah-studio-test',         'active'),
  ('c6200000-0000-4000-8000-0000000000ae', 'design_studio', 'L620 Remedy Owned Studio', 'l620-remedy-owned-studio-test', 'active');

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

-- ROUND 13 (HT-3-g AMENDED) fixtures. Inserted here for the same reason as every
-- project above — BEFORE any seat or designer role exists, so 00563's one-candidate
-- discovery and 00602/00603's INSERT stamp both find nothing and the column stays
-- NULL. Two of them carry a client_id, because reassign_project_lead demands a
-- canonical designer_clients row and the remedy arm is reached through it.
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, client_id)
VALUES
  -- (k) W2-R13-01 FORM S, the narrowest residual: the departed hire leads it, a hand
  -- who holds no seat anywhere opened it (an ex-contractor, a platform hand, an
  -- assistant whose seat somebody closed long ago), and nobody else is on its roster.
  -- Both keys are silent on it, so her ONE statement — leaving her own employer seat —
  -- hands it to the workspace she owns.
  ('c6200000-0000-4000-8000-0000000000e9', 'L620 Form S House',
   'c6200000-0000-4000-8000-000000000008', 'c6200000-0000-4000-8000-00000000000d', NULL,
   'c6200000-0000-4000-8000-00000000000f'),
  -- (j-i) THE ROSTER KEY's own shape: her own hand opened it (so the AUTHOR key is
  -- silent), but a support designer on its roster answers to a studio she does not own.
  ('c6200000-0000-4000-8000-0000000000ea', 'L620 Foreign Roster House',
   'c6200000-0000-4000-8000-000000000016', 'c6200000-0000-4000-8000-000000000016', NULL, NULL),
  -- (j-ii) THE LEAH SHAPE the roster key must not touch: a sole proprietor whose own
  -- assistant opened her project and sits on its roster, seated only in HER studio.
  ('c6200000-0000-4000-8000-0000000000eb', 'L620 Leah House',
   'c6200000-0000-4000-8000-000000000015', 'c6200000-0000-4000-8000-000000000014', NULL, NULL),
  -- (l) W2-R13-01 FORM H: her employer's client work, its own assistant the author AND
  -- on its roster. Both keys read HIS seat, so the statement she makes as an admin —
  -- setting his row status = 'removed' — silences both at once.
  ('c6200000-0000-4000-8000-0000000000ec', 'L620 Form H Client House',
   'c6200000-0000-4000-8000-000000000010', 'c6200000-0000-4000-8000-000000000011', NULL,
   'c6200000-0000-4000-8000-00000000000f'),
  -- (m) the remedy arm's own surface: a project an HONEST studio already names, led by
  -- a designer who did not open it. a6 is written here directly, which is the state
  -- every project created since 00602 is in.
  ('c6200000-0000-4000-8000-0000000000ed', 'L620 Honest Stamped House',
   'c6200000-0000-4000-8000-00000000000e', 'c6200000-0000-4000-8000-00000000000d',
   'c6200000-0000-4000-8000-0000000000a6', NULL);

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
   'c6200000-0000-4000-8000-0000000000a7', 'member', 'active', NOW()),
  -- ── ROUND 13 (HT-3-g AMENDED) ────────────────────────────────────────────
  -- (l) form H: the hire is an ADMIN of her employer (which is what lets her move the
  -- assistant's seat), the assistant is a plain member there, the employer has an
  -- owner, and she OWNS the workspace 00295 provisions for her.
  -- The OWNER row of each studio comes FIRST: guard_org_membership_changes admits an
  -- owner INSERT only into an organization that has no members yet, or from a caller who
  -- already owns it (owner_insert_requires_owner).
  ('c6200000-0000-4000-8000-0000000000cf', 'c6200000-0000-4000-8000-000000000012',
   'c6200000-0000-4000-8000-0000000000a9', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000cd', 'c6200000-0000-4000-8000-000000000010',
   'c6200000-0000-4000-8000-0000000000a9', 'admin',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000ce', 'c6200000-0000-4000-8000-000000000011',
   'c6200000-0000-4000-8000-0000000000a9', 'member', 'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000d6', 'c6200000-0000-4000-8000-000000000010',
   'c6200000-0000-4000-8000-0000000000aa', 'owner',  'active', NOW()),
  -- (j-i) the roster principal owns one studio and holds no employer seat; the
  -- support designer on her project's roster answers to a studio of its own, which
  -- has an owner of its own.
  ('c6200000-0000-4000-8000-0000000000d7', 'c6200000-0000-4000-8000-000000000016',
   'c6200000-0000-4000-8000-0000000000ab', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000d9', 'c6200000-0000-4000-8000-000000000017',
   'c6200000-0000-4000-8000-0000000000ac', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000d8', 'c6200000-0000-4000-8000-000000000013',
   'c6200000-0000-4000-8000-0000000000ac', 'member', 'active', NOW()),
  -- (j-ii) Leah owns her studio; her assistant is its admin and is seated NOWHERE else.
  ('c6200000-0000-4000-8000-0000000000da', 'c6200000-0000-4000-8000-000000000015',
   'c6200000-0000-4000-8000-0000000000ad', 'owner',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000db', 'c6200000-0000-4000-8000-000000000014',
   'c6200000-0000-4000-8000-0000000000ad', 'admin',  'active', NOW()),
  -- (m) the remedy designer ADMINISTERS one studio and OWNS another. The difference
  -- between those two seats is the whole of what the remedy ARM turns on.
  ('c6200000-0000-4000-8000-0000000000dc', 'c6200000-0000-4000-8000-00000000000e',
   'c6200000-0000-4000-8000-0000000000a8', 'admin',  'active', NOW()),
  ('c6200000-0000-4000-8000-0000000000dd', 'c6200000-0000-4000-8000-00000000000e',
   'c6200000-0000-4000-8000-0000000000ae', 'owner',  'active', NOW()),
  -- ROUND 14 (HT-3-g(b) CORRECTED): and she is EMPLOYED by the honest studio a6 that
  -- stamped her project — an active, non-guest `member` seat, the ordinary hire. That
  -- seat is the whole of what the correction's third bound reads, and it is the shape
  -- round 14 measured the one-statement taking on (W2-R14-01). Through round 13 this
  -- fixture gave her no seat in a6 at all, which measured the arm against a FORMER
  -- employer rather than against the employer it was taking from.
  ('c6200000-0000-4000-8000-0000000000de', 'c6200000-0000-4000-8000-00000000000e',
   'c6200000-0000-4000-8000-0000000000a6', 'member', 'active', NOW());
-- (d) the seatless designer gets no row at all, and NEITHER DOES form S's AUTHOR:
-- a seatless hand who were granted the designer role would be provisioned a workspace
-- by 00295 and stop being seatless, which would make the author key TRUE and leave
-- form S measuring nothing.

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
                    'c6200000-0000-4000-8000-00000000000b'::uuid,
                    -- ROUND 13. Each of these already holds a seat, so 00295's
                    -- provisioning takes its early exit. The two EMPLOYER OWNERS are
                    -- here because HT-3-g AMENDED (b)'s remedy is reached through
                    -- reassign_project_lead, which demands an is_designer target, and
                    -- 00563's own arm asks has_designer_domain_role of the new lead.
                    'c6200000-0000-4000-8000-00000000000e'::uuid,
                    'c6200000-0000-4000-8000-000000000010'::uuid,
                    'c6200000-0000-4000-8000-000000000012'::uuid,
                    'c6200000-0000-4000-8000-000000000015'::uuid,
                    'c6200000-0000-4000-8000-000000000016'::uuid,
                    'c6200000-0000-4000-8000-00000000000a'::uuid]),
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
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-00000000000a'),
  -- ── ROUND 13 (HT-3-g AMENDED) ────────────────────────────────────────────
  -- (k) the former employer's own arm's-length card for the departed hire — the number
  -- her hour must come back to once its owner has recovered the project.
  ('c6200000-0000-4000-8000-0000000000a6', 'c6200000-0000-4000-8000-000000000008', 26000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-00000000000a'),
  -- (l) form H: her own 99900 in the workspace she owns (HT-3-e(2)'s owner exemption
  -- prices it), against her employer's arm's-length 26000.
  ('c6200000-0000-4000-8000-0000000000aa', 'c6200000-0000-4000-8000-000000000010', 99900,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000010'),
  ('c6200000-0000-4000-8000-0000000000a9', 'c6200000-0000-4000-8000-000000000010', 26000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000012'),
  -- (j-ii) Leah's own card in the studio she owns, so leg (j-ii) measures the key and
  -- not a missing rate.
  ('c6200000-0000-4000-8000-0000000000ad', 'c6200000-0000-4000-8000-000000000015', 41000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-000000000015'),
  -- (m) the honest studio's arm's-length 24000 for the designer it stamped, and her own
  -- 88800 in the studio she OWNS — the two numbers the remedy arm sits between.
  ('c6200000-0000-4000-8000-0000000000a6', 'c6200000-0000-4000-8000-00000000000e', 24000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-00000000000a'),
  ('c6200000-0000-4000-8000-0000000000ae', 'c6200000-0000-4000-8000-00000000000e', 88800,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6200000-0000-4000-8000-00000000000e');

-- ── ROUND 13 (HT-3-g AMENDED) — the ROSTERS the roster key reads, and the two
--    canonical designer_clients rows reassign_project_lead demands. Form S's project
--    deliberately gets NO roster row: an empty roster is the residual's own premise.
INSERT INTO public.project_team_members (id, project_id, user_id, role, removed_at)
VALUES
  ('c6200000-0000-4000-8000-0000000000f1', 'c6200000-0000-4000-8000-0000000000ea',
   'c6200000-0000-4000-8000-000000000013', 'support_designer', NULL),
  ('c6200000-0000-4000-8000-0000000000f2', 'c6200000-0000-4000-8000-0000000000eb',
   'c6200000-0000-4000-8000-000000000014', 'support_designer', NULL),
  ('c6200000-0000-4000-8000-0000000000f3', 'c6200000-0000-4000-8000-0000000000ec',
   'c6200000-0000-4000-8000-000000000011', 'support_designer', NULL);

INSERT INTO public.designer_clients
  (id, designer_id, client_id, client_name, client_email, status, source)
VALUES
  ('c6200000-0000-4000-8000-0000000000d1', 'c6200000-0000-4000-8000-000000000008',
   'c6200000-0000-4000-8000-00000000000f', 'L620 Remedy Client',
   'l620-remedy-client@test.invalid', 'active', 'direct'),
  ('c6200000-0000-4000-8000-0000000000d2', 'c6200000-0000-4000-8000-000000000010',
   'c6200000-0000-4000-8000-00000000000f', 'L620 Remedy Client',
   'l620-remedy-client@test.invalid', 'active', 'direct');

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

-- ─── (l) W2-R13-01 FORM H — HER TWO STATEMENTS, BEFORE THE SHIP ─────────────
-- Form H is the shape the ROSTER KEY cannot reach, and it is measured here rather
-- than argued: where the project's author is a colleague she ADMINISTERS, the one
-- statement that silences the author key silences the roster key too, because both
-- read the same seat. This block is the whole manoeuvre, through RLS, in her own
-- hand — and it runs BEFORE the statement below, which is the real-world ordering:
-- her seats are whatever she left them at the instant the ship runs.
DO $$
DECLARE
  v_studio uuid;
  v_tier   text;
  v_rows   integer;
BEGIN
  -- THE CONTROL, measured in this same fixture rather than duplicated beside it:
  -- before she acts, her tier is her EMPLOYER and BOTH keys would have left an
  -- owned-tier answer off this project anyway.
  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000010') AS answer;
  ASSERT v_studio = 'c6200000-0000-4000-8000-0000000000a9' AND v_tier = 'employer',
    'FAIL l0 (FORM H control): while she holds her employer seat the tier rule answers '
    'her EMPLOYER, so 00620 would stamp this project to the studio whose client it is; '
    'got ' || COALESCE(v_studio::text, 'NULL') || ' / ' || COALESCE(v_tier, 'NULL');
  ASSERT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000011',
           'c6200000-0000-4000-8000-0000000000aa'),
    'FAIL l0a (FORM H control): and the AUTHOR key is TRUE of her employer''s '
    'assistant while his seat is live';
  ASSERT public.project_roster_books_elsewhere(
           'c6200000-0000-4000-8000-0000000000ec',
           'c6200000-0000-4000-8000-000000000010',
           'c6200000-0000-4000-8000-0000000000aa'),
    'FAIL l0b (FORM H control): and so is the ROSTER key — he is on the project''s '
    'live roster and seated in a studio she does not own';

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000010');

  -- X1 — ONE statement, on somebody else's seat, admitted by the shipped
  -- `Org admins can update members` policy (guard_org_membership_changes guards only
  -- owner-role transitions, so nothing refuses it). It silences BOTH keys at once.
  UPDATE public.organization_members
     SET status = 'removed'
   WHERE user_id = 'c6200000-0000-4000-8000-000000000011'
     AND organization_id = 'c6200000-0000-4000-8000-0000000000a9';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL l1 (FORM H, statement 1): an ADMIN may set a colleague''s seat '
    'status = ''removed'' — 1 row, no raise. If this ever touches 0 rows the policy '
    'changed and form H is measuring nothing; rows = ' || v_rows;

  -- X2 — her own seat (W2-R9-01 probe D2), which empties her employer tier.
  UPDATE public.organization_members
     SET status = 'removed'
   WHERE user_id = 'c6200000-0000-4000-8000-000000000010'
     AND organization_id = 'c6200000-0000-4000-8000-0000000000a9';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL l2 (FORM H, statement 2): and her own seat goes the same way; rows = '
    || v_rows;

  PERFORM pg_temp.reset_role();

  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000010') AS answer;
  ASSERT v_studio = 'c6200000-0000-4000-8000-0000000000aa' AND v_tier = 'owned',
    'FAIL l3 (FORM H): her tier is now the workspace she OWNS; got '
    || COALESCE(v_studio::text, 'NULL') || ' / ' || COALESCE(v_tier, 'NULL');
  ASSERT NOT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000011',
           'c6200000-0000-4000-8000-0000000000aa'),
    'FAIL l4 (FORM H): the AUTHOR key is now FALSE — the author''s seat is the fact it '
    'reads, and she moved it';
  ASSERT NOT public.project_roster_books_elsewhere(
           'c6200000-0000-4000-8000-0000000000ec',
           'c6200000-0000-4000-8000-000000000010',
           'c6200000-0000-4000-8000-0000000000aa'),
    'FAIL l5 (FORM H, and the ROSTER KEY''S OWN LIMIT, stated rather than hidden): the '
    'roster key is FALSE too. He is still ON the roster — she removed his SEAT, not his '
    'roster row — and the key asks whether a roster member holds a live seat elsewhere. '
    'So the roster key closes form S''s realistic population and does NOT close form H, '
    'which is why HT-3-g AMENDED (c) grades form H a residual with a remedy rather '
    'than a shape this key was ever going to reach';

  RAISE NOTICE 'legacy_project_studio_stamp: form H — two statements, both keys silent, before the ship.';
END
$$;

-- ─── 00620's own statement, verbatim, over this fixture ─────────────────────
DO $$
DECLARE
  v_stamped        integer := 0;
  -- ROUND 13 (W2-R13-02): the statement reports its stamp PER TIER, so this file
  -- measures the NOTICE's own split and not just a total.
  v_stamped_employer integer := 0;
  v_stamped_owned    integer := 0;
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

  -- 00620's statement, copied rather than paraphrased — BOTH keys included,
  -- W2-R12-01's author key and HT-3-g AMENDED (a)'s roster key,
  -- because a copy without it measures a statement the migration no longer runs.
  WITH tiered AS (
    SELECT project.id          AS project_id,
           project.created_by  AS author_id,
           project.designer_id AS designer_id,
           answer.studio_id,
           answer.tier
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
  ),
  stamped AS (
    UPDATE public.projects AS project
       SET studio_id = tiered.studio_id
      FROM tiered
     WHERE project.id = tiered.project_id
       AND tiered.studio_id IS NOT NULL
       AND project.studio_id IS NULL
       AND (
         tiered.tier = 'employer'
         OR (
           NOT public.project_author_books_elsewhere(tiered.author_id, tiered.studio_id)
           AND NOT public.project_roster_books_elsewhere(
                     tiered.project_id, tiered.designer_id, tiered.studio_id)
         )
       )
    RETURNING project.id AS project_id, tiered.tier AS tier
  )
  SELECT count(*),
         count(*) FILTER (WHERE stamped.tier = 'employer'),
         count(*) FILTER (WHERE stamped.tier = 'owned')
    INTO v_stamped, v_stamped_employer, v_stamped_owned
  FROM stamped;

  SELECT count(*), COALESCE(sum(COALESCE(hourly_rate_cents, 0)), 0)
    INTO v_entries_after, v_rate_after
  FROM public.project_time_entries;

  ASSERT v_stamped >= 5,
    'FAIL g1: the statement must have stamped at least this file''s five stampable '
    'fixtures (one employer, owned only, the principal, the departed hire''s own '
    'SELF-OPENED project, and the employer-tier project an outsider opened); stamped '
    || v_stamped;
  ASSERT v_stamped = v_stamped_employer + v_stamped_owned,
    'FAIL g1a (W2-R13-02, the NOTICE''s own arithmetic): every stamped row is '
    'accounted for by ONE of HT-3-b''s two tiers, because the statement RETURNS the '
    'tier that wrote it rather than re-deriving the split afterwards; ' || v_stamped
    || ' stamped against ' || v_stamped_employer || ' employer + ' || v_stamped_owned
    || ' owned';
  ASSERT v_stamped_employer >= 2 AND v_stamped_owned >= 3,
    'FAIL g1b (W2-R13-02): and BOTH tiers must appear in the split, or the per-tier '
    'counts the ship reads are untested in one direction; got ' || v_stamped_employer
    || ' employer / ' || v_stamped_owned || ' owned';
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
    SELECT project.id          AS project_id,
           project.created_by  AS author_id,
           project.designer_id AS designer_id,
           answer.studio_id,
           answer.tier
    FROM public.projects AS project
    CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
    WHERE project.studio_id IS NULL
      AND project.designer_id IS NOT NULL
  ),
  stamped AS (
    UPDATE public.projects AS project
       SET studio_id = tiered.studio_id
      FROM tiered
     WHERE project.id = tiered.project_id
       AND tiered.studio_id IS NOT NULL
       AND project.studio_id IS NULL
       AND (
         tiered.tier = 'employer'
         OR (
           NOT public.project_author_books_elsewhere(tiered.author_id, tiered.studio_id)
           AND NOT public.project_roster_books_elsewhere(
                     tiered.project_id, tiered.designer_id, tiered.studio_id)
         )
       )
    RETURNING project.id AS project_id, tiered.tier AS tier
  )
  SELECT count(*)
    INTO v_again
  FROM stamped;
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

-- ─── (j) HT-3-g AMENDED (a) — THE ROSTER KEY, both directions ───────────────
-- The key asks about the PROJECT's own working party rather than about any one
-- person's standing, which is the whole reason it exists: the author key is already
-- false on four of the five standings a legacy author can hold, and movable in one
-- statement on the fifth (form H above). Two shapes, in the same fixture: a roster
-- carrying another studio's people is left NULL; a sole proprietor whose own assistant
-- is on the roster is stamped.
DO $$
DECLARE
  v_studio uuid;
  v_tier   text;
BEGIN
  -- (j-i) the shape the key is FOR.
  ASSERT (SELECT studio_id IS NULL FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ea'),
    'FAIL j1 (THE ROSTER KEY): her own hand opened this project, so the AUTHOR key is '
    'silent on it — and a support designer on its LIVE roster answers to a studio she '
    'does not own, so 00620 leaves it NULL rather than handing her book a project whose '
    'working party belongs to somebody else (HT-3-g AMENDED (a), W2-R13-01)';
  SELECT answer.studio_id, answer.tier INTO v_studio, v_tier
  FROM public.designer_tier_pricing_studio('c6200000-0000-4000-8000-000000000016') AS answer;
  ASSERT v_studio = 'c6200000-0000-4000-8000-0000000000ab' AND v_tier = 'owned',
    'FAIL j1a (the rule still answers): j1 must be the ROSTER KEY leaving that row, not '
    'an ambiguous tier. If the tier rule stops answering her studio this fixture has '
    'drifted and j1 is measuring nothing; got ' || COALESCE(v_studio::text, 'NULL')
    || ' / ' || COALESCE(v_tier, 'NULL');
  ASSERT public.project_roster_books_elsewhere(
           'c6200000-0000-4000-8000-0000000000ea',
           'c6200000-0000-4000-8000-000000000016',
           'c6200000-0000-4000-8000-0000000000ab'),
    'FAIL j1b: the key itself — a live roster member other than the designer holds an '
    'active, non-guest seat in an active design_studio she does not own';
  ASSERT NOT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-000000000016',
           'c6200000-0000-4000-8000-0000000000ab'),
    'FAIL j1c (and the two keys are INDEPENDENT): the AUTHOR key is FALSE here, so j1 '
    'is a row the round-12 key alone would have stamped. That is the population '
    'HT-3-g AMENDED (a) adds, and dropping either key loses rows the other reaches';

  -- (j-ii) the shape the key must NOT touch.
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000eb')
         = 'c6200000-0000-4000-8000-0000000000ad',
    'FAIL j2 (THE LEAH SHAPE): a sole proprietor whose own ASSISTANT opened her project '
    'and sits on its roster IS stamped to her own studio. The assistant answers to HER '
    'studio and to no other, so neither key speaks. A NULL here is the roster key '
    'over-reaching into exactly the honest shape 00620 exists for — the same shape leg '
    '(e)/g5 protects against HT-3-f(2)';
  ASSERT NOT public.project_roster_books_elsewhere(
           'c6200000-0000-4000-8000-0000000000eb',
           'c6200000-0000-4000-8000-000000000015',
           'c6200000-0000-4000-8000-0000000000ad'),
    'FAIL j2a: and the predicate itself answers FALSE of her roster';

  -- The ruling says "a studio the designer does NOT own", not "a studio other than
  -- this one", and that clause is asked as an owner-seat EXISTS. Probed directly,
  -- because no stamp can exhibit it: a designer who owns the studio her roster member
  -- is seated in has a roster that books nowhere else. (The predicate is a pure
  -- function of its three arguments, so asking it of a designer who does not lead this
  -- project measures the clause and nothing else.)
  ASSERT NOT public.project_roster_books_elsewhere(
           'c6200000-0000-4000-8000-0000000000ea',
           'c6200000-0000-4000-8000-000000000017',
           'c6200000-0000-4000-8000-0000000000ab'),
    'FAIL j3 (the ownership clause): the roster member''s only seat is in a studio this '
    'designer OWNS, so it is part of her own book and the key is FALSE. Spelled merely '
    'as `<> p_studio_id` the key would leave NULL every project of a principal who runs '
    'two studios and staffs one from the other';

  RAISE NOTICE 'legacy_project_studio_stamp: the roster key leaves a foreign roster and keeps the sole proprietor''s own assistant.';
END
$$;

-- ─── (k) W2-R13-01 FORM S — THE NARROWEST RESIDUAL, AND ITS REMEDY ──────────
-- ONE statement by ONE account with no second party: she leaves her own employer seat
-- (`Members can leave`, or `status = 'removed'` as an admin — at the instant the ship
-- runs they are the same fixture), and a legacy project of that employer's whose author
-- holds no live seat and whose roster carries nobody else is stamped to the workspace
-- she owns. ASSERTED AS PASSING AND LOUDLY LABELLED: it is a residual under HT-3-g
-- AMENDED (c), not a closed shape. What follows its taking is the REMEDY of HT-3-g
-- AMENDED (b), measured leg by leg — including the leg that is NOT available to the
-- employer acting alone.
DO $$
DECLARE
  v_rate   integer;
  v_source text;
  v_amount integer;
  v_state  text;
  v_got    uuid;
  v_lead   uuid;
BEGIN
  -- ROUND 14: the legs below are in the order HT-3-g(b) CORRECTED puts them in —
  -- k3 the reassign the employer cannot reach alone, k4b the overwrite refused while
  -- she holds the taker's courtesy seat, k4d her dropping it, k5 the recovery.
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e9')
         = 'c6200000-0000-4000-8000-0000000000a5',
    'FAIL k1 (FORM S — THE RESIDUAL, asserted as PASSING): both keys are silent on a '
    'project whose author holds no seat anywhere and whose roster carries nobody but '
    'her, so the one-off stamp hands her former employer''s client work to the '
    'workspace she owns. The ROSTER key narrows this population to rosters that carry '
    'nobody from another studio; it does not empty it, and HT-3-g AMENDED (c) grades '
    'the remainder a residual because the manoeuvre needs her to leave a SEAT';
  ASSERT NOT public.project_author_books_elsewhere(
           'c6200000-0000-4000-8000-00000000000d',
           'c6200000-0000-4000-8000-0000000000a5')
     AND NOT public.project_roster_books_elsewhere(
               'c6200000-0000-4000-8000-0000000000e9',
               'c6200000-0000-4000-8000-000000000008',
               'c6200000-0000-4000-8000-0000000000a5'),
    'FAIL k1a: and both keys are measured false here, so k1 is the residual rather '
    'than a key that failed to fire';

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000008');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b5', 'c6200000-0000-4000-8000-0000000000e9',
          'c6200000-0000-4000-8000-000000000008', NOW() - INTERVAL '4 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b5';
  ASSERT v_rate = 99900 AND v_source = 'studio_member' AND v_amount = 199800,
    'FAIL k2 (FORM S — THE MONEY, asserted as PASSING): her hour on her former '
    'employer''s project prices at the 99900 she wrote for herself (HT-3-e(2)''s owner '
    'exemption), where that employer''s own card says 26000; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  -- REMEDY, leg 1 — THE EMPLOYER ACTING ALONE. Measured, and it is a refusal: HT-3-g
  -- AMENDED (b) reaches the stamp through the project's LEAD, and reassign_project_lead
  -- (00399) is pinned to the project's CURRENT studio_id — both the outgoing and the
  -- incoming lead must hold an active non-guest seat THERE, which after the taking is
  -- the taker's own workspace.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  v_state := NULL;
  BEGIN
    PERFORM public.reassign_project_lead(
      'c6200000-0000-4000-8000-0000000000e9',
      'c6200000-0000-4000-8000-000000000008',
      'c6200000-0000-4000-8000-00000000000a');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL k3 (THE REMEDY''S MISSING HALF, measured rather than assumed): the employer''s '
    'own OWNER cannot make herself the lead of the taken project, because '
    'reassign_project_lead asks for a seat in the studio the project NOW names. So the '
    'remedy arm exists and the employer cannot reach it unaided — the residual recovers '
    'only with the taker''s own hand, or once reassign_project_lead learns to follow the '
    'project''s book rather than its current column. Recorded for the orchestrator; got '
    || COALESCE(v_state, 'NO RAISE');
  ASSERT (SELECT designer_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e9')
         = 'c6200000-0000-4000-8000-000000000008',
    'FAIL k3a: and the refusal moved no lead';

  -- REMEDY, leg 2 — the two statements the taker must make for the employer to reach
  -- the arm at all: a seat in her workspace for the employer's owner, and the
  -- reassignment itself.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000008');
  INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
  VALUES ('c6200000-0000-4000-8000-00000000000a', 'c6200000-0000-4000-8000-0000000000a5',
          'member', 'active', NOW());
  PERFORM public.reassign_project_lead(
    'c6200000-0000-4000-8000-0000000000e9',
    'c6200000-0000-4000-8000-000000000008',
    'c6200000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();
  SELECT designer_id INTO v_lead FROM public.projects
   WHERE id = 'c6200000-0000-4000-8000-0000000000e9';
  ASSERT v_lead = 'c6200000-0000-4000-8000-00000000000a',
    'FAIL k4 (precondition for the remedy arm): the employer''s owner is now the '
    'project''s lead. If this stops working the remedy arm has no reachable caller at '
    'all and k5 measures nothing; lead = ' || COALESCE(v_lead::text, 'NULL');

  -- REMEDY, leg 2b — WHAT HT-3-g(b) CORRECTED COSTS THE REMEDY, measured rather than
  -- assumed. The seat the taker had to give her for reassign_project_lead to run at all
  -- is an active non-guest `member` seat in the TAKER'S WORKSPACE — which is the studio
  -- about to be replaced. So at this instant the replaced studio EMPLOYS the project's
  -- designer and the corrected third bound refuses the overwrite. It is one statement's
  -- worth of cost and the statement is the recovering owner's OWN.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6200000-0000-4000-8000-0000000000e9',
      'c6200000-0000-4000-8000-0000000000a6') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '22023',
    'FAIL k4b (HT-3-g(b) CORRECTED — the courtesy seat is itself an employer seat): the '
    'employer''s owner is the lead and owns the studio she names, and the overwrite is '
    'still refused while she holds the seat the taker gave her in the workspace being '
    'replaced. The correction reads the REPLACED studio, and it cannot tell a courtesy '
    'seat from employment; got ' || COALESCE(v_state, 'NO RAISE (returned '
    || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e9')
         = 'c6200000-0000-4000-8000-0000000000a5',
    'FAIL k4c: and that refusal wrote nothing';

  -- REMEDY, leg 2c — SHE DROPS THAT SEAT. One statement on her own row
  -- (`Members can leave`), by the party doing the recovering.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  WITH gone AS (
    DELETE FROM public.organization_members
     WHERE user_id = 'c6200000-0000-4000-8000-00000000000a'
       AND organization_id = 'c6200000-0000-4000-8000-0000000000a5'
    RETURNING 1
  ) SELECT count(*) INTO v_amount FROM gone;
  PERFORM pg_temp.reset_role();
  ASSERT v_amount = 1,
    'FAIL k4d (precondition): the recovering owner must be able to leave the workspace '
    'seat she was given; rows = ' || COALESCE(v_amount::text, 'NULL');

  -- REMEDY, leg 3 — THE ARM ITSELF. She is the project's CURRENT designer and the OWNER
  -- of the studio she names, and the studio being replaced no longer employs her, so
  -- bound (b) yields and the column is re-pointed.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  SELECT public.stamp_project_pricing_studio(
    'c6200000-0000-4000-8000-0000000000e9',
    'c6200000-0000-4000-8000-0000000000a6') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6200000-0000-4000-8000-0000000000a6'
     AND (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e9')
         = 'c6200000-0000-4000-8000-0000000000a6',
    'FAIL k5 (HT-3-g AMENDED (b) — THE REMEDY ARM OVERWRITES): the employer''s owner, '
    'now the lead and holding no seat in the workspace being replaced, names her own '
    'studio on a project that already named the taker''s '
    'workspace, and the column moves. Through round 12 this was 22023 for every caller '
    'alive, which is what made W2-R13-01 a taking with no way back, and HT-3-g(b) '
    'CORRECTED leaves it reachable because a taker''s workspace is a studio she OWNS '
    'rather than one that employs the lead; got '
    || COALESCE(v_got::text, 'NULL');
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE resource_type = 'project'
      AND resource_id = 'c6200000-0000-4000-8000-0000000000e9'
      AND action = 'project.pricing_studio_restamped'
      AND organization_id = 'c6200000-0000-4000-8000-0000000000a5'
      AND old_values->>'studio_id' = 'c6200000-0000-4000-8000-0000000000a5'
      AND new_values->>'studio_id' = 'c6200000-0000-4000-8000-0000000000a6'
  ), 'FAIL k6 (the overwrite is AUDITED, with both studios, FILED UNDER THE DISPLACED '
     'ONE — W2-R14-03): an overwrite takes a '
     'project''s hours OFF a studio that was reading them, so it carries its own action '
     'name, the OLD studio, and the OLD studio''s organization_id — which is the only '
     'organization_id audit_logs'' SELECT policies let the losing party read. A row '
     'spelling the old value NULL would say the opposite of what happened. Here the '
     'party displaced is the taker''s own workspace, which is exactly the symmetry the '
     'rule buys: whoever loses a project can see who took it';
  ASSERT (SELECT hourly_rate_cents = 99900 AND rate_source = 'studio_member'
            FROM public.project_time_entries
           WHERE id = 'c6200000-0000-4000-8000-0000000000b5'),
    'FAIL k7 (P-4): the hour logged while the workspace held the project keeps the '
    'number it was priced at. The remedy changes what the NEXT hour resolves; it '
    're-rates nothing in either direction';

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000008');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b6', 'c6200000-0000-4000-8000-0000000000e9',
          'c6200000-0000-4000-8000-000000000008', NOW() - INTERVAL '30 minutes', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b6';
  ASSERT v_rate = 26000 AND v_source = 'studio_member' AND v_amount = 52000,
    'FAIL k8 (THE REMEDY RECOVERS THE MONEY): her next hour on the recovered project '
    'prices from the EMPLOYER''s card — 26000, the number its owner wrote — and not '
    'from the 99900 she wrote for herself. She holds no seat there at all, which is '
    'deliberate: tier 2 asks for a RATE ROW, not a seat, so a recovered project bills at '
    'the studio''s number even after the hire has gone; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'legacy_project_studio_stamp: form S is a residual whose remedy arm recovers the money, and whose reassign leg the employer cannot reach alone.';
END
$$;

-- ─── (l) W2-R13-01 FORM H — the taking, the money, and the same remedy ──────
DO $$
DECLARE
  v_rate   integer;
  v_source text;
  v_amount integer;
  v_state  text;
  v_got    uuid;
BEGIN
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ec')
         = 'c6200000-0000-4000-8000-0000000000aa',
    'FAIL l6 (FORM H — THE RESIDUAL, asserted as PASSING): two statements of hers, both '
    'on rows her own shipped policies admit, and her employer''s client work — opened by '
    'that employer''s own assistant and carrying him on its roster — is stamped to the '
    'workspace she owns. The roster key cannot reach this shape by construction: it '
    'reads the same seat the author key reads';

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000010');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b7', 'c6200000-0000-4000-8000-0000000000ec',
          'c6200000-0000-4000-8000-000000000010', NOW() - INTERVAL '4 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b7';
  ASSERT v_rate = 99900 AND v_source = 'studio_member' AND v_amount = 199800,
    'FAIL l7 (FORM H — THE MONEY, asserted as PASSING): 99900 where her employer''s '
    'owner wrote 26000; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');

  -- The same remedy, and the same missing half.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000012');
  v_state := NULL;
  BEGIN
    PERFORM public.reassign_project_lead(
      'c6200000-0000-4000-8000-0000000000ec',
      'c6200000-0000-4000-8000-000000000010',
      'c6200000-0000-4000-8000-000000000012');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL l8: the employer''s owner is refused the reassignment here too, for the same '
    'reason as k3 — the project now names the taker''s workspace and he holds no seat '
    'in it; got ' || COALESCE(v_state, 'NO RAISE');

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000010');
  INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
  VALUES ('c6200000-0000-4000-8000-000000000012', 'c6200000-0000-4000-8000-0000000000aa',
          'member', 'active', NOW());
  PERFORM public.reassign_project_lead(
    'c6200000-0000-4000-8000-0000000000ec',
    'c6200000-0000-4000-8000-000000000010',
    'c6200000-0000-4000-8000-000000000012');
  PERFORM pg_temp.reset_role();

  -- HT-3-g(b) CORRECTED, the same cost as k4b on this fixture: while the employer's
  -- owner holds the courtesy seat the taker gave her in the workspace being replaced,
  -- that workspace EMPLOYS the project's designer and the overwrite is refused.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000012');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6200000-0000-4000-8000-0000000000ec',
      'c6200000-0000-4000-8000-0000000000a9') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '22023',
    'FAIL l8b (HT-3-g(b) CORRECTED, on form H): refused while the recovering owner holds '
    'the taker''s courtesy seat in the workspace being replaced; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000012');
  WITH gone AS (
    DELETE FROM public.organization_members
     WHERE user_id = 'c6200000-0000-4000-8000-000000000012'
       AND organization_id = 'c6200000-0000-4000-8000-0000000000aa'
    RETURNING 1
  ) SELECT count(*) INTO v_amount FROM gone;
  PERFORM pg_temp.reset_role();
  ASSERT v_amount = 1,
    'FAIL l8c (precondition): she leaves that seat in one statement of her own; rows = '
    || COALESCE(v_amount::text, 'NULL');

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000012');
  SELECT public.stamp_project_pricing_studio(
    'c6200000-0000-4000-8000-0000000000ec',
    'c6200000-0000-4000-8000-0000000000a9') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6200000-0000-4000-8000-0000000000a9'
     AND (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ec')
         = 'c6200000-0000-4000-8000-0000000000a9',
    'FAIL l9 (the remedy arm, on form H): the employer''s owner recovers its own client '
    'work; got ' || COALESCE(v_got::text, 'NULL');
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE resource_id = 'c6200000-0000-4000-8000-0000000000ec'
      AND action = 'project.pricing_studio_restamped'
      AND organization_id = 'c6200000-0000-4000-8000-0000000000aa'
      AND old_values->>'studio_id' = 'c6200000-0000-4000-8000-0000000000aa'
      AND new_values->>'studio_id' = 'c6200000-0000-4000-8000-0000000000a9'
  ), 'FAIL l10 (W2-R14-03): and the overwrite is audited with both studios, under the '
     'DISPLACED studio''s organization_id';

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-000000000010');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b8', 'c6200000-0000-4000-8000-0000000000ec',
          'c6200000-0000-4000-8000-000000000010', NOW() - INTERVAL '20 minutes', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b8';
  ASSERT v_rate = 26000 AND v_source = 'studio_member' AND v_amount = 52000,
    'FAIL l11 (the remedy recovers the money on form H too): 26000 from the employer''s '
    'card; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL')
    || ' / ' || COALESCE(v_amount::text, 'NULL');
  ASSERT (SELECT hourly_rate_cents = 99900 FROM public.project_time_entries
           WHERE id = 'c6200000-0000-4000-8000-0000000000b7'),
    'FAIL l12 (P-4): and the hour logged before the recovery keeps its number';

  RAISE NOTICE 'legacy_project_studio_stamp: form H is a residual with the same remedy, the same missing half, and the one extra statement HT-3-g(b) CORRECTED costs it.';
END
$$;

-- ─── (m) THE REMEDY ARM'S OWN SURFACE: THREE refusals, and the RESIDUAL ─────
-- The arm turns on THREE facts and the refusals below are each the absence of one of
-- them: an OWNER seat in the studio named, the LEAD of the project, and — HT-3-g(b)
-- CORRECTED (orchestrator 2026-09-13, resolving W2-R14-01) — a studio being REPLACED
-- that does not EMPLOY this project's designer.
--
-- ROUND 13 SHIPPED THIS CASE THE OTHER WAY UP. Read as the amendment worded it, the arm
-- admitted any designer who OWNS a studio to re-point any project she LEADS — an honest
-- employer's already-stamped project included — at the studio she owns, where
-- HT-3-e(2)'s owner exemption priced her own number: W2-R11-01 form A with the power to
-- overwrite, ONE statement by ONE account, no seat touched, nothing transferred, no
-- second party, on a project she did not create. Round 13 asserted it as a passing,
-- loudly-labelled door (m6-m8); round 14 measured what it was worth — an honest
-- employer's arm's-length 26000 became the 77700 she had written for herself, and the
-- displaced employer could neither undo it nor read the audit row — and the correction
-- closes it. The legs below measure the closure and THEN the residual that is left:
-- she can still reach the studio she owns, but only by LEAVING the employer's seat
-- first, which is a seat act and so a NOTE — RESIDUAL under HT-3-g AMENDED (c) rather
-- than a one-statement taking. m7a is W2-R14-03: the audit row is now filed under the
-- DISPLACED studio, so the party losing the work can read it.
DO $$
DECLARE
  v_rate   integer;
  v_source text;
  v_amount integer;
  v_state  text;
  v_got    uuid;
BEGIN
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ed')
         = 'c6200000-0000-4000-8000-0000000000a6',
    'FAIL m0 (precondition): an HONEST studio names this project, which is the state '
    'every project created since 00602 is in';

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000e');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000b9', 'c6200000-0000-4000-8000-0000000000ed',
          'c6200000-0000-4000-8000-00000000000e', NOW() - INTERVAL '5 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b9';
  ASSERT v_rate = 24000 AND v_source = 'studio_member',
    'FAIL m1 (precondition): the honest studio''s arm''s-length 24000 prices her hour; '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- REFUSAL 1 — the project's designer, but only an ADMIN of the studio she names.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000e');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6200000-0000-4000-8000-0000000000ed',
      'c6200000-0000-4000-8000-0000000000a8') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '22023',
    'FAIL m2 (the remedy arm asks for an OWNER seat): she IS this project''s designer '
    'and she IS an owner-or-admin of the studio she names, so bound (a) admits her — and '
    'the overwrite is still refused, because the arm asks for an OWNER seat and hers is '
    '`admin`. Spelled as is_org_admin_or_owner the arm would hand every ADMIN of any '
    'studio the power to re-point a project that studio had no part in; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ed')
         = 'c6200000-0000-4000-8000-0000000000a6',
    'FAIL m3: and the refusal wrote nothing';

  -- REFUSAL 2 — an OWNER of the studio named who is NOT the project's designer.
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6200000-0000-4000-8000-0000000000e1',
      'c6200000-0000-4000-8000-0000000000a6') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '22023',
    'FAIL m4 (the remedy arm asks for the LEAD): an owner of the studio she names, who '
    'is not this project''s designer, is refused the overwrite — a stamp stays final for '
    'every caller but the one the amendment names (HT-3-c). Without this leg any studio '
    'owner could pull any stamped project into her own books; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000e1')
         = 'c6200000-0000-4000-8000-0000000000a1',
    'FAIL m5: and that refusal wrote nothing either';

  -- REFUSAL 3, AND ROUND 14'S WHOLE POINT — both of round 13's facts present, on a
  -- project an HONEST EMPLOYER was pricing. HT-3-g(b) CORRECTED refuses it: the studio
  -- being replaced EMPLOYS her (an active `member` seat in an active design_studio).
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000e');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6200000-0000-4000-8000-0000000000ed',
      'c6200000-0000-4000-8000-0000000000ae') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '22023',
    'FAIL m6 (HT-3-g(b) CORRECTED, resolving W2-R14-01 MAJOR): an HONEST EMPLOYER''S '
    'STAMPED PROJECT CANNOT BE OVERWRITTEN BY THE DESIGNER IT EMPLOYS. She is this '
    'project''s lead AND the owner of the studio she names — round 13''s two facts — and '
    'the overwrite is refused anyway, because the studio being REPLACED holds an active '
    'non-guest seat of hers with role <> ''owner''. Through round 13 this call SUCCEEDED: '
    'ONE statement by ONE account, no seat touched, nothing transferred, no second '
    'party, on a project she did not create, and the employer''s arm''s-length number '
    'became the one she had written for herself. That is the brief''s blocker clause word '
    'for word; got ' || COALESCE(v_state, 'NO RAISE (returned '
    || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ed')
         = 'c6200000-0000-4000-8000-0000000000a6',
    'FAIL m6b: and the refusal wrote nothing — the honest studio still names it';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE resource_id = 'c6200000-0000-4000-8000-0000000000ed'
      AND action = 'project.pricing_studio_restamped'
  ), 'FAIL m6c: and a refused overwrite audits nothing';
  SELECT hourly_rate_cents INTO v_rate
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000b9';
  ASSERT v_rate = 24000,
    'FAIL m6d (the money stays where the honest studio put it): her hour still prices '
    'at the employer''s 24000; got ' || COALESCE(v_rate::text, 'NULL');

  -- WHAT IS LEFT, AND IT IS A RESIDUAL — HT-3-g AMENDED (c). The correction is a fact
  -- about the project's BOOK, and she can still change that fact: she LEAVES the
  -- employer's seat (`Members can leave`, one statement on her own row) and the
  -- overwrite is then admitted. Two statements, the first a seat act, so this is a
  -- NOTE — RESIDUAL and not a blocker under the discipline, and it is asserted as
  -- PASSING and loudly labelled rather than left for the next round to find. The
  -- remedy is the same one every residual in this family has: the displaced employer
  -- reassigns to its own owner and stamps (cases (k) k4b-k8).
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000e');
  WITH gone AS (
    DELETE FROM public.organization_members
     WHERE user_id = 'c6200000-0000-4000-8000-00000000000e'
       AND organization_id = 'c6200000-0000-4000-8000-0000000000a6'
    RETURNING 1
  ) SELECT count(*) INTO v_amount FROM gone;
  SELECT public.stamp_project_pricing_studio(
    'c6200000-0000-4000-8000-0000000000ed',
    'c6200000-0000-4000-8000-0000000000ae') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_amount = 1,
    'FAIL m6e (precondition): `Members can leave` must still admit her leaving the '
    'employer''s seat; rows = ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_got = 'c6200000-0000-4000-8000-0000000000ae'
     AND (SELECT studio_id FROM public.projects
           WHERE id = 'c6200000-0000-4000-8000-0000000000ed')
         = 'c6200000-0000-4000-8000-0000000000ae',
    'FAIL m6a (THE RESIDUAL THE CORRECTION LEAVES — asserted as PASSING and LOUDLY '
    'LABELLED): with the employer''s seat gone the replaced studio no longer employs '
    'her, so the overwrite is admitted. The taking is not closed, it is priced at a '
    'SEAT — which is what HT-3-g AMENDED (c) grades a residual, and what the remedy arm '
    'exists to undo. It is also why the arm remains reachable at all: after a form-S/H '
    'taking the replaced studio is the taker''s own workspace, in which the recovering '
    'lead holds no employer seat; got ' || COALESCE(v_got::text, 'NULL');
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE resource_id = 'c6200000-0000-4000-8000-0000000000ed'
      AND action = 'project.pricing_studio_restamped'
      AND organization_id = 'c6200000-0000-4000-8000-0000000000a6'
      AND old_values->>'studio_id' = 'c6200000-0000-4000-8000-0000000000a6'
      AND new_values->>'studio_id' = 'c6200000-0000-4000-8000-0000000000ae'
  ), 'FAIL m7 (W2-R14-03): the overwrite''s audit row carries the OLD studio, its own '
     'action name, AND the DISPLACED studio''s organization_id. Through round 13 it '
     'carried the NEW studio, and audit_logs'' only SELECT policies are `Org admins can '
     'view org audit logs` (organization_id + owner/admin) and `Users can view their '
     'audit logs` (user_id) — so the one trace of the act was readable by the taker and '
     'by the studio she had just named, and by nobody else';
  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000a');
  SELECT count(*) INTO v_amount
  FROM public.audit_logs
  WHERE resource_id = 'c6200000-0000-4000-8000-0000000000ed'
    AND action = 'project.pricing_studio_restamped';
  PERFORM pg_temp.reset_role();
  ASSERT v_amount = 1,
    'FAIL m7a (W2-R14-03 — THE DISPLACED STUDIO CAN READ IT): the owner of the studio '
    'that LOST the project reads the restamp row through RLS. Measured at 0 in round '
    '14 before the fix, which is why lane B had no fact it could show her at all; got '
    || COALESCE(v_amount::text, 'NULL');

  PERFORM pg_temp.assume_user('c6200000-0000-4000-8000-00000000000e');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6200000-0000-4000-8000-0000000000ba', 'c6200000-0000-4000-8000-0000000000ed',
          'c6200000-0000-4000-8000-00000000000e', NOW() - INTERVAL '10 minutes', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c6200000-0000-4000-8000-0000000000ba';
  ASSERT v_rate = 88800 AND v_source = 'studio_member' AND v_amount = 177600,
    'FAIL m8 (and the RESIDUAL moves money, which is why it is a residual and not '
    'nothing): her next hour prices at the 88800 she wrote for herself, where the '
    'honest studio''s card says 24000. HT-3-e(2)''s exemption is '
    'OWNERSHIP and she owns the studio she just named; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');
  ASSERT (SELECT hourly_rate_cents = 24000 FROM public.project_time_entries
           WHERE id = 'c6200000-0000-4000-8000-0000000000b9'),
    'FAIL m9 (P-4): the hour the honest studio already priced keeps its 24000';

  RAISE NOTICE 'legacy_project_studio_stamp: the remedy arm needs THREE facts — HT-3-g(b) CORRECTED refuses an honest employer''s stamped project to the designer it employs; what is left is a residual priced at a seat, and the displaced studio can now read the audit row.';
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
      OR (
        NOT public.project_author_books_elsewhere(project.created_by, answer.studio_id)
        AND NOT public.project_roster_books_elsewhere(
                  project.id, project.designer_id, answer.studio_id)
      )
    );
  ASSERT v_left = 0,
    'FAIL h1 (00620''s end state): no project the migration was WILLING to stamp may '
    'be left with studio_id NULL — one left behind prices ''none'' for ever and '
    'HT-3-g(3) gives its own studio no act. The predicate is the migration''s own, '
    'BOTH keys included: a row a key deliberately left is not a row the '
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

  ASSERT to_regprocedure('public.project_roster_books_elsewhere(uuid,uuid,uuid)') IS NOT NULL,
    'FAIL h5 (HT-3-g AMENDED (a), W2-R13-01): the ROSTER key must exist on the live '
    'stack. Without it the author key alone carries the owned tier, and it is already '
    'false on four of the five standings a legacy project''s author can hold';
  ASSERT NOT COALESCE(has_function_privilege('authenticated',
           'public.project_roster_books_elsewhere(uuid,uuid,uuid)', 'EXECUTE'), false),
    'FAIL h6 (HT-3-g(1)): and no authenticated caller may hold EXECUTE on it either — a '
    'roster is edited by a lead designer on an ordinary afternoon, so read at pricing '
    'time it would be the most movable lever in the program';

  RAISE NOTICE 'legacy_project_studio_stamp: the live migration left nothing answerable unstamped.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All legacy_project_studio_stamp assertions passed.'; END $$;

ROLLBACK;
