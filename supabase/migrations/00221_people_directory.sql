-- 00221 · The People Room — the unified party directory (R57 / Track A)
--
-- A read-model VIEW that UNIONs every party Patina works with into ONE roster:
-- clients, makers/vendors, GCs, studio team, and open leads — each row carrying
-- a `role` discriminator, a contact, a status token, and a role-specific `meta`
-- JSONB. This is the spine of the People Room (R50) and the data dependency the
-- decision system's ball-in-court needed (R48 unblock) — GCs are already
-- first-class via project_parties (00212); this view makes the whole set legible.
--
-- DESIGN NOTES
--  · Additive only (D7): a VIEW over existing tables. No new tables, no schema
--    changes to the old /portal zones, no destructive ops.
--  · The journey is a DERIVATION, not a table (R51): nothing here logs activity.
--    deriveRelationshipJourney() weaves the journey in TS from existing surfaces.
--  · security_invoker = true: the view runs with the QUERYING user's privileges,
--    so the underlying RLS scopes each branch to that designer. Belt-and-suspenders
--    explicit auth.uid() / project-ownership filters make the scoping self-evident.
--  · "My makers" = vendors the designer has saved (saved_vendors) OR has engaged
--    as a tracked party on one of their projects (project_parties.vendor_id).
--  · Team is de-duplicated to one row per teammate (DISTINCT ON user_id), most
--    recent assignment wins; the designer themselves and client/vendor roles are
--    excluded (those surface as their own party kinds).
--  · Accepted/declined/expired leads drop off — they convert into designer_clients.

CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
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
  )                                                              AS meta
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE dc.designer_id = auth.uid()

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
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
  )
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE l.designer_id = auth.uid()
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged on my projects) ────────────────────
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
  )
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE sv.designer_id = auth.uid()
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( pj.designer_id = auth.uid()
       OR pj.lead_designer_id = auth.uid()
       OR pj.created_by = auth.uid() )
)

UNION ALL

-- ── GCs (party_kind='gc' on my projects) ──────────────────────────────────
SELECT
  pp.id,
  'gc',
  pp.display_name,
  pp.email,
  pp.phone,
  pp.profile_id,
  pp.project_id,
  auth.uid(),
  NULL::text,
  pp.updated_at,
  jsonb_build_object(
    'company_name', pp.company_name,
    'vendor_id',    pp.vendor_id,
    'project_name', pj.name,
    'party_kind',   pp.party_kind
  )
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind = 'gc'
  AND ( pj.designer_id = auth.uid()
     OR pj.lead_designer_id = auth.uid()
     OR pj.created_by = auth.uid() )

UNION ALL

-- ── TEAM (studio collaborators on my projects, one row per teammate) ───────
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
    'project_name', t.project_name
  )
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( pj.designer_id = auth.uid()
       OR pj.lead_designer_id = auth.uid()
       OR pj.created_by = auth.uid() )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id;

GRANT SELECT ON public.people_directory TO authenticated;

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room: unified party roster (client|lead|maker|gc|team) for the '
  'querying designer. security_invoker view; additive read-model over existing '
  'tables. The relationship journey is derived in TS (no activity table).';
