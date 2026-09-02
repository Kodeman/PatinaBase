-- ═══════════════════════════════════════════════════════════════════════════
-- 00555 — iOS First Flight round one: close the ANON reads on profiles,
--         notification_preferences, vendors and four SECURITY DEFINER views
--
-- Number re-checked against `ls supabase/migrations/*.sql | sort -V | tail -3`
-- on 2026-09-02 immediately before this file moved into supabase/migrations/:
-- head was 00554_onboarding_review_fixes.sql, so 00555 stands. Concurrent
-- sessions mint in this band — re-check again before the prod apply and
-- renumber THIS file (name + this banner) on collision. It has never been
-- applied anywhere, so editing it in place is the correct remediation until it
-- lands.
--
-- Function lineage (skill: patina-db-migrations step 2):
--   handle_new_user  00013 → 00023 → 00028 → 00039 → 00040 → 00126 → 00313 → (this)
--                    body AND signature grafted VERBATIM from 00313, role CASE
--                    and `SET search_path TO 'public'` included: RULING B2 v3
--                    restores the pre-00555 default, so the only deltas are a
--                    REVOKE of EXECUTE from PUBLIC/anon/authenticated (RF2-10,
--                    extended to authenticated by RF3-11) and a COMMENT.
--                    See (a2)(ii). Fix rounds 1 and 2 had this function
--                    branching on the identity provider; v3 reverses that.
--   can_view_profile / current_profile_role / current_profile_is_designer /
--   search_shareable_designers / list_vendor_profiles  new here, all five
--                    SECURITY DEFINER with `SET search_path = public, pg_temp`
--                    (RF2-11 — pg_temp named explicitly rather than left to the
--                    implicit front-of-path entry)
--
-- ── FABLE RULING B2 v3 (2026-09-02) — VERBATIM ─────────────────────────────
--
-- Supersedes B2 v1 and B2 v2 wherever they appear in this file, in
-- build/waves/w0/wave-report.md and in build/waves/w0/KODY-RUNBOOK.md. Where a
-- comment below still explains v1 or v2, it is kept as HISTORY and says so.
--
--   (a) profiles.role is a LABEL, never an authorization input. handle_new_user
--       keeps the pre-00555 default ('designer' for any signup without an
--       explicit role hint — portals unchanged, Apple/Google on the portals
--       unchanged); an explicit 'homeowner' hint still wins.
--   (b) Authority comes only from user_roles (roles.domain IN
--       ('designer','admin')) or profiles.is_designer, which are written only
--       by service_role / SECURITY DEFINER paths. Every policy or function this
--       migration adds that decides authority predicates on those two, never on
--       profiles.role.
--   (c) The own-row profiles UPDATE policy allows role to change ONLY to
--       'homeowner' (a self-downgrade; never upward) and is_designer only to
--       false; the iOS app performs that self-downgrade after Apple/Google
--       sign-in (that is W1 · L1-A's A3-07 fix; write the integration note
--       artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-a-notes.md
--       with the exact contract: after signInWithIdToken/OAuth, PATCH profiles
--       set role='homeowner' where id = self, idempotent, once).
--   (d) The client-invite edge function's accept path sets
--       profiles.role='homeowner' for the accepting user as service_role
--       (RF2-02) — supabase/functions/client-invite/index.ts handleAccept; add
--       it to the runbook as a Kody-run deploy step in Block A (deploy
--       client-invite after merge) and note that already-accepted clients need
--       a one-time backfill query (write it, read-only preview + the UPDATE, in
--       Block B7).
--   (e) The sibling policy "Designers can update their client profiles" treats
--       role IN ('homeowner','client') as the client vocabulary in USING and
--       WITH CHECK (RF2-06), with a W2 note that the 'client'/'homeowner' split
--       must be reconciled.
--
-- WHAT v3 CHANGES IN THIS FILE, in one list:
--   • handle_new_user goes back to 00313 verbatim — COALESCE(v_role,'designer')
--     and the explicit-hint arm. The provider CASE is gone. (a2)(ii).
--   • The two RESTRICTIVE designer_clients policies drop their profiles.role
--     leg and read user_roles + is_designer instead. (a2)(i-c), RF2-01.
--   • "Users can update own profile" allows the self-DOWNGRADE its old pin
--     forbade — role to 'homeowner', is_designer to false, never upward.
--     (a2)(i-a), ruling (c).
--   • "Designers can update their client profiles" reads role
--     IN ('homeowner','client'). (a2)(i-b), ruling (e), RF2-06.
--   • "Users can insert own profile" no longer pins role at all — only
--     is_designer. (a) below, RF2-07.
--
-- WHAT FIX ROUND 3 PASS 2 ADDS, on top of the list above:
--   • "Designers can update their client profiles" now also checks the CALLER's
--     own authority — is_designer or a designer/admin user_roles grant — in BOTH
--     clauses. (i-b), RF3-03. Without it a roster row minted BEFORE this
--     migration kept its holder a profile-write and a PII read, because the
--     restrictive policies in (i-c) only govern new writes.
--   • REVOKE TRUNCATE, REFERENCES ON public.designer_clients FROM authenticated,
--     the pair already cleared on profiles. (i-c) grants block, RF3-07.
--   • handle_new_user's EXECUTE revoke extends to authenticated. (a2)(ii),
--     RF3-11.
--   • Three corrected claims, each of which had been measured false: §a4's
--     "a caller cannot list themselves into this picker" (RF3-02), §a2(i-b)'s
--     "non-authority columns" for a designer's rewrite of a client's email
--     (RF3-04, invoice-send:204 resolves that column FIRST), and §(d)'s "every
--     reader … goes through an admin-portal route on the service-role client"
--     (RF3-10, nine browser-client sites, none mounted).
--   • Verification block: an existence ASSERT for "Designers can create
--     homeowner profiles" — the one tamper of 27 that passed (RF3-05); the
--     own-row INSERT role guard restructured so a MISSING policy reports as
--     missing (RF3-06); an exact-privilege-set ASSERT for anon on
--     designer_clients (RF3-01); and the three new guards above.
--
-- WHAT FIX ROUND 3 PASS 3 ADDS, on top of both lists above:
--   • ⚠ RULING TAKEN, RF3-02. "Users can insert own profile" gains the
--     VOCABULARY guard pass 2 handed back: role IN ('homeowner','client',
--     'designer'). It is a vocabulary check, NOT a pin to the caller's current
--     value, and `is_designer IS NOT TRUE` is unchanged — so ruling B2 v3(a)
--     stands in substance (role grants nothing) while the two labels pass 2
--     measured a caller landing in the missing-row window, 'vendor' and
--     'admin', stop being reachable. §a, §a4, and the ASSERT that used to
--     police `NOT ILIKE '%role%'` on that policy.
--   • RF3-13. "Designers can create homeowner profiles" (00017) is restricted
--     to callers who HOLD designer authority — the same
--     `current_profile_is_designer() IS TRUE OR user_roles ⨝ roles domain IN
--     ('designer','admin')` predicate as (i-b) and (i-c) — and the created row
--     must be role IN ('homeowner','client') AND is_designer IS NOT TRUE. It
--     was TO PUBLIC with `auth.uid() IS NOT NULL AND role = 'homeowner'`: named
--     designers, admitted everybody, and was the last INSERT route by which a
--     self-signup could plant a profiles row at an arbitrary id. The policy
--     MOVED from §(a) to (a2)(i-b2) because a policy's functions resolve at
--     CREATE POLICY time and the helper is defined in (i-a).
--   • RF3-14. can_view_profile's TWO roster legs now require the roster row's
--     designer_id to hold the same two authority signals. Pass 2 closed the
--     legacy row's WRITE and its own matrix showed the READ still answering
--     200 with email and phone; this closes it. The teammate leg needed it as
--     much as the direct one, because is_studio_comember's first branch is
--     `p_owner = auth.uid()`. Every place that claimed the legacy row was
--     "closed" now says which half is closed by what, and that THE ROW ITSELF
--     remains — a data job for KODY-RUNBOOK B7a/B7b, not a policy one.
--   • RF3-19. Grant hygiene on the two AUTHORITY tables. anon loses
--     INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES on public.roles and
--     public.user_roles; authenticated loses INSERT/DELETE/TRUNCATE/REFERENCES
--     and KEEPS UPDATE, because `SELECT … FOR SHARE` is charged to the UPDATE
--     privilege and 00511's SECURITY INVOKER trigger set_project_studio_id()
--     row-share-locks both tables on every authenticated project write
--     (measured — the first cut took public_sd_hardening_contract_test.sql
--     red). SELECT is kept for both roles, for the executor-init ACL reason
--     designer_clients already documents. New section (f), which lists every
--     reader, the single session-side write in the repo, and that lock.
--   • RF3-17. The four definer views are asserted closed to `authenticated`
--     too, not only to anon — §(d) revokes from both and asserted one.
--   • RF3-18. The exact-privilege-set ASSERT moves off
--     information_schema.table_privileges, which cannot see PG 17's MAINTAIN,
--     onto pg_class.relacl via aclexplode(), which can. Its claim to catch
--     "a verb nobody thought to list" is true now.
--   • RF3-20. A second verification block that CALLS each of the five helpers
--     once under a fabricated auth.uid(), so shape checks are backed by eight
--     data-independent behaviour checks. Fixture-dependent behaviour stays in
--     supabase/tests/rls/00555_ios_round_one_security.test.sql.
--
-- ── WHAT THIS FIXES, STATED PLAINLY ────────────────────────────────────────
--
-- This migration closes the ANONYMOUS read. It does NOT make profiles PII-safe
-- against signed-in users. Read that sentence twice before reviewing the rest.
--
-- The iOS app (cloud.patina.app) ships the Strata anon key inside the binary.
-- Anyone who extracts it speaks PostgREST as `anon`. The A3 production sweep
-- (artifacts/ios-testflight-polish-2026-09-01/research/A3-prod.md) proved these
-- live reads with that key, all re-verified against pg_policy / pg_class on
-- 2026-09-01:
--
--   profiles                  200, 24/24 rows — email, stripe_customer_id,
--                             phone, city/state/zip, availability
--   notification_preferences  200, 1/1 row — and anon additionally holds
--                             INSERT, UPDATE and DELETE on the table
--   vendors                   200, 4/4 rows — including internal `notes`
--                             ("trade is good so are the tunes") and
--                             `trade_terms` ("terms are fine")
--   user_engagement_scores    a SECURITY DEFINER view (security_invoker = false)
--                             over profiles, relacl `anon=arwdDxtm/postgres`,
--                             projecting id, email, role, current_score,
--                             last_active_at, engagement_tier. It bypasses
--                             profiles RLS by construction, so fixing the
--                             profiles policy alone would have left every
--                             production email readable through this view.
--                             Found in adversarial review, not in A3.
--
-- Verbatim policy rows behind the first three, read from pg_policy on Strata
-- (bkvcixdmuyejfzcijpdg) on 2026-09-01:
--
--   profiles | "Profiles are viewable by everyone"
--            | polcmd r | polroles {0} (PUBLIC) | qual: true
--   notification_preferences | "Service role full access to notification preferences"
--            | polcmd * (ALL) | polroles {0} (PUBLIC) | qual: (auth.uid() IS NULL)
--   vendors  | "Allow anon read access to vendors"
--            | polcmd r | polroles {anon} | qual: true
--
-- The second is the shape this migration attacks in several places at once:
-- service_role is BYPASSRLS, so a policy whose predicate is `auth.uid() IS NULL`
-- grants nothing to service_role. Its only effect is to hand the table to the
-- unauthenticated role. The name is an old misunderstanding, not a dependency.
--
-- It ALSO closes a privilege-escalation path that is not an anon issue at all:
-- 00013's "Users can update own profile" is USING-only, with no WITH CHECK and
-- no column restriction, so any authenticated caller can set their own
-- profiles.role to 'designer' — and, worse, their own profiles.is_designer to
-- true, which is the column the design-request pool (00286), the claim/accept
-- RPCs (00286/00330) and design_request_submit (00285) read as designer
-- AUTHORITY. Both columns are pinned in section (a2) below, on BOTH of the
-- table's permissive UPDATE policies.
--
-- ── WHAT IT DOES NOT FIX ───────────────────────────────────────────────────
--
-- Two limits, both deliberate, both needing a ruling (see DECISION DM-1):
--
-- 1. THE COUNTERPARTY PREDICATE IS STILL PARTLY SELF-ASSERTABLE.
--    `can_view_profile` admits a caller who shares a roster row, project,
--    proposal, invoice, lead, direct order, room-scan share, message thread or
--    studio with the target. Several of those tables let an ordinary
--    authenticated user INSERT the linking row themselves — `projects`,
--    `comms_thread_participants`, `project_team_members` and
--    `room_scan_associations` all have INSERT policies reachable by a signed-up
--    designer. So a determined signed-in user can still manufacture a
--    relationship and read a target profile. This is strictly better than
--    `USING (true)` — it costs a write, leaves an audit trail, and cannot be
--    done at all by the anon key — but it is a speed bump, not a wall.
--
--    `designer_clients` was on that list until fix round 3 pass 3 and is not
--    any more, in either time direction: a NEW row cannot be minted by a
--    non-designer (the restrictive policies in (i-c)), and a row that ALREADY
--    EXISTS grants nothing, because both roster legs now require the row's
--    designer_id to hold designer authority (RF3-14, above). The other four
--    tables are untouched here and remain the honest residual.
--
-- 2. ROW VISIBILITY IS ALL-COLUMN. Once a caller is admitted by any leg, they
--    read the WHOLE row: email, phone, stripe_customer_id,
--    default_hourly_rate_cents, help_state, posthog_distinct_id, ios_device_id,
--    original_utm, total_engagement_score, email_bounce_count, city/state/zip.
--    Nothing here narrows COLUMNS; a narrow `profile_cards` projection was
--    drafted and CUT (see the note where it used to be) because no caller in
--    the First Flight program reads it, and a view cannot stop a caller asking
--    the base table for `select=*` anyway. Closing that needs a PII split,
--    which is DM-1 below.
--
-- ── DECISION DM-1 for Kody — profiles PII ───────────────────────────────────
--
-- Not decided in this file. Three options, in ascending cost:
--
--   DM-1a  ACCEPT FOR ROUND ONE. Ship this migration as-is. The anon hole —
--          the one that matters for a public TestFlight build, because the key
--          is in the binary — is closed. Counterparty over-exposure stays, at
--          24 production profiles, all of them staff or Kody's own test rows.
--          Revisit before the marketplace has real strangers in it.
--
--   DM-1b  COLUMN-GRANT NARROWING. `REVOKE SELECT ON profiles FROM
--          authenticated` then `GRANT SELECT (<non-PII set>)`, plus a
--          `get_my_profile()` SECURITY DEFINER RPC for the owner's full row.
--          Removes PII from every counterparty read in one statement. It BREAKS
--          the four own-row `select('*')` readers, each of which must move to
--          the RPC first:
--            apps/mobile/Patina/Patina/Services/Auth/ProfileService.swift:88
--            packages/supabase/src/hooks/use-settings.ts:73
--            packages/supabase/src/hooks/use-gdpr.ts:241
--            apps/client-portal/src/lib/data/profile.ts:23
--          It also breaks any counterparty read that legitimately wants a
--          client's email — `use-projects.ts:127`, `use-invoices.ts:397`,
--          `use-proposals.ts:330` all select it today — so those need a ruling
--          on whether a designer may see their own client's email (probably
--          yes, via a definer RPC scoped to the roster).
--
--   DM-1c  TABLE SPLIT. Move email/phone/stripe_customer_id/zip/help_state/
--          analytics columns to `profile_private` with own-row-only RLS, leave
--          `profiles` as the shareable record. Cleanest end state, largest
--          migration, touches generated types and ~40 call sites.
--
--   RECOMMENDATION: DM-1a now, DM-1b next. Round one is 24 rows and a closed
--   anon key; DM-1b is a single migration plus five call-site edits and can
--   ship the week after TestFlight without a schema change. DM-1c is the right
--   shape but should not gate a build.
--
-- ── REQUIRED CODE FOLLOW-UPS — SHIP AND DEPLOY THESE FIRST ─────────────────
--
--   Ruling D8 in PROGRAM.md: this file does NOT go to Strata until (2) and (3)
--   below are merged and the designer portal is REDEPLOYED
--   (`./infra/deploy-portal.sh designer`). Two of the three are on the live
--   designer portal, which VISION §1 ranks ABOVE the iOS app; applying first
--   returns 500s on app.patina.cloud/api/catalog/vendors and a 42501 error
--   state on every comms screen that lists vendors. The lane that owns them is
--   L0.2b. The apply runbook opens with a Step 0 that checks the deploy and
--   stops if it is not there.
--
--   Note also that (2)'s getUser() guard closes a LIVE unauthenticated leak
--   TODAY, with no migration involved — so the safe order is also the fast one.
--
--   1. apps/mobile/Patina/Patina/Services/Sharing/ScanSharingService.swift:373-380
--      searchDesigners() must move to the RPC created below. Today it is an
--      unscoped free-text search over every `is_designer = true` profile that
--      hands any signed-in client every designer's EMAIL. THAT is the reason
--      for the change. Replace the `.from("profiles").select(...)` chain with
--      `.rpc("search_shareable_designers", params: ["p_query": query])`.
--      (Done on first-flight/w0-l02, commit c93cff358.)
--
--      ⚠ SCOPE, corrected 2026-09-02. An earlier draft of this block said the
--      share-with-a-designer picker "goes silently empty" after this migration.
--      It does not, because there is no picker:
--        grep -rn --include="*.swift" 'searchDesigners|getRecentDesigners' apps/mobile/
--      returns only ScanSharingService.swift itself and its new contract test.
--      No view in EITHER iOS app calls this API. So nothing user-visible was at
--      risk and nothing user-visible changed — do not schedule a walker against
--      a screen that does not exist. The swap is still correct and still
--      required; the justification on the record is the email leak, not a
--      broken screen.
--
--      Its sibling getRecentDesigners() (:416) is left as-is. It embeds
--      `profiles!designer_id(id, email, …)` for a designer the caller has a
--      LIVE room-scan share with, so after this migration it resolves through
--      can_view_profile's scan-share leg rather than breaking — and the email
--      it returns is counterparty column visibility, which DM-1 accepted for
--      round one and W2's profile_private split closes.
--
--   2. apps/designer-portal/src/app/api/catalog/vendors/route.ts:5-13 and
--      apps/designer-portal/src/app/api/catalog/vendors/[id]/route.ts:5-18.
--      Both call `createServerClient()` and `.select('*')` on vendors with NO
--      `getUser()` guard, and the portal middleware passes `/api/*` through.
--      Today that is a LIVE UNAUTHENTICATED LEAK of all 13 trade columns to
--      anyone who curls the route. After this migration the anon column grant
--      no longer covers `*`, so both routes return 500 instead. Fix is the same
--      either way: add a `getUser()` guard AND name the columns.
--
--   3. packages/supabase/src/hooks/use-comms.ts:1060-1065 `useVendorProfiles`
--      is `.from('profiles').select('id, full_name, avatar_url').eq('role','vendor')`
--      — a whole-table directory with no caller scoping. Note the failure mode
--      CHANGES: today it returns rows; after this migration it does not return
--      an empty array, it THROWS 42501 (`permission denied for table profiles`)
--      because the anon-side revoke is a grant, and the hook's `if (error) throw`
--      surfaces it. Any screen calling it shows an error state, not an empty one.
--      Remedy, pick one: (i) a `list_vendor_profiles()` SECURITY DEFINER RPC
--      returning id/full_name/avatar_url for `role = 'vendor'` — the same shape
--      as search_shareable_designers below; or (ii) a policy leg
--      `USING (role = 'vendor')` TO authenticated, which is a smaller diff but
--      re-opens every vendor profile's full row to every signed-in user and so
--      only makes sense after DM-1b. Recommendation: (i).
--
--   4. supabase/functions/client-invite/index.ts handleAccept — RULING B2 v3(d).
--      With (ii) reverted to the pre-00555 'designer' default, a client who
--      accepts a designer's invitation by signing up over email/password lands
--      profiles.role = 'designer'. The accept path is the one server-side
--      moment that KNOWS the caller is a client, so it stamps
--      profiles.role = 'homeowner' as service_role, right where it marks the
--      invitation accepted. Deploy step: KODY-RUNBOOK Block A (A10). The
--      one-time backfill for clients who already accepted is Block B7.
--
--   The full blast-radius list, including the silent degradations, is in the
--   READERS block at the foot of this file.
--
-- ── OUT OF SCOPE, RECORDED FOR A FOLLOW-UP MIGRATION ────────────────────────
--
--   • Strata carries 21 `security_definer_view` advisor ERRORs. This file
--     revokes anon on the four that project profile data or business metrics
--     (user_engagement_scores, consumer_funnel, designer_funnel,
--     conversion_funnel). The other 17 — rooms_with_hero_frames, room_scans_v2,
--     client_order_status_v, the v_aesthete_* family, open_design_requests and
--     the rest — are untouched. `open_design_requests` was checked and carries
--     no PII (project_type, budget_range, location city/state, description), so
--     it is deliberately left readable; the remainder need a per-view read.
--
--   • Eleven SECURITY DEFINER functions that read `profiles` are EXECUTEable by
--     anon and therefore bypass everything below: calculate_engagement_score,
--     comms_resolve_role, get_aesthete_matches, get_recommendations,
--     handle_new_user, increment_bounce_count, notify_consumer_confirmation,
--     notify_designer_new_lead, process_style_quiz, resolve_studio_identity,
--     submit_style_quiz. Most only read a profile to make a decision rather than
--     returning one, and get_recommendations/process_style_quiz/
--     resolve_studio_identity are called by the app AS a guest, so they cannot
--     simply be revoked. Each needs its return shape audited for profile
--     columns. Out of scope here; listed so the next migration has the list.
--
-- ── LEDGER STATE, RE-VERIFIED 2026-09-01 AFTER A3 WAS WRITTEN ──────────────
--
-- A3-prod.md records `schema_migrations` jumping 00532 → 00541 and treats
-- 00533–00540 as unapplied. That is no longer true. The ledger now runs
-- 00530…00554 with no gap, and — because the ledger can lie — every object A3
-- named as missing was re-probed and exists: view `client_designer_roster`,
-- table `profile_presence`, functions `get_direct_order_terms`,
-- `notify_client_attention`, `purge_client_account`, column
-- `products.photo_verified_at`. Whoever applies this file must still re-run the
-- gap check immediately before (see 00555_probes.md) — concurrent programs mint
-- numbers in this band — but the specific 00533–00540 hazard is closed.
--
-- Nothing here creates or drops a table, and nothing here touches svc_* or
-- storage.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) public.profiles — stop world-reading 24 rows of PII
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lineage: 00013_profiles_table.sql created "Profiles are viewable by everyone"
-- (`FOR SELECT USING (true)`, no role clause → PUBLIC) with the comment "Users
-- can view all profiles (for directory, search, etc.)". 00183 re-affirmed it
-- deliberately ("availability is world-readable BY DESIGN"). That reasoning
-- predates the iOS app shipping the anon key and predates profiles carrying
-- email, phone, stripe_customer_id and a home ZIP.
--
-- Replacement is four policies. Three are TO authenticated so `anon` never
-- reaches them; the fourth restores the Agent-OS reader that the dropped PUBLIC
-- policy was silently carrying.
--
--   profiles_select_self          the caller's own row
--   profiles_select_counterparty  a row the caller has a working relationship
--                                 with, decided by public.can_view_profile()
--   profiles_select_admin         an admin-domain role holder, mirroring the
--                                 existing "Admins can read all notification
--                                 preferences" policy
--   profiles_select_agent_reader  the NOLOGIN Agent-OS read role
--
-- The counterparty leg is not decoration. Every portal and both iOS apps read
-- other users' profiles through PostgREST EMBEDS — `designer:profiles!designer_id(...)`,
-- `client:profiles!projects_client_id_fkey(...)`, `sender:profiles!sender_id(...)`.
-- An embed resolves against the BASE TABLE under the caller's own RLS; it cannot
-- be pointed at a view. Without a counterparty policy every one of those embeds
-- silently returns null and the product loses names, avatars and client emails
-- across the designer portal, the client portal and both apps.
--
-- can_view_profile is SECURITY DEFINER for the ordinary reason: its predicate
-- joins designer_clients, projects, proposals, comms_thread_participants and
-- organization_members, all of which carry their own RLS that reads back
-- through profiles. Evaluating them as the invoker recurses. Definer + a pinned
-- search_path is the shape 00315_studio_comember_helper.sql already uses for
-- is_studio_comember, which this function calls.
--
-- RULING B2 v3(b), checked in fix round 3 (RF2-01): every leg below is a
-- RELATIONSHIP term — a roster row, a project, a proposal, an invoice, a lead,
-- a direct order, a live scan share, a live thread, a studio or org
-- co-membership. Not one of them reads profiles.role, and none of them should:
-- the question this function answers is "do these two people know each other",
-- which is never a question about a label. The one authority-shaped leg on the
-- table, the admin read, is a separate POLICY (profiles_select_admin) and it
-- reads user_roles. Nothing here needed changing; recorded so the next reviewer
-- does not have to re-derive it.

CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_profile_id IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND (
       p_profile_id = (SELECT auth.uid())

       -- designer ↔ client roster, both directions.
       --
       -- ── RF3-14, fix round 3 pass 3: the row only counts when its
       --    designer_id ACTUALLY HOLDS designer authority ──────────────────
       --
       -- (i-b) closes the legacy roster row on the WRITE side and (i-c) closes
       -- the mint prospectively, but neither touches a row that already exists,
       -- and this leg turned such a row into a full PII READ of the named
       -- client. Measured on a local stack with the rest of this migration
       -- applied, with a designer_clients row planted out of band (the shape a
       -- pre-00555 row has) for a non-designer signup:
       --   GET /rest/v1/profiles?id=eq.<client>&select=id,email,phone → 200, PII
       -- That was the residual reported as "case 7's GET is deliberately still
       -- open" in fix round 3 pass 2. It is not open any more.
       --
       -- The predicate is the same two-signal one every other authority
       -- decision in this file reads (ruling B2 v3(b)): profiles.is_designer,
       -- or a user_roles grant in the designer or admin domain. NEVER
       -- profiles.role — handle_new_user labels every email/password signup
       -- 'designer', so a role leg would re-admit exactly the population RF2-01
       -- removed.
       --
       -- Reading profiles from inside this function is safe and does NOT
       -- recurse: the function is SECURITY DEFINER owned by postgres, which
       -- also owns profiles, so the subquery is not subject to profiles' own
       -- policies. That is the same property (a2)'s helpers rely on; the 42P17
       -- trap only bites an INVOKER-evaluated subquery inside a policy.
       --
       -- This leg is a RELATIONSHIP term and stays one. The clause does not ask
       -- what the CALLER is — a homeowner still reads their own designer, and a
       -- designer still reads their own client. It asks whether the roster row
       -- is a real designer↔client relationship at all.
       OR EXISTS (
         SELECT 1 FROM designer_clients dc
         WHERE (
                (dc.designer_id = (SELECT auth.uid()) AND dc.client_id = p_profile_id)
             OR (dc.client_id  = (SELECT auth.uid()) AND dc.designer_id = p_profile_id)
               )
           AND (
             EXISTS (
               SELECT 1 FROM profiles dp
               WHERE dp.id = dc.designer_id AND dp.is_designer IS TRUE
             )
             OR EXISTS (
               SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = dc.designer_id
                 AND r.domain IN ('designer', 'admin')
             )
           )
       )

       -- a studio teammate's client. people_directory's client branch is
       -- studio-scoped (00420/00421) and already shows a co-member the roster
       -- row itself — client_name, client_email, notes. Resolving that client's
       -- profile is consistent with what the co-member can already read, and
       -- without it people_directory.phone (00478:150, `pr.phone`, which has NO
       -- COALESCE fallback) goes NULL for every teammate's client.
       --
       -- RF3-14 applies HERE TOO, and this leg is the one that made the fix
       -- non-optional. is_studio_comember's FIRST branch is `p_owner =
       -- auth.uid()` (00315), so a row a caller minted for THEMSELVES satisfies
       -- `is_studio_comember(dc.designer_id)` through the self-branch — the
       -- teammate leg was a second, independent route to the same legacy-row
       -- read, and narrowing only the leg above would have left it open.
       OR EXISTS (
         SELECT 1 FROM designer_clients dc
         WHERE dc.client_id = p_profile_id
           AND public.is_studio_comember(dc.designer_id)
           AND (
             EXISTS (
               SELECT 1 FROM profiles dp
               WHERE dp.id = dc.designer_id AND dp.is_designer IS TRUE
             )
             OR EXISTS (
               SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = dc.designer_id
                 AND r.domain IN ('designer', 'admin')
             )
           )
       )

       -- the two named sides of a project, plus its lead designer and creator.
       --
       -- projects.client_profile_id is deliberately NOT in these lists. It is
       -- FK'd to public.client_profiles(id) (`fk_projects_client_profile`), a
       -- table whose id is its own gen_random_uuid() primary key with a
       -- SEPARATE user_id column pointing at auth.users — so it is a disjoint
       -- uuid space from profiles.id and the term could never match. An earlier
       -- draft carried it, along with an index cut for it; both are removed.
       -- projects.client_id is FK'd to profiles(id) and already carries the
       -- client side.
       OR EXISTS (
         SELECT 1 FROM projects pr
         WHERE (SELECT auth.uid()) IN (pr.designer_id, pr.client_id, pr.lead_designer_id, pr.created_by)
           AND p_profile_id       IN (pr.designer_id, pr.client_id, pr.lead_designer_id, pr.created_by)
       )

       -- a seat on the same project team
       OR EXISTS (
         SELECT 1
         FROM project_team_members me
         JOIN project_team_members them ON them.project_id = me.project_id
         WHERE me.user_id = (SELECT auth.uid())
           AND me.removed_at IS NULL
           AND them.user_id = p_profile_id
           AND them.removed_at IS NULL
       )

       -- the two named sides of a proposal, and a seat on the same proposal team
       OR EXISTS (
         SELECT 1 FROM proposals p
         WHERE (SELECT auth.uid()) IN (p.designer_id, p.client_id)
           AND p_profile_id       IN (p.designer_id, p.client_id)
       )
       OR EXISTS (
         SELECT 1
         FROM proposal_team_members me
         JOIN proposal_team_members them ON them.proposal_id = me.proposal_id
         WHERE me.user_id = (SELECT auth.uid())
           AND them.user_id = p_profile_id
       )

       -- the two named sides of an invoice
       OR EXISTS (
         SELECT 1 FROM invoices i
         WHERE (SELECT auth.uid()) IN (i.designer_id, i.client_id)
           AND p_profile_id       IN (i.designer_id, i.client_id)
       )

       -- a lead pairs a homeowner with a designer, but only once the designer
       -- has actually engaged. status 'new' is an unaccepted algorithmic match:
       -- admitting it would let any designer read the profile of every
       -- homeowner the matcher ever pointed at them. The lead row itself
       -- carries contact_name / contact_email, so the accept/decline decision
       -- surface does not need the profile. Live statuses: accepted 26,
       -- declined 1, new 1.
       OR EXISTS (
         SELECT 1 FROM leads l
         WHERE (SELECT auth.uid()) IN (l.homeowner_id, l.designer_id)
           AND p_profile_id       IN (l.homeowner_id, l.designer_id)
           AND l.status <> 'new'
       )

       -- a studio teammate's engaged lead, for the same people_directory reason
       -- as the roster leg above (00478:184, `hp.phone`)
       OR EXISTS (
         SELECT 1 FROM leads l
         WHERE l.homeowner_id = p_profile_id
           AND l.status <> 'new'
           AND public.is_studio_comember(l.designer_id)
       )

       -- a direct order pairs a buying client with the attributed designer;
       -- attribution does not require a designer_clients row, so this leg is
       -- not covered by the roster one above
       OR EXISTS (
         SELECT 1 FROM fulfillment_orders fo
         WHERE (SELECT auth.uid()) IN (fo.client_profile_id, fo.designer_profile_id)
           AND p_profile_id       IN (fo.client_profile_id, fo.designer_profile_id)
       )

       -- a LIVE room-scan share. A pending request or a revoked share is not a
       -- relationship: room_scan_associations rows can be created by the
       -- requesting side, so an unfiltered leg would be the cheapest way to
       -- self-assert access to any profile. Live statuses: active 4.
       OR EXISTS (
         SELECT 1 FROM room_scan_associations rsa
         WHERE (SELECT auth.uid()) IN (rsa.consumer_id, rsa.designer_id)
           AND p_profile_id       IN (rsa.consumer_id, rsa.designer_id)
           AND rsa.status IN ('accepted', 'active')
           AND rsa.revoked_at IS NULL
       )

       -- both still in the same message thread
       OR EXISTS (
         SELECT 1
         FROM comms_thread_participants me
         JOIN comms_thread_participants them ON them.thread_id = me.thread_id
         WHERE me.profile_id = (SELECT auth.uid())
           AND me.left_at IS NULL
           AND them.profile_id = p_profile_id
           AND them.left_at IS NULL
       )

       -- active, non-guest co-membership of the same studio (00315 helper,
       -- 00420/00421 rule)
       OR public.is_studio_comember(p_profile_id)

       -- …and the wider org-roster case is_studio_comember deliberately
       -- excludes. useOrganizationMembers selects members with
       -- `status IN ('active','invited')` and does not filter guests
       -- (packages/supabase/src/hooks/use-organizations.ts:211-215), so
       -- is_studio_comember alone would blank the name of every invited or
       -- guest teammate on the members screen.
       OR EXISTS (
         SELECT 1
         FROM organization_members me
         JOIN organization_members them ON them.organization_id = me.organization_id
         WHERE me.user_id = (SELECT auth.uid())
           AND me.status IN ('active', 'invited')
           AND them.user_id = p_profile_id
           AND them.status IN ('active', 'invited')
       )
     );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_view_profile(uuid) IS
  'True when the calling user has a working relationship with p_profile_id: '
  'roster (incl. a studio teammate''s client), project, project team, proposal, '
  'proposal team, invoice, engaged lead, direct order, LIVE room-scan share, '
  'live message thread, or studio/org co-membership. SECURITY DEFINER because '
  'the predicate reads tables whose own RLS reads back through profiles. '
  'BOTH ROSTER LEGS additionally require the roster row''s designer_id to hold '
  'real designer authority — profiles.is_designer, or a user_roles grant in the '
  'designer or admin domain (RF3-14, fix round 3 pass 3). Without it a '
  'designer_clients row minted before this migration by an ordinary signup, '
  'which (i-c) cannot reach, was a full PII read of the client it named; and '
  'the teammate leg was a second route to the same read, because '
  'is_studio_comember''s first branch is `p_owner = auth.uid()` so a '
  'self-minted row satisfies it. '
  'CAVEAT 1: several of the OTHER linking rows are INSERTable by an ordinary '
  'authenticated user — projects, comms_thread_participants, '
  'project_team_members, room_scan_associations — so this predicate is still '
  'SELF-ASSERTABLE through them: it raises the cost of reading a stranger''s '
  'profile, it does not prevent it. designer_clients is no longer one of them, '
  'on either side: the mint is refused by designer_clients_writer_is_designer '
  'and a legacy row is refused by the authority clause above. CAVEAT 2: admitting '
  'a caller exposes the WHOLE row, including email, phone and '
  'stripe_customer_id, until the PII split (DECISION DM-1 in migration 00555) '
  'lands. CAVEAT 3: it is EXECUTEable by authenticated and lives in the '
  'PostgREST-exposed public schema — a signed-in user can POST '
  '/rest/v1/rpc/can_view_profile with an arbitrary uuid and use it as a '
  'membership ORACLE. It only ever answers about the caller''s own '
  'relationships, so this is accepted for round one; moving the helper to a '
  'non-exposed schema is the fix. Sole intended caller is the '
  'profiles_select_counterparty policy, which cannot work without the EXECUTE '
  'grant (Postgres checks policy-function EXECUTE at executor-init — see 00510).';

-- Supporting index for the one counterparty leg that has no index on the column
-- it filters (verified absent on Strata via pg_indexes). The predicate runs
-- once per candidate row, so an unindexed leg is a sequential scan of
-- fulfillment_orders per profile row returned.
-- fulfillment_orders.designer_profile_id IS FK'd to profiles, so this leg is
-- live and the index earns its keep. An earlier draft also created
-- idx_projects_client_profile; that column is FK'd to client_profiles, the leg
-- that would have used it was dead, and both are gone.
--
-- NOTE FOR THE APPLY: this runs inside the migration's single transaction and
-- is NOT CONCURRENTLY, so it takes an ACCESS EXCLUSIVE lock on
-- fulfillment_orders for the duration. Harmless at production's row counts;
-- named here so it is not discovered mid-apply (KODY-RUNBOOK.md Step 3).
CREATE INDEX IF NOT EXISTS idx_fulfillment_orders_designer_profile
  ON public.fulfillment_orders (designer_profile_id);

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_select_counterparty ON public.profiles;
CREATE POLICY profiles_select_counterparty ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_view_profile(id));

-- Same predicate shape as the existing "Admins can read all notification
-- preferences" policy on notification_preferences. Without it the admin portal
-- loses every profiles read that does NOT go through a service-role route —
-- packages/supabase/src/hooks/use-audit-logs.ts:108 (audit actor names),
-- use-onboarding.ts:208 and :242 (designer applications), use-insights.ts:97
-- (platform-wide profile count). All four use the BROWSER client, so RLS
-- applies to them and nothing else would admit them.
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = (SELECT auth.uid())
      AND r.domain = 'admin'
  ));

-- agent_reader is a NOLOGIN privilege role (docs/agent-os/agent-roles-runbook.md).
-- It read profiles ONLY through the dropped PUBLIC policy, so without this the
-- Agent-OS read path loses profiles silently. Convention copied verbatim from
-- the fulfillment rail, where eleven tables carry
-- `<table>_select_agent_reader FOR SELECT TO agent_reader USING (true)`.
DROP POLICY IF EXISTS profiles_select_agent_reader ON public.profiles;
CREATE POLICY profiles_select_agent_reader ON public.profiles
  FOR SELECT TO agent_reader
  USING (true);

-- The INSERT policy 00013 shipped is `WITH CHECK ((auth.uid() = id) OR
-- (auth.uid() IS NULL))`. anon holds INSERT on the table, so that second leg is
-- a live write hole: an anon caller can insert an arbitrary profiles row.
-- handle_new_user() (the real signup path) is SECURITY DEFINER and owned by
-- postgres, and every invite path uses service_role — neither is subject to
-- this policy, so the leg has no legitimate caller.
--
-- The is_designer pin is the INSERT half of (a2) below, and it is not
-- decorative: is_designer is nullable, so an INSERT may carry it outright.
-- (a2) closes self-elevation on UPDATE; without this, the same elevation is one
-- INSERT away for any live auth.users row that has no profiles row yet — a
-- partially completed delete-account, a backfill gap, a failed trigger. The
-- window is narrow (handle_new_user always writes the row, authenticated has no
-- DELETE after this migration, and profiles_id_fkey stops a fabricated uuid),
-- which is why this is a door matching a window rather than a live hole.
--
-- ROLE IS NOT PINNED TO A VALUE HERE — RULING B2 v3(a), finding RF2-07 — BUT
-- IT IS HELD TO A VOCABULARY. FABLE RULING, fix round 3 pass 3 (RF3-02).
--
-- Fix round 2 pinned `role IS NOT DISTINCT FROM 'homeowner'` on this policy.
-- That was the same category error B2 v3 corrects everywhere else in the file:
-- it treats profiles.role as though it were an authorization input, so the
-- policy has to guess which label the row is entitled to — and it guessed
-- wrong for a designer re-creating their own missing profiles row, and wrong
-- for the client vocabulary ('client', see (i-b)). Under v3 the label carries
-- no authority: designer_clients' restrictive policies read user_roles and
-- is_designer (i-c), the design-request rail reads is_designer, and
-- profiles_select_admin reads user_roles. A caller who inserts their own row
-- with role = 'designer' has stamped a word on it and gained nothing. The one
-- column that WOULD be authority is still pinned.
--
-- What the unpinned column DID cost is a SPOOFING surface, measured in fix
-- round 3 pass 2 (§a4, RF3-02) over HTTP against a live signup JWT whose
-- profiles row had been removed:
--   POST /rest/v1/profiles {"id": self, "role": "vendor"}    → 201, row lands
--   POST /rest/v1/profiles {"id": self, "role": "admin"}     → 201, row lands
--   POST /rest/v1/profiles {"id": self, "is_designer": true} → 403 (pin holds)
-- `role = 'vendor'` puts the caller in the designer portal's comms vendor
-- picker (§a4's list_vendor_profiles), and `role = 'admin'` makes
-- comms_resolve_role (00103) print `admin` beside their name in a thread.
-- Neither grants anything — the words are labels — but both let an account
-- wear a title it was never given.
--
-- ⚠ THE RULING, taken this pass: add the VOCABULARY guard
--   role IN ('homeowner', 'client', 'designer')
-- and nothing more. It is a vocabulary check, not an authority check, so it
-- does not read on B2 v3(a)'s prohibition, and it deliberately does NOT pin the
-- column to its current value: there is no current value to read on an INSERT,
-- and pinning to a literal is exactly the guess RF2-07 removed. All three
-- strings are the labels the product legitimately writes — 'homeowner' and
-- 'client' are the two halves of the client vocabulary (ruling B2 v3(e)) and
-- 'designer' is handle_new_user's own column default, which case 6f of the test
-- requires to keep landing. 'vendor' and 'admin' are the two the guard removes.
-- `is_designer IS NOT TRUE` is unchanged and is still the only AUTHORITY pin
-- on this leg.
--
-- It breaks nothing: no legitimate authenticated INSERT of a profiles row
-- exists in the codebase at all — every profile write outside handle_new_user()
-- is an adminClient / edge-function upsert as service_role (admin-portal
-- users + applications onboard, designer-portal clients/invite,
-- designer-invite, workspace-member-invite), all BYPASSRLS — and
-- handle_new_user is SECURITY DEFINER, so its own 'designer' default is not
-- subject to this policy either way.
--
-- The W2 role-vocabulary reconciliation (see (i-b)) is still where the split
-- itself should die; this guard is what stops the list growing in the meantime.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND is_designer IS NOT TRUE
    AND role IN ('homeowner', 'client', 'designer')
  );

COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS
  'A caller may insert their OWN profiles row. The window is narrow — '
  'handle_new_user writes the row inside the auth.users insert for every '
  'account the platform creates, so this leg is only reachable after a failed '
  'trigger, a partial delete-account or a backfill gap — and the policy holds '
  'two things inside it. is_designer IS NOT TRUE is the AUTHORITY pin (the '
  'column 00286/00330/00285 and search_shareable_designers read). '
  'role IN (''homeowner'',''client'',''designer'') is a VOCABULARY guard, added '
  'in 00555''s third fix round (RF3-02): the column was previously unpinned, '
  'and a caller in that window could land role = ''vendor'' (putting themselves '
  'in the comms vendor picker) or role = ''admin'' (making comms_resolve_role '
  'print admin beside their name). It grants nothing either way — profiles.role '
  'is a LABEL, ruling B2 v3(a) — so this closes a SPOOFING surface, not an '
  'escalation. The guard is a vocabulary check and NOT a pin to the current '
  'value: there is no OLD row on an INSERT, and pinning to a literal is the '
  'guess RF2-07 removed. Reconciling the ''homeowner''/''client'' split is a W2 '
  'migration.';

-- ⚠ THE SIBLING INSERT POLICY, 00017's "Designers can create homeowner
-- profiles", USED TO BE RECREATED HERE. It has MOVED to (a2)(i-b2), below the
-- helper it now calls: fix round 3 pass 3 gave it the same caller-authority
-- predicate as its UPDATE sibling (RF3-13), that predicate calls
-- public.current_profile_is_designer(), and Postgres resolves a policy's
-- functions at CREATE POLICY time — so it cannot be created before (a2) defines
-- the helper. Nothing about it is optional: the verification block at the foot
-- of this file asserts it exists (RF3-05) and asserts every one of its pins.

-- Grant hygiene, mirroring 00510: a grant no caller may use is a grant waiting
-- for a policy mistake. REVOKE ALL PRIVILEGES rather than an enumerated list —
-- PG 17.6 adds MAINTAIN, which an enumerated REVOKE silently leaves behind
-- (has_table_privilege(…, 'MAINTAIN') is live on this cluster; verified).
REVOKE ALL PRIVILEGES ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- authenticated holds DELETE on profiles with no DELETE policy to use it. RLS
-- blocks it today; the grant is the same latent hazard as the anon ones. Row
-- deletion happens via the delete-account edge function as service_role.
REVOKE DELETE ON public.profiles FROM authenticated;

-- RF2-09. The same argument, one step further. `GRANT SELECT, INSERT, UPDATE`
-- above is additive — it does not clear what the pre-flip creation default
-- already handed `authenticated`, which on Strata is the full `arwdDxtm` set.
-- TRUNCATE is not row-level and RLS does NOT constrain it: a grantee with
-- TRUNCATE empties public.profiles in one statement, policies or no policies.
-- REFERENCES lets a grantee point a new FK at profiles and then pin rows
-- against deletion. Neither has a caller — every legitimate DDL-adjacent write
-- is postgres or service_role. TRIGGER and MAINTAIN are left alone: they are
-- not reachable through PostgREST at all and clearing them here would be a
-- change this migration cannot test.
REVOKE TRUNCATE, REFERENCES ON public.profiles FROM authenticated;

-- ─── (a2) profiles.role AND profiles.is_designer: close the self-elevation ──
-- ───      the UPDATE policies leave open                                    ──
--
-- 00013_profiles_table.sql:60-61 shipped
--     CREATE POLICY "Users can update own profile" ON profiles
--       FOR UPDATE USING (auth.uid() = id);
-- No WITH CHECK and no column restriction. Combined with the UPDATE grant three
-- lines above, ANY authenticated user can set their own profiles.is_designer to
-- true — the column the design-request pool actually reads as authority — and
-- their own profiles.role to anything at all.
--
-- ── HOW RULING B2 v3 RESHAPES THIS SECTION ─────────────────────────────────
--
-- v1 and v2 of this section argued that role was an escalation path and had to
-- be frozen, and moved the signup default into handle_new_user to compensate.
-- v3 says the first half of that was a category error: **profiles.role is a
-- LABEL, never an authorization input.** Nothing in the schema grants anything
-- because role says 'designer' — the design-request rail (00286/00330/00285)
-- reads is_designer, profiles_select_admin reads user_roles, and after RF2-01
-- so do the designer_clients restrictive policies in (i-c). So freezing role
-- bought no security, and it cost the one thing the product needs: A3-07's fix.
--
-- A3-07 is that an Apple/Google sign-up lands profiles.role = 'designer',
-- because supabase-swift's signInWithIdToken and signInWithOAuth carry no
-- `data:` parameter and so cannot send the 'homeowner' hint the email path
-- sends. v3 fixes it where it belongs — in the client, which is the only party
-- that knows the sign-in came from the Patina app — by allowing exactly one
-- self-write of the column: a DOWNGRADE.
--
-- Fix, in three parts:
--   (i)  the client may update its own row, may NOT raise its own is_designer,
--        and may change its own role in ONE direction only — to 'homeowner'
--        (i-a) — on either of the table's two permissive UPDATE policies (i-b);
--   (ii) handle_new_user keeps the pre-00555 'designer' default (B2 v3(a)), so
--        nothing about the portals' own signup changes;
--   (iii) the two paths that KNOW a new account is a client do the downgrade:
--        the iOS app after Apple/Google sign-in (B2 v3(c), W1 · L1-A, contract
--        in build/waves/w1/l1-a-notes.md) and client-invite's accept handler as
--        service_role (B2 v3(d)).
-- The pin has to read the caller's CURRENT role, and a WITH CHECK sees only
-- the NEW row — there is no OLD in a WITH CHECK. Reading public.profiles
-- inline is therefore the obvious shape and it does not work: the subquery is
-- evaluated as the INVOKER, so it re-enters profiles' own policies and
-- Postgres raises `42P17 infinite recursion detected in policy for relation
-- "profiles"` on the owner's very first display-name write. (Reproduced on a
-- fresh local stack, 2026-09-02, before this helper existed.) The read has to
-- bypass RLS, which means SECURITY DEFINER — the same reason can_view_profile
-- above is one.
--
-- It returns the PRE-update value, which is what "pin" needs: the function is
-- STABLE, so it runs on the calling statement's snapshot, and the UPDATE's own
-- new tuple carries the current command id and is invisible to that snapshot.
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role FROM profiles p WHERE p.id = (SELECT auth.uid());
$$;

-- Postgres checks policy-function EXECUTE at executor-init (see 00510), so the
-- grant is not optional — without it the policy below denies every update.
REVOKE EXECUTE ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

COMMENT ON FUNCTION public.current_profile_role() IS
  'The calling user''s own profiles.role, read past RLS. Exists solely so the '
  '"Users can update own profile" WITH CHECK can hold the role column to '
  '"unchanged, or downgraded to homeowner" without the inline subquery that '
  'made the policy self-recursive (42P17). Returns only the caller''s own row, '
  'so being PostgREST-exposed to authenticated tells a caller nothing it could '
  'not already read. Added 00555.';

-- (i-a) profiles.is_designer, pinned by the SAME mechanism and for a stronger
-- reason than role.
--
-- profiles.role is a label. profiles.is_designer is AUTHORITY, and it is the
-- column the designer-side RPCs actually read:
--   00286 claim_design_request           IF NOT EXISTS (… p.id = auth.uid() AND p.is_designer)
--   00286 open_design_requests (view)    in-body is_designer EXISTS — the pool gate
--   00330 accept_design_request          same EXISTS guard
--   00285 design_request_submit          rejects a designer_id whose profile is not is_designer
--   _can_manage_configurable_product     same shape
--   00555 §a3 search_shareable_designers p.is_designer IS TRUE
-- It is written server-side by 00290's fc_sync_is_designer_from_role trigger
-- (SECURITY DEFINER, off a user_roles grant) and by the two service_role edge
-- functions designer-invite and workspace-member-invite. There is no legitimate
-- client write of it anywhere: grep over apps/, packages/ and
-- supabase/functions/ finds the column only in reads, CodingKeys and comments.
--
-- Pinning role alone would therefore have closed the label and left the
-- authority open: an authenticated homeowner could PATCH is_designer = true and
-- walk straight into the open design-request pool. The pin is the same shape as
-- role's, and it needs the same SECURITY DEFINER helper for the same reason —
-- an inline `SELECT is_designer FROM public.profiles WHERE id = auth.uid()`
-- inside the WITH CHECK is evaluated as the INVOKER and re-enters profiles'
-- own policies, raising 42P17 on the owner's first display-name write, exactly
-- as the role pin did before current_profile_role() existed.
CREATE OR REPLACE FUNCTION public.current_profile_is_designer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.is_designer FROM profiles p WHERE p.id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_is_designer() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_profile_is_designer() TO authenticated;

COMMENT ON FUNCTION public.current_profile_is_designer() IS
  'The calling user''s own profiles.is_designer, read past RLS. Exists solely '
  'so the "Users can update own profile" WITH CHECK can pin the designer '
  'authority column without the inline subquery that makes the policy '
  'self-recursive (42P17). Returns only the caller''s own row. Added 00555.';

-- RULING B2 v3(c). The WITH CHECK is a RATCHET, not a freeze: each column is
-- either unchanged, or moved one step DOWN.
--
--   role         unchanged, or set to 'homeowner'
--   is_designer  unchanged, or set to false
--
-- Written as `x IS NOT DISTINCT FROM <current> OR x = <floor>` rather than the
-- `x IN (<current>, <floor>)` the ruling states in prose, because the two are
-- not equivalent under NULL and the difference is a live outage. profiles.role
-- is NOT NULL, but profiles.is_designer is NULLABLE, and `NULL IN (NULL, false)`
-- evaluates to NULL — which a WITH CHECK treats as a refusal. A legacy row with
-- is_designer NULL would therefore have been unable to write its own
-- display_name. The IS NOT DISTINCT FROM leg is NULL-safe and does the same job.
--
-- Why 'homeowner' is a safe destination and not a hole: the label grants
-- nothing (see the section header), and the authority columns are still pinned
-- upward — is_designer can only fall, and user_roles is not writable from here
-- at all. There is no role string a caller can reach through this policy that
-- admits them anywhere. Setting role = 'homeowner' on a real designer's own row
-- is self-harm, not escalation; it costs them their own comms label
-- (comms_resolve_role, 00103) and nothing else, and only they can do it.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING  ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND (
      role IS NOT DISTINCT FROM public.current_profile_role()
      OR role = 'homeowner'
    )
    AND (
      is_designer IS NOT DISTINCT FROM public.current_profile_is_designer()
      OR is_designer = false
    )
  );

COMMENT ON POLICY "Users can update own profile" ON public.profiles IS
  'Owner may update their own row. WITH CHECK is a one-way RATCHET on the two '
  'identity columns (ruling B2 v3(c)): profiles.role may only stay as it is or '
  'become ''homeowner'', and profiles.is_designer may only stay as it is or '
  'become false. Never upward. is_designer is the one that carries AUTHORITY — '
  'it is the column the design-request pool (00286), accept_design_request '
  '(00330) and search_shareable_designers read; profiles.role is a LABEL and '
  'grants nothing. The self-downgrade leg exists so the iOS app can correct '
  'A3-07 after an Apple/Google sign-in (W1 · L1-A: PATCH role=''homeowner'' on '
  'its own row, once, idempotent) without needing the wide-open USING-only '
  'policy 00013 shipped. Both legs use IS NOT DISTINCT FROM, not IN, because '
  'is_designer is nullable and a NULL inside an IN list refuses the owner''s '
  'own no-op write. Added 00555 (was USING-only since 00013).';

-- (i-b) the SIBLING policy, without which (i) is decorative.
--
-- profiles carries a SECOND permissive UPDATE policy, "Designers can update
-- their client profiles" (00017:19): FOR UPDATE, TO PUBLIC, USING the
-- designer_clients EXISTS below, and NO WITH CHECK. Postgres ORs the permissive
-- WITH CHECKs for an UPDATE, and a policy whose WITH CHECK is NULL reuses its
-- own USING as the check — so the new row need satisfy only ONE of the two
-- policies, and the role pin in (i) is skipped entirely.
--
-- The roster row that satisfies it is self-servable: designer_clients' own
-- policy is FOR ALL / TO PUBLIC / USING (auth.uid() = designer_id) with no
-- WITH CHECK (00014:110), and authenticated holds INSERT. Reproduced on a local
-- stack with the rest of this migration applied, as a seeded homeowner:
--   UPDATE profiles SET role='designer'      -> RLS denial
--   INSERT designer_clients(self, self)      -> INSERT 0 1
--   UPDATE profiles SET role='designer'      -> UPDATE 1, role = designer
--
-- The check below is not new policy: it is the check this policy's own INSERT
-- sibling has carried since the same file — "Designers can create homeowner
-- profiles" is WITH CHECK (auth.uid() IS NOT NULL AND role = 'homeowner').
-- A designer may edit a roster client's row; they may not turn that client into
-- a designer, a vendor or an admin, and they may not turn THEMSELVES into one
-- by rostering themselves.
--
-- NOT a trigger: service_role bypasses RLS but not triggers, and neither do the
-- SECURITY DEFINER functions on the invite/onboarding rail (00551-00554) that
-- legitimately set profiles.role — auth.role() reads 'authenticated' inside
-- them, so a JWT-based exemption cannot tell them from a client write.
-- NOT a RESTRICTIVE policy comparing role to current_profile_role(): that
-- compares the TARGET row's new role to the CALLER's role, and would deny every
-- legitimate designer edit of a client profile.
--
-- THE PIN IS ON THE OLD ROW, NOT ON A LITERAL — and that distinction is the
-- whole fix. An earlier cut of this migration pinned the WITH CHECK to the
-- literals `role = 'homeowner' AND is_designer IS NOT TRUE`, which a DEMOTION
-- satisfies by construction. Reproduced over HTTP on a local stack, as the
-- seeded homeowner client@patina.dev against the seeded designer Leah:
--   POST  /rest/v1/designer_clients {designer_id: self, client_id: <Leah>} → 201
--   PATCH /rest/v1/profiles?id=eq.<Leah> {"role":"homeowner","is_designer":false} → 204
--   PATCH /rest/v1/profiles?id=eq.<Leah> {"display_name":"PWNED"}                → 204
-- Leah went from `designer | t | Leah Hartwell` to `homeowner | f | PWNED`,
-- which strips exactly the authority the rest of this section defends
-- (search_shareable_designers, open_design_requests, claim/accept_design_request
-- all read is_designer) and corrupts the name every surface renders.
--
-- The fix is to put the two column predicates in the USING clause as well. An
-- UPDATE policy's USING sees the OLD row — there is no OLD in a WITH CHECK,
-- which is why (i-a) needed a SECURITY DEFINER helper, and why this policy does
-- not: the target row here is not the caller's own, so the OLD value is right
-- there. USING makes the policy select only rows that are ALREADY a homeowner
-- with no designer authority; WITH CHECK keeps them that way. A designer, an
-- admin or a vendor on someone's roster is not a row this policy can touch at
-- all, in either direction.
--
-- ── AND THE CALLER'S OWN AUTHORITY, added in fix round 3 pass 2 (RF3-03) ───
--
-- Everything above is about the TARGET row. Until this pass the policy asked
-- nothing at all about the CALLER: a roster row plus `dc.designer_id =
-- auth.uid()` was the entire admission test. The restrictive policies in (i-c)
-- close the MINT prospectively, but this migration deliberately does not touch
-- rows that already exist — so every roster row minted before 00555 by an
-- account that is not a designer would have kept the profile-write and (through
-- can_view_profile's roster leg) the PII read.
--
-- Measured on a local stack with the rest of this migration applied, with a
-- designer_clients row planted as service_role for a non-designer signup:
--   PATCH /rest/v1/profiles?id=eq.<homeowner> {"display_name":"…"}  → 200, renamed
--   GET   /rest/v1/profiles?id=eq.<homeowner>&select=id,email,phone → 200, PII
--
-- So the USING and the WITH CHECK now both carry the SAME two-signal authority
-- predicate the designer_clients restrictive policies read (ruling B2 v3(b)):
-- profiles.is_designer, or a user_roles grant in the designer or admin domain.
-- Never profiles.role — handle_new_user labels every email/password signup
-- 'designer', so a role leg here would re-admit exactly the population RF2-01
-- removed. The EXISTS is inline and invoker-evaluated over the caller's OWN
-- user_roles rows, the same shape profiles_select_admin above already uses.
--
-- ── WHAT THE LEGACY ROW STILL BUYS, STATED EXACTLY (corrected RF3-14) ──────
--
-- Fix round 3 pass 2 wrote "this makes the legacy-row exposure a lockout rather
-- than a capability" here, and pass 2's own attack matrix contradicted it three
-- lines later: the WRITE answered `200 []` and the READ answered
-- `200 [{id, email, phone}]`. The predicate above closes one half. Say both:
--
--   CLOSED, WRITE  — this policy. A pre-00555 roster row owned by an account
--                    with no designer authority no longer selects the client's
--                    profiles row, in either clause, so it buys no rename and
--                    no invoice-email rewrite. Test case 7m.
--   CLOSED, READ   — can_view_profile's two roster legs, which since RF3-14
--                    require the roster row's designer_id to hold the same two
--                    signals. Without that the same row was still a full-row
--                    PII read of the client it named (email, phone,
--                    stripe_customer_id). Test case 7m3.
--   STILL THERE    — THE ROW ITSELF. This migration deletes no data: the
--                    designer_clients row survives, keeps satisfying every
--                    other predicate in the schema that merely joins the table
--                    (public.client_designer_roster, people_directory's client
--                    branch, the 00224 storage policy), and still counts toward
--                    a designer's client list the day its owner is granted real
--                    authority. Removing it is a DATA job, not a policy one:
--                    KODY-RUNBOOK B7a is the read-only audit that says whether
--                    production carries any such row (now a HARD STOP before
--                    B5, because the same accounts lose the mint, the write and
--                    the read at once, and one user_roles grant restores all
--                    three), and B7b is the accompanying one-time backfill.
--
-- Nothing above needs a data change to take effect, and nothing above is
-- reversible by the row's owner.
--
-- What this does NOT close, stated rather than implied: a caller who really IS
-- a designer can still roster an arbitrary homeowner (designer_clients accepts
-- any client_id) and rewrite that homeowner's columns. RF3-04 corrected the
-- earlier wording here, which called those "non-authority columns" and so read
-- as cosmetic. They are not. profiles.email is the FIRST-CHOICE invoice
-- recipient: supabase/functions/invoice-send/index.ts:204 resolves
-- `invoice.client?.email` and only falls back to designer_clients.client_email
-- when that is null, and invoice-reminders and stripe-webhook resolve in the
-- same order. So the residual is invoice-recipient REDIRECTION plus a phone
-- rewrite, not a display-name nuisance. It is strictly narrower than the
-- pre-00555 posture, where any authenticated account at all could do it, which
-- is why it is a tracked W2 item and not a blocker on this file. The W2 fix is
-- COLUMN-scoped, and that scope is the point: a designer edits display/notes
-- fields on a rostered client, never email, phone or stripe_customer_id. What
-- this file DOES close is the same trick run by a non-designer — prospectively
-- through (i-c), and now retrospectively through the predicate above — and the
-- demotion of any designer by anyone.
-- RULING B2 v3(e), finding RF2-06: the client vocabulary is TWO strings, not
-- one, so `role = 'homeowner'` alone was too narrow. The evidence, all of it
-- checkable on a local stack:
--   • public.profiles.role carries NO CHECK constraint and no enum — the only
--     constraint on the table is profiles_availability_status_check. Any string
--     at all is a legal value, so a policy cannot assume a closed set.
--   • public.comms_resolve_role (00103:37-42) is the one function that
--     INTERPRETS the column, and its client branch is `ELSE 'client'` — every
--     role that is not admin/designer/vendor is a client to the comms rail.
--   • public.roles carries a `client` row in the `consumer` domain beside
--     `app_user`, and this migration's own test fixture uses it: `Cleo`,
--     `role = 'client'`, is Dana's rostered client in
--     supabase/tests/rls/00555_ios_round_one_security.test.sql.
-- With the single literal in the USING clause, a designer whose client row says
-- 'client' could not edit that client's display_name AT ALL: the policy would
-- not select the row, the PATCH would answer 200 [] and the rename would
-- silently do nothing. Both clauses therefore read
-- `role IN ('homeowner', 'client')`.
--
-- ⚠ W2: THE SPLIT ITSELF IS THE BUG. Two strings mean the same thing here and
-- nothing decides which one a row gets — handle_new_user writes 'homeowner' for
-- a hinted signup and 'designer' otherwise, /api/auth/invite/accept and the
-- admin onboard paths write their own, client-invite's accept handler now
-- writes 'homeowner' (B2 v3(d)), and 00017's INSERT sibling still pins the
-- single literal 'homeowner'. Reconciling the vocabulary (one string, a
-- backfill, and a CHECK constraint or an enum) is a W2 migration, filed here so
-- the next reader does not have to rediscover that this list is a workaround.
DROP POLICY IF EXISTS "Designers can update their client profiles" ON public.profiles;
CREATE POLICY "Designers can update their client profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    (
      public.current_profile_is_designer() IS TRUE
      OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.domain IN ('designer', 'admin')
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.client_id = profiles.id
        AND dc.designer_id = (SELECT auth.uid())
    )
    AND role IN ('homeowner', 'client')
    AND is_designer IS NOT TRUE
  )
  WITH CHECK (
    (
      public.current_profile_is_designer() IS TRUE
      OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.domain IN ('designer', 'admin')
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.client_id = profiles.id
        AND dc.designer_id = (SELECT auth.uid())
    )
    AND role IN ('homeowner', 'client')
    AND is_designer IS NOT TRUE
  );

COMMENT ON POLICY "Designers can update their client profiles" ON public.profiles IS
  'A designer may edit a profile on their designer_clients roster. BOTH clauses '
  'open with the CALLER''S OWN authority — profiles.is_designer, or a user_roles '
  'grant in the designer or admin domain, never profiles.role (ruling B2 v3(b), '
  'finding RF3-03). Without it the roster row was the whole admission test, and '
  'this migration deliberately does not delete roster rows that already exist — '
  'so every pre-00555 row minted by a non-designer kept a profile write and, '
  'through can_view_profile''s roster leg, a PII read. The restrictive policies '
  'on designer_clients close the MINT; this predicate closes the legacy row''s '
  'WRITE; can_view_profile''s matching roster-leg predicate (RF3-14) closes its '
  'READ. The ROW ITSELF is untouched by all three and is cleaned, if production '
  'carries any, by KODY-RUNBOOK B7a/B7b. '
  'BOTH clauses then also '
  'carry role IN (''homeowner'',''client'') AND is_designer IS NOT TRUE: the '
  'USING half reads the OLD row, so a designer, admin or vendor on a roster is '
  'not selectable by this policy at all and cannot be demoted or renamed '
  'through it; the WITH CHECK half reads the NEW row, so an editable client '
  'cannot be promoted, and cannot be relabelled out of the client vocabulary '
  'either. Pinning only the WITH CHECK to literals — the 2026-09-02 first cut — '
  'left demotion wide open, because a demotion satisfies them. The two-string '
  'client vocabulary is ruling B2 v3(e): profiles.role has no CHECK constraint, '
  'comms_resolve_role (00103) treats every non-admin/designer/vendor role as a '
  'client, and public.roles carries a ''client'' row — so ''homeowner'' alone '
  'made a designer unable to rename a client whose row says ''client''. '
  'Reconciling the split is a W2 migration. The '
  'is_designer half is the authority the design-request pool (00286/00330) '
  'reads. Without a WITH CHECK at all this policy fell back to its USING and '
  'became an OR-branch around the pins on "Users can update own profile". '
  'Re-scoped to authenticated (was PUBLIC) in 00555.';

-- ─── (i-b2) the INSERT sibling of the policy above — RF3-13 ───────────────
--
-- 00017's "Designers can create homeowner profiles" is recreated HERE, and not
-- up in section (a) beside "Users can insert own profile" where the rest of the
-- profiles INSERT work lives, for one mechanical reason: the caller-authority
-- predicate below calls public.current_profile_is_designer(), Postgres resolves
-- a policy's functions at CREATE POLICY time, and (i-a) is where that helper is
-- created. Section (a) carries a pointer saying so.

-- The policy is restricted to callers who HOLD DESIGNER AUTHORITY, by the same
-- two-signal predicate everything else in this file uses (ruling B2 v3(b)):
-- profiles.is_designer, or a user_roles grant in the designer or admin domain.
-- Never profiles.role — handle_new_user labels every email/password signup
-- 'designer', so a role leg here would hand this policy straight back to
-- anyone who can complete a signup form, which is the same defect RF2-01
-- removed from designer_clients and RF3-03 removed from the UPDATE sibling.
--
-- Without the caller predicate this was the last INSERT route by which a
-- self-signup could plant a profiles row at an ARBITRARY id — the id half of
-- CAVEAT 1 — and, paired with (i-b), plant one it could then keep editing. The
-- arbitrary-id half is still not narrowed (a designer may legitimately create a
-- client's row before that client has an auth.users row of their own), but the
-- population that can reach it is now real designers rather than every account
-- on the platform.
--
-- And the created row is held to the CLIENT vocabulary plus the authority pin:
--   role IN ('homeowner', 'client')   ruling B2 v3(e) — the same two strings
--                                     the UPDATE sibling reads (i-b), because
--                                     profiles.role carries no CHECK constraint
--                                     and comms_resolve_role (00103) treats
--                                     every non-admin/designer/vendor label as
--                                     a client. 'homeowner' alone was 00017's
--                                     literal and it is too narrow for the same
--                                     reason RF2-06 found it too narrow there.
--   is_designer IS NOT TRUE           a designer may create a client, never
--                                     another designer.
-- Also re-scoped from PUBLIC to authenticated; anon no longer holds INSERT on
-- this table at all, so the re-scope is a statement of intent.
DROP POLICY IF EXISTS "Designers can create homeowner profiles" ON public.profiles;
CREATE POLICY "Designers can create homeowner profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      public.current_profile_is_designer() IS TRUE
      OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.domain IN ('designer', 'admin')
      )
    )
    AND role IN ('homeowner', 'client')
    AND is_designer IS NOT TRUE
  );

COMMENT ON POLICY "Designers can create homeowner profiles" ON public.profiles IS
  'A designer adding a client may insert a profiles row for them. The WITH '
  'CHECK now opens with the CALLER''S OWN authority — profiles.is_designer, or '
  'a user_roles grant in the designer or admin domain, never profiles.role '
  '(ruling B2 v3(b), finding RF3-13). 00017 shipped this policy TO PUBLIC with '
  '`auth.uid() IS NOT NULL AND role = ''homeowner''`, so its name said '
  '"Designers" and its predicate said "anyone signed in": it was the last '
  'INSERT route by which a self-signup could plant a profiles row at an '
  'arbitrary id. It then holds the created row to the client vocabulary, '
  'role IN (''homeowner'',''client'') (ruling B2 v3(e) — the same two strings '
  'the UPDATE sibling reads, because comms_resolve_role treats every '
  'non-admin/designer/vendor label as a client), AND to is_designer IS NOT TRUE '
  '(00555): a designer may create a client, never another designer. Without '
  'that second pin this policy ORs around the is_designer pin on "Users can '
  'insert own profile" and any authenticated caller can mint a '
  'designer-authority row. Re-scoped to authenticated (was PUBLIC) in 00555. '
  'The ARBITRARY-ID half is deliberately unchanged — a designer may create a '
  'client''s row before that client has an account — and is CAVEAT 1 in this '
  'file; what changed is that only real designer authority can reach it.';

-- ─── (i-c) the ENABLING PRIMITIVE: who may mint a designer_clients row ─────
--
-- Everything in (i-b) is damage control over a roster row an attacker writes
-- themselves. public.designer_clients carries TWO permissive write policies and
-- neither asks whether the writer is a designer:
--   00014:110 "Designers can manage their clients" — FOR ALL, TO PUBLIC,
--             USING (auth.uid() = designer_id), NO WITH CHECK (so it reuses
--             its USING as the check);
--   00316:39  "designer_clients_studio_rw"        — FOR ALL, TO authenticated,
--             USING/WITH CHECK is_studio_comember(designer_id), and
--             is_studio_comember's FIRST branch is `p_owner = auth.uid()`.
-- So `INSERT INTO designer_clients (designer_id, client_id) VALUES (me, anyone)`
-- succeeds for ANY authenticated account, including a homeowner who has never
-- been near a studio. That single row is what admits the caller to the sibling
-- policy above, to can_view_profile's roster leg, and to every other predicate
-- in the schema that resolves a relationship through designer_clients.
--
-- A RESTRICTIVE policy rather than an edit to the two permissive ones: Postgres
-- ANDs restrictive policies onto the OR of the permissive set, so this holds no
-- matter which permissive leg admitted the row and survives a future migration
-- that adds a third. Scoped to INSERT and UPDATE — the write legs that mint or
-- re-point the relationship. SELECT is deliberately untouched: 00536 already
-- ruled that the client's own read goes through the public.client_designer_roster
-- view rather than a base-table policy, and narrowing SELECT here would be a
-- second, unrelated change.
--
-- ── THE PREDICATE, AND WHY IT DOES NOT READ profiles.role (RF2-01) ────────
--
-- RULING B2 v3(b): authority comes only from public.user_roles
-- (roles.domain IN ('designer','admin')) or profiles.is_designer. Both are
-- written exclusively by service_role or by SECURITY DEFINER paths —
-- user_roles by the admin portal, the invite edge functions and 00552's
-- onboarding rail; is_designer by 00290's fc_sync_is_designer_from_role
-- trigger, which fires off a DESIGNER-DOMAIN user_roles grant, and by
-- designer-invite / workspace-member-invite. Neither is reachable from a client
-- write: the profiles UPDATE policy above lets is_designer fall and never rise,
-- and nothing in the schema lets an authenticated caller INSERT into user_roles.
--
-- Fix round 2 shipped this predicate with a third leg,
-- `current_profile_role() IN ('designer','admin','super_admin')`, on the
-- argument that a portal self-signup carries role = 'designer' before any grant
-- lands and would otherwise be locked out of its own Add Client flow. That leg
-- is the whole vulnerability. handle_new_user gives EVERY email/password signup
-- role = 'designer' (B2 v3(a) restores exactly that default), so the leg reads:
-- *anyone who can complete a signup form may mint a roster row* — which is the
-- primitive (i-b) exists to contain, restored by the policy meant to close it.
-- It is not even a hard case: the "locked-out self-signup designer" is not a
-- designer yet by any measure the rest of the schema accepts. The same account
-- is refused by claim_design_request (00286), accept_design_request (00330),
-- design_request_submit (00285) and search_shareable_designers, all of which
-- read is_designer. Admitting it HERE and nowhere else would have been the
-- inconsistency, not the fix. A designer becomes one when an invite or an admin
-- grant lands — that is a real event, and it sets both signals.
--
-- The user_roles leg is not redundant with is_designer even though 00290's
-- trigger syncs one from the other: the trigger is AFTER INSERT ON user_roles
-- and a row that predates 00290, or one written while the trigger was dropped,
-- carries the grant with is_designer still false. Reading both is the belt to
-- the trigger's braces. `domain IN ('designer','admin')` rather than a name
-- list because names change and domains do not — public.roles carries
-- independent_designer / studio_admin / studio_designer / studio_owner in the
-- designer domain and ml_operator / quality_control / super_admin /
-- support_agent in admin.
--
-- The EXISTS is inline rather than a helper for the same reason
-- profiles_select_admin's is: it is evaluated as the INVOKER, over the caller's
-- OWN user_roles rows, which the caller can already read. No new SECURITY
-- DEFINER surface, and nothing to grant.
DROP POLICY IF EXISTS designer_clients_writer_is_designer ON public.designer_clients;
CREATE POLICY designer_clients_writer_is_designer ON public.designer_clients
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_profile_is_designer() IS TRUE
    OR EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.domain IN ('designer', 'admin')
    )
  );

DROP POLICY IF EXISTS designer_clients_updater_is_designer ON public.designer_clients;
CREATE POLICY designer_clients_updater_is_designer ON public.designer_clients
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    public.current_profile_is_designer() IS TRUE
    OR EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.domain IN ('designer', 'admin')
    )
  )
  WITH CHECK (
    public.current_profile_is_designer() IS TRUE
    OR EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.domain IN ('designer', 'admin')
    )
  );

COMMENT ON POLICY designer_clients_writer_is_designer ON public.designer_clients IS
  'RESTRICTIVE: only a designer may create a roster row. Both permissive write '
  'policies on this table (00014 "Designers can manage their clients", 00316 '
  '"designer_clients_studio_rw") are satisfied by designer_id = auth.uid(), so '
  'before 00555 any authenticated account could mint the relationship row that '
  'admits it to "Designers can update their client profiles" on profiles and to '
  'can_view_profile''s roster leg. The predicate reads ONLY the two authority '
  'signals — profiles.is_designer, and a user_roles grant in the designer or '
  'admin domain — never profiles.role (ruling B2 v3(b), finding RF2-01): '
  'handle_new_user gives every email/password signup role = ''designer'', so a '
  'role leg here would hand the mint back to anyone who can complete a signup '
  'form. Added 00555.';

COMMENT ON POLICY designer_clients_updater_is_designer ON public.designer_clients IS
  'RESTRICTIVE: only a designer may re-point an existing roster row. Same '
  'predicate and same reasoning as designer_clients_writer_is_designer — '
  'profiles.is_designer or a designer/admin-domain user_roles grant, never '
  'profiles.role. The INSERT leg is the mint, this one stops a legacy row being '
  'aimed at a new client_id by a caller who is no longer (or never was) a '
  'designer. Added 00555.';

-- Grant hygiene on this table, the same argument as profiles above (RF2-08).
-- anon holds the full arwdDxtm set on public.designer_clients, inherited from
-- the pre-flip creation default: SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER and PG 17's MAINTAIN, on the table that decides who is
-- whose client. The WRITE half has no caller in any environment and is the
-- hazard — an anon INSERT is the roster-mint primitive (i-c) closes for
-- authenticated callers, reachable with the key that ships in the iOS binary.
--
-- ⚠ THE SELECT IS LOAD-BEARING, AND NOT FOR A CALLER OF THIS TABLE. The first
-- cut of this revoke took SELECT too, on the strength of a grep over apps/,
-- packages/ and supabase/functions/ that found zero anon-key reads — which is
-- true, and was the wrong place to look. `storage.objects` carries the policy
-- "Designers manage discovery folio objects" (00224:165), whose USING clause
-- reads designer_clients, and Postgres checks the ACL of every table named in a
-- relation's policy set at executor init — BEFORE filtering those policies by
-- role. The policy is `TO authenticated`; the check is not. So revoking SELECT
-- made EVERY anon read of storage.objects raise
--   42501  permission denied for table designer_clients
--   HINT   Grant the required privileges to the current role with:
--          GRANT SELECT ON public.designer_clients TO anon;
-- and took two unrelated suites red on a fresh stack
-- (supabase/tests/storage/project_documents_caller_binding_test.sql and
--  supabase/tests/mood_boards/share_security_test.sql). Reproduced and
-- re-verified on the local stack, 2026-09-02.
--
-- Keeping SELECT costs nothing. RLS is enabled on the table and the only policy
-- that admits anon is 00014's `FOR ALL TO PUBLIC USING (auth.uid() = designer_id)`,
-- where auth.uid() is NULL for an anon caller — so an anon SELECT returns zero
-- rows. The grant satisfies a permission check; it does not open a read.
--
-- The GRANT back to authenticated is explicit for the reason the vendors block
-- states: on a post-2026-05-30 stack nothing grants it during a migration
-- replay, and the assertion at the foot of this file would then fail the
-- transaction on a fresh local reset. Additive on prod, load-bearing locally.
-- FOR ALL policies on this table cover all four verbs, so all four are granted.
REVOKE ALL PRIVILEGES ON public.designer_clients FROM anon;
GRANT SELECT ON public.designer_clients TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.designer_clients TO authenticated;

-- RF3-07. The same TRUNCATE/REFERENCES argument (a2) makes about profiles,
-- applied to the table this section has just spent 130 lines calling the roster
-- rail. The GRANT above is additive and does not clear the pre-flip creation
-- default, which on both Strata and a fresh local stack leaves `authenticated`
-- at the full arwdDxtm set — measured after apply, 2026-09-02:
--   designer_clients  authenticated=arwdDxtm/postgres   ← TRUNCATE, REFERENCES
--   profiles          authenticated=arwtm/postgres      ← already cleared above
-- RLS does not constrain TRUNCATE, so the grant is a one-statement wipe of every
-- designer↔client relationship in the database — which would take can_view_profile's
-- roster leg, the sibling UPDATE policy and the whole Add Client rail with it.
-- REFERENCES lets a grantee pin roster rows against deletion with an FK of their
-- own. Neither has a caller. TRIGGER and MAINTAIN are left alone here for the
-- same reason as on profiles: not reachable through PostgREST, and clearing them
-- would be a change this migration cannot test.
REVOKE TRUNCATE, REFERENCES ON public.designer_clients FROM authenticated;

-- (ii) the server-side default. handle_new_user() is SECURITY DEFINER and owned
-- by postgres, so it is not subject to the policy above.
--
-- Lineage: 00013 → 00023 → 00028 → 00039 → 00040 → 00126 → 00313 → (this).
-- The body below is grafted VERBATIM from
-- 00313_handle_new_user_client_role_hint.sql, which is the
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*handle_new_user" \
--     supabase/migrations/*.sql | sort | tail -1
-- winner — role CASE, COALESCE and all. 00313's security rule is untouched: a
-- client-supplied role hint is honored ONLY when it is the literal 'homeowner',
-- so raw_user_meta_data can never self-assign an elevated role.
--
-- An earlier draft of this migration left the body out and asked whoever
-- applied the file to paste it in at apply time. That is not replayable: a
-- local `supabase db reset` would produce a database where this function is
-- unchanged, and the guard that was supposed to catch it
-- (pg_get_functiondef LIKE '%homeowner%') is satisfied twice over by 00313's
-- own body — it would report success over a skipped step. Both are fixed here:
-- the body is present, and the guard below matches on the COALESCE.
--
-- ── RULING B2 v3 (Fable, 2026-09-02) — THE DEFAULT DOES NOT MOVE ──────────
--
-- This function is UNCHANGED from 00313 in behaviour. Every signup with no
-- honored 'homeowner' hint still lands profiles.role = 'designer'. The portals
-- are unchanged; Apple and Google on the portals are unchanged.
--
-- Two earlier cuts of this migration changed it, and both were wrong:
--
--   B2 v1  flipped COALESCE(v_role,'designer') to COALESCE(v_role,'homeowner').
--          That fixed the iOS path and broke the designer portal's own signup
--          page (apps/designer-portal/src/app/auth/signup/page.tsx:147-157
--          sends name/company/phone and NO role), which would have written
--          every portal designer as a 'homeowner' and had
--          public.comms_resolve_role (00103:37-42) label them `client` in every
--          thread.
--   B2 v2  replaced the constant with a CASE on raw_app_meta_data->>'provider',
--          allowlisting 'email' to 'designer' and defaulting everything else to
--          'homeowner'.
--
-- v3 reverses v2 for a reason that is about the SHAPE of the fix, not its
-- direction. The provider CASE moved a PRODUCT decision — "is this new account
-- a client or a designer?" — into an auth.users trigger, where the only
-- evidence available is which button the person tapped. That is not the same
-- question. A designer can sign in with Apple; a client can sign up with an
-- email and a password (the client-portal invite-accept form does exactly that,
-- AcceptInviteForm.tsx:64). v2 would have written the wrong answer for both,
-- silently, at the one moment the row is created and nobody is looking.
--
-- And it bought nothing, because profiles.role is a LABEL (B2 v3(a)). Nothing
-- in the schema grants authority from it: the design-request rail reads
-- is_designer, profiles_select_admin reads user_roles, and after RF2-01 so do
-- the designer_clients restrictive policies in (i-c). A wrong label is a
-- cosmetic defect — a client mislabelled 'designer' sees the wrong word in a
-- comms thread — not a privilege escalation.
--
-- So the label is corrected where the answer is actually KNOWN, by the two
-- callers that know it:
--
--   • the iOS app, after an Apple/Google sign-in, PATCHes its OWN row to
--     role = 'homeowner' — permitted by the one-way ratchet on
--     "Users can update own profile" above (B2 v3(c)). This is A3-07's fix, and
--     it is W1 · L1-A; the contract is written out in
--     artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-a-notes.md.
--   • supabase/functions/client-invite/index.ts handleAccept, as service_role,
--     when a client accepts a designer's invitation (B2 v3(d)). Deployed in
--     KODY-RUNBOOK Block A step A10; the one-time backfill for clients who
--     already accepted is Block B7.
--
-- user_roles is untouched either way — every signup still gets the 'app_user'
-- grant, and profiles.is_designer is still synced from user_roles by 00290's
-- trigger.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_default_role_id UUID;
  v_role         TEXT;
  v_display_name TEXT;
BEGIN
  -- Role hint from signup metadata. SECURITY: raw_user_meta_data is
  -- CLIENT-CONTROLLED (set via signUp(data:) / signInWithOTP(data:)), so we
  -- must NOT trust an arbitrary value — a caller could otherwise self-assign
  -- 'admin'/'super_admin'. Only the single safe client value 'homeowner' is
  -- honored; anything else is ignored and falls through to the default below.
  -- (Elevated roles are granted exclusively server-side via user_roles / admin
  -- action, never from signup metadata.)
  --
  -- With no honored hint the default is 'designer', exactly as it has been
  -- since 00013 — see the COALESCE on the INSERT below. RULING B2 v3(a): this
  -- is a LABEL, not an authorization input, and it is corrected by the two
  -- callers that know the answer (the iOS app's own self-downgrade after an
  -- Apple/Google sign-in, and client-invite's accept handler as service_role),
  -- not guessed from an identity provider inside a trigger.
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'homeowner' THEN 'homeowner'
    ELSE NULL
  END;

  -- Display name from metadata (email/password path sends display_name; other
  -- providers may send full_name). Nullable — never blocks signup.
  v_display_name := NULLIF(NEW.raw_user_meta_data->>'display_name', '');
  IF v_display_name IS NULL THEN
    v_display_name := NULLIF(NEW.raw_user_meta_data->>'full_name', '');
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    COALESCE(v_role, 'designer')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Default new signups to 'app_user' (consumer) in the authoritative
  -- user_roles table. Role can be elevated later by an admin or org flow.
  SELECT id INTO v_default_role_id FROM public.roles WHERE name = 'app_user' LIMIT 1;
  IF v_default_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_default_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- RF2-10. handle_new_user is a SECURITY DEFINER function owned by postgres and
-- it lives in the PostgREST-exposed public schema, so a bare EXECUTE grant to
-- PUBLIC means the anon key can POST /rest/v1/rpc/handle_new_user. It is a
-- trigger function, so a direct call raises 0A000 rather than doing anything —
-- but it is exposed surface with no caller. The trigger itself is unaffected:
-- Postgres does not check EXECUTE when firing a trigger. Same hygiene 00290
-- already applied to fc_sync_is_designer_from_role.
--
-- RF3-11: `authenticated` is in the list too. Fix round 3's first pass revoked
-- PUBLIC and anon and left authenticated behind, which contradicted the stated
-- rationale — measured proacl after that pass was
-- {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}, so a
-- signed-in caller could still POST /rest/v1/rpc/handle_new_user. "Exposed
-- surface with no caller" is exactly as true of authenticated as of anon, and
-- the trigger does not care: Postgres checks no EXECUTE privilege when firing
-- one, which is why postgres and service_role keep theirs and nothing breaks.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'auth.users INSERT trigger. Creates the profiles row and the default '
  'user_roles ''app_user'' grant. A client-supplied raw_user_meta_data role '
  'hint is honored ONLY for the literal ''homeowner'' (00313); with no honored '
  'hint the default is ''designer'', unchanged since 00013 and deliberately '
  'left alone by 00555 (ruling B2 v3(a)). profiles.role is a LABEL, not an '
  'authorization input — the design-request rail reads profiles.is_designer '
  'and the admin/roster policies read user_roles — so a new account that is '
  'really a client is RELABELLED by the two callers that know it: the iOS app '
  'self-downgrades its own row after an Apple/Google sign-in (permitted by the '
  'one-way ratchet on "Users can update own profile"), and client-invite''s '
  'accept handler writes ''homeowner'' as service_role. 00555 changed only the '
  'EXECUTE grant on this function, never its body.';

-- ─── public.profile_cards: CUT, deliberately ──────────────────────────────
-- An earlier draft created a narrow `profile_cards` view here (security_invoker,
-- id/display_name/full_name/avatar_url/role, GRANT SELECT to authenticated and
-- service_role). It is removed: NOTHING in the First Flight program moves a
-- caller onto it. L0.2's only client-side file is ScanSharingService.swift,
-- which moves to search_shareable_designers (below) rather than to a view;
-- L0.2b's fix for useVendorProfiles is list_vendor_profiles (below); no iOS
-- finding cites it; and no portal work is in the program at all.
--
-- A new public surface with no reader is dead weight, and worse, its presence
-- reads as though the counterparty read paths are covered when the READERS
-- block at the foot of this file lists NINE silent degradations that are not.
-- profile_cards returns with its first consumer, in the migration that needs it.
-- The degradation list is tracked at
-- artifacts/ios-testflight-polish-2026-09-01/build/waves/w3/00555-degradations.md
-- (PROGRAM.md L0.2, "The follow-up list this migration creates").

-- ═══════════════════════════════════════════════════════════════════════════
-- (a3) public.search_shareable_designers — the one directory read the product
--      genuinely needs, rebuilt without the email leak
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces ScanSharingService.searchDesigners (see REQUIRED CODE FOLLOW-UP 1).
-- The Swift call site selects `id, email, full_name, avatar_url, business_name`
-- across every designer on the platform. This function returns no email, ever.
--
-- business_name IS returned even though it was not in the review's column list:
-- the picker renders it as the subtitle under the designer's name, and it is a
-- published trade identity rather than personal data. Dropping it would break
-- the surface this function exists to keep alive. Flagged here rather than
-- decided silently.
--
-- Guards: a two-character minimum (an empty query must not enumerate the
-- directory), LIMIT 20, and ILIKE only on name-shaped columns — never on email,
-- so the function cannot be used to confirm whether an address has an account.
--
-- p_query's LIKE metacharacters are escaped before interpolation. p_query is a
-- parameter, so this was never injection — but `%` and `_` are wildcards INSIDE
-- the pattern, and `'%a'` is two characters that match every name containing an
-- 'a', which is precisely what the two-character floor exists to prevent. With
-- the escape, the floor means what it says. ESCAPE '\' is stated explicitly
-- rather than relying on standard_conforming_strings.
--
-- WHO COUNTS AS A DESIGNER HERE — RULING B2 v3(b), finding RF2-01. This is the
-- one authority-shaped predicate in the function, and it is about the TARGET
-- row rather than the caller (any signed-in user may search). It therefore
-- reads the same two signals every other authority decision in this file reads:
-- profiles.is_designer, or a user_roles grant in the 'designer' domain. It does
-- NOT read profiles.role, which would have put every email/password self-signup
-- into a directory the whole product treats as vetted. The user_roles leg is
-- belt to 00290's braces — that trigger normally syncs is_designer from the
-- grant, but a grant written before 00290, or while the trigger was dropped,
-- leaves is_designer false on a real designer. 'admin' is deliberately NOT in
-- this domain list: an admin is not a shareable designer, and this is a product
-- directory, not a permission check.

CREATE OR REPLACE FUNCTION public.search_shareable_designers(p_query text)
RETURNS TABLE (
  id            uuid,
  display_name  text,
  business_name text,
  avatar_url    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT '%' || replace(replace(replace(btrim(COALESCE(p_query, '')),
                                          '\', '\\'),
                                  '%', '\%'),
                          '_', '\_') || '%' AS pattern,
           length(btrim(COALESCE(p_query, ''))) AS raw_len
  )
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.display_name), ''), p.full_name) AS display_name,
         p.business_name,
         p.avatar_url
  FROM profiles p, q
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      p.is_designer IS TRUE
      OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = p.id
          AND r.domain = 'designer'
      )
    )
    AND q.raw_len >= 2
    AND (
      p.display_name  ILIKE q.pattern ESCAPE '\'
      OR p.full_name     ILIKE q.pattern ESCAPE '\'
      OR p.business_name ILIKE q.pattern ESCAPE '\'
    )
  ORDER BY COALESCE(NULLIF(btrim(p.display_name), ''), p.full_name, p.business_name)
  LIMIT 20;
$$;

REVOKE EXECUTE ON FUNCTION public.search_shareable_designers(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_shareable_designers(text) TO authenticated;

COMMENT ON FUNCTION public.search_shareable_designers(text) IS
  'Directory search for the iOS "share a scan with a designer" picker. '
  'SECURITY DEFINER so it survives the removal of "Profiles are viewable by '
  'everyone" (00555), but it returns only id, display name, business name and '
  'avatar — never email, and it never matches ON email, so it cannot confirm '
  'whether an address has an account. Two-character minimum, LIMIT 20, '
  'authenticated only. Replaces the raw profiles query at '
  'ScanSharingService.swift:373-380.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (a4) public.list_vendor_profiles — the designer-portal vendor picker
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces packages/supabase/src/hooks/use-comms.ts:1060-1065 useVendorProfiles
-- (REQUIRED CODE FOLLOW-UP 3). That hook is
--   .from('profiles').select('id, full_name, avatar_url').eq('role','vendor')
-- with no caller scoping, and its `if (error) throw` means that after the anon
-- revoke it does NOT degrade to an empty list — it THROWS 42501 and every screen
-- calling it renders an error state.
--
-- This is the migration's own recommendation (i). Option (ii) — a policy leg
-- `USING (role = 'vendor')` TO authenticated — is a smaller diff but re-opens
-- every vendor profile's FULL row (email, phone, stripe_customer_id) to every
-- signed-in user, and so only makes sense after DM-1b. Not taken.
--
-- Deliberately no query parameter and no LIMIT: the caller is a picker over a
-- small, curated internal set, and adding pagination would change the hook's
-- contract as well as its source. If the vendor count grows past a few hundred,
-- give it the same two-character / LIMIT 20 shape as search_shareable_designers.
--
-- `p.role = 'vendor'` STAYS, and it is not a violation of ruling B2 v3(b).
-- Checked explicitly in fix round 3 alongside RF2-01, because the rule is
-- "authority never predicates on profiles.role" and this line reads role. It
-- decides no authority: it selects a DIRECTORY, and the caller side of the
-- predicate is `auth.uid() IS NOT NULL` — any signed-in user. There is no
-- is_designer analogue for vendors and no vendor domain in public.roles
-- (consumer / designer / manufacturer / admin), so there is nothing else to
-- read.
--
-- ⚠ CORRECTED IN FIX ROUND 3 PASS 2 (RF3-02). This block used to end with a
-- claim that a caller cannot list themselves into this picker, on the grounds
-- that "the INSERT policies either omit role entirely or pin it to 'homeowner'".
-- The first half of that sentence refutes the second: after RF2-07 the own-row
-- INSERT policy omits role, so it does not stop `role = 'vendor'`. Measured over
-- HTTP against a live signup JWT whose profiles row had been removed:
--   POST /rest/v1/profiles {"id": self, "role": "vendor"}  → 201, row lands
--   POST /rest/v1/profiles {"id": self, "role": "admin"}   → 201, row lands
--   POST /rest/v1/profiles {"id": self, "is_designer": true} → 403 (the pin holds)
-- So a caller in that state COULD put themselves in this directory, and could
-- make comms_resolve_role (00103) print 'admin' beside their name in a thread.
-- Those two measurements are what fix round 3 pass 3's vocabulary guard closes
-- (see the ✅ block below); the paragraphs between here and it are the reasoning
-- that led to it, kept because they are the record of how narrow the window is.
--
-- What bounded it before that guard was the WINDOW, not the policy: the INSERT needs the
-- caller's profiles row to be ABSENT, and handle_new_user writes that row inside
-- the auth.users insert for every account the platform creates. The row is
-- missing only after a failed trigger, a partially completed delete-account or a
-- backfill gap — the same narrow window (a) already names as the reason the
-- is_designer pin is "a door matching a window". UPDATE cannot reach either
-- label: the one-way ratchet above lets role fall to 'homeowner' and nowhere
-- else.
--
-- ✅ FIXED IN FIX ROUND 3 PASS 3, by Fable's ruling on exactly this question.
-- Pass 2 left it open: it recorded that a vocabulary guard on the own-row
-- INSERT — `role IN ('homeowner','client','designer')` — would close the two
-- 201s above, that it is a VOCABULARY check rather than an authority check and
-- so does not read on B2 v3(a)'s prohibition, and that taking it was the
-- ruling-holder's call rather than the pass's, because B2 v3(a) as written says
-- that leg pins is_designer ONLY.
--
-- The ruling is taken. Section (a)'s "Users can insert own profile" now carries
-- the three-string vocabulary guard beside the unchanged `is_designer IS NOT
-- TRUE` authority pin, and the verification block asserts the vocabulary rather
-- than asserting the absence of any role predicate. The column is still NOT
-- pinned to a value — there is no OLD row on an INSERT and pinning to a literal
-- is the guess RF2-07 removed — so B2 v3(a) stands as written in substance:
-- profiles.role remains a label that grants nothing.
--
-- What that means for THIS function: a caller in the missing-row window can no
-- longer put themselves in this picker at all. `role = 'vendor'` is refused by
-- the guard on INSERT, and the one-way ratchet on "Users can update own
-- profile" lets role fall only to 'homeowner', so UPDATE cannot reach it
-- either. The same guard closes the `role = 'admin'` spoof in
-- comms_resolve_role (00103). The W2 role-vocabulary reconciliation (i-b) is
-- still where the two-string split itself should die.

CREATE OR REPLACE FUNCTION public.list_vendor_profiles()
RETURNS TABLE (
  id         uuid,
  full_name  text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM profiles p
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND p.role = 'vendor'
  ORDER BY p.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_vendor_profiles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_vendor_profiles() TO authenticated;

COMMENT ON FUNCTION public.list_vendor_profiles() IS
  'Vendor directory for the designer-portal comms picker. SECURITY DEFINER so '
  'it survives the removal of "Profiles are viewable by everyone" (00555). '
  'Returns id, full_name and avatar_url only — never email, phone or '
  'stripe_customer_id. Authenticated only. Replaces the raw profiles query at '
  'packages/supabase/src/hooks/use-comms.ts:1060-1065 (useVendorProfiles), '
  'which would otherwise throw 42501 after this migration.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) public.notification_preferences — remove the anon ALL policy and grants
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Service role full access to notification preferences" is `FOR ALL TO PUBLIC
-- USING (auth.uid() IS NULL)`. service_role never needed it. Paired with anon
-- holding SELECT + INSERT + UPDATE + DELETE on the table, it is a full
-- read/write grant of every user's notification settings to the key in the iOS
-- binary. A3 declined to exercise the write (read-only lane); the grant and the
-- policy together are the proof, and the test script exercises it locally.
DROP POLICY IF EXISTS "Service role full access to notification preferences"
  ON public.notification_preferences;

-- No anon call site exists. Every writer is service_role:
--   packages/notifications/src/unsubscribe.ts (header: "using a Supabase
--     service-role client so RLS doesn't block the UPDATE"), reached from
--     apps/client-portal/src/app/api/unsubscribe/route.ts and
--     apps/client-portal/src/app/api/preferences/apply-token/route.ts via
--     createServiceClient()
--   supabase/functions/{notification-digest,digest-dispatcher,automation-processor}
--   supabase/functions/_shared/decision-notify.ts
-- The only first-party reader is the signed-in owner
-- (apps/mobile/Patina/Patina/Services/Settings/SettingsService.swift:95,165).
REVOKE ALL PRIVILEGES ON public.notification_preferences FROM anon;

-- Owner-scoped policies already exist on Strata and are kept as-is:
--   "Users can read own notification preferences"   SELECT  USING (auth.uid() = user_id)
--   "Users can insert own notification preferences" INSERT  WITH CHECK (auth.uid() = user_id)
--   "Users can update own notification preferences" UPDATE  USING (auth.uid() = user_id)
--   "Admins can read all notification preferences"  SELECT  (user_roles ⨝ roles, domain='admin')
-- The owning column is `user_id` (verified against information_schema.columns).
-- The guard below matches the owner policy BY NAME. A predicate-shaped test
-- would be satisfied by the admin policy too — it also mentions auth.uid() and
-- joins a user_id column — and would then leave the owner locked out while
-- reporting success.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notification_preferences'::regclass
      AND polname  = 'Users can read own notification preferences'
  ) THEN
    EXECUTE $ddl$
      CREATE POLICY "Users can read own notification preferences"
        ON public.notification_preferences
        FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) = user_id)
    $ddl$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) public.vendors — keep the maker's public face, drop the trade file
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CHOICE: column-level grants on anon, NOT a public view.
--
-- A view cannot serve this surface. The iOS product read is an EMBED —
-- apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:122
--   static let productSelect = "*,vendors!products_vendor_id_fkey(name,made_in,brand_story)"
-- used at :133 (single piece) and :163 (batch by ids) — and PostgREST resolves
-- an embed through the foreign key on the BASE TABLE. Point the app at a
-- `vendor_cards` view and the join disappears; the app's
-- `withholdingUnresolvedMakers` rule then drops every product for having no
-- resolvable maker, which is the exact failure A3-01 already describes. Column
-- grants keep the FK, and therefore keep the embed, while making the internal
-- columns unreadable to anon.
--
-- The three columns that select asks for — name, made_in, brand_story — are all
-- in the allowlist below. `id` is in it too even though the app does not name
-- it: PostgREST builds the embed as a lateral join on vendors.id, so anon needs
-- SELECT on that column or the whole products read 42501s.
--
-- Postgres will not let a column REVOKE narrow a table-wide grant, so this is
-- REVOKE ALL PRIVILEGES first (which also clears PG 17's MAINTAIN), then GRANT
-- the columns back. Public face kept; trade file removed:
--   removed from anon: trade_terms, notes, contact_info, preferred_contact,
--                      orders_email, trade_account_email, trade_portal_url,
--                      trade_account_established_at, default_payment_terms,
--                      nomination_status, nominated_by, nominated_at,
--                      contact_profile_id                          (13 columns)
-- `authenticated` is untouched — the designer portal legitimately reads the
-- trade file, and several hooks select `vendors!products_vendor_id_fkey(*)`
-- (packages/supabase/src/hooks/use-products.ts:96,392), which a column-narrowed
-- grant would 42501.
REVOKE ALL PRIVILEGES ON public.vendors FROM anon;

GRANT SELECT (
  id,
  name,
  website,
  logo_url,
  hero_image_url,
  market_position,
  production_model,
  founded_year,
  ownership,
  headquarters_city,
  headquarters_state,
  parent_company_id,
  primary_category,
  secondary_categories,
  designer_rating_avg,
  review_count,
  lead_times,
  social_links,
  brand_story,
  made_in,
  is_patina_catalog,
  founding_circle,
  created_at,
  updated_at
) ON public.vendors TO anon;

-- `authenticated` keeps the whole trade file, and this migration now says so
-- OUT LOUD instead of inheriting it. On Strata the grant is already there — the
-- table predates Supabase's 2026-05-30 platform-default flip, so authenticated
-- was granted at creation time — but on a post-flip stack (every fresh local
-- `supabase db reset`) nothing grants it during the migration replay, because
-- seed/00-legacy-grants.sql runs AFTER the migrations, not before. The
-- verification block below asserts `has_table_privilege('authenticated',
-- 'public.vendors', 'SELECT')`, so without this line the migration cannot apply
-- locally at all — which is exactly the failure the skill's "post-flip
-- migrations must GRANT what callers need EXPLICITLY, never rely on creation
-- defaults" rule exists to prevent. Additive on prod, load-bearing locally.
GRANT SELECT ON public.vendors TO authenticated;

-- The "Allow anon read access to vendors" policy (qual: true, TO anon) is
-- deliberately left alone: with the column grant above it now means "anon may
-- read a maker's public face", which is what the marketplace needs.

-- ═══════════════════════════════════════════════════════════════════════════
-- (d) SECURITY DEFINER views that leak past every policy above
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A view with `security_invoker = false` (the Postgres default) reads its base
-- tables as the view OWNER — postgres — so RLS on `profiles` never applies to
-- it. Four such views in `public` are granted to anon with the full
-- `anon=arwdDxtm/postgres` ACL:
--
--   user_engagement_scores   id, email, role, current_score, last_active_at,
--                            engagement_tier — reads profiles directly. This is
--                            the same email list the profiles fix removes, on a
--                            second door. THE BLOCKER OF THE FOUR.
--   consumer_funnel          step, count, step_order
--   designer_funnel          step, count, step_order
--   conversion_funnel        step, step_order, users_at_step,
--                            users_at_previous_step, conversion_rate_percent
--
-- The three funnels carry no PII but publish signup and conversion counts to
-- anyone with the app's key — internal business metrics, not marketplace data.
--
-- All four are admin-analytics surfaces, and the admin analytics PAGE reads them
-- through /api/admin/comms/analytics on the service-role client, which is
-- BYPASSRLS and unaffected.
--
-- ⚠ CORRECTED IN FIX ROUND 3 PASS 2 (RF3-10). This block used to say "every
-- reader found in the repo goes through an admin-portal route on the
-- service-role client, so revoking anon and authenticated costs nothing". That
-- is not accurate. NINE call sites in the shared hooks read these four views on
-- the BROWSER client — packages/supabase/src/hooks/use-insights.ts:104, 235,
-- 266, 350, 367, 384 and use-engagement.ts:65, 98, all built from
-- createBrowserClient() (use-insights.ts:10) — and every one of them is
-- `if (error) throw error`, so after `REVOKE … FROM authenticated` they raise
-- 42501 rather than degrading to an empty result.
--
-- The break is LATENT, not live, and that is why the REVOKE still ships: a grep
-- over apps/ finds NO page importing useInsightsOverview, useConversionFunnel,
-- useDesignerFunnel, useConsumerFunnel, useEngagementScore or
-- useMyEngagementScore — only packages/supabase/src/hooks/index.ts re-exporting
-- them. Nothing mounts them today. They are listed in §4 of the READERS block at
-- the foot of this file as HARD BREAKS IF EVER MOUNTED, so the next lane that
-- wires one up finds the note here rather than a 42501 in production. The fix
-- when that day comes is the same one L0.2b applied to useVendorProfiles: a
-- service-role route, or a SECURITY DEFINER RPC — not a re-grant.
REVOKE ALL PRIVILEGES ON public.user_engagement_scores FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON public.consumer_funnel        FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON public.designer_funnel        FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON public.conversion_funnel      FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.user_engagement_scores TO service_role;
GRANT SELECT ON public.consumer_funnel        TO service_role;
GRANT SELECT ON public.designer_funnel        TO service_role;
GRANT SELECT ON public.conversion_funnel      TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (e) The rest of the `auth.uid() IS NULL` family
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every policy on Strata whose qual or with-check mentions `auth.uid() IS NULL`,
-- read from pg_policy on 2026-09-01. ALL of these tables grant anon
-- SELECT+INSERT+UPDATE+DELETE (has_table_privilege, verified), so in every case
-- the policy's predicate is satisfied by exactly one principal: the
-- unauthenticated key. service_role is BYPASSRLS and depends on none of them.
--
--   TABLE                          POLICY                                            CMD  DISPOSITION
--   audience_segments              "Service role full access on audience_segments"   ALL  DROPPED below
--   automated_sequences            "Service role full access on automated_sequences" ALL  DROPPED below
--   campaign_analytics             "Service role full access on campaign_analytics"  ALL  DROPPED below
--   campaigns                      "Service role full access on campaigns"           ALL  DROPPED below
--   email_templates                "Service role full access on email_templates"     ALL  DROPPED below
--   sequence_enrollments           "Service role full access on sequence_enrollments" ALL DROPPED below
--   user_sessions                  "Service role full access to user sessions"       ALL  DROPPED below
--   notification_preferences       "Service role full access to notification …"      ALL  DROPPED in (b)
--
--   The eight above are the unambiguous set: FOR ALL, TO PUBLIC, predicate
--   `auth.uid() IS NULL` and nothing else. They read and write the whole
--   marketing/comms rail (campaign bodies, email templates, audience
--   definitions, per-user enrolment, session history) to any holder of the anon
--   key. Dropping them removes anon and changes nothing for service_role.
--
--   NOT DROPPED — recommendation only, each needs a product ruling this lane
--   cannot make:
--
--   engagement_events              "Service role can insert engagement events"       INSERT
--     WITH CHECK (auth.uid() IS NULL). Plausibly intentional: anonymous
--     behavioural tracking from the marketing site. RECOMMEND replacing with an
--     explicit `TO anon WITH CHECK (true)` so the intent is legible, and adding
--     a rate limit; do not silently drop a working ingest path.
--
--   founding_designer_applications "Service role can insert founding designer …"     INSERT
--   maker_applications             "Service role can insert maker applications"      INSERT
--   newsletter_subscribers         "Service role can insert newsletter_subscribers"  INSERT
--   waitlist                       "Service role can insert waitlist"                INSERT
--     Same shape, same reading: these are public application/signup forms and
--     anon INSERT is probably the product. RECOMMEND the same rename-to-intent
--     (`TO anon WITH CHECK (true)`), plus a check that anon does NOT also hold
--     SELECT on them — today it does, which means the anon key can read every
--     waitlist entry, every maker application and every newsletter address.
--     That read is a separate exposure worth its own migration.
--
--   notification_log               "Service role can insert notification logs"       INSERT
--   notification_log               "Service role can update notification logs"       UPDATE
--     HIGH but out of this lane's blast radius. The UPDATE one lets anon rewrite
--     any user's notification rows (delivery status, read state). The same
--     "service_role bypasses RLS" argument applies and it is almost certainly
--     droppable, but notification_log is on the live email/cron rail that
--     00552/00553/00554 just moved, so it should be dropped in a migration that
--     can be verified against that rail rather than folded in here.
--
--   profiles                       "Users can insert own profile"                    INSERT
--     Handled in (a): the `OR (auth.uid() IS NULL)` leg is removed.
--
-- ALSO SEEN, not an `auth.uid() IS NULL` policy but adjacent and worth a ruling:
--   profiles "Designers can create homeowner profiles" was
--   `WITH CHECK ((auth.uid() IS NOT NULL) AND (role = 'homeowner'))` — any
--   authenticated user may insert a profiles row with any id, as long as the
--   role string is 'homeowner'. Handled in (a2)(i-b2): the policy is re-scoped
--   to authenticated, pins `is_designer IS NOT TRUE` (without which it ORed
--   around the pins on "Users can insert own profile" and the authority column
--   was insertable outright), holds the created row to the client vocabulary,
--   and — since fix round 3 pass 3, RF3-13 — asks the CALLER for real designer
--   authority. The ARBITRARY-ID half itself is deliberately untouched: a
--   designer may legitimately create a client's row before that client has an
--   account. What changed is the population that can reach it, from every
--   signed-in account to designer/admin authority holders. It remains one of
--   the self-assertion routes named in CAVEAT 1.

DROP POLICY IF EXISTS "Service role full access on audience_segments"    ON public.audience_segments;
DROP POLICY IF EXISTS "Service role full access on automated_sequences"  ON public.automated_sequences;
DROP POLICY IF EXISTS "Service role full access on campaign_analytics"   ON public.campaign_analytics;
DROP POLICY IF EXISTS "Service role full access on campaigns"            ON public.campaigns;
DROP POLICY IF EXISTS "Service role full access on email_templates"      ON public.email_templates;
DROP POLICY IF EXISTS "Service role full access on sequence_enrollments" ON public.sequence_enrollments;
DROP POLICY IF EXISTS "Service role full access to user sessions"        ON public.user_sessions;

-- ═══════════════════════════════════════════════════════════════════════════
-- (f) public.user_roles and public.roles — grant hygiene on the two tables
--     THIS FILE TREATS AS AUTHORITY (RF3-19)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ruling B2 v3(b) is the spine of this migration: authority comes from
-- public.user_roles (roles.domain IN ('designer','admin')) or
-- profiles.is_designer, never from profiles.role. Six predicates added or
-- rewritten above read user_roles — profiles_select_admin, both clauses of
-- "Designers can update their client profiles", "Designers can create homeowner
-- profiles" (i-b2), both designer_clients restrictive policies,
-- search_shareable_designers and, since RF3-14, both of can_view_profile's
-- roster legs.
--
-- Neither table has ever had a WRITE POLICY. 00021 is the only migration that
-- creates policies on them and it creates exactly two, both SELECT:
--   roles       "Roles readable by authenticated"  FOR SELECT TO authenticated USING (true)
--   user_roles  "Users can view their roles"       FOR SELECT USING (user_id = auth.uid())
-- RLS is enabled on both (00021:253, :258). So every INSERT/UPDATE/DELETE grant
-- either role holds is a grant with no policy to use it — the same latent
-- hazard (a2) removed from profiles and (i-c) removed from designer_clients,
-- on the tables that decide who is a designer and who is an admin. A single
-- future permissive write policy, or one `FORCE ROW LEVEL SECURITY` slip, turns
-- the grant into self-promotion straight past everything above.
--
-- ── WHO ACTUALLY READS AND WRITES THESE TABLES, CHECKED BEFORE REVOKING ────
--
-- WRITES — every one is service_role or SECURITY DEFINER, and therefore
-- BYPASSRLS or owner-privileged, and unaffected:
--   admin-portal  /api/users, /api/users/[id]/roles, /api/roles/*,
--                 /api/admin/applications/[type]/[id]/onboard — all adminClient
--   designer-portal /api/clients/invite:175,181 — adminClient
--   edge functions designer-invite:242, workspace-member-invite:209,342 — admin client
--   SQL           handle_new_user (SECURITY DEFINER, this file),
--                 00556's admin_create_studio_for_user:329 and
--                 admin_add_studio_member:441 (both SECURITY DEFINER),
--                 00126's backfill (a migration, runs as postgres)
--
-- READS under a session — SELECT is all any of them needs, and SELECT is kept:
--   packages/supabase/src/hooks/use-auth.ts:84, use-permissions.ts:126,159,
--     285,306 — browser client, all SELECT
--   apps/mobile/Patina ProfileService.swift:99 and
--     apps/mobile/Capture SupabaseSessionService.swift:420 — the
--     `user_roles → roles.domain` join, both SELECT
--   the three portal middlewares (admin:105, designer:25, client:29) build a
--     service-role client from SUPABASE_SERVICE_ROLE_KEY, so they are not
--     session-side at all
--
-- ⚠ THE ONE SESSION-SIDE WRITE IN THE REPO, listed rather than assumed away:
--   packages/supabase/src/hooks/use-onboarding.ts:308
--     useApproveDesignerApplication() upserts into user_roles on the BROWSER
--     client (createBrowserClient(), use-onboarding.ts:9).
--   It is already dead, and this REVOKE does not kill it: user_roles carries no
--   INSERT or UPDATE policy, so RLS refuses that upsert today and the hook's
--   `if (grantError) throw` surfaces it. The REVOKE changes the error's origin
--   from a policy denial to a grant denial — the same 42501, the same code
--   path. It is also NOT MOUNTED: a grep over apps/ for
--   useApproveDesignerApplication returns only the definition and the package
--   barrel's re-export. The correct fix when someone wires designer-application
--   approval into a page is the admin-portal route that already does it
--   (/api/admin/applications/[type]/[id]/onboard, adminClient) — never a write
--   policy on user_roles.
--
-- ⚠⚠ AND THE VERB THAT IS **NOT** REVOKED FROM `authenticated`: UPDATE.
--
-- Not because anything writes these tables under a session — nothing does —
-- but because Postgres charges a ROW-SHARE LOCK to the UPDATE privilege.
-- 00511's public.set_project_studio_id() is a SECURITY **INVOKER** plpgsql
-- trigger on public.projects, and its authority-lock ladder is:
--     PERFORM role.id FROM public.roles AS role
--      WHERE role.domain = 'designer' ORDER BY role.id FOR SHARE;
--     PERFORM user_role.id FROM public.user_roles AS user_role
--       JOIN public.roles AS role ON role.id = user_role.role_id
--      WHERE user_role.user_id = NEW.designer_id ... FOR SHARE OF user_role;
-- `SELECT … FOR SHARE` requires UPDATE privilege on the locked relation, so
-- revoking UPDATE takes EVERY authenticated project insert or update with it.
-- Measured, not predicted — the first cut of this section revoked all five
-- verbs from both roles and
--   supabase/tests/edge_api/public_sd_hardening_contract_test.sql
-- went red on:
--   ERROR: permission denied for table roles
--   HINT:  GRANT UPDATE ON public.roles TO authenticated;
--   CONTEXT: SQL statement "SELECT role.id FROM public.roles AS role … FOR SHARE"
--            PL/pgSQL function set_project_studio_id() line 151
--            SQL statement "INSERT INTO public.projects (…)"
-- 00482 takes the same shape on the retained-service rail. So UPDATE is granted
-- back to `authenticated` explicitly, with this paragraph as the reason, and it
-- costs nothing: RLS is enabled on both tables and NEITHER carries an UPDATE
-- POLICY, so an actual UPDATE statement is still refused — the grant satisfies
-- a lock's permission check without opening a write. Fixing the trigger to lock
-- as DEFINER is the right end state and is not this migration's job.
--
-- anon does NOT keep UPDATE, and that asymmetry is deliberate and safe: anon
-- cannot reach set_project_studio_id at all, and this very migration already
-- proves it — the same function takes `FOR SHARE` on public.designer_clients
-- (00511:264), and §(i-c) above leaves anon holding SELECT and nothing else on
-- that table. If an anon caller could fire this trigger, the designer_clients
-- revoke would already have broken it.
--
-- SELECT IS DELIBERATELY KEPT FOR BOTH ROLES, INCLUDING anon, and for the same
-- reason the designer_clients block spells out at length: Postgres checks the
-- ACL of every table named in a relation's policy set at executor init, BEFORE
-- filtering those policies by role. Dozens of tables carry an admin policy that
-- joins user_roles ⨝ roles, so revoking anon's SELECT here would 42501 anon
-- reads of tables that have nothing to do with roles. RLS keeps anon at zero
-- rows anyway — `roles`' only policy is TO authenticated and user_roles' is
-- `user_id = auth.uid()`, which is NULL for anon — so the grant satisfies a
-- permission check without opening a read.
--
-- TRIGGER and MAINTAIN are left alone, as on profiles and designer_clients:
-- not reachable through PostgREST, and clearing them would be a change this
-- migration cannot test. 00290's fc_sync_is_designer_from_role trigger fires on
-- user_roles and is unaffected either way — Postgres checks no privilege when
-- firing a trigger.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.roles      FROM anon;
REVOKE INSERT,         DELETE, TRUNCATE, REFERENCES ON public.user_roles FROM authenticated;
REVOKE INSERT,         DELETE, TRUNCATE, REFERENCES ON public.roles      FROM authenticated;

-- Explicit, for the same post-flip reason the vendors and designer_clients
-- blocks state: on a fresh local stack nothing grants these during the
-- migration replay, and the verification block below asserts them. The UPDATE
-- pair is the `FOR SHARE` lock 00511's set_project_studio_id() needs, NOT a
-- write path — both tables have RLS on and neither carries an UPDATE policy.
GRANT SELECT ON public.user_roles TO anon, authenticated;
GRANT SELECT ON public.roles      TO anon, authenticated;
GRANT UPDATE ON public.user_roles TO authenticated;
GRANT UPDATE ON public.roles      TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification — fails the transaction rather than shipping a half-applied fix
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- (a) the world-readable SELECT policy is gone, and nothing PUBLIC replaced it
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polcmd = 'r'
      AND polroles = '{0}'
  ), 'profiles still carries a PUBLIC SELECT policy';

  ASSERT EXISTS (SELECT 1 FROM pg_policy
    WHERE polrelid='public.profiles'::regclass AND polname='profiles_select_self'),
    'profiles_select_self missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policy
    WHERE polrelid='public.profiles'::regclass AND polname='profiles_select_counterparty'),
    'profiles_select_counterparty missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policy
    WHERE polrelid='public.profiles'::regclass AND polname='profiles_select_admin'),
    'profiles_select_admin missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policy
    WHERE polrelid='public.profiles'::regclass AND polname='profiles_select_agent_reader'),
    'profiles_select_agent_reader missing — the Agent-OS read path is broken';

  -- the profiles INSERT hole is closed
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname  = 'Users can insert own profile'
      AND pg_get_expr(polwithcheck, polrelid) ILIKE '%auth.uid() IS NULL%'
  ), 'the anon leg of "Users can insert own profile" survived';

  -- and EVERY permissive INSERT leg pins the AUTHORITY column. Postgres ORs the
  -- permissive WITH CHECKs, so both policies have to carry the pin or neither
  -- does: is_designer is nullable, so an unpinned INSERT is a one-statement
  -- elevation for any live auth.users row that has no profiles row yet.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polcmd = 'a' AND p.polpermissive
      AND NOT (pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer IS NOT TRUE%')
  ), 'a permissive INSERT policy on profiles does not pin is_designer — a homeowner can insert themselves designer authority';
  -- RF3-06: stated as EXISTS + NOT EXISTS rather than as a scalar subquery.
  -- Written as `ASSERT (SELECT … <predicate> FROM pg_policy WHERE …)`, a
  -- DROPPED policy makes the subquery return NULL, ASSERT NULL fails, and the
  -- operator is told the policy is misshapen — about a policy that is not
  -- there. The two failures are different repairs and report separately.
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can insert own profile'
  ), '"Users can insert own profile" is missing — the own-row INSERT path is gone';
  -- RF3-02, fix round 3 pass 3. Fix round 2 asserted the own-row leg PINNED
  -- role; pass 2 asserted it mentioned role NOWHERE (ruling B2 v3(a), RF2-07);
  -- this pass asserts the third and correct shape — a VOCABULARY guard that
  -- does not pin the column to a value.
  --
  -- The three literals are what the product legitimately writes: 'homeowner'
  -- and 'client' are the two halves of the client vocabulary (B2 v3(e)) and
  -- 'designer' is handle_new_user's own column default. 'vendor' and 'admin'
  -- are what the guard removes, and are asserted ABSENT because they are the
  -- two labels pass 2 measured a caller landing (201/201) in the missing-row
  -- window — 'vendor' lists the caller in list_vendor_profiles' picker,
  -- 'admin' makes comms_resolve_role print admin beside their name.
  --
  -- current_profile_role is asserted ABSENT: a pin to the CURRENT value would
  -- be the guess RF2-07 removed, and there is no OLD row on an INSERT to read.
  --
  -- The two NEGATIVE patterns carry `::text` and that is load-bearing. The
  -- SIBLING policy's caller-authority EXISTS deparses as
  -- `r.domain = ANY (ARRAY['designer'::role_domain, 'admin'::role_domain])`,
  -- so a bare '%''admin''%' matches a perfectly correct policy. profiles.role
  -- is text, so its vocabulary literals always render as 'x'::text.
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''homeowner''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''client''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''designer''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) NOT ILIKE '%''vendor''::text%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) NOT ILIKE '%''admin''::text%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) NOT ILIKE '%current_profile_role%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can insert own profile'
  ), '"Users can insert own profile" does not carry the RF3-02 vocabulary guard — role must be held to (''homeowner'',''client'',''designer''), never to ''vendor''/''admin'', and never pinned to the caller''s current value';
  -- RF3-05: and the SIBLING INSERT policy exists at all. The is_designer guard
  -- above is a NOT EXISTS over the permissive INSERT set, so dropping this
  -- policy makes that guard pass VACUOUSLY — it was the one tamper of 27 the
  -- verification block did not catch. Its absence is a real outage: the designer
  -- portal's Add Client flow inserts the homeowner's profiles row through it.
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can create homeowner profiles'
  ), '"Designers can create homeowner profiles" is missing — the Add Client insert path is gone, and the is_designer INSERT guard above now passes vacuously';
  -- RF3-13: and it asks who the CALLER is. 00017 shipped it TO PUBLIC with
  -- `auth.uid() IS NOT NULL AND role = 'homeowner'`, which named designers and
  -- admitted everybody — the last INSERT route by which a self-signup could
  -- plant a profiles row at an arbitrary id. Same two-signal predicate as the
  -- UPDATE sibling and the designer_clients restrictive policies, and the same
  -- prohibition: never profiles.role.
  ASSERT (
    SELECT COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%current_profile_is_designer%'
       AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%user_roles%'
       AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') NOT ILIKE '%current_profile_role%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can create homeowner profiles'
  ), '"Designers can create homeowner profiles" does not check the CALLER''s own designer authority (RF3-13) — any signed-in account can plant a profiles row at an arbitrary id';
  -- and the created row is held to the client vocabulary (B2 v3(e)) — both
  -- strings, quoted, for the reason the UPDATE sibling's guard states.
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''homeowner''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''client''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer IS NOT TRUE%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can create homeowner profiles'
  ), '"Designers can create homeowner profiles" does not hold the created row to role IN (''homeowner'',''client'') AND is_designer IS NOT TRUE (RF3-13)';

  -- anon keeps nothing on profiles or notification_preferences
  ASSERT NOT has_table_privilege('anon', 'public.profiles'::regclass, 'SELECT'),
    'anon still holds SELECT on profiles';
  ASSERT NOT has_table_privilege('anon', 'public.profiles'::regclass, 'INSERT'),
    'anon still holds INSERT on profiles';
  ASSERT NOT has_table_privilege('anon', 'public.profiles'::regclass, 'MAINTAIN'),
    'anon still holds MAINTAIN on profiles';
  ASSERT NOT has_table_privilege('anon', 'public.notification_preferences'::regclass, 'SELECT'),
    'anon still holds SELECT on notification_preferences';
  ASSERT NOT has_table_privilege('anon', 'public.notification_preferences'::regclass, 'UPDATE'),
    'anon still holds UPDATE on notification_preferences';
  ASSERT NOT has_table_privilege('anon', 'public.notification_preferences'::regclass, 'DELETE'),
    'anon still holds DELETE on notification_preferences';

  -- (RF2-08) and no WRITE on designer_clients, where it held the full arwdDxtm
  -- set. SELECT stays and is asserted PRESENT: a storage.objects policy names
  -- this table, and Postgres checks that ACL before filtering policies by role,
  -- so revoking it 42501s every anon read of storage.objects. RLS returns anon
  -- zero rows regardless.
  ASSERT has_table_privilege('anon', 'public.designer_clients'::regclass, 'SELECT'),
    'anon lost SELECT on designer_clients — every anon read of storage.objects now 42501s (00224 policy)';
  ASSERT NOT has_table_privilege('anon', 'public.designer_clients'::regclass, 'INSERT'),
    'anon still holds INSERT on designer_clients — the roster mint is open to the key in the iOS binary';
  ASSERT NOT has_table_privilege('anon', 'public.designer_clients'::regclass, 'UPDATE'),
    'anon still holds UPDATE on designer_clients';
  ASSERT NOT has_table_privilege('anon', 'public.designer_clients'::regclass, 'DELETE'),
    'anon still holds DELETE on designer_clients';
  ASSERT NOT has_table_privilege('anon', 'public.designer_clients'::regclass, 'TRUNCATE'),
    'anon still holds TRUNCATE on designer_clients';
  ASSERT NOT has_table_privilege('anon', 'public.designer_clients'::regclass, 'MAINTAIN'),
    'anon still holds MAINTAIN on designer_clients';
  -- RF3-01: and SELECT is the ONLY thing anon keeps. The assertions above name
  -- the write verbs one at a time; this one is the catch-all behind them, so
  -- the probe in KODY-RUNBOOK B7 / 00555_probes.md §9f-ib can ask for the
  -- privilege SET rather than a count.
  --
  -- ⚠ CORRECTED IN FIX ROUND 3 PASS 3 (RF3-18). Pass 2 wrote this against
  -- information_schema.table_privileges and claimed it "fails on a verb nobody
  -- thought to list". It did not. information_schema is defined by the SQL
  -- standard and enumerates only the standard verbs; PG 17's MAINTAIN is not
  -- one of them, so the single verb this migration REVOKEs by name on three
  -- other tables — the one the grant-hygiene comment in (a) calls out as what
  -- an enumerated REVOKE silently leaves behind — was the one verb this
  -- "exact set" check could not see. A returned MAINTAIN grant would have read
  -- as exactly 'SELECT' and passed.
  --
  -- pg_class.relacl through aclexplode() is Postgres' own representation and
  -- carries every privilege type the server knows, MAINTAIN included. The
  -- separate `NOT has_table_privilege(… 'MAINTAIN')` assertion above stays;
  -- this one now actually backs it up.
  ASSERT (
    SELECT COALESCE(string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type), '<none>')
    FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.designer_clients'::regclass
      AND a.grantee = 'anon'::regrole::oid
  ) = 'SELECT', 'anon holds something other than exactly SELECT on designer_clients (read from pg_class.relacl, so MAINTAIN counts)';

  -- authenticated keeps what the portals and apps need, and loses what it never used
  ASSERT has_table_privilege('authenticated', 'public.profiles'::regclass, 'SELECT'),
    'authenticated lost SELECT on profiles';
  ASSERT NOT has_table_privilege('authenticated', 'public.profiles'::regclass, 'DELETE'),
    'authenticated still holds DELETE on profiles';
  -- (RF2-09) TRUNCATE is not row-level: RLS does not constrain it, so the grant
  -- is a one-statement wipe of the table. REFERENCES lets a grantee pin rows
  -- with an FK of their own.
  ASSERT NOT has_table_privilege('authenticated', 'public.profiles'::regclass, 'TRUNCATE'),
    'authenticated still holds TRUNCATE on profiles — RLS does not constrain TRUNCATE';
  ASSERT NOT has_table_privilege('authenticated', 'public.profiles'::regclass, 'REFERENCES'),
    'authenticated still holds REFERENCES on profiles';
  ASSERT has_table_privilege('authenticated', 'public.designer_clients'::regclass, 'SELECT'),
    'authenticated lost SELECT on designer_clients — the roster rail is broken';
  ASSERT has_table_privilege('authenticated', 'public.designer_clients'::regclass, 'INSERT'),
    'authenticated lost INSERT on designer_clients — the Add Client flow is broken';
  ASSERT has_table_privilege('authenticated', 'public.designer_clients'::regclass, 'UPDATE'),
    'authenticated lost UPDATE on designer_clients';
  -- (RF3-07) the same pair the profiles block above clears, on the roster table.
  -- A TRUNCATE here empties every designer↔client relationship in one statement,
  -- policies or no policies.
  ASSERT NOT has_table_privilege('authenticated', 'public.designer_clients'::regclass, 'TRUNCATE'),
    'authenticated still holds TRUNCATE on designer_clients — RLS does not constrain TRUNCATE';
  ASSERT NOT has_table_privilege('authenticated', 'public.designer_clients'::regclass, 'REFERENCES'),
    'authenticated still holds REFERENCES on designer_clients';
  ASSERT has_table_privilege('authenticated', 'public.notification_preferences'::regclass, 'SELECT'),
    'authenticated lost SELECT on notification_preferences';
  ASSERT has_table_privilege('authenticated', 'public.vendors'::regclass, 'SELECT'),
    'authenticated lost SELECT on vendors';

  -- (c) anon reads the public face of a vendor and nothing else
  ASSERT has_column_privilege('anon', 'public.vendors'::regclass, 'name', 'SELECT'),
    'anon lost vendors.name — the product embed will break';
  ASSERT has_column_privilege('anon', 'public.vendors'::regclass, 'id', 'SELECT'),
    'anon lost vendors.id — the product embed will break';
  ASSERT has_column_privilege('anon', 'public.vendors'::regclass, 'made_in', 'SELECT'),
    'anon lost vendors.made_in — productSelect names it';
  ASSERT has_column_privilege('anon', 'public.vendors'::regclass, 'brand_story', 'SELECT'),
    'anon lost vendors.brand_story — productSelect names it';
  ASSERT NOT has_column_privilege('anon', 'public.vendors'::regclass, 'notes', 'SELECT'),
    'anon can still read vendors.notes';
  ASSERT NOT has_column_privilege('anon', 'public.vendors'::regclass, 'trade_terms', 'SELECT'),
    'anon can still read vendors.trade_terms';
  ASSERT NOT has_column_privilege('anon', 'public.vendors'::regclass, 'contact_info', 'SELECT'),
    'anon can still read vendors.contact_info';
  ASSERT NOT has_table_privilege('anon', 'public.vendors'::regclass, 'UPDATE'),
    'anon still holds UPDATE on vendors';

  -- (d) the definer views are closed to the anon key
  ASSERT NOT has_table_privilege('anon', 'public.user_engagement_scores'::regclass, 'SELECT'),
    'anon can still read user_engagement_scores (id, email, role)';
  ASSERT NOT has_table_privilege('anon', 'public.consumer_funnel'::regclass, 'SELECT'),
    'anon can still read consumer_funnel';
  ASSERT NOT has_table_privilege('anon', 'public.designer_funnel'::regclass, 'SELECT'),
    'anon can still read designer_funnel';
  ASSERT NOT has_table_privilege('anon', 'public.conversion_funnel'::regclass, 'SELECT'),
    'anon can still read conversion_funnel';
  -- RF3-17: and to the SIGNED-IN key. The four REVOKEs in §(d) name
  -- `PUBLIC, anon, authenticated`, but only anon was asserted — so a future
  -- edit that dropped `authenticated` from those lines would have passed the
  -- whole verification block while leaving every signed-in user reading
  -- user_engagement_scores (id, email, role) through a view that bypasses
  -- profiles RLS by construction. That is the one of the four this file calls
  -- the blocker, and it is a second door onto exactly the email list §(a)
  -- closes. The nine browser-client call sites that 42501 as a result are
  -- READERS §4, none of them mounted.
  ASSERT NOT has_table_privilege('authenticated', 'public.user_engagement_scores'::regclass, 'SELECT'),
    'authenticated can still read user_engagement_scores (id, email, role) — the definer view bypasses profiles RLS, so §(a) is decorative for any signed-in caller';
  ASSERT NOT has_table_privilege('authenticated', 'public.consumer_funnel'::regclass, 'SELECT'),
    'authenticated can still read consumer_funnel';
  ASSERT NOT has_table_privilege('authenticated', 'public.designer_funnel'::regclass, 'SELECT'),
    'authenticated can still read designer_funnel';
  ASSERT NOT has_table_privilege('authenticated', 'public.conversion_funnel'::regclass, 'SELECT'),
    'authenticated can still read conversion_funnel';
  ASSERT has_table_privilege('service_role', 'public.user_engagement_scores'::regclass, 'SELECT'),
    'service_role lost user_engagement_scores — the admin analytics route breaks';

  -- (e) none of the eight ALL-to-PUBLIC policies survive
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polcmd = '*'
      AND p.polroles = '{0}'
      AND pg_get_expr(p.polqual, p.polrelid) = '(auth.uid() IS NULL)'
  ), 'a FOR ALL / TO PUBLIC / auth.uid() IS NULL policy survived';


  -- the helpers are not callable by the unauthenticated key
  ASSERT NOT has_function_privilege('anon', 'public.can_view_profile(uuid)', 'EXECUTE'),
    'anon can execute can_view_profile';
  ASSERT has_function_privilege('authenticated', 'public.can_view_profile(uuid)', 'EXECUTE'),
    'authenticated cannot execute can_view_profile';

  -- RF3-14: BOTH of can_view_profile's roster legs require the roster row's
  -- designer_id to hold real designer authority. Without it a designer_clients
  -- row minted before this migration — which (i-c)'s restrictive policies
  -- cannot reach — was a full-row PII read of the client it named, and the
  -- teammate leg was a second route to the same read because
  -- is_studio_comember's first branch is `p_owner = auth.uid()`.
  --
  -- The guard reads the FUNCTION BODY, and it names the aliases rather than the
  -- column: `is_designer` appears in this file inside
  -- current_profile_is_designer's own name, and `user_roles` appears in several
  -- policies, so a word-level match would pass on a body that had dropped the
  -- clause. `dp.is_designer` and `ur.user_id = dc.designer_id` exist only here.
  -- Two occurrences of each are required — one leg is not both legs.
  ASSERT (
    SELECT (length(p.prosrc) - length(replace(p.prosrc, 'dp.is_designer IS TRUE', ''))) / length('dp.is_designer IS TRUE') = 2
       AND (length(p.prosrc) - length(replace(p.prosrc, 'ur.user_id = dc.designer_id', ''))) / length('ur.user_id = dc.designer_id') = 2
       AND p.prosrc NOT ILIKE '%current_profile_role%'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_view_profile'
  ), 'can_view_profile does not require BOTH roster legs'' designer_id to hold designer authority (RF3-14) — a pre-00555 self-minted roster row is still a PII read of the client it names';

  -- role self-elevation is closed, and the server default is in place
  ASSERT (
    SELECT p.polwithcheck IS NOT NULL FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), '"Users can update own profile" still has no WITH CHECK — role self-elevation is open';
  -- and the sibling, without which the line above is decorative: a permissive
  -- UPDATE policy with a NULL WITH CHECK reuses its USING and ORs around the pin.
  ASSERT (
    SELECT p.polwithcheck IS NOT NULL FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), '"Designers can update their client profiles" still has no WITH CHECK — a self-inserted designer_clients row bypasses the role pin';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polcmd = 'w' AND p.polpermissive AND p.polwithcheck IS NULL
  ), 'a permissive UPDATE policy on profiles has no WITH CHECK — it reuses its USING and re-opens role self-elevation';
  ASSERT NOT has_function_privilege('anon', 'public.current_profile_role()', 'EXECUTE'),
    'anon can execute current_profile_role';
  ASSERT has_function_privilege('authenticated', 'public.current_profile_role()', 'EXECUTE'),
    'authenticated cannot execute current_profile_role — the UPDATE policy denies every write';

  -- is_designer is the AUTHORITY column (00286/00330/00285 read it, not role),
  -- so both permissive UPDATE policies must PIN it. These guards match the
  -- COMPARISON, not the column name: an earlier cut asserted
  -- `ILIKE '%is_designer%'`, which the substring inside
  -- current_profile_is_designer() satisfies all on its own — so a future edit
  -- to `AND public.current_profile_is_designer() IS NOT NULL`, which pins
  -- nothing, would have passed every one of them. Same failure the
  -- handle_new_user guard below corrects: read the expression, not the word.
  --
  -- Postgres DEPARSES `a IS NOT DISTINCT FROM b` as `NOT (a IS DISTINCT FROM b)`,
  -- so the guard has to accept the rendered spelling as well as the source one.
  -- Both are listed rather than only the rendered form, so this line still reads
  -- as the pin it is checking.
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer IS NOT DISTINCT FROM%'
        OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%NOT (is_designer IS DISTINCT FROM%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), '"Users can update own profile" WITH CHECK does not pin is_designer to its current value — a homeowner can PATCH themselves into the design-request pool';
  -- ruling B2 v3(c): the pin is a RATCHET, so the only other value either column
  -- may take is the floor. Assert the floor legs are present AND that they are
  -- the only escape — `is_designer = false`, never `= true`.
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer = false%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) NOT ILIKE '%is_designer = true%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%role = ''homeowner''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) NOT ILIKE '%role = ''designer''%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), '"Users can update own profile" WITH CHECK is not the one-way ratchet ruling B2 v3(c) requires — role may only fall to homeowner and is_designer only to false';
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer IS NOT TRUE%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), '"Designers can update their client profiles" WITH CHECK does not pin is_designer — a self-inserted designer_clients row still reaches designer authority';
  -- and the OLD-row half, which is what stops a DEMOTION. Pinning only the new
  -- row to the client vocabulary + is_designer IS NOT TRUE is satisfied by
  -- construction when the attacker is turning a designer INTO a homeowner.
  -- Both client strings are required (ruling B2 v3(e), RF2-06): dropping
  -- 'client' from the list makes a designer unable to rename their own client.
  -- The patterns QUOTE the strings, because the unquoted words `client` and
  -- `designer_clients` are all over this predicate's EXISTS subquery and an
  -- ILIKE '%client%' would pass on a policy that had dropped the literal.
  ASSERT (
    SELECT pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_designer IS NOT TRUE%'
       AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%''homeowner''%'
       AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%''client''%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), '"Designers can update their client profiles" USING does not read the OLD row''s role/is_designer over BOTH client strings — a rostered designer can be demoted, or a ''client''-labelled client cannot be renamed';
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''homeowner''%'
       AND pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%''client''%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), '"Designers can update their client profiles" WITH CHECK does not carry both client strings (ruling B2 v3(e))';
  -- RF3-03: and BOTH clauses ask what the CALLER is, not only what the target
  -- row is. Without this the roster row was the whole admission test, so every
  -- pre-00555 roster row minted by a non-designer kept the profile write — and
  -- (i-c)'s restrictive policies cannot reach a row that already exists.
  ASSERT (
    SELECT COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ILIKE '%current_profile_is_designer%'
       AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ILIKE '%user_roles%'
       AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%current_profile_is_designer%'
       AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%user_roles%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), '"Designers can update their client profiles" does not check the CALLER''s own authority in both clauses — a legacy roster row still lets a non-designer rewrite a client profile (RF3-03)';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
             || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ILIKE '%current_profile_role%'
  ), '"Designers can update their client profiles" reads profiles.role as authority — ruling B2 v3(b) says user_roles or is_designer only';
  ASSERT NOT has_function_privilege('anon', 'public.current_profile_is_designer()', 'EXECUTE'),
    'anon can execute current_profile_is_designer';
  ASSERT has_function_privilege('authenticated', 'public.current_profile_is_designer()', 'EXECUTE'),
    'authenticated cannot execute current_profile_is_designer — the UPDATE policy denies every write';

  -- the enabling primitive: designer_clients may only be written by a designer.
  -- Restrictive, so it ANDs onto whichever permissive leg admitted the row.
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname  = 'designer_clients_writer_is_designer'
      AND NOT p.polpermissive
      AND p.polcmd = 'a'
  ), 'designer_clients has no restrictive INSERT policy — any authenticated account can mint the roster row that reaches a stranger''s profile';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname  = 'designer_clients_updater_is_designer'
      AND NOT p.polpermissive
      AND p.polcmd = 'w'
  ), 'designer_clients has no restrictive UPDATE policy — a legacy roster row can be re-pointed by a non-designer';

  -- RF2-01: and neither of them reads profiles.role. Fix round 2 shipped both
  -- with an `OR current_profile_role() IN ('designer','admin','super_admin')`
  -- leg, which handed the mint back to every email/password signup — because
  -- handle_new_user writes exactly that label for one. The guard names the
  -- helper rather than the word "role": `role` is a substring of far too much
  -- of this predicate to match on.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname IN ('designer_clients_writer_is_designer',
                        'designer_clients_updater_is_designer')
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
             || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ILIKE '%current_profile_role%'
  ), 'a designer_clients restrictive policy still reads profiles.role — ruling B2 v3(b) says authority is user_roles or is_designer only';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname IN ('designer_clients_writer_is_designer',
                        'designer_clients_updater_is_designer')
      AND NOT ((COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
                  || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
               ILIKE '%user_roles%')
  ), 'a designer_clients restrictive policy does not read user_roles — the designer-grant leg is missing';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname IN ('designer_clients_writer_is_designer',
                        'designer_clients_updater_is_designer')
      AND NOT ((COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
                  || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
               ILIKE '%current_profile_is_designer%')
  ), 'a designer_clients restrictive policy does not read profiles.is_designer';

  -- RULING B2 v3(a): handle_new_user is 00313 VERBATIM. The guard reads the
  -- COALESCE, which is the line the two reverted cuts replaced — v1 with
  -- COALESCE(v_role,'homeowner'), v2 with a CASE on raw_app_meta_data that had
  -- no COALESCE at all. It also rejects raw_app_meta_data outright: that token
  -- appears nowhere in 00313, so its presence means a provider branch crept
  -- back in. A `LIKE '%homeowner%'` guard would prove nothing either way —
  -- 00313's body carries the literal twice, in the hint arm and its comment.
  ASSERT (
    SELECT pg_get_functiondef(p.oid) LIKE '%COALESCE(v_role, ''designer'')%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%raw_app_meta_data%'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ), 'handle_new_user() is not 00313''s body — ruling B2 v3(a) keeps COALESCE(v_role, ''designer'') and no identity-provider branch';
  -- RF2-10
  ASSERT NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
    'anon can execute handle_new_user';
  ASSERT NOT has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE'),
    'PUBLIC can execute handle_new_user';
  -- RF3-11
  ASSERT NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
    'authenticated can execute handle_new_user — the same exposed-surface-with-no-caller argument that removed anon';

  -- RF2-11: every function this migration creates pins search_path explicitly,
  -- pg_temp included. A SECURITY DEFINER function that leaves pg_temp implicitly
  -- at the front of the path can be shadowed by a caller-created temp object.
  ASSERT (
    SELECT bool_and('search_path=public, pg_temp' = ANY (COALESCE(p.proconfig, '{}')))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('can_view_profile', 'current_profile_role',
                        'current_profile_is_designer',
                        'search_shareable_designers', 'list_vendor_profiles')
  ), 'a 00555 helper does not pin search_path to "public, pg_temp"';
  ASSERT NOT has_function_privilege('anon', 'public.search_shareable_designers(text)', 'EXECUTE'),
    'anon can execute search_shareable_designers';
  ASSERT has_function_privilege('authenticated', 'public.search_shareable_designers(text)', 'EXECUTE'),
    'authenticated cannot execute search_shareable_designers';
  ASSERT NOT has_function_privilege('anon', 'public.list_vendor_profiles()', 'EXECUTE'),
    'anon can execute list_vendor_profiles';
  ASSERT has_function_privilege('authenticated', 'public.list_vendor_profiles()', 'EXECUTE'),
    'authenticated cannot execute list_vendor_profiles';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='search_shareable_designers'
      AND p.prosrc ILIKE '%email%'
  ), 'search_shareable_designers references email';

  -- (f) RF3-19: the two authority tables keep SELECT for both roles and hold no
  -- write verb for either. Neither has ever carried a write POLICY (00021 makes
  -- exactly two policies on them, both SELECT), so every write grant was a
  -- grant with no caller — on the tables ruling B2 v3(b) makes the source of
  -- all authority in this file.
  ASSERT has_table_privilege('anon', 'public.user_roles'::regclass, 'SELECT'),
    'anon lost SELECT on user_roles — Postgres checks the ACL of every table named in a policy set at executor init, so dozens of unrelated anon reads now 42501';
  ASSERT has_table_privilege('anon', 'public.roles'::regclass, 'SELECT'),
    'anon lost SELECT on roles — same executor-init ACL check as user_roles';
  ASSERT has_table_privilege('authenticated', 'public.user_roles'::regclass, 'SELECT'),
    'authenticated lost SELECT on user_roles — every role resolution in both portals and both iOS apps breaks';
  ASSERT has_table_privilege('authenticated', 'public.roles'::regclass, 'SELECT'),
    'authenticated lost SELECT on roles — the user_roles ⨝ roles.domain join breaks';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['public.user_roles', 'public.roles']) AS t(rel),
         unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES']) AS v(verb)
    WHERE has_table_privilege('anon', t.rel::regclass, v.verb)
  ), 'anon still holds a write verb on user_roles or roles — neither table has a write POLICY, so the grant has no caller and one future permissive policy turns it into self-promotion';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['public.user_roles', 'public.roles']) AS t(rel),
         unnest(ARRAY['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES']) AS v(verb)
    WHERE has_table_privilege('authenticated', t.rel::regclass, v.verb)
  ), 'authenticated still holds INSERT, DELETE, TRUNCATE or REFERENCES on user_roles or roles';
  -- UPDATE is the one verb `authenticated` keeps, and it is asserted PRESENT
  -- rather than absent: `SELECT … FOR SHARE` is charged to the UPDATE
  -- privilege, and 00511's SECURITY INVOKER trigger set_project_studio_id()
  -- row-share-locks both tables on every authenticated project write. Revoking
  -- it takes every project insert with it — measured, see the block above.
  ASSERT has_table_privilege('authenticated', 'public.user_roles'::regclass, 'UPDATE'),
    'authenticated lost UPDATE on user_roles — set_project_studio_id() FOR SHARE locks it, so every authenticated project insert now 42501s';
  ASSERT has_table_privilege('authenticated', 'public.roles'::regclass, 'UPDATE'),
    'authenticated lost UPDATE on roles — set_project_studio_id() FOR SHARE locks it, so every authenticated project insert now 42501s';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification, part 2 — BEHAVIOUR, not shape (RF3-20)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Everything above reads pg_policy, pg_proc and the ACLs: it proves the objects
-- have the shape this file intends. It cannot prove any of them RUNS. A helper
-- that compiles, is SECURITY DEFINER, pins its search_path and holds the right
-- grants can still return the wrong answer — and four policies now depend on
-- three of these helpers, so a helper that errors takes the table with it.
--
-- The five checks below call each helper once, under a fabricated auth.uid()
-- set with `set_config(…, is_local => true)`. is_local means the setting dies
-- with this transaction (at the COMMIT below), so nothing leaks into the
-- session that ran the migration; the block resets it explicitly anyway.
--
-- Every assertion here is DATA-INDEPENDENT — it holds on an empty database, on
-- a fresh local stack and on production — because a migration's verification
-- block must not depend on rows it did not create. The behaviour that DOES
-- depend on fixtures (which counterparty legs admit whom, what the ratchet
-- refuses, what the pickers return) is the test suite's job:
-- supabase/tests/rls/00555_ios_round_one_security.test.sql, run through
-- scripts/run-sql-tests.sh, which is the local gate.
DO $$
DECLARE
  -- Two uuids that cannot exist: v4-shaped, in the 00555-probe band, and never
  -- inserted anywhere. Every EXISTS leg in can_view_profile is keyed on real
  -- ids, so both answers below are structural rather than lucky.
  v_probe uuid := '00000000-0000-4000-8000-0000005550a1';
  v_other uuid := '00000000-0000-4000-8000-0000005550a2';
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_probe::text, 'role', 'authenticated')::text,
                     true);

  -- current_profile_role / current_profile_is_designer: a caller with NO
  -- profiles row reads NULL, not false and not an error. This is the case the
  -- ratchet on "Users can update own profile" meets in the missing-row window
  -- §a4 describes, and `IS NOT DISTINCT FROM` is what makes NULL safe there —
  -- an `IN (…)` spelling would refuse the owner's own write. §a2(i-a) says so
  -- in prose; this is the check.
  ASSERT public.current_profile_role() IS NULL,
    'current_profile_role() did not return NULL for a caller with no profiles row';
  ASSERT public.current_profile_is_designer() IS NULL,
    'current_profile_is_designer() did not return NULL for a caller with no profiles row';

  -- can_view_profile: the self leg admits, and a stranger with no relationship
  -- of any kind does not. FALSE and not NULL — a NULL here would make
  -- profiles_select_counterparty deny silently for reasons no one could read.
  ASSERT public.can_view_profile(v_probe) IS TRUE,
    'can_view_profile() refused the caller their OWN row — profiles_select_counterparty is broken';
  ASSERT public.can_view_profile(v_other) IS FALSE,
    'can_view_profile() did not return FALSE for a stranger with no relationship';

  -- search_shareable_designers: the two-character floor holds against a
  -- WILDCARD query. '%' is one character after the escape, so the floor refuses
  -- it; without the escape it would be a pattern matching every designer on the
  -- platform, which is the enumeration the floor exists to prevent.
  ASSERT (SELECT count(*) FROM public.search_shareable_designers('%')) = 0,
    'search_shareable_designers() returned rows for the single-character wildcard query ''%'' — the LIKE escape or the two-character floor is not working';

  -- and both directories refuse an unauthenticated caller outright, which is
  -- the `auth.uid() IS NOT NULL` line in each body rather than the EXECUTE
  -- grant (anon cannot reach them at all; this proves the in-body guard).
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT count(*) FROM public.list_vendor_profiles()) = 0,
    'list_vendor_profiles() returned rows with no auth.uid() — its in-body authentication guard is not working';
  ASSERT (SELECT count(*) FROM public.search_shareable_designers('leah')) = 0,
    'search_shareable_designers() returned rows with no auth.uid() — its in-body authentication guard is not working';
  ASSERT public.can_view_profile(v_probe) IS FALSE,
    'can_view_profile() admitted a caller with no auth.uid()';

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- READERS: what this migration preserves, degrades, and breaks
--
-- Every cross-user profiles read in the portals, the shared hooks and both iOS
-- apps was enumerated before the predicate above was written.
--
-- ── 1. UNAFFECTED — service_role, which is BYPASSRLS ───────────────────────
--
-- All ~30 Supabase edge functions that read profiles (stripe-webhook,
-- invoice-send/-reminders, proposal-nudge, decision-*, campaign-dispatch,
-- notification-*, spec-pdf, po-send, client-invite, designer-invite,
-- workspace-member-invite, create-checkout-session, resend-webhook,
-- review-requests, trade-rfq-send, quote-request-send, delete-account,
-- automation-processor, sms-*, and _shared/{send-email,sms}.ts) build their
-- client from SUPABASE_SERVICE_ROLE_KEY. Several also build a caller-JWT
-- client, but only for auth.getUser() or an RPC capability check — never for
-- the profiles read. Same for every admin-portal route (all createAdminClient)
-- and both GDPR export paths.
--
-- ── 2. COVERED by a leg of can_view_profile ────────────────────────────────
--
--   comms threads   use-comms.ts:158,234,279,325,453,983 · use-inbox.ts:162 ·
--                   use-clients.ts:407 · Capture SupabaseMessagingService.swift:194
--                   · Patina ProfileLookupService.swift:75
--   projects        use-project-v2.ts:24,25 · use-projects.ts:21 ·
--                   designer-portal use-projects.ts:127,128,170,171 ·
--                   api/pulse/send-email/route.ts:67,68 ·
--                   Patina ProjectsAPIClient.swift:177 ·
--                   Capture SupabaseProjectsService.swift:63,86
--   roster          use-clients.ts:108,115,161 · use-reviews.ts:87,247 ·
--                   use-nurture.ts:81 · use-decisions.ts:303 ·
--                   use-client-side-reviews.ts:37 · ShareScanDialog.tsx:42 ·
--                   nurture-send/route.ts:64 · reviews/[reviewId]/send/route.ts:73 ·
--                   Capture SupabaseDecisionsReadService.swift:81
--   proposals/teams use-proposals.ts:330,374 · use-earnings.ts:89 ·
--                   use-proposal-team.ts:39 · use-project-team.ts:37 ·
--                   use-time-tracking.ts:128,700
--   invoices        use-invoices.ts:397,428,430,431 · Patina InvoicesAPIClient.swift:190
--   leads           use-leads.ts:135,187 (status <> 'new' only — see below) ·
--                   Capture SupabaseLeadsService.swift:38 ·
--                   Patina DesignRequestStatusService.swift:797
--   room scans      use-room-scan-associations.ts:144,151,233,240,286,329,371 ·
--                   Patina ScanSharingService.swift:215,254,285,399
--                   (accepted/active shares only — see below)
--   direct orders   Patina FulfillmentAPIClient.swift:197
--   studio          use-organizations.ts:211 · schedule-line-unfold.tsx:89 ·
--                   board-item-direction-panel.tsx:32
--   admin           use-audit-logs.ts:108 · use-onboarding.ts:208,242 ·
--                   use-insights.ts:97   (via profiles_select_admin)
--
-- ── 3. SILENT DEGRADATIONS — 200 OK, null embed, no error ──────────────────
--
-- These reach a profile through a relationship that can_view_profile does NOT
-- model. PostgREST answers 200 with the embedded object null, so nothing logs
-- and nothing throws — the name just disappears from the UI. Each needs a look
-- before the build ships.
--
--   packages/supabase/src/hooks/use-proposals.ts:1542
--     `viewer:profiles!viewer_id(id, full_name, email)` on proposal views. A
--     viewer can be a cc'd recipient who is neither the designer nor the
--     client, in which case no leg matches. Byline goes null.
--   apps/designer-portal/src/hooks/use-commercial-documents.ts:1290
--     `acceptance_recorded_by_profile:profiles!acceptance_recorded_by(full_name)`.
--     Covered when the recorder is a studio co-member; null when they have left
--     the studio or were never in it. This is an audit field, so the null is
--     worse than cosmetic.
--   apps/designer-portal/src/app/api/comms/v1/threads/route.ts:72 and
--   apps/designer-portal/src/app/api/comms/v1/threads/[id]/route.ts:64
--     Both embed thread participants WITHOUT a `left_at IS NULL` filter, while
--     the comms leg requires both sides still in the thread. A departed
--     participant's name goes null in thread history.
--   packages/supabase/src/hooks/use-room-scans.ts:108,160 and
--   packages/supabase/src/hooks/use-rooms.ts:122,170
--     `user:profiles!user_id(...)` — the scan/room OWNER. Covered only when a
--     live room_scan_associations row exists. A designer browsing a scan reached
--     through a project rather than a share sees no owner name.
--   apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift:53
--     `approver:profiles!site_binder_entries_approved_by_fkey(full_name)`.
--     Covered for a current studio co-member; null for a past one.
--   packages/supabase/src/hooks/use-vendors.ts:319
--     `designer:profiles!vendor_reviews_designer_id_fkey(id, full_name, avatar_url)`.
--     A review's author is never a counterparty of the reader. Byline ALWAYS
--     null. Cheapest honest fix: denormalize the author name onto vendor_reviews
--     at write time.
--   packages/supabase/src/hooks/use-availability.ts:51
--     Reads availability_status for an ARBITRARY userId (the file's own comment
--     anticipates "client portal chat can read a designer's availability").
--     Works for a counterparty, silently empty otherwise.
--   packages/supabase/src/hooks/use-leads.ts:135,187
--     `homeowner:profiles!homeowner_id(...)` is null for `status = 'new'` rows
--     by design (see the leads leg). The row's own contact_name/contact_email
--     still render, so the list is not blank — but the avatar is.
--   public.people_directory (00478) — SECURITY INVOKER, so the new policies
--     filter it. Its client branch computes
--       display_name = COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client')
--       email        = COALESCE(dc.client_email, pr.email)
--       phone        = pr.phone                    ← NO fallback
--     so a profile the caller cannot see costs the phone number outright and
--     costs the email whenever dc.client_email is unset. CHOSEN REMEDY: the
--     studio-scope legs added to can_view_profile above (a teammate's client,
--     a teammate's engaged lead), which is the same scope 00420/00421 already
--     grant on the roster row itself. NOT chosen: adding COALESCE fallbacks to
--     the view, which would need a redefinition of a 300-line view whose column
--     ORDER is pinned by a regression test (people_directory_scope_test.sql
--     case (a)) — a bigger and riskier diff than the policy leg.
--
--   Five more SECURITY INVOKER views read profiles and are filtered the same
--   way: document_state, v_project_roster, margin_items, room_scan_documents
--   (all LEFT JOIN — a missed relationship nulls a name) and
--   project_unbilled_time (INNER JOIN profiles on te.user_id — a missed
--   relationship LOSES THE ROW and understates unbilled time). Probe 9e in
--   00555_probes.md is the check.
--
-- ── 4. HARD BREAKS — these throw, and must be fixed in code ────────────────
--
--   apps/mobile/Patina/.../ScanSharingService.swift:373-380  → RPC (a3) above
--   apps/designer-portal/src/app/api/catalog/vendors/route.ts:5-13
--   apps/designer-portal/src/app/api/catalog/vendors/[id]/route.ts:5-18
--   packages/supabase/src/hooks/use-comms.ts:1060-1065
--   apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:218 —
--     `.currentUser` is the literal path "/rest/v1/profiles?select=*" with NO id
--     filter. Unreferenced dead code; under the OLD policy, wiring it up would
--     have dumped every profile row and column. Delete it rather than fix it.
--
--   All four live ones are written up with their remedies in the REQUIRED CODE
--   FOLLOW-UPS block at the head of this file.
--
--   HARD BREAKS IF EVER MOUNTED — the four definer views §(d) revokes (RF3-10).
--   Nine call sites read them on the BROWSER client, so `REVOKE … FROM
--   authenticated` takes them to 42501, and each is `if (error) throw error`:
--     packages/supabase/src/hooks/use-insights.ts:104   user_engagement_scores
--     packages/supabase/src/hooks/use-insights.ts:235   conversion_funnel
--     packages/supabase/src/hooks/use-insights.ts:266   conversion_funnel
--     packages/supabase/src/hooks/use-insights.ts:350   designer_funnel
--     packages/supabase/src/hooks/use-insights.ts:367   consumer_funnel
--     packages/supabase/src/hooks/use-insights.ts:384   user_engagement_scores
--     packages/supabase/src/hooks/use-engagement.ts:65  user_engagement_scores
--     packages/supabase/src/hooks/use-engagement.ts:98  user_engagement_scores
--   NONE of them is mounted today: a grep over apps/ for useInsightsOverview,
--   useConversionFunnel, useDesignerFunnel, useConsumerFunnel, useEngagementScore
--   and useMyEngagementScore returns only packages/supabase/src/hooks/index.ts
--   re-exporting them. The admin analytics page's useEngagementCohorts goes
--   through /api/admin/comms/analytics on the service-role client and is
--   unaffected. Listed here rather than asserted away, so the lane that first
--   wires one of these into a page reads this instead of discovering it in prod.
--   Remedy then: a service-role route or a definer RPC, never a re-grant.
--
-- ── AFTER APPLY ────────────────────────────────────────────────────────────
--   • supabase functions deploy client-invite       (RULING B2 v3(d): the accept
--     handler now writes profiles.role = 'homeowner' for the accepting user.
--     KODY-RUNBOOK Block A step A10. Clients who accepted BEFORE that deploy
--     keep the old label until the one-time backfill in Block B7b.)
--   • the two read-only pre-apply audits in KODY-RUNBOOK B7a — who owns a
--     designer_clients row, by the two signals the new restrictive policies
--     read. Run them BEFORE the apply: they say whether (a2)(i-c) costs any
--     real production designer their Add Client flow.
--   • python3 scripts/generate-legacy-grants.py  (this file adds GRANT/REVOKE,
--     so supabase/seed/00-legacy-grants.sql must be regenerated or a fresh
--     local stack will diverge from prod ACLs)
--   • pnpm db:generate                            (public schema changed: FIVE
--     new functions — can_view_profile, current_profile_role,
--     current_profile_is_designer, search_shareable_designers,
--     list_vendor_profiles — and NO new view; profile_cards was cut from this
--     migration)
--   • scripts/run-sql-tests.sh                    (the whole suite vs
--     KNOWN_FAILURES.md — that, not the single file, is the local gate)
--   • the anon/authenticated probes in 00555_probes.md
-- ═══════════════════════════════════════════════════════════════════════════
