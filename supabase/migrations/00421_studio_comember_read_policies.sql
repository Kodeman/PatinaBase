-- ═══════════════════════════════════════════════════════════════════════════
-- 00421 — Studio co-member READ policies for the Call Sheet's last three tables
--         (Call Sheet · Wave 4)
--
-- R1/R2 rule the studio fully shared, and 00316 already lets a co-member SEE a
-- teammate's PROJECTS. But three tables the Call Sheet reads never got a
-- co-member SELECT policy:
--
--   · project_parties       — own-project only (00212: designer_all keyed on
--                             projects.designer_id = auth.uid(); team_select via
--                             is_project_team_member; self_select on profile_id)
--   · project_team_members  — own-project only (00084 lead-designer-all +
--                             00087's is_project_team_member team read)
--   · saved_vendors         — own-row only (00009: designer_id = auth.uid())
--
-- Consequence, exactly as 00420's own "honest scope note" admits: a co-member
-- who is NOT also on the project's team opens the Call Sheet and gets an EMPTY
-- roster, and 00420's widened makers / parties / team branches are HOLLOW —
-- the view stopped being the narrow gate, but the base tables still are.
-- This file closes that, and only that.
--
-- ── SHAPE: ADDITIVE, SELECT-ONLY ─────────────────────────────────────────────
-- Three new PERMISSIVE FOR SELECT policies. Postgres ORs permissive policies,
-- so nothing existing narrows and no write path widens by a single row:
-- INSERT/UPDATE/DELETE on all three tables keep exactly the gates they had
-- (00212's designer_all, 00084's lead-designer-all, 00009's own-row FOR ALL).
-- A co-member can now READ a teammate's roster; they still cannot add, edit, or
-- remove a party, a team seat, or someone else's saved vendor.
--
-- ── RECURSION (the 00087 lesson, stated plainly) ─────────────────────────────
-- 00084 shipped a project_team_members SELECT policy whose USING clause
-- SELECTed project_team_members — 42P17 on every read; 00087 fixed it by
-- routing the membership test through the SECURITY DEFINER
-- is_project_team_member(), which bypasses RLS and therefore cannot re-enter
-- the policy. Two rules follow, and this file obeys both:
--
--   1. The ptm policy below must NOT call is_project_team_member() — it is on
--      ptm itself and the definer helper reads ptm, which would be a
--      definer-laundered self-reference and a semantic no-op anyway (it would
--      only re-state the read the caller already has). It uses ONLY the two
--      studio helpers, both SECURITY DEFINER over organization_members.
--   2. The EXISTS goes through `projects`, whose OWN SELECT policies are
--      recursion-safe by construction: 00168's "Project participants can view
--      projects" calls the DEFINER is_project_team_member(id), and 00316's
--      projects_studio_select calls the DEFINER is_studio_comember(designer_id).
--      Neither performs a plain (non-definer) SELECT on project_parties or
--      project_team_members. Verified by reading 00001 (its wide-open policy was
--      DROPped by 00168), 00168, and 00316 — those are the only files that
--      create SELECT policies on public.projects.
--
-- ── WHAT THE `projects` EXISTS ACTUALLY GATES ────────────────────────────────
-- The subquery runs under the CALLER's RLS on projects, so a row is admitted
-- only when the caller can also read the project itself. For the case this file
-- exists to serve — co-member C, project owned by teammate D — 00316's
-- projects_studio_select admits the project, so the EXISTS resolves. The
-- predicate is deliberately belt-and-braces:
--
--   · is_studio_comember(p.designer_id) is the LIVE leg, and mirrors 00316's
--     child-fleet idiom verbatim (project_rooms, project_ffe_items, …).
--   · is_active_studio_member(p.studio_id) is INERT TODAY and is included for
--     forward-compatibility only. 00317 states outright that studio_id is NOT
--     an RLS gate in this design; projects itself has no studio_id SELECT leg,
--     so a caller who satisfies ONLY this branch cannot read the project row and
--     the EXISTS is false regardless. It costs nothing and starts working the
--     day projects grows an org-keyed SELECT leg. Do not read it as live
--     coverage.
--
-- Guests are excluded on both legs: is_studio_comember rejects a guest on
-- either side of the membership (00315), is_active_studio_member requires
-- role <> 'guest' (00417).
--
-- ── DOCUMENTATION FIX: 00420's 00217-interaction overclaim ───────────────────
-- Section 4 below corrects a comment in 00420 (still UNAPPLIED to prod, so
-- in-place edit is the right remediation per the migrations skill's step 8).
-- No SQL behavior changes.
--
-- No GRANT/REVOKE in this file (policies only) → seed/00-legacy-grants.sql
-- needs no regeneration. No column/type/view shape changes → no types regen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_parties — the co-member's roster read
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS project_parties_studio_comember_select ON public.project_parties;
CREATE POLICY project_parties_studio_comember_select
  ON public.project_parties FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND ( public.is_studio_comember(p.designer_id)
           OR ( p.studio_id IS NOT NULL
                AND public.is_active_studio_member(p.studio_id) ) )
    )
  );

COMMENT ON POLICY project_parties_studio_comember_select ON public.project_parties IS
  'Call Sheet Wave 4 (R1/R2): an active non-guest studio co-member READS the '
  'party rows on a teammate''s project, without needing a seat on that '
  'project''s team. Closes the gap 00420''s scope note named — before this, a '
  'co-member''s Call Sheet rendered empty and people_directory''s widened '
  'party/makers branches were hollow. SELECT ONLY: writes still require '
  '00212''s designer_all (projects.designer_id = auth.uid()). Permissive, so '
  'it only adds to 00212/00217/00420. Recursion-safe: both helpers are '
  'SECURITY DEFINER and the EXISTS goes through projects, whose own SELECT '
  'policies (00168/00316) never plain-SELECT project_parties.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. project_team_members — the co-member's team read
-- ═══════════════════════════════════════════════════════════════════════════
-- Deliberately does NOT reference project_team_members (directly or through
-- is_project_team_member) anywhere in its USING clause — see the recursion note
-- in the header. Only the two studio helpers appear.
DROP POLICY IF EXISTS project_team_members_studio_comember_select ON public.project_team_members;
CREATE POLICY project_team_members_studio_comember_select
  ON public.project_team_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_members.project_id
        AND ( public.is_studio_comember(p.designer_id)
           OR ( p.studio_id IS NOT NULL
                AND public.is_active_studio_member(p.studio_id) ) )
    )
  );

