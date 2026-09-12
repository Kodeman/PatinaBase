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
--
-- Round 8's FIX PASS added (aa) as the one case in this file that asserted a DEFECT
-- rather than a contract: W1-R8-01, a studio whose lead designer is not its owner
-- pricing nothing on her projects while her own self-set rate priced them instead.
--
-- REVIEW ROUND 11 — HT-3-b IS RULED, AND (aa) BECOMES A CONTRACT.
--
-- HT-3-b (RULED 2026-09-12): step 2's candidates are the studios where the PROJECT'S
-- DESIGNER holds an ACTIVE, NON-GUEST organization_members row, in two tiers — the
-- EMPLOYER tier (role <> 'owner') first, then, only if she has no employer seat at
-- all, the OWNED tier (role = 'owner'). EXACTLY ONE candidate in a tier prices; more
-- than one is 'none', which the owner repairs by NAMING the studio on the project.
-- No rate-existence, seat-date, org-age, member-count or created_by key survives, and
-- no ORDER BY: W1-R10-02 (the date-blind rate-existence preference) dissolves with
-- the key rather than being repaired.
--
-- HT-3-c (RULED by the orchestrator 2026-09-12, arm (a)): a project whose designer
-- NAMED its studio_id prices from that studio even when she owns it — a sole
-- proprietor billing her own studio's client. New case (ac) pins it through RLS
-- (W1-R10-01), and the sentences claiming 00317's guard made the column "trustworthy
-- as a pricing key" are retracted in 00599 and 00602.
--
-- Every case whose expectation HT-3-b contradicts is REWRITTEN, not deleted, and each
-- one says which ruling moved it:
--   (aa) both arms closed — S prices the hire's hour (20000/40000) and the
--        assistant's (12000/24000); the control is unchanged; new legs cover the
--        legacy NULL-studio project (aa7), an ambiguous two-employer tier (aa8) and
--        the owned tier for a designer with no employer (aa9).
--   (m)  her employer prices the hour again — but derived from the PROJECT'S
--        DESIGNER's seats, never from the member being priced.
--   (p)  her own project is stamped with her EMPLOYER, and her self-set 99900 prices
--        nothing while she has one.
--   (s)  the employer prices her hours even where it has not priced her ('none'), and
--        the remedy is a rate in the employer (s6), not her own number.
--   (n), (w) two owned studios and no employer is 'none' — the cost of refusing to
--        choose — with the repair (naming the studio at creation) asserted beside it.
--   (x)  the consent-free puppet seat now buys an AMBIGUOUS tier: a reversible $0
--        denial-of-service (W1-R8-12), never somebody else's number (x3, x4).
--   (y)  y3 moved: a plain member's one studio IS stamped (the employer tier).
-- And round 11 adds two cases:
--   (ac) HT-3-c arm (a), through RLS: the plain-member designer NAMES the workspace
--        she owns at project creation and it prices her hour (W1-R10-01's pin), with
--        the aimed-at-employer control beside it.
--   (ad) HT-3-b's own residue, PINNED not fixed: for a principal with NO employer
--        seat, one consent-free `Org owners can insert members` INSERT makes a
--        stranger's workspace her sole employer tier and its rates price her
--        studio's client. Measured 1/1. HT-3-b arm (c) — consent on seating — is the
--        closure and stays OWED.
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

-- ─── (m) W1-R1-05 + HT-3-b: the designer's correction stands, and her EMPLOYER
--         prices the hour ────────────────────────────────────────────────────
-- P5's designer (…005) is a plain `member` of Rate Studio and owns no studio at
-- all. Under HT-3-b (RULED 2026-09-12) her one EMPLOYER seat is the candidate, so
-- 00602 stamps Rate Studio on her project at INSERT and the hour logged there is
-- priced by Rate Studio's own rate for the member who worked it (15000 for the
-- hire).
--
-- This assert has now moved twice, and the distinction is the whole of HT-3-a:
-- round 8 (HT-3-a, ownership-only step 2) made it 'none'; round 11 (HT-3-b) makes
-- it 15000 again — but NOT because the MEMBER BEING PRICED belongs to Rate Studio.
-- The studio is derived from the PROJECT'S DESIGNER's seats; that the hire happens
-- to be seated in the same studio is how she comes to have a rate there at all, and
-- it plays no part in choosing the studio.
DO $$
DECLARE
  v_duration INTEGER;
  v_rate     INTEGER;
  v_source   TEXT;
  v_studio   uuid;
