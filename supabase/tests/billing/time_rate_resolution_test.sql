-- ═══════════════════════════════════════════════════════════════════════════
-- Rate truth: the server owns the rate on every project kind
-- (migrations 00598 studio_member_rates · 00599 resolve_time_rate_cents ·
--  00600 rate provenance + the derived-field freeze · 00601 the classifier)
--
-- Covers, per the W1 plan:
--   (a) HT-1 — a browser-supplied hourly_rate_cents on a NON-SERVICES project is
--       DISCARDED and replaced by the resolver's answer (the 00578:2648-2654
--       branch, which used to price the hour from whatever the client sent).
--   (b) a caller-supplied rate_source on INSERT RAISES (§0.7c), and so does a
--       caller-supplied rated_amount_cents. hourly_rate_cents is deliberately
--       NOT a raise — see 00600's banner and case (a).
--   (c) a services entry with NO role match gets the studio rate and stays
--       pending_authorization, instead of being NULL-stranded for ever
--       (00578:2765-2772 vs the 00577:2493-2496 promotion filter).
--   (d) the no-authority-covering-started_at branch (00578:2694-2700) is
--       server-owned too.
--   (e) HT-41 — a member holding TWO roster roles who picks one is priced at
--       that role's signed card.
--   (f) HT-41 + CR-21 — the same member with NO pick falls to the studio rate
--       rather than to NULL (00578's count(DISTINCT role) = 1 collapse).
--   (g) a rate_role the member does not hold RAISES.
--   (h) §0.8 — rate_source and rate_role are immutable on an already-classified
--       row, in BOTH the watched-column list and the IS DISTINCT FROM chain.
--   (i) P-4 — an UPDATE of a legacy row whose rate the chain cannot explain
--       KEEPS its amount (the write-down 00596 taught us to look for).
--
-- REVIEW ROUND 1 added five cases. This file is the ONLY real gate for the
-- classifier rewrite (W1-R1-15: all six red supabase/tests/commercial files are
-- pre-existing failures that abort inside
-- _countersign_design_services_agreement_impl BEFORE any authority-rate assert,
-- so "commercial green unchanged" is never coverage of this path):
--   (j) W1-R1-02 — a BOUND row's signed rate survives a `billable` off/on round
--       trip. The classifier used to stamp the resolver's answer on the
--       non-billable branch before the bound-row handling could keep
--       OLD.hourly_rate_cents, and `billable` is not in aab_'s watched list, so a
--       signed hour could be silently re-priced and then invoice-locked.
--       Also carries (j0), W1-R1-07's comparison: on a ONE-CARD authority the
--       resolver's own answer equals the rate the classifier stored.
--   (k) W1-R1-03 — after the owner removes the roster seat a recorded rate_role
--       came from, the member can still correct her own un-invoiced entry, and
--       the recorded rate_role survives. Validating on every fire froze the row.
--   (l) W1-R1-01 — the RPC boundary: a caller with NO relationship to the project
--       cannot pull its signed rate cards out of the GRANTed DEFINER resolver, and
--       a role the member does not hold raises there too.
--   (m) W1-R1-05 — the project's own designer, a plain org member, can still
--       correct a TEAMMATE's entry (the shipped `Designers manage their project
--       time entries` ALL policy has no user_id leg); a plain studio member who
--       is neither the designer nor an admin still cannot resolve someone else's
--       rate. The first half was silently revoked by the first revision's assert.
--
-- REVIEW ROUND 2 added two cases and one assert:
--   (n) W1-R2-02 — the ORDINARY designer holds TWO active studios (00295 provisions
--       a personal one at the is_designer flip; she later joins the one that pays
--       her). Every fixture above gives its designer one, so the studio fallback in
--       00599 was never exercised where it decides anything, and its uuid tiebreak
--       was a coin flip locally and a deterministic wrong answer on Strata.
--   (o) W1-R2-05 — a W1-rated row backdated out of its rate's span keeps its
--       provenance. Case (i) cannot catch this: its row is GENUINELY legacy, so
--       OLD.rate_source is already NULL.
--   (m4) W1-R2-03 — the designer-on-behalf leg is the classifier's, not a caller's:
--       at pg_trigger_depth() = 0 a project designer who is not a studio owner/admin
--       may not resolve a colleague's pay rate.
--
-- REVIEW ROUND 3 added two cases:
--   (p) W1-R3-01 — a plain member of a multi-member studio is the OWNER of the
--       personal one-person workspace 00295 provisions for her, and the INSERT
--       policy lets an owner write her own rate there. With the resolver's first
--       key being "this studio holds a rate for her", both studios held one, the
--       key tied and `(membership.role = 'owner') DESC` handed the pricing to HER
--       number: a self-set 99900 priced a 120-minute hour at $1,998.00 authorized.
--       Case (n) could not catch it — its designer holds a rate in ONE studio, so
--       the key decides rather than ties.
--   (q) W1-R3-02 — a PRE-00600 row (rate_source NULL) whose author DOES hold a
--       studio rate: a plain duration correction used to write its 17500 snapshot
--       down to her current 15000 and erase its legacy provenance. Case (i) only
--       exercises the 'none' arm, because its member has no studio rate at all.
--
-- REVIEW ROUND 4 added two cases:
--   (r) W1-R4-01 — round 3 closed (p) with a PROXY (a multi-member studio outranks
--       a one-person workspace) and the member CONTROLS the proxy: she is the owner
--       of her auto-provisioned workspace, and organization_members' INSERT policy
--       is `is_org_admin_or_owner(organization_id) AND role <> 'owner'`, so she can
--       seat a collaborator there through RLS from the browser. The count key then
--       ties, the rate-existence key ties, and the owner tiebreak priced the hour at
--       her self-set 99900 again — the identical $1,998.00 (p) reports as closed.
--       (p) cannot catch it: its p0b assert pins the workspace at ONE member.
--   (s) W1-R4-02 — the same count key asked the wrong question. It can pick a studio
--       that holds NO rate for her: a designer priced 18000 in her own one-person
--       studio who is also a plain member of a multi-member studio that never priced
--       her resolved to 'none' and billed $0. The first key is now the ARM'S-LENGTH
--       rate and the second is a bare rate, so both cases land on the studio that
--       actually prices her.
--
-- REVIEW ROUND 5 added four cases. The round-4 key was a property the member can
-- WRITE, two different ways, and HT-41's pick was a lever in the one hand 00578 held
-- shut:
--   (t) W1-R5-01 — created_by was left un-frozen on the open row in round 2 for the
--       settings page's blur-save, and round 4 then made that same column the
--       authorization key. One UPDATE as her relabelled her self-set 99900 as
--       arm's-length: $1,998.00 authorized, the identical figure (p) and (r) each
--       report as closed. 00598 now refuses any re-stamp that is not the actor's own
--       id, which leaves the blur-save untouched (the upsert always names the actor).
--   (u) W1-R5-02 — the same key with nothing forged: 'admin' <> 'owner', so she
--       seats a SECOND ACCOUNT as an admin of her own workspace and that account
--       writes her 99900 under its own created_by. The only keys she cannot
--       manufacture are about her standing INSIDE the candidate studio, so the new
--       FIRST key is "this studio holds a rate for her AND she does not run it".
--   (v) W1-R5-03 — the project's own DESIGNER writes her own roster rows
--       (`Lead designers manage team members` is an ALL policy on
--       projects.designer_id = auth.uid()), so putting HT-41's pick above 00578's
--       hard-coded 'lead_designer' let her bill the client at the best-paying signed
--       card: 40000 where her own card says 10000, rate_source still 'authority'.
--       The designer branch regains precedence and the row records the role that
--       priced it.
--   (w) the fall-through (u)'s key needs: for a studio's OWNER logging her own
--       hours BOTH candidates are studios she runs, so the new first key ties at
--       false and the lower keys must decide — or the principal of a real studio
--       bills $0.
--
-- REVIEW ROUND 6 added one case:
--   (x) W1-R6-01 — round 5's key ("she is not the one who runs it") is TRUE for a
--       studio she controls as soon as the puppet is a SECOND ACCOUNT's
--       auto-provisioned workspace instead of her own: `Org owners can insert
--       members` lets that account seat her there as a plain `member`, and as the
--       workspace's owner it writes her rate at any number under its own
--       created_by. Keys 1-5 then tie against the studio that employs her and the
--       tie fell to the SEAT's own dates — joined_at, then the membership row's
--       created_at — which the seating INSERT supplies. Both terms are deleted;
--       organizations.created_at is the last resort because `organizations` has no
--       INSERT policy for `authenticated`. Case (u) cannot reach this (its second
--       account is seated in HER OWN workspace, so key 1 stays false there) and
--       case (r) cannot (its second seat never writes a rate).
--
-- REVIEW ROUND 8 — HT-3-a IS RULED, AND EVERY LADDER CASE ABOVE IS REWRITTEN.
--
-- HT-3-a (RULED by Kody, 2026-09-12): the studio that prices an hour is derived
-- FROM THE PROJECT ONLY — (1) projects.studio_id when not NULL, (2) else a studio
-- the project's DESIGNER holds as an active OWNER (preferring one that holds a
-- studio_member_rates row for the member being priced, then the oldest owner
-- membership), (3) else 'none'. The member's own memberships, seat dates, org
-- creation and organizations.created_at play no part, and 00602 stamps
-- projects.studio_id at project INSERT by the same rule.
--
-- Rounds 3-7 are therefore not a sequence of keys any more. Their FIXTURES are all
-- kept — they are the only measured inventory of what a member can actually do
-- through RLS — and every one of them is now a NEGATIVE case whose manoeuvre is
-- unobservable:
--   (p) the self-set rate in her auto-provisioned workspace,
--   (r) the collaborator seat that bought the multi-member proxy (probe r4a),
--   (s) the studio that never priced her (probe r4b) — both directions now,
--   (t) the created_by re-stamp, PLUS W1-R7-03's hand-close of the open row,
--   (u) the second account seated `admin` writing an arm's-length rate,
--   (x) the plain `member` seat in a SECOND ACCOUNT's workspace, its backdated
--       seat, and round 7's one-UPDATE backdate of organizations.created_at.
-- Each logs its hour on a project of the studio that employs her, and each asserts
-- that studio's rate — never the 99900 rounds 3-7 each reported closed in turn.
-- The other half of the ruling is asserted too, in (p4), (s1-s4) and (w): on HER
-- OWN project the studio she owns prices the hour, deliberately.
--
-- Round 8 adds three cases and re-homes two:
--   (y) 00602 — the stamp at INSERT: one owned studio is stamped, no owned studio
--       stamps nothing, a plain member's studio is never stamped, an UPDATE never
--       re-stamps (P-4), and the trigger sorts after set_project_studio_id so
--       00563's fail-closed refusals are still reached first.
--   (z) step 1 is FINAL — the studio named on the project prices the hour even when
--       the designer owns another studio that also holds a rate for the member.
--   (n) rewritten as HT-3-a step 2's own case: two studios she OWNS, and the one
--       holding her rate wins.
--   (l) re-homed (W1-R7-04): EXECUTE on resolve_time_rate_cents is revoked from
--       `authenticated`, so the old l1/l2/l3 and m3/m4 direct calls are replaced by
--       the privilege assert plus a refused call, and their substance is asserted on
--       the trigger path in (g), (e) and (m).
--   (m) rewritten: its designer owns no studio, so the hour resolves 'none'. Before
--       HT-3-a the deleted ladder reached the studio she is a plain MEMBER of and
--       priced it at 15000.
--
-- Where the resolver is probed directly it is probed as postgres (auth.uid() IS
-- NULL — the 00317:38-39 precedent), because no signed-in role holds EXECUTE.
--
-- Every write runs as the member under `SET LOCAL ROLE authenticated` + a JWT
-- claim: the guard returns early for current_user = 'postgres' (00412:2354), so
-- a test written as postgres would assert nothing.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/time_rate_resolution_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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

-- ─── fixtures (as postgres: the guards return early for this role) ─────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000000001', 'rate-owner@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000002', 'rate-hire@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000003', 'rate-twohat@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- review round 1: a brand-new authenticated user with NO relationship to any of
  -- these projects (W1-R1-01), and a project designer who is a PLAIN org member
  -- rather than the studio's owner (W1-R1-05).
  ('b1100000-0000-4000-8000-000000000004', 'rate-stranger@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000005', 'rate-plaindes@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000000001', 'rate-owner@test.invalid',  'Rate Owner',  true,  NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000002', 'rate-hire@test.invalid',   'Rate Hire',   true,  NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000003', 'rate-twohat@test.invalid', 'Rate Twohat', false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000004', 'rate-stranger@test.invalid', 'Rate Stranger', false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000000005', 'rate-plaindes@test.invalid', 'Rate PlainDes', true,  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000000a1', 'design_studio', 'Rate Studio', 'rate-truth-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000000c1', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000000c2', 'b1100000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('b1100000-0000-4000-8000-0000000000c3', 'b1100000-0000-4000-8000-000000000003', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  -- A plain 'member' on purpose (W1-R1-05): if she were owner or admin,
  -- is_org_admin_or_owner would satisfy the resolver's second assert and the
  -- designer leg under test would never be exercised. The stranger (…004) is in
  -- NO organization at all.
  ('b1100000-0000-4000-8000-0000000000c5', 'b1100000-0000-4000-8000-000000000005', 'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

-- P1 plain (non-services) · P2 services, no card for the hire's role ·
-- P3 services, cards named for both of the two-hat member's roles.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES
  ('b1100000-0000-4000-8000-0000000000e1', 'Plain House',    'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e2', 'Services House', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e3', 'Two-hat House',  'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  -- P4 services with exactly ONE rate card (the single-card fallback, W1-R1-07 /
  -- W1-R1-02). P5 plain, owned by the plain-member designer (W1-R1-05).
  ('b1100000-0000-4000-8000-0000000000e4', 'One-card House', 'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-0000000000e5', 'Plain-des House','b1100000-0000-4000-8000-000000000005', 'b1100000-0000-4000-8000-000000000005');

INSERT INTO public.proposals (id, designer_id, title, status, document_kind)
VALUES
  ('b1100000-0000-4000-8000-0000000000d2', 'b1100000-0000-4000-8000-000000000001', 'Services agreement', 'draft', 'design_services'),
  ('b1100000-0000-4000-8000-0000000000d3', 'b1100000-0000-4000-8000-000000000001', 'Two-hat agreement',  'draft', 'design_services'),
  ('b1100000-0000-4000-8000-0000000000d4', 'b1100000-0000-4000-8000-000000000001', 'One-card agreement', 'draft', 'design_services');

-- The proposals stay in 'draft': guard_commercial_authored_child (00412:633-654)
-- forbids writing proposal_service_rates once a proposal leaves draft, and the
-- real ceremony (countersign_design_services_agreement) is not what this file
-- is testing. Nothing below reads proposals.status.

INSERT INTO public.proposal_service_rates (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
VALUES
  ('b1100000-0000-4000-8000-00000000f201', 'b1100000-0000-4000-8000-0000000000d2', 1, 'Principal',     30000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f202', 'b1100000-0000-4000-8000-0000000000d2', 1, 'Junior',        10000, 1, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f301', 'b1100000-0000-4000-8000-0000000000d3', 1, 'Lead designer', 25000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-00000000f302', 'b1100000-0000-4000-8000-0000000000d3', 1, 'Vendor',         9000, 1, NOW() - INTERVAL '20 days'),
  -- ONE card, and no role on the roster is named 'Principal': the classifier's
  -- single-card fallback (00601:278-293) is the only thing that can bind this hour.
  ('b1100000-0000-4000-8000-00000000f401', 'b1100000-0000-4000-8000-0000000000d4', 1, 'Principal',     30000, 0, NOW() - INTERVAL '20 days');

INSERT INTO public.project_commercial_documents
  (id, project_id, proposal_id, document_kind, is_origin, created_by, executed_at)
VALUES
  ('b1100000-0000-4000-8000-00000000cd02', 'b1100000-0000-4000-8000-0000000000e2', 'b1100000-0000-4000-8000-0000000000d2',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days'),
  ('b1100000-0000-4000-8000-00000000cd03', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-0000000000d3',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days'),
  ('b1100000-0000-4000-8000-00000000cd04', 'b1100000-0000-4000-8000-0000000000e4', 'b1100000-0000-4000-8000-0000000000d4',
   'design_services', true, 'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '5 days');

-- retainer_activation_policy 'immediate' so retainer gating is not what the
-- billing_state asserts below are measuring.
INSERT INTO public.project_billing_authorities
  (id, project_id, commercial_document_id, source_proposal_id, billing_ceiling_cents,
   retainer_amount_cents, retainer_activation_policy, billing_cadence, effective_at, status)
VALUES
  ('b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-0000000000e2', 'b1100000-0000-4000-8000-00000000cd02',
   'b1100000-0000-4000-8000-0000000000d2', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active'),
  ('b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-00000000cd03',
   'b1100000-0000-4000-8000-0000000000d3', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active'),
  ('b1100000-0000-4000-8000-00000000ba04', 'b1100000-0000-4000-8000-0000000000e4', 'b1100000-0000-4000-8000-00000000cd04',
   'b1100000-0000-4000-8000-0000000000d4', 100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active');

INSERT INTO public.project_billing_authority_rates
  (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
VALUES
  ('b1100000-0000-4000-8000-00000000aa21', 'b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-00000000f201', 1, 'Principal',     30000),
  ('b1100000-0000-4000-8000-00000000aa22', 'b1100000-0000-4000-8000-00000000ba02', 'b1100000-0000-4000-8000-00000000f202', 1, 'Junior',        10000),
  ('b1100000-0000-4000-8000-00000000aa31', 'b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-00000000f301', 1, 'Lead designer', 25000),
  ('b1100000-0000-4000-8000-00000000aa32', 'b1100000-0000-4000-8000-00000000ba03', 'b1100000-0000-4000-8000-00000000f302', 1, 'Vendor',         9000),
  ('b1100000-0000-4000-8000-00000000aa41', 'b1100000-0000-4000-8000-00000000ba04', 'b1100000-0000-4000-8000-00000000f401', 1, 'Principal',     30000);

-- The two-hat member holds both roles on P3 (so 00597 seats nobody there).
INSERT INTO public.project_team_members (id, project_id, user_id, role, assigned_by)
VALUES
  ('b1100000-0000-4000-8000-00000000dd31', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003', 'lead_designer', 'b1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-00000000dd32', 'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003', 'vendor',        'b1100000-0000-4000-8000-000000000001');

-- ─── the studio's per-member rates, written by the owner through RLS ───────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES
    ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000002', 15000, CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000000001'),
    ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000003', 12000, CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'time_rate_resolution: studio rates seeded by the owner.';
END
$$;

-- ─── (a) HT-1: the browser's rate is discarded on a NON-SERVICES project ───
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
  v_state  TEXT;
  v_role   TEXT;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, hourly_rate_cents)
  VALUES ('b1100000-0000-4000-8000-0000000000b1', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry', 99999);
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state, rate_role
    INTO v_rate, v_source, v_amount, v_state, v_role
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b1';

  ASSERT v_rate = 15000,
    'FAIL a1 (HT-1): the browser sent 99999 and the studio rate is 15000; stored ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL a2: rate_source must be studio_member, got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 30000,
    'FAIL a3: 120 min at 15000/h is 30000 cents, got ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_state = 'authorized',
    'FAIL a4: a non-services entry stays authorized, got ' || COALESCE(v_state, 'NULL');
  ASSERT v_role = 'support_designer',
    'FAIL a5 (HT-41): the row records the role that priced it — 00597 seated her as '
    'support_designer; got ' || COALESCE(v_role, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (a) passed.';
END
$$;

-- ─── (b) provenance is refused on INSERT, the rate is only discarded ───────
DO $$
DECLARE
  v_source_raised BOOLEAN := false;
  v_amount_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_source)
    VALUES ('b1100000-0000-4000-8000-0000000000b2', 'b1100000-0000-4000-8000-0000000000e1',
            'b1100000-0000-4000-8000-000000000002', NOW(), 30, true, 'manual_entry', 'authority');
  EXCEPTION WHEN check_violation THEN v_source_raised := true;
  END;
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source, rated_amount_cents)
    VALUES ('b1100000-0000-4000-8000-0000000000b3', 'b1100000-0000-4000-8000-0000000000e1',
            'b1100000-0000-4000-8000-000000000002', NOW(), 30, true, 'manual_entry', 777777);
  EXCEPTION WHEN check_violation THEN v_amount_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_source_raised, 'FAIL b1 (§0.7c): a caller-supplied rate_source must raise on INSERT';
  ASSERT v_amount_raised, 'FAIL b2 (§0.7c): a caller-supplied rated_amount_cents must raise on INSERT';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_time_entries
                      WHERE id IN ('b1100000-0000-4000-8000-0000000000b2','b1100000-0000-4000-8000-0000000000b3')),
    'FAIL b3: neither refused row may exist';

  RAISE NOTICE 'time_rate_resolution: case (b) passed.';
END
$$;

-- ─── (c) services, no card for her role: the studio rate, still pending ────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
  v_state  TEXT;
  v_auth   UUID;
  v_promotable INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000b4', 'b1100000-0000-4000-8000-0000000000e2',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state, billing_authority_id
    INTO v_rate, v_source, v_amount, v_state, v_auth
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b4';

  ASSERT v_auth IS NULL,
    'FAIL c0 (precondition): no card is named for support_designer, so no authority binds';
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL c1: the new hire''s services hour takes the studio rate; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 15000,
    'FAIL c2: 00578:2765-2772 nulled rate AND amount here, stranding the row against the '
    '00577:2493-2496 promotion filter; expected 15000, got ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_state = 'pending_authorization',
    'FAIL c3: the hour is not authorized by a signed card, got ' || COALESCE(v_state, 'NULL');

  -- W1-R1-04: what the repair delivers is HONEST MONEY, not promotability. The
  -- real promotion predicate — every loop in the lineage, head 00578:6584-6602 —
  -- JOINs project_billing_authorities ON prior_authority.id =
  -- entry.billing_authority_id and requires entry.authority_rate_id IS NOT NULL,
  -- and this branch sets both to NULL. The earlier revision of 00601's banner and
  -- plan-v2 §2's Done-when #4 both claimed "a later signed addendum can promote
  -- it"; it cannot. Pinned here as the shipped behaviour, and recorded as OWED
  -- RULING HT-6-b. A ruling the other way is a new promotion arm inside the
  -- countersign ceremony — not a code choice.
  SELECT count(*) INTO v_promotable
  FROM public.project_time_entries entry
  JOIN public.project_billing_authorities prior_authority
    ON prior_authority.id = entry.billing_authority_id
  WHERE entry.id = 'b1100000-0000-4000-8000-0000000000b4'
    AND entry.billing_state = 'pending_authorization'
    AND entry.billable AND entry.duration_minutes IS NOT NULL
    AND entry.rated_amount_cents IS NOT NULL
    AND entry.authority_rate_id IS NOT NULL;
  ASSERT v_promotable = 0,
    'FAIL c4 (W1-R1-04, owed ruling HT-6-b): the repaired row is NOT promotable — if this '
    'assert ever reads 1, the promotion predicate changed and HT-6-b was ruled; update the '
    'banner in 00601 and Done-when #4 with it. Got ' || v_promotable;
  ASSERT (SELECT authority_rate_id FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000b4') IS NULL,
    'FAIL c5: the unbound row carries no authority_rate_id — that is WHY it is not promotable';

  RAISE NOTICE 'time_rate_resolution: case (c) passed.';
END
$$;

-- ─── (d) no authority covering started_at is server-owned too ─────────────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_state  TEXT;
  v_amount INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  -- 10 days back: before the authority's effective_at (5 days back).
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, hourly_rate_cents)
  VALUES ('b1100000-0000-4000-8000-0000000000b5', 'b1100000-0000-4000-8000-0000000000e2',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '10 days', 30, true, 'manual_entry', 88888);
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, billing_state, rated_amount_cents
    INTO v_rate, v_source, v_state, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b5';

  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL d1 (00578:2694-2700): the caller''s 88888 survived this branch before 00601; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 7500,
    'FAIL d2: 30 min at 15000/h is 7500 cents, got ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_state = 'pending_authorization',
    'FAIL d3: no authority covers the instant, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (d) passed.';
END
$$;

-- ─── (e) HT-41: two roles, one pick, the picked card prices the hour ──────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_role   TEXT;
  v_state  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_role)
  VALUES ('b1100000-0000-4000-8000-0000000000b6', 'b1100000-0000-4000-8000-0000000000e3',
          'b1100000-0000-4000-8000-000000000003', NOW() - INTERVAL '1 day', 60, true, 'manual_entry', 'vendor');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rate_role, billing_state
    INTO v_rate, v_source, v_role, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b6';

  ASSERT v_rate = 9000 AND v_source = 'authority',
    'FAIL e1 (HT-41): the Vendor card is 9000 and the Lead designer card is 25000; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_role = 'vendor',
    'FAIL e2: the row must record the role she picked, got ' || COALESCE(v_role, 'NULL');
  ASSERT v_state = 'authorized',
    'FAIL e3: a signed card covering the instant authorizes the hour, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (e) passed.';
END
$$;

-- ─── (f) two roles, NO pick: the studio rate, not NULL (CR-21) ────────────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_role   TEXT;
  v_state  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000b7', 'b1100000-0000-4000-8000-0000000000e3',
          'b1100000-0000-4000-8000-000000000003', NOW() - INTERVAL '2 days', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rate_role, billing_state
    INTO v_rate, v_source, v_role, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b7';

  ASSERT v_rate = 12000 AND v_source = 'studio_member',
    'FAIL f1 (CR-21): with two roles and no pick, 00578''s count(DISTINCT role) = 1 collapse '
    'yields no role, so the studio rate prices the hour instead of NULL; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_role IS NULL,
    'FAIL f2: no role was picked and none can be derived, so rate_role stays NULL; got ' || v_role;
  ASSERT v_state = 'pending_authorization',
    'FAIL f3: an unpicked two-role hour is not authorized by a card, got ' || COALESCE(v_state, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (f) passed.';
END
$$;

-- ─── (g) a role the member does not hold raises ───────────────────────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_role)
    VALUES ('b1100000-0000-4000-8000-0000000000b8', 'b1100000-0000-4000-8000-0000000000e3',
            'b1100000-0000-4000-8000-000000000003', NOW(), 30, true, 'manual_entry', 'bookkeeper');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised,
    'FAIL g1 (risk 16): a client cannot claim a roster role it does not hold';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_time_entries
                      WHERE id = 'b1100000-0000-4000-8000-0000000000b8'),
    'FAIL g2: the refused row must not exist';

  RAISE NOTICE 'time_rate_resolution: case (g) passed.';
END
$$;

-- ─── (h) §0.8: provenance is immutable once classified ────────────────────
DO $$
DECLARE
  v_source_raised BOOLEAN := false;
  v_role_raised   BOOLEAN := false;
  v_rate_raised   BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE public.project_time_entries SET rate_source = 'authority'
     WHERE id = 'b1100000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_source_raised := true;
  END;
  BEGIN
    UPDATE public.project_time_entries SET rate_role = 'vendor'
     WHERE id = 'b1100000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_role_raised := true;
  END;
  -- The same freeze now covers a NON-SERVICES row, which 00412:2366's early exit
  -- let through (HT-1, §0.7b).
  BEGIN
    UPDATE public.project_time_entries SET hourly_rate_cents = 1
     WHERE id = 'b1100000-0000-4000-8000-0000000000b1';
  EXCEPTION WHEN check_violation THEN v_rate_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_source_raised, 'FAIL h1 (§0.8): rate_source must be frozen after classification';
  ASSERT v_role_raised,   'FAIL h2 (§0.8): rate_role must be frozen after classification';
  ASSERT v_rate_raised,
    'FAIL h3 (§0.7b): the derived-field freeze must now cover non-services projects too';
  ASSERT (SELECT rate_source FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000b1') = 'studio_member',
    'FAIL h4: the refused updates must not have changed the row';

  RAISE NOTICE 'time_rate_resolution: case (h) passed.';
END
$$;

-- ─── (i) P-4: a legacy rate the chain cannot explain keeps its amount ─────
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  -- A genuine PRE-00601 row: the classifier is switched off for one insert, which
  -- is the only honest way to write the shape that already exists on Strata —
  -- a rate snapshot with no provenance, on a member the chain has no answer for
  -- (she has no studio rate row and the project has no signed card).
  -- ALTER TABLE … DISABLE TRIGGER is transactional, so the ROLLBACK restores it.
  ALTER TABLE public.project_time_entries
    DISABLE TRIGGER aac_classify_project_time_entry_authority_trg;
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source,
     hourly_rate_cents, rated_amount_cents, billing_state)
  VALUES ('b1100000-0000-4000-8000-0000000000b9', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000001', NOW() - INTERVAL '40 days', 60, true,
          'manual_entry', 17500, 17500, 'authorized');
  ALTER TABLE public.project_time_entries
    ENABLE TRIGGER aac_classify_project_time_entry_authority_trg;

  ASSERT (SELECT hourly_rate_cents FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000b9') = 17500,
    'FAIL i0 (precondition): the legacy row must carry its snapshot rate';

  -- The owner edits the duration. The resolver has no answer for her (no rate
  -- card, no studio rate row) — and the amount must not be written down.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  UPDATE public.project_time_entries SET duration_minutes = 120
   WHERE id = 'b1100000-0000-4000-8000-0000000000b9';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents
    INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b9';

  ASSERT v_rate = 17500,
    'FAIL i1 (P-4): an edit must not destroy an unbilled row''s rate snapshot; got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source IS NULL,
    'FAIL i2: a preserved legacy snapshot keeps NULL provenance — it is not ''none'' '
    '("rate pending" would be a lie about a row that has a rate); got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 35000,
    'FAIL i3: the preserved rate must re-price the new duration (120 min at 17500/h); got '
    || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (i) passed.';
END
$$;

-- ─── (j) W1-R1-02 + W1-R1-07: a BOUND signed rate survives billable off/on ──
DO $$
DECLARE
  v_rate    INTEGER;
  v_source  TEXT;
  v_amount  INTEGER;
  v_state   TEXT;
  v_auth    UUID;
  v_r_cents INTEGER;
  v_r_src   TEXT;
BEGIN
  -- The hire logs on the ONE-CARD services project. Her roster role is
  -- support_designer (00597 seats her), and the only card is named 'Principal', so
  -- nothing matches by role: the classifier's single-card fallback (00601:278-293)
  -- is what binds the hour at $300/h.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000c1', 'b1100000-0000-4000-8000-0000000000e4',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 60, true, 'manual_entry');

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_authority_id
    INTO v_rate, v_source, v_amount, v_auth
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  ASSERT v_auth IS NOT NULL AND v_rate = 30000 AND v_source = 'authority' AND v_amount = 30000,
    'FAIL j0a (precondition): the single-card fallback must bind this hour at 30000/authority; got '
    || COALESCE(v_rate::text,'NULL') || ' / ' || COALESCE(v_source,'NULL')
    || ' / ' || COALESCE(v_amount::text,'NULL');

  PERFORM pg_temp.reset_role();

  -- W1-R1-07: the resolver must give the SAME answer the classifier stored. Before
  -- the tier-1 single-card fallback was added, this read 15000 / studio_member —
  -- a wrong preview for the row that is sitting right there, and the mechanism
  -- behind the overwrite (j) is about.
  -- Probed as postgres (the reset_role above): W1-R7-04 revoked EXECUTE from
  -- `authenticated`, so there is no signed-in caller left to probe it as — see
  -- case (l). auth.uid() is then NULL and the body's asserts self-bypass, which is
  -- the 00317:38-39 precedent.
  SELECT resolved.cents, resolved.source INTO v_r_cents, v_r_src
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e4', 'b1100000-0000-4000-8000-000000000002',
    (SELECT started_at FROM public.project_time_entries
      WHERE id = 'b1100000-0000-4000-8000-0000000000c1'), NULL) AS resolved;
  ASSERT v_r_cents = 30000 AND v_r_src = 'authority',
    'FAIL j0b (W1-R1-07): the resolver and the classifier must not disagree about which card '
    'a role matches; resolver said ' || COALESCE(v_r_cents::text,'NULL') || ' / '
    || COALESCE(v_r_src,'NULL') || ' for a row the classifier stored at 30000 / authority';

  -- A SECOND version of the card, cheaper. A new hour would now be priced from it,
  -- so the resolver's answer and this bound row's signed rate genuinely diverge —
  -- which is what makes the round trip below a real test rather than a tautology.
  INSERT INTO public.proposal_service_rates
    (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
  VALUES ('b1100000-0000-4000-8000-00000000f402', 'b1100000-0000-4000-8000-0000000000d4',
          2, 'Principal', 20000, 0, NOW() - INTERVAL '20 days');
  INSERT INTO public.project_billing_authority_rates
    (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
  VALUES ('b1100000-0000-4000-8000-00000000aa42', 'b1100000-0000-4000-8000-00000000ba04',
          'b1100000-0000-4000-8000-00000000f402', 2, 'Principal', 20000);

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries SET billable = false
   WHERE id = 'b1100000-0000-4000-8000-0000000000c1';

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  ASSERT v_rate = 30000 AND v_source = 'authority',
    'FAIL j1 (W1-R1-02): a non-billable toggle must not re-price a BOUND hour — the signed '
    '30000 / authority must stand; got ' || COALESCE(v_rate::text,'NULL') || ' / '
    || COALESCE(v_source,'NULL');
  ASSERT v_state = 'nonbillable' AND v_amount = 0,
    'FAIL j2: a non-billable hour is worth 0 and says so; got '
    || COALESCE(v_state,'NULL') || ' / ' || COALESCE(v_amount::text,'NULL');

  UPDATE public.project_time_entries SET billable = true
   WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c1';
  ASSERT v_rate = 30000,
    'FAIL j3 (W1-R1-02): the way back reads OLD.hourly_rate_cents, so an overwrite on the way '
    'out is PERMANENT — a signed $300/h hour must not come back at any other rate; got '
    || COALESCE(v_rate::text,'NULL');
  ASSERT v_source = 'authority',
    'FAIL j4: provenance must still say authority, got ' || COALESCE(v_source,'NULL');
  ASSERT v_amount = 30000,
    'FAIL j5: 60 min at 30000/h is 30000 cents — this is the number claim_time_entries would '
    'invoice-lock; got ' || COALESCE(v_amount::text,'NULL');
  ASSERT v_state = 'authorized',
    'FAIL j6: the signed card authorizes the hour again, got ' || COALESCE(v_state,'NULL');

  RAISE NOTICE 'time_rate_resolution: case (j) passed.';
END
$$;

-- ─── (k) W1-R1-03: a removed roster seat must not freeze the entry ─────────
DO $$
DECLARE
  v_duration INTEGER;
  v_role     TEXT;
  v_rate     INTEGER;
BEGIN
  -- Entry b6 (case e) is bound to the Vendor card and records rate_role='vendor'.
  -- The owner now removes the vendor seat — HT-25-a's cross-role re-seat makes
  -- exactly this churn the expected case, and a designer handover does the same to
  -- 'lead_designer' rows. Done as postgres: project_team_members' write
  -- authorization is not what this case is about.
  UPDATE public.project_team_members SET removed_at = NOW()
   WHERE id = 'b1100000-0000-4000-8000-00000000dd32';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  UPDATE public.project_time_entries SET duration_minutes = 120
   WHERE id = 'b1100000-0000-4000-8000-0000000000b6';
  PERFORM pg_temp.reset_role();

  SELECT duration_minutes, rate_role, hourly_rate_cents
    INTO v_duration, v_role, v_rate
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000b6';

  ASSERT v_duration = 120,
    'FAIL k1 (W1-R1-03): validating rate_role on EVERY fire froze the entry the moment the seat '
    'the role came from was removed — and rate_role cannot be changed either, so DELETE was the '
    'only escape. The correction must land; duration is ' || COALESCE(v_duration::text,'NULL');
  ASSERT v_role = 'vendor',
    'FAIL k2: the recorded role survives the seat it came from, got ' || COALESCE(v_role,'NULL');
  ASSERT v_rate = 9000,
    'FAIL k3: the bound signed rate is untouched by the correction, got '
    || COALESCE(v_rate::text,'NULL');

  -- Put the seat back: later cases read this roster.
  UPDATE public.project_team_members SET removed_at = NULL
   WHERE id = 'b1100000-0000-4000-8000-00000000dd32';

  RAISE NOTICE 'time_rate_resolution: case (k) passed.';
END
$$;

-- ─── (l) W1-R7-04: the resolver has no authenticated caller at all ──────────
-- Rounds 1-6 grew three asserts inside resolve_time_rate_cents for the benefit of a
-- direct caller at pg_trigger_depth() = 0 — and five review rounds found no such
-- caller anywhere in the repo (grep over apps/ packages/ services/
-- supabase/functions: one doc comment at use-time-tracking.ts:91 and the generated
-- database.types.ts, nothing else). Lane B's rate surfaces read studio_member_rates
-- directly through its own RLS. 00599 therefore REVOKEs EXECUTE from
-- `authenticated` as well as from PUBLIC and anon: the resolver is trigger-path
-- only, which is a structural answer instead of three asserts guarding an open door.
--
-- The old (l1)(l2)(l3) and (m3)(m4) called the function directly as
-- `authenticated`. They are re-homed: the role's refusal is asserted here, and the
-- substance they were testing is asserted on the TRIGGER path — a role the member
-- does not hold raises in case (g), a role she does hold prices at its card in case
-- (e), and the designer-on-behalf correction is case (m) below.
DO $$
DECLARE
  v_denied BOOLEAN := false;
  v_cents  INTEGER;
BEGIN
  ASSERT NOT has_function_privilege(
           'authenticated',
           'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE'),
    'FAIL l1 (W1-R7-04): authenticated must not hold EXECUTE on the resolver — it is '
    'trigger-path only, and the RPC-boundary asserts exist only as defense should a '
    'later wave re-GRANT it';
  ASSERT NOT has_function_privilege(
           'anon',
           'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE'),
    'FAIL l2: anon must not hold EXECUTE on the resolver';

  -- And the revoke is real, not just catalogued: the call itself is refused.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000003');
  BEGIN
    SELECT resolved.cents INTO v_cents
    FROM public.resolve_time_rate_cents(
      'b1100000-0000-4000-8000-0000000000e3', 'b1100000-0000-4000-8000-000000000003',
      NOW() - INTERVAL '1 day', 'vendor') AS resolved;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_denied,
    'FAIL l3 (W1-R7-04): a signed-in member called the resolver directly and it answered '
    || COALESCE(v_cents::text, 'NULL') || ' — the REVOKE did not take';

  RAISE NOTICE 'time_rate_resolution: case (l) passed.';
END
$$;

-- ─── (m) W1-R1-05 + HT-3-a: the designer's correction stands; her project has
--         no studio to price it ──────────────────────────────────────────────
-- P5's designer (…005) is a plain `member` of Rate Studio and OWNS no studio at
-- all. Under HT-3-a that is the third tier: the project names no studio (00602
-- stamps nothing, because she holds no owner seat), she owns none, and the hour
-- resolves 'none' — "rate pending" (HT-26), printed as pending by lane B and kept
-- off an invoice by the composer, not by the resolver.
--
-- This is the assert that moved in round 8. Before HT-3-a the fallback ladder
-- reached the studio she is a plain MEMBER of and priced the hour at 15000 — which
-- is precisely the shape the ruling removes: a studio that does not own the work
-- does not price it, and her own memberships are not a pricing key.
DO $$
DECLARE
  v_duration INTEGER;
  v_rate     INTEGER;
  v_source   TEXT;
  v_studio   uuid;
BEGIN
  SELECT studio_id INTO v_studio FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000000e5';
  ASSERT v_studio IS NULL,
    'FAIL m0 (precondition, HT-3-a): P5''s designer owns no studio, so 00602 must stamp '
    'nothing and the project must carry studio_id NULL; got ' || COALESCE(v_studio::text, 'NULL');

  -- The hire logs on the plain-member designer's own project.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000c2', 'b1100000-0000-4000-8000-0000000000e5',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '3 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  -- The project's DESIGNER corrects it. `Designers manage their project time
  -- entries` (00177:136-137) is an ALL policy qualified only on
  -- projects.designer_id = auth.uid() — no user_id leg — so this was allowed before
  -- W1, and the first revision of the resolver's assert refused it because she is a
  -- plain org member rather than an owner/admin. An undeclared narrowing is the
  -- defect, so the designer leg is admitted (gated on trigger depth, W1-R2-03).
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000005');
  UPDATE public.project_time_entries SET duration_minutes = 90
   WHERE id = 'b1100000-0000-4000-8000-0000000000c2';
  PERFORM pg_temp.reset_role();

  SELECT duration_minutes, hourly_rate_cents, rate_source INTO v_duration, v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c2';
  ASSERT v_duration = 90,
    'FAIL m1 (W1-R1-05): the project designer must still be able to correct a teammate''s '
    'entry; duration is ' || COALESCE(v_duration::text, 'NULL');
  ASSERT v_source = 'none' AND v_rate IS NULL,
    'FAIL m2 (HT-3-a, RULED 2026-09-12): nothing owns this project — its designer holds no '
    'owner seat anywhere — so the hour must resolve ''none'' with no rate. A 15000 here is '
    'the deleted ladder reaching the studio she is a plain MEMBER of; got '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rate::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (m) passed.';
END
$$;

-- ─── (n) HT-3-a step 2: two studios the DESIGNER owns, and the one that holds
--         the member's rate wins ────────────────────────────────────────────
-- The ordinary designer holds TWO active studios: 00295's
-- fc_provision_studio_on_designer mints a personal design studio the moment
-- is_designer flips with no membership yet, and she later joins (here, owns) the
-- studio that pays her. She is owner of both, active in both, and both memberships
-- carry the same transaction's now() — which is why every earlier revision of this
-- file's studio choice was a coin flip or a deterministic wrong answer (W1-R2-02).
--
-- HT-3-a's step 2 answers it with a rule instead of a chain of tiebreaks: among the
-- studios the PROJECT'S DESIGNER OWNS, prefer the one holding a studio_member_rates
-- row for the member being priced, then the oldest owner membership. Here she is
-- both designer and member, her rate lives in the Paying Studio, and the personal
-- workspace never carries one.
--
-- The order of these three statements is the whole point, and mirrors signup:
-- flip is_designer BEFORE any membership exists (00295 no-ops if she already
-- belongs to any organization, any status), then the studio that pays her.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('b1100000-0000-4000-8000-000000000006', 'rate-twostudio@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000000006', 'rate-twostudio@test.invalid', 'Rate TwoStudio', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip that provisions the personal studio (a separate UPDATE on purpose: the
-- INSERT above lands on the row auth.users already created, so ON CONFLICT DO
-- NOTHING would leave is_designer false and the trigger would never fire).
UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000000006';

-- …and then the studio that actually pays her, which she owns.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000000a2', 'design_studio', 'Paying Studio', 'rate-paying-studio-test', 'active');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000000c6', 'b1100000-0000-4000-8000-000000000006',
        'b1100000-0000-4000-8000-0000000000a2', 'owner', 'active', NOW());

-- organization_members.created_at defaults to now(), which inside one transaction is
-- the TRANSACTION timestamp — so every seat this file writes carries the identical
-- instant and HT-3-a's "oldest owner membership" key would degenerate to the
-- studio.id determinism backstop (a random uuid for an auto-provisioned workspace,
-- i.e. a coin flip). In production the is_designer flip and the founding of a studio
-- are different transactions, days or years apart. The UPDATE below (as postgres)
-- restores that shape so the RULED key is what decides.
UPDATE public.organization_members
   SET created_at = NOW() - INTERVAL '1 year'
 WHERE user_id = 'b1100000-0000-4000-8000-000000000006'
   AND organization_id <> 'b1100000-0000-4000-8000-0000000000a2';

-- Her own project. 00602 stamps it at INSERT; no rate exists yet, so the stamp
-- falls to her OLDEST owner seat — the personal workspace 00295 provisioned first.
-- That is recorded below (n0e) and then cleared, because step 2 is what this case
-- is about and step 1 would otherwise answer.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('b1100000-0000-4000-8000-0000000000e6', 'Two-studio House',
        'b1100000-0000-4000-8000-000000000006', 'b1100000-0000-4000-8000-000000000006');

DO $$
DECLARE
  v_studios     INTEGER;
  v_personal    uuid;
  v_stamped     uuid;
  v_rate        INTEGER;
  v_source      TEXT;
  v_resolved    INTEGER;
BEGIN
  SELECT count(*) INTO v_studios
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000006'
    AND studio.type = 'design_studio' AND studio.status = 'active'
    AND m.status = 'active' AND m.role = 'owner';
  ASSERT v_studios = 2,
    'FAIL n0 (precondition): the designer must OWN TWO active studios or this case is '
    'vacuous — 00295''s provision trigger did not fire; got ' || v_studios;

  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000006'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a2';
  ASSERT v_personal IS NOT NULL, 'FAIL n0b (precondition): the personal studio is missing';

  SELECT studio_id INTO v_stamped FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000000e6';
  ASSERT v_stamped = v_personal,
    'FAIL n0e (00602): with no rate row anywhere yet, the stamp must fall to her OLDEST owner '
    'seat — the workspace 00295 provisioned at the is_designer flip; got '
    || COALESCE(v_stamped::text, 'NULL');

  -- Her rate exists in the PAYING studio only. The personal studio has none, and
  -- never will: nothing seats a rate there.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000006');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a2', 'b1100000-0000-4000-8000-000000000006',
          22000, CURRENT_DATE - 10, 'b1100000-0000-4000-8000-000000000006');
  PERFORM pg_temp.reset_role();

  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_member_rates
                      WHERE studio_id = v_personal),
    'FAIL n0d (precondition): the personal studio must hold no rate row';

  -- Clear the stamp so step 2 is the path under test. 00602 is BEFORE INSERT only,
  -- so nothing re-stamps it — which is itself asserted in case (y).
  UPDATE public.projects SET studio_id = NULL
   WHERE id = 'b1100000-0000-4000-8000-0000000000e6';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000e6') IS NULL,
    'FAIL n0c (precondition): the project must carry studio_id NULL — step 2 is what is under test';

  -- She logs an hour on her own project, through every trigger.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000ba', 'b1100000-0000-4000-8000-0000000000e6',
          'b1100000-0000-4000-8000-000000000006', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  -- The resolver is probed as postgres (auth.uid() IS NULL, the 00317:38-39
  -- precedent): EXECUTE is revoked from authenticated, so there is no signed-in
  -- caller to probe it as — see case (l).
  SELECT resolved.cents INTO v_resolved
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e6', 'b1100000-0000-4000-8000-000000000006',
    NOW() - INTERVAL '2 hours', NULL) AS resolved;

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000ba';

  ASSERT v_rate = 22000,
    'FAIL n1 (HT-3-a step 2): between two studios she owns, the one holding her rate must '
    'price the hour (22000), not whichever owner seat is older; got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL n2: rate_source must be ''studio_member'' — ''none'' here is the silent $0 invoice '
    'HT-1/HT-26 were ruled to end; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_resolved = 22000,
    'FAIL n3: the resolver and the classifier must agree on the studio; resolver said '
    || COALESCE(v_resolved::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (n) passed.';
END
$$;

-- ─── (o) W1-R2-05: backdating must not erase a W1-era row's provenance ──────
-- HT-13 makes backdating a first-class act. Delta 5 keeps the rate snapshot when
-- the chain has no answer — but it used to force rate_source to NULL, and NULL is
-- DEFINED (00600's COLUMN COMMENT, and TimeRateSource's doc comment) as "a row
-- written before 00600". So a row W1 itself rated at studio_member, backdated
-- before its rate's effective_from, started reading as legacy and lane B's column
-- would render it that way. Case (i) covers a GENUINELY legacy row (OLD.rate_source
-- already NULL) and therefore could not catch this.
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000bb', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bb';
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL o0 (precondition): the row must start as a W1-rated studio_member hour; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- Backdated 20 days BEFORE the studio rate's effective_from (CURRENT_DATE - 30
  -- is the rate; this lands at CURRENT_DATE - 50), so the chain answers 'none'.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries
     SET started_at = NOW() - INTERVAL '50 days'
   WHERE id = 'b1100000-0000-4000-8000-0000000000bb';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bb';

  ASSERT v_rate = 15000,
    'FAIL o1 (P-4): backdating must not write the rate down; got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL o2 (W1-R2-05): the provenance must stay with the snapshot it describes — NULL here '
    'relabels a W1-era row as pre-00600 legacy; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 15000,
    'FAIL o3: the preserved rate must still price the hour; got ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (o) passed.';
END
$$;

-- ─── (p) the self-set workspace rate cannot reach the STUDIO's project ──────
-- The shape is ordinary, not adversarial: a designer carries a solo rate from
-- before she joined a studio. 00295 seats her as OWNER of a personal one-person
-- design_studio, and studio_member_rates_admin_insert (00598) asks only for
-- is_org_admin_or_owner(studio_id) plus subject membership — both true of her
-- about herself THERE. Rounds 3-7 each closed one ordering by which that 99900
-- reached an hour and shipped the next; HT-3-a (RULED 2026-09-12) removes the
-- question instead: the hour is priced by the studio the PROJECT belongs to.
--
-- So this case now asks the question that matters, and it is the employee
-- question: she logs on a project of the studio that employs her (Plain House, whose
-- designer is Rate Studio's owner, stamped studio_id = Rate Studio by 00602). Her
-- workspace, her self-set rate and her own memberships are all unreachable from
-- there. The hour she logs on HER OWN project is the other half of the ruling and is
-- asserted below it: that one IS priced by the studio she owns, deliberately — a
-- solo practitioner pricing her own work.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('b1100000-0000-4000-8000-000000000007', 'rate-solo@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000000007', 'rate-solo@test.invalid', 'Rate Solo', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip, while she belongs to no organization: this is what provisions the
-- personal workspace and seats her as its owner (00295).
UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000000007';

-- …and only then does she join the studio that employs her — as a plain member.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000000c7', 'b1100000-0000-4000-8000-000000000007',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

-- Her own project, for the second half of the ruling.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('b1100000-0000-4000-8000-0000000000e7', 'Solo-rate House',
        'b1100000-0000-4000-8000-000000000007', 'b1100000-0000-4000-8000-000000000007');

DO $$
DECLARE
  v_personal uuid;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
  v_resolved INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000007'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a1';
  ASSERT v_personal IS NOT NULL,
    'FAIL p0 (precondition): 00295 must have provisioned her personal workspace, or this case is vacuous';

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000e1')
         = 'b1100000-0000-4000-8000-0000000000a1',
    'FAIL p0b (precondition, HT-3-a step 1): the studio''s own project must name Rate Studio — '
    'that is the studio whose rate must price her hour';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000e7') = v_personal,
    'FAIL p0c (precondition, 00602): her own project must name the workspace she owns';

  -- She sets her OWN rate in her OWN workspace, through the real policies. This is
  -- still ALLOWED (a solo owner must be able to price her own hours) and HT-3-a keeps
  -- it out of the studio's money by asking which project the hour is on.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000007');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-000000000007', 99900, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-000000000007');
  PERFORM pg_temp.reset_role();
  ASSERT EXISTS (SELECT 1 FROM public.studio_member_rates
                  WHERE studio_id = v_personal AND hourly_rate_cents = 99900),
    'FAIL p0e (precondition): the self-set rate must exist — it is the number that must never '
    'price an hour on the studio''s work';

  -- Her studio prices her at 16000, set by the studio's owner.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000007',
          16000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  -- Two hours on the STUDIO's project, through every trigger.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000007');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000bc', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000007', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT resolved.cents INTO v_resolved
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e1', 'b1100000-0000-4000-8000-000000000007',
    NOW() - INTERVAL '2 hours', NULL) AS resolved;

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bc';

  ASSERT v_rate <> 99900,
    'FAIL p1 (HT-3 + HT-1, HT-3-a): the member''s self-set workspace rate priced an hour on the '
    'STUDIO''s project — she set the rate her employer''s client is billed at';
  ASSERT v_rate = 16000 AND v_source = 'studio_member' AND v_amount = 32000,
    'FAIL p2 (HT-3-a step 1): the studio that owns the project must price the hour '
    '(16000 / 32000 for 120 min); got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_resolved = 16000,
    'FAIL p3: the resolver and the classifier must agree on the studio; resolver said '
    || COALESCE(v_resolved::text, 'NULL');

  -- The other half of the ruling, stated as a test so nobody reads it as a defect:
  -- on HER OWN project the studio she owns prices the hour, including from a rate she
  -- set about herself. HT-3-a rules that explicitly (a solo practitioner pricing her
  -- own work); what it forbids is that number reaching somebody else's project.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000007');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000d0', 'b1100000-0000-4000-8000-0000000000e7',
          'b1100000-0000-4000-8000-000000000007', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000d0';
  ASSERT v_rate = 99900 AND v_source = 'studio_member',
    'FAIL p4 (HT-3-a, the accepted half): on her OWN project the studio she owns prices the '
    'hour — a change here means HT-3-a was re-ruled and step 2 must fall through to ''none'' '
    'for an owner-held studio; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (p) passed.';
END
$$;

-- ─── (q) W1-R3-02: a pre-00600 snapshot survives an edit even when the chain answers ─
-- Delta 5 used to fire only when the chain answered 'none', which honoured P-4
-- exactly where it cost nothing. Here the author DOES hold a studio rate (15000,
-- from CURRENT_DATE - 30) and the row is genuinely legacy: a 17500 snapshot with
-- rate_source NULL. The only edit useUpdateTimeEntry offers that touches this — a
-- duration correction — re-priced it to 15000 and erased the NULL that marks it as
-- pre-00600. Invoiced rows were never at risk (guard_invoiced_time_entry refuses a
-- duration change once invoice_id is set), so the exposure was exactly the unbilled
-- history P-4 names.
DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.studio_member_rates
    WHERE user_id = 'b1100000-0000-4000-8000-000000000002'
      AND hourly_rate_cents = 15000),
    'FAIL q0a (precondition): the author must hold a studio rate, or this case degenerates into (i)';
  ASSERT EXISTS (
    SELECT 1 FROM public.project_team_members
    WHERE project_id = 'b1100000-0000-4000-8000-0000000000e1'
      AND user_id = 'b1100000-0000-4000-8000-000000000002'
      AND removed_at IS NULL),
    'FAIL q0b (precondition): she must be on the project roster to correct her own entry';

  -- The legacy shape, written with the classifier off — the only honest way to
  -- produce a snapshot with no provenance. ALTER TABLE … DISABLE TRIGGER is
  -- transactional, so the ROLLBACK restores it.
  ALTER TABLE public.project_time_entries
    DISABLE TRIGGER aac_classify_project_time_entry_authority_trg;
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source,
     hourly_rate_cents, rated_amount_cents, billing_state)
  VALUES ('b1100000-0000-4000-8000-0000000000bd', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '5 days', 60, true,
          'manual_entry', 17500, 17500, 'authorized');
  ALTER TABLE public.project_time_entries
    ENABLE TRIGGER aac_classify_project_time_entry_authority_trg;

  ASSERT (SELECT rate_source FROM public.project_time_entries
           WHERE id = 'b1100000-0000-4000-8000-0000000000bd') IS NULL,
    'FAIL q0c (precondition): the legacy row must carry NULL provenance';

  -- She corrects the duration — the one edit the hook offers.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries SET duration_minutes = 120
   WHERE id = 'b1100000-0000-4000-8000-0000000000bd';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bd';

  ASSERT v_rate = 17500,
    'FAIL q1 (P-4, W1-R3-02): a duration edit must not re-price a legacy snapshot to the '
    'author''s current studio rate; got ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source IS NULL,
    'FAIL q2 (W1-R3-02): the row must stay identifiable as pre-00600; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 35000,
    'FAIL q3: the preserved rate re-prices the new duration (120 min at 17500/h); got '
    || COALESCE(v_amount::text, 'NULL');

  -- The second vector named in W1-R3-02: a billable off/on round trip reaches the
  -- same overwrite through the non-billable branch.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  UPDATE public.project_time_entries SET billable = false
   WHERE id = 'b1100000-0000-4000-8000-0000000000bd';
  UPDATE public.project_time_entries SET billable = true
   WHERE id = 'b1100000-0000-4000-8000-0000000000bd';
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bd';

  ASSERT v_rate = 17500 AND v_source IS NULL,
    'FAIL q4 (W1-R3-02): a billable off/on round trip must not re-price the legacy snapshot '
    'either; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 35000,
    'FAIL q5: the round trip must leave the amount at 35000; got ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (q) passed.';
END
$$;

-- ─── (r) W1-R4-01 (negative): the collaborator seat buys nothing ────────────
-- Round 3 closed case (p) with a PROXY — "a studio with more than one active
-- non-guest member outranks a one-person workspace" — and the member controls the
-- proxy: organization_members' only INSERT policy is
-- `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`, and 00295's
-- fc_provision_studio_on_designer makes her the OWNER of the personal workspace, so
-- she seats a second, non-owner member there from the browser through RLS. Measured
-- at the round-3 commit: her self-set 99900 priced a 120-minute hour at $1,998.00.
--
-- The fixture is kept verbatim as a NEGATIVE case. Under HT-3-a the multi-member
-- count is not a key at all — nothing about a studio the member stands in is — so
-- the seat changes nothing that can be measured: the hour is on the studio's
-- project and the studio's 15000 prices it.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000000008', 'rate-proxy@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000000009', 'rate-collab@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- The collaborator she will seat: NOT a designer, so 00295 provisions nothing for
-- him and he is only ever a body in her workspace's member count.
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000000009', 'rate-collab@test.invalid', 'Rate Collab', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000000008', 'rate-proxy@test.invalid', 'Rate Proxy', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip, while she belongs to no organization (00295 no-ops otherwise).
UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000000008';

-- …and only then does she join the studio that employs her, as a plain member.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000000c8', 'b1100000-0000-4000-8000-000000000008',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

DO $$
DECLARE
  v_personal uuid;
  v_peers    INTEGER;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
  v_resolved INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000000008'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a1';
  ASSERT v_personal IS NOT NULL,
    'FAIL r0 (precondition): 00295 must have provisioned her personal workspace, or this case is vacuous';

  -- THE MOVE. She seats a collaborator in her own workspace, through the shipped
  -- INSERT policy, as herself. Nothing here is privileged.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000008');
  INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
  VALUES ('b1100000-0000-4000-8000-0000000000c9', 'b1100000-0000-4000-8000-000000000009',
          v_personal, 'member', 'active', NOW());
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_peers FROM public.organization_members
   WHERE organization_id = v_personal AND status = 'active' AND role <> 'guest';
  ASSERT v_peers > 1,
    'FAIL r0c (precondition): the collaborator INSERT through RLS must have made her personal '
    'workspace multi-member — that is the proxy the fixture buys; found ' || v_peers;

  -- She self-sets 99900 there, through the real policy. Still ALLOWED.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000008');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-000000000008', 99900, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-000000000008');
  PERFORM pg_temp.reset_role();

  -- Her studio prices her at 15000, set by the studio's OWNER.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000000008',
          15000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  -- Two hours on the STUDIO's project, through every trigger.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000008');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000be', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000000008', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT resolved.cents INTO v_resolved
  FROM public.resolve_time_rate_cents(
    'b1100000-0000-4000-8000-0000000000e1', 'b1100000-0000-4000-8000-000000000008',
    NOW() - INTERVAL '2 hours', NULL) AS resolved;

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000be';

  ASSERT v_rate <> 99900,
    'FAIL r1 (W1-R4-01 negative, HT-3 + HT-1): seating a collaborator in her own workspace '
    'reached the studio''s project again';
  ASSERT v_rate = 15000 AND v_source = 'studio_member' AND v_amount = 30000,
    'FAIL r2 (HT-3-a step 1): the studio that owns the project prices the hour (15000 / 30000); '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');
  ASSERT v_resolved = 15000,
    'FAIL r3: the resolver and the classifier must agree on the studio; resolver said '
    || COALESCE(v_resolved::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (r) passed.';
END
$$;

-- ─── (s) HT-3-a, both directions on one fixture: her own studio prices her own
--         project; the studio that has not priced her leaves the hour pending ──
-- Ordinary shape: a designer whose own one-person studio prices her at 18000, who
-- is also an active plain MEMBER of a multi-member studio that has never priced her.
--
-- HT-3-a (RULED 2026-09-12) answers both halves from the project:
--   · her own project names the studio she owns → 18000 (s1-s4). This is the
--     ruling's accepted half — a solo practitioner pricing her own work — and it is
--     why W1-R4-02's money bug (a studio that never priced her winning and writing
--     the hour down to $0) cannot return.
--   · an hour on the OTHER studio's project names that studio, which has never
--     priced her → 'none', "rate pending" (HT-26), and the composer keeps it off an
--     invoice (s5). Her 18000 does not follow her onto somebody else's work, which
--     is the half the deleted ladder got wrong.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('b1100000-0000-4000-8000-00000000000a', 'rate-unpriced@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-00000000000a', 'rate-unpriced@test.invalid', 'Rate Unpriced', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-00000000000a';

-- She joins the multi-member studio that never prices her.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000000ca', 'b1100000-0000-4000-8000-00000000000a',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('b1100000-0000-4000-8000-0000000000e9', 'Unpriced House',
        'b1100000-0000-4000-8000-00000000000a', 'b1100000-0000-4000-8000-00000000000a');

DO $$
DECLARE
  v_personal uuid;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-00000000000a'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a1';
  ASSERT v_personal IS NOT NULL,
    'FAIL s0 (precondition): 00295 must have provisioned her personal studio';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000e9') = v_personal,
    'FAIL s0b (precondition, 00602): her own project must name the studio she owns';
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_member_rates
                      WHERE studio_id = 'b1100000-0000-4000-8000-0000000000a1'
                        AND user_id = 'b1100000-0000-4000-8000-00000000000a'),
    'FAIL s0c (precondition): the multi-member studio must hold NO rate for her';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000000a');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-00000000000a', 18000, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-00000000000a');

  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000bf', 'b1100000-0000-4000-8000-0000000000e9',
          'b1100000-0000-4000-8000-00000000000a', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000bf';

  ASSERT v_source <> 'none',
    'FAIL s1 (W1-R4-02): the studio she owns names her own project and prices her at 18000 — '
    'a ''none'' here is $0 into the unbilled view, the balance, the composer and the invoice lock';
  ASSERT v_rate = 18000,
    'FAIL s2 (HT-3-a, the accepted half): her own project is priced by the studio she owns '
    '(18000). A failure here means HT-3-a was re-ruled — step 2 would have to refuse an '
    'owner-held studio and fall through to ''none'' — and cases (p) and (w) move with it; got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'studio_member',
    'FAIL s3: rate_source must be ''studio_member''; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount = 36000,
    'FAIL s4: 120 minutes at 18000/h is 36000, not ' || COALESCE(v_amount::text, 'NULL');

  -- The other direction: the SAME 18000, on the other studio's project.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000000a');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000c0', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-00000000000a', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000c0';
  ASSERT v_source = 'none' AND v_rate IS NULL,
    'FAIL s5 (HT-3-a step 1): the studio that owns the work has never priced her, so the hour '
    'is ''rate pending'' — her own studio''s 18000 must not follow her onto its project; got '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rate::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (s) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 5 — the round-4 key was manufacturable two ways, and HT-41's own
-- pick was a lever in the one hand the server used to hold shut.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000005001', 'r5-forge@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005002', 'r5-collab@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005003', 'r5-twoacct@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005004', 'r5-second@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005005', 'r5-selfseat@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005006', 'r5-soleowner@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005007', 'r5-peer@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- ─── (t) W1-R7-03 + W1-R5-01 (negative): authorship and the open row's dates ──
-- Round 4's arm's-length key made `created_by` an authorization column, and round 5
-- found she could re-stamp it (round 2 had deliberately left it un-frozen for the
-- settings page's blur-save). HT-3-a deletes the key, so authorship is no longer a
-- pricing input at all — but the two guards 00598 grew are KEPT and asserted here,
-- because they are about the integrity of a studio's own rate history, not about the
-- ladder:
--   · created_by may only ever be re-stamped with the actor's own id (W1-R5-01), so
--     a studio admin cannot relabel a colleague's row as self-authored, and
--   · effective_from / effective_to are frozen on the open row (W1-R7-03), so a
--     rate-setter cannot hand-close a colleague's only open row and leave every
--     later hour at 'none' and every later invoice at $0.
-- The hour itself is on the studio's project, and the studio's 15000 prices it.
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000005001', 'r5-forge@test.invalid',  'R5 Forge',  false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000005002', 'r5-collab@test.invalid', 'R5 Collab', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip happens while she belongs to no organization, or 00295 no-ops.
UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000005001';

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000050c1', 'b1100000-0000-4000-8000-000000005001',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

DO $$
DECLARE
  v_personal     uuid;
  v_forge_raised BOOLEAN := false;
  v_from_raised  BOOLEAN := false;
  v_to_raised    BOOLEAN := false;
  v_author       uuid;
  v_open         INTEGER;
  v_rate         INTEGER;
  v_source       TEXT;
  v_amount       INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000005001'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a1';
  ASSERT v_personal IS NOT NULL,
    'FAIL t0 (precondition): 00295 must have provisioned her personal workspace';

  -- Her two moves, both through shipped policies, as her.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005001');
  INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
  VALUES ('b1100000-0000-4000-8000-0000000050c2', 'b1100000-0000-4000-8000-000000005002',
          v_personal, 'member', 'active', NOW());
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-000000005001', 99900, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-000000005001');
  PERFORM pg_temp.reset_role();

  -- The studio that employs her prices her at 15000, written by its owner.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000005001',
          15000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  -- MOVE 1: re-stamp her own row's authorship with the collaborator's id.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005001');
  BEGIN
    UPDATE public.studio_member_rates
       SET created_by = 'b1100000-0000-4000-8000-000000005002'
     WHERE studio_id = v_personal
       AND user_id   = 'b1100000-0000-4000-8000-000000005001';
  EXCEPTION WHEN check_violation THEN v_forge_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_forge_raised,
    'FAIL t1 (W1-R5-01): the member must not be able to re-stamp created_by with another id — '
    'authorship records the actor';

  SELECT created_by INTO v_author FROM public.studio_member_rates
   WHERE studio_id = v_personal AND user_id = 'b1100000-0000-4000-8000-000000005001';
  ASSERT v_author = 'b1100000-0000-4000-8000-000000005001',
    'FAIL t2 (W1-R5-01): her workspace rate must still read as SELF-authored, got '
    || COALESCE(v_author::text, 'NULL');

  -- MOVE 2 (W1-R7-03): the studio's OWNER hand-closes the employing studio's only
  -- open row for her. If that lands, every later hour resolves 'none' and every
  -- later invoice line is $0 — the append-only table's whole point undone by one
  -- UPDATE, by the one actor the policies admit.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.studio_member_rates
       SET effective_to = CURRENT_DATE - 1
     WHERE studio_id = 'b1100000-0000-4000-8000-0000000000a1'
       AND user_id   = 'b1100000-0000-4000-8000-000000005001';
  EXCEPTION WHEN check_violation THEN v_to_raised := true;
  END;
  BEGIN
    UPDATE public.studio_member_rates
       SET effective_from = CURRENT_DATE + 30
     WHERE studio_id = 'b1100000-0000-4000-8000-0000000000a1'
       AND user_id   = 'b1100000-0000-4000-8000-000000005001';
  EXCEPTION WHEN check_violation THEN v_from_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_to_raised,
    'FAIL t5 (W1-R7-03): a rate-setter hand-closed the open row — effective_to is the ladder''s '
    'column on UPDATE as well as on INSERT, or the member has no rate at all from tomorrow';
  ASSERT v_from_raised,
    'FAIL t6 (W1-R7-03): effective_from must be frozen on the open row too — moving it forward '
    'opens a gap the resolver reads as ''none''';

  SELECT count(*) INTO v_open FROM public.studio_member_rates
   WHERE studio_id = 'b1100000-0000-4000-8000-0000000000a1'
     AND user_id = 'b1100000-0000-4000-8000-000000005001'
     AND effective_to IS NULL;
  ASSERT v_open = 1,
    'FAIL t7 (W1-R7-03): exactly one open row must survive the attempted edits, found ' || v_open;

  -- The hour, on the STUDIO's project.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005001');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b1', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000005001', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b1';

  ASSERT v_rate <> 99900,
    'FAIL t3 (HT-1 + HT-3): her own workspace rate priced an hour on the studio''s project';
  ASSERT v_rate = 15000 AND v_source = 'studio_member' AND v_amount = 30000,
    'FAIL t4 (HT-3-a step 1): the studio that owns the project must price the hour '
    '(15000 / 30000 for 120 min); got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (t) passed.';
END
$$;

-- ─── (u) W1-R5-02 (negative): a second account, seated admin, buys nothing ───
-- No forge at all. organization_members' INSERT policy is
-- `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`, and
-- 'admin' <> 'owner' — so the owner of her personal workspace seats a SECOND
-- ACCOUNT there as an ADMIN, and that account satisfies
-- studio_member_rates_admin_insert in full (owner/admin of the studio,
-- created_by = auth.uid(), subject an active non-guest member) and writes her 99900.
-- Genuinely arm's-length by round 4's own definition; cost, one signup. Measured at
-- $1,998.00 authorized against the round-4 and round-5 bodies.
--
-- Kept verbatim as a NEGATIVE case: HT-3-a asks which studio owns the PROJECT, and
-- no number of accounts she controls changes that answer.
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000005003', 'r5-twoacct@test.invalid', 'R5 Twoacct', false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000005004', 'r5-second@test.invalid',  'R5 Second',  false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000005003';

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000050c3', 'b1100000-0000-4000-8000-000000005003',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

DO $$
DECLARE
  v_personal uuid;
  v_author   uuid;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000005003'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000000a1';
  ASSERT v_personal IS NOT NULL,
    'FAIL u0 (precondition): 00295 must have provisioned her personal workspace';

  -- She seats her second account as an ADMIN of her own workspace, through RLS.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005003');
  INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
  VALUES ('b1100000-0000-4000-8000-0000000050c4', 'b1100000-0000-4000-8000-000000005004',
          v_personal, 'admin', 'active', NOW());
  PERFORM pg_temp.reset_role();

  -- The second account writes her 99900 there. Nothing is forged.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005004');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-000000005003', 99900, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-000000005004');
  PERFORM pg_temp.reset_role();

  -- The studio that employs her prices her at 15000.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-000000005003',
          15000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  SELECT created_by INTO v_author FROM public.studio_member_rates
   WHERE studio_id = v_personal AND user_id = 'b1100000-0000-4000-8000-000000005003';
  ASSERT v_author = 'b1100000-0000-4000-8000-000000005004',
    'FAIL u0c (precondition): her workspace row must read ARM''S-LENGTH (authored by the second '
    'account) or this case proves nothing; got ' || COALESCE(v_author::text, 'NULL');
  ASSERT (SELECT count(*) FROM public.organization_members
           WHERE organization_id = v_personal AND status = 'active' AND role <> 'guest') = 2,
    'FAIL u0d (precondition): the admin seat must have landed through RLS';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b2', 'b1100000-0000-4000-8000-0000000000e1',
          'b1100000-0000-4000-8000-000000005003', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b2';

  ASSERT v_rate <> 99900,
    'FAIL u1 (W1-R5-02 negative, HT-1 + HT-3): a second account she controls priced an hour on '
    'the studio''s project';
  ASSERT v_rate = 15000 AND v_source = 'studio_member' AND v_amount = 30000,
    'FAIL u2 (HT-3-a step 1): the studio that owns the project prices the hour (15000 / 30000); '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (u) passed.';
END
$$;

-- ─── (v) W1-R5-03: a project designer may not pick her own client-billed card ─
-- 00578:2708-2710 hard-coded 'lead_designer' for the project's own designer BEFORE
-- any roster read, so her roster rows were never consulted for her. W1 put HT-41's
-- pick above that branch and validated it against project_team_members — a table
-- she WRITES: `Lead designers manage team members` is an ALL policy qualified on
-- projects.designer_id = auth.uid() with no with_check of its own. So she seats
-- herself as 'vendor', names it, and the 40000 Vendor card prices her hour where her
-- own Lead designer card says 10000 — rate_source still 'authority', so the row
-- prints as a signed, client-agreed rate and claim_time_entries invoice-locks it.
-- Case (e) cannot catch it (its two-hat member is NOT the project designer) and
-- neither can (g) (its role is one she does not hold at all).
-- is_designer stays FALSE: she never needs a personal workspace here (the signed
-- authority prices this hour), and a second studio would only add noise.
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-000000005005', 'r5-selfseat@test.invalid', 'R5 Selfseat', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- A plain 'member' on purpose: the lever under test is the PROJECT designer's, not
-- a studio admin's.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000050c5', 'b1100000-0000-4000-8000-000000005005',
        'b1100000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('b1100000-0000-4000-8000-0000000050e3', 'Self-seat House',
        'b1100000-0000-4000-8000-000000005005', 'b1100000-0000-4000-8000-000000005005');

INSERT INTO public.proposals (id, designer_id, title, status, document_kind)
VALUES ('b1100000-0000-4000-8000-0000000050d1', 'b1100000-0000-4000-8000-000000005005',
        'Self-seat agreement', 'draft', 'design_services');

-- Her own card pays 10000; the Vendor card pays four times that.
INSERT INTO public.proposal_service_rates (id, proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at)
VALUES
  ('b1100000-0000-4000-8000-0000000050f1', 'b1100000-0000-4000-8000-0000000050d1', 1, 'Lead designer', 10000, 0, NOW() - INTERVAL '20 days'),
  ('b1100000-0000-4000-8000-0000000050f2', 'b1100000-0000-4000-8000-0000000050d1', 1, 'Vendor',        40000, 1, NOW() - INTERVAL '20 days');

INSERT INTO public.project_commercial_documents
  (id, project_id, proposal_id, document_kind, is_origin, created_by, executed_at)
VALUES ('b1100000-0000-4000-8000-0000000050cd', 'b1100000-0000-4000-8000-0000000050e3',
        'b1100000-0000-4000-8000-0000000050d1', 'design_services', true,
        'b1100000-0000-4000-8000-000000005005', NOW() - INTERVAL '5 days');

INSERT INTO public.project_billing_authorities
  (id, project_id, commercial_document_id, source_proposal_id, billing_ceiling_cents,
   retainer_amount_cents, retainer_activation_policy, billing_cadence, effective_at, status)
VALUES ('b1100000-0000-4000-8000-0000000050ba', 'b1100000-0000-4000-8000-0000000050e3',
        'b1100000-0000-4000-8000-0000000050cd', 'b1100000-0000-4000-8000-0000000050d1',
        100000000, 0, 'immediate', 'monthly', NOW() - INTERVAL '5 days', 'active');

INSERT INTO public.project_billing_authority_rates
  (id, billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents)
VALUES
  ('b1100000-0000-4000-8000-0000000050a1', 'b1100000-0000-4000-8000-0000000050ba', 'b1100000-0000-4000-8000-0000000050f1', 1, 'Lead designer', 10000),
  ('b1100000-0000-4000-8000-0000000050a2', 'b1100000-0000-4000-8000-0000000050ba', 'b1100000-0000-4000-8000-0000000050f2', 1, 'Vendor',        40000);

DO $$
DECLARE
  v_seated BOOLEAN := false;
  v_rate   INTEGER;
  v_source TEXT;
  v_role   TEXT;
  v_amount INTEGER;
BEGIN
  -- THE MOVE, as her, through the shipped roster policy. Nothing privileged.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005005');
  INSERT INTO public.project_team_members (id, project_id, user_id, role, assigned_by)
  VALUES ('b1100000-0000-4000-8000-0000000050dd', 'b1100000-0000-4000-8000-0000000050e3',
          'b1100000-0000-4000-8000-000000005005', 'vendor', 'b1100000-0000-4000-8000-000000005005');
  PERFORM pg_temp.reset_role();

  SELECT EXISTS (SELECT 1 FROM public.project_team_members
                  WHERE project_id = 'b1100000-0000-4000-8000-0000000050e3'
                    AND user_id = 'b1100000-0000-4000-8000-000000005005'
                    AND role = 'vendor' AND removed_at IS NULL) INTO v_seated;
  ASSERT v_seated,
    'FAIL v0 (precondition): the project designer must be able to seat herself as vendor — if '
    'that is closed, this case is vacuous and the finding should be re-derived';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005005');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source, rate_role)
  VALUES ('b1100000-0000-4000-8000-0000000050b3', 'b1100000-0000-4000-8000-0000000050e3',
          'b1100000-0000-4000-8000-000000005005', NOW() - INTERVAL '2 hours', 120, true,
          'manual_entry', 'vendor');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rate_role, rated_amount_cents
    INTO v_rate, v_source, v_role, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b3';

  ASSERT v_rate <> 40000,
    'FAIL v1 (W1-R5-03, HT-1): the project designer named the Vendor card and billed the client '
    '$400.00/h where her own signed card says $100.00/h';
  ASSERT v_rate = 10000 AND v_source = 'authority' AND v_amount = 20000,
    'FAIL v2 (W1-R5-03): her own Lead designer card must price the hour (10000 / 20000 for 120 '
    'min); got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL')
    || ' / ' || COALESCE(v_amount::text, 'NULL');
  ASSERT v_role = 'lead_designer',
    'FAIL v3 (W1-R5-03): the row must record the role that PRICED it, not the pick it discarded; got '
    || COALESCE(v_role, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (v) passed.';
END
$$;

-- ─── (w) a studio's principal is not stranded, and the one tiebreak that looks
--         wrong is stated out loud ─────────────────────────────────────────────
-- The commonest shape in the product: the principal of a real studio, who ALSO owns
-- the one-person workspace 00295 provisioned at her is_designer flip. Both
-- candidates are studios she owns, so HT-3-a step 2's preference key decides.
--
--  (w1) Her real studio holds her rate and the workspace holds none — the ordinary
--       case. The stamp must land on the real studio, or the principal of a real
--       studio bills $0.
--  (w2) BOTH hold a rate. The preference key ties and the ruled tiebreak is "the
--       oldest owner membership", which is the auto-provisioned workspace — older
--       than the real studio by construction, because 00295 fires at the flip and
--       the real studio is created afterwards. So the workspace's number prices the
--       hour. That is HT-3-a applied literally; it is recorded here rather than
--       smoothed over, because it is the one outcome of the ruling that reads oddly,
--       and a follow-on ruling (prefer the studio with more than one active member?
--       prefer the most recently priced rate?) would move w2 and nothing else.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000005006', 'r5-soleowner@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000005007', 'r5-peer@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000005006', 'r5-soleowner@test.invalid', 'R5 Soleowner', false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000005007', 'r5-peer@test.invalid',      'R5 Peer',      false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

UPDATE public.profiles SET is_designer = true
 WHERE id = 'b1100000-0000-4000-8000-000000005006';

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000050a3', 'design_studio', 'R5 Real Studio', 'r5-real-studio', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000050c6', 'b1100000-0000-4000-8000-000000005006',
   'b1100000-0000-4000-8000-0000000050a3', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000050c7', 'b1100000-0000-4000-8000-000000005007',
   'b1100000-0000-4000-8000-0000000050a3', 'member', 'active', NOW());

-- organization_members.created_at defaults to now(), which inside one transaction is
-- the TRANSACTION timestamp — so every seat this file writes carries the identical
-- instant and HT-3-a's "oldest owner membership" key would degenerate to the
-- studio.id determinism backstop (a random uuid for an auto-provisioned workspace,
-- i.e. a coin flip). In production the is_designer flip and the founding of a studio
-- are different transactions, days or years apart. The UPDATE below (as postgres)
-- restores that shape so the RULED key is what decides.
UPDATE public.organization_members
   SET created_at = NOW() - INTERVAL '1 year'
 WHERE user_id = 'b1100000-0000-4000-8000-000000005006'
   AND organization_id <> 'b1100000-0000-4000-8000-0000000050a3';

DO $$
DECLARE
  v_personal uuid;
  v_stamped  uuid;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
BEGIN
  SELECT studio.id INTO v_personal
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000005006'
    AND studio.id <> 'b1100000-0000-4000-8000-0000000050a3';
  ASSERT v_personal IS NOT NULL,
    'FAIL w0 (precondition): 00295 must have provisioned her personal workspace, or the tie this '
    'case is about does not exist';
  ASSERT (SELECT created_at FROM public.organization_members
           WHERE organization_id = v_personal AND user_id = 'b1100000-0000-4000-8000-000000005006')
         < (SELECT created_at FROM public.organization_members
             WHERE id = 'b1100000-0000-4000-8000-0000000050c6'),
    'FAIL w0b (precondition): the workspace seat must be the OLDER owner membership, or w2 is '
    'measuring something else';

  -- (w1) Only the real studio prices her.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000050a3', 'b1100000-0000-4000-8000-000000005006', 22000,
          CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000005006');
  PERFORM pg_temp.reset_role();

  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000050e4', 'Principal House',
          'b1100000-0000-4000-8000-000000005006', 'b1100000-0000-4000-8000-000000005006');

  SELECT studio_id INTO v_stamped FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000050e4';
  ASSERT v_stamped = 'b1100000-0000-4000-8000-0000000050a3',
    'FAIL w1a (HT-3-a step 2 / 00602): the studio that holds her rate must win the stamp over an '
    'older owner seat with no rate; got ' || COALESCE(v_stamped::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b4', 'b1100000-0000-4000-8000-0000000050e4',
          'b1100000-0000-4000-8000-000000005006', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b4';

  ASSERT v_source <> 'none',
    'FAIL w1 (regression guard): the principal of a real studio must never resolve ''none'' and '
    'bill $0 on her own project';
  ASSERT v_rate = 22000 AND v_source = 'studio_member' AND v_amount = 44000,
    'FAIL w2: her real studio''s 22000 must price the hour (44000 for 120 min); got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  -- (w2) Both studios now hold a rate for her. The preference key ties and the ruled
  -- tiebreak — the oldest owner membership — is the auto-provisioned workspace.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_personal, 'b1100000-0000-4000-8000-000000005006', 99900,
          CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000005006');
  PERFORM pg_temp.reset_role();

  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000050e5', 'Principal House II',
          'b1100000-0000-4000-8000-000000005006', 'b1100000-0000-4000-8000-000000005006');

  SELECT studio_id INTO v_stamped FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000050e5';
  ASSERT v_stamped = v_personal,
    'FAIL w3 (HT-3-a step 2, the literal tiebreak): with BOTH owned studios holding a rate the '
    'preference key ties and the OLDEST owner membership decides — that is the workspace 00295 '
    'provisioned at the flip. A change here is a follow-on ruling, not a bug fix; got '
    || COALESCE(v_stamped::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b5', 'b1100000-0000-4000-8000-0000000050e5',
          'b1100000-0000-4000-8000-000000005006', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b5';
  ASSERT v_rate = 99900 AND v_source = 'studio_member',
    'FAIL w4 (HT-3-a, recorded): the hour on the project her workspace owns prices from that '
    'workspace. Every rate here is HERS to set and no client of another studio is touched — but '
    'this is the shape a follow-on ruling would change; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (w) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUNDS 6 + 7, kept as NEGATIVE cases: the puppet workspace, the plain
-- `member` seat inside it, the backdated seat, and the one-UPDATE backdate of
-- organizations.created_at. Under HT-3-a none of them is a pricing input.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000006001', 'r6-subject@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000006002', 'r6-puppet@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000006003', 'r6-employer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- ─── (x) W1-R6-01 + W1-R7-01 (negative): a second account's workspace, a
--         backdated seat, and a backdated organization ─────────────────────────
-- Round 5's key ("this studio holds a rate for her AND she does not run it") is TRUE
-- for a workspace a SECOND ACCOUNT she controls owns: `Org owners can insert members`
-- is `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`, so that account
-- seats HER there as a plain `member` and, as the workspace's owner, writes her rate
-- at any number under its own created_by. Round 6 deleted the seat-date tiebreaks
-- that then decided it; round 7 showed the replacement last resort was caller-writable
-- too — `Org admins can update organization` carries no column guard on created_at
-- (guard_organization_admin_columns freezes status, type, subscription_tier,
-- subscription_expires_at, business_verified, business_verified_at), so ONE UPDATE
-- backdated the puppet workspace five years and the same $1,998.00 came back.
--
-- HT-3-a ends the sequence by deleting the question. Every manoeuvre is performed
-- here, through RLS, as the actor named — and then measured twice:
--   (x1/x2) on the EMPLOYING studio's own project, its 15000 prices the hour;
--   (x3)    on HER OWN project, the studio she owns prices it — and it holds no
--           rate, so the hour is 'rate pending'. The puppet's 99900 is unreachable
--           from either, and organizations.created_at is read by nothing.
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000006001', 'r6-subject@test.invalid',  'R6 Subject',  false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000006002', 'r6-puppet@test.invalid',   'R6 Puppet',   false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000006003', 'r6-employer@test.invalid', 'R6 Employer', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

-- The flip is what makes 00295 provision each designer her own workspace: the
-- subject's (which becomes the studio her OWN project names) and the puppet
-- account's (the workspace this case is about).
UPDATE public.profiles SET is_designer = true
 WHERE id IN ('b1100000-0000-4000-8000-000000006001', 'b1100000-0000-4000-8000-000000006002');

-- The studio that really employs her, two years old, with its own owner.
INSERT INTO public.organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b1100000-0000-4000-8000-0000000060a1', 'design_studio', 'R6 Employing Studio',
        'r6-employing-studio', 'active', NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000060c3', 'b1100000-0000-4000-8000-000000006003',
   'b1100000-0000-4000-8000-0000000060a1', 'owner',  'active', NOW() - INTERVAL '2 years'),
  ('b1100000-0000-4000-8000-0000000060c1', 'b1100000-0000-4000-8000-000000006001',
   'b1100000-0000-4000-8000-0000000060a1', 'member', 'active', NOW() - INTERVAL '1 year');

-- The employing studio's own project (its owner is the lead designer, so 00602
-- stamps the studio) and the subject's own project.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES
  ('b1100000-0000-4000-8000-0000000060e2', 'Employer House',
   'b1100000-0000-4000-8000-000000006003', 'b1100000-0000-4000-8000-000000006003'),
  ('b1100000-0000-4000-8000-0000000060e1', 'Puppet-seat House',
   'b1100000-0000-4000-8000-000000006001', 'b1100000-0000-4000-8000-000000006001');

DO $$
DECLARE
  v_puppet     uuid;
  v_own        uuid;
  v_author     uuid;
  v_seatrole   TEXT;
  v_backdated  BOOLEAN := false;
  v_rate       INTEGER;
  v_source     TEXT;
  v_amount     INTEGER;
BEGIN
  SELECT studio.id INTO v_puppet
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000006002'
    AND m.role = 'owner';
  ASSERT v_puppet IS NOT NULL,
    'FAIL x0 (precondition): 00295 must have provisioned the SECOND account its own workspace — '
    'that workspace is the whole attack';

  SELECT studio.id INTO v_own
  FROM public.organizations studio
  JOIN public.organization_members m ON m.organization_id = studio.id
  WHERE m.user_id = 'b1100000-0000-4000-8000-000000006001'
    AND m.role = 'owner';
  ASSERT v_own IS NOT NULL AND v_own <> v_puppet,
    'FAIL x0b (precondition): she must also hold her own workspace, distinct from the puppet''s';

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000060e2')
         = 'b1100000-0000-4000-8000-0000000060a1',
    'FAIL x0c (precondition, HT-3-a step 1): the employing studio''s project must name it';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000060e1') = v_own,
    'FAIL x0d (precondition, 00602): her own project must name the workspace SHE owns, not the '
    'puppet''s — she is a plain member there and a member''s seats stamp nothing';

  -- The studio that employs her prices her at 15000, written by its own owner.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006003');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000060a1', 'b1100000-0000-4000-8000-000000006001',
          15000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000006003');
  PERFORM pg_temp.reset_role();

  -- THE MOVES, all through RLS as the puppet account; nothing is forged.
  --   1. seat her in ITS workspace as a plain `member`, with a backdated seat;
  --   2. write her 99900 there under its own created_by;
  --   3. backdate the workspace itself five years (W1-R7-01's one UPDATE).
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006002');
  INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at, created_at)
  VALUES ('b1100000-0000-4000-8000-0000000060c2', 'b1100000-0000-4000-8000-000000006001',
          v_puppet, 'member', 'active', NOW() - INTERVAL '3 years', NOW() - INTERVAL '3 years');

  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_puppet, 'b1100000-0000-4000-8000-000000006001', 99900, CURRENT_DATE - 30,
          'b1100000-0000-4000-8000-000000006002');

  BEGIN
    UPDATE public.organizations SET created_at = NOW() - INTERVAL '5 years' WHERE id = v_puppet;
    v_backdated := true;
  EXCEPTION WHEN OTHERS THEN v_backdated := false;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role::text INTO v_seatrole FROM public.organization_members
   WHERE organization_id = v_puppet AND user_id = 'b1100000-0000-4000-8000-000000006001';
  ASSERT v_seatrole = 'member',
    'FAIL x0f (precondition): she must be a plain `member` of the puppet workspace — that is what '
    'made round 5''s first key TRUE there; got ' || COALESCE(v_seatrole, 'NULL');

  SELECT created_by INTO v_author FROM public.studio_member_rates
   WHERE studio_id = v_puppet AND user_id = 'b1100000-0000-4000-8000-000000006001';
  ASSERT v_author = 'b1100000-0000-4000-8000-000000006002',
    'FAIL x0g (precondition): the puppet''s rate row must read arm''s-length (authored by the '
    'second account) or this case proves nothing; got ' || COALESCE(v_author::text, 'NULL');

  -- Recorded, not asserted shut: the backdate is still ALLOWED (round 7's proposed
  -- guard_organization_admin_columns freeze is not shipped, because HT-3-a stopped
  -- reading the column). If it ever starts being read again, this is the door.
  ASSERT v_backdated,
    'FAIL x0i (precondition): the organizations.created_at backdate is expected to SUCCEED — it '
    'is unguarded (W1-R7-01) and harmless only because no pricing key reads it. If it now raises, '
    'someone shipped the freeze and this note should say so';
  ASSERT (SELECT created_at FROM public.organizations WHERE id = v_puppet)
         < (SELECT created_at FROM public.organizations
             WHERE id = 'b1100000-0000-4000-8000-0000000060a1'),
    'FAIL x0j (precondition): after the backdate the puppet must LOOK older than the employing '
    'studio — that is exactly the state round 7''s exploit needed';

  -- (x1/x2) The hour on the EMPLOYING studio's project.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006001');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000060b1', 'b1100000-0000-4000-8000-0000000060e2',
          'b1100000-0000-4000-8000-000000006001', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000060b1';

  ASSERT v_rate <> 99900,
    'FAIL x1 (W1-R6-01 + W1-R7-01 negative, HT-1 + HT-3): a rate set in a SECOND ACCOUNT''s '
    'backdated workspace priced an hour on the employing studio''s project — $1,998.00, the figure '
    'rounds 3, 4, 5, 6 and 7 each reported closed';
  ASSERT v_rate = 15000 AND v_source = 'studio_member' AND v_amount = 30000,
    'FAIL x2 (HT-3-a step 1): the studio that owns the project must price the hour (15000 / 30000); '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  -- (x3) The same hour on HER OWN project: the studio she owns prices it, and it has
  -- never priced her, so the row is honest about having no rate.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006001');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000060b2', 'b1100000-0000-4000-8000-0000000060e1',
          'b1100000-0000-4000-8000-000000006001', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000060b2';
  ASSERT v_source = 'none' AND v_rate IS NULL,
    'FAIL x3 (HT-3-a step 2): her own project names the workspace SHE owns, which holds no rate, '
    'so the hour is ''rate pending'' — not the puppet''s 99900 and not the employing studio''s '
    '15000; got ' || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rate::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (x) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 8 — the two cases HT-3-a adds: the stamp at project INSERT
-- (00602) and the primacy of the project's own column.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── (y) 00602: projects.studio_id is stamped at INSERT, and only from an
--         OWNER seat ───────────────────────────────────────────────────────────
-- HT-3-a's second half. Step 1 of the ladder is only the normal path if the column
-- is populated at creation, and it may only ever be populated from a studio the
-- lead designer OWNS — an owner seat is the one membership row nobody can create
-- through RLS (`Org owners can insert members` carries role <> 'owner'), so it
-- exists only by 00295's provisioning at her own signup or by ownership transfer.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000008001', 'r8-owner@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000008002', 'r8-nostudio@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000008003', 'r8-plainmem@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000008001', 'r8-owner@test.invalid',   'R8 Owner',   false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000008002', 'r8-nostudio@test.invalid','R8 NoStudio',false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000008003', 'r8-plainmem@test.invalid','R8 PlainMem',false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_designer = false;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000080a1', 'design_studio', 'R8 One Studio', 'r8-one-studio', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000080c1', 'b1100000-0000-4000-8000-000000008001',
   'b1100000-0000-4000-8000-0000000080a1', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000080c3', 'b1100000-0000-4000-8000-000000008003',
   'b1100000-0000-4000-8000-0000000080a1', 'member', 'active', NOW());

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES
  ('b1100000-0000-4000-8000-0000000080e1', 'R8 Owner House',   'b1100000-0000-4000-8000-000000008001', 'b1100000-0000-4000-8000-000000008001'),
  ('b1100000-0000-4000-8000-0000000080e2', 'R8 Nostudio House','b1100000-0000-4000-8000-000000008002', 'b1100000-0000-4000-8000-000000008002'),
  ('b1100000-0000-4000-8000-0000000080e3', 'R8 Plainmem House','b1100000-0000-4000-8000-000000008003', 'b1100000-0000-4000-8000-000000008003');

DO $$
DECLARE
  v_owned_trg  TEXT;
  v_legacy_trg TEXT;
  v_stamped    uuid;
BEGIN
  SELECT studio_id INTO v_stamped FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000080e1';
  ASSERT v_stamped = 'b1100000-0000-4000-8000-0000000080a1',
    'FAIL y1 (HT-3-a / 00602): a project whose designer owns exactly one active studio must be '
    'stamped with it at INSERT; got ' || COALESCE(v_stamped::text, 'NULL');

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000080e2') IS NULL,
    'FAIL y2 (HT-3-a step 3): a designer who owns no studio stamps nothing — the hour resolves '
    '''none'', it does not reach for a studio nobody named';

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000080e3') IS NULL,
    'FAIL y3 (HT-3-a): a PLAIN MEMBER''s studio must not be stamped — only an owner seat counts, '
    'because only an owner seat cannot be manufactured through RLS';

  -- P-4: the stamp is INSERT-only. An existing project is never re-pointed, which is
  -- also what lets the cases above clear a stamp to exercise step 2.
  UPDATE public.projects SET studio_id = NULL
   WHERE id = 'b1100000-0000-4000-8000-0000000080e1';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000080e1') IS NULL,
    'FAIL y4 (P-4): the stamp must not fire on UPDATE — an existing project''s studio is history, '
    'not something this program rewrites';

  -- The ordering that keeps 00563's fail-closed refusals reachable, read from
  -- pg_trigger rather than compared as two literals (W1-R7-07).
  SELECT tgname INTO v_owned_trg FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'zzz_set_project_studio_id_owned_trg';
  SELECT tgname INTO v_legacy_trg FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'set_project_studio_id';
  ASSERT v_owned_trg IS NOT NULL AND v_legacy_trg IS NOT NULL,
    'FAIL y5: both studio_id triggers must be installed — 00602 is additive to 00317/00563, not a '
    'replacement for it';
  ASSERT v_owned_trg > v_legacy_trg,
    'FAIL y6: 00602''s trigger must sort AFTER set_project_studio_id, or it stamps a value before '
    'that trigger judges the write and 00563''s refusals stop being reached';

  RAISE NOTICE 'time_rate_resolution: case (y) passed.';
END
$$;

-- ─── (z) HT-3-a step 1 is final: the project's own column beats every studio
--         the designer owns ────────────────────────────────────────────────────
-- The studio named on the project prices the hour even when the designer owns
-- another studio that also holds a rate for the same member — and even when that
-- other studio's owner seat is older. Step 2 is a fallback, not a preference: once
-- the column is set, the candidate query is never run. This is what makes 00317's
-- anti-aiming guard load-bearing for pricing (00317:31-47, head 00563), and why the
-- column stays banned as an RLS POLICY key (§0.13) while being trusted here.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000080a4', 'design_studio', 'R8 Named Studio', 'r8-named-studio', 'active');

-- Rate Studio's owner also owns this one, seated LATER, so her oldest owner seat is
-- still Rate Studio: step 2 would pick Rate Studio (15000) if it were ever reached.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000080c4', 'b1100000-0000-4000-8000-000000000001',
   'b1100000-0000-4000-8000-0000000080a4', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000080c5', 'b1100000-0000-4000-8000-000000000002',
   'b1100000-0000-4000-8000-0000000080a4', 'member', 'active', NOW());

-- The project names R8 Named Studio explicitly (the shape every project created by
-- the portal's own create path carries).
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES ('b1100000-0000-4000-8000-0000000080e4', 'R8 Named House',
        'b1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001',
        'b1100000-0000-4000-8000-0000000080a4');

DO $$
DECLARE
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000080e4')
         = 'b1100000-0000-4000-8000-0000000080a4',
    'FAIL z0 (precondition): the explicit studio_id must survive both triggers unchanged';
  ASSERT EXISTS (SELECT 1 FROM public.studio_member_rates
                  WHERE studio_id = 'b1100000-0000-4000-8000-0000000000a1'
                    AND user_id = 'b1100000-0000-4000-8000-000000000002'
                    AND hourly_rate_cents = 15000),
    'FAIL z0b (precondition): Rate Studio must hold its own 15000 for her, or this case cannot '
    'tell step 1 from step 2';

  -- The named studio prices her at 21000, written by its owner.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000080a4', 'b1100000-0000-4000-8000-000000000002',
          21000, CURRENT_DATE - 10, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000080b1', 'b1100000-0000-4000-8000-0000000080e4',
          'b1100000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000080b1';

  ASSERT v_rate = 21000 AND v_source = 'studio_member' AND v_amount = 42000,
    'FAIL z1 (HT-3-a step 1): the studio NAMED ON THE PROJECT must price the hour (21000 / 42000 '
    'for 120 min) — a 15000 here means the fallback ran anyway and step 1 is not final; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (z) passed.';
  RAISE NOTICE 'All time_rate_resolution assertions passed.';
END
$$;

ROLLBACK;