COMMENT ON POLICY project_team_members_studio_comember_select ON public.project_team_members IS
  'Call Sheet Wave 4 (R1/R2): an active non-guest studio co-member READS the '
  'team seats on a teammate''s project. SELECT ONLY — seat management stays '
  '00084''s lead-designer FOR ALL policy. Recursion-safe by construction '
  '(00087''s lesson): the USING clause never touches project_team_members — no '
  'self-EXISTS and no is_project_team_member() call — it goes only through '
  'projects and the two SECURITY DEFINER studio helpers (00315/00417).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. saved_vendors — the studio's shared maker book
-- ═══════════════════════════════════════════════════════════════════════════
-- The makers branch of people_directory (00420) unions the saved-vendor leg
-- with the engaged-party leg; under security_invoker the saved leg yielded
-- nothing beyond the caller's own rows until now. Note the view's `scope`
-- column keeps its stricter meaning after this policy lands: 'mine' still means
-- "I hold my OWN saved_vendors row", not merely "the studio saved it".
DROP POLICY IF EXISTS saved_vendors_studio_comember_select ON public.saved_vendors;
CREATE POLICY saved_vendors_studio_comember_select
  ON public.saved_vendors FOR SELECT
  TO authenticated
  USING (public.is_studio_comember(designer_id));

COMMENT ON POLICY saved_vendors_studio_comember_select ON public.saved_vendors IS
  'Call Sheet Wave 4 (R1/R2): the studio''s saved-vendor book is readable by '
  'every active non-guest co-member, so people_directory''s makers branch '
  '(00420) stops being hollow. SELECT ONLY — saving/unsaving stays own-row via '
  '00009''s "Designers can manage their saved vendors" (designer_id = '
  'auth.uid()). NULL-safe through is_studio_comember.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Documentation-only correction to 00420's 00217-interaction note
-- ═══════════════════════════════════════════════════════════════════════════
-- 00420's header and its project_parties_client_select COMMENT both claim the
-- coordination "resolve path" SETS project_parties.profile_id for logged-in
-- GC/vendor/client_rep seats. That writer DOES NOT EXIST anywhere in the repo:
-- no migration UPDATEs or INSERTs profile_id on project_parties (00217 only
-- READS it through is_coordination_party; 00218's resolve_coordination_item
-- never touches it; 00418's fold reads it into studio_contacts), no edge
-- function writes it (sms-dispatch / sms-inbound / field-daily /
-- site-request-dispatch all read only), and no portal hook writes it
-- (use-coordination.ts and use-studio-contacts.ts type the column but never
-- send it; usePromoteToStudioContact stamps studio_contact_id, not profile_id).
-- The column is therefore currently NEVER WRITTEN — 00217's
-- coordination_party_parties_select is dormant in practice, not merely
-- non-overlapping. The 00420 file is edited in place below rather than fixed
-- forward because it is still unapplied to prod (migrations skill, step 8).
COMMENT ON POLICY project_parties_client_select ON public.project_parties IS
  'Call Sheet Wave 4 (R4/U2): the project''s client SELECTs exactly the party '
  'rows the designer opted in with show_to_client (00419). SELECT only — the '
  'client never writes a party row (no INSERT/UPDATE/DELETE policy admits '
  'them). Additive/permissive; it does not touch 00217''s '
  'coordination_party_parties_select, under which any user who is the '
  'profile_id of a party row on the project would read ALL that project''s '
  'parties regardless of show_to_client. Corrected in 00421: NO code path '
  'anywhere in the repo writes project_parties.profile_id — not a migration, '
  'not an edge function, not a portal hook — so that column is currently never '
  'populated and the 00217 policy is dormant, never merely non-overlapping. If '
  'a writer ever ships, 00217 is the policy to revisit, not this one.';

-- 00420's COMMENT ON VIEW closes with "branches over tables that are not
-- studio-widened (project_parties, project_team_members, saved_vendors) widen
-- only for callers those tables already admit". Sections 1–3 above just made
-- that sentence false in the live catalog, so it is restated here. Text only —
-- the view definition is untouched (no CREATE OR REPLACE VIEW in this file), so
-- column order, types, and grants are all exactly as 00420 left them.
COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v3 '
  '(00420): every branch is STUDIO-scoped via is_studio_comember (00315), a '
  'contacts branch surfaces the shared rolodex (studio_contacts, 00417), and '
  'the appended `scope` column reads ''mine'' | ''studio'' for the scope lens. '
  'The party branch admits the 00419 roster kinds but excludes ''client'' (it '
  'would collide with the clients branch''s role semantics). security_invoker '
  'view — base-table RLS still governs. As of 00421 the last three base tables '
  '(project_parties, project_team_members, saved_vendors) carry co-member '
  'SELECT policies too, so every branch now resolves for an active non-guest '
  'co-member without a project-team seat; those policies are SELECT-only, so '
  'writes remain own-project / own-row.';
