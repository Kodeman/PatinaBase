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
--                    body grafted verbatim from 00313, one token changed; see (a2)(ii)
--   can_view_profile / search_shareable_designers / list_vendor_profiles  new here
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
-- profiles.role to 'designer'. See section (a2) below.
--
-- ── WHAT IT DOES NOT FIX ───────────────────────────────────────────────────
--
-- Two limits, both deliberate, both needing a ruling (see DECISION DM-1):
--
-- 1. THE COUNTERPARTY PREDICATE IS SELF-ASSERTABLE. `can_view_profile` admits a
--    caller who shares a roster row, project, proposal, invoice, lead, direct
--    order, room-scan share, message thread or studio with the target. Several
--    of those tables let an ordinary authenticated user INSERT the linking row
--    themselves — `designer_clients`, `projects`, `comms_thread_participants`,
--    `project_team_members` and `room_scan_associations` all have INSERT
--    policies reachable by a signed-up designer. So a determined signed-in user
--    can still manufacture a relationship and read a target profile. This is
--    strictly better than `USING (true)` — it costs a write, leaves an audit
--    trail, and cannot be done at all by the anon key — but it is a speed bump,
--    not a wall.
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

CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_profile_id IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND (
       p_profile_id = (SELECT auth.uid())

       -- designer ↔ client roster, both directions
       OR EXISTS (
         SELECT 1 FROM designer_clients dc
         WHERE (dc.designer_id = (SELECT auth.uid()) AND dc.client_id = p_profile_id)
            OR (dc.client_id  = (SELECT auth.uid()) AND dc.designer_id = p_profile_id)
       )

       -- a studio teammate's client. people_directory's client branch is
       -- studio-scoped (00420/00421) and already shows a co-member the roster
       -- row itself — client_name, client_email, notes. Resolving that client's
       -- profile is consistent with what the co-member can already read, and
       -- without it people_directory.phone (00478:150, `pr.phone`, which has NO
       -- COALESCE fallback) goes NULL for every teammate's client.
       OR EXISTS (
         SELECT 1 FROM designer_clients dc
         WHERE dc.client_id = p_profile_id
           AND public.is_studio_comember(dc.designer_id)
       )

       -- the two named sides of a project, plus its lead designer and creator
       OR EXISTS (
         SELECT 1 FROM projects pr
         WHERE (SELECT auth.uid()) IN (pr.designer_id, pr.client_id, pr.lead_designer_id, pr.created_by, pr.client_profile_id)
           AND p_profile_id       IN (pr.designer_id, pr.client_id, pr.lead_designer_id, pr.created_by, pr.client_profile_id)
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
  'CAVEAT 1: several of those linking rows are INSERTable by an ordinary '
  'authenticated user, so this predicate is SELF-ASSERTABLE — it raises the cost '
  'of reading a stranger''s profile, it does not prevent it. CAVEAT 2: admitting '
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

-- Supporting indexes for the two counterparty legs that have no index on the
-- column they filter (verified absent on Strata via pg_indexes). The predicate
-- runs once per candidate row, so an unindexed leg is a sequential scan of
-- fulfillment_orders / projects per profile row returned.
CREATE INDEX IF NOT EXISTS idx_fulfillment_orders_designer_profile
  ON public.fulfillment_orders (designer_profile_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_profile
  ON public.projects (client_profile_id);

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
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

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

-- ─── (a2) profiles.role: close the self-elevation the UPDATE policy leaves ──
--
-- 00013_profiles_table.sql:60-61 shipped
--     CREATE POLICY "Users can update own profile" ON profiles
--       FOR UPDATE USING (auth.uid() = id);
-- No WITH CHECK and no column restriction. Combined with the UPDATE grant three
-- lines above, ANY authenticated user can set their own profiles.role to
-- 'designer'. That is a privilege-escalation path, and it is not hypothetical
-- for this program: finding A3-07's proposed client-side remedy (the Apple
-- sign-in path writing role: homeowner after success, because supabase-swift's
-- signInWithIdToken has no data: parameter) works ONLY because this hole exists.
-- Without the two changes below, a "security migration" would entrench the hole
-- and the app would depend on it — and any later migration that restricts the
-- role column would silently turn Apple sign-ups back into designers.
--
-- Fix, in two halves:
--   (i)  the client may update its own row but may NOT change its own role;
--   (ii) the SERVER defaults an app sign-up to homeowner (below, in the
--        handle_new_user block), so role is never the client's to set.
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
SET search_path TO 'public'
AS $$
  SELECT p.role FROM profiles p WHERE p.id = (SELECT auth.uid());
$$;

-- Postgres checks policy-function EXECUTE at executor-init (see 00510), so the
-- grant is not optional — without it the policy below denies every update.
REVOKE EXECUTE ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

COMMENT ON FUNCTION public.current_profile_role() IS
  'The calling user''s own profiles.role, read past RLS. Exists solely so the '
  '"Users can update own profile" WITH CHECK can pin the role column without '
  'the inline subquery that made the policy self-recursive (42P17). Returns '
  'only the caller''s own row, so being PostgREST-exposed to authenticated '
  'tells a caller nothing it could not already read. Added 00555.';

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING  ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND role IS NOT DISTINCT FROM public.current_profile_role()
  );

COMMENT ON POLICY "Users can update own profile" ON public.profiles IS
  'Owner may update their own row. WITH CHECK pins profiles.role to its current '
  'value: a role change is a service_role / admin operation, never a client '
  'write. Added 00555 (was USING-only since 00013).';

-- (ii) the server-side default. handle_new_user() is SECURITY DEFINER and owned
-- by postgres, so it is not subject to the policy above.
--
-- Lineage: 00013 → 00023 → 00028 → 00039 → 00040 → 00126 → 00313 → (this).
-- The body below is grafted VERBATIM from
-- 00313_handle_new_user_client_role_hint.sql, which is the
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*handle_new_user" \
--     supabase/migrations/*.sql | sort | tail -1
-- winner. The ONLY delta is the last argument of the COALESCE at the INSERT:
-- 'designer' → 'homeowner'. 00313's security rule is untouched — a
-- client-supplied role hint is honored ONLY when it is the literal 'homeowner',
-- so raw_user_meta_data can never self-assign an elevated role.
--
-- An earlier draft of this migration left the body out and asked whoever
-- applied the file to paste it in at apply time. That is not replayable: a
-- local `supabase db reset` would produce a database where this function is
-- unchanged, and the guard that was supposed to catch it
-- (pg_get_functiondef LIKE '%homeowner%') is satisfied twice over by 00313's
-- own body — it would report success over a skipped step. Both are fixed here.
--
-- WHY the default moves: an Apple sign-up carries no creation metadata at all
-- (supabase-swift's signInWithIdToken has no data: parameter), so it fell
-- through to 00313's 'designer' fallback — which is how A3-07's tester became a
-- designer. A3-07's proposed client-side remedy (the app writing its own role
-- after sign-in) works only through the self-elevation hole (i) above closes,
-- so with that hole shut the default MUST move to the server.
--
-- CONSEQUENCE, stated rather than hidden: the designer portal's own self-signup
-- page (apps/designer-portal/src/app/auth/signup/page.tsx:147-157) sends
-- name/company/phone and NO role, so a designer signing up there now lands as
-- profiles.role = 'homeowner' instead of 'designer'. The authoritative role
-- table is public.user_roles — this function still writes 'app_user' there —
-- and profiles.is_designer is synced from user_roles by 00290's trigger, so
-- designer AUTHORITY is unaffected. What changes is the three places that
-- branch on the profiles.role STRING: 00050's designer-onboarding automation,
-- 00103/00104's comms participant-role derivation, and 00038's funnel views.
-- Real designers arrive by studio invite (service_role, which sets the role
-- explicitly). The self-signup path is put in front of Kody as integration note
-- N3 rather than decided here.

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
    COALESCE(v_role, 'homeowner')
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

COMMENT ON FUNCTION public.handle_new_user() IS
  'auth.users INSERT trigger. Creates the profiles row and the default '
  'user_roles ''app_user'' grant. A client-supplied raw_user_meta_data role '
  'hint is honored ONLY for the literal ''homeowner'' (00313); every other '
  'value, and the metadata-less OAuth/Apple path, falls back to ''homeowner'' '
  'as of 00555 — it fell back to ''designer'' from 00013 through 00313, which '
  'is how a metadata-less Apple sign-up became a designer.';

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
SET search_path TO 'public'
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
    AND p.is_designer IS TRUE
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

CREATE OR REPLACE FUNCTION public.list_vendor_profiles()
RETURNS TABLE (
  id         uuid,
  full_name  text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
-- All four are admin-analytics surfaces. Every reader found in the repo goes
-- through an admin-portal route on the service-role client, so revoking anon
-- and authenticated costs nothing; service_role keeps its grant.
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
--   profiles "Designers can create homeowner profiles" is
--   `WITH CHECK ((auth.uid() IS NOT NULL) AND (role = 'homeowner'))` — any
--   authenticated user may insert a profiles row with any id, as long as the
--   role string is 'homeowner'. Left untouched here; flagged for the same
--   review. It is also one of the self-assertion routes named in CAVEAT 1.

DROP POLICY IF EXISTS "Service role full access on audience_segments"    ON public.audience_segments;
DROP POLICY IF EXISTS "Service role full access on automated_sequences"  ON public.automated_sequences;
DROP POLICY IF EXISTS "Service role full access on campaign_analytics"   ON public.campaign_analytics;
DROP POLICY IF EXISTS "Service role full access on campaigns"            ON public.campaigns;
DROP POLICY IF EXISTS "Service role full access on email_templates"      ON public.email_templates;
DROP POLICY IF EXISTS "Service role full access on sequence_enrollments" ON public.sequence_enrollments;
DROP POLICY IF EXISTS "Service role full access to user sessions"        ON public.user_sessions;

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

  -- authenticated keeps what the portals and apps need, and loses what it never used
  ASSERT has_table_privilege('authenticated', 'public.profiles'::regclass, 'SELECT'),
    'authenticated lost SELECT on profiles';
  ASSERT NOT has_table_privilege('authenticated', 'public.profiles'::regclass, 'DELETE'),
    'authenticated still holds DELETE on profiles';
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

  -- role self-elevation is closed, and the server default is in place
  ASSERT (
    SELECT p.polwithcheck IS NOT NULL FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), '"Users can update own profile" still has no WITH CHECK — role self-elevation is open';
  ASSERT NOT has_function_privilege('anon', 'public.current_profile_role()', 'EXECUTE'),
    'anon can execute current_profile_role';
  ASSERT has_function_privilege('authenticated', 'public.current_profile_role()', 'EXECUTE'),
    'authenticated cannot execute current_profile_role — the UPDATE policy denies every write';
  -- Read the fallback EXPRESSION, not the word. 00313's body already contains
  -- the literal 'homeowner' twice (the CASE arm and its SECURITY comment), so
  -- a LIKE '%homeowner%' guard passes on the UNFIXED function and would report
  -- success over a skipped edit.
  ASSERT (
    SELECT pg_get_functiondef(p.oid) LIKE '%COALESCE(v_role, ''homeowner'')%'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ), 'handle_new_user() still falls back to designer for a metadata-less signup';
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
-- ── AFTER APPLY ────────────────────────────────────────────────────────────
--   • python3 scripts/generate-legacy-grants.py  (this file adds GRANT/REVOKE,
--     so supabase/seed/00-legacy-grants.sql must be regenerated or a fresh
--     local stack will diverge from prod ACLs)
--   • pnpm db:generate                            (public schema changed: a new
--     view, two new functions)
--   • scripts/run-sql-tests.sh                    (the whole suite vs
--     KNOWN_FAILURES.md — that, not the single file, is the local gate)
--   • the anon/authenticated probes in 00555_probes.md
-- ═══════════════════════════════════════════════════════════════════════════
