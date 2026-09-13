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
--       and take the hours, the money and the audit trail permanently. After
--       HT-3-e(1) the refusal comes from the arm's-length-rate leg rather than the
--       sibling leg, and case (t) writes the rate and records what is then allowed.
--   (e) a project a studio ALREADY prices cannot be stamped — the bound that
--       keeps the act pointed at 'none'. It is NOT a guarantee that the act
--       cannot move money: see (q) and (r), where 'none' is
--       MANUFACTURED on a correctly-priced project.
--   (f) the project's own designer, a plain `member` of the studio she names, is
--       REFUSED. HT-3-d (RULED 2026-09-12) gives standing to an OWNER or ADMIN of
--       the studio being named; being the designer is not standing in itself, so
--       a member can no longer choose which of her employers takes the hours and
--       the money (W2-R4-02).
--   (n) THE REPAIR HT-3-a NAMES, performed by the studio — an ADMIN of the
--       employer studio stamps, and the designer's next hour prices at the
--       EMPLOYER's rate card.
--   (g) the studio OWNER stamps, because her studio already holds another
--       project the same designer LEADS AND CREATED. That is HT-3-a's ruled
--       sentence ("the owner fixes 'none' by stamping projects.studio_id"), and
--       `created_by` is the half of it an attacker cannot author — see (k).
--   (h) THE REPAIR, measured — after (g) the owner reads the hour and gets the
--       project total; before it she had neither.
--   (i) re-naming the same studio is a no-op, so a retry is safe; and a caller
--       who is not an owner/admin of the studio she names is refused before
--       finality is ever consulted. The finality refusal itself (22023, by a
--       caller who HAS standing) is case (p).
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
--   (l) W2-R3-02, THE MEASURED MAJOR OF ROUND 3 — the first draft let the member
--       being priced move her own resolved rate to a number she set. A designer
--       with TWO employer seats (ambiguous tier ⇒ 'none') writes herself 99900 in
--       the one-person workspace 00295 provisions at her designer grant, and is
--       REFUSED the stamp of that workspace (the tier) and of her employer (she is
--       a plain member there — HT-3-d). Her employer's OWNER then performs the
--       repair, her next hour prices at the employer's 20000 rather than her
--       99900, and the employer's owner reads the project.
--   (m) W2-R4-01, THE MEASURED MAJOR OF ROUND 4 — the CONFEDERATE manoeuvre, the
--       one round 3's actor-gated bound admitted. The designer seats a second
--       account she controls as `admin` in the workspace she owns (asserted to
--       SUCCEED — consent-free) and creates her own named-studio sibling project
--       in it (asserted to SUCCEED), so the ONLY thing between that account and
--       the stamp is HT-3-d's tier bound. Her own stamp and the confederate's are
--       both refused, and her hours stay 'none'.
--   (o) HT-3-c arm (a) through HT-3-d's OWNED tier — a designer who holds NO
--       employer seat and owns TWO active studios is priced by neither, and may
--       name one she owns; her next hour prices from the studio she named.
--       RESIDUE, pinned deliberately rather than hidden: both owned candidates are
--       in her tier, so the 00295 workspace whose rate card she writes is nameable
--       too, and the other studio's admin then sees none of that work. That is the
--       shape W2-R4-03 asked a ruling about, and HT-3-d permits it.
--   (p) HT-3-d with TWO employers — either employer's admin may stamp their own
--       studio on a project of hers, the designer (a plain member of both) may
--       stamp neither, and the first stamp is FINAL: the other employer's admin,
--       who has full standing, is refused 22023 on the project already stamped.
--   (q) W2-R5-01, THE MEASURED MAJOR OF ROUND 5 — the designer writes her own
--       ROLE, and the repair becomes a taking. Her project is priced CORRECTLY by
--       an honest employer at baseline (asserted), and so is a SECOND legacy
--       project of hers. Two authenticated statements — a consent-free `admin`
--       seat for an account she holds, then `transfer_studio_ownership`, whose last
--       statement DEMOTES auth.uid() to 'admin' (both asserted to SUCCEED; both
--       live affordances on her own studio settings page) — move her 00295
--       workspace out of HT-3-d's OWNED tier and into its EMPLOYER tier, which
--       MANUFACTURES the 'none' this act exists to repair (asserted).
--       ROUND 7 CLOSES BOTH HALVES, and the closure is HT-3-e: her workspace holds
--       one rate row and SHE wrote it, so HT-3-e(1)'s employer arm refuses her
--       stamp (q7) AND the confederate's (q8) — the first time either half has
--       been refused — her hours file 'none' rather than 99900 (q10), and the
--       HONEST employer then repairs the project and prices her again (q11/q12).
--       HT-3-e(2) stands behind that: even named, the workspace could not price
--       her, because she demoted herself to `admin` to get into her own employer
--       tier. WHAT REMAINS is HT-3-e(3)'s ACCEPTED RESIDUAL, asserted as PASSING
--       on two further projects: the cooperating account AUTHORS her rate row, and
--       then its stamp (q13) and hers (q14) both succeed and the hour prices 99900
--       (q15). Patina answers that with visibility — the pricing studio is a
--       column of time_entry_ledger, shown in the owner's lens — not another
--       bound, and the ruling says so.
--       Round 5 answered q7 with bound (e2); ROUND 6 REVERSED IT (W2-R6-01) —
--       it refused the honest admin-designer of case (s), whom HT-3-d admits
--       expressly, and bought nothing, because this manoeuvre needs a second
--       account by construction (transfer_studio_ownership refuses
--       p_new_owner = auth.uid()) and q8 is reachable with the same accounts and
--       statements either way. Round 6 also measured why no bound AT THIS CALL
--       SITE closes it: the stamp succeeds with ZERO rate rows in the studio and
--       the number is written afterwards; the tier's only temporal witness is
--       organization_members.updated_at, which any People-room edit moves; and the
--       same taking works in an organization she has never owned (an accomplice
--       seats her `admin`, SHE writes her own 99900, he stamps). The closure
--       measured to work is a rule at the RATE — a self-authored
--       studio_member_rates row prices an hour only where its author is the named
--       studio's OWNER — and that is a W1 resolver ruling the program owes. The
--       owed consent door does NOT reach it: the seat exploited is her OWN 00295
--       seat and she is the consenting party. A FAILURE AT q7 OR q8 MEANS A RULING
--       LANDED — rewrite them to 42501.
--   (r) W2-R5-02 — the consent door, IRREVERSIBLE through the stamp, also asserted
--       as PASSING. The `created_by` sibling leg bounds an attacker acting ALONE;
--       a WILLING designer authors the sibling herself, so the confederate's stamp
--       succeeds on a correctly-priced project, and when he then DELETES the seat
--       that caused it the project still prices from his org, a later hour still
--       prices 99900, and he still reads every hour of the honest employer's work.
--       Closure is the OWED HT-3-b arm (c) consent door. A FAILURE HERE MEANS THAT
--       RULING LANDED — rewrite r7 to 42501.
--   (t) HT-3-e(1)'s RESIDUE, and the one thing the employer arm does NOT bound —
--       the W2-R3-01 outsider of (d)/(k) writes the victim designer's rate row in
--       her OWN org (created_by = her own id, which is arm's-length TO THE
--       DESIGNER), and her stamp then SUCCEEDS. Three authenticated statements,
--       the money follows, and the designer's own studio reads none of it.
--       Asserted as PASSING and loudly labelled: HT-3-e(1) weighed this against
--       W2-R7-01 (24 refusals of 24 left the whole legacy population
--       unrepairable), and the closure is the ALREADY-OWED HT-3-b arm (c) consent
--       door, which makes `status = 'active'` mean consent.
--   (u) W2-R7-01, THE MEASURED MAJOR OF ROUND 7 — THE ORDINARY HIRE. A designer
--       seated a plain `member` in TWO employer studios, one legacy project, no
--       manoeuvre and no sibling anywhere: she is refused (bound (a)), and under
--       round 6's body her employers' owner AND admin were refused too, so
--       HT-3-a's ruled remedy reached NOBODY. Here all three refusals are
--       measured BEFORE any rate exists, then the employer prices her — one
--       ordinary row — and its ADMIN performs the repair; her next hour prices at
--       the employer's 28000 and HT-10's read and total reach the owner.
--   (v) W2-R7-01's POPULATION (review probe P7) — a whole legacy book: THREE
--       projects, all `created_by` her, all unstamped, and neither employer
--       holding any project that names it. The 24-call sweep (4 actors x 3
--       projects x 2 studios) is asserted REFUSED before either studio has priced
--       her, and then owner, admin and the OTHER employer repair one project
--       each; the hours price from whichever studio repaired them.
--   (s) W2-R6-01, THE MEASURED MAJOR OF ROUND 6 — the HONEST admin-designer, and
--       the regression test for a bound that was REVERSED. No confederate, no
--       demotion, no consent-free seat, no workspace of her own: she is an `admin`
--       of one honest employer and a plain `member` of another, so HT-3-b's
--       employer tier is AMBIGUOUS and her project is honestly 'none'. Her
--       employer holds no project she created — and until round 7 that refused the
--       employer's OWNER too (bound (a2)), so with (e2) refusing HER the shape had
--       NO repairer at all. After HT-3-e(1) the employer's owner repairs a second
--       legacy project of hers (s3) because that studio holds her rate card; and
--       HT-3-d still admits HER expressly ("There is no other arm"), so she stamps
--       the first (s4), her next hour prices at the EMPLOYER's number written by
--       the EMPLOYER's owner (s6), and the employer's read and project total come
--       back (s7). IF s4 FAILS an actor-gated refusal came back, and that needs an
--       amendment to HT-3-d.
--       s8 IS ROUND 7's PROBE P8, and the sentence round 6 wrote here was FALSE
--       (W2-R7-03): an `admin` CAN author her own rate row at an honest employer.
--       She writes her own 99900 there — permitted, W1's capability, W2-R7-07 —
--       and HT-3-e(2) makes it price nothing: the hour she logs today comes back
--       'none' (the ladder closed the employer's row at her start date), an hour
--       inside the employer's own span still prices its 26000, and one new row
--       from the owner prices her again at 27500. The owner reads both rows, which
--       is the governance half HT-3-e leaves to the product.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/time_entry_studio_stamp_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
--
-- ── W2-R9-04: EVERY DATE IN THIS FILE IS UTC ───────────────────────────────
-- `effective_from`/`effective_to` are plain dates and the resolver anchors a rate
-- span in UTC (`(p_at AT TIME ZONE 'UTC')::date`, W1-R1-11), while the hours these
-- cases log are `NOW() - INTERVAL '...'`. `CURRENT_DATE` answers in the SESSION
-- time zone, and run-sql-tests.sh sets none — so in the hour after UTC midnight the
-- two disagreed, a repair row dated "today" did not cover an hour logged "an hour
-- ago", and the legs that prove HT-3-e(2)'s repair went RED on the clock rather
-- than on a regression (measured on both sides of midnight, review round 9). Every
-- date here is therefore `(NOW() AT TIME ZONE 'UTC')::date`, and a repair row that
-- must cover a NOW()-anchored hour is dated `- 1` so it covers that hour whichever
-- side of UTC midnight the run falls on.
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
  ('c6060000-0000-4000-8000-000000000006', 'stamp-priced@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000009', 'stamp-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

UPDATE profiles SET full_name = 'Stamp Owner'    WHERE id = 'c6060000-0000-4000-8000-000000000001';
UPDATE profiles SET full_name = 'Stamp Designer' WHERE id = 'c6060000-0000-4000-8000-000000000002';
UPDATE profiles SET full_name = 'Stamp Member'   WHERE id = 'c6060000-0000-4000-8000-000000000003';
UPDATE profiles SET full_name = 'Stamp Attacker' WHERE id = 'c6060000-0000-4000-8000-000000000004';
UPDATE profiles SET full_name = 'Stamp Outside'  WHERE id = 'c6060000-0000-4000-8000-000000000005';
UPDATE profiles SET full_name = 'Stamp Priced'   WHERE id = 'c6060000-0000-4000-8000-000000000006';
UPDATE profiles SET full_name = 'Stamp Admin'    WHERE id = 'c6060000-0000-4000-8000-000000000009';

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
   'c6060000-0000-4000-8000-0000000000a4', 'owner',  'active', NOW()),
  -- Stamp Studio's ADMIN — HT-3-d's standing is "an owner or admin of the studio
  -- being named", and case (n) measures the admin half of it.
  ('c6060000-0000-4000-8000-0000000000c8', 'c6060000-0000-4000-8000-000000000009',
   'c6060000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW());

-- Stamp Studio prices its designer. Case (n) reads this number off her next hour
-- after the employer's admin performs the repair.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6060000-0000-4000-8000-0000000000a1', 'c6060000-0000-4000-8000-000000000002', 25000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000001');

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

-- Case (e)'s actor is Stamp Studio's OWNER, because HT-3-d's standing is the
-- studio's and not the subject's — so a1 must hold a project Stamp Priced both
-- LEADS and CREATED, exactly as ARM 2 requires (W2-R3-01). It is the ordinary
-- state of a hire whose later projects 00563 has been stamping all along.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000e8', 'Stamp Priced Sibling',
        'c6060000-0000-4000-8000-000000000006', 'c6060000-0000-4000-8000-000000000006',
        'c6060000-0000-4000-8000-0000000000a1');

-- And after HT-3-e(1) the employer-tier half of her owner's standing is an
-- ARM'S-LENGTH RATE rather than that sibling, so a1 must also hold Stamp Priced's
-- rate card, written by a1's OWNER. Case (e) exists to measure bound (c) ("a
-- studio already prices these hours, there is nothing to repair"), and a standing
-- refusal arriving first would take the case's subject away. A studio that prices
-- a project has priced the person: this row is what makes e0's HT-3-b answer mean
-- money rather than 'none'.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6060000-0000-4000-8000-0000000000a1', 'c6060000-0000-4000-8000-000000000006', 24000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000001');

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
-- Both refusals are HT-3-d's standing bound: only an OWNER or ADMIN of the studio
-- being named may name it. In (c) the caller is the project's own designer, which
-- after HT-3-d buys her nothing at all in a studio she does not administer.
DO $$
DECLARE
  v_state text;
  v_got   uuid;
BEGIN
  -- (b) the plain member of Stamp Studio: not an owner or admin of it.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000003');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL b (HT-3-d): a plain studio member may not name a project''s studio — '
    'the stamp decides which studio takes the money and reads the notes; got '
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
    'FAIL c (HT-3-d): the project''s designer may not name a studio she neither '
    'owns nor administers — and she holds no seat in Stamp Outside at all, so '
    '00563''s own bound (replicated as bound (d)) refuses it too; got '
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
    'then freezes it. NOTE WHICH BOUND REFUSES THIS: her seat puts the attacker''s '
    'org INSIDE the designer''s employer tier, so HT-3-d''s tier bound does NOT '
    'reach this manoeuvre. Until round 7 the refusal was the retained W2-R3-01 leg '
    '("a studio that already holds a project this designer both LEADS and '
    'CREATED"); after HT-3-e(1) the employer tier asks instead for a '
    'studio_member_rates row for this designer that somebody other than she wrote, '
    'and the attacker has written none YET — case (t) writes one and measures what '
    'happens. Delete BOTH legs and this case measures the theft in one statement; '
    'got '
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
    'standing. (After HT-3-e(1) the employer tier no longer reads the sibling at '
    'all, so what refuses this call is the arm''s-length-rate leg — the attacker '
    'has authored no rate row for the victim designer in her org yet. Case (t) '
    'writes one and records what the ruling then permits. The sibling leg survives '
    'for the OWNED tier, and this case''s reasoning is why it keys on created_by.) '
    'Measured before the fix: seat + reassign + stamp, three '
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