BEGIN
  SELECT studio_id INTO v_studio FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000000e5';
  ASSERT v_studio = 'b1100000-0000-4000-8000-0000000000a1',
    'FAIL m0 (precondition, HT-3-b / 00602): P5''s designer owns no studio but holds exactly one '
    'EMPLOYER seat — Rate Studio — so the stamp must be Rate Studio. A NULL here is the '
    'round-8 ownership-only step 2 still in place; got ' || COALESCE(v_studio::text, 'NULL');
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE user_id = 'b1100000-0000-4000-8000-000000000005' AND role = 'owner'),
    'FAIL m0b (precondition): P5''s designer must own NO studio, or this case stops being the '
    'employer-tier case';

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
  ASSERT v_source = 'studio_member' AND v_rate = 15000,
    'FAIL m2 (HT-3-b, RULED 2026-09-12): the project''s designer has exactly one employer — Rate '
    'Studio — so Rate Studio prices the hour at its own 15000 for the member who worked it. A '
    '''none'' here is the round-8 ownership-only step 2, which left every studio whose lead '
    'designer is not its owner unable to price anything (W1-R8-01); got '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_rate::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (m) passed.';
END
$$;

-- ─── (n) HT-3-b: TWO studios the designer OWNS and no employer seat — ambiguity
--         is 'none', and naming the studio on the project is the repair ──────
-- The ordinary designer holds TWO active studios: 00295's
-- fc_provision_studio_on_designer mints a personal design studio the moment
-- is_designer flips with no membership yet, and she later founds (here, owns) the
-- studio that pays her. She is owner of both and a member's employee nowhere — which
-- is why every earlier revision of this file's studio choice was a coin flip, a
-- date-blind preference or a deterministic wrong answer (W1-R2-02, W1-R10-02).
--
-- HT-3-b (RULED 2026-09-12) refuses to choose: the EMPLOYER tier is empty, the OWNED
-- tier holds TWO candidates, so the stamp is NULL and the hour is 'none' — "rate
-- pending" (HT-26). No rate-existence key, no seat date, no org age: every one of
-- those was a question somebody could answer with one signup or one UPDATE, and the
-- ruling's answer to "which of the two?" is "say so on the project".
--
-- The repair is asserted in the same case (n4-n6), because a test that only shows
-- the refusal would read as a dead end: the owner NAMES the studio on the project at
-- creation (HT-3-c) and the hour prices from it.
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

-- Production shape, kept although it is no longer a key: the is_designer flip and
-- the founding of a studio are different transactions, days or years apart, so the
-- workspace's owner seat is the OLDER one. Round 11 deleted the seat-date tiebreak
-- (and the rate-existence preference above it), so this UPDATE must now change
-- NOTHING — which is itself asserted at n0f. It is kept so a future graft that
-- reinstates a date key fails here rather than on Strata.
UPDATE public.organization_members
   SET created_at = NOW() - INTERVAL '1 year'
 WHERE user_id = 'b1100000-0000-4000-8000-000000000006'
   AND organization_id <> 'b1100000-0000-4000-8000-0000000000a2';

-- Her own project. 00602 runs at INSERT and, with two owned studios and no employer
-- seat, must leave studio_id NULL (n0e) — so step 2 is also what the hour below
-- resolves through, with no stamp to clear first.
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

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members m
     JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = 'b1100000-0000-4000-8000-000000000006'
      AND m.status = 'active' AND m.role <> 'owner' AND m.role <> 'guest'
      AND o.type = 'design_studio' AND o.status = 'active'),
    'FAIL n0g (precondition, HT-3-b): she must hold NO employer seat, or the OWNED tier is never '
    'reached and this case measures the wrong tier';

  SELECT studio_id INTO v_stamped FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000000e6';
  ASSERT v_stamped IS NULL,
    'FAIL n0e (00602 / HT-3-b): two owned studios and no employer seat is an AMBIGUOUS tier, so '
    'the stamp must be NULL. A studio id here means an ordering key came back — the oldest owner '
    'seat (W1-R6-01) or the date-blind rate-existence preference (W1-R10-02), both deleted; got '
    || COALESCE(v_stamped::text, 'NULL');
  ASSERT (SELECT created_at FROM public.organization_members
           WHERE user_id = 'b1100000-0000-4000-8000-000000000006'
             AND organization_id = v_personal)
         < (SELECT created_at FROM public.organization_members
             WHERE id = 'b1100000-0000-4000-8000-0000000000c6'),
    'FAIL n0f (precondition): the workspace seat must still be the OLDER owner membership — kept '
    'so that a graft reinstating the deleted seat-date tiebreak is caught by n0e rather than '
    'shipping';

  -- Her rate exists in the PAYING studio only. The personal studio has none, and
  -- never will: nothing seats a rate there.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000006');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a2', 'b1100000-0000-4000-8000-000000000006',
          22000, CURRENT_DATE - 10, 'b1100000-0000-4000-8000-000000000006');
  PERFORM pg_temp.reset_role();

  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_member_rates
                      WHERE studio_id = v_personal),
    'FAIL n0d (precondition): the personal studio must hold no rate row — under the DELETED
 rate-existence preference that asymmetry is what used to decide, and it must now decide nothing';

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

  ASSERT v_rate IS NULL,
    'FAIL n1 (HT-3-b): between two studios she owns, with no employer seat, NEITHER prices the '
    'hour — the 22000 in the Paying Studio must not be chosen by a rate-existence key (the '
    'round-2 candidacy key, deleted) nor the workspace by a seat date (W1-R6-01, deleted); got '
    || COALESCE(v_rate::text, 'NULL');
  ASSERT v_source = 'none',
    'FAIL n2 (HT-26): an ambiguous tier is reported as ''rate pending'', never as a blank and '
    'never as a silently chosen studio; got ' || COALESCE(v_source, 'NULL');
  ASSERT v_resolved IS NULL,
    'FAIL n3: the resolver and the classifier must agree; resolver said '
    || COALESCE(v_resolved::text, 'NULL');

  -- ── the repair (HT-3-c): the owner NAMES the studio on the project ─────────
  -- HT-3-b's own text: "the owner fixes 'none' by stamping projects.studio_id".
  -- Done at creation, which is the one place the column is writable (00563 refuses a
  -- later UPDATE of it outside postgres context), and step 1 then answers.
  INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
  VALUES ('b1100000-0000-4000-8000-0000000000ea', 'Two-studio House II',
          'b1100000-0000-4000-8000-000000000006', 'b1100000-0000-4000-8000-000000000006',
          'b1100000-0000-4000-8000-0000000000a2');

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000000ea')
         = 'b1100000-0000-4000-8000-0000000000a2',
    'FAIL n4 (HT-3-c): a named studio_id must survive both triggers — 00602 returns early when '
    'the column is already set';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-00000000bea1', 'b1100000-0000-4000-8000-0000000000ea',
          'b1100000-0000-4000-8000-000000000006', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-00000000bea1';
  ASSERT v_rate = 22000 AND v_source = 'studio_member',
    'FAIL n5 (HT-3-b''s repair + HT-3-c): once the project names the Paying Studio, step 1 prices '
    'the hour from it (22000) — this is the route out of an ambiguous tier, and it is the reason '
    'n1''s ''none'' is a pending state and not a dead end; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');

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
-- there.
--
-- ROUND 11 (HT-3-b) moves the second half. Her OWN project is now stamped with her
-- EMPLOYER too, because the employer tier is read before the owned tier and she holds
-- exactly one employer seat — so the studio that employs her prices her hours
-- everywhere, and the 99900 she set about herself in her own workspace prices
-- nothing at all while she has an employer. HT-3-a's "solo practitioner pricing her
-- own work" survives only for a designer with NO employer seat (case (ac) LEG2 and
-- case (y)), or where the project NAMES her workspace (HT-3-c, case (ac)).
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
           WHERE id = 'b1100000-0000-4000-8000-0000000000e7')
         = 'b1100000-0000-4000-8000-0000000000a1',
    'FAIL p0c (precondition, 00602 / HT-3-b): her own project must be stamped with her ONE '
    'EMPLOYER — Rate Studio — not with the workspace she owns. A v_personal here is the round-8 '
    'ownership-only stamp, which is what let a hire price her employer''s client at her own '
    'number (W1-R8-01)';

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

  -- The other half, as HT-3-b rewrites it: even on HER OWN project the EMPLOYER
  -- prices the hour. The 99900 she set about herself is unreachable while she holds
  -- an employer seat — which is the whole of W1-R8-01's arm A, closed. A solo
  -- practitioner (no employer seat at all) still prices her own work from her own
  -- studio; that is case (ac) LEG2 and case (y)'s y1.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000007');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000000d0', 'b1100000-0000-4000-8000-0000000000e7',
          'b1100000-0000-4000-8000-000000000007', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000000d0';
  ASSERT v_rate = 16000 AND v_source = 'studio_member',
    'FAIL p4 (HT-3-b): on her OWN project her ONE EMPLOYER prices the hour (16000), because the '
    'employer tier is read before the owned tier. A 99900 here is W1-R8-01 arm A — the number she '
    'set about herself reaching a client-billed hour; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');

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

-- ─── (s) HT-3-b: the EMPLOYER prices her hours even where it has not priced her,
--         and the remedy is a rate in the employer — not her own number ───────
-- Ordinary shape: a designer whose own one-person studio prices her at 18000, who
-- is also an active plain MEMBER of a multi-member studio that has never priced her.
--
-- HT-3-b (RULED 2026-09-12) answers every half from the PROJECT'S DESIGNER's seats,
-- employer tier first:
--   · her own project is stamped with the EMPLOYER (s0b) and the employer has never
--     priced her → 'none', "rate pending" (HT-26). Her own 18000 does not price her
--     work while she holds an employer seat (s1-s4). Round 8 (ownership-only step 2)
--     answered 18000 here; that is the shape W1-R8-01 showed a hire using to price
--     her employer's client at her own number.
--   · an hour on the OTHER studio's project names that studio, which has never
--     priced her → 'none' as well (s5).
--   · W1-R4-02's money bug (a studio that has not priced her billing $0) is now the
--     RULED outcome of an unpriced member, and the remedy is the one HT-3 always
--     named: the studio's owner/admin prices her on the studio settings page (s6).
--     The composer — not the resolver — keeps a 'none' row off an invoice.
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
           WHERE id = 'b1100000-0000-4000-8000-0000000000e9')
         = 'b1100000-0000-4000-8000-0000000000a1',
    'FAIL s0b (precondition, 00602 / HT-3-b): her own project must be stamped with her one '
    'EMPLOYER, not with the studio she owns — the employer tier is read first';
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

  ASSERT v_rate IS DISTINCT FROM 18000,
    'FAIL s1 (HT-3-b): the 18000 she set about herself in the studio she owns priced an hour on '
    'a project her EMPLOYER is stamped on — that is W1-R8-01 arm A, and the employer tier exists '
    'to close it';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL s2 (HT-3-b): her employer has never priced her, so the hour is ''rate pending''. A '
    '18000 here means the owned tier was reached although she holds an employer seat; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_amount IS NULL,
    'FAIL s3 (HT-26): an unpriced hour carries no amount at all; got '
    || COALESCE(v_amount::text, 'NULL');
  ASSERT (SELECT resolved_rate_cents FROM public.project_unbilled_time
           WHERE id = 'b1100000-0000-4000-8000-0000000000bf') = 0,
    'FAIL s4 (recorded, not approved): a ''none'' row still reaches project_unbilled_time as $0 — '
    'which is why W2''s composer must refuse to claim rate_source = ''none'' rows rather than '
    'invoicing them at zero';

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

  -- (s6) THE REMEDY, asserted so the two ''none''s above read as a pending state and
  -- not as a lost capability: the studio''s owner prices her on HT-3''s own surface
  -- and the next hour carries the studio''s number. This is what HT-3 ruled the
  -- settings page is for, and it is the only move that changes the answer — nothing
  -- she can do to her own workspace does.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000000a1', 'b1100000-0000-4000-8000-00000000000a',
          13000, CURRENT_DATE - 5, 'b1100000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000000a');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-00000000bf02', 'b1100000-0000-4000-8000-0000000000e9',
          'b1100000-0000-4000-8000-00000000000a', NOW() - INTERVAL '1 hour', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-00000000bf02';
  ASSERT v_rate = 13000 AND v_source = 'studio_member' AND v_amount = 26000,
    'FAIL s6 (HT-3 + HT-3-b): once the EMPLOYER prices her, every hour on her projects carries '
    'the employer''s number (13000 / 26000 for 120 min) — and it is 13000, not the 18000 she set '
    'about herself; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL')
    || ' / ' || COALESCE(v_amount::text, 'NULL');

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

-- ─── (w) THE PRICE OF HT-3-b, in the commonest shape there is: a principal who
--         owns two studios is priced by neither until she names one ───────────
-- The principal of a real studio who ALSO owns the one-person workspace 00295
-- provisioned at her is_designer flip. She employs herself in both, so the EMPLOYER
-- tier is empty and the OWNED tier holds TWO candidates — and HT-3-b's answer to two
-- candidates is 'none', whichever of them holds a rate and whichever seat is older.
--
-- This is recorded as a COST, not as a contract anybody asked for. Rounds 2-10 each
-- shipped a key that chose between these two (member count, rate authorship,
-- created_by, seat dates, org age, a date-blind rate-existence preference) and an
-- adversarial round measured each one being manufactured or misfiring. HT-3-b stops
-- choosing. The consequences, asserted below:
--   (w1/w2) her real studio holds her rate, the workspace holds none — and the stamp
--           is still NULL, the hour still 'none'. Round 8 answered 22000 here.
--   (w3/w4) both studios hold a rate — identical answer, because the rate-existence
--           preference and the seat-date tiebreak are both deleted (W1-R10-02).
--   (w5/w6) THE REPAIR, and the reason this is a pending state rather than a loss:
--           she names the real studio on the project at creation (HT-3-c) and its
--           22000 prices the hour. A follow-on ruling could instead let the owned
--           tier prefer a studio with more than one active member, or let the
--           designer nominate a default studio on her profile; both would move w1-w4
--           and nothing else in this file.
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

-- Production shape, kept although round 11 deleted the seat-date tiebreak it used to
-- feed: the is_designer flip and the founding of a studio are different transactions,
-- days or years apart, so the workspace's owner seat is the OLDER one. It must now
-- decide NOTHING (w1a/w3), and it is kept so that a graft restoring a date key fails
-- here rather than on Strata.
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
    'FAIL w0b (precondition): the workspace seat must be the OLDER owner membership — kept after '
    'round 11 deleted the seat-date tiebreak, so that a graft restoring it fails here';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members m
     JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = 'b1100000-0000-4000-8000-000000005006'
      AND m.status = 'active' AND m.role <> 'owner' AND m.role <> 'guest'
      AND o.type = 'design_studio' AND o.status = 'active'),
    'FAIL w0c (precondition, HT-3-b): the principal must hold NO employer seat — she is the owner '
    'of both candidates, which is what makes the OWNED tier the one under test';

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
  ASSERT v_stamped IS NULL,
    'FAIL w1a (HT-3-b / 00602): two owned studios is an ambiguous tier, so the stamp must be '
    'NULL — even though only ONE of them holds a rate for her. A studio id here means the '
    'rate-existence preference came back, and it was date-blind besides (W1-R10-02); got '
    || COALESCE(v_stamped::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b4', 'b1100000-0000-4000-8000-0000000050e4',
          'b1100000-0000-4000-8000-000000005006', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b4';

  ASSERT v_rate IS NULL AND v_source = 'none' AND v_amount IS NULL,
    'FAIL w2 (HT-3-b, THE COST — recorded, not approved): the principal of a real studio who also '
    'owns her auto-provisioned workspace is priced by NEITHER until she names one on the project. '
    'A 22000 here means an ordering key chose for her, which is what every round from 2 to 10 '
    'measured being gamed or misfiring; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');

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
  ASSERT v_stamped IS NULL,
    'FAIL w3 (HT-3-b): with BOTH owned studios holding a rate the answer is unchanged — NULL. '
    'Under the deleted keys this row was stamped with the workspace (the older owner seat), which '
    'is how a self-set number reached a client-billed hour; got '
    || COALESCE(v_stamped::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b5', 'b1100000-0000-4000-8000-0000000050e5',
          'b1100000-0000-4000-8000-000000005006', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b5';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL w4 (HT-3-b): the 99900 in her workspace must not price the hour on this project either '
    '— two owned candidates is ''none'', and that is the one answer no signup and no UPDATE can '
    'move; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- ── (w5/w6) THE REPAIR: she names the real studio at creation (HT-3-c) ─────
  INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
  VALUES ('b1100000-0000-4000-8000-0000000050e6', 'Principal House III',
          'b1100000-0000-4000-8000-000000005006', 'b1100000-0000-4000-8000-000000005006',
          'b1100000-0000-4000-8000-0000000050a3');

  SELECT studio_id INTO v_stamped FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000050e6';
  ASSERT v_stamped = 'b1100000-0000-4000-8000-0000000050a3',
    'FAIL w5 (HT-3-c): a named studio_id survives both triggers; got '
    || COALESCE(v_stamped::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000005006');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000050b6', 'b1100000-0000-4000-8000-0000000050e6',
          'b1100000-0000-4000-8000-000000005006', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000050b6';
  ASSERT v_rate = 22000 AND v_source = 'studio_member' AND v_amount = 44000,
    'FAIL w6 (HT-3-b''s repair + HT-3-c): naming the real studio on the project prices the hour '
    'from it (22000 / 44000 for 120 min). This is the principal''s route out of w2''s ''none'', '
    'and it is why that ''none'' is rate-pending rather than a studio that cannot bill; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

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
-- HT-3-a ends the sequence by deleting the question, and HT-3-b (round 11) adds the
-- one thing a consent-free seat CAN still do. Every manoeuvre is performed here,
-- through RLS, as the actor named — and then measured:
--   (x1/x2) on the EMPLOYING studio's own project, its 15000 prices the hour. The
--           puppet's 99900 is unreachable, and organizations.created_at is read by
--           nothing.
--   (x0d/x3) on HER OWN project the stamp is now NULL and the hour is 'none' — but
--           for a NEW reason, and it is worth being exact about it. The puppet's
--           consent-free seat made her hold TWO employer seats (the real studio and
--           the puppet workspace), so HT-3-b's employer tier is AMBIGUOUS. That is
--           the pre-existing denial-of-service W1-R8-12 named, and it is the whole of
--           what the open consent door buys a third party under HT-3-b: a member or
--           any org owner can push an answer to 'none', never to a number they set.
--           Before the puppet seat the same project would have been stamped with her
--           employer and priced at 15000, which is asserted at x4 after the seat is
--           withdrawn.
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
           WHERE id = 'b1100000-0000-4000-8000-0000000060e1')
         = 'b1100000-0000-4000-8000-0000000060a1',
    'FAIL x0d (precondition, 00602 / HT-3-b): her own project is created BEFORE the puppet seats '
    'her, so at that moment she holds exactly ONE employer seat — the employing studio — and that '
    'is what is stamped. The workspace she owns is the second tier and is never reached while she '
    'has an employer; got '
    || COALESCE((SELECT studio_id FROM public.projects
                  WHERE id = 'b1100000-0000-4000-8000-0000000060e1')::text, 'NULL');

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

  -- (x3) A project she creates AFTER the puppet has seated her: two employer seats,
  -- so HT-3-b's employer tier is ambiguous, nothing is stamped, and step 2 answers
  -- 'none'. The puppet bought a $0 denial-of-service (W1-R8-12) and nothing else.
  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000060e3', 'Puppet-seat House II',
          'b1100000-0000-4000-8000-000000006001', 'b1100000-0000-4000-8000-000000006001');

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000060e3') IS NULL,
    'FAIL x3a (HT-3-b): with the puppet''s seat in place she holds TWO employer candidates, so '
    'the stamp must be NULL. The puppet''s workspace here would be the attacker choosing the '
    'studio, which is what every deleted ordering key allowed; got '
    || COALESCE((SELECT studio_id FROM public.projects
                  WHERE id = 'b1100000-0000-4000-8000-0000000060e3')::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006001');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000060b2', 'b1100000-0000-4000-8000-0000000060e3',
          'b1100000-0000-4000-8000-000000006001', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000060b2';
  ASSERT v_source = 'none' AND v_rate IS NULL,
    'FAIL x3 (HT-3-b): an ambiguous employer tier is ''rate pending'' — NOT the puppet''s 99900, '
    'and not the employing studio''s 15000 chosen by a tiebreak. A 99900 here is a third party '
    'setting the rate a studio''s client is billed; got ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_rate::text, 'NULL');

  -- (x4) And the ambiguity is the ONLY thing the seat did: withdraw it (as the puppet
  -- account, through the shipped policy) and the employing studio answers again.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006002');
  UPDATE public.organization_members SET status = 'removed'
   WHERE id = 'b1100000-0000-4000-8000-0000000060c2';
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT status::text FROM public.organization_members
           WHERE id = 'b1100000-0000-4000-8000-0000000060c2') = 'removed',
    'FAIL x4a (precondition): the puppet seat must actually leave ACTIVE, or x4 measures nothing';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000006001');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000060b3', 'b1100000-0000-4000-8000-0000000060e3',
          'b1100000-0000-4000-8000-000000006001', NOW() - INTERVAL '1 hour', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000060b3';
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL x4 (HT-3-b): with the puppet seat no longer ACTIVE she has one employer again and the '
    'employing studio prices the hour (15000). If this fails, the ambiguity is sticky and the '
    'denial-of-service is permanent rather than reversible; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (x) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 8 — the two cases HT-3-a adds: the stamp at project INSERT
-- (00602) and the primacy of the project's own column.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── (y) 00602: projects.studio_id is stamped at INSERT, from HT-3-b's two tiers
--         ──────────────────────────────────────────────────────────────────────
-- HT-3-a's second half. Step 1 is only the normal path if the column is populated at
-- creation, and HT-3-b says what may populate it: the lead designer's ONE employer
-- studio (an active, non-guest seat with role <> 'owner'), or — only if she holds no
-- employer seat at all — her ONE owned studio. More than one candidate in a tier
-- leaves the column NULL.
--
-- y3 is the assert HT-3-b moved: round 8 refused to stamp a plain member's studio,
-- on the ground that only an owner seat cannot be manufactured through RLS. That
-- refusal is what left a studio whose lead designer is an admin or member unable to
-- price any hour on her projects (W1-R8-01), and the exactly-one rule is what takes
-- its place: a consent-free seat can make a tier ambiguous (a $0 DoS — case (x)),
-- but it cannot make the attacker's studio the chosen one while the designer already
-- has an employer.
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
           WHERE id = 'b1100000-0000-4000-8000-0000000080e3')
         = 'b1100000-0000-4000-8000-0000000080a1',
    'FAIL y3 (HT-3-b): a designer who is a PLAIN MEMBER of exactly one studio is stamped with '
    'THAT studio — the employer tier. A NULL here is the round-8 ownership-only stamp, which is '
    'what stopped a studio pricing its own hire''s hours (W1-R8-01); got '
    || COALESCE((SELECT studio_id FROM public.projects
                  WHERE id = 'b1100000-0000-4000-8000-0000000080e3')::text, 'NULL');
  ASSERT (SELECT count(*) FROM public.organization_members
           WHERE user_id = 'b1100000-0000-4000-8000-000000008003' AND role = 'owner') = 0,
    'FAIL y3b (precondition): the plain member must own no studio, or y3 cannot tell the employer '
    'tier from the owned tier';

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

-- The project names R8 Named Studio explicitly — the shape a direct PostgREST insert
-- may carry; see HT-3-c and case (ac). NOT the shape the portal's own create path
-- carries: `useCreateProject` (packages/supabase/src/hooks/use-projects.ts:49-78)
-- sends neither studio_id nor designer_id, projects.designer_id has no column default,
-- and 00563's authenticated arm raises unless NEW.designer_id = auth.uid() — so that
-- path cannot create a project at all today (W1-R10-04, measured).
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
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 8's BLOCKER (W1-R8-01) IS CLOSED BY HT-3-b, RULED 2026-09-12
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── (aa) the studio whose lead designer is not its owner prices every hour on
--          her projects, and her own self-set rate prices none of them ────────
--
-- Round 8 shipped HT-3-a with an OWNERSHIP-ONLY step 2, and measured what that
-- costs the program's own customer — a studio the moment it adds its first designer,
-- with no attacker, no manoeuvre and no extra signup:
--
--   · Leah owns studio S. She hires a designer and seats her `admin`; an assistant
--     is seated `member`. Leah prices both of them IN S, through RLS, on the surface
--     HT-3 ruled.
--   · The hire got her designer role BEFORE Leah seated her — the default
--     self-signup order — so 00295's fc_provision_studio_on_designer gave her a
--     one-person workspace she OWNS. Under ownership-only step 2 that workspace was
--     the only candidate, so it was what 00602 stamped and what step 1 read for ever.
--   · arm A: her client-billed hour priced at the 99900 SHE set about HERSELF,
--     rate_source 'studio_member', $1,998.00 into project_unbilled_time — the invoice
--     composer's feed and claim_time_entries' invoice lock.
--   · arm B: her assistant's hour on the same project resolved 'none' and the view
--     reported $0, although Leah priced him in S.
--
-- HT-3-b (RULED 2026-09-12) closes both arms by reading the EMPLOYER tier first: S is
-- the hire's one employer seat, so S is stamped and S's own rates price every hour on
-- her projects — her own included. The asserts below are the round-8 asserts with
-- their expected values moved, exactly as (aa)'s own text said would happen when the
-- ruling landed, and the control (a hire seated BEFORE her designer grant) is still in
-- the same fixture because it must not move at all.
--
-- The legs after aa6 are the rest of HT-3-b, measured on the same studio:
--   (aa7)  a LEGACY project whose studio_id is NULL — the pre-00563 population on
--          Strata — is priced through step 2 itself, not through the stamp: S again.
--   (aa8)  the hire is ALSO seated in a second studio X. Two employer candidates is
--          an ambiguous tier: the stamp is NULL and the hour is 'none'. A member (or
--          any org owner, through the consent-free `Org owners can insert members`)
--          can push an answer to 'none' — the pre-existing W1-R8-12 denial-of-service
--          — and that is the MOST she can do: never a number she set.
--   (aa9)  a designer with NO employer seat and exactly ONE owned studio is priced by
--          it, self-set rate included. That is HT-3-a's accepted half, and after
--          HT-3-b it is the only shape that reaches it (besides HT-3-c's named
--          column, case (ac)).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000009001', 'r8aa-leah@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000009002', 'r8aa-hire@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000009003', 'r8aa-asst@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000009004', 'r8aa-hire2@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000009005', 'r8aa-solo@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- S exists before anyone is seated, so seating can precede a designer grant where
-- this fixture needs it to. X is the second employer aa8 uses.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('b1100000-0000-4000-8000-0000000090a1', 'design_studio', 'R8aa Hartwell Studio', 'r8aa-hartwell', 'active'),
  ('b1100000-0000-4000-8000-0000000090a2', 'design_studio', 'R8aa Second Studio',   'r8aa-second',   'active');

-- profiles rows are auto-created from auth.users by an existing trigger, so the
-- designer flip is driven the way the product drives it: a user_roles grant in the
-- `designer` domain fires fc_sync_is_designer_from_role → is_designer → 00295's
-- provisioning trigger, UNLESS the user already holds a membership row (any status).
UPDATE public.profiles SET full_name = 'R8aa Leah'      WHERE id = 'b1100000-0000-4000-8000-000000009001';
UPDATE public.profiles SET full_name = 'R8aa Hire'      WHERE id = 'b1100000-0000-4000-8000-000000009002';
UPDATE public.profiles SET full_name = 'R8aa Assistant' WHERE id = 'b1100000-0000-4000-8000-000000009003';
UPDATE public.profiles SET full_name = 'R8aa Hire Two'  WHERE id = 'b1100000-0000-4000-8000-000000009004';
UPDATE public.profiles SET full_name = 'R8aa Solo'      WHERE id = 'b1100000-0000-4000-8000-000000009005';

-- Leah: seated first, designer role second → she owns S and nothing else.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000090c1', 'b1100000-0000-4000-8000-000000009001',
        'b1100000-0000-4000-8000-0000000090a1', 'owner', 'active', NOW());
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-000000009001', id FROM public.roles WHERE name = 'studio_owner';

-- THE HIRE: designer role FIRST (the self-signup order), so 00295 provisions her a
-- workspace she owns. Leah then seats her `admin` in S.
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-000000009002', id FROM public.roles WHERE name = 'studio_designer';
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000090c2', 'b1100000-0000-4000-8000-000000009002',
        'b1100000-0000-4000-8000-0000000090a1', 'admin', 'active', NOW());

-- The assistant: a plain member, no designer role.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000090c3', 'b1100000-0000-4000-8000-000000009003',
        'b1100000-0000-4000-8000-0000000090a1', 'member', 'active', NOW());

-- THE CONTROL HIRE: seated FIRST, designer role second → 00295's early exit leaves
-- her owning no workspace. Under ownership-only step 2 that single difference was the
-- whole defect; under HT-3-b the two hires must now be priced identically.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-0000000090c4', 'b1100000-0000-4000-8000-000000009004',
        'b1100000-0000-4000-8000-0000000090a1', 'admin', 'active', NOW());
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-000000009004', id FROM public.roles WHERE name = 'studio_designer';

-- THE SOLO DESIGNER (aa9): designer role only, never seated anywhere, so 00295 gives
-- her one workspace she owns and she holds no employer seat at all.
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-000000009005', id FROM public.roles WHERE name = 'studio_designer';

DO $$
DECLARE
  v_workspace  uuid;
  v_ctrl_owned integer;
  v_stamp      uuid;
  v_ctrl_stamp uuid;
  v_solo       uuid;
  v_rate       INTEGER;
  v_source     TEXT;
  v_amount     INTEGER;
  v_state      TEXT;
  v_view_rate  INTEGER;
  v_view_amt   INTEGER;
BEGIN
  SELECT organization_id INTO v_workspace
  FROM public.organization_members
  WHERE user_id = 'b1100000-0000-4000-8000-000000009002' AND role = 'owner' AND status = 'active';
  SELECT count(*) INTO v_ctrl_owned
  FROM public.organization_members
  WHERE user_id = 'b1100000-0000-4000-8000-000000009004' AND role = 'owner';

  ASSERT v_workspace IS NOT NULL AND v_workspace <> 'b1100000-0000-4000-8000-0000000090a1'
         AND v_ctrl_owned = 0,
    'FAIL aa0 (precondition): the hire must own the workspace 00295 provisions at her designer '
    'grant and the control hire must own none — without that asymmetry this case measures nothing';

  -- Leah prices all three of her people IN S, through RLS, on HT-3's own surface.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES
    ('b1100000-0000-4000-8000-0000000090a1', 'b1100000-0000-4000-8000-000000009002', 20000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000009001'),
    ('b1100000-0000-4000-8000-0000000090a1', 'b1100000-0000-4000-8000-000000009003', 12000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000009001'),
    ('b1100000-0000-4000-8000-0000000090a1', 'b1100000-0000-4000-8000-000000009004', 20000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-000000009001');
  PERFORM pg_temp.reset_role();

  -- The hire prices HERSELF in her own workspace, where she is the owner and
  -- is_org_admin_or_owner therefore admits her. Still ALLOWED (HT-3 in letter) — and
  -- under HT-3-b it must now price nothing, because she has an employer.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009002');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'b1100000-0000-4000-8000-000000009002', 99900, CURRENT_DATE - 10, 'b1100000-0000-4000-8000-000000009002');
  PERFORM pg_temp.reset_role();

  -- The studio's two client projects, one led by each hire.
  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000090e1', 'R8aa Client House',
          'b1100000-0000-4000-8000-000000009002', 'b1100000-0000-4000-8000-000000009002'),
         ('b1100000-0000-4000-8000-0000000090e2', 'R8aa Control House',
          'b1100000-0000-4000-8000-000000009004', 'b1100000-0000-4000-8000-000000009004');

  SELECT studio_id INTO v_stamp      FROM public.projects WHERE id = 'b1100000-0000-4000-8000-0000000090e1';
  SELECT studio_id INTO v_ctrl_stamp FROM public.projects WHERE id = 'b1100000-0000-4000-8000-0000000090e2';

  ASSERT v_stamp = 'b1100000-0000-4000-8000-0000000090a1',
    'FAIL aa1 (W1-R8-01, CLOSED by HT-3-b): the studio''s project must be stamped with S — the '
    'hire''s ONE employer seat — not with the workspace she owns. A workspace id here is the '
    'round-8 ownership-only stamp; got ' || COALESCE(v_stamp::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b1', 'b1100000-0000-4000-8000-0000000090e1',
          'b1100000-0000-4000-8000-000000009002', NOW() - INTERVAL '3 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b1';

  ASSERT v_rate <> 99900,
    'FAIL aa2a (W1-R8-01 arm A): the hire''s client-billed hour was priced at the 99900 SHE set '
    'about HERSELF in her own workspace — $1,998.00 authorized into the composer. That is the '
    'defect HT-3-b was ruled to close';
  ASSERT v_rate = 20000 AND v_source = 'studio_member' AND v_amount = 40000 AND v_state = 'authorized',
    'FAIL aa2 (HT-3-b): Leah''s own 20000 for her hire must price the hour (40000 for 120 min, '
    'authorized); got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL')
    || ' / ' || COALESCE(v_amount::text, 'NULL') || ' / ' || COALESCE(v_state, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b2', 'b1100000-0000-4000-8000-0000000090e1',
          'b1100000-0000-4000-8000-000000009003', NOW() - INTERVAL '3 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b2';

  ASSERT v_rate = 12000 AND v_source = 'studio_member' AND v_amount = 24000,
    'FAIL aa3 (W1-R8-01 arm B, CLOSED by HT-3-b): the assistant''s hour on the hire''s project '
    'must carry the 12000 Leah set for him in S (24000 for 120 min). A ''none'' here is arm B — '
    '$0 into the unbilled view, the balance and the invoice lock; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  -- The composer's own feed, which is what turns either arm into money.
  SELECT resolved_rate_cents, amount_cents INTO v_view_rate, v_view_amt
  FROM public.project_unbilled_time
  WHERE id = 'b1100000-0000-4000-8000-0000000090b1';
  ASSERT v_view_rate = 20000 AND v_view_amt = 40000,
    'FAIL aa4a (HT-3-b): project_unbilled_time must report the EMPLOYER''s 20000 / $400.00 to the '
    'invoice composer and to claim_time_entries'' invoice lock — 99900 / 199800 here is arm A '
    'reaching money; got ' || COALESCE(v_view_rate::text, 'NULL') || ' / '
    || COALESCE(v_view_amt::text, 'NULL');

  SELECT resolved_rate_cents, amount_cents INTO v_view_rate, v_view_amt
  FROM public.project_unbilled_time
  WHERE id = 'b1100000-0000-4000-8000-0000000090b2';
  ASSERT v_view_rate = 12000 AND v_view_amt = 24000,
    'FAIL aa4b (HT-3-b): the assistant''s hour must reach the composer at 12000 / $240.00, not at '
    '$0; got ' || COALESCE(v_view_rate::text, 'NULL') || ' / ' || COALESCE(v_view_amt::text, 'NULL');

  -- ── the control, in the same fixture: these asserts must NOT have moved ────
  ASSERT v_ctrl_stamp = 'b1100000-0000-4000-8000-0000000090a1',
    'FAIL aa5 (the control): the SAME studio, the SAME rates, the SAME admin seat — this designer '
    'was seated before her designer grant, so she owns no workspace and S is stamped either way; '
    'got ' || COALESCE(v_ctrl_stamp::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009004');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b3', 'b1100000-0000-4000-8000-0000000090e2',
          'b1100000-0000-4000-8000-000000009004', NOW() - INTERVAL '3 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b3';

  ASSERT v_rate = 20000 AND v_source = 'studio_member' AND v_amount = 40000,
    'FAIL aa6 (the control): the employing studio''s own 20000 must price her hour (40000 for '
    '120 min) — and aa2 must now read identically, because the seating order no longer decides '
    'anything; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL')
    || ' / ' || COALESCE(v_amount::text, 'NULL');

  -- ── (aa7) the LEGACY shape: studio_id IS NULL, so step 2 itself answers ────
  -- On Strata the pre-00563 population carries NULL here, and the stamp never runs
  -- for it (00602 is BEFORE INSERT only — P-4). Step 2 must reach the same studio the
  -- stamp would have.
  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000090e3', 'R8aa Legacy House',
          'b1100000-0000-4000-8000-000000009002', 'b1100000-0000-4000-8000-000000009002');
  UPDATE public.projects SET studio_id = NULL
   WHERE id = 'b1100000-0000-4000-8000-0000000090e3';
  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000090e3') IS NULL,
    'FAIL aa7a (precondition): the legacy project must carry studio_id NULL, or step 1 answers and '
    'step 2 is never exercised';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b4', 'b1100000-0000-4000-8000-0000000090e3',
          'b1100000-0000-4000-8000-000000009002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009003');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b5', 'b1100000-0000-4000-8000-0000000090e3',
          'b1100000-0000-4000-8000-000000009003', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b4';
  ASSERT v_rate = 20000 AND v_source = 'studio_member',
    'FAIL aa7 (HT-3-b step 2): on a legacy NULL-studio project the hire''s own hour must still be '
    'priced by S, her one employer — 99900 here is arm A through the step-2 door instead of the '
    'stamp; got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b5';
  ASSERT v_rate = 12000 AND v_source = 'studio_member',
    'FAIL aa7b (HT-3-b step 2): and the assistant''s hour on the same legacy project must carry '
    'his own 12000 from S; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  -- ── (aa8) two employer seats: ambiguous tier, NULL stamp, 'none' ───────────
  -- X's owner seats the hire there. Nothing about this needs her consent (`Org owners
  -- can insert members` carries role <> 'owner' and nothing about the invitee), which
  -- is why HT-3-b's answer to two candidates must be 'none' rather than a choice.
  INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
  VALUES ('b1100000-0000-4000-8000-0000000090c5', 'b1100000-0000-4000-8000-000000009002',
          'b1100000-0000-4000-8000-0000000090a2', 'member', 'active', NOW());

  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000090e4', 'R8aa Ambiguous House',
          'b1100000-0000-4000-8000-000000009002', 'b1100000-0000-4000-8000-000000009002');

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000090e4') IS NULL,
    'FAIL aa8a (HT-3-b / 00602): with TWO employer candidates the stamp must be NULL — a studio id '
    'here means the trigger chose between them, which is what every deleted ordering key did; got '
    || COALESCE((SELECT studio_id FROM public.projects
                  WHERE id = 'b1100000-0000-4000-8000-0000000090e4')::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b6', 'b1100000-0000-4000-8000-0000000090e4',
          'b1100000-0000-4000-8000-000000009002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b6';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL aa8 (HT-3-b): an ambiguous employer tier is ''rate pending'' — not S''s 20000 picked by '
    'a tiebreak, and above all not the 99900 in the workspace she owns. The owner''s repair is to '
    'name the studio on the project (HT-3-c); got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  -- ── (aa9) no employer, exactly one owned studio: the OWNED tier ────────────
  SELECT organization_id INTO v_solo
  FROM public.organization_members
  WHERE user_id = 'b1100000-0000-4000-8000-000000009005' AND role = 'owner' AND status = 'active';
  ASSERT v_solo IS NOT NULL,
    'FAIL aa9a (precondition): 00295 must have provisioned the solo designer her own workspace';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE user_id = 'b1100000-0000-4000-8000-000000009005'
       AND status = 'active' AND role <> 'owner' AND role <> 'guest'),
    'FAIL aa9b (precondition): the solo designer must hold NO employer seat, or the owned tier is '
    'never reached';

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009005');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_solo, 'b1100000-0000-4000-8000-000000009005', 24000, CURRENT_DATE - 10, 'b1100000-0000-4000-8000-000000009005');
  PERFORM pg_temp.reset_role();

  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000090e5', 'R8aa Solo House',
          'b1100000-0000-4000-8000-000000009005', 'b1100000-0000-4000-8000-000000009005');

  ASSERT (SELECT studio_id FROM public.projects
           WHERE id = 'b1100000-0000-4000-8000-0000000090e5') = v_solo,
    'FAIL aa9c (HT-3-b, the OWNED tier): a designer with no employer seat and exactly one owned '
    'studio must be stamped with it; got '
    || COALESCE((SELECT studio_id FROM public.projects
                  WHERE id = 'b1100000-0000-4000-8000-0000000090e5')::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009005');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000090b7', 'b1100000-0000-4000-8000-0000000090e5',
          'b1100000-0000-4000-8000-000000009005', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000090b7';
  ASSERT v_rate = 24000 AND v_source = 'studio_member' AND v_amount = 48000,
    'FAIL aa9 (HT-3-a''s accepted half, under HT-3-b''s owned tier): the sole practitioner prices '
    'her own work from the studio she owns, including from a rate she set about herself (24000 / '
    '48000 for 120 min). A ''none'' here strands every solo designer in the product; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (aa) passed — W1-R8-01 closed by HT-3-b, both arms and both tiers.';
END
$$;

-- ─── (ab) W1-R9-01: the hour is logged by the person who worked it, because the
--         rate on the row is confidential ──────────────────────────────────────
-- The studio's per-member rate is readable only by that member and the studio's
-- owner/admin (studio_member_rates_read_self_or_admin, 00598). The moment W1 stamps
-- it onto project_time_entries it also becomes readable by every active non-guest
-- co-member (time_entries_studio_read, 00316:237-240) — so a designer who is only a
-- plain `member` of the studio could mint a row naming any colleague's user_id on
-- her own project (`Designers manage their project time entries`, 00177:136-137, is
-- an ALL policy on projects.designer_id = auth.uid() with a NULL with_check and no
-- user_id leg), read his confidential rate off it, and delete the row after.
-- Measured before the fix: 0 rows of his rate visible to her on studio_member_rates,
-- 15000 / 'studio_member' visible to her on a row she minted for him; and the same
-- number again by logging her own hour and repointing user_id at him with an UPDATE.
--
-- Both write shapes are refused below, and the two controls are the things that must
-- NOT move: the project designer may still correct a teammate's existing entry
-- (W1-R1-05 — user_id unchanged), and an owner/admin of the studio that owns the
-- work may still write on a member's behalf.
--
-- The READ half is W2's (00606 must narrow time_entries_studio_read as well as the
-- 00484-registered SELECT policy — recorded as an amendment to HT-10-a). This case
-- asserts only what W1 owns.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-000000009101', 'r9-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000009102', 'r9-subject@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-000000009103', 'r9-snoopdes@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b1100000-0000-4000-8000-000000009101', 'r9-owner@test.invalid',   'R9 Owner',    false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000009102', 'r9-subject@test.invalid', 'R9 Subject',  false, NOW(), NOW()),
  ('b1100000-0000-4000-8000-000000009103', 'r9-snoopdes@test.invalid','R9 SnoopDes', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-0000000091a1', 'design_studio', 'R9 Studio', 'r9-confidential-rate', 'active');

-- All three seated BEFORE any designer grant, so 00295's early exit leaves nobody
-- owning a second workspace and S is the only studio in play.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-0000000091c1', 'b1100000-0000-4000-8000-000000009101',
   'b1100000-0000-4000-8000-0000000091a1', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-0000000091c2', 'b1100000-0000-4000-8000-000000009102',
   'b1100000-0000-4000-8000-0000000091a1', 'member', 'active', NOW()),
  ('b1100000-0000-4000-8000-0000000091c3', 'b1100000-0000-4000-8000-000000009103',
   'b1100000-0000-4000-8000-0000000091a1', 'member', 'active', NOW());

-- The snoop is a real designer (00563's authenticated INSERT arm reads
-- has_designer_domain_role), and a plain `member` of the studio — not its admin.
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-000000009103', id FROM public.roles WHERE name = 'studio_designer';
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-000000009101', id FROM public.roles WHERE name = 'studio_owner';

DO $$
DECLARE
  v_owner_seats INTEGER;
  v_studio      uuid;
  v_visible     INTEGER;
  v_state       TEXT;
  v_message     TEXT;
  v_rate        INTEGER;
  v_source      TEXT;
  v_duration    INTEGER;
  v_user        uuid;
BEGIN
  -- The owner prices the subject on HT-3's own surface, through RLS.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009101');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-0000000091a1', 'b1100000-0000-4000-8000-000000009102',
          15000, CURRENT_DATE - 30, 'b1100000-0000-4000-8000-000000009101');
  PERFORM pg_temp.reset_role();

  -- The snoop creates her own project, stamped with the studio she is a plain
  -- member of — which 00563's authenticated arm permits (active non-guest
  -- membership), and which 00602 would never have stamped (owner seats only).
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009103');
  INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
  VALUES ('b1100000-0000-4000-8000-0000000091e1', 'R9 Snoop House',
          'b1100000-0000-4000-8000-000000009103', 'b1100000-0000-4000-8000-000000009103',
          'b1100000-0000-4000-8000-0000000091a1');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_owner_seats FROM public.organization_members
   WHERE user_id = 'b1100000-0000-4000-8000-000000009103' AND role = 'owner';
  ASSERT v_owner_seats = 0,
    'FAIL ab0 (precondition): the snoop must own no studio, or the 15000 below could be '
    'explained by something other than the studio that owns the work; owner seats = '
    || v_owner_seats;

  SELECT studio_id INTO v_studio FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-0000000091e1';
  ASSERT v_studio = 'b1100000-0000-4000-8000-0000000091a1',
    'FAIL ab0b (precondition): the project must carry the studio, or tier 2 never runs and '
    'the case asserts nothing; got ' || COALESCE(v_studio::text, 'NULL');

  -- ab1 CONTROL: RLS gives her nothing of the subject's rate.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009103');
  SELECT count(*) INTO v_visible FROM public.studio_member_rates
   WHERE user_id = 'b1100000-0000-4000-8000-000000009102';
  PERFORM pg_temp.reset_role();
  ASSERT v_visible = 0,
    'FAIL ab1 (control, 00598): studio_member_rates_read_self_or_admin must hide a colleague''s '
    'rate from a plain member — if it does not, the asserts below measure the wrong leak; rows = '
    || v_visible;

  -- ab2: she may not MINT a priced row naming him.
  v_state := NULL;
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009103');
  BEGIN
    INSERT INTO public.project_time_entries
      (id, project_id, user_id, started_at, duration_minutes, billable, source)
    VALUES ('b1100000-0000-4000-8000-0000000091b1', 'b1100000-0000-4000-8000-0000000091e1',
            'b1100000-0000-4000-8000-000000009102', NOW() - INTERVAL '2 hours', 60, true, 'manual_entry');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501',
    'FAIL ab2 (W1-R9-01): minting an entry for another member''s user_id must be refused with '
    'insufficient_privilege — the rate the server then stamps on it is confidential pay. Got '
    || COALESCE(v_state, 'NO RAISE') || ' / ' || COALESCE(v_message, 'the insert succeeded');
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_time_entries
                      WHERE id = 'b1100000-0000-4000-8000-0000000091b1'),
    'FAIL ab2b (W1-R9-01): the refused insert must leave no row behind';

  -- ab3: nor may she log her own hour and repoint it at him. An INSERT-only
  -- refusal leaves the same enumeration primitive open in two statements.
  v_state := NULL;
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009103');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000091b2', 'b1100000-0000-4000-8000-0000000091e1',
          'b1100000-0000-4000-8000-000000009103', NOW() - INTERVAL '3 hours', 60, true, 'manual_entry');
  BEGIN
    UPDATE public.project_time_entries
       SET user_id = 'b1100000-0000-4000-8000-000000009102'
     WHERE id = 'b1100000-0000-4000-8000-0000000091b2';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  SELECT user_id, hourly_rate_cents, rate_source INTO v_user, v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000091b2';
  ASSERT v_state = '42501',
    'FAIL ab3 (W1-R9-01): repointing an own-logged row at a colleague must be refused too, or the '
    'minting refusal is one statement wide. Got ' || COALESCE(v_state, 'NO RAISE') || ' / '
    || COALESCE(v_message, 'the update succeeded');
  ASSERT v_user = 'b1100000-0000-4000-8000-000000009103'
     AND v_rate IS NULL AND v_source = 'none',
    'FAIL ab3b (W1-R9-01): her own row must stay hers and stay unpriced (she holds no studio rate); '
    'got user ' || COALESCE(right(v_user::text, 4), 'NULL') || ' rate '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- ab4 CONTROL (W1-R1-05): the designer still corrects a teammate's OWN entry.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009102');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000091b3', 'b1100000-0000-4000-8000-0000000091e1',
          'b1100000-0000-4000-8000-000000009102', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009103');
  UPDATE public.project_time_entries SET duration_minutes = 90
   WHERE id = 'b1100000-0000-4000-8000-0000000091b3';
  PERFORM pg_temp.reset_role();
  SELECT duration_minutes, hourly_rate_cents, rate_source INTO v_duration, v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000091b3';
  ASSERT v_duration = 90,
    'FAIL ab4 (control, W1-R1-05): the refusal must not narrow the project designer''s correction '
    'of a teammate''s existing entry — user_id does not change there; duration is '
    || COALESCE(v_duration::text, 'NULL');
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL ab4b: the subject''s own hour is priced by the studio that owns the work, as before; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  -- ab5 CONTROL: the studio's owner may write on a member's behalf. She is the one
  -- actor the rate is not confidential from (studio_member_rates_read_self_or_admin),
  -- which is the same authority the resolver's ASSERT 2 names.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-000000009101');
  INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
  VALUES ('b1100000-0000-4000-8000-0000000091e2', 'R9 Owner House',
          'b1100000-0000-4000-8000-000000009101', 'b1100000-0000-4000-8000-000000009101',
          'b1100000-0000-4000-8000-0000000091a1');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-0000000091b4', 'b1100000-0000-4000-8000-0000000091e2',
          'b1100000-0000-4000-8000-000000009102', NOW() - INTERVAL '5 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-0000000091b4';
  ASSERT v_rate = 15000 AND v_source = 'studio_member',
    'FAIL ab5 (control): an owner/admin of the studio that owns the work may still log on a '
    'member''s behalf, priced by that studio; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (ab) passed — W1-R9-01, the confidential rate stays off a row its subject did not write.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 10 (W1-R10-01) — HT-3-c, RULED arm (a): THE PROJECT'S OWN COLUMN
-- IS THE DESIGNER'S TO NAME, AND IT PRICES THE HOUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── (ac) a plain-member designer creates a project through RLS naming the
--          workspace she OWNS, and that workspace prices her hour ─────────────
--
-- Step 1 reads a column the project's designer can supply. `set_project_studio_id`
-- (00317 → 00511 → 00563) bounds it to studios she actively belongs to — its
-- authenticated-INSERT arm asks for `membership.role <> 'guest'` and NOTHING about
-- `owner` — so of the two studios in this fixture (her employer S and the workspace W
-- that 00295 provisioned at her designer grant) she may name EITHER. The banners in
-- 00599 and 00602 used to claim the guard "is what makes the column trustworthy as a
-- pricing key"; measured in review round 10, that is false — the guard bounds the set
-- and does not choose within it.
--
-- HT-3-c (RULED by the orchestrator 2026-09-12, arm (a) — flagged to Kody) settles
-- what that means for money: a project whose designer NAMED its studio_id prices from
-- that studio EVEN WHEN SHE OWNS IT, because that is a sole proprietor billing her own
-- studio's client rather than a member gaming her employer's books. W2's composer and
-- the studio settings page are where a suspicious studio_member_rates row is seen.
--
-- Nothing here is privileged, forged or unusual: the hire signed up as a designer,
-- was seated by her studio, and created a project from the browser.
--   LEG1 control — a NULL aim is REFUSED by 00563 (two candidate studios), which is
--                  why naming the column is the only way she can create a project at
--                  all and why this surface matters.
--   LEG2 the pin  — she names W. Her hour prices at the 99900 she set about herself,
--                  authorized, and it reaches project_unbilled_time as real money.
--                  This is HT-3-c arm (a) applied literally; arm (b) (refuse a named
--                  studio she owns while she has an employer) would move LEG2's
--                  asserts and nothing else in this file.
--   LEG3 control — she names S instead: the employer's 20000 prices the hour, which
--                  is what proves LEG2 is about the named column and not about the
--                  tiers.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-00000000a001', 'r10ac-leah@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-00000000a002', 'r10ac-hire@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-00000000aa01', 'design_studio', 'R10ac Studio', 'r10ac-studio', 'active');

UPDATE public.profiles SET full_name = 'R10ac Leah' WHERE id = 'b1100000-0000-4000-8000-00000000a001';
UPDATE public.profiles SET full_name = 'R10ac Hire' WHERE id = 'b1100000-0000-4000-8000-00000000a002';

-- Leah owns S.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-00000000ac01', 'b1100000-0000-4000-8000-00000000a001',
        'b1100000-0000-4000-8000-00000000aa01', 'owner', 'active', NOW());
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-00000000a001', id FROM public.roles WHERE name = 'studio_owner';

-- The hire: designer role FIRST (so 00295 provisions W and she owns it), then seated
-- a PLAIN MEMBER of S — the weakest seat there is, deliberately.
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-00000000a002', id FROM public.roles WHERE name = 'studio_designer';
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('b1100000-0000-4000-8000-00000000ac02', 'b1100000-0000-4000-8000-00000000a002',
        'b1100000-0000-4000-8000-00000000aa01', 'member', 'active', NOW());

DO $$
DECLARE
  v_workspace uuid;
  v_seatrole  TEXT;
  v_state     TEXT;
  v_message   TEXT;
  v_stamp     uuid;
  v_rate      INTEGER;
  v_source    TEXT;
  v_amount    INTEGER;
  v_billing   TEXT;
  v_view_rate INTEGER;
  v_view_amt  INTEGER;
BEGIN
  SELECT organization_id INTO v_workspace
  FROM public.organization_members
  WHERE user_id = 'b1100000-0000-4000-8000-00000000a002' AND role = 'owner' AND status = 'active';
  ASSERT v_workspace IS NOT NULL AND v_workspace <> 'b1100000-0000-4000-8000-00000000aa01',
    'FAIL ac0 (precondition): 00295 must have provisioned the hire a workspace she OWNS, distinct '
    'from her employer — without two candidates there is nothing for her to choose between';

  SELECT role::text INTO v_seatrole FROM public.organization_members
   WHERE organization_id = 'b1100000-0000-4000-8000-00000000aa01'
     AND user_id = 'b1100000-0000-4000-8000-00000000a002';
  ASSERT v_seatrole = 'member',
    'FAIL ac0b (precondition): she must be a PLAIN MEMBER of the employing studio — the lever '
    'under test belongs to the weakest seat, not to an admin; got ' || COALESCE(v_seatrole, 'NULL');

  -- Leah prices her in S; she prices herself in W, which HT-3 permits in letter
  -- (is_org_admin_or_owner(W) admits her — 00295 made her its owner).
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000a001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-00000000aa01', 'b1100000-0000-4000-8000-00000000a002',
          20000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-00000000a001');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000a002');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_workspace, 'b1100000-0000-4000-8000-00000000a002', 99900, CURRENT_DATE - 10,
          'b1100000-0000-4000-8000-00000000a002');
  PERFORM pg_temp.reset_role();

  -- ── LEG1 control: a NULL aim, through RLS, as her ───────────────────────────
  v_state := NULL;
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000a002');
  BEGIN
    INSERT INTO public.projects (id, name, designer_id, created_by)
    VALUES ('b1100000-0000-4000-8000-00000000ace1', 'R10ac Null-aim House',
            'b1100000-0000-4000-8000-00000000a002', 'b1100000-0000-4000-8000-00000000a002');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state IS NOT NULL,
    'FAIL ac1 (LEG1 control): with TWO candidate studios 00563 is expected to REFUSE a NULL-aimed '
    'authenticated project INSERT. If it now succeeds, the product no longer pushes her onto the '
    'named-column surface and HT-3-c''s premise should be re-measured';

  -- ── LEG2, THE PIN (HT-3-c arm (a)): she names the workspace she owns ────────
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000a002');
  INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
  VALUES ('b1100000-0000-4000-8000-00000000ace2', 'R10ac Own-aim House',
          'b1100000-0000-4000-8000-00000000a002', 'b1100000-0000-4000-8000-00000000a002',
          v_workspace);
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-00000000acb1', 'b1100000-0000-4000-8000-00000000ace2',
          'b1100000-0000-4000-8000-00000000a002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT studio_id INTO v_stamp FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-00000000ace2';
  ASSERT v_stamp = v_workspace,
    'FAIL ac2a (HT-3-c): the studio_id she named must survive both triggers — 00563 admits any '
    'studio she actively belongs to (role <> ''guest''), and 00602 returns early when the column '
    'is already set; got ' || COALESCE(v_stamp::text, 'NULL');

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_billing
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-00000000acb1';
  ASSERT v_rate = 99900 AND v_source = 'studio_member' AND v_amount = 199800
         AND v_billing = 'authorized',
    'FAIL ac2 (HT-3-c arm (a), RULED 2026-09-12): the studio the designer NAMED prices the hour — '
    'here the workspace she owns, at the 99900 she set about herself, 199800 for 120 min, '
    'authorized. This case PINS arm (a) as ruled: a sole proprietor billing her own studio''s '
    'client. If arm (b) is ever ruled instead (refuse a named studio she owns while she holds an '
    'employer seat), this assert becomes 20000 / studio_member / 40000 / authorized and a refusal '
    'arm lands in 00602 beside the stamp — not an edit to set_project_studio_id; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL') || ' / ' || COALESCE(v_billing, 'NULL');

  SELECT resolved_rate_cents, amount_cents INTO v_view_rate, v_view_amt
  FROM public.project_unbilled_time WHERE id = 'b1100000-0000-4000-8000-00000000acb1';
  ASSERT v_view_rate = 99900 AND v_view_amt = 199800,
    'FAIL ac2b (HT-3-c arm (a)): and it reaches project_unbilled_time as real money — the invoice '
    'composer''s feed and claim_time_entries'' invoice lock see 99900 / $1,998.00. Recorded so the '
    'ruling is read with its consequence attached, and so W2''s composer knows what it is looking '
    'at; got ' || COALESCE(v_view_rate::text, 'NULL') || ' / ' || COALESCE(v_view_amt::text, 'NULL');

  -- ── LEG3 control: the same designer names her EMPLOYER instead ──────────────
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000a002');
  INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
  VALUES ('b1100000-0000-4000-8000-00000000ace3', 'R10ac Employer-aim House',
          'b1100000-0000-4000-8000-00000000a002', 'b1100000-0000-4000-8000-00000000a002',
          'b1100000-0000-4000-8000-00000000aa01');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-00000000acb2', 'b1100000-0000-4000-8000-00000000ace3',
          'b1100000-0000-4000-8000-00000000a002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-00000000acb2';
  ASSERT v_rate = 20000 AND v_source = 'studio_member' AND v_amount = 40000,
    'FAIL ac3 (LEG3 control, HT-3-c): aimed at her employer, the SAME designer''s hour is priced '
    'by the employer (20000 / 40000 for 120 min). This is what makes ac2 a statement about the '
    'column she named rather than about her tiers; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_rate_resolution: case (ac) passed — HT-3-c arm (a) pinned, W1-R10-01.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW ROUND 11 (W1-R11-RESIDUE) — PINNED, NOT FIXED: HT-3-b(c) STAYS OWED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── (ad) the consent-free seat, pointed at a designer who has NO employer:
--          a stranger's workspace becomes her one employer tier and its rates
--          price her studio's client ───────────────────────────────────────────
--
-- HT-3-b's own text says a member "can only push the outcome toward 'none', never
-- toward a number she set", and for the MEMBER BEING PRICED that is what cases (x)
-- and (aa8) measure. This case measures the other actor, and the sentence does not
-- cover it.
--
-- A studio's PRINCIPAL holds an `owner` seat, so her EMPLOYER tier is empty. Any
-- account that owns an organization — which 00295 hands to every designer at signup —
-- can seat her in it as a plain `member` through `Org owners can insert members`
-- (`is_org_admin_or_owner(organization_id) AND role <> 'owner'`, nothing about the
-- invitee, no consent, no invitation to accept). That single INSERT makes the
-- stranger's workspace her ONE employer candidate, and the employer tier is read
-- before the owned tier — so her own studio stops pricing her projects and the
-- stranger's workspace starts. Seat her assistant there too and the stranger writes
-- his rate at any number (`studio_member_rates_admin_insert` asks only for
-- `is_org_admin_or_owner(studio_id)` plus subject membership).
--
-- MEASURED 1/1 on this stack, every write through RLS as the actor named, before this
-- case was written: the assistant's hour on the principal's own client project came
-- back `99900 / studio_member / 199800`, authorized, from the stranger's workspace,
-- while the 12000 she set for him in her own studio was ignored.
--
-- It is NOT fixed here, for the reason HT-3-a and HT-3-b both give: the door is
-- consent on seating, and closing it changes how every invite in Patina works
-- (00295's self-seat, studio invites, `accept_workspace_invitation`, the admin
-- portal's seat adds, and every helper that reads `organization_members.status`).
-- That is HT-3-b arm **(c)**, which the ruling leaves OWED. Code-only narrowings
-- re-open the rounds the ruling closed:
--   · "prefer the studio with more active members" / "prefer one she does not run" —
--     rounds 5 and 6 rated each blocker-grade, one extra signup away;
--   · "refuse an employer seat the designer did not accept" IS arm (c);
--   · "read the owned tier first" restores W1-R8-01, which HT-3-b exists to close.
-- So these asserts PIN TODAY'S BEHAVIOUR. When arm (c) lands, ad2/ad3 become
-- 12000 / studio_member / 24000 out of her own studio and nothing else in this file
-- moves.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('b1100000-0000-4000-8000-00000000d001', 'r11ad-principal@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-00000000d002', 'r11ad-asst@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b1100000-0000-4000-8000-00000000d003', 'r11ad-stranger@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('b1100000-0000-4000-8000-00000000dd01', 'design_studio', 'R11ad Principal Studio', 'r11ad-principal', 'active');

UPDATE public.profiles SET full_name = 'R11ad Principal' WHERE id = 'b1100000-0000-4000-8000-00000000d001';
UPDATE public.profiles SET full_name = 'R11ad Assistant' WHERE id = 'b1100000-0000-4000-8000-00000000d002';
UPDATE public.profiles SET full_name = 'R11ad Stranger'  WHERE id = 'b1100000-0000-4000-8000-00000000d003';

-- The principal owns her studio and is employed nowhere; her assistant is a plain
-- member of it. Both are seated before any designer grant, so 00295 provisions them
-- nothing extra.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('b1100000-0000-4000-8000-00000000da01', 'b1100000-0000-4000-8000-00000000d001',
   'b1100000-0000-4000-8000-00000000dd01', 'owner',  'active', NOW()),
  ('b1100000-0000-4000-8000-00000000da02', 'b1100000-0000-4000-8000-00000000d002',
   'b1100000-0000-4000-8000-00000000dd01', 'member', 'active', NOW());
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-00000000d001', id FROM public.roles WHERE name = 'studio_owner';

-- The stranger: an ordinary designer signup, nothing more. 00295 gives it a workspace
-- it owns, which is the whole of its leverage.
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'b1100000-0000-4000-8000-00000000d003', id FROM public.roles WHERE name = 'studio_designer';

DO $$
DECLARE
  v_stranger uuid;
  v_stamp    uuid;
  v_rate     INTEGER;
  v_source   TEXT;
  v_amount   INTEGER;
  v_state    TEXT;
BEGIN
  SELECT organization_id INTO v_stranger FROM public.organization_members
   WHERE user_id = 'b1100000-0000-4000-8000-00000000d003' AND role = 'owner' AND status = 'active';
  ASSERT v_stranger IS NOT NULL,
    'FAIL ad0 (precondition): 00295 must have provisioned the stranger its own workspace — that '
    'workspace is the whole of the manoeuvre';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE user_id = 'b1100000-0000-4000-8000-00000000d001'
       AND status = 'active' AND role <> 'owner' AND role <> 'guest'),
    'FAIL ad0b (precondition): the principal must hold NO employer seat to begin with — that is '
    'what leaves her employer tier empty and seizable';

  -- She prices her assistant honestly, in her own studio, on HT-3's own surface.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000d001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('b1100000-0000-4000-8000-00000000dd01', 'b1100000-0000-4000-8000-00000000d002',
          12000, CURRENT_DATE - 20, 'b1100000-0000-4000-8000-00000000d001');
  PERFORM pg_temp.reset_role();

  -- THE MOVES, all through RLS as the stranger. Nothing is forged and nothing is
  -- privileged: two seats nobody consented to, and one rate in its own workspace.
  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000d003');
  INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
  VALUES
    ('b1100000-0000-4000-8000-00000000da03', 'b1100000-0000-4000-8000-00000000d001', v_stranger, 'member', 'active', NOW()),
    ('b1100000-0000-4000-8000-00000000da04', 'b1100000-0000-4000-8000-00000000d002', v_stranger, 'member', 'active', NOW());
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES (v_stranger, 'b1100000-0000-4000-8000-00000000d002', 99900, CURRENT_DATE - 10,
          'b1100000-0000-4000-8000-00000000d003');
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT role::text FROM public.organization_members
           WHERE id = 'b1100000-0000-4000-8000-00000000da03') = 'member',
    'FAIL ad1a (precondition): the consent-free seat must have landed as a plain member through '
    '`Org owners can insert members`. If it now raises, arm (c) shipped and this case should be '
    'rewritten as a negative one';

  -- Her next client project.
  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES ('b1100000-0000-4000-8000-00000000de01', 'R11ad Client House',
          'b1100000-0000-4000-8000-00000000d001', 'b1100000-0000-4000-8000-00000000d001');
  SELECT studio_id INTO v_stamp FROM public.projects
   WHERE id = 'b1100000-0000-4000-8000-00000000de01';

  ASSERT v_stamp = v_stranger,
    'FAIL ad1 (PINS TODAY — HT-3-b(c) OWED): the stranger''s workspace is now the principal''s ONE '
    'employer candidate, and the employer tier is read before the owned tier, so it is what 00602 '
    'stamps on HER studio''s project. When arm (c) closes the consent door this becomes her own '
    'studio (b1100000-0000-4000-8000-00000000dd01); got ' || COALESCE(v_stamp::text, 'NULL');

  PERFORM pg_temp.assume_user('b1100000-0000-4000-8000-00000000d002');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('b1100000-0000-4000-8000-00000000db01', 'b1100000-0000-4000-8000-00000000de01',
          'b1100000-0000-4000-8000-00000000d002', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, rate_source, rated_amount_cents, billing_state
    INTO v_rate, v_source, v_amount, v_state
  FROM public.project_time_entries WHERE id = 'b1100000-0000-4000-8000-00000000db01';

  ASSERT v_rate = 99900 AND v_source = 'studio_member' AND v_amount = 199800
         AND v_state = 'authorized',
    'FAIL ad2 (PINS TODAY — HT-3-b(c) OWED): the assistant''s hour on the principal''s own client '
    'project is priced at the 99900 a STRANGER set in its own workspace, authorized, $1,998.00 — '
    'while the 12000 she set for him in her own studio is ignored. When arm (c) lands this becomes '
    '12000 / studio_member / 24000 / authorized; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL') || ' / '
    || COALESCE(v_state, 'NULL');

  ASSERT (SELECT amount_cents FROM public.project_unbilled_time
           WHERE id = 'b1100000-0000-4000-8000-00000000db01') = 199800,
    'FAIL ad3 (PINS TODAY — HT-3-b(c) OWED): and it reaches project_unbilled_time, which is the '
    'invoice composer''s feed and claim_time_entries'' invoice lock. When arm (c) lands this '
    'becomes 24000';

  RAISE NOTICE 'time_rate_resolution: case (ad) passed — HT-3-b''s consent-door residue pinned as built, arm (c) OWED.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All time_rate_resolution assertions passed.'; END $$;

ROLLBACK;
