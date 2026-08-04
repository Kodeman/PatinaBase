-- ═══════════════════════════════════════════════════════════════════════════
-- 00420 — People Room studio scope + the client's roster read (Call Sheet · Wave 4)
--
-- Lineage (people_directory): 00221 (birth) → 00281 (field kinds) → 00420 (this).
-- The 00281 body was copied VERBATIM as the base and the deltas grafted on top;
-- no earlier repair is reverted by this file.
--
-- Two things ship here:
--
--   1. people_directory becomes STUDIO-scoped (R1/R2). Every branch's ownership
--      predicate widens from `= auth.uid()` to is_studio_comember(...) (00315),
--      a NEW `contacts` branch surfaces the shared rolodex (studio_contacts,
--      00417), and a NEW trailing column `scope` ('mine' | 'studio') tells the
--      People Room's scope lens which rows are the caller's own.
--
--   2. project_parties gains a CLIENT read policy: the homeowner on a project
--      may finally SELECT the party rows their designer explicitly opted in
--      with show_to_client (00419). This is the read consequence 00419's
--      column comment promised for "the NEXT wave".
--
-- ── CREATE OR REPLACE VIEW — THE HARD CONSTRAINT ─────────────────────────────
-- CoR cannot rename, retype, or REORDER existing columns; it can only APPEND.
-- The 11 columns from 00221/00281 therefore stay verbatim in name, order, and
-- type — person_id, role, display_name, email, phone, profile_id, project_id,
-- designer_id, status_raw, last_touch_at, meta — and `scope` is appended last in
-- EVERY branch. The view is NOT dropped: DROP would take the
-- `GRANT SELECT ... TO authenticated` with it and this file adds no grants,
-- which is also why seed/00-legacy-grants.sql needs no new rows from here.
-- (supabase/tests/rls/people_directory_scope_test.sql case (a) pins the order
-- against information_schema so a future edit cannot silently reshuffle it.)
--
-- ── WHAT security_invoker ACTUALLY DELIVERS (honest scope note) ──────────────
-- The view stays security_invoker = true, so widening a branch's predicate only
-- widens what a caller sees when the BASE TABLE's RLS also lets them read it:
--   · designer_clients + leads ARE studio-widened at RLS (00316) → the clients
--     and leads branches genuinely gain the studio's rows.
--   · studio_contacts is org-scoped by 00417 → the contacts branch resolves for
--     every active non-guest member.
--   · project_parties, project_team_members, and saved_vendors are NOT
--     studio-widened at RLS (00212/00087/00009 are own-project / own-row). A
--     co-member therefore sees a teammate's party or team rows only when they
--     are also on that project's team (is_project_team_member, 00087), and the
--     saved_vendors leg of the makers branch stays effectively own-row. That is
--     deliberate for this wave: this migration does not widen any base-table
--     RLS, it only stops the VIEW from being the narrower gate. Widening
--     project_parties to co-members is a separate product decision.
--
-- ── 00217 INTERACTION (documented, not widened) ──────────────────────────────
-- 00217 already ships `coordination_party_parties_select`: any user who is the
-- profile_id of ANY project_parties row on a project can read ALL party rows on
-- that project (via the SECURITY DEFINER is_coordination_party helper), with no
-- show_to_client predicate at all. That path predates this migration and is
-- untouched by it. The new client policy is strictly narrower and orthogonal —
-- it keys on projects.client_id, and each row it admits must carry
-- show_to_client = true. It neither feeds nor widens the 00217 path. Worth
-- stating plainly: a client who ALSO held a party row with
-- profile_id = auth.uid() on the same project would already have read every
-- party row through 00217 before this file existed. NOTHING in this repo ever
-- WRITES project_parties.profile_id — not on a 'client'-kind party, not on any
-- other kind. Grepped every writer: no migration UPDATEs or INSERTs the column
-- (00217 only READS it via is_coordination_party, 00218's
-- resolve_coordination_item never touches it, 00418's fold reads it into
-- studio_contacts); no edge function writes it (sms-dispatch, sms-inbound,
-- field-daily, site-request-dispatch are all read-only on it); no portal hook
-- writes it (use-coordination.ts and use-studio-contacts.ts type the column but
-- never send it — usePromoteToStudioContact stamps studio_contact_id instead).
-- There is no "resolve path that sets it" — that path does not exist. The
-- column is currently never populated, so 00217's policy is DORMANT in
-- practice, and the overlap is not merely theoretical but structurally
-- impossible until someone ships a writer. If one ever does, 00217 is the
-- policy to revisit, not this one.
--
-- Additive only (D7): CREATE OR REPLACE VIEW + one new permissive SELECT
-- policy. No grants, no revokes, no column drops. Nothing narrows.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. people_directory — studio scope + the contacts branch + `scope`
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- v3: ownership widened dc.designer_id = auth.uid() → is_studio_comember(...).
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  pr.phone                                                       AS phone,
  dc.client_id                                                   AS profile_id,
  NULL::uuid                                                     AS project_id,
  dc.designer_id                                                 AS designer_id,
  dc.status                                                      AS status_raw,
  COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at) AS last_touch_at,
  jsonb_build_object(
    'total_projects',     dc.total_projects,
    'total_revenue',      dc.total_revenue,
    'last_project_at',    dc.last_project_at,
    'last_contacted_at',  dc.last_contacted_at,
    'first_project_at',   dc.first_project_at,
    'style_tags',         dc.style_tags,
    'source',             dc.source,
    'satisfaction_score', dc.satisfaction_score,
    'nickname',           dc.nickname,
    'location',           dc.location,
    'lead_id',            dc.lead_id
  )                                                              AS meta,
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- v3: ownership widened; the status filter is unchanged (accepted/declined/
-- expired leads still drop off — they convert into designer_clients).
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  hp.phone,
  l.homeowner_id,
  NULL::uuid,
  l.designer_id,
  l.status,
  COALESCE(l.contacted_at, l.created_at),
  jsonb_build_object(
    'project_type',      l.project_type,
    'project_description', l.project_description,
    'budget_range',      l.budget_range,
    'timeline',          l.timeline,
    'match_score',       l.match_score,
    'location_city',     l.location_city,
    'location_state',    l.location_state,
    'response_deadline', l.response_deadline,
    'created_at',        l.created_at
  ),
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- v3: both membership legs widened through is_studio_comember. `scope` is NOT
-- derived from those legs — a vendor can arrive by either route, so 'mine'
-- means specifically "I have my OWN saved_vendors row for this vendor" and
-- everything else the studio reaches reads 'studio'.
-- Honest note: saved_vendors' RLS is own-row (00009), so the widened saved leg
-- yields nothing extra under security_invoker until that policy widens; the
-- engaged leg likewise inherits project_parties' own-project RLS (00212).
SELECT
  v.id,
  'maker',
  v.name,
  COALESCE(v.orders_email, v.trade_account_email),
  NULL::text,
  v.contact_profile_id,
  NULL::uuid,
  auth.uid(),
  v.nomination_status,
  v.updated_at,
  jsonb_build_object(
    'primary_category',      v.primary_category,
    'lead_times',            v.lead_times,
    'default_payment_terms', v.default_payment_terms,
    'founding_circle',       v.founding_circle,
    'made_in',               v.made_in,
    'trade_terms',           v.trade_terms,
    'is_patina_catalog',     v.is_patina_catalog,
    'review_count',          v.review_count,
    'designer_rating_avg',   v.designer_rating_avg
  ),
  (CASE
     WHEN EXISTS (
       SELECT 1 FROM public.saved_vendors mine
       WHERE mine.vendor_id = v.id
         AND mine.designer_id = (select auth.uid())
     ) THEN 'mine'
     ELSE 'studio'
   END)::text
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE public.is_studio_comember(sv.designer_id)
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
)