-- ─── (t) HT-3-e(1)'s RESIDUE: the outsider the arm's-length rate does not bound ─
-- Runs after (d) and (k), on the same victim project and with the same two
-- statements, plus ONE more. HT-3-e(1) replaced round 3's sibling leg in the
-- EMPLOYER tier with "this studio already holds a studio_member_rates row for the
-- designer that somebody other than she wrote". The attacker can write that row
-- HERSELF: `studio_member_rates_admin_insert` asks only
-- `is_org_admin_or_owner(studio_id) AND created_by = auth.uid() AND EXISTS(subject
-- active non-guest)`, and case (d)'s consent-free seat supplied the subject. Her
-- own id in `created_by` is arm's-length TO THE DESIGNER, which is what the leg
-- tests — so the W2-R3-01 manoeuvre that rounds 3-6 refused is admitted again, in
-- THREE authenticated statements (seat, rate, stamp).
-- THIS ASSERTS A TAKING SUCCEEDING, deliberately and loudly, because the ruling in
-- force says so and because round 8 must not discover it: HT-3-e(1) is the
-- orchestrator's, the cost was weighed against W2-R7-01 (24 refusals of 24 left the
-- whole legacy population unrepairable), and the closure is the ALREADY-OWED HT-3-b
-- arm (c) consent door — seats land `invited` and only the named user activates her
-- own seat, which makes `status = 'active'` mean consent everywhere this file reads
-- it, and the stamp then has no victim to seat. IF THIS CASE FAILS, that door (or
-- another bound) landed: rewrite t3 to assert 42501 and the column to NULL.
DO $$
DECLARE
  v_wrote   integer;
  v_got     uuid;
  v_pricing uuid;
  v_rate    integer;
  v_source  text;
  v_rows    integer;
BEGIN
  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e5')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL t0 (precondition): the victim project must still be unstamped and '
    'unpriced after (k); got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000004');

  -- THE THIRD STATEMENT: she prices somebody else's designer in her own org.
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-0000000000a3', 'c6060000-0000-4000-8000-000000000002', 88800,
          (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000004');
  GET DIAGNOSTICS v_wrote = ROW_COUNT;

  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e5', 'c6060000-0000-4000-8000-0000000000a3') INTO v_got;
  PERFORM pg_temp.reset_role();

  ASSERT v_wrote = 1,
    'FAIL t1 (precondition): the attacker must be able to write a rate row for a '
    'designer she seated consent-free — studio_member_rates_admin_insert has no '
    'self-exclusion and no consent test (W2-R7-07). If this now fails, the rate '
    'policy changed and this case is measuring nothing';
  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a3',
    'FAIL t3 (RESIDUE, HT-3-e(1) — NOT A REGRESSION IF IT FAILS): with an '
    'arm''s-length rate row of her own authorship in place, the outsider''s stamp '
    'SUCCEEDS, and the victim project''s pricing studio moves into her org '
    'permanently (bound (b)). HT-3-e(1) dropped the sibling leg for the employer '
    'tier deliberately — round 3''s leg refused the entire legacy population it was '
    'meant to protect (W2-R7-01, 24 calls of 24) — and the rate leg it replaced it '
    'with reads the SUBJECT''s authorship, not the CALLER''s, so an attacker who '
    'writes the row herself satisfies it. Closure is the owed HT-3-b arm (c) '
    'consent door; got ' || COALESCE(v_got::text, 'NULL');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a3' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e5'),
    'FAIL t4 (RESIDUE): and the column is written, permanently';

  -- The money follows, and the number is the attacker's.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-00000000be01', 'c6060000-0000-4000-8000-0000000000e5',
          'c6060000-0000-4000-8000-000000000002', NOW() - INTERVAL '6 hours', 60, true,
          'manual_entry', 'an hour the designer logs on her own project');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be01';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 88800 AND v_source = 'studio_member',
    'FAIL t5 (RESIDUE — the money): the hour prices from the OUTSIDER''s rate card. '
    'HT-3-e(2) does not reach this one and is not meant to: the row is not '
    'self-authored, it is written by somebody with no relationship to the work; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000e5';
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0,
    'FAIL t6 (RESIDUE — the read): and the designer''s own studio owner reads none '
    'of it, because time_entries_owner_admin_read keys on the studio the stamp '
    'wrote; rows = ' || v_rows;

  RAISE NOTICE 'stamp_project_pricing_studio: case (t) recorded — HT-3-e(1) admits the W2-R3-01 outsider once she authors the rate (owed: HT-3-b arm (c)).';
END
$$;

-- ─── (e) HT-3-f(1): a project a studio already prices is PINNED, not refused ──
-- This case measured a REFUSAL through round 8 ("where HT-3-b already answers, the
-- owner HAS her read and there is nothing to repair"). Round 9 measured what that
-- reasoning assumed — that the derivation's answer cannot change — and it is false:
-- HT-3-b is recomputed on every hour for a NULL-studio project, so ONE ordinary
-- statement of the designer's (the shipped `Members can leave` DELETE on her own
-- organization_members row, or an `admin`'s UPDATE of it to status = 'removed')
-- emptied her employer tier, opened the OWNED tier, and moved her former employer's
-- legacy project onto her own workspace at the number she wrote for herself —
-- 99900 / studio_member / 199800 against the employer's own 26000 — with the
-- employer's owner then reading NONE of the project's hours and NO statement
-- available to repair it, before or after (W2-R9-01, probes C and D2, measured 1/1
-- through RLS with ONE account, no ownership transfer, no confederate).
-- HT-3-f(1) (RULED by the orchestrator 2026-09-12) is the PIN: naming the studio
-- the derivation ALREADY returns is a CONFIRM. It costs nobody anything — that
-- studio is already pricing these hours and already reading them — and afterwards
-- bound (b) and HT-3-c make the column final, so no later seat change re-derives it.
-- Nothing else is relaxed: bounds (a), (a2), (d) and (e) all sit on either side of
-- bound (c) and every one of them applies to a confirm unchanged.
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

  -- The actor is Stamp Studio's OWNER, with full HT-3-d standing: she owns the
  -- studio she names and a1 is in the designer's employer tier. So what follows is
  -- bound (c) answering, and not a standing refusal wearing the same clothes.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e4', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_state IS NULL AND v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL e2 (HT-3-f(1), THE PIN): an owner of the studio HT-3-b ALREADY names may '
    'write it down. A refusal here (the round 3-8 behaviour) leaves the employer '
    'with no statement at all, and the column then follows her designer''s next seat '
    'change — measured as a 99900 taking on the employer''s own legacy project '
    '(W2-R9-01, probe C). Got SQLSTATE '
    || COALESCE(v_state, 'none') || ' / returned ' || COALESCE(v_got::text, 'NULL');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a1' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e4'),
    'FAIL e3 (HT-3-f(1)): and the COLUMN must now carry it — the whole point of the '
    'pin is that the answer stops being recomputed. A confirm that returns the '
    'studio without writing the column buys the employer nothing';

  -- The pin is final, by bound (b) and HT-3-c, and finality is what makes it worth
  -- having: a retry of the same studio is a no-op, and ANOTHER studio is refused.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e4', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state IS NULL AND v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL e4: naming the studio the project already names stays a no-op (bound (b)), '
    'so a double-click on the pin is safe; got SQLSTATE '
    || COALESCE(v_state, 'none') || ' / returned ' || COALESCE(v_got::text, 'NULL');

  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e4', 'c6060000-0000-4000-8000-0000000000a2') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NOT NULL
     AND (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a1' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e4'),
    'FAIL e5 (bound (b), HT-3-c): once pinned the column is FINAL — a second call '
    'naming a DIFFERENT studio must raise (bound (a) or bound (b), whichever speaks '
    'first for this actor) and must leave the column exactly where the pin put it, '
    'or HT-3-f(1) has turned the repair act into a way to re-point a project '
    'somebody is already billing; got SQLSTATE ' || COALESCE(v_state, 'NO RAISE')
    || ' / returned ' || COALESCE(v_got::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (e) passed — HT-3-f(1) pins the derived studio and the pin is final.';
END
$$;

-- ─── (f) the designer is not standing in herself (HT-3-d, W2-R4-02) ────────
DO $$
DECLARE
  v_sql text;
  v_got uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  v_sql := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e2', 'c6060000-0000-4000-8000-0000000000a2') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_sql := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_sql = '42501',
    'FAIL f1 (HT-3-d, and W2-R4-02): the project''s own designer is a plain '
    '`member` of Stamp Second, and a member may not decide which of her employers '
    'permanently owns her hours, her money and HT-10''s read. HT-3-a''s ruled '
    'sentence is "the OWNER fixes ''none'' by stamping projects.studio_id", and '
    'bound (b) makes the choice final, so the choice is not hers to make; got '
    || COALESCE(v_sql, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e2'),
    'FAIL f2: the refused stamp must leave the column NULL';

  RAISE NOTICE 'stamp_project_pricing_studio: case (f) passed — the member does not choose.';
END
$$;

-- ─── (n) the repair HT-3-a names: the employer's ADMIN stamps ──────────────
DO $$
DECLARE
  v_got     uuid;
  v_pricing uuid;
  v_rate    integer;
  v_source  text;
BEGIN
  -- An ADMIN of Stamp Studio, not its owner — HT-3-d's standing is "owner or
  -- admin", and a1 already holds Stamp Sibling, which this designer both leads
  -- and created (the retained W2-R3-01 leg).
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000009');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e2', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL n1 (HT-3-d): an ADMIN of the studio being named may name it — that is '
    'HT-3-a''s ruled remedy performed by the studio that did the work; got '
    || COALESCE(v_got::text, 'NULL');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a1' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e2'),
    'FAIL n2: the column must actually be written — the DEFINER write must not '
    'meet set_project_studio_id''s authenticated arm';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000e2')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL n3: and HT-3-a step 1 must now answer with it; got '
    || COALESCE(v_pricing::text, 'NULL');

  -- The point of the repair: the designer's next hour prices from the EMPLOYER's
  -- rate card instead of filing 'none'.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000b2', 'c6060000-0000-4000-8000-0000000000e2',
          'c6060000-0000-4000-8000-000000000002', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b2';
  PERFORM pg_temp.reset_role();

  ASSERT v_rate = 25000 AND v_source = 'studio_member',
    'FAIL n4: after the employer''s admin repairs ''none'', the designer''s next '
    'hour must price at the EMPLOYER''s number (HT-3-a step 1 through HT-3); got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- The audit row the act now leaves (W2-R4-05).
  ASSERT 1 = (
    SELECT count(*) FROM audit_logs
    WHERE action = 'project.pricing_studio_stamped'
      AND resource_type = 'project'
      AND resource_id = 'c6060000-0000-4000-8000-0000000000e2'
      AND organization_id = 'c6060000-0000-4000-8000-0000000000a1'
      AND user_id = 'c6060000-0000-4000-8000-000000000009'
  ), 'FAIL n5 (W2-R4-05): the stamp is the one irreversible, money-moving act of '
     'this wave and it must leave exactly one audit_logs row naming the actor and '
     'the studio it wrote — in a wave that audits every time-entry UPDATE and '
     'DELETE, this act wrote nothing until round 4';

  RAISE NOTICE 'stamp_project_pricing_studio: case (n) passed — the employer repairs it.';
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

-- ─── (i) the retry is a no-op; standing is read before finality ─────────────
DO $$
DECLARE
  v_state text;
  v_got   uuid;
BEGIN
  -- Stamp Studio's owner, who has full standing on this project (she owns the
  -- studio it now names and a1 holds Stamp Sibling).
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;

  -- The same caller naming a DIFFERENT studio: HT-3-d's standing bound answers
  -- first, because she is neither owner nor admin of Stamp Second. A caller who
  -- HAS standing and names another studio is refused 22023 by bound (b) — case
  -- (p4) measures that, and this order means a stranger cannot use the error code
  -- to learn whether a project id exists and is stamped.
  v_state := NULL;
  BEGIN
    PERFORM public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e1', 'c6060000-0000-4000-8000-0000000000a2');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL i1: naming the studio the project already names is a no-op, so a retry '
    'is safe; got ' || COALESCE(v_got::text, 'NULL');
  ASSERT v_state = '42501',
    'FAIL i2 (HT-3-d): a caller who is not an owner or admin of the studio she '
    'names is refused on standing, whatever the project''s state; got '
    || COALESCE(v_state, 'NO RAISE');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a1' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000e1'),
    'FAIL i3: and the stamped project must still name the studio it named';

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
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000001'),
  ('c6060000-0000-4000-8000-0000000000a2', 'c6060000-0000-4000-8000-000000000008', 21000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000001');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000e7', 'Stamp Hire Legacy House',
        'c6060000-0000-4000-8000-000000000008', 'c6060000-0000-4000-8000-000000000001', NULL);

-- After HT-3-d the repair she is owed is her EMPLOYER's to perform, so Stamp
-- Studio must hold a project she both leads and created — one of the projects
-- 00563 has been stamping for her since she was hired, beside the legacy one from
-- before it. This is the retained W2-R3-01 leg, not a new arm.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000e9', 'Stamp Hire Sibling',
        'c6060000-0000-4000-8000-000000000008', 'c6060000-0000-4000-8000-000000000008',
        'c6060000-0000-4000-8000-0000000000a1');

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
  VALUES (v_workspace, 'c6060000-0000-4000-8000-000000000008', 99900, (NOW() AT TIME ZONE 'UTC')::date - 30,
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

  -- And after HT-3-d she may not name her EMPLOYER either: her seat there is a
  -- plain `member`, and which employer takes the hours is not hers to choose
  -- (W2-R4-02). Same session, same actor.
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000e7', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL l3b (HT-3-d, W2-R4-02): a plain member may not name the employer '
    'either — she can push the outcome toward ''none'' and no further; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  -- THE REPAIR SHE IS STILL OWED, performed by the studio that employs her:
  -- HT-3-a's ruled sentence, with a1's OWNER as the actor and the sibling she
  -- leads and created as the standing.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000001');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000e7', 'c6060000-0000-4000-8000-0000000000a1') INTO v_got;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000008');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000b8', 'c6060000-0000-4000-8000-0000000000e7',
          'c6060000-0000-4000-8000-000000000008', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b8';
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a1',
    'FAIL l4: and the repair she IS owed must still work — performed by the '
    'studio that employs her (HT-3-a''s ''none'' is repaired, not made '
    'permanent); got ' || COALESCE(v_got::text, 'NULL');
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

-- ─── (m) W2-R4-01: the confederate the designer can author ──────────────────
-- The shape is case (l)'s, because it is the ordinary one: designer role FIRST,
-- so 00295 provisions the one-person workspace she OWNS, then two plain `member`
-- employer seats, so her employer tier is AMBIGUOUS and her legacy project prices
-- 'none'. Round 3's bound (e) refused HER — and then round 4 measured the account
-- she seats doing it for her, which is why HT-3-d makes the tier a property of the
-- designer/studio pair rather than of the actor. Both preconditions of the
-- manoeuvre are asserted to SUCCEED, so the case cannot go vacuous: the
-- consent-free `admin` seat, and the named-studio sibling project that satisfies
-- the retained W2-R3-01 leg. With both of those in hand, the tier bound is the only
-- thing left standing between the confederate and the money.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-00000000000a', 'stamp-confed-designer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-00000000000b', 'stamp-confederate@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Confed Designer' WHERE id = 'c6060000-0000-4000-8000-00000000000a';
UPDATE profiles SET full_name = 'Stamp Confederate'     WHERE id = 'c6060000-0000-4000-8000-00000000000b';

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-00000000000a', id FROM roles WHERE name = 'studio_designer';

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-00000000000a', 'c6060000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-00000000000a', 'c6060000-0000-4000-8000-0000000000a2', 'member', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000ea', 'Stamp Confed Legacy House',
        'c6060000-0000-4000-8000-00000000000a', 'c6060000-0000-4000-8000-00000000000a', NULL);

