-- ═══════════════════════════════════════════════════════════════════════════
-- 00478 — People Room: honest issuance evidence, not "a proposal exists"
--         (J7 / doc-polish)
--
-- Lineage (people_directory): 00221 (birth) → 00281 (field kinds) →
-- 00420 (studio scope + contacts) → 00478 (this). The 00420 body is copied
-- VERBATIM as the base and one delta is grafted on top; no earlier branch is
-- touched or reverted.
--
-- DEPENDS ON 00477. This migration reads proposals.issued_on_paper, the
-- provenance stamp 00477 adds. It must be applied after it — the file numbers
-- already order them, and nothing here is safe to replay against a database
-- that lacks that column.
--
-- THE BUG THIS FIXES: set_document_client (00225) sets designer_clients.status
-- to 'proposal' the instant a client is linked to ANY proposal — draft or
-- sent, no distinction. Three independent call sites in
-- apps/designer-portal/src/lib/document/people-derivation.ts read that same
-- status_raw and each render their own "proposal sent" copy off it, so a
-- client with a merely-drafted, never-emailed proposal reads as sent
-- everywhere: the directory line ("Proposal sent · awaiting signature"), the
-- Nurture queue (unconditionally "due"), and the person profile's Nurture
-- card.
--
-- THE FIX: the CLIENT branch's `meta` gains TWO keys, computed together by
-- public.designer_client_send_evidence():
--
--   has_sent_proposal — a real, outbound send happened. The union of the two
--     independent tells the send rail leaves behind: proposals.sent_at (set by
--     send_commercial_document, 00423:1752) OR a proposal_send_dispatches row
--     (00388). Either alone is enough; neither is written by the paper rail.
--   issued_on_paper — the document reached the client's hands WITHOUT an
--     email (00477). Disjoint from the above by construction: the paper issue
--     path writes no sent_at and no dispatch row, and 00477's guard keeps the
--     stamp unpaintable outside that ceremony.
--
-- Consumers must read them in that order — paper first, then send evidence,
-- then draft. A paper issuance is NOT a send and must never render as one;
-- it is also not a draft, and must never draw a "nothing has gone out" nudge.
--
-- LEGACY JOIN. proposals.designer_client_id (00327) was backfilled by 00328
-- ONLY where the (designer_id, client_id) pair resolved to exactly one
-- designer_clients row (00328:71-79); repeat-client households were left for
-- manual review and two prod orphans deliberately unrepaired. document_state's
-- own shape D carries a fallback for exactly this gap (00327:453-457), so this
-- function carries the same one: an orphan proposal (designer_client_id NULL)
-- matches on the designer/client pair. Without it a genuinely sent 2026-05
-- agreement would read "not yet sent" — the very inversion this migration
-- exists to prevent.
--
-- WHY SECURITY DEFINER. The view is security_invoker, and `proposals` is NOT
-- widened to the same audience as `designer_clients`: 00401:424 dropped
-- proposals_studio_rw and replaced it with proposals_design_studio_select,
-- gated on is_design_studio_comember, which 00399:1160-1163 documents as
-- deliberately narrower than the is_studio_comember this branch uses. A
-- co-member who reaches the household through a non-design_studio org can see
-- the row but not its proposals, so an invoker-side EXISTS would silently
-- answer false and re-render the exact dishonesty this fixes. The evidence is
-- therefore computed by a definer-rights function, keyed on a household the
-- caller has already been admitted to. What it discloses is two booleans about
-- that household's agreements — strictly less than the revenue totals, project
-- counts and satisfaction scores the same `meta` blob already carries.
--
-- RELEASE ORDER IS LOAD-BEARING. The designer portal reads these keys
-- fail-closed: absent ⇒ "not yet sent". Apply this migration BEFORE deploying
-- the portal, or every proposal-stage client — including ones holding a real,
-- sent, unsigned agreement — reads as merely drafted, is not nurture-due, and
-- drops out of the Desk's reconnect band (desk-reconnect.tsx →
-- deriveReconnectNeeds) as well as the People directory and Nurture queue.
-- Regenerate packages/supabase/src/database.types.ts after applying.
--
-- CoR discipline unchanged from 00420: `meta` is a JSONB blob, not a flat
-- view column, so adding keys inside it is additive and does not touch the
-- append-only top-level column order 00420 pins.
--
-- Additive only (D7): one new function, CREATE OR REPLACE VIEW, two new JSONB
-- keys in one branch. No column drops, nothing narrows.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.designer_client_send_evidence(
  p_designer_client_id uuid,
  p_designer_id        uuid,
  p_client_id          uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH matched AS (
    SELECT p.id, p.sent_at, p.issued_on_paper
    FROM public.proposals p
    WHERE p.designer_client_id = p_designer_client_id
    UNION
    -- 00328's un-backfilled orphans, mirroring document_state shape D.
    SELECT p.id, p.sent_at, p.issued_on_paper
    FROM public.proposals p
    WHERE p.designer_client_id IS NULL
      AND p_client_id IS NOT NULL
      AND p.designer_id = p_designer_id
      AND p.client_id   = p_client_id
  )
  SELECT jsonb_build_object(
    'has_sent_proposal', COALESCE((
      SELECT bool_or(
               m.sent_at IS NOT NULL
               OR EXISTS (
                    SELECT 1 FROM public.proposal_send_dispatches d
                    WHERE d.proposal_id = m.id
                  )
             )
      FROM matched m
    ), false),
    'issued_on_paper', COALESCE((
      SELECT bool_or(COALESCE(m.issued_on_paper, false)) FROM matched m
    ), false)
  );
$fn$;

REVOKE ALL ON FUNCTION public.designer_client_send_evidence(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.designer_client_send_evidence(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.designer_client_send_evidence(uuid, uuid, uuid) IS
  '00478: issuance evidence for one designer_clients household, as '
  '{has_sent_proposal, issued_on_paper}. has_sent_proposal is the union of the '
  'two tells a real outbound send leaves (proposals.sent_at, a '
  'proposal_send_dispatches row); issued_on_paper is 00477''s stamp for a '
  'document handed over without an email. Disjoint by construction. Matches '
  'proposals on designer_client_id, plus the designer/client pair for rows '
  '00328 could not backfill. SECURITY DEFINER on purpose: proposals is gated '
  'by the narrower is_design_studio_comember (00401/00399) while '
  'people_directory''s client branch is gated by is_studio_comember, so an '
  'invoker-side read would answer false for co-members who can legitimately '
  'see the household.';

CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- v4: meta gains has_sent_proposal + issued_on_paper (this migration).
-- Everything else in this branch is unchanged from 00420.
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
  ) || public.designer_client_send_evidence(dc.id, dc.designer_id, dc.client_id)
                                                                 AS meta,
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Unchanged from 00420.
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
-- Unchanged from 00420.
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
-- Unchanged from 00420.
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
-- Unchanged from 00420.
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
-- Unchanged from 00420.
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
  'architect|photographer|stager|team|contact) for the querying user. v4 '
  '(00478): the client branch''s meta gains has_sent_proposal and '
  'issued_on_paper from designer_client_send_evidence(), so the '
  'directory/Nurture derivations can tell a merely-drafted agreement from one '
  'that was really emailed and from one handed over on paper (00477), instead '
  'of all three reading as status_raw = ''proposal''. Read them paper-first, '
  'then send evidence, then draft. v3 (00420): every branch is STUDIO-scoped via '
  'is_studio_comember (00315), a contacts branch surfaces the shared rolodex '
  '(studio_contacts, 00417), and the appended `scope` column reads ''mine'' | '
  '''studio'' for the scope lens. The party branch admits the 00419 roster '
  'kinds but excludes ''client'' (it would collide with the clients branch''s '
  'role semantics). security_invoker view — base-table RLS still governs, so '
  'branches over tables that are not studio-widened (project_parties, '
  'project_team_members, saved_vendors) widen only for callers those tables '
  'already admit.';

COMMENT ON COLUMN public.people_directory.scope IS
  'Call Sheet Wave 4: ''mine'' when the row is the caller''s own (their client/'
  'lead/project/saved vendor/filed contact card), ''studio'' when it reaches the '
  'caller through studio co-membership. Drives the People Room scope lens '
  '(MINE · STUDIO). Appended last — CREATE OR REPLACE VIEW cannot reorder.';