UNION ALL

-- ── FIELD / ROSTER PARTIES on studio projects ─────────────────────────────
-- v3: the kind filter admits the 00419 roster kinds — architect, photographer,
-- stager — alongside the 00281 field kinds. It deliberately EXCLUDES 'client':
-- a client-kind party would collide with the clients branch's `role = 'client'`
-- semantics (the People Room routes a 'client' row to the designer_clients
-- record, not to a party row). 'vendor', 'client_rep' and 'other' stay excluded
-- exactly as they were in 00221/00281 — vendor parties already surface through
-- the makers branch, and client_rep/other have no People Room lens.
-- meta gains show_to_client + studio_contact_id (both 00418/00419 columns) so
-- the roster row can render its client-visibility state and its rolodex lineage.
SELECT
  pp.id,
  pp.party_kind,
  pp.display_name,
  pp.email,
  pp.phone,
  pp.profile_id,
  pp.project_id,
  auth.uid(),
  pp.sms_consent_status,
  pp.updated_at,
  jsonb_build_object(
    'company_name',       pp.company_name,
    'vendor_id',          pp.vendor_id,
    'project_name',       pj.name,
    'party_kind',         pp.party_kind,
    'trade',              pp.trade,
    'phone_e164',         pp.phone_e164,
    'sms_consent_status', pp.sms_consent_status,
    'sms_consented_at',   pp.sms_consented_at,
    'sms_opt_out_at',     pp.sms_opt_out_at,
    'show_to_client',     pp.show_to_client,
    'studio_contact_id',  pp.studio_contact_id
  ),
  (CASE
     WHEN pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid())
     THEN 'mine' ELSE 'studio'
   END)::text
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver',
                        'architect', 'photographer', 'stager')
  AND ( public.is_studio_comember(pj.designer_id)
     OR public.is_studio_comember(pj.lead_designer_id)
     OR public.is_studio_comember(pj.created_by) )

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- v3: ownership widened; the inner query LEFT JOINs organization_members on the
-- project's studio so meta can carry job_title / staff_role (00416). The join is
-- LEFT and om SELECT is own-row/admin/co-member (00021/00068/00321) — a viewer
-- without visibility into that membership row simply reads NULL titles, which is
-- the same intended degrade v_project_roster documents (00419), never a 42501.
SELECT
  t.id,
  'team',
  COALESCE(tp.full_name, tp.display_name, tp.email, 'Teammate'),
  tp.email,
  tp.phone,
  t.user_id,
  t.project_id,
  auth.uid(),
  t.role,
  t.assigned_at,
  jsonb_build_object(
    'role',         t.role,
    'project_name', t.project_name,
    'job_title',    t.job_title,
    'staff_role',   t.staff_role
  ),
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name,
    om.job_title  AS job_title,
    om.staff_role AS staff_role,
    ( pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) ) AS is_mine
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  LEFT JOIN public.organization_members om
    ON om.user_id = tm.user_id
   AND om.organization_id = pj.studio_id
   AND om.status = 'active'
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id