DO $$
DECLARE
  v_workspace uuid;
  v_pricing   uuid;
  v_seated    integer;
  v_sibling   uuid;
  v_rate      integer;
  v_source    text;
  v_state     text;
  v_got       uuid;
BEGIN
  SELECT organization_id INTO v_workspace
  FROM organization_members
  WHERE user_id = 'c6060000-0000-4000-8000-00000000000a' AND role = 'owner';
  ASSERT v_workspace IS NOT NULL,
    'FAIL m0 (precondition): 00295 must have provisioned a workspace she OWNS — '
    'the ordinary consequence of a designer grant that precedes the first seat, '
    'and the studio this case is about';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000ea')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL m1 (precondition): two employer seats ⇒ HT-3-b''s employer tier is '
    'ambiguous ⇒ ''none''; got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000a');

  -- She prices HERSELF in her own workspace. Permitted, and the precondition of
  -- the whole finding (studio_member_rates_admin_insert asks only
  -- is_org_admin_or_owner, and 00295 made her the owner).
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'c6060000-0000-4000-8000-00000000000a', 99900, (NOW() AT TIME ZONE 'UTC')::date - 30,
          'c6060000-0000-4000-8000-00000000000a');

  -- THE MANOEUVRE, step 1 — seat a second account she controls as `admin`:
  -- `Org owners can insert members` asks only is_org_admin_or_owner(organization_id)
  -- AND role <> 'owner', with no consent gate and status DEFAULT 'active'.
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('c6060000-0000-4000-8000-00000000000b', v_workspace, 'admin');
  GET DIAGNOSTICS v_seated = ROW_COUNT;

  -- step 2 — her own named-studio sibling in that workspace, which satisfies the
  -- retained W2-R3-01 leg for the confederate (she leads it and created it, and
  -- `Lead designer can create projects` plus 00563's authenticated arm allow it).
  INSERT INTO projects (id, name, designer_id, created_by, studio_id)
  VALUES ('c6060000-0000-4000-8000-0000000000eb', 'Stamp Confed Workspace Sibling',
          'c6060000-0000-4000-8000-00000000000a', 'c6060000-0000-4000-8000-00000000000a',
          v_workspace);
  SELECT studio_id INTO v_sibling FROM projects
   WHERE id = 'c6060000-0000-4000-8000-0000000000eb';

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-0000000000b9', 'c6060000-0000-4000-8000-0000000000ea',
          'c6060000-0000-4000-8000-00000000000a', NOW() - INTERVAL '6 hours', 60, true,
          'manual_entry', 'hour one, before the manoeuvre');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b9';

  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000ea', v_workspace) INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_seated = 1,
    'FAIL m2 (precondition): the consent-free `admin` seat INSERT must actually '
    'SUCCEED — this case exists because `Org owners can insert members` permits '
    'it. If it now fails, the vector closed elsewhere and this case is measuring '
    'nothing';
  ASSERT v_sibling = v_workspace,
    'FAIL m3 (precondition): her own named-studio sibling project INSERT must '
    'actually SUCCEED, so that the confederate CLEARS the W2-R3-01 leg and the '
    'refusal below can only be HT-3-d''s tier bound. If this fails, the case is '
    'measuring the wrong bound; got ' || COALESCE(v_sibling::text, 'NULL');
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL m4 (precondition): her first hour must price ''none'' (HT-3-a step 3); '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_state = '42501',
    'FAIL m5: her OWN stamp of the workspace must be refused (the round-3 bound, '
    'kept by HT-3-d); got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  -- THE FINDING: the confederate — an `admin` of her workspace, no designer role,
  -- nothing else. Measured succeeding in round 4 (W2-R4-01).
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000b');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000ea', v_workspace) INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_state = '42501',
    'FAIL m6 (W2-R4-01, THE MAJOR OF ROUND 4): an account the designer seats '
    '`admin` in her own workspace must NOT be able to stamp it. Measured before '
    'HT-3-d: the confederate''s stamp SUCCEEDED where the designer''s was refused, '
    'the project''s pricing studio became the workspace PERMANENTLY (bound (b)), '
    'her next hour came back 99900 / studio_member at the rate she wrote for '
    'herself, and neither employer could read the project, the hour or the rate. '
    'The tier bound must be a property of (the designer, p_studio_id), never of '
    'the actor — the designer authors the actor; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000ea'),
    'FAIL m7: the refused stamp must leave the column NULL — bound (b) makes it '
    'final, so a wrong write here can never be taken back';

  -- And the outcome she CAN reach is 'none', which is HT-3-b's operative sentence.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000a');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000ba', 'c6060000-0000-4000-8000-0000000000ea',
          'c6060000-0000-4000-8000-00000000000a', NOW() - INTERVAL '1 hour', 45, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000ba';
  PERFORM pg_temp.reset_role();

  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL m8: her next hour must still price ''none'' — a member can push the '
    'outcome toward ''none'' and no further (HT-3-b); got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (m) passed — the confederate buys nothing.';
END
$$;

-- ─── (o) HT-3-d's OWNED tier: the designer with no employer at all ──────────
-- Designer role first (so 00295 provisions the workspace she owns), no employer
-- seat anywhere, and a SECOND active studio she owns with another principal —
-- its ADMIN — beside her. Two owned candidates ⇒ HT-3-b prices her by neither ⇒
-- her legacy projects are
-- 'none', and this stamp is the only repair that exists for her (HT-3-c arm (a),
-- and the principal of cases (n)/(w) of time_rate_resolution_test.sql).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-00000000000c', 'stamp-proprietor@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-00000000000d', 'stamp-coowner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Proprietor' WHERE id = 'c6060000-0000-4000-8000-00000000000c';
UPDATE profiles SET full_name = 'Stamp Coowner'    WHERE id = 'c6060000-0000-4000-8000-00000000000d';

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-00000000000c', id FROM roles WHERE name = 'studio_designer';

INSERT INTO organizations (id, type, name, slug, status)
VALUES ('c6060000-0000-4000-8000-0000000000a5', 'design_studio', 'Stamp Owned Two', 'stamp-owned-two-test', 'active');

-- She is the studio's OWNER; the second principal is its ADMIN (00484's
-- guard_org_membership_changes admits only the FIRST owner row of an org without
-- an owner-actor, which is why this fixture seats an admin rather than a
-- co-owner — the review's shape, with the reachable seat shape).
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-00000000000c', 'c6060000-0000-4000-8000-0000000000a5', 'owner', 'active', NOW()),
  ('c6060000-0000-4000-8000-00000000000d', 'c6060000-0000-4000-8000-0000000000a5', 'admin', 'active', NOW());

-- That studio prices her; her own workspace will price her 99900 below.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6060000-0000-4000-8000-0000000000a5', 'c6060000-0000-4000-8000-00000000000c', 30000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-00000000000d');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6060000-0000-4000-8000-0000000000ec', 'Stamp Proprietor Legacy One',
   'c6060000-0000-4000-8000-00000000000c', 'c6060000-0000-4000-8000-00000000000c', NULL),
  ('c6060000-0000-4000-8000-0000000000ed', 'Stamp Proprietor Legacy Two',
   'c6060000-0000-4000-8000-00000000000c', 'c6060000-0000-4000-8000-00000000000c', NULL);

DO $$
DECLARE
  v_workspace uuid;
  v_pricing   uuid;
  v_rate      integer;
  v_source    text;
  v_got       uuid;
  v_rows      integer;
BEGIN
  SELECT organization_id INTO v_workspace
  FROM organization_members
  WHERE user_id = 'c6060000-0000-4000-8000-00000000000c'
    AND role = 'owner'
    AND organization_id <> 'c6060000-0000-4000-8000-0000000000a5';
  ASSERT v_workspace IS NOT NULL,
    'FAIL o0 (precondition): 00295 must have provisioned her one-person workspace '
    'beside the studio she owns — that is what makes the OWNED tier ambiguous';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000ec')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL o1 (precondition): no employer seat and TWO owned studios ⇒ HT-3-b '
    'prices her by neither; got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000c');

  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'c6060000-0000-4000-8000-00000000000c', 99900, (NOW() AT TIME ZONE 'UTC')::date - 30,
          'c6060000-0000-4000-8000-00000000000c');

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000bb', 'c6060000-0000-4000-8000-0000000000ec',
          'c6060000-0000-4000-8000-00000000000c', NOW() - INTERVAL '7 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000bb';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL o2 (precondition): her first hour must price ''none''; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- THE REPAIR HT-3-c arm (a) leaves her: she owns the studio she names, she holds
  -- no employer seat anywhere, so the OWNED tier is the tier HT-3-d reads.
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000ec', 'c6060000-0000-4000-8000-0000000000a5') INTO v_got;

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000bc', 'c6060000-0000-4000-8000-0000000000ec',
          'c6060000-0000-4000-8000-00000000000c', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000bc';
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a5',
    'FAIL o3 (HT-3-c arm (a) through HT-3-d''s owned tier): a designer who holds '
    'NO employer seat may name a studio she owns, and she is its owner so HT-3-d''s '
    'caller bound is satisfied. Refusing her leaves the principal of '
    'time_rate_resolution_test cases (n)/(w) with no repair at all; got '
    || COALESCE(v_got::text, 'NULL');
  ASSERT v_rate = 30000 AND v_source = 'studio_member',
    'FAIL o4: and her next hour must price from the studio she NAMED, not from the '
    'other candidate; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000d');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000ec';
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 2,
    'FAIL o5: the admin of the studio now named must read the work (HT-10''s '
    'owner/admin read, reachable); rows = ' || v_rows;

  -- THE RESIDUE, PINNED ON PURPOSE (W2-R4-03). Both owned candidates are in her
  -- tier, so the workspace whose rate card she writes herself is nameable too —
  -- on her SECOND legacy project, since the first is now final. HT-3-d permits
  -- this; the review asked a ruling about it and the ruling went this way. If this
  -- assert ever fails it is a RULING CHANGE, not a regression: narrow the owned
  -- branch to "her only active studio", or land HT-3-b arm (c)'s consent door.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000c');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000ed', v_workspace) INTO v_got;
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000bd', 'c6060000-0000-4000-8000-0000000000ed',
          'c6060000-0000-4000-8000-00000000000c', NOW() - INTERVAL '3 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000bd';
  PERFORM pg_temp.reset_role();

  ASSERT v_got = v_workspace AND v_rate = 99900 AND v_source = 'studio_member',
    'FAIL o6 (W2-R4-03, the RESIDUE HT-3-d permits): with no employer seat and two '
    'owned studios, the 00295 workspace whose rate card she writes is in her tier '
    'too, so she may name it and her hour prices at her own number. This is '
    'ASSERTED rather than hidden: if it changes, a ruling changed; got '
    || COALESCE(v_got::text, 'NULL') || ' / ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (o) passed — the owned tier, and its residue.';
END
$$;

-- ─── (p) HT-3-d with two employers: either studio, and then final ───────────
-- Seats first, designer role after, so 00295 provisions nothing and both her
-- studios are employers. Each holds a project she leads and created (the retained
-- W2-R3-01 leg) and each has an ADMIN, so each has full standing on her legacy
-- projects — which is precisely the "two genuine studios" shape W2-R3-06 and
-- W2-R4-02 asked about: the MEMBER does not choose, and the first stamp wins.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-00000000000e', 'stamp-twohire@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-00000000000f', 'stamp-six-admin@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000010', 'stamp-seven-admin@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Two Hire'     WHERE id = 'c6060000-0000-4000-8000-00000000000e';
UPDATE profiles SET full_name = 'Stamp Six Admin'    WHERE id = 'c6060000-0000-4000-8000-00000000000f';
UPDATE profiles SET full_name = 'Stamp Seven Admin'  WHERE id = 'c6060000-0000-4000-8000-000000000010';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6060000-0000-4000-8000-0000000000a6', 'design_studio', 'Stamp Six',   'stamp-six-test',   'active'),
  ('c6060000-0000-4000-8000-0000000000a7', 'design_studio', 'Stamp Seven', 'stamp-seven-test', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-00000000000e', 'c6060000-0000-4000-8000-0000000000a6', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-00000000000e', 'c6060000-0000-4000-8000-0000000000a7', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-00000000000f', 'c6060000-0000-4000-8000-0000000000a6', 'admin',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000010', 'c6060000-0000-4000-8000-0000000000a7', 'admin',  'active', NOW());

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-00000000000e', id FROM roles WHERE name = 'studio_designer';

