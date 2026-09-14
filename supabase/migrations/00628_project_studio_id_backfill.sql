-- ═══════════════════════════════════════════════════════════════════════════
-- 00628 — People room CRM · W3/P2 (1 of 6): R-BD's legacy projects
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11), rulings R-BD
-- and R-BI. W1b left a named debt:
--
--   R-BD — "Every tenant resolution for a project uses project_tenant_org();
--   project_consent_org() is retired from guards and reducers; projects with
--   studio_id IS NULL are a legacy population: W3 backfills projects.studio_id
--   from the designer's single active studio membership (ambiguous ones stay
--   NULL and are listed), and the W7 preflight counts the remaining NULLs on
--   Strata before deploy."
--
--   R-BI — on that same population nothing stamps a seat with a rolodex card
--   (project_recorded_studio() is NULL, so link_party_to_rolodex_card() has no
--   studio to resolve a card in), so one carded human can appear on the
--   Directory twice until this file runs.
--
-- LINEAGE: 00317 (studio_id + set_project_studio_id) → 00563 (the activation
-- bridge's ambiguity resolution) → 00594 (project_consent_org) → 00624
-- (project_tenant_org / project_recorded_studio, the gate resolvers) → 00626
-- (people_directory v4, whose stamp depends on the recorded studio) → 00628.
--
-- ── 1. WHAT THIS BACKFILLS, AND WHAT IT REFUSES TO GUESS ───────────────────
-- One rule, the one R-BD states: a studio-less project takes the studio its
-- DESIGNER OF RECORD actively and unambiguously belongs to. The predicate is
-- project_tenant_org()'s own second leg with the CALLER legs removed —
-- organization_members active, role <> 'guest', organizations.type =
-- 'design_studio' and status 'active' — so a project stamped here resolves the
-- same studio through project_tenant_org(), project_recorded_studio() and
-- project_consent_org() alike, and the three can never disagree again for it.
--
-- EXACTLY ONE candidate, or nothing. Zero memberships and several memberships
-- both stay NULL: R-BD says ambiguous ones are LISTED, not resolved, and
-- 00563's tie-break exists only inside the proposal-activation bridge, where a
-- proposal names its own relationship. A migration has no such evidence.
--
-- THE SHIPPED TRIGGER IS NOT BYPASSED. set_project_studio_id() is
-- BEFORE INSERT OR UPDATE OF (id, studio_id, designer_id, client_id,
-- proposal_id, created_by, created_at), so this UPDATE fires it. It sees
-- NEW.studio_id already set and takes the v_postgres_migration return
-- (session_user = 'postgres', role none/postgres) after its immutability
-- checks — we are not asking it to re-derive, we are handing it the same
-- answer it would derive. Its own derivation carries one extra predicate,
-- has_designer_domain_role(designer_id); this file deliberately does NOT, for
-- the reason R-BD gives: the population being repaired is the one whose
-- tenancy the ACCESS GATES need, and a designer of record whose `designer`
-- domain role was never granted still owns a job whose seats, site access card
-- and authority grants must resolve a tenant. The count of rows in that delta
-- is reported below.
--
-- IDEMPOTENT: the WHERE clause is `studio_id IS NULL`, so a rerun over an
-- already-backfilled database updates nothing. The counting block prints its
-- numbers on every run whether or not a row moved.
--
-- ── 2. WHAT project_consent_org() STILL RESOLVES, AND WHY IT STAYS ─────────
-- The W3 brief asks that every remaining project_consent_org() caller be
-- grafted onto project_tenant_org(). Enumerated on a freshly reset database
-- (pg_proc.prosrc, pg_get_viewdef, pg_policy) there are twelve, and every one
-- of them is the CONSENT LEDGER'S KEY — `channel_consent_status(
-- project_consent_org(project), 'sms', phone_e164)` — not a guard and not a
-- reducer over rows:
--
--   functions  _site_request_consent_granted_dispatch, fc_dispatch_court_
--              assignment, fc_dispatch_task_assignment, identity_phone_numbers,
--              refuse_legacy_consent_write, site_request_dispatch_after_consent,
--              site_request_resend, site_request_send
--   views      field_activity_summary, people_directory,
--              people_directory_seats, v_project_roster
--
-- Grafting those onto project_tenant_org() would be a REGRESSION, not a
-- completion: project_tenant_org() is caller-relative by construction (00624
-- §1's COMMENT says so in terms — "it may gate access and may NEVER resolve a
-- consent record's studio"), so the same number would read `opted_out` for one
-- member and `not_asked` for another on the same seat. R-BD's own words scope
-- the retirement to GUARDS AND REDUCERS, and W1b already finished that half:
-- every RLS policy, every visibility leg and every paper/consent/seat reducer
-- in 00624, 00625, 00626 and 00627 resolves through project_tenant_org() or
-- project_recorded_studio(). Nothing is grafted here, and w3-data-report.md §6
-- carries the enumeration.
--
-- After this backfill the question is largely moot for the repaired rows:
-- project_consent_org() is COALESCE(studio_id, _primary_studio_for(designer)),
-- so a stamped project resolves studio_id in both functions and the fallback
-- leg is never reached.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The backfill ───────────────────────────────────────────────────────────
WITH candidate AS (
  SELECT
    p.id AS project_id,
    (
      SELECT om.organization_id
        FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
       WHERE om.user_id = p.designer_id
         AND om.status  = 'active'
         AND om.role   <> 'guest'
         AND o.type     = 'design_studio'
         AND o.status   = 'active'
       LIMIT 1
    ) AS only_org,
    (
      SELECT count(DISTINCT om.organization_id)
        FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
       WHERE om.user_id = p.designer_id
         AND om.status  = 'active'
         AND om.role   <> 'guest'
         AND o.type     = 'design_studio'
         AND o.status   = 'active'
    ) AS n_orgs
  FROM public.projects p
  WHERE p.studio_id IS NULL
    AND p.designer_id IS NOT NULL
)
UPDATE public.projects p
   SET studio_id = c.only_org
  FROM candidate c
 WHERE p.id = c.project_id
   AND c.n_orgs = 1
   AND c.only_org IS NOT NULL;

-- ── The count R-BD asks to be LISTED, printed at apply time ────────────────
-- NOTICE rather than a table: the numbers belong in w3-data-report.md and in
-- the W7 preflight, and a migration that left a report table behind would be
-- a second source of truth for a one-time fact.
DO $$
DECLARE
  v_remaining      integer;
  v_zero           integer;
  v_several        integer;
  v_with_seats     integer;
  v_stamped_seats  integer;
  v_role_delta     integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.projects p WHERE p.studio_id IS NULL;

  SELECT
    count(*) FILTER (WHERE m.n = 0),
    count(*) FILTER (WHERE m.n > 1)
  INTO v_zero, v_several
  FROM public.projects p
  CROSS JOIN LATERAL (
    SELECT count(DISTINCT om.organization_id) AS n
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
     WHERE om.user_id = p.designer_id
       AND om.status  = 'active'
       AND om.role   <> 'guest'
       AND o.type     = 'design_studio'
       AND o.status   = 'active'
  ) m
  WHERE p.studio_id IS NULL;

  -- R-BI's population: the studio-less projects that actually carry seats,
  -- which is where the duplicate Directory identity was visible.
  SELECT count(*) INTO v_with_seats
    FROM public.projects p
   WHERE p.studio_id IS NULL
     AND EXISTS (SELECT 1 FROM public.project_parties pp
                  WHERE pp.project_id = p.id);

  -- r11 MAJOR-2's blast radius, beside R-BD's own count: the STAMPED seats on
  -- those jobs. Every one of them is a card that cannot be merged until the
  -- job records a studio, because 00629 refuses the fold by name
  -- (merge_seat_on_studioless_project) rather than letting 00624's guard abort
  -- it mid-transaction.
  SELECT count(*) INTO v_stamped_seats
    FROM public.project_parties pp
    JOIN public.projects p ON p.id = pp.project_id
   WHERE p.studio_id IS NULL
     AND pp.studio_contact_id IS NOT NULL;

  -- The delta between this file's predicate and set_project_studio_id()'s:
  -- projects stamped here whose designer holds no `designer` domain role.
  SELECT count(*) INTO v_role_delta
    FROM public.projects p
   WHERE p.studio_id IS NOT NULL
     AND p.designer_id IS NOT NULL
     AND NOT public.has_designer_domain_role(p.designer_id);

  RAISE NOTICE '00628 R-BD backfill: % project(s) still studio_id IS NULL (% with no active design-studio membership, % with several); % of those carry seats (R-BI), carrying % seat(s) stamped with a rolodex card (r11 MAJOR-2: each one a pair the room cannot merge); % stamped project(s) have a designer with no designer domain role',
    v_remaining, v_zero, v_several, v_with_seats, v_stamped_seats, v_role_delta;
END $$;

COMMENT ON COLUMN public.projects.studio_id IS
  'The studio that owns the job. Set by set_project_studio_id() (00317) on '
  'every write, and BACKFILLED once by 00628 for the legacy population that '
  'predates it: a studio-less project took the one active, non-guest '
  'design-studio membership its designer of record holds, and stayed NULL '
  'where there were none or several (R-BD; ambiguous ones are listed in '
  'artifacts/people-room-crm-2026-09-11/build/w3-data-report.md §6). While it '
  'is NULL, project_recorded_studio() (00624) answers NULL, the site access '
  'card and the authority grant refuse BOTH studios, and no seat on the job '
  'is stamped with a rolodex card (R-BI), so one carded human can hold two '
  'Directory identities.';
