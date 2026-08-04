-- ═══════════════════════════════════════════════════════════════════════════
-- 00419 — Project roster wiring (Call Sheet · Wave 3)
--
-- The Call Sheet needs a single project-scoped roster: every tracked party
-- (00212/00281 project_parties, now widened with the studio's rolodex kinds
-- via 00417/00418's studio_contact_id) PLUS every real project_team_members
-- login, in one shape the UI can render without knowing which table a row
-- came from.
--
-- This migration:
--   1. Widens project_parties.party_kind → + 'architect','photographer',
--      'stager','client' (the People Room rolodex fold already produces
--      client_rep/other rows in these kinds via studio_contacts.contact_kind;
--      a party recorded FROM one of them needs the matching party_kind).
--      Deliberately does NOT widen project_tasks_owner_check or
--      client_decisions_court_check — those CHECKs gate WHO CAN OWN A
--      COORDINATION COURT (a task/item's owner), a narrower, deliberately
--      curated list of working courts. architect/photographer/stager/client
--      are roster IDENTITIES (who's on the job), not coordination courts —
--      widening the court CHECKs is explicitly out of scope for this wave
--      (see the orchestration plan's "out of scope" list).
--   2. Adds project_parties.show_to_client (R4/U2): a per-row opt-in so the
--      designer chooses which parties the client sees on the (future) client
--      portal roster. Defaults false. The client-side SELECT policy that
--      actually lets a client READ an opted-in row ships in the NEXT wave —
--      until then this column is pure state with no read consequence: a
--      client reads ZERO project_parties rows regardless of its value (there
--      is still no client SELECT policy on project_parties — see 00212's RLS
--      block, unchanged by this migration).
--   3. CREATE VIEW v_project_roster — a security_invoker UNION of the party
--      branch (project_parties) and the team branch (project_team_members,
--      joined to profiles for name/contact and to organization_members for
--      job_title/staff_role). One row per roster member, one column list.
--
-- Additive only (D7): CHECK drop/re-add (00281 mechanics — the constraint is
-- auto-named and has no ADD VALUE IF NOT EXISTS equivalent), ADD COLUMN IF
-- NOT EXISTS, CREATE OR REPLACE VIEW.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_parties.party_kind — widen (00281 mechanics)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_party_kind_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_party_kind_check
    CHECK (party_kind IN ('gc', 'vendor', 'client_rep', 'other',
                          'sub', 'installer', 'receiver',
                          'architect', 'photographer', 'stager', 'client'));

-- project_tasks_owner_check and client_decisions_court_check are DELIBERATELY
-- NOT widened here. Those CHECKs gate coordination COURTS (who a task/item's
-- owner/court can be) — a small, curated working set. architect / photographer
-- / stager / client are roster IDENTITIES (Call Sheet membership), not
-- coordination courts; a court needs its own product decision to grow, which
-- is out of scope for this wave (see the orchestration plan).

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. project_parties.show_to_client — per-row client visibility opt-in
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS show_to_client BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.project_parties.show_to_client IS
  'Call Sheet (R4/U2): per-row designer opt-in — TRUE means the designer wants '
  'this party visible on the client portal roster. Default FALSE (nothing '
  'shows unless chosen). The client-side SELECT policy that actually lets a '
  'client READ an opted-in row ships in the NEXT wave (Wave 4) — until then '
  'this column has no read-side effect: project_parties still carries no '
  'client SELECT policy (00212), so a client reads ZERO rows here regardless '
  'of this flag''s value.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. v_project_roster — party branch ∪ team branch, one roster shape
-- ═══════════════════════════════════════════════════════════════════════════
-- security_invoker = true: the querying user's own RLS applies to BOTH
-- underlying tables (and to organization_members through the team branch's
-- om join). This means:
--   · the designer / a project team member reads via project_parties'
--     existing designer-all / team-select policies (00212) and via
--     project_team_members' lead-designer-all / team-member-select policies
--     (00084) — both branches resolve.
--   · a plain co-member of the studio who is NOT also an active member with
--     comember-select visibility into ANOTHER teammate's organization_members
--     row (00321/00322's is_active_org_member gate) still sees the team
--     branch's identity columns (project_team_members + profiles are
--     independently readable); only the om LEFT JOIN degrades — job_title /
--     staff_role come back NULL for that viewer instead of erroring. That is
--     the intended degrade, not a bug: a NULL job_title is a legitimate "I
--     can't see that detail" outcome under security_invoker, never a 42501.
--   · a client (no SELECT policy on project_parties, no membership in
--     project_team_members) sees NOTHING from either branch — the posture
--     this wave pins (see the show_to_client comment above).
CREATE OR REPLACE VIEW public.v_project_roster
WITH (security_invoker = true) AS

-- ── PARTY BRANCH ─────────────────────────────────────────────────────────
SELECT
  pp.id                                                          AS roster_id,
  'party'::text                                                  AS source,
  pp.project_id                                                  AS project_id,
  pp.party_kind                                                  AS kind,
  pp.display_name                                                AS display_name,
  pp.company_name                                                AS company_name,
  pp.email                                                       AS email,
  pp.phone                                                       AS phone,
  pp.trade                                                       AS trade,
  NULL::text                                                     AS job_title,
  NULL::text                                                     AS staff_role,
  pp.studio_contact_id                                           AS studio_contact_id,
  pp.profile_id                                                  AS profile_id,
  pp.show_to_client                                              AS show_to_client,
  EXISTS (
    SELECT 1 FROM public.field_link_tokens flt
    WHERE flt.party_id = pp.id
      AND flt.status = 'active'
      AND (flt.expires_at IS NULL OR flt.expires_at > now())
  )                                                               AS has_active_field_link,
  pp.sms_consent_status                                          AS sms_consent_status,
  pp.updated_at                                                  AS updated_at
FROM public.project_parties pp

UNION ALL

-- ── TEAM BRANCH ──────────────────────────────────────────────────────────
SELECT
  tm.id                                                          AS roster_id,
  'team'::text                                                   AS source,
  tm.project_id                                                  AS project_id,
  tm.role                                                        AS kind,
  COALESCE(
    NULLIF(trim(p.display_name), ''),
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(split_part(p.email, '@', 1)), ''),
    'Teammate'
  )                                                               AS display_name,
  NULL::text                                                     AS company_name,
  p.email                                                        AS email,
  p.phone                                                        AS phone,
  NULL::text                                                     AS trade,
  om.job_title                                                   AS job_title,
  om.staff_role                                                  AS staff_role,
  NULL::uuid                                                     AS studio_contact_id,
  tm.user_id                                                     AS profile_id,
  false                                                           AS show_to_client,
  false                                                           AS has_active_field_link,
  NULL::text                                                     AS sms_consent_status,
  tm.updated_at                                                  AS updated_at
FROM public.project_team_members tm
JOIN public.projects pj ON pj.id = tm.project_id
LEFT JOIN public.profiles p ON p.id = tm.user_id
LEFT JOIN public.organization_members om
  ON om.user_id = tm.user_id
 AND om.organization_id = pj.studio_id
 AND om.status = 'active'
WHERE tm.removed_at IS NULL;

GRANT SELECT ON public.v_project_roster TO authenticated;

COMMENT ON VIEW public.v_project_roster IS
  'Call Sheet (Wave 3): the project roster — every tracked project_parties '
  'row (source=party) UNION ALL every active project_team_members login '
  '(source=team), one shape for the Call Sheet UI. security_invoker = true: '
  'base-table RLS on project_parties, project_team_members, profiles, and '
  'organization_members governs what each caller actually sees; the om join '
  'degrading to NULL job_title/staff_role for a viewer without co-member '
  'visibility is intended, not a leak. has_active_field_link checks '
  'field_link_tokens (00283) for a live, unexpired, unrevoked token; that '
  'table is designer-only RLS, so a non-designer viewer sees false even when '
  'a link exists — same degrade posture as the om join.';