-- Each employer prices her, each row written by that studio's own ADMIN — which is
-- HT-3-e(1)'s employer-tier standing (an arm's-length rate), the leg that replaced
-- round 3's sibling requirement for this tier. Both siblings below stay, because
-- they are what the OWNED tier still asks for and because p4's comment depends on
-- the caller having every kind of standing there is.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES
  ('c6060000-0000-4000-8000-0000000000a6', 'c6060000-0000-4000-8000-00000000000e', 22000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-00000000000f'),
  ('c6060000-0000-4000-8000-0000000000a7', 'c6060000-0000-4000-8000-00000000000e', 23000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000010');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6060000-0000-4000-8000-0000000000f0', 'Stamp Six Sibling',
   'c6060000-0000-4000-8000-00000000000e', 'c6060000-0000-4000-8000-00000000000e',
   'c6060000-0000-4000-8000-0000000000a6'),
  ('c6060000-0000-4000-8000-0000000000f1', 'Stamp Seven Sibling',
   'c6060000-0000-4000-8000-00000000000e', 'c6060000-0000-4000-8000-00000000000e',
   'c6060000-0000-4000-8000-0000000000a7'),
  ('c6060000-0000-4000-8000-0000000000ee', 'Stamp Two Legacy One',
   'c6060000-0000-4000-8000-00000000000e', 'c6060000-0000-4000-8000-00000000000e', NULL),
  ('c6060000-0000-4000-8000-0000000000ef', 'Stamp Two Legacy Two',
   'c6060000-0000-4000-8000-00000000000e', 'c6060000-0000-4000-8000-00000000000e', NULL);

DO $$
DECLARE
  v_state text;
  v_got   uuid;
BEGIN
  ASSERT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000ee') IS NULL
     AND public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000ef') IS NULL,
    'FAIL p0 (precondition): two employer seats ⇒ both legacy projects price '
    '''none''';

  -- The designer herself, a plain `member` of both: neither is hers to name.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000e');
  v_state := NULL;
  BEGIN
    PERFORM public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000ee', 'c6060000-0000-4000-8000-0000000000a6');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL p1 (HT-3-d, W2-R4-02): the member being priced must not choose which of '
    'her employers permanently owns the hours, the money and HT-10''s read — '
    'neither studio, not even one of them; got ' || COALESCE(v_state, 'NO RAISE');

  -- Stamp Six's ADMIN names Stamp Six.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000000f');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000ee', 'c6060000-0000-4000-8000-0000000000a6') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a6',
    'FAIL p2 (HT-3-d): an admin of an EMPLOYER studio may name it; got '
    || COALESCE(v_got::text, 'NULL');

  -- EITHER employer: Stamp Seven's ADMIN names Stamp Seven, on her other project.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000010');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000ef', 'c6060000-0000-4000-8000-0000000000a7') INTO v_got;

  -- AND THE STAMP IS FINAL (bound (b)) — the same caller, with FULL standing
  -- (admin of Stamp Seven, which holds a project this designer leads and created),
  -- on the project Stamp Six already took. 22023, not 42501: this is finality
  -- answering, not standing.
  v_state := NULL;
  BEGIN
    PERFORM public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000ee', 'c6060000-0000-4000-8000-0000000000a7');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a7',
    'FAIL p3 (HT-3-d): EITHER employer''s admin may name their own studio — the '
    'tier holds both candidates and nothing ranks them; got '
    || COALESCE(v_got::text, 'NULL');
  ASSERT v_state = '22023',
    'FAIL p4 (bound (b), HT-3-c): the first stamp is FINAL — re-pointing a stamped '
    'project at another studio would move priced, invoiced hours onto another '
    'studio''s books. Note the code: 22023 is finality, and a caller without '
    'standing gets 42501 before ever reaching it (case (i)); got '
    || COALESCE(v_state, 'NO RAISE');
  ASSERT (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a6' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000ee')
     AND (SELECT studio_id = 'c6060000-0000-4000-8000-0000000000a7' FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000ef'),
    'FAIL p5: each project must name the studio that stamped it, and the refused '
    're-stamp must have moved nothing';

  RAISE NOTICE 'stamp_project_pricing_studio: case (p) passed — either employer, once.';
END
$$;

-- ─── (q) W2-R5-01: she writes her own role, and the repair becomes a taking ──
-- ROUND 5's MAJOR, and the worst shape this act has reached. At BASELINE this
-- project is priced CORRECTLY by an honest employer — so the manoeuvre does not
-- repair 'none', it MANUFACTURES 'none' and then takes the work, permanently
-- (bound (b)). Two authenticated statements do it with the designer as the SOLE
-- actor, both of them live product affordances:
--   1. INSERT INTO organization_members (any user id, her own workspace, 'admin')
--      — `Org owners can insert members` asks only is_org_admin_or_owner(org)
--      AND role <> 'owner'; there is no consent gate and status DEFAULTs 'active'.
--   2. transfer_studio_ownership(her workspace, that user) — whose last statement
--      DEMOTES auth.uid() to 'admin' (00484:524-536). "Make owner" sits on her own
--      studio settings page (apps/designer-portal/src/components/document/account/
--      account-studio-page.tsx:1554).
-- Her 00295 workspace is then a seat with role <> 'owner' — inside her own
-- EMPLOYER tier — while 'admin' still satisfies is_org_admin_or_owner (bound (a)'s
-- standing) and studio_member_rates_admin_insert (the 99900 she writes herself).
-- HT-3-d's tier is a ROLE test and she can WRITE her own role, so HT-3-d's
-- operative sentence ("a designer naming her own workspace while she has any
-- employer is refused") was measurably FALSE until bound (e2).
-- Every step of the manoeuvre is asserted to SUCCEED, so the case cannot go
-- vacuous, and the baseline is asserted PRICED so that the theft is visible as a
-- theft rather than as a repair.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-000000000011', 'stamp-selfrole-designer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000012', 'stamp-selfrole-confed@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000013', 'stamp-quiet-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Selfrole Designer' WHERE id = 'c6060000-0000-4000-8000-000000000011';
UPDATE profiles SET full_name = 'Stamp Selfrole Confed'   WHERE id = 'c6060000-0000-4000-8000-000000000012';
UPDATE profiles SET full_name = 'Stamp Quiet Owner'       WHERE id = 'c6060000-0000-4000-8000-000000000013';

INSERT INTO organizations (id, type, name, slug, status)
VALUES ('c6060000-0000-4000-8000-0000000000a8', 'design_studio', 'Stamp Quiet', 'stamp-quiet-test', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c6060000-0000-4000-8000-000000000013', 'c6060000-0000-4000-8000-0000000000a8', 'owner', 'active', NOW());

-- The legacy project is inserted while she holds NO seat and NO designer role, so
-- 00563/00602 find zero candidates and the column stays NULL. That is the only way
-- the legacy shape arises, and it is case (e)'s fixture pattern.
-- TWO legacy projects, not one (round 6): q7 measures HER OWN stamp and q8 the
-- stamp by the account she handed the title to, each on its own project, so
-- neither half is a no-op retry of the other. Both are priced CORRECTLY by the
-- honest employer at baseline (asserted q1 / q1b).
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000f2', 'Stamp Selfrole Legacy House',
        'c6060000-0000-4000-8000-000000000011', 'c6060000-0000-4000-8000-000000000011', NULL),
       ('c6060000-0000-4000-8000-0000000000f8', 'Stamp Selfrole Legacy Cottage',
        'c6060000-0000-4000-8000-000000000011', 'c6060000-0000-4000-8000-000000000011', NULL),
       -- Round 7 adds a THIRD, because HT-3-e(3)'s accepted residual has two
       -- callers once the cooperating account has authored her rate: that account
       -- (the path the ruling names) and SHE herself. Each takes its own project,
       -- so neither measurement is a retry of the other.
       ('c6060000-0000-4000-8000-0000000000f9', 'Stamp Selfrole Legacy Barn',
        'c6060000-0000-4000-8000-000000000011', 'c6060000-0000-4000-8000-000000000011', NULL);

-- Designer role FIRST (so 00295 provisions the one-person workspace she OWNS),
-- the single honest employer seat AFTER — which makes her employer tier exactly
-- one and prices the legacy project CORRECTLY with no manoeuvre at all.
INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000011', id FROM roles WHERE name = 'studio_designer';

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c6060000-0000-4000-8000-000000000011', 'c6060000-0000-4000-8000-0000000000a8', 'member', 'active', NOW());

INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6060000-0000-4000-8000-0000000000a8', 'c6060000-0000-4000-8000-000000000011', 25000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000013');

DO $$
DECLARE
  v_workspace uuid;
  v_pricing   uuid;
  v_role      text;
  v_seated    integer;
  v_sibling   uuid;
  v_rate      integer;
  v_source    text;
  v_rated     integer;
  v_rows      integer;
  v_state     text;
  v_got       uuid;
BEGIN
  SELECT organization_id INTO v_workspace
  FROM organization_members
  WHERE user_id = 'c6060000-0000-4000-8000-000000000011' AND role = 'owner';
  ASSERT v_workspace IS NOT NULL,
    'FAIL q0 (precondition): 00295 must have provisioned a workspace she OWNS';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f2')
    INTO v_pricing;
  ASSERT 'c6060000-0000-4000-8000-0000000000a8'
           = public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f8'),
    'FAIL q1b (precondition): and so is the second legacy project, the one the '
    'confederate takes in q8 — each half of this case takes a project that was '
    'priced correctly a moment earlier';
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000a8',
    'FAIL q1 (precondition, AND THE POINT OF THIS CASE): at baseline the HONEST '
    'employer prices this project — exactly one employer seat, so HT-3-b answers. '
    'Nothing here needs repairing, which is why the manoeuvre below is a TAKING '
    'and not a repair; got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000011');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-0000000000b3', 'c6060000-0000-4000-8000-0000000000f2',
          'c6060000-0000-4000-8000-000000000011', NOW() - INTERVAL '8 hours', 60, true,
          'manual_entry', 'an honest hour, priced by the employer');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b3';
  PERFORM pg_temp.reset_role();

  ASSERT v_rate = 25000 AND v_source = 'studio_member',
    'FAIL q2 (precondition): and her hours price at the EMPLOYER''s number before '
    'the manoeuvre; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000011');

  -- STEP 1 — the consent-free `admin` seat for an account she controls.
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('c6060000-0000-4000-8000-000000000012', v_workspace, 'admin');
  GET DIAGNOSTICS v_seated = ROW_COUNT;

  -- STEP 2 — she hands ownership to it, which DEMOTES HER OWN ROW to 'admin'.
  PERFORM public.transfer_studio_ownership(v_workspace, 'c6060000-0000-4000-8000-000000000012');

  SELECT role INTO v_role FROM organization_members
   WHERE organization_id = v_workspace
     AND user_id = 'c6060000-0000-4000-8000-000000000011';

  -- She prices herself at the number she chooses: 'admin' satisfies
  -- studio_member_rates_admin_insert just as 'owner' did.
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'c6060000-0000-4000-8000-000000000011', 99900, (NOW() AT TIME ZONE 'UTC')::date - 30,
          'c6060000-0000-4000-8000-000000000011');

  -- And her own sibling project naming the workspace, which CLEARS the retained
  -- W2-R3-01 `created_by` leg for any caller who is not her.
  INSERT INTO projects (id, name, designer_id, created_by, studio_id)
  VALUES ('c6060000-0000-4000-8000-0000000000f3', 'Stamp Selfrole Workspace Sibling',
          'c6060000-0000-4000-8000-000000000011', 'c6060000-0000-4000-8000-000000000011',
          v_workspace);
  SELECT studio_id INTO v_sibling FROM projects
   WHERE id = 'c6060000-0000-4000-8000-0000000000f3';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f2')
    INTO v_pricing;

  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000f2', v_workspace) INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_seated = 1,
    'FAIL q3 (precondition): the consent-free `admin` seat INSERT must actually '
    'SUCCEED — if it now fails, the vector closed elsewhere and this case is '
    'measuring nothing';
  ASSERT v_role = 'admin',
    'FAIL q4 (precondition, THE MECHANISM): transfer_studio_ownership must leave '
    'HER OWN row at role ''admin'' in the studio she controls — that is what moves '
    'her 00295 workspace from HT-3-d''s OWNED tier into its EMPLOYER tier, and it '
    'is one authenticated RPC call from her own studio settings page. If this '
    'fails, 00484''s transfer stopped demoting auth.uid() and W2-R5-01''s '
    'mechanism is gone; got ' || COALESCE(v_role, 'NULL');
  ASSERT v_sibling = v_workspace,
    'FAIL q5 (precondition): her own named-studio sibling in the workspace must '
    'SUCCEED, so that the W2-R3-01 `created_by` leg is CLEARED and the refusals '
    'below can only be the tier bounds; got ' || COALESCE(v_sibling::text, 'NULL');
  ASSERT v_pricing IS NULL,
    'FAIL q6 (precondition, AND THE HARM): after two statements her employer tier '
    'holds TWO studios, so HT-3-b answers ''none'' and bound (c) is satisfied — she '
    'MANUFACTURED the precondition the repair exists for, on a project that was '
    'priced correctly a moment ago; got ' || COALESCE(v_pricing::text, 'NULL');

  -- ── ROUND 7: HT-3-e(1) + HT-3-e(2) CLOSE THE SELF-AUTHORED FORM ──────────
  -- Round 5 answered q7 with bound (e2) and round 6 reversed it (W2-R6-01): it
  -- refused the honest admin-designer of case (s), whom HT-3-d admits expressly,
  -- and it did not raise the account cost of THIS manoeuvre at all. HT-3-e(1) and
  -- HT-3-e(2) (RULED 2026-09-12) answer it where the manoeuvre actually lives:
  --   · at the STAMP, the employer tier now asks the named studio for a
  --     studio_member_rates row for this designer that somebody OTHER than she
  --     wrote. Her workspace holds exactly one row and she wrote it, so BOTH her
  --     own stamp (q7) and the confederate's (q8) are REFUSED — the first time
  --     either half of this case has been.
  --   · at the RATE (migration 00615), a row whose created_by is its own user_id
  --     prices only where that person OWNS the studio. She demoted herself to
  --     'admin' to enter her own employer tier, so the row cannot price her hour
  --     even if the studio were named.
  -- Her hours therefore file 'none' (q10) — the state she manufactured, with no
  -- money moved — and the HONEST employer can still repair the project afterwards
  -- (q11/q12), which is the whole point of keeping the act.
  -- WHAT REMAINS IS HT-3-e(3)'s ACCEPTED RESIDUAL, asserted here as PASSING: the
  -- account she handed the workspace to may AUTHOR her rate row, and the row is
  -- then arm's-length by both tests. Patina answers that with VISIBILITY (the
  -- pricing studio is a column of time_entry_ledger, shown in the owner's project
  -- lens — lane B) rather than with another bound, and the ruling says so. If
  -- q13/q14/q15 ever fail, a further ruling landed: rewrite them to 42501/'none'.
  ASSERT v_state = '42501',
    'FAIL q7 (HT-3-e(1), ROUND 7 — this was the OPEN half until round 7): she '
    'stamps the workspace she handed to a confederate a statement ago, on a project '
    'an honest employer was pricing CORRECTLY, and she must now be REFUSED — the '
    'workspace holds no rate row for her that anybody else wrote. Bound (e)''s '
    '`role <> ''owner''` test still cannot see the role she WROTE, which is why the '
    'refusal comes from the arm''s-length-rate leg and not from the tier. A FAILURE '
    'HERE means the employer arm stopped asking for an arm''s-length rate, and '
    'W2-R5-01''s sole-actor taking is open again; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000f2'),
    'FAIL q7b (HT-3-e(1)): and the refused stamp must leave the column NULL, so '
    'the honest employer can still repair it (q11)';

  -- The SECOND half, on its OWN project: the account she handed the title to has
  -- the same standing she does (is_org_admin_or_owner of the workspace) and bound
  -- (a2)'s old sibling leg is one she authored herself above — which is exactly why
  -- that leg was never the bound that mattered here. The arm's-length RATE leg is,
  -- and it refuses him too, because the only rate row in the workspace is hers.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000012');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000f8', v_workspace) INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_state = '42501',
    'FAIL q8 (HT-3-e(1), ROUND 7): the account she handed her workspace to is '
    'refused the second project for the same reason — the studio it names holds '
    'only the rate row SHE wrote. Until round 7 this half succeeded, and it was the '
    'reason (e2) bought nothing; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-0000000000f8'),
    'FAIL q9 (HT-3-e(1)): that column must be NULL too';

  -- THE MONEY, which is what the finding was about: her next hour files 'none'
  -- rather than her own 99900. She manufactured 'none' and 'none' is what she got.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000011');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000b4', 'c6060000-0000-4000-8000-0000000000f2',
          'c6060000-0000-4000-8000-000000000011', NOW() - INTERVAL '7 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_rated
  FROM project_time_entries WHERE id = 'c6060000-0000-4000-8000-0000000000b4';
  PERFORM pg_temp.reset_role();

  ASSERT v_rate IS NULL AND v_source = 'none' AND v_rated IS NULL,
    'FAIL q10 (THE MONEY, ROUND 7): before HT-3-e her hours came back '
    '99900 / studio_member / 199800 — the number SHE set, on an employer''s '
    'project. The stamps are refused now, her tier is ambiguous, and HT-3-a step 3 '
    'answers ''none''. Note what this is NOT: it is not a repair of the harm she did '
    'to herself (her own hours stay unpriced until somebody with standing acts) — it '
    'is the absence of the taking; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rated::text, 'NULL');

  -- AND THE HONEST EMPLOYER CAN STILL PUT IT RIGHT. This is the half W2-R7-01 said
  -- HT-3-e(1) exists for: a8 holds her rate card, written by a8's OWNER, so that
  -- studio has standing on her legacy project even though it holds no project she
  -- created. Under round 6's body this call was refused for want of a sibling.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000013');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000f2', 'c6060000-0000-4000-8000-0000000000a8') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000a8',
    'FAIL q11 (HT-3-e(1), the REPAIR): the honest employer''s OWNER must be able to '
    'name her own studio on the project after the manoeuvre failed — she holds no '
    'project this designer created, and round 3''s sibling leg refused her for it '
    '(W2-R7-01); got ' || COALESCE(v_got::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000011');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be02', 'c6060000-0000-4000-8000-0000000000f2',
          'c6060000-0000-4000-8000-000000000011', NOW() - INTERVAL '6 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be02';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 25000 AND v_source = 'studio_member',
    'FAIL q12 (HT-3-e(1) + HT-3-e(2), the REPAIR''s money): and her hours price at '
    'the EMPLOYER''s 25000 again — her own 99900 row lives in a studio the project '
    'does not name, and would not price there anyway (she is its ''admin'', not its '
    'owner); got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  -- ── HT-3-e(3), THE ACCEPTED RESIDUAL — asserted as PASSING ────────────────
  -- One more statement by the cooperating account, and both stamps come back: it
  -- AUTHORS her rate row in the workspace it now owns. created_by is then not her
  -- id, so the leg at the stamp is satisfied and HT-3-e(2) lets the row price.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000012');
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'c6060000-0000-4000-8000-000000000011', 99900, (NOW() AT TIME ZONE 'UTC')::date - 20,
          'c6060000-0000-4000-8000-000000000012');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000f8', v_workspace) INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = v_workspace,
    'FAIL q13 (RESIDUE, HT-3-e(3) — NOT A REGRESSION IF IT FAILS): the account she '
    'handed the workspace to AUTHORS her rate there, and its stamp then succeeds. '
    'This is the residual HT-3-e(3) ACCEPTS by name: a designer running a second '
    'account can still take her own legacy project at her own number. Patina makes '
    'it visible — time_entry_ledger carries the pricing studio and the owner''s '
    'project lens shows it — rather than impossible; got '
    || COALESCE(v_got::text, 'NULL');

  -- And from HER side too, on the third project: once somebody else has authored
  -- the row, the employer arm admits the designer herself exactly as it admits the
  -- honest admin-designer of case (s). HT-3-e(3) names the account's stamp; this is
  -- the same residual with the actors swapped, recorded so neither is a surprise.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000011');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000f9', v_workspace) INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = v_workspace,
    'FAIL q14 (RESIDUE, HT-3-e(3), the same door from her side — NOT A REGRESSION '
    'IF IT FAILS): with an arm''s-length row in place she stamps the third legacy '
    'project herself. The act cannot tell her from case (s)''s honest '
    'admin-designer, which is the price HT-3-d''s "there is no other arm" was ruled '
    'to pay; got ' || COALESCE(v_got::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000011');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be03', 'c6060000-0000-4000-8000-0000000000f8',
          'c6060000-0000-4000-8000-000000000011', NOW() - INTERVAL '5 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_rated
  FROM project_time_entries WHERE id = 'c6060000-0000-4000-8000-00000000be03';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 99900 AND v_source = 'studio_member' AND v_rated = 199800,
    'FAIL q15 (RESIDUE, HT-3-e(3) — the money): her hours on the taken project '
    'price at 99900 / 199800, the number the cooperating account wrote for her. '
    'HT-3-e(2) does not reach it — the row is not self-authored — and HT-3-e(3) '
    'accepts it; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rated::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000013');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id IN ('c6060000-0000-4000-8000-0000000000f8',
                        'c6060000-0000-4000-8000-0000000000f9');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0,
    'FAIL q16 (RESIDUE — the read): the honest employer''s OWNER reads 0 rows of '
    'the two projects the residual took, and cannot re-stamp either (bound (b)). '
    'She DOES read the one she recovered at q11, which is the difference round 7 '
    'made. Rows = ' || v_rows;

  RAISE NOTICE 'stamp_project_pricing_studio: case (q) — the self-authored taking is CLOSED (HT-3-e(1)+(2)); HT-3-e(3)''s accepted residual is recorded.';
