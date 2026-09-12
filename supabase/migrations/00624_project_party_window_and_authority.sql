-- ═══════════════════════════════════════════════════════════════════════════
-- 00624 — People room CRM · W1b (2 of 5): the seat's window, stage and
--          authority (E5, E12, E14)
--
-- "Everyone on the Job" §7. Two gaps, one object:
--
--   G-15 — authority is not modelled anywhere. Nothing says who may approve
--   money, sign a change order, certify a draw or enter the site; the only
--   authority vocabulary in the schema is client_decisions.court's CHECK
--   (00281:158-171). The fixture's plain sentence — "Adaeze decides finishes,
--   Chidi signs money over $2,500" — has no home.
--
--   The seat itself carries no stage and no window. A bidder and a mobilized
--   sub are indistinguishable (CS3-9), the radon sub who arrives in 2027-02
--   and the photographer who is on site for one day look identical (CS2-18,
--   CS1-18), and REMOVE from a call sheet is a hard delete (G-10) because
--   there is no off_job_at to write instead.
--
-- What lands here:
--
--   1. project_parties gains stage (CHECK, not an enum — an ALTER TYPE ADD
--      VALUE cannot be used in the transaction that adds it), the window
--      (on_site_from / on_site_to), site_access_mode, contracted_through,
--      off_job_at / off_job_reason, a real company_id FK at the rolodex firm
--      card (today company_name is a TEXT snapshot — CS5-6), warranty_until
--      and warranty_contact_person_id.
--
--      stage is backfilled from the project: a party on a COMPLETED project is
--      `warranty` while the close is inside twelve months and `off_job`
--      after, which is crm-model §5's ladder read backwards from the only
--      dated fact the schema has. Everything else keeps the column default
--      `active`, which is what every live seat means today.
--
--      NOT the consent columns. 00594's refuse_legacy_consent_write_trg
--      freezes the eight sms_consent_* columns plus phone/phone_e164 (R-AX);
--      it is a BEFORE UPDATE OF on those columns only, so every column added
--      here is ordinarily writable by a studio member. SQL block 4 asserts it.
--
--   2. project_party_authority — E12. One row per (seat, scope): money,
--      change_order, selections, schedule, site_access, key, draw_certify.
--      threshold_cents is integer cents (the $2,500 line is 250000).
--      prepares_only is F-03's and F-08's fact: they assemble the draw and the
--      change order, they do not sign it (CS3-4).
--
--      PR-n is enforced in the INSERT/UPDATE policy, not in code: the lead
--      designer may set a grant whose scope excludes money and draw
--      certification; money and draw_certify need an owner or admin of the
--      studio (is_org_admin_or_owner, 00556). A grant that over-reaches is
--      how an approval gets accepted from someone who never held the
--      authority, and the check has to sit where the portal cannot be
--      bypassed — PostgREST is a writer too.
--
-- RLS: is_active_studio_member(project_party_recorded_studio(engagement_id))
-- AND is_studio_comember() via the project (project_party_designer(), 00592).
-- The tenant leg asks the RECORD — projects.studio_id — never the caller: a
-- job that names no studio refuses BOTH studios rather than admitting both
-- (§1c, w1b final review r8 BLOCKING-1).
-- project_parties' own posture is the co-member leg alone (00584:884-921), and
-- that leg is satisfied by sharing ANY active organization with the designer
-- of record — so on this table, which carries scope and the money THRESHOLD
-- beside it, a second studio the designer also works for read every grant
-- (w1b final review r5 MAJOR-3). The tenant conjunct comes first. The new
-- resolver project_party_org() answers the org question through
-- project_tenant_org() — close-review r1 MAJOR-1's lesson: an inlined copy of
-- a definer lookup inside an invoker context is a different function.
--
-- WHY THE GATE'S RESOLVER IS NOT project_consent_org() (w1b final review r6
-- MAJOR-1). project_consent_org() is COALESCE(studio_id,
-- _primary_studio_for(designer_id)), and on a project that records NO studio
-- the fallback names whatever studio the designer's own membership list
-- happens to rank first — which need not be the studio doing the work. On the
-- local fixture it never is: 5 of 8 projects carry studio_id IS NULL, their
-- designer of record belongs to TWO active design studios, and the resolver
-- names the other one. Used as an access gate that read as "this job belongs
-- to nobody you know": an ADMIN of the studio doing the work saw 0 seats, 0
-- site access cards, 0 authority grants, and an INSERT of a site access card
-- was refused — while the raw project_parties row stayed visible. The consent
-- LEDGER still resolves through project_consent_org(), because a record's
-- studio must be the same for every reader; a GATE may not guess. So
-- project_tenant_org() names the recorded studio when there is one and,
-- where the record names none, the DESIGN STUDIO the caller and the job's
-- designer both belong to — never a guess, never a non-design organization.
-- Backfilling projects.studio_id (the other candidate fix) would have to
-- guess the same way: the designer of all five studio-less local projects is
-- an owner of two design studios, so nothing in the record chooses. THE COUNT
-- OF studio_id IS NULL PROJECTS ON STRATA IS OWED BEFORE THIS CHAIN RUNS:
-- locally it is 5 of 8, and every gate in this wave turns on it.
--
-- AND THAT OWED COUNT GATES A CONSENT QUESTION, NOT ONLY A VISIBILITY ONE
-- (w1b final review r7 MAJOR-1, for the deploy brief). On a studio-less
-- project the SEND rail resolves the org the same way SQL does —
-- _shared/sms.ts resolveProjectOrg() over primaryStudioFor(), i.e.
-- COALESCE(studio_id, _primary_studio_for(designer)) — so a `granted` record
-- held at the GUESSED studio permits a text to a number the studio doing the
-- work has recorded `opted_out`. That is project_consent_org()'s own
-- pre-existing posture (00594 / R-AK), not something 00623-00627 introduce;
-- it is written here because the owed Strata number is owed for that reason
-- too, not only because the gates turn on it.
--
-- R-BD, the ruling this banner now sits under: every tenant resolution for a
-- project uses project_tenant_org(), project_consent_org() is retired from
-- guards and reducers, and the studio_id IS NULL population is LEGACY — W3
-- backfills projects.studio_id from the designer's SINGLE active design-studio
-- membership, leaves the ambiguous ones NULL and lists them, and the W7
-- preflight counts what remains on Strata before this chain runs. (The five
-- local ones are all ambiguous: their designer owns two design studios, so
-- nothing in the record chooses and the backfill may not guess either.)
--
-- AND THE TWO SENSITIVE OBJECTS DO NOT ASK IT (w1b final review r8
-- BLOCKING-1). project_tenant_org()'s second leg is CALLER-RELATIVE, so on a
-- studio_id IS NULL project is_active_studio_member(project_tenant_org(p)) is
-- self-satisfying: it is false only for a caller who shares no design studio
-- with the job's designer, which makes r5 MAJOR-3's tenant conjunct a
-- narrowing of is_studio_comember from any organization to a design-studio
-- organization and nothing more. Walked as a plain member of the designer's
-- SECOND design studio, on a studio-less job of the first: the lockbox
-- version, the alarm account, the site hours, the key holder and the gas
-- emergency line read; an UPDATE of lockbox_version landed; the money grant's
-- 250000 threshold read. So project_party_authority (the policies below) and
-- project_site_access_cards (00625) resolve project_recorded_studio() (§1c)
-- instead, and a studio-less job refuses BOTH studios until R-BD's W3
-- backfill names one — PR-w's own posture, in writing. The seats view, the
-- Directory's party branch and identity_phone_numbers()' seat leg keep the
-- caller-relative resolver deliberately: r6 MAJOR-1 (the admin of the studio
-- doing the work read 0 seats on its own job) and r7 MAJOR-1 (a refused
-- number dropped out of a worst-first reduction and the row printed the
-- affirmative word) are the defects a narrower gate THERE reintroduces, and a
-- seat row carries no lockbox version and no threshold. §1c carries the
-- argument and names what stays open.
--
-- AND THE CARD GUARD NOW NAMES studio_contact_id (w1b final review r9
-- MAJOR-2). It was the one pointer of the 00592 R-AP family with no guard of
-- any kind, and 00626 made it the v4 identity key, so one ordinary UPDATE
-- through PostgREST stamping a card of the designer's OTHER studio dropped a
-- seated human out of her own studio's Directory while the roster and the
-- site access card still named her seat, and made the other studio's row
-- claim a seat_count it cannot nest. The leg is kind-agnostic and resolves
-- the same project_tenant_org() as the other two — the guard's own §, below,
-- carries the walk and the reason a record-only resolver there would be r7
-- BLOCKING-1's inversion.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_tenant_org(project) → the studio an ACCESS GATE answers to
-- ═══════════════════════════════════════════════════════════════════════════
-- The banner above is the whole argument. Two legs, in order:
--   · projects.studio_id, when the record names a studio. Nothing else is
--     consulted, so a member of a second studio the designer also works for
--     is still refused — that is r5 MAJOR-1/MAJOR-3's conjunct, unchanged.
--   · where the record names NONE: the design studio that the caller and the
--     job's designer / lead designer / creator both actively belong to. This
--     leg is CALLER-RELATIVE by design — it answers "which of your studios is
--     this job's, as far as the record can tell" — so it may only ever gate
--     access. It must never resolve a consent record's studio, which has to
--     read the same for everybody (project_consent_org(), 00594).
--     organizations.type = 'design_studio' is load-bearing: without it a
--     manufacturer organization shared with the designer would resolve as the
--     tenant, which is exactly the hole r5 closed.
--   · owner/admin first in the ORDER BY so PR-n's money narrowing
--     (is_org_admin_or_owner) resolves at a studio where the caller actually
--     holds the standing, not at an arbitrary one of two.
-- THE TWO SENSITIVE OBJECTS DO NOT ASK THIS FUNCTION (r8 BLOCKING-1): because
-- the second leg is caller-relative, is_active_studio_member() over it is
-- self-satisfying on the studio-less population, so the site access card
-- (00625) and the authority grant (the policies below) ask
-- project_recorded_studio() (§1c) and refuse both studios where the record
-- names none. What still resolves through here — the seats view, the
-- Directory's party branch, identity_phone_numbers()' seat leg — is named in
-- §1c with the reason.
CREATE OR REPLACE FUNCTION public.project_tenant_org(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    p.studio_id,
    (
      SELECT om.organization_id
        FROM public.organization_members om
        JOIN public.organizations o
          ON o.id = om.organization_id
        JOIN public.organization_members owner_m
          ON owner_m.organization_id = om.organization_id
       WHERE om.user_id = (SELECT auth.uid())
         AND om.status = 'active'
         AND om.role <> 'guest'
         AND o.type = 'design_studio'
         AND o.status = 'active'
         AND owner_m.user_id IN (p.designer_id, p.lead_designer_id, p.created_by)
         AND owner_m.status = 'active'
         AND owner_m.role <> 'guest'
       ORDER BY (om.role IN ('owner', 'admin')) DESC, om.organization_id
       LIMIT 1
    )
  )
    FROM public.projects p
   WHERE p.id = p_project_id;
