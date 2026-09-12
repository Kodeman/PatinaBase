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
-- RLS: is_active_studio_member(project_party_org(engagement_id)) AND
-- is_studio_comember() via the project (project_party_designer(), 00592).
-- project_parties' own posture is the co-member leg alone (00584:884-921), and
-- that leg is satisfied by sharing ANY active organization with the designer
-- of record — so on this table, which carries scope and the money THRESHOLD
-- beside it, a second studio the designer also works for read every grant
-- (w1b final review r5 MAJOR-3). The tenant conjunct comes first. The new
-- resolver project_party_org() answers the org question through the ONE
-- resolver project_consent_org() — close-review r1 MAJOR-1's lesson: an
-- inlined copy of a definer lookup inside an invoker context is a different
-- function.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_party_org(seat) → the studio that owns the seat's project
-- ═══════════════════════════════════════════════════════════════════════════
-- Delegates to project_consent_org() rather than restating its COALESCE. One
-- resolver, so the authority policy and the consent ledger can never name
-- different studios for the same seat.
CREATE OR REPLACE FUNCTION public.project_party_org(p_party_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.project_consent_org(pp.project_id)
    FROM public.project_parties pp
   WHERE pp.id = p_party_id;
$$;

REVOKE ALL ON FUNCTION public.project_party_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_party_org(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.project_party_org(uuid) IS
  'The studio that owns a seat''s project, through the ONE resolver '
  'project_consent_org() (00594). SECURITY DEFINER; feeds PR-n''s '
  'owner/admin gate on project_party_authority (00624).';

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
-- studio is resolved through project_party_org()'s single resolver; a project
-- that resolves to NO studio cannot verify either pointer, so it refuses
-- rather than accept an unverifiable cross-tenant value.
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
  IF NEW.company_id IS NULL AND NEW.warranty_contact_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org := public.project_consent_org(NEW.project_id);
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_project_party_cards()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_project_party_cards() IS
  'BEFORE INSERT/UPDATE on project_parties: company_id must name a COMPANY '
  'card and warranty_contact_person_id a PERSON card, both in the studio '
  'project_party_org()/project_consent_org() resolves for the project '
  '(party_company_not_a_company / party_company_other_studio / '
  'party_warranty_contact_not_a_person / _other_studio / '
  'party_card_project_has_no_studio). The self-FKs cannot say this — '
  'studio_contacts holds both kinds of card and every studio''s cards (00624, '
  'the 00592 R-AP shape).';

DROP TRIGGER IF EXISTS assert_project_party_cards_trg ON public.project_parties;
CREATE TRIGGER assert_project_party_cards_trg
  BEFORE INSERT OR UPDATE OF company_id, warranty_contact_person_id, project_id
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
  'project_party_org(engagement_id)) beside the co-member leg — because '
  'is_studio_comember(designer) is true whenever the caller shares ANY active '
  'organization with the designer of record, so a second studio that designer '
  'also works for read every grant and its money threshold (w1b final review '
  'r5 MAJOR-3). '
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
-- studio the designer of record also works for. project_party_org(engagement)
-- is project_consent_org(pp.project_id), the one org resolver (00594), and is
-- already the argument PR-n's admin leg uses below, so the table now answers
-- to exactly one studio on both legs.
ALTER TABLE public.project_party_authority ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_party_authority_studio_select
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_select
  ON public.project_party_authority FOR SELECT
  TO authenticated
  USING (
    public.is_active_studio_member(public.project_party_org(engagement_id))
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
    public.is_active_studio_member(public.project_party_org(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_org(engagement_id))
    )
  );

DROP POLICY IF EXISTS project_party_authority_studio_update
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_update
  ON public.project_party_authority FOR UPDATE
  TO authenticated
  USING (
    public.is_active_studio_member(public.project_party_org(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_org(engagement_id))
    )
  )
  WITH CHECK (
    public.is_active_studio_member(public.project_party_org(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_org(engagement_id))
    )
  );

DROP POLICY IF EXISTS project_party_authority_studio_delete
  ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_delete
  ON public.project_party_authority FOR DELETE
  TO authenticated
  USING (
    public.is_active_studio_member(public.project_party_org(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (
      scope NOT IN ('money', 'draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_org(engagement_id))
    )
  );

REVOKE ALL ON TABLE public.project_party_authority
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_party_authority TO authenticated;
GRANT ALL ON public.project_party_authority TO service_role;