END
$$;

-- ─── (r) W2-R5-02: the consent door, made IRREVERSIBLE through the stamp ─────
-- The retained W2-R3-01 `created_by` sibling leg is safe only against an
-- UNWILLING victim. When the designer is the one gaming, she SUPPLIES the sibling
-- herself, and the leg stops bounding the confederate entirely. Measured:
--   · baseline — one honest employer prices the legacy project correctly;
--   · a confederate who owns ANY organization seats her in it consent-free as
--     `member` (`Org owners can insert members`) and writes her 99900 there, which
--     makes her employer tier ambiguous and the project ''none'';
--   · SHE inserts a project naming his org (designer = her, created_by = her),
--     which clears bound (a2) for him;
--   · her own stamp is correctly refused (plain member, bound (a)) — and HIS
--     SUCCEEDS;
--   · then the CAUSE is removed: he deletes her seat. The project still prices
--     from his org, a LATER hour still prices 99900, and he still reads the
--     employer's work. Round 4 ruled that W2-R2-04's consent door must not become
--     irreversible; through the stamp it now is.
-- THIS CASE ASSERTS A TAKING SUCCEEDING, deliberately, for the same reason as
-- (q) q8-q11: the closure is the OWED HT-3-b arm (c) consent door (seats land
-- 'invited'; only the named user activates her own seat), which is a ruling and is
-- not guessed here. IF THIS CASE FAILS, that ruling landed: rewrite it to assert
-- 42501 on r6 and NULL on r7.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-000000000014', 'stamp-willing-designer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000015', 'stamp-rosewood-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000016', 'stamp-rogue-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Willing Designer' WHERE id = 'c6060000-0000-4000-8000-000000000014';
UPDATE profiles SET full_name = 'Stamp Rosewood Owner'   WHERE id = 'c6060000-0000-4000-8000-000000000015';
UPDATE profiles SET full_name = 'Stamp Rogue Owner'      WHERE id = 'c6060000-0000-4000-8000-000000000016';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6060000-0000-4000-8000-0000000000a9', 'design_studio', 'Stamp Rosewood', 'stamp-rosewood-test', 'active'),
  ('c6060000-0000-4000-8000-0000000000aa', 'design_studio', 'Stamp Rogue',    'stamp-rogue-test',    'active');

-- Legacy project first (no seats, no role ⇒ no candidates ⇒ column NULL).
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000f4', 'Stamp Willing Legacy House',
        'c6060000-0000-4000-8000-000000000014', 'c6060000-0000-4000-8000-000000000014', NULL);

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-000000000015', 'c6060000-0000-4000-8000-0000000000a9', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000016', 'c6060000-0000-4000-8000-0000000000aa', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000014', 'c6060000-0000-4000-8000-0000000000a9', 'member', 'active', NOW());

-- Seat before role, so 00295 provisions nothing: her only studio is the honest
-- employer, and the legacy project prices from it.
INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000014', id FROM roles WHERE name = 'studio_designer';

INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6060000-0000-4000-8000-0000000000a9', 'c6060000-0000-4000-8000-000000000014', 25000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000015');

DO $$
DECLARE
  v_pricing uuid;
  v_seated  integer;
  v_removed integer;
  v_sibling uuid;
  v_rate    integer;
  v_source  text;
  v_state   text;
  v_got     uuid;
  v_rows    integer;
BEGIN
  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f4')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000a9',
    'FAIL r1 (precondition): the HONEST employer prices this project at baseline — '
    'nothing needs repairing; got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000014');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-0000000000b6', 'c6060000-0000-4000-8000-0000000000f4',
          'c6060000-0000-4000-8000-000000000014', NOW() - INTERVAL '9 hours', 60, true,
          'manual_entry', 'an honest hour, before the door opened');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b6';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 25000 AND v_source = 'studio_member',
    'FAIL r2 (precondition): priced by the employer; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- The confederate opens W2-R2-04's consent door and prices her in his org.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000016');
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('c6060000-0000-4000-8000-000000000014', 'c6060000-0000-4000-8000-0000000000aa', 'member');
  GET DIAGNOSTICS v_seated = ROW_COUNT;
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-0000000000aa', 'c6060000-0000-4000-8000-000000000014', 99900,
          (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000016');
  PERFORM pg_temp.reset_role();

  ASSERT v_seated = 1,
    'FAIL r3 (precondition): the consent-free seat INSERT must SUCCEED — it is '
    'W2-R2-04''s door, and the HT-3-b arm (c) ruling that closes it is still owed';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f4')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL r4 (precondition): two employer seats ⇒ ''none'' ⇒ bound (c) satisfied. '
    'The door MANUFACTURED the repair''s precondition; got '
    || COALESCE(v_pricing::text, 'NULL');

  -- SHE supplies the sibling the `created_by` leg asks for. This is the whole of
  -- W2-R5-02: a willing designer can author the half an attacker cannot forge.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000014');
  INSERT INTO projects (id, name, designer_id, created_by, studio_id)
  VALUES ('c6060000-0000-4000-8000-0000000000f5', 'Stamp Willing Rogue Sibling',
          'c6060000-0000-4000-8000-000000000014', 'c6060000-0000-4000-8000-000000000014',
          'c6060000-0000-4000-8000-0000000000aa');
  SELECT studio_id INTO v_sibling FROM projects
   WHERE id = 'c6060000-0000-4000-8000-0000000000f5';

  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-0000000000f4', 'c6060000-0000-4000-8000-0000000000aa') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_sibling = 'c6060000-0000-4000-8000-0000000000aa',
    'FAIL r5 (precondition, THE FINDING''S MECHANISM): the designer''s own project '
    'naming the confederate''s org must SUCCEED — 00563''s authenticated INSERT arm '
    'admits any studio she belongs to, and the consent-free seat made her belong. '
    'That clears bound (a2) for him; got ' || COALESCE(v_sibling::text, 'NULL');
  ASSERT v_state = '42501',
    'FAIL r6: her OWN stamp must still be refused — she is a plain member of his '
    'org, and HT-3-d gives a member no standing; got '
    || COALESCE(v_state, 'NO RAISE (returned ' || COALESCE(v_got::text, 'NULL') || ')');

  -- HIS stamp. Measured SUCCEEDING (W2-R5-02).
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000016');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000f4', 'c6060000-0000-4000-8000-0000000000aa') INTO v_got;
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000aa',
    'FAIL r7 (RESIDUE, W2-R5-02 — NOT A REGRESSION IF IT FAILS): with the sibling '
    'supplied by the designer herself, the confederate''s stamp SUCCEEDS and his '
    'org permanently prices an honest employer''s project. A failure here means '
    'the owed HT-3-b arm (c) consent door (or a predating bound) landed; rewrite '
    'this case to assert 42501; got ' || COALESCE(v_got::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000014');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000be', 'c6060000-0000-4000-8000-0000000000f4',
          'c6060000-0000-4000-8000-000000000014', NOW() - INTERVAL '5 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000be';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 99900 AND v_source = 'studio_member',
    'FAIL r8 (RESIDUE — the money): her hours price from HIS rate card; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- THE CAUSE IS REMOVED, and nothing comes back.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000016');
  DELETE FROM organization_members
   WHERE organization_id = 'c6060000-0000-4000-8000-0000000000aa'
     AND user_id = 'c6060000-0000-4000-8000-000000000014';
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT v_removed = 1,
    'FAIL r9 (precondition): the confederate must be able to remove the seat he '
    'created — the point is that removing the CAUSE does not undo the EFFECT';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f4')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000aa',
    'FAIL r10 (RESIDUE — IRREVERSIBILITY, what round 4 said must not survive): '
    'with the seat gone, the stamped column still names his org and bound (b) '
    'makes it final, so no honest party can re-stamp it; got '
    || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000014');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000bf', 'c6060000-0000-4000-8000-0000000000f4',
          'c6060000-0000-4000-8000-000000000014', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000bf';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000016');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000f4';
  PERFORM pg_temp.reset_role();

  ASSERT v_rate = 99900 AND v_source = 'studio_member',
    'FAIL r11 (RESIDUE — IRREVERSIBILITY, the money): an hour logged AFTER the seat '
    'was removed still prices from his rate card, because the stamped column is what '
    'the resolver reads; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');
  ASSERT v_rows = 3,
    'FAIL r12 (RESIDUE — the read): the confederate still reads every hour of the '
    'honest employer''s project through time_entries_owner_admin_read, because that '
    'policy keys on the studio the stamp wrote. Rows = ' || v_rows;

  RAISE NOTICE 'stamp_project_pricing_studio: case (r) recorded — the consent door is IRREVERSIBLE through the stamp.';
END
$$;

-- ─── (s) W2-R6-01: the HONEST admin-designer, whom HT-3-d admits ─────────────
-- ROUND 6's MAJOR, and a REGRESSION TEST for a bound that was reversed. Round 5
-- added a third refusal (bound (e2)): while the project's designer holds any
-- employer seat, SHE may not name a studio she herself administers. HT-3-d
-- authorises the tier bound and the owner-or-admin standing and says of them
-- "There is no other arm", and this fixture is the caller it admits expressly —
-- an ADMIN of an HONEST employer, with no confederate, no demotion, no
-- consent-free seat and no workspace of her own (her designer role is granted
-- AFTER her seats, so 00295 takes its early exit).
--   She holds TWO employer seats — `admin` of R6 Honest One, plain `member` of
--   R6 Honest Two — so HT-3-b's employer tier is AMBIGUOUS, the project is
--   honestly 'none', and this is exactly the population section (4) exists for.
--   R6 Honest One holds NO project she created, so bound (a2) refuses its OWNER.
-- Measured against the round-5 body (probe P1, 1/1): her stamp was refused by
-- (e2), her employer's owner was refused by (a2), the column stayed NULL and
-- HT-3-a's ruled remedy ("the owner fixes 'none' by stamping projects.studio_id")
-- was available to NOBODY. The only escape was for her to INSERT a spurious
-- project naming the employer so the employer could fix her other one.
-- IF s3 FAILS, bound (e2) (or another actor-gated refusal) came back: that needs
-- an amendment to HT-3-d recording a third refusal, and this case moves with it.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-000000000031', 'stamp-honest-designer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000032', 'stamp-honest-one-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000033', 'stamp-honest-two-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp Honest Designer'  WHERE id = 'c6060000-0000-4000-8000-000000000031';
UPDATE profiles SET full_name = 'Stamp Honest One Owner' WHERE id = 'c6060000-0000-4000-8000-000000000032';
UPDATE profiles SET full_name = 'Stamp Honest Two Owner' WHERE id = 'c6060000-0000-4000-8000-000000000033';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6060000-0000-4000-8000-0000000000ac', 'design_studio', 'R6 Honest One', 'r6-honest-one-test', 'active'),
  ('c6060000-0000-4000-8000-0000000000ad', 'design_studio', 'R6 Honest Two', 'r6-honest-two-test', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-000000000032', 'c6060000-0000-4000-8000-0000000000ac', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000033', 'c6060000-0000-4000-8000-0000000000ad', 'owner',  'active', NOW()),
  -- her HONEST admin seat — the ordinary shape of a studio that has hired a
  -- designer and given her the keys (HT-3-b's own customer shape, where Leah
  -- seats her new designer `admin`).
  ('c6060000-0000-4000-8000-000000000031', 'c6060000-0000-4000-8000-0000000000ac', 'admin',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000031', 'c6060000-0000-4000-8000-0000000000ad', 'member', 'active', NOW());

-- The employer prices her, and its OWNER authors the row — so the studio she may
-- name is one whose rate card is not hers to write. 26000 is distinct from every
-- other number in this file.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6060000-0000-4000-8000-0000000000ac', 'c6060000-0000-4000-8000-000000000031', 26000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000032');

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000031', id FROM roles WHERE name = 'studio_designer';

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-0000000000f6', 'R6 Honest Legacy House',
        'c6060000-0000-4000-8000-000000000031', 'c6060000-0000-4000-8000-000000000032', NULL),
       -- A SECOND legacy project, added in round 7: after HT-3-e(1) the employer's
       -- OWNER may repair one too (s3), so each caller needs a project of her own
       -- or the second call would meet bound (b)'s finality instead of its bound.
       ('c6060000-0000-4000-8000-0000000000f7', 'R6 Honest Legacy Cottage',
        'c6060000-0000-4000-8000-000000000031', 'c6060000-0000-4000-8000-000000000032', NULL);