$$;

REVOKE ALL ON FUNCTION public.project_tenant_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_tenant_org(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.project_tenant_org(uuid) IS
  'The studio an ACCESS GATE answers to for a project: projects.studio_id '
  'when the record names one, else the design studio the CALLER and the job''s '
  'designer / lead designer / creator all actively belong to (owner/admin '
  'preferred, so PR-n''s money narrowing resolves where the caller holds the '
  'standing). Caller-relative by construction, so it may gate access and may '
  'NEVER resolve a consent record''s studio — that stays '
  'project_consent_org() (00594), which must read the same for every caller. '
  'Exists because project_consent_org()''s _primary_studio_for() fallback, '
  'used as a gate, hid every seat, site access card and authority grant on a '
  'studio_id IS NULL project from the admin of the studio doing the work and '
  'refused their writes — 5 of 8 local projects, whose designer owns two '
  'design studios (w1b final review r6 MAJOR-1). SECURITY DEFINER; '
  'organizations.type = ''design_studio'' keeps a shared manufacturer org from '
  'resolving as the tenant. NOT the resolver for the site access card or the '
  'authority grant: the caller-relative leg makes is_active_studio_member() '
  'over this function self-satisfying on the studio-less population, where a '
  'plain member of the designer''s SECOND design studio read the lockbox '
  'version, the alarm account, the hours, the key holder and the gas line, '
  'landed an UPDATE of lockbox_version, and read the money grant''s 250000 '
  'threshold (w1b final review r8 BLOCKING-1) — those two tables ask '
  'project_recorded_studio() (§1c) (00624).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b. project_party_org(seat) → the studio that owns the seat's project
-- ═══════════════════════════════════════════════════════════════════════════
-- Delegates to project_tenant_org() rather than restating its legs. One
-- resolver for every gate in this wave, so the authority policy, the site
-- access card and the seats view can never name different studios for the
-- same seat.
CREATE OR REPLACE FUNCTION public.project_party_org(p_party_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.project_tenant_org(pp.project_id)
    FROM public.project_parties pp
   WHERE pp.id = p_party_id;
$$;

REVOKE ALL ON FUNCTION public.project_party_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_party_org(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.project_party_org(uuid) IS
  'The studio that owns a seat''s project FOR GATING PURPOSES, through the ONE '
  'gate resolver project_tenant_org() (00624). Was project_consent_org(), '
  'whose _primary_studio_for() fallback named a studio nobody on the job '
  'belongs to on every studio_id IS NULL project (w1b final review r6 '
  'MAJOR-1). SECURITY DEFINER; feeds PR-n''s owner/admin gate on '
  'project_party_authority (00624).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1c. project_recorded_studio(project) / project_party_recorded_studio(seat)
--     → the studio the RECORD names, and nothing else
-- ═══════════════════════════════════════════════════════════════════════════
-- w1b final review r8 BLOCKING-1. project_tenant_org()'s second leg answers
-- with the CALLER's own active non-guest design studio whenever the job's
-- designer / lead designer / creator also belongs to it, so on a
-- studio_id IS NULL project is_active_studio_member(project_tenant_org(p)) is
-- SELF-SATISFYING: it is false only for a caller who shares no design studio
-- with the job's designer. Walked on a freshly reset database as a plain
-- member of the designer's SECOND design studio (never a member of the studio
-- doing the work): the site access card's lockbox version, alarm account,
-- site hours, key holder and gas emergency line all read; an UPDATE of
-- lockbox_version landed; and the money authority grant read with its 250000
-- threshold. Direction §7 rates the site access card risk High and calls it
-- the first genuinely sensitive text in the room; PR-w rules it studio-only.
--
-- So the two objects that carry the sensitive text and the money figure ask
-- the RECORD and never the caller. Where projects.studio_id is NULL these
-- resolvers answer NULL, is_active_studio_member(NULL) is false (00417), and
-- the job refuses BOTH studios rather than admitting both — PR-w's own
-- posture. It costs the studio-less population those two features until
-- R-BD's W3 backfill writes projects.studio_id from the designer's single
-- active design-studio membership; the projects it leaves NULL (locally all
-- five, whose designer owns two design studios) keep neither feature, and the
-- Strata count of studio_id IS NULL projects is owed before this chain runs.
--
-- WHAT DELIBERATELY STAYS ON project_tenant_org(), and why a narrower gate
-- there would be a regression, not a fix:
--   · people_directory_seats and the Directory's party branch (00626) — r6
--     MAJOR-1: resolving those through a record-only studio hid every seat on
--     a studio-less job from the ADMIN of the studio doing the work, on 5 of
--     8 local projects. A seat row carries a name, a trade, a number and a
--     paper word; it carries no lockbox version and no threshold, and its
--     consent word is already NULL for a caller who cannot read the deciding
--     record.
--   · identity_phone_numbers()' seat leg (00626 §…) — r7 MAJOR-1: that leg is
--     a deliberate SUPERSET, because a number dropping out of a WORST-FIRST
--     consent reduction makes the printed word MORE permissive. Narrowing it
--     reintroduces the affirmative word over a recorded refusal.
--   · assert_project_party_cards() (§… below) — r7 BLOCKING-1: a record-only
--     tenant there refuses the working studio's own firm card and warranty
--     contact on its own studio-less job, which is the inversion that finding
--     closed.
-- On the studio-less population those three remain readable by a second
-- design studio of the same designer. That residue is recorded here, in the
-- 00625 COMMENT and in the suite's block 17, and it is a ruling owed to Kody
-- with the Strata count — not a claim that the conjunct is a tenant boundary
-- there.
CREATE OR REPLACE FUNCTION public.project_recorded_studio(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.studio_id FROM public.projects p WHERE p.id = p_project_id;
$$;

REVOKE ALL ON FUNCTION public.project_recorded_studio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_recorded_studio(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.project_recorded_studio(uuid) IS
  'The studio a project''s RECORD names — projects.studio_id, with no '
  'fallback and no caller-relative leg. The gate for the two objects PR-w and '
  'direction §7 rule studio-only: project_site_access_cards (00625) and '
  'project_party_authority (00624). project_tenant_org()''s second leg is '
  'caller-relative, which makes is_active_studio_member() over it '
  'self-satisfying on a studio_id IS NULL project: a plain member of the '
  'designer''s SECOND design studio read the lockbox version, the alarm '
  'account, the site hours, the key holder and the gas emergency line, landed '
  'an UPDATE of lockbox_version, and read the money grant''s 250000 threshold '
  '(w1b final review r8 BLOCKING-1). NULL here means the job names no studio, '
  'is_active_studio_member(NULL) is false, and BOTH studios are refused until '
  'R-BD''s W3 backfill names one. SECURITY DEFINER for 00625 §1''s stated '
  'reason: a policy that resolved the studio through the caller''s own '
  'projects SELECT would make one table''s RLS depend on another''s, and a '
  'project the caller cannot see would read as "no studio" rather than "not '
  'yours" (00624).';

CREATE OR REPLACE FUNCTION public.project_party_recorded_studio(p_party_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.project_recorded_studio(pp.project_id)
    FROM public.project_parties pp
   WHERE pp.id = p_party_id;
$$;

REVOKE ALL ON FUNCTION public.project_party_recorded_studio(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_party_recorded_studio(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.project_party_recorded_studio(uuid) IS
  'The studio a SEAT''s project RECORDS, through project_recorded_studio() so '
  'the two sensitive objects of this wave can never name different studios '
  'for the same seat. Sibling of project_party_org(), which composes the '
  'caller-relative gate resolver instead and is therefore not the gate for '
  'project_party_authority (w1b final review r8 BLOCKING-1). Feeds both the '
  'tenant leg and PR-n''s owner/admin narrowing on that table, so money and '
  'draw_certify need the standing AT THE RECORDED STUDIO (00624).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. project_parties — the stage, the window, and the firm
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS stage            text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS on_site_from     date,
  ADD COLUMN IF NOT EXISTS on_site_to       date,
  ADD COLUMN IF NOT EXISTS site_access_mode text,
  ADD COLUMN IF NOT EXISTS contracted_through text,
  ADD COLUMN IF NOT EXISTS off_job_at       date,
  ADD COLUMN IF NOT EXISTS off_job_reason   text,
  ADD COLUMN IF NOT EXISTS company_id       uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_until   date,
  ADD COLUMN IF NOT EXISTS warranty_contact_person_id uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL;

-- Named, drop-and-re-add so the file is re-runnable and the vocabularies can
-- be widened later (an inline ADD COLUMN CHECK would be skipped by
-- IF NOT EXISTS on a rerun) — the 00592 idiom.
ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_stage_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_stage_check CHECK (
    stage IN (
      'prospect', 'invited', 'bidding', 'declined', 'no_response',
      'awarded', 'mobilized', 'active', 'closeout', 'warranty',
      'off_job', 'retired'
    )
  );

ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_site_access_mode_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_site_access_mode_check CHECK (
    site_access_mode IS NULL
    OR site_access_mode IN ('escorted', 'key', 'code', 'open')
  );

ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_contracted_through_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_contracted_through_check CHECK (
    contracted_through IS NULL
    OR contracted_through IN ('studio', 'gc', 'owner')
  );

ALTER TABLE public.project_parties
  DROP CONSTRAINT IF EXISTS project_parties_window_check;
ALTER TABLE public.project_parties
  ADD CONSTRAINT project_parties_window_check CHECK (
    on_site_to IS NULL OR on_site_from IS NULL OR on_site_to >= on_site_from
  );

COMMENT ON COLUMN public.project_parties.stage IS
  'crm-model §5 / direction §3.8''s stage family, on the SEAT. prospect | '
  'invited | bidding | declined | no_response | awarded | mobilized | active | '
  'closeout | warranty | off_job | retired. A CHECK, not an enum (PD-4, and an '
  'ADD VALUE cannot be used in the transaction that adds it). PR-p: stage '
  'prints on a seat line only, never as a person-level Directory column — one '
  'human holds many seats with many stages, and a single person-level stage is '
  'a fabrication (C1). Displaces nothing: the consent-derived status dot it '
  'replaces on the face lives in the app.';
COMMENT ON COLUMN public.project_parties.on_site_from IS
  'The window opens. The radon sub is 2027-02 and the stager 2027-08 (CS2-18); '
  'the Call Sheet groups by this and the field link''s expiry is read off '
  'on_site_to (PR-d, 00627).';
COMMENT ON COLUMN public.project_parties.on_site_to IS
  'The window closes. PR-d retires the 90-day link clock: a grant ends with '
  'the engagement, extended to warranty_until when the seat carries one.';
COMMENT ON COLUMN public.project_parties.site_access_mode IS
  'escorted | key | code | open — how this body gets on site. F-09 controls '
  'the gate, F-06 holds the key (CS4-20). `code` records THAT a code is the '
  'mode; the code itself is never stored (PR-r, 00625).';
COMMENT ON COLUMN public.project_parties.contracted_through IS
  'studio | gc | owner — who holds this seat''s contract. Decides who chases '
  'the paper and who may text about money (CS4-24). P-3 parks seat-to-seat '
  'second-tier contracting.';
COMMENT ON COLUMN public.project_parties.off_job_at IS
  'Replaces the hard delete (G-10, CS2-17). A seat that leaves the job keeps '
  'its row, its lineage and its bid history; only the date and the reason are '
  'added.';
COMMENT ON COLUMN public.project_parties.company_id IS
  'The rolodex FIRM card this seat is contracted through. Today company_name '
  'is a TEXT snapshot and the firm has no identity on the seat (CS5-6). '
  'Asserted to a COMPANY card in the project''s own studio by '
  'assert_project_party_cards(). PR-b: the name at time and the trade on the '
  'job stay snapshotted; the firm''s typed channels, rule, consent and '
  'document expiries are read live from the card.';
COMMENT ON COLUMN public.project_parties.warranty_until IS
  'Reach must outlive the link (CS4-17). Derived at closeout; extends the '
  'field-link window (PR-d/PR-l).';
COMMENT ON COLUMN public.project_parties.warranty_contact_person_id IS
  'One named person per firm after close (CS5-25). Asserted to a PERSON card '
  'in the project''s own studio.';

-- ── The two new card pointers have to be the cards they claim to be ─────────
-- Both are plain self-FKs into studio_contacts, which holds BOTH kinds of card
-- AND every tenant's cards — the 00592 R-AP hole, closed the same way. The
-- studio is resolved through project_tenant_org(), this wave's ONE gate
-- resolver (§1); a project that resolves to NO studio cannot verify either
-- pointer, so it refuses rather than accept an unverifiable cross-tenant
-- value.
--
-- IT WAS project_consent_org(), AND THAT INVERTED THE GUARD (w1b final review
-- r7 BLOCKING-1). r6 MAJOR-1 moved every gate in this wave onto
-- project_tenant_org() — the site-access policies (00625), the authority
-- policies through project_party_org() (§1b), the Directory's party branch and
-- the seats view (00626) — and this trigger, the ONLY tenant guard on
-- company_id and warranty_contact_person_id, was left behind. On a project
-- that records no studio_id the two resolvers name different studios (5 of 8
-- local projects), so the guard refused the working studio's OWN cards
-- (party_company_other_studio on their own firm, party_warranty_contact_other_
-- studio on their own warranty contact) and ACCEPTED a card belonging to the
-- studio the consent resolver guesses — a card the writer reads 0 rows of —
-- which then appeared on the working studio's own seat line with paper_state
-- degraded to not_on_file. The guard is SECURITY DEFINER and never asked
-- whether the caller belonged to v_org, so the error name it raised was
-- exactly the violation it permitted.
--
-- project_tenant_org() is CALLER-RELATIVE where the record names no studio, so
-- a writer with no auth.uid() (service_role, a seed, a backfill) resolves NULL
-- on that population and takes the existing party_card_project_has_no_studio
-- refusal — the honest answer, and already the behaviour for a project that
-- resolves to no studio at all. Every project the seed and both suites write a
-- pointer on records its studio_id, so nothing in the chain relies on the old
-- guess.
--
-- AND studio_contact_id IS THE THIRD POINTER, WHICH v4 MADE THE IDENTITY KEY
-- (w1b final review r9 MAJOR-2). It was the one pointer of the 00592 R-AP
-- family with no card guard of any kind: a bare self-FK into studio_contacts,
-- which holds every studio's cards, named by no trigger and tested by no
-- policy (project_parties_studio_update tests only the project), so
-- PATCH /rest/v1/project_parties with any card uuid landed. 00626 rests the
-- whole v4 identity model on it — the party branch excludes every stamped
-- seat (00626:1226) on the ground that a stamped seat's identity lives in the
-- CONTACTS branch, people_directory_seats.person_id COALESCEs to the stamp,
-- and party_identity_key()'s first precedence leg IS the stamp — so one
-- UPDATE by the designer who owns two studios (the shipped local shape)
-- re-stamped Ngozi Eze's Okonkwo seat with a card of the OTHER studio and:
-- the working studio's admin read her seat nesting under a card it cannot
-- read (person_id foreign, paper_state degraded to not_on_file), her own
-- Directory row's identity_seat_count fell to 0 while v_project_roster and
-- the site access card still named that seat as the key holder, and the other
-- studio's Directory row claimed seat_count 1 and nested 0 — breaking
-- 00626:1463-1465's promise that no Directory row ever claims a seat_count it
-- cannot nest, because identity_seat_count() is INVOKER over project_parties'
-- is_studio_comember(designer) RLS while people_directory_seats additionally
-- requires the tenant leg (00626:1566).
--
-- The leg is KIND-AGNOSTIC (00418's fold pass D2 stamps a COMPANY card on a
-- vendor_id-bearing seat, legitimately), and it resolves through the same
-- project_tenant_org() as the other two rather than project_recorded_studio()
-- — a record-only tenant HERE is r7 BLOCKING-1's inversion, stated above —
-- so the existing party_card_project_has_no_studio branch covers the NULL
-- case. It costs nothing on the shipped data: all five studio-less local
-- projects carry 0 seats, all 28 stamped seats name a card in their own
-- project's studio, and 00418's fold only ever stamps where
-- pj.studio_id IS NOT NULL AND sc.organization_id = pj.studio_id.
CREATE OR REPLACE FUNCTION public.assert_project_party_cards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org  uuid;
  v_kind text;
  v_card uuid;
BEGIN
  IF NEW.company_id IS NULL
     AND NEW.warranty_contact_person_id IS NULL
     AND NEW.studio_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org := public.project_tenant_org(NEW.project_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'party_card_project_has_no_studio'
      USING HINT = 'This project resolves to no studio, so a rolodex card on '
                   'its seats cannot be checked against one. Give the project '
                   'a studio first.';
  END IF;

  IF NEW.company_id IS NOT NULL THEN
    SELECT sc.entity_kind INTO v_kind
      FROM public.studio_contacts sc
     WHERE sc.id = NEW.company_id AND sc.organization_id = v_org;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'party_company_other_studio'
        USING HINT = 'project_parties.company_id must name a card in the '
                     'project''s own studio rolodex.';
    END IF;
    IF v_kind IS DISTINCT FROM 'company' THEN
      RAISE EXCEPTION 'party_company_not_a_company'
        USING HINT = 'project_parties.company_id must name a COMPANY card. '
                     'A person does not hold the subcontract.';
    END IF;
  END IF;

  IF NEW.warranty_contact_person_id IS NOT NULL THEN
    SELECT sc.entity_kind, sc.id INTO v_kind, v_card
      FROM public.studio_contacts sc
     WHERE sc.id = NEW.warranty_contact_person_id
       AND sc.organization_id = v_org;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'party_warranty_contact_other_studio'
        USING HINT = 'warranty_contact_person_id must name a card in the '
                     'project''s own studio rolodex.';
    END IF;
    IF v_kind IS DISTINCT FROM 'person' THEN
      RAISE EXCEPTION 'party_warranty_contact_not_a_person'
        USING HINT = 'warranty_contact_person_id must name a PERSON card. A '
                     'warranty call goes to a human, not to a firm (CS5-25).';
    END IF;
  END IF;

  -- studio_contact_id, the identity key (w1b final review r9 MAJOR-2). No
  -- entity_kind test: 00418's fold pass D2 (00418:321-332) legitimately stamps
  -- a COMPANY card on a vendor_id-bearing seat, so the only question the guard
  -- may ask is whose rolodex the card is in.
  IF NEW.studio_contact_id IS NOT NULL THEN
    SELECT sc.entity_kind INTO v_kind
      FROM public.studio_contacts sc
     WHERE sc.id = NEW.studio_contact_id AND sc.organization_id = v_org;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'party_studio_contact_other_studio'
        USING HINT = 'project_parties.studio_contact_id must name a card in '
                     'the project''s own studio rolodex — of either kind. It '
                     'is the identity key people_directory v4 groups a human '
                     'by, so a card from another studio drops the seated '
                     'human out of the working studio''s Directory and makes '
                     'the other studio''s row claim a seat it cannot nest.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_project_party_cards()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_project_party_cards() IS
  'BEFORE INSERT/UPDATE on project_parties: company_id must name a COMPANY '
  'card, warranty_contact_person_id a PERSON card and studio_contact_id a '
  'card of EITHER kind (00418''s fold stamps a company card on a '
  'vendor-bearing seat), all three in the studio '
  'project_tenant_org() resolves for the project — this wave''s ONE gate '
  'resolver, never project_consent_org() '
  '(party_company_not_a_company / party_company_other_studio / '
  'party_warranty_contact_not_a_person / _other_studio / '
  'party_studio_contact_other_studio / '
  'party_card_project_has_no_studio). studio_contact_id was the one pointer '
  'of the R-AP family with no guard at all, and 00626 made it the v4 identity '
  'key: one UPDATE stamping a foreign card dropped a seated human out of her '
  'own studio''s Directory while the roster and the site access card still '
  'named her seat, and made the other studio''s row claim a seat_count it '
  'cannot nest (w1b final review r9 MAJOR-2). The self-FKs cannot say this — '
  'studio_contacts holds both kinds of card and every studio''s cards (00624, '
  'the 00592 R-AP shape). It resolved through project_consent_org() until r7 '
  'BLOCKING-1: on a studio_id IS NULL project that guess INVERTED the guard — '
  'the working studio''s own firm and warranty-contact cards were refused '
  'while a card of the guessed studio, which the writer reads 0 rows of, '
  'LANDED on their seat and printed paper_state not_on_file on their own seat '
  'line. project_tenant_org() is caller-relative on that population, so a '
  'writer with no auth.uid() (service_role, seed, backfill) resolves NULL and '
  'takes the party_card_project_has_no_studio refusal rather than a guess.';

DROP TRIGGER IF EXISTS assert_project_party_cards_trg ON public.project_parties;
CREATE TRIGGER assert_project_party_cards_trg
  BEFORE INSERT OR UPDATE OF company_id, warranty_contact_person_id,
                             studio_contact_id, project_id
  ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.assert_project_party_cards();

-- The Call Sheet groups by window; the Directory counts seats per identity.
CREATE INDEX IF NOT EXISTS idx_project_parties_project_window
  ON public.project_parties(project_id, on_site_from, on_site_to);
CREATE INDEX IF NOT EXISTS idx_project_parties_company
  ON public.project_parties(company_id)
  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_parties_stage
  ON public.project_parties(project_id, stage);

-- ── Backfill: a seat on a closed job is in warranty, then off the job ───────
-- crm-model §5 read backwards from the only dated fact the schema carries.
-- projects.completed_at is the close; where it is missing, updated_at is the
-- best available stand-in and is named as such rather than silently assumed.
-- Guarded by `stage = 'active'` so a rerun after a studio has moved a stage by
-- hand does not overwrite it.
UPDATE public.project_parties pp
   SET stage = CASE
                 WHEN COALESCE(pj.completed_at, pj.updated_at)
                        > now() - interval '12 months' THEN 'warranty'
                 ELSE 'off_job'
               END
  FROM public.projects pj
 WHERE pj.id = pp.project_id
   AND pj.status = 'completed'
   AND pp.stage = 'active';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. project_party_authority — E12, who may approve what on this job
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.project_party_authority (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  engagement_id   uuid NOT NULL REFERENCES public.project_parties(id) ON DELETE CASCADE,

  scope           text NOT NULL,

  -- Money is integer cents. The $2,500 line is 250000.
  threshold_cents integer,

  -- F-03 and F-08 prepare the draw and the change order; they do not sign
  -- (CS3-4).
  prepares_only   boolean NOT NULL DEFAULT false,

  -- Engagement ids. An approval that missed F-05 reads incomplete (CS1-19).
  -- An array cannot carry an FK; the ids are seats on the same project and
  -- assert_party_authority_copy_to() holds them to it.
  copy_to         uuid[] NOT NULL DEFAULT '{}'::uuid[],

  source_clause   text,

  granted_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_party_authority_effective_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT project_party_authority_threshold_check
    CHECK (threshold_cents IS NULL OR threshold_cents >= 0)
);

ALTER TABLE public.project_party_authority
  DROP CONSTRAINT IF EXISTS project_party_authority_scope_check;
ALTER TABLE public.project_party_authority
  ADD CONSTRAINT project_party_authority_scope_check CHECK (
    scope IN ('money', 'change_order', 'selections', 'schedule',
              'site_access', 'key', 'draw_certify')
  );

COMMENT ON TABLE public.project_party_authority IS
  'E12: who may approve what, up to what number, on THIS job. One row per '
  '(seat, scope); G-15 says nothing in Patina could record it before. '
  'Authority is never a state word (direction §3.8) — it prints as plain '
  'text: "Signs money to $2,500", "Selections", "Prepares only", "Holds a '
  'key". PR-n gates the writers: the lead designer may set any scope except '
  'money and draw_certify, which need an owner or admin of the studio, '
  'enforced in the INSERT/UPDATE policies because PostgREST is a writer too. '
  'Every policy is tenant-scoped FIRST — is_active_studio_member('
  'project_party_recorded_studio(engagement_id)) beside the co-member leg — '
  'because is_studio_comember(designer) is true whenever the caller shares '
  'ANY active organization with the designer of record, so a second studio '
  'that designer also works for read every grant and its money threshold '
  '(w1b final review r5 MAJOR-3). The tenant leg asks the RECORD '
  '(projects.studio_id) and not the caller: project_tenant_org()''s '
  'caller-relative leg left that same second studio reading the grant and its '
  '250000 threshold on a studio-less job, so a job that names no studio now '
  'refuses BOTH studios — PR-w''s posture — until R-BD''s W3 backfill names '
  'one (w1b final review r8 BLOCKING-1). PR-n''s owner/admin narrowing '
  'resolves at the RECORDED studio for the same reason. '
  'PR-t: a phone shows the yes or no, the figure only on the desk (00624).';

COMMENT ON COLUMN public.project_party_authority.threshold_cents IS
  'Integer cents. The fixture''s $2,500 line is 250000. NULL means the scope '
  'carries no figure (selections, key, site_access).';
COMMENT ON COLUMN public.project_party_authority.copy_to IS
  'Engagement ids that must be copied on an approval under this grant '
  '(CS1-19). Held to seats on the SAME project by '
  'assert_party_authority_copy_to() — an array cannot carry a foreign key.';
COMMENT ON COLUMN public.project_party_authority.prepares_only IS
  'The holder assembles the paper and does not sign it (CS3-4). PR-t prints '
  'it as "Prepares only".';
COMMENT ON COLUMN public.project_party_authority.effective_to IS
  'Delegations end (CS5-24). A delegation during travel is a row, not an edit.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_party_authority_open
  ON public.project_party_authority(engagement_id, scope)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_party_authority_engagement
  ON public.project_party_authority(engagement_id);

DROP TRIGGER IF EXISTS set_updated_at_project_party_authority
  ON public.project_party_authority;
CREATE TRIGGER set_updated_at_project_party_authority
  BEFORE UPDATE ON public.project_party_authority
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- copy_to must name seats on the same project as the grant's own seat: an
-- approval copied to another job's party is a cross-project notice with no
-- home, and on a studio-less project it would be a cross-tenant one.
CREATE OR REPLACE FUNCTION public.assert_party_authority_copy_to()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project uuid;
  v_bad     integer;
BEGIN
  IF NEW.copy_to IS NULL OR cardinality(NEW.copy_to) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT pp.project_id INTO v_project
    FROM public.project_parties pp WHERE pp.id = NEW.engagement_id;

  SELECT count(*) INTO v_bad
    FROM unnest(NEW.copy_to) AS c(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.project_parties pp
      WHERE pp.id = c.id AND pp.project_id = v_project
   );

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'authority_copy_to_off_project'
      USING HINT = 'project_party_authority.copy_to must name seats on the '
                   'same project as the grant. An approval copied to another '
                   'job''s party is a notice with no home.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_party_authority_copy_to()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_party_authority_copy_to() IS
  'BEFORE INSERT/UPDATE on project_party_authority: every copy_to id must be a '
  'seat on the grant''s own project (authority_copy_to_off_project). A uuid[] '
  'cannot carry an FK (00624).';

DROP TRIGGER IF EXISTS assert_party_authority_copy_to_trg
  ON public.project_party_authority;
CREATE TRIGGER assert_party_authority_copy_to_trg
  BEFORE INSERT OR UPDATE OF copy_to, engagement_id
  ON public.project_party_authority
  FOR EACH ROW EXECUTE FUNCTION public.assert_party_authority_copy_to();

-- ── RLS: the project's studio reads and writes; PR-n narrows two scopes ─────
-- TENANT FIRST, then the designer (w1b final review r5 MAJOR-3).
-- is_studio_comember(p_owner) is true whenever the caller shares ANY active
-- organization with that owner, so the designer leg alone handed every
-- authority grant — scope, and the money THRESHOLD beside it — to a second
-- studio the designer of record also works for.
--
-- AND THE TENANT LEG ASKS THE RECORD, NOT THE CALLER (w1b final review r8
-- BLOCKING-1). It was project_party_org(engagement) = project_tenant_org(
-- pp.project_id), whose second leg answers with the CALLER's own design
-- studio where the record names none — self-satisfying, so a plain member of
-- the designer's SECOND design studio read this table's grant and its 250000
-- threshold on a studio-less job of the first. project_party_recorded_studio()
-- (§1c) is projects.studio_id alone: where the record names no studio the
-- table refuses BOTH studios until R-BD's W3 backfill names one. PR-n's
-- owner/admin narrowing resolves the same way, so money and draw_certify need
-- the standing AT THE RECORDED STUDIO and not at whichever of the caller's
-- studios a ranking picked.
ALTER TABLE public.project_party_authority ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_party_authority_studio_select
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_select
  ON public.project_party_authority FOR SELECT
  TO authenticated
  USING (
    public.is_active_studio_member(
      public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
  );

-- PR-n: the principal by default; the lead designer may set a grant whose
-- scope excludes money and draw certification. A wrong grant silently over-
-- or under-authorises an approval, so the narrowing lives in the policy.
DROP POLICY IF EXISTS project_party_authority_studio_insert
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_insert
  ON public.project_party_authority FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_studio_member(
      public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(
           public.project_party_recorded_studio(engagement_id))
    )
  );

DROP POLICY IF EXISTS project_party_authority_studio_update
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_update
  ON public.project_party_authority FOR UPDATE
  TO authenticated
  USING (
    public.is_active_studio_member(
      public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(
           public.project_party_recorded_studio(engagement_id))
    )
  )
  WITH CHECK (
    public.is_active_studio_member(
      public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(
           public.project_party_recorded_studio(engagement_id))
    )
  );

DROP POLICY IF EXISTS project_party_authority_studio_delete
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_delete
  ON public.project_party_authority FOR DELETE
  TO authenticated
  USING (
    public.is_active_studio_member(
      public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(
           public.project_party_recorded_studio(engagement_id))
    )
  );

REVOKE ALL ON TABLE public.project_party_authority
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_party_authority TO authenticated;
GRANT ALL ON public.project_party_authority TO service_role;