UNION ALL

-- ── CONTACTS (the shared rolodex, 00417) ──────────────────────────────────
-- NEW in v3. role is the flat 'contact' discriminator; the card's own kind
-- rides in meta.contact_kind (free TEXT, code-resident vocab — see 00417), so
-- adding a rolodex kind never needs a view redefinition. project_id is NULL: a
-- rolodex card is studio-scoped, not project-scoped. designer_id carries
-- created_by (who first filed the card) purely as provenance — it is NOT an
-- ownership gate (the gate is is_active_studio_member on the org) and it does
-- NOT imply the card was folded from that person's legacy rows.
-- Archived cards are INCLUDED with status_raw = 'archived' (00417's SELECT
-- policy deliberately shows them so the owner can review the seeded book); the
-- People Room filters them out of its default lens.
SELECT
  sc.id,
  'contact',
  COALESCE(sc.full_name, sc.company_name),
  sc.email,
  sc.phone,
  sc.profile_id,
  NULL::uuid,
  sc.created_by,
  (CASE WHEN sc.archived_at IS NULL THEN 'active' ELSE 'archived' END)::text,
  sc.updated_at,
  jsonb_build_object(
    'contact_kind',    sc.contact_kind,
    'entity_kind',     sc.entity_kind,
    'company_name',    sc.company_name,
    'company_id',      sc.company_id,
    'specialties',     sc.specialties,
    'vendor_id',       sc.vendor_id,
    'organization_id', sc.organization_id,
    'archived_at',     sc.archived_at
  ),
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.studio_contacts sc
WHERE public.is_active_studio_member(sc.organization_id);

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v3 '
  '(00420): every branch is STUDIO-scoped via is_studio_comember (00315), a '
  'contacts branch surfaces the shared rolodex (studio_contacts, 00417), and '
  'the appended `scope` column reads ''mine'' | ''studio'' for the scope lens. '
  'The party branch admits the 00419 roster kinds but excludes ''client'' (it '
  'would collide with the clients branch''s role semantics). security_invoker '
  'view — base-table RLS still governs, so branches over tables that are not '
  'studio-widened (project_parties, project_team_members, saved_vendors) widen '
  'only for callers those tables already admit.';