DO $$
DECLARE
  v_workspace uuid;
  v_pricing   uuid;
  v_rate      integer;
  v_source    text;
  v_rated     integer;
  v_state     text;
  v_got       uuid;
  v_rows      integer;
  v_min       integer;
  v_wrote     integer;
  v_rate2     integer;
  v_source2   text;
BEGIN
  SELECT organization_id INTO v_workspace FROM organization_members
   WHERE user_id = 'c6060000-0000-4000-8000-000000000031' AND role = 'owner';
  ASSERT v_workspace IS NULL,
    'FAIL s0 (precondition): she must own NO studio — her designer role is granted '
    'after her seats, so 00295 takes its early exit. If she owns one, this fixture '
    'has stopped being the honest shape and is measuring case (q)''s instead';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f6')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL s1 (precondition): two employer seats ⇒ HT-3-b''s employer tier is '
    'AMBIGUOUS and the project is honestly ''none'', with no manoeuvre of any kind; '
    'got ' || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000031');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-0000000000b0', 'c6060000-0000-4000-8000-0000000000f6',
          'c6060000-0000-4000-8000-000000000031', NOW() - INTERVAL '5 hours', 60, true,
          'manual_entry', 'an honest hour nobody prices yet');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b0';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL s2 (precondition): her hour must file ''none'' (HT-3-a step 3); got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- The employer's OWNER first, on the COTTAGE. Until round 7 she was REFUSED
  -- here — bound (a2) wanted a sibling project this designer both leads and
  -- created, and an employer of a designer whose book predates the column holds
  -- none — which is the other half of W2-R6-01 and the whole of W2-R7-01 (measured
  -- 24 refusals of 24). HT-3-e(1) replaced that leg in the employer tier with an
  -- arm's-length rate, and R6 Honest One holds exactly that: her 26000 card,
  -- written by this owner.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000032');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000f7', 'c6060000-0000-4000-8000-0000000000ac') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000ac',
    'FAIL s3 (HT-3-e(1), W2-R7-01): the employer''s OWNER has HT-3-d''s full '
    'standing and must now be able to use it — this is HT-3-a''s ruled sentence '
    '("the OWNER fixes ''none'' by stamping projects.studio_id") reaching the '
    'ordinary legacy shape for the first time. Round 3''s sibling leg refused her, '
    'and with round 5''s (e2) refusing HER TOO the shape had no repairer at all; got '
    || COALESCE(v_got::text, 'NULL');
  ASSERT 'c6060000-0000-4000-8000-0000000000ac'
           = public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f7'),
    'FAIL s3b (HT-3-e(1)): and the cottage must now price from the employer';

  -- THE CALLER HT-3-d ADMITS, and the bound that must not come back.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000031');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-0000000000f6', 'c6060000-0000-4000-8000-0000000000ac') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-0000000000ac',
    'FAIL s4 (W2-R6-01, THE MAJOR OF ROUND 6): the project''s designer is an ADMIN '
    'of an HONEST employer studio — inside HT-3-b''s employer tier (role <> '
    '''owner'') and an owner-or-admin of the studio named — so HT-3-d admits her '
    'expressly ("There is no other arm"). Round 5''s bound (e2) refused her, which '
    'left HT-3-a''s ruled remedy available to nobody on this shape (s3 above) while '
    'buying nothing: the manoeuvre (e2) addressed needs a second account by '
    'construction and that account makes the call instead (case (q) q8). A FAILURE '
    'HERE MEANS AN ACTOR-GATED REFUSAL CAME BACK — it needs an amendment to HT-3-d; '
    'got ' || COALESCE(v_got::text, 'NULL');

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-0000000000f6')
    INTO v_pricing;
  ASSERT v_pricing = 'c6060000-0000-4000-8000-0000000000ac',
    'FAIL s5: and HT-3-a step 1 must answer with the employer; got '
    || COALESCE(v_pricing::text, 'NULL');

  -- The point: the number she gets is the EMPLOYER'S, written by the employer's
  -- owner. Naming a studio is not naming a rate — her standing reaches only
  -- studios in her own tier, and in this one she cannot author her own rate row
  -- without the owner's seat.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000031');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-0000000000b5', 'c6060000-0000-4000-8000-0000000000f6',
          'c6060000-0000-4000-8000-000000000031', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-0000000000b5';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 26000 AND v_source = 'studio_member',
    'FAIL s6: after the repair her next hour must price at the EMPLOYER''s number, '
    'authored by the EMPLOYER''s owner — the repair hands the work to the studio, '
    'it does not hand her a rate; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  -- And HT-10's read, which the narrowing promised the studio and which W2-R2-02
  -- measured as unreachable, comes back to the employer.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000032');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-0000000000f6';
  SELECT minutes INTO v_min
  FROM public.project_hours_total('c6060000-0000-4000-8000-0000000000f6');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 2 AND v_min = 120,
    'FAIL s7 (THE REPAIR): the employer''s OWNER must now read both hours and get '
    'the project total — the read HT-10 grants her and section (4) exists to make '
    'reachable; rows = ' || v_rows || ', minutes = ' || COALESCE(v_min::text, 'NULL');

  -- ── s8: HT-3-e(2), the one-account form (round 7's probe P8) ──────────────
  -- The capability W2-R7-07 names is W1's and is untouched: an `admin` satisfies
  -- studio_member_rates_admin_insert, so she writes her OWN number into her honest
  -- employer's rate card with one statement and no confederate — and under round
  -- 6's body her next hour on the project she had just stamped came back
  -- 99900 / 199800 where the employer's owner had written 26000. That is the
  -- refusal bound (e2) actually bought, and HT-3-e(2) is where it belongs: the row
  -- is hers (created_by = user_id) in a studio she does NOT own, so it never prices.
  -- THREE MEASUREMENTS, because the ruling has three clauses and 00598's ladder
  -- decides which one applies to a given hour: one OPEN row per (studio, member)
  -- (uniq_studio_member_rates_open) and close_prior_studio_member_rate closes every
  -- earlier span, so exactly one row covers any date.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000031');
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-0000000000ac', 'c6060000-0000-4000-8000-000000000031', 99900,
          (NOW() AT TIME ZONE 'UTC')::date - 10, 'c6060000-0000-4000-8000-000000000031');
  GET DIAGNOSTICS v_wrote = ROW_COUNT;

  -- (i) an hour TODAY, inside her own row's span: 'none'. Not her number, and not
  --     the employer's either — her row closed the employer's at (NOW() AT TIME ZONE 'UTC')::date - 11,
  --     so no qualifying row covers today and HT-3-e(2)'s third clause answers.
  --     THE WORST CASE OF THIS RULING IS AN UNPRICED HOUR ("rate pending", HT-26),
  --     which the studio repairs by writing a rate (s8d); it is never her number.
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be04', 'c6060000-0000-4000-8000-0000000000f6',
          'c6060000-0000-4000-8000-000000000031', NOW() - INTERVAL '3 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_rated
  FROM project_time_entries WHERE id = 'c6060000-0000-4000-8000-00000000be04';

  -- (ii) an hour inside the EMPLOYER's still-covering span, 20 days back: the
  --      owner's 26000 prices it. A self-authored row cannot reach back and
  --      re-price the history it closed — "the next qualifying row, authored by
  --      someone else, prices".
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be05', 'c6060000-0000-4000-8000-0000000000f6',
          'c6060000-0000-4000-8000-000000000031', NOW() - INTERVAL '20 days', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate2, v_source2 FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be05';
  PERFORM pg_temp.reset_role();

  ASSERT v_wrote = 1,
    'FAIL s8 (precondition, W2-R7-07): an `admin` must still be able to write her '
    'own rate row — studio_member_rates_admin_insert has no self-exclusion, the '
    'capability is W1''s, and HT-3-e(2) answers it at the RESOLVER rather than by '
    'narrowing that policy. If this INSERT now fails, the policy changed and the '
    'measurements below are vacuous';
  ASSERT v_rate IS NULL AND v_source = 'none' AND v_rated IS NULL,
    'FAIL s8b (HT-3-e(2), THE ROUND-7 CLOSURE — probe P8): she wrote 99900 into her '
    'employer''s card a statement ago, and the hour she logs today must NOT price at '
    'it. Measured under round 6''s body: 99900 / studio_member / 199800, with ONE '
    'account and no manoeuvre. A self-authored row prices only where its subject '
    'OWNS the studio (HT-3-c''s sole proprietor, case (o)); she is this one''s '
    '`admin`, so the row is ignored — and because 00598''s ladder closed the '
    'employer''s row at her start date, what is left for today is HT-26''s ''rate '
    'pending''. The studio repairs that by writing a rate (s8d); it never becomes '
    'her number. Got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rated::text, 'NULL');
  ASSERT v_rate2 = 26000 AND v_source2 = 'studio_member',
    'FAIL s8c (HT-3-e(2), second clause): an hour dated inside the EMPLOYER''s own '
    'span must still price at the 26000 its owner wrote — the self-authored row is '
    'ignored and the qualifying row somebody else wrote prices. If this fails, the '
    'filter is ignoring rows by studio rather than by authorship, which would '
    'silently unprice priced history; got ' || COALESCE(v_rate2::text, 'NULL')
    || ' / ' || COALESCE(v_source2, 'NULL');

  -- And it is not concealed: the studio's owner sees both rows on the card she
  -- administers, which is the governance half HT-3-e leaves to the product.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000032');
  SELECT count(*) INTO v_rows FROM studio_member_rates
   WHERE studio_id = 'c6060000-0000-4000-8000-0000000000ac'
     AND user_id = 'c6060000-0000-4000-8000-000000000031';

  -- (iii) THE REPAIR: the owner writes the studio's own number over it, the ladder
  --       closes hers, and the next hour prices from the studio again.
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-0000000000ac', 'c6060000-0000-4000-8000-000000000031', 27500,
          (NOW() AT TIME ZONE 'UTC')::date - 1, 'c6060000-0000-4000-8000-000000000032');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000031');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be06', 'c6060000-0000-4000-8000-0000000000f6',
          'c6060000-0000-4000-8000-000000000031', NOW() - INTERVAL '1 hour', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be06';
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 2,
    'FAIL s9: the employer''s OWNER must read BOTH rate rows for her — the one she '
    'wrote and the one the designer wrote — so a studio can see a number it did not '
    'set (studio_member_rates_read_self_or_admin). That visibility is the '
    'governance half: HT-3-e(2) stops the number pricing, the settings page is '
    'where somebody notices it. Rows = ' || v_rows;
  ASSERT v_rate = 27500 AND v_source = 'studio_member',
    'FAIL s8d (HT-3-e(2), the REPAIR): once the employer''s owner writes the '
    'studio''s own number, the hour prices from it again — so the ruling''s cost to '
    'an honest studio is one rate row, not a permanently unpriced member; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (s) passed — the honest admin-designer repairs her own project, her EMPLOYER repairs the other, and the number she wrote for herself does not price (HT-3-e).';
END
$$;

-- ─── (u) W2-R7-01: THE ORDINARY HIRE — refused before the rate, repaired after ─
-- Round 7's MAJOR, as a case. The shape is the one HT-3-d's own text singles out
-- and the one this act exists for: a designer seated a plain `member` in TWO
-- employer studios, so HT-3-b's employer tier is AMBIGUOUS and her legacy project
-- is honestly 'none'. No attacker, no manoeuvre, no workspace of her own (seats
-- before role, so 00295 takes its early exit), and R7 Hire One holds NO project she
-- created — which is the ordinary state of an employer whose designer's book
-- predates projects.studio_id.
-- Measured under round 6's body (probe P1, 1/1): she was refused by bound (a) (a
-- member has no standing), BOTH her employers' owners and admins were refused by
-- bound (a2) for want of a `created_by` sibling, the column stayed NULL and
-- HT-3-a's ruled remedy reached NOBODY. The only escape was for her to INSERT a
-- spurious project naming an employer so that employer could fix her other one.
-- HT-3-e(1) replaces that leg in the employer tier with an ARM'S-LENGTH RATE, and
-- this case measures both sides of it: refused while the studio has priced nobody,
-- admitted the moment it has priced HER, and the hour then prices from the studio.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-000000000034', 'stamp-r7-hire@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000035', 'stamp-r7-one-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000036', 'stamp-r7-one-admin@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000037', 'stamp-r7-two-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp R7 Hire'      WHERE id = 'c6060000-0000-4000-8000-000000000034';
UPDATE profiles SET full_name = 'Stamp R7 One Owner' WHERE id = 'c6060000-0000-4000-8000-000000000035';
UPDATE profiles SET full_name = 'Stamp R7 One Admin' WHERE id = 'c6060000-0000-4000-8000-000000000036';
UPDATE profiles SET full_name = 'Stamp R7 Two Owner' WHERE id = 'c6060000-0000-4000-8000-000000000037';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6060000-0000-4000-8000-00000000ae01', 'design_studio', 'R7 Hire One', 'r7-hire-one-test', 'active'),
  ('c6060000-0000-4000-8000-00000000ae02', 'design_studio', 'R7 Hire Two', 'r7-hire-two-test', 'active');

-- The legacy project goes in while she holds no seat and no designer role, so
-- 00563/00602 find zero candidates and the column stays NULL — the only way the
-- legacy shape arises.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6060000-0000-4000-8000-00000000fe01', 'R7 Hire Legacy House',
        'c6060000-0000-4000-8000-000000000034', 'c6060000-0000-4000-8000-000000000034', NULL);

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-000000000035', 'c6060000-0000-4000-8000-00000000ae01', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000036', 'c6060000-0000-4000-8000-00000000ae01', 'admin',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000037', 'c6060000-0000-4000-8000-00000000ae02', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000034', 'c6060000-0000-4000-8000-00000000ae01', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-000000000034', 'c6060000-0000-4000-8000-00000000ae02', 'member', 'active', NOW());

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000034', id FROM roles WHERE name = 'studio_designer';

DO $$
DECLARE
  v_workspace uuid;
  v_pricing   uuid;
  v_rate      integer;
  v_source    text;
  v_state     text;
  v_got       uuid;
  v_rows      integer;
  v_min       integer;
BEGIN
  SELECT organization_id INTO v_workspace FROM organization_members
   WHERE user_id = 'c6060000-0000-4000-8000-000000000034' AND role = 'owner';
  ASSERT v_workspace IS NULL,
    'FAIL u0 (precondition): she must own NO studio — seats before role, so 00295 '
    'takes its early exit. If she owns one this is case (q)''s fixture, not the '
    'ordinary hire''s';

  SELECT public.project_pricing_studio_id('c6060000-0000-4000-8000-00000000fe01')
    INTO v_pricing;
  ASSERT v_pricing IS NULL,
    'FAIL u1 (precondition): two plain employer seats ⇒ HT-3-b''s employer tier is '
    'AMBIGUOUS ⇒ the project is honestly ''none''; got '
    || COALESCE(v_pricing::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000034');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES ('c6060000-0000-4000-8000-00000000be07', 'c6060000-0000-4000-8000-00000000fe01',
          'c6060000-0000-4000-8000-000000000034', NOW() - INTERVAL '5 hours', 60, true,
          'manual_entry', 'the hire''s hour, nobody prices it yet');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be07';

  -- SHE cannot name either employer: bound (a), HT-3-d, W2-R4-02. Unchanged by
  -- HT-3-e(1) and asserted here so the case cannot be read as widening her.
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-00000000fe01', 'c6060000-0000-4000-8000-00000000ae01') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL u2 (precondition): her hour files ''none'' (HT-3-a step 3); got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_state = '42501',
    'FAIL u3 (HT-3-d, W2-R4-02): the member being priced may not choose which '
    'employer takes the hours and the money; got ' || COALESCE(v_state, 'NO RAISE');

  -- THE OTHER THREE CALLERS, BEFORE ANY RATE EXISTS: each has HT-3-d's full
  -- standing in the studio she names, and each is refused by HT-3-e(1)'s
  -- arm's-length-rate leg. This is W2-R7-01's sweep in miniature, and the reason
  -- the leg is not "free": an employer that has priced nobody cannot repair
  -- anything — which costs it nothing, because a stamp with no rate card behind it
  -- would leave the hour at 'none' anyway.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000035');
  v_state := NULL;
  BEGIN
    PERFORM public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-00000000fe01', 'c6060000-0000-4000-8000-00000000ae01');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL u4 (HT-3-e(1), the refusal BEFORE the rate): the employer''s OWNER is '
    'refused while her studio holds no rate row for this designer written by '
    'anybody but the designer herself; got ' || COALESCE(v_state, 'NO RAISE');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000036');
  v_state := NULL;
  BEGIN
    PERFORM public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-00000000fe01', 'c6060000-0000-4000-8000-00000000ae01');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL u5 (HT-3-e(1)): and so is that studio''s ADMIN; got '
    || COALESCE(v_state, 'NO RAISE');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000037');
  v_state := NULL;
  BEGIN
    PERFORM public.stamp_project_pricing_studio(
      'c6060000-0000-4000-8000-00000000fe01', 'c6060000-0000-4000-8000-00000000ae02');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL u6 (HT-3-e(1)): and so is the OTHER employer''s owner; got '
    || COALESCE(v_state, 'NO RAISE');
  ASSERT (SELECT studio_id IS NULL FROM projects
           WHERE id = 'c6060000-0000-4000-8000-00000000fe01'),
    'FAIL u7: four refusals, column still NULL — this is exactly the state round 7 '
    'measured 24 times out of 24 and called MAJOR (W2-R7-01)';

  -- THE ORDINARY ACT THAT CHANGES IT: the employer prices her. One row, written by
  -- the studio — the same row the studio needs for her hours to carry money at all.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000035');
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-00000000ae01', 'c6060000-0000-4000-8000-000000000034', 28000,
          (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000035');
  PERFORM pg_temp.reset_role();

  -- And now the studio's ADMIN performs HT-3-a's ruled repair.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000036');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-00000000fe01', 'c6060000-0000-4000-8000-00000000ae01') INTO v_got;
  PERFORM pg_temp.reset_role();

  ASSERT v_got = 'c6060000-0000-4000-8000-00000000ae01',
    'FAIL u8 (HT-3-e(1), THE FIX FOR W2-R7-01): with its own rate card for her in '
    'place, the employer''s ADMIN repairs ''none'' — the sentence HT-3-a ruled and '
    'which no caller could perform on this shape until round 7; got '
    || COALESCE(v_got::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000034');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be08', 'c6060000-0000-4000-8000-00000000fe01',
          'c6060000-0000-4000-8000-000000000034', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be08';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 28000 AND v_source = 'studio_member',
    'FAIL u9: and her next hour prices at the EMPLOYER''s 28000 — the rate the '
    'stamp''s own bound asked for is the rate that then pays her; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000035');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE project_id = 'c6060000-0000-4000-8000-00000000fe01';
  SELECT minutes INTO v_min
  FROM public.project_hours_total('c6060000-0000-4000-8000-00000000fe01');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 2 AND v_min = 180,
    'FAIL u10 (THE REPAIR): and HT-10''s read and the project total reach the '
    'employer''s owner; rows = ' || v_rows || ', minutes = '
    || COALESCE(v_min::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (u) passed — the ordinary hire''s employer can repair her legacy project once it has priced her (W2-R7-01 closed).';
END
$$;

-- ─── (v) W2-R7-01's POPULATION: a whole legacy book, swept then repaired ──────
-- Probe P7 of review round 7, as a case. THREE legacy projects, every one of them
-- `created_by` the designer herself (what every real creation path writes) and
-- every one with studio_id NULL, for a designer seated a plain `member` in two
-- employer studios. Round 6's body refused all 24 combinations of {she, employer
-- one's owner, employer one's admin, employer two's owner} x {L1, L2, L3} x
-- {employer one, employer two} — because (a2)'s sibling must itself carry a
-- non-NULL studio_id, and a book that predates the column has none anywhere.
-- The sweep is asserted here BEFORE any rate exists (24 refusals, 24 calls, three
-- NULL columns), and then the two studios price her and repair the book.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6060000-0000-4000-8000-000000000038', 'stamp-r7-book@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-000000000039', 'stamp-r7-book-one-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-00000000003a', 'stamp-r7-book-one-admin@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6060000-0000-4000-8000-00000000003b', 'stamp-r7-book-two-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Stamp R7 Book'           WHERE id = 'c6060000-0000-4000-8000-000000000038';
UPDATE profiles SET full_name = 'Stamp R7 Book One Owner' WHERE id = 'c6060000-0000-4000-8000-000000000039';
UPDATE profiles SET full_name = 'Stamp R7 Book One Admin' WHERE id = 'c6060000-0000-4000-8000-00000000003a';
UPDATE profiles SET full_name = 'Stamp R7 Book Two Owner' WHERE id = 'c6060000-0000-4000-8000-00000000003b';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6060000-0000-4000-8000-00000000ae03', 'design_studio', 'R7 Book One', 'r7-book-one-test', 'active'),
  ('c6060000-0000-4000-8000-00000000ae04', 'design_studio', 'R7 Book Two', 'r7-book-two-test', 'active');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6060000-0000-4000-8000-00000000fe02', 'R7 Book Legacy One',
   'c6060000-0000-4000-8000-000000000038', 'c6060000-0000-4000-8000-000000000038', NULL),
  ('c6060000-0000-4000-8000-00000000fe03', 'R7 Book Legacy Two',
   'c6060000-0000-4000-8000-000000000038', 'c6060000-0000-4000-8000-000000000038', NULL),
  ('c6060000-0000-4000-8000-00000000fe04', 'R7 Book Legacy Three',
   'c6060000-0000-4000-8000-000000000038', 'c6060000-0000-4000-8000-000000000038', NULL);

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c6060000-0000-4000-8000-000000000039', 'c6060000-0000-4000-8000-00000000ae03', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-00000000003a', 'c6060000-0000-4000-8000-00000000ae03', 'admin',  'active', NOW()),
  ('c6060000-0000-4000-8000-00000000003b', 'c6060000-0000-4000-8000-00000000ae04', 'owner',  'active', NOW()),
  ('c6060000-0000-4000-8000-000000000038', 'c6060000-0000-4000-8000-00000000ae03', 'member', 'active', NOW()),
  ('c6060000-0000-4000-8000-000000000038', 'c6060000-0000-4000-8000-00000000ae04', 'member', 'active', NOW());

INSERT INTO user_roles (user_id, role_id)
SELECT 'c6060000-0000-4000-8000-000000000038', id FROM roles WHERE name = 'studio_designer';

DO $$
DECLARE
  v_actors    uuid[] := ARRAY[
    'c6060000-0000-4000-8000-000000000038'::uuid,
    'c6060000-0000-4000-8000-000000000039'::uuid,
    'c6060000-0000-4000-8000-00000000003a'::uuid,
    'c6060000-0000-4000-8000-00000000003b'::uuid];
  v_projects  uuid[] := ARRAY[
    'c6060000-0000-4000-8000-00000000fe02'::uuid,
    'c6060000-0000-4000-8000-00000000fe03'::uuid,
    'c6060000-0000-4000-8000-00000000fe04'::uuid];
  v_studios   uuid[] := ARRAY[
    'c6060000-0000-4000-8000-00000000ae03'::uuid,
    'c6060000-0000-4000-8000-00000000ae04'::uuid];
  v_actor     uuid;
  v_project   uuid;
  v_studio    uuid;
  v_calls     integer := 0;
  v_refused   integer := 0;
  v_nulls     integer;
  v_got       uuid;
  v_rate      integer;
  v_source    text;
BEGIN
  SELECT count(*) INTO v_nulls FROM projects
   WHERE id = ANY(v_projects) AND studio_id IS NULL;
  ASSERT v_nulls = 3,
    'FAIL v0 (precondition): all three legacy projects must be unstamped; got '
    || v_nulls;
  ASSERT 0 = (SELECT count(*) FROM projects
               WHERE studio_id = ANY(v_studios)),
    'FAIL v1 (precondition, THE WHOLE POINT): neither studio holds ANY project '
    'naming it — that is what a book predating projects.studio_id looks like, and '
    'it is why round 3''s sibling leg could never be satisfied on this shape';

  FOREACH v_actor IN ARRAY v_actors LOOP
    FOREACH v_project IN ARRAY v_projects LOOP
      FOREACH v_studio IN ARRAY v_studios LOOP
        v_calls := v_calls + 1;
        PERFORM pg_temp.assume_user(v_actor);
        BEGIN
          PERFORM public.stamp_project_pricing_studio(v_project, v_studio);
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE = '42501' THEN v_refused := v_refused + 1; END IF;
        END;
        PERFORM pg_temp.reset_role();
      END LOOP;
    END LOOP;
  END LOOP;

  ASSERT v_calls = 24 AND v_refused = 24,
    'FAIL v2 (W2-R7-01, the sweep): before either studio has priced her, all 24 '
    'calls must be refused 42501 — four actors x three legacy projects x two '
    'employers. That is the measurement round 7 called MAJOR, and under round 6''s '
    'body it was the END of the story: nobody could repair any of them. Calls = '
    || v_calls || ', refused = ' || v_refused;
  SELECT count(*) INTO v_nulls FROM projects
   WHERE id = ANY(v_projects) AND studio_id IS NULL;
  ASSERT v_nulls = 3,
    'FAIL v3: and all three columns are still NULL; got ' || v_nulls;

  -- Each studio prices her — the ordinary act of employing somebody.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000039');
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-00000000ae03', 'c6060000-0000-4000-8000-000000000038', 27000,
          (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-000000000039');
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000003b');
  INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c6060000-0000-4000-8000-00000000ae04', 'c6060000-0000-4000-8000-000000000038', 31000,
          (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6060000-0000-4000-8000-00000000003b');
  PERFORM pg_temp.reset_role();

  -- And the book is repairable: owner, admin, and the OTHER employer, each naming
  -- their own studio on one project. Nothing ranks the two studios — HT-3-b left
  -- the tier ambiguous on purpose — so whichever studio acts first takes that
  -- project, and bound (b) makes it final.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000039');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-00000000fe02', 'c6060000-0000-4000-8000-00000000ae03') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-00000000ae03',
    'FAIL v4 (HT-3-e(1)): employer one''s OWNER repairs the first legacy project; '
    'got ' || COALESCE(v_got::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000003a');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-00000000fe03', 'c6060000-0000-4000-8000-00000000ae03') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-00000000ae03',
    'FAIL v5 (HT-3-e(1)): its ADMIN repairs the second; got '
    || COALESCE(v_got::text, 'NULL');

  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-00000000003b');
  SELECT public.stamp_project_pricing_studio(
    'c6060000-0000-4000-8000-00000000fe04', 'c6060000-0000-4000-8000-00000000ae04') INTO v_got;
  PERFORM pg_temp.reset_role();
  ASSERT v_got = 'c6060000-0000-4000-8000-00000000ae04',
    'FAIL v6 (HT-3-e(1)): and employer TWO''s owner repairs the third with its own '
    'studio — either employer may, and neither outranks the other; got '
    || COALESCE(v_got::text, 'NULL');

  SELECT count(*) INTO v_nulls FROM projects
   WHERE id = ANY(v_projects) AND studio_id IS NULL;
  ASSERT v_nulls = 0,
    'FAIL v7 (W2-R7-01 CLOSED): the whole legacy book now names a studio; got '
    || v_nulls || ' still NULL';

  -- The money, from each employer's own card.
  PERFORM pg_temp.assume_user('c6060000-0000-4000-8000-000000000038');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be09', 'c6060000-0000-4000-8000-00000000fe02',
          'c6060000-0000-4000-8000-000000000038', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be09';
  ASSERT v_rate = 27000 AND v_source = 'studio_member',
    'FAIL v8: an hour on the first project prices from employer ONE''s card; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6060000-0000-4000-8000-00000000be0a', 'c6060000-0000-4000-8000-00000000fe04',
          'c6060000-0000-4000-8000-000000000038', NOW() - INTERVAL '3 hours', 60, true, 'manual_entry');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source FROM project_time_entries
   WHERE id = 'c6060000-0000-4000-8000-00000000be0a';
  PERFORM pg_temp.reset_role();
  ASSERT v_rate = 31000 AND v_source = 'studio_member',
    'FAIL v9: and an hour on the third prices from employer TWO''s — each project '
    'follows the studio that repaired it, which is HT-3-a step 1; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (v) passed — a whole legacy book, 24 refusals before the rate and three repairs after (W2-R7-01 / probe P7).';
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

-- ─── (w) HT-3-f(1): the PIN HOLDS through the manoeuvre that moved the money ───
-- Case (e) measures that the confirm succeeds and is final. This measures what the
-- employer BUYS with it, against the exact shape HT-3-f(2) does NOT reach —
-- HT-3-f(3)'s recorded residual, a legacy project the designer opened herself while
-- employed. Two identical projects, one pinned and one not; she then leaves her
-- employer with the ONE statement `Members can leave` admits, and the pinned
-- project keeps pricing at the employer's number while the unpinned one moves to
-- her own workspace at her own. That difference IS the ruling's answer to
-- W2-R9-01: a studio that can see its hours can keep them.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6090000-0000-4000-8000-000000000001', 'pin-employer-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6090000-0000-4000-8000-000000000002', 'pin-leaver@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Pin Employer Owner' WHERE id = 'c6090000-0000-4000-8000-000000000001';
UPDATE profiles SET full_name = 'Pin Leaver'         WHERE id = 'c6090000-0000-4000-8000-000000000002';

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6090000-0000-4000-8000-0000000000a1', 'design_studio', 'Pin Employer', 'pin-employer-test', 'active'),
  ('c6090000-0000-4000-8000-0000000000a2', 'design_studio', 'Pin Leaver WS','pin-leaver-ws-test','active');

-- Both projects are inserted before any seat exists for her, so the column stays
-- NULL (the legacy shape), and both carry HER OWN id in created_by — HT-3-f(3)'s
-- residual, where HT-3-f(2) has nothing to say and only the pin does.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6090000-0000-4000-8000-0000000000e1', 'Pin Kept House',
   'c6090000-0000-4000-8000-000000000002', 'c6090000-0000-4000-8000-000000000002', NULL),
  ('c6090000-0000-4000-8000-0000000000e2', 'Pin Unpinned House',
   'c6090000-0000-4000-8000-000000000002', 'c6090000-0000-4000-8000-000000000002', NULL);

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6090000-0000-4000-8000-0000000000c1', 'c6090000-0000-4000-8000-000000000001',
   'c6090000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6090000-0000-4000-8000-0000000000c2', 'c6090000-0000-4000-8000-000000000002',
   'c6090000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6090000-0000-4000-8000-0000000000c3', 'c6090000-0000-4000-8000-000000000002',
   'c6090000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

-- Granted AFTER her seats exist, so 00295's fc_provision_studio_on_designer takes
-- its early exit and a2 above is the only workspace she owns. The role itself is
-- load-bearing for the stamp: set_project_studio_id's owner-executed arm refuses a
-- studio_id UPDATE whose LEAD is not a designer (00563, `v_lead_has_designer_role`).
INSERT INTO user_roles (user_id, role_id)
SELECT 'c6090000-0000-4000-8000-000000000002', id FROM roles WHERE name = 'studio_designer';

INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES
  ('c6090000-0000-4000-8000-0000000000a1', 'c6090000-0000-4000-8000-000000000002', 26000,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6090000-0000-4000-8000-000000000001'),
  ('c6090000-0000-4000-8000-0000000000a2', 'c6090000-0000-4000-8000-000000000002', 99900,
   (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6090000-0000-4000-8000-000000000002');

DO $$
DECLARE
  v_got   uuid;
  v_state text;
  v_rate  integer;
  v_src   text;
  v_rows  integer;
BEGIN
  -- ── w1: the employer's OWNER pins the project HT-3-b already names for it.
  PERFORM pg_temp.assume_user('c6090000-0000-4000-8000-000000000001');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6090000-0000-4000-8000-0000000000e1', 'c6090000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NULL AND v_got = 'c6090000-0000-4000-8000-0000000000a1',
    'FAIL w1 (HT-3-f(1)): the pin is available to the studio the derivation already '
    'names, on an ORDINARY shape — one employer seat, one arm''s-length rate, a '
    'legacy NULL-studio project. Got SQLSTATE ' || COALESCE(v_state, 'none')
    || ' / returned ' || COALESCE(v_got::text, 'NULL');

  -- ── w2: she leaves her employer. ONE statement, hers, through RLS.
  PERFORM pg_temp.assume_user('c6090000-0000-4000-8000-000000000002');
  WITH gone AS (
    DELETE FROM organization_members
     WHERE user_id = 'c6090000-0000-4000-8000-000000000002'
       AND organization_id = 'c6090000-0000-4000-8000-0000000000a1'
    RETURNING 1
  ) SELECT count(*) INTO v_rows FROM gone;

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6090000-0000-4000-8000-0000000000b1', 'c6090000-0000-4000-8000-0000000000e1',
          'c6090000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 hour', 120, true, 'manual_entry');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6090000-0000-4000-8000-0000000000b2', 'c6090000-0000-4000-8000-0000000000e2',
          'c6090000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 hour', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 1,
    'FAIL w2 (precondition): `Members can leave` must still admit her; rows = ' || v_rows;

  -- ── w3: THE PINNED project keeps pricing at the employer's number.
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_src
  FROM project_time_entries WHERE id = 'c6090000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 26000 AND v_src = 'studio_member',
    'FAIL w3 (HT-3-f(1), WHAT THE PIN BUYS): once the column carries the studio, '
    'HT-3-b is not consulted again — so her seat change cannot move the project, the '
    'money or the employer''s HT-10 read. This is the whole value of the confirm, '
    'and on THIS shape (a project she created herself) it is the employer''s ONLY '
    'remedy, because HT-3-f(2) keys on created_by and created_by is hers '
    '(HT-3-f(3)). Got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_src, 'NULL');

  -- ── w4: the UNPINNED twin, the control — and HT-3-f(3) in one line.
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_src
  FROM project_time_entries WHERE id = 'c6090000-0000-4000-8000-0000000000b2';
  ASSERT v_rate = 99900 AND v_src = 'studio_member',
    'FAIL w4 (HT-3-f(3), THE RESIDUAL — asserted as PASSING, and the control that '
    'makes w3 a measurement rather than a tautology): the identical project the '
    'employer did NOT pin moves to her own workspace at her own number. If this is '
    'no longer 99900 then HT-3-f(2) has been widened past what was ruled — which '
    'may be right, and is a RULING, because the honest sole proprietor of HT-3-a arm '
    '(a) creates her own projects too. Got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_src, 'NULL');

  -- ── w5: and the employer's read follows the column, not her seat.
  PERFORM pg_temp.assume_user('c6090000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE id IN ('c6090000-0000-4000-8000-0000000000b1', 'c6090000-0000-4000-8000-0000000000b2');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 1,
    'FAIL w5 (HT-10 + HT-3-f(1)): the employer''s owner must read the hour on the '
    'PINNED project and not the one on the unpinned twin — 00606''s owner/admin read '
    'keys on project_pricing_studio_id, so the pin is what keeps a departed hire''s '
    'work visible to the studio that is billing it. Round 9 measured the owner '
    'reading ZERO of 2. Got ' || v_rows;

  RAISE NOTICE 'stamp_project_pricing_studio: case (w) passed — HT-3-f(1): the pin survives the seat deletion that moved the money, and the unpinned twin records HT-3-f(3).';
END
$$;

-- ─── (x) W2-R9-02: a self-rewrite cannot deny the employer its repair ─────────
-- HT-3-e(4) re-authors a rate row to whoever moves its number — which HT-3-e(2)
-- needs, and which cost the EMPLOYER something round 9 measured: the employer arm
-- at bound (a2) asks the named studio for a rate row for this designer "that
-- somebody other than she wrote", so a studio whose card holds exactly ONE row for
-- her lost that standing the moment she rewrote the row in place, and the stamp was
-- then refused to the studio's OWNER as well as to her (probe A, A4/A5).
-- The leg now asks the row's AUTHORSHIP HISTORY: created_by, or the author the
-- re-authoring displaced into original_created_by. She can erase neither — a closed
-- row is frozen outright, and the new column is written only by the guard, only
-- from OLD, and is frozen against every caller.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6100000-0000-4000-8000-000000000001', 'hist-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6100000-0000-4000-8000-000000000002', 'hist-admin-designer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
UPDATE profiles SET full_name = 'Hist Owner'           WHERE id = 'c6100000-0000-4000-8000-000000000001';
UPDATE profiles SET full_name = 'Hist Admin Designer'  WHERE id = 'c6100000-0000-4000-8000-000000000002';

INSERT INTO organizations (id, type, name, slug, status)
VALUES ('c6100000-0000-4000-8000-0000000000a1', 'design_studio', 'Hist Employer', 'hist-employer-test', 'active');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6100000-0000-4000-8000-0000000000e1', 'Hist Legacy House',
        'c6100000-0000-4000-8000-000000000002', 'c6100000-0000-4000-8000-000000000001', NULL);

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6100000-0000-4000-8000-0000000000c1', 'c6100000-0000-4000-8000-000000000001',
   'c6100000-0000-4000-8000-0000000000a1', 'owner', 'active', NOW()),
  -- `admin`, because studio_member_rates_admin_update admits any owner or admin of
  -- the studio — the rate's own SUBJECT included (W2-R7-07: the capability is W1's).
  ('c6100000-0000-4000-8000-0000000000c2', 'c6100000-0000-4000-8000-000000000002',
   'c6100000-0000-4000-8000-0000000000a1', 'admin', 'active', NOW());

-- Granted after the seat, so 00295 provisions her nothing; and required by 00563's
-- owner-executed arm, which refuses a studio_id UPDATE whose LEAD is not a designer.
INSERT INTO user_roles (user_id, role_id)
SELECT 'c6100000-0000-4000-8000-000000000002', id FROM roles WHERE name = 'studio_designer';

-- EXACTLY ONE rate row for her, written by the studio's owner. That is the shape
-- the finding is about: a studio that has priced a hire once.
INSERT INTO studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6100000-0000-4000-8000-0000000000a1', 'c6100000-0000-4000-8000-000000000002', 26000,
        (NOW() AT TIME ZONE 'UTC')::date - 30, 'c6100000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_author   uuid;
  v_original uuid;
  v_rows     integer;
  v_state    text;
  v_got      uuid;
  v_rate     integer;
BEGIN
  -- ── x1: she rewrites the studio's only row IN PLACE, through RLS, as its admin.
  PERFORM pg_temp.assume_user('c6100000-0000-4000-8000-000000000002');
  WITH moved AS (
    UPDATE studio_member_rates SET hourly_rate_cents = 99900
     WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
       AND user_id   = 'c6100000-0000-4000-8000-000000000002'
       AND effective_to IS NULL
    RETURNING 1
  ) SELECT count(*) INTO v_rows FROM moved;
  PERFORM pg_temp.reset_role();
  SELECT created_by, original_created_by INTO v_author, v_original
  FROM studio_member_rates
   WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c6100000-0000-4000-8000-000000000002'
     AND effective_to IS NULL;
  ASSERT v_rows = 1,
    'FAIL x1 (precondition, W2-R7-07): an admin must still be able to rewrite the '
    'row — the capability is W1''s and HT-3-e answers it elsewhere; rows = ' || v_rows;
  ASSERT v_author = 'c6100000-0000-4000-8000-000000000002',
    'FAIL x1b (HT-3-e(4)): the number she moved must be authored by her; got '
    || COALESCE(v_author::text, 'NULL');
  ASSERT v_original = 'c6100000-0000-4000-8000-000000000001',
    'FAIL x1c (W2-R9-02): and the author she DISPLACED must be kept — without it '
    'the studio''s whole card for her reads as self-authored and its OWNER loses the '
    'arm''s-length standing bound (a2) asks for; got '
    || COALESCE(v_original::text, 'NULL');

  -- ── x2: THE REPAIR THE FINDING DENIED. The employer's OWNER stamps. Measured
  --    refused 42501 before this change, with the same message her own attempt got.
  PERFORM pg_temp.assume_user('c6100000-0000-4000-8000-000000000001');
  v_state := NULL;
  BEGIN
    SELECT public.stamp_project_pricing_studio(
      'c6100000-0000-4000-8000-0000000000e1', 'c6100000-0000-4000-8000-0000000000a1') INTO v_got;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NULL AND v_got = 'c6100000-0000-4000-8000-0000000000a1',
    'FAIL x2 (W2-R9-02): the employer''s OWNER must still be able to name his own '
    'studio after its rate row was rewritten by the person it prices. Refused, a '
    'member can deny her studio the repair act at will, with no message that '
    'explains what happened (measured, probe A A4/A5). Got SQLSTATE '
    || COALESCE(v_state, 'none') || ' / returned ' || COALESCE(v_got::text, 'NULL');

  -- ── x3: she cannot erase the displaced author by hand — it is frozen.
  PERFORM pg_temp.assume_user('c6100000-0000-4000-8000-000000000002');
  v_state := NULL;
  BEGIN
    UPDATE studio_member_rates
       SET original_created_by = 'c6100000-0000-4000-8000-000000000002'
     WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
       AND user_id   = 'c6100000-0000-4000-8000-000000000002'
       AND effective_to IS NULL;
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  SELECT original_created_by INTO v_original FROM studio_member_rates
   WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c6100000-0000-4000-8000-000000000002'
     AND effective_to IS NULL;
  ASSERT v_state IS NOT NULL AND v_original = 'c6100000-0000-4000-8000-000000000001',
    'FAIL x3 (W2-R9-02): original_created_by is part of the row''s frozen identity — '
    'authenticated holds UPDATE on this table, so a writable column here is a '
    'standing a member writes for herself or erases at will; got SQLSTATE '
    || COALESCE(v_state, 'NO RAISE') || ' / ' || COALESCE(v_original::text, 'NULL');

  -- ── x4: nor by rewriting AGAIN. The displaced author is kept ONCE, from OLD.
  PERFORM pg_temp.assume_user('c6100000-0000-4000-8000-000000000002');
  UPDATE studio_member_rates SET hourly_rate_cents = 88800
   WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c6100000-0000-4000-8000-000000000002'
     AND effective_to IS NULL;
  PERFORM pg_temp.reset_role();
  SELECT created_by, original_created_by INTO v_author, v_original
  FROM studio_member_rates
   WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c6100000-0000-4000-8000-000000000002'
     AND effective_to IS NULL;
  ASSERT v_author = 'c6100000-0000-4000-8000-000000000002'
     AND v_original = 'c6100000-0000-4000-8000-000000000001',
    'FAIL x4 (W2-R9-02): a CHAIN of rewrites must not walk the first author off the '
    'row — re-stamping original_created_by from OLD.created_by every time would hand '
    'her the same denial in two statements instead of one. COALESCE(OLD.original, '
    'OLD.created_by) is what makes it once. Got author '
    || COALESCE(v_author::text, 'NULL') || ' / original '
    || COALESCE(v_original::text, 'NULL');

  -- ── x5: and she may not NAME it on a row of her own.
  PERFORM pg_temp.assume_user('c6100000-0000-4000-8000-000000000002');
  INSERT INTO studio_member_rates
    (studio_id, user_id, hourly_rate_cents, effective_from, created_by, original_created_by)
  VALUES ('c6100000-0000-4000-8000-0000000000a1', 'c6100000-0000-4000-8000-000000000002', 95000,
          (NOW() AT TIME ZONE 'UTC')::date - 1, 'c6100000-0000-4000-8000-000000000002',
          'c6100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();
  SELECT original_created_by INTO v_original FROM studio_member_rates
   WHERE studio_id = 'c6100000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c6100000-0000-4000-8000-000000000002'
     AND effective_to IS NULL;
  ASSERT v_original IS NULL,
    'FAIL x5 (W2-R9-02): a caller may not NAME the author she claims to have '
    'displaced — studio_member_rates_admin_insert says nothing about this column, so '
    'without the INSERT guard''s discard an owner or admin manufactures the '
    'arm''s-length standing bound (a2) asks for. A new row has displaced nobody; got '
    || COALESCE(v_original::text, 'NULL');

  -- ── x6: and the hour still prices 'none', because HT-3-e(2) is untouched by all
  --    of this: every row of her card is now one she wrote.
  PERFORM pg_temp.assume_user('c6100000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6100000-0000-4000-8000-0000000000b1', 'c6100000-0000-4000-8000-0000000000e1',
          'c6100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 hour', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents INTO v_rate FROM project_time_entries
   WHERE id = 'c6100000-0000-4000-8000-0000000000b1';
  ASSERT v_rate IS NULL,
    'FAIL x6 (HT-3-e(2), unchanged by W2-R9-02): keeping the DISPLACED author is a '
    'standing test at the STAMP, not a pricing one — the number that is there is '
    'still hers, so the hour is still HT-26''s ''rate pending'' until the studio '
    'writes a row of its own. If this prices, W2-R9-02 has leaked into the resolver '
    'and round 8''s MAJOR is back; got ' || COALESCE(v_rate::text, 'NULL');

  RAISE NOTICE 'stamp_project_pricing_studio: case (x) passed — W2-R9-02: the employer keeps its repair act through a self-rewrite, and the record of the displaced author is nobody''s to write.';
END
$$;

ROLLBACK;