COMMENT ON COLUMN public.people_directory.scope IS
  'Call Sheet Wave 4: ''mine'' when the row is the caller''s own (their client/'
  'lead/project/saved vendor/filed contact card), ''studio'' when it reaches the '
  'caller through studio co-membership. Drives the People Room scope lens '
  '(MINE · STUDIO). Appended last — CREATE OR REPLACE VIEW cannot reorder.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. project_parties — the client's opted-in roster read
-- ═══════════════════════════════════════════════════════════════════════════
-- ADDITIVE and PERMISSIVE: Postgres ORs this with the existing 00212 designer /
-- team / self policies and 00217's coordination-party policy, so no existing
-- access narrows. Both predicates are required — the row must be opted in AND
-- the caller must be the project's client.
--
-- (select auth.uid()) rather than bare auth.uid(): the planner hoists the
-- scalar subquery out of the per-row loop (the 00315/00417 idiom).
--
-- The projects EXISTS resolves under the caller's own RLS; 00168's "Project
-- participants can view projects" already admits client_id = auth.uid(), so the
-- subquery is not blind for the very user this policy is written for.
DROP POLICY IF EXISTS project_parties_client_select ON public.project_parties;
CREATE POLICY project_parties_client_select
  ON public.project_parties FOR SELECT
  TO authenticated
  USING (
    show_to_client = true
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND p.client_id = (select auth.uid())
    )
  );

COMMENT ON POLICY project_parties_client_select ON public.project_parties IS
  'Call Sheet Wave 4 (R4/U2): the project''s client SELECTs exactly the party '
  'rows the designer opted in with show_to_client (00419). SELECT only — the '
  'client never writes a party row (no INSERT/UPDATE/DELETE policy admits '
  'them). Additive/permissive; it does not touch 00217''s '
  'coordination_party_parties_select, under which any user who is the '
  'profile_id of a party row on the project already reads ALL that project''s '
  'parties regardless of show_to_client. That pre-existing path is unchanged '
  'and unwidened here; NO code path anywhere in the repo writes '
  'project_parties.profile_id (no migration, no edge function, no portal '
  'hook), so that column is currently never populated and the 00217 policy is '
  'dormant — the two cannot overlap until a writer ships.';

-- No GRANT/REVOKE in this file: project_parties already grants SELECT to
-- authenticated (00212) and people_directory already grants SELECT to
-- authenticated (00221/00281, preserved because the view is REPLACEd, not
-- dropped). seed/00-legacy-grants.sql therefore needs no new rows from 00420.
