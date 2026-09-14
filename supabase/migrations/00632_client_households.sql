-- ═══════════════════════════════════════════════════════════════════════════
-- 00632 — People room CRM · W3/P2 (5 of 6): the household, and the seat that
--         carries its authority
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) §7 (P2 row
-- `client_households`), §8 (P2: "household object with the change-order
-- threshold"), crm-model CRM-19, fixture F-04 / F-05, and PR-c — RULED:
--
--   "CRM-19: household object, or client_rep party row, for Chidi Okonkwo —
--    BOTH, split by job. A household holds the members and the change-order
--    threshold; every member who acts on a job gets a seat carrying the
--    authority grant. If household only: authority has no per-job home. If
--    client_rep only: the two spouses never resolve to one client."
--
-- The studio's client record for the Okonkwo residence is ONE designer_clients
-- row keyed to Adaeze's login. Chidi signs the money. Today he is either a
-- second invite (a second client record, so the studio has two clients for one
-- house) or a bare party row (so the two spouses never resolve to one client).
-- This file is PR-c's third answer: one household holding both, and a seat per
-- member per job carrying what that member may approve there.
--
-- LINEAGE: 00068 (is_org_admin_or_owner) → 00315 (is_studio_comember) → 00417
-- (studio_contacts, is_active_studio_member) → 00588 (invoice_links'
-- household name) → 00624 (project_party_authority and PR-n's owner/admin
-- narrowing on money) → 00629 (the merged-card guard) → 00632.
--
-- ── THE RLS, AND ONE LEG THE BRIEF DID NOT ASK FOR ────────────────────────
-- direction §7 states the predicate as `is_studio_comember(designer_id)`.
-- Shipped here with the TENANT LEG BESIDE IT — is_active_studio_member(
-- organization_id) AND is_studio_comember(designer_id) — which is w1b final
-- review r5 MAJOR-3's ruling applied to the one table in this wave that holds
-- a money figure: is_studio_comember() is true whenever the caller shares ANY
-- active organization with the designer of record, so a SECOND studio that
-- designer also works for would read every household's co_threshold_cents.
-- project_party_authority (00624) took the tenant leg for exactly this
-- reason, and a household threshold is the same fact one level up. Named in
-- w3-data-report.md §4 as a deliberate narrowing of the direction's line.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. client_households
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.client_households (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  designer_id     uuid NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,

  display_name    text NOT NULL,

  -- PERSON cards in the same studio rolodex. An array and not a join table:
  -- the room reads a household whole (two names, one threshold) and never
  -- joins through it — direction §7's own shape, and the posture
  -- project_party_authority.copy_to already takes. An array cannot carry a
  -- foreign key, so assert_client_household_members() holds every id.
  member_person_ids         uuid[] NOT NULL DEFAULT '{}'::uuid[],
  primary_member_person_id  uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL,

  -- The change-order threshold PR-c puts on the household. Integer cents; the
  -- fixture's $2,500 line is 250000.
  co_threshold_cents integer,

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_households_threshold_check
    CHECK (co_threshold_cents IS NULL OR co_threshold_cents >= 0),
  CONSTRAINT client_households_display_name_check
    CHECK (btrim(display_name) <> '')
);

COMMENT ON TABLE public.client_households IS
  'E3 / CRM-19: the two (or three) humans who are ONE client of the studio, '
  'and the change-order threshold they share (PR-c). The household holds the '
  'members and the figure; every member who ACTS on a job gets a '
  'project_parties seat and a project_party_authority row there — that is '
  'PR-c''s "both, split by job", and why this table carries no per-project '
  'column. Members are PERSON cards in the same studio rolodex, so the two '
  'spouses resolve to one client in the Directory (00632).';

COMMENT ON COLUMN public.client_households.member_person_ids IS
  'studio_contacts ids, PERSON cards, same organization_id, none merged away '
  '— held by assert_client_household_members(), because an array cannot carry '
  'a foreign key (the project_party_authority.copy_to shape, 00624).';
COMMENT ON COLUMN public.client_households.primary_member_person_id IS
  'The member the studio writes to by default — F-04 Adaeze Okonkwo, who '
  'decides finishes, beside F-05 Chidi, who signs money. Must be one of '
  'member_person_ids.';
COMMENT ON COLUMN public.client_households.co_threshold_cents IS
  'Integer cents. The fixture''s "over $2,500" line is 250000. NULL means the '
  'household has no recorded figure and add_household_member() writes no '
  'money grant. PR-t: a phone prints the yes or no, the figure only on the '
  'desk.';

CREATE INDEX IF NOT EXISTS idx_client_households_designer
  ON public.client_households(designer_id);
CREATE INDEX IF NOT EXISTS idx_client_households_org
  ON public.client_households(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_households_members
  ON public.client_households USING gin (member_person_ids);

DROP TRIGGER IF EXISTS set_updated_at_client_households ON public.client_households;
CREATE TRIGGER set_updated_at_client_households
  BEFORE UPDATE ON public.client_households
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── the members, held ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_client_household_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bad uuid;
BEGIN
  IF array_position(NEW.member_person_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'household_member_null'
      USING HINT = 'member_person_ids carries no NULLs.';
  END IF;

  SELECT m INTO v_bad
    FROM unnest(NEW.member_person_ids) AS m
   WHERE NOT EXISTS (
     SELECT 1 FROM public.studio_contacts sc
      WHERE sc.id = m
        AND sc.organization_id = NEW.organization_id
        AND sc.entity_kind = 'person'
        AND sc.merged_into IS NULL)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'household_member_not_a_live_person_card'
      USING HINT = 'Every household member must be a live PERSON card in this '
                   'studio''s own rolodex: ' || v_bad::text || ' is not.';
  END IF;

  IF NEW.primary_member_person_id IS NOT NULL
     AND NOT (NEW.primary_member_person_id = ANY (NEW.member_person_ids)) THEN
    RAISE EXCEPTION 'household_primary_not_a_member'
      USING HINT = 'primary_member_person_id must be one of '
                   'member_person_ids.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_household_members()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_client_household_members() IS
  'BEFORE INSERT/UPDATE on client_households: every member_person_ids entry '
  'is a live, unmerged PERSON card in the household''s own studio rolodex, '
  'and the primary member is one of them. An array cannot carry a foreign '
  'key (00632).';

DROP TRIGGER IF EXISTS assert_client_household_members_trg ON public.client_households;
CREATE TRIGGER assert_client_household_members_trg
  BEFORE INSERT OR UPDATE OF member_person_ids, primary_member_person_id, organization_id
  ON public.client_households
  FOR EACH ROW EXECUTE FUNCTION public.assert_client_household_members();

-- ── PR-n, over a CHANGE and not over a value ──────────────────────────────
-- The UPDATE policy's WITH CHECK reads `co_threshold_cents IS NULL OR
-- is_org_admin_or_owner(...)`, which gates CARRYING a figure, not CHANGING
-- one — so a row leaving with NULL always satisfied it and a plain member
-- could ERASE the household's money figure through PostgREST (migrations
-- review r1 M-4, reproduced locally: raising it was correctly refused,
-- `SET co_threshold_cents = NULL` succeeded). Erasing is a money change: the
-- Call Sheet's household band flips to "No change-order figure is on file for
-- this household." and add_household_member() stops writing the money
-- authority row at all.
--
-- A WITH CHECK cannot see OLD, so the rule lives where OLD is visible. The
-- policy's own leg stays as it is — two gates, the same ruling, and the
-- trigger is the one that cannot be satisfied by writing NULL.
--
-- The internal-caller bypass is 00627:549's: a write with no signed-in caller
-- (a migration, a job, service_role) was never gated by RLS on this table
-- either, so the trigger does not invent a gate the policies do not have.
CREATE OR REPLACE FUNCTION public.assert_household_threshold_principal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.co_threshold_cents IS NOT DISTINCT FROM OLD.co_threshold_cents THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_org_admin_or_owner(NEW.organization_id) THEN
    RAISE EXCEPTION 'household_threshold_forbidden'
      USING HINT = 'Only an owner or an admin of the studio may change — or '
                   'take away — a household''s change-order figure (PR-n).';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_household_threshold_principal()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_household_threshold_principal() IS
  'BEFORE UPDATE OF co_threshold_cents on client_households: PR-n read over a '
  'CHANGE. The UPDATE policy''s WITH CHECK can only see the new row, so '
  'erasing the figure satisfied it; this compares OLD to NEW and refuses any '
  'member who is not an owner or an admin, in either direction. Writes with '
  'no signed-in caller pass, exactly as they pass the table''s RLS (00632).';

DROP TRIGGER IF EXISTS assert_household_threshold_principal_trg ON public.client_households;
CREATE TRIGGER assert_household_threshold_principal_trg
  BEFORE UPDATE OF co_threshold_cents
  ON public.client_households
  FOR EACH ROW EXECUTE FUNCTION public.assert_household_threshold_principal();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_households_studio_select ON public.client_households;
CREATE POLICY client_households_studio_select
  ON public.client_households FOR SELECT
  TO authenticated
  USING (
    public.is_active_studio_member(organization_id)
    AND public.is_studio_comember(designer_id)
  );

DROP POLICY IF EXISTS client_households_studio_insert ON public.client_households;
CREATE POLICY client_households_studio_insert
  ON public.client_households FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND public.is_studio_comember(designer_id)
    -- PR-n: the money figure is the owner's and the admin's to set.
    AND (co_threshold_cents IS NULL
         OR public.is_org_admin_or_owner(organization_id))
  );

DROP POLICY IF EXISTS client_households_studio_update ON public.client_households;
CREATE POLICY client_households_studio_update
  ON public.client_households FOR UPDATE
  TO authenticated
  USING (
    public.is_active_studio_member(organization_id)
    AND public.is_studio_comember(designer_id)
  )
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND public.is_studio_comember(designer_id)
    AND (co_threshold_cents IS NULL
         OR public.is_org_admin_or_owner(organization_id))
  );

DROP POLICY IF EXISTS client_households_studio_delete ON public.client_households;
CREATE POLICY client_households_studio_delete
  ON public.client_households FOR DELETE
  TO authenticated
  USING (
    public.is_active_studio_member(organization_id)
    AND public.is_org_admin_or_owner(organization_id)
  );

REVOKE ALL ON TABLE public.client_households FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_households TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_households TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. designer_clients.household_id — the client record's pointer at it
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.designer_clients
  ADD COLUMN IF NOT EXISTS household_id uuid
    REFERENCES public.client_households(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_designer_clients_household
  ON public.designer_clients(household_id)
  WHERE household_id IS NOT NULL;

COMMENT ON COLUMN public.designer_clients.household_id IS
  'The household this client record belongs to (PR-c, CRM-19). ON DELETE SET '
  'NULL, never CASCADE: losing the household must not vaporise the client '
  'relationship. One designer_clients row plus a household is how F-04 and '
  'F-05 are ONE client of the studio without a second invite (00632).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. add_household_member — the membership, the seat, and the grant
-- ═══════════════════════════════════════════════════════════════════════════
-- PR-c's "both, split by job" as one act. p_role is `client` (F-04, who
-- decides finishes) or `client_rep` (F-05, who signs money) — both already in
-- project_parties' party_kind vocabulary.
--
-- THE GRANT IS WRITTEN ONLY WHEN THE HOUSEHOLD CARRIES A THRESHOLD, and then
-- only for an owner or an admin of the studio the project RECORDS (PR-n, and
-- the same resolver project_party_authority's own policies use —
-- project_party_recorded_studio(), not the caller-relative one). A caller
-- without that standing is REFUSED rather than quietly given a seat with no
-- authority: a silent under-grant is the failure mode 00624's COMMENT names
-- ("a wrong grant silently over- or under-authorises an approval").
CREATE OR REPLACE FUNCTION public.add_household_member(
  p_household_id uuid,
  p_person_id    uuid,
  p_role         text,
  p_project_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_h        public.client_households%ROWTYPE;
  v_card     public.studio_contacts%ROWTYPE;
  v_seat_id  uuid;
  v_recorded uuid;
  v_grant    public.project_party_authority%ROWTYPE;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('client', 'client_rep') THEN
    RAISE EXCEPTION 'household_role_invalid'
      USING HINT = 'A household member acts on a job as `client` or as '
                   '`client_rep` (PR-c).';
  END IF;

  SELECT * INTO v_h FROM public.client_households
   WHERE id = p_household_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_not_found';
  END IF;

  -- SECURITY DEFINER bypasses the table's RLS, so the gate is stated here or
  -- it is not stated at all. Both legs, the same pair the SELECT policy makes.
  IF NOT (public.is_active_studio_member(v_h.organization_id)
          AND public.is_studio_comember(v_h.designer_id)) THEN
    RAISE EXCEPTION 'household_not_found';
  END IF;

  SELECT * INTO v_card FROM public.studio_contacts WHERE id = p_person_id;
  IF NOT FOUND
     OR v_card.organization_id IS DISTINCT FROM v_h.organization_id
     OR v_card.entity_kind <> 'person'
     OR v_card.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'household_member_not_a_live_person_card'
      USING HINT = 'A household member is a live PERSON card in this '
                   'studio''s own rolodex.';
  END IF;

  -- ── the membership ──────────────────────────────────────────────────────
  IF NOT (p_person_id = ANY (v_h.member_person_ids)) THEN
    UPDATE public.client_households
       SET member_person_ids = member_person_ids || p_person_id,
           primary_member_person_id =
             COALESCE(primary_member_person_id, p_person_id)
     WHERE id = p_household_id;
  END IF;

  IF p_project_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ── the seat ────────────────────────────────────────────────────────────
  SELECT pp.id INTO v_seat_id
    FROM public.project_parties pp
   WHERE pp.project_id = p_project_id
     AND pp.studio_contact_id = p_person_id
     AND pp.party_kind = p_role
   ORDER BY pp.created_at
   LIMIT 1;

  IF v_seat_id IS NULL THEN
    INSERT INTO public.project_parties
      (project_id, party_kind, display_name, email, phone,
       studio_contact_id, created_by)
    VALUES
      (p_project_id, p_role, v_card.full_name, v_card.email, v_card.phone,
       p_person_id, auth.uid())
    RETURNING id INTO v_seat_id;
  END IF;

  -- ── the authority row: the client_rep seat, when the household names a
  --    figure ─────────────────────────────────────────────────────────────
  -- PR-c pairs the figure with the member who ACTS on the money: F-05 Chidi
  -- signs, F-04 Adaeze decides finishes. So the grant rides the `client_rep`
  -- seat and never the plain `client` one — a household threshold written
  -- onto both seats would say both spouses sign money, which is the exact
  -- fact the household exists to split.
  IF v_h.co_threshold_cents IS NOT NULL AND p_role = 'client_rep' THEN
    v_recorded := public.project_party_recorded_studio(v_seat_id);
    IF v_recorded IS NULL THEN
      RAISE EXCEPTION 'household_grant_project_has_no_studio'
        USING HINT = 'This project records no studio, so PR-n''s owner/admin '
                     'narrowing on a money grant cannot be resolved. Give the '
                     'project a studio first (R-BD).';
    END IF;
    IF NOT public.is_org_admin_or_owner(v_recorded) THEN
      RAISE EXCEPTION 'household_grant_forbidden'
        USING HINT = 'Only an owner or an admin of the studio may set a money '
                     'authority (PR-n).';
    END IF;

    -- r9 M-1 — A GRANT THE HOUSEHOLD DID NOT SOURCE IS NOT THE HOUSEHOLD'S
    -- TO REWRITE. The ON CONFLICT arbiter here is the partial unique index
    -- (engagement_id, scope) WHERE effective_to IS NULL — "the seat's OPEN
    -- money grant", whatever wrote it — and this RPC deliberately REUSES an
    -- existing (project_id, studio_contact_id, party_kind) seat two
    -- statements above. So the ordinary act (seat Chidi as `client_rep` from
    -- the agreement, R-J's "Confirm from the agreement"; then add him to the
    -- household) rewrote the agreement's $10,000 in place as the household's
    -- $2,500 and re-stamped its clause, with nothing closed and no record
    -- that the agreement's figure ever stood — the Call Sheet's client-side
    -- row then printing "Signs money to $2,500." over an agreement that says
    -- otherwise, and, run the other way, over-authorising an approval nobody
    -- granted (00624's own COMMENT names exactly that failure, and PR-n puts
    -- it under the principal).
    --
    -- set_household_threshold() already takes the opposite rule on the same
    -- column — it moves only grants WHERE source_clause =
    -- 'client_households.co_threshold_cents', because "a grant the studio
    -- re-sourced by hand is NOT the household's to move" — so the two halves
    -- of one feature disagreed about who owns a seat's money authority.
    -- They agree now: the open row is read first, a foreign clause is left
    -- exactly as the studio wrote it, and only the household's own grant
    -- moves.
    SELECT * INTO v_grant
      FROM public.project_party_authority
     WHERE engagement_id = v_seat_id
       AND scope         = 'money'
       AND effective_to IS NULL
     LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.project_party_authority
        (engagement_id, scope, threshold_cents, source_clause, granted_by)
      VALUES
        (v_seat_id, 'money', v_h.co_threshold_cents,
         'client_households.co_threshold_cents', auth.uid());
    ELSIF v_grant.source_clause = 'client_households.co_threshold_cents' THEN
      UPDATE public.project_party_authority
         SET threshold_cents = v_h.co_threshold_cents,
             granted_by      = COALESCE(auth.uid(), granted_by)
       WHERE id = v_grant.id;
    END IF;
  END IF;

  RETURN v_seat_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_household_member(uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_household_member(uuid, uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.add_household_member(uuid, uuid, text, uuid) IS
  'PR-c in one act: adds a PERSON card to a household''s members and, when a '
  'project is named, opens (or finds) that member''s seat on the job as '
  '`client` or `client_rep`, returning the seat id. When the household '
  'carries co_threshold_cents AND the role is `client_rep`, it also opens '
  'that seat''s `money` authority row — PR-c pairs the figure with the '
  'member who signs (F-05), never with the member who decides finishes '
  '(F-04). A seat already carrying an OPEN money grant the household did not '
  'source (its own clause from the agreement) keeps it untouched, which is '
  'the rule set_household_threshold() makes on the same column (r9 M-1); '
  'only the household''s own grant moves. It refuses the whole act unless '
  'the caller is an owner or '
  'an admin of the studio the PROJECT RECORDS (PR-n, the same resolver '
  'project_party_authority''s policies use). A silent under-grant is the '
  'failure 00624 names, so this raises rather than skipping. Gated on '
  'is_active_studio_member(organization_id) AND '
  'is_studio_comember(designer_id) in the body, because SECURITY DEFINER '
  'bypasses the table''s RLS. Returns NULL when no project is named: the '
  'membership alone was the act (00632).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. set_household_threshold — the figure, AND the seats it already authorised
-- ═══════════════════════════════════════════════════════════════════════════
-- r5 M-1. add_household_member() writes the seat's open `money` row from
-- co_threshold_cents and stamps `source_clause =
-- 'client_households.co_threshold_cents'` on it. Nothing ever re-wrote it, and
-- the only writer of the figure was a bare PostgREST update
-- (useSetHouseholdThreshold) with no propagation. The band's "Set the figure"
-- act is the room's one door onto it, and the member flow is an ADD, so a
-- household whose member is already seated had no repair act at all.
--
-- Measured: the grant is written at 250000; the owner raises the household to
-- 500000; the grant still reads 250000. On ONE Call Sheet screen the band then
-- prints "Change orders over $5,000 need a signature from the household."
-- while the client_rep's seat line prints "Signs money to $2,500." off
-- project_party_authority — and that seat's source_clause names the household
-- as the source of a figure the household no longer holds. It is the exact
-- harm household-band.tsx's own banner already names ("two simultaneously-
-- rendered, directly contradictory facts about the same household on one
-- screen, with no act between them"), landing on the one fact PR-c and PR-n
-- put under the principal.
--
-- So the figure is written through here, and the seats it sourced move with
-- it. WHICH SEATS: every open `money` row whose source_clause still names the
-- household, on a `client_rep` seat held by one of this household's members.
-- A grant the studio re-sourced by hand (its own clause from the agreement)
-- is NOT the household's to move, and the plain `client` seat never carried
-- the figure in the first place (PR-c splits the spouses on exactly this).
--
-- PR-n TWICE, and refusing rather than skipping both times: once on the
-- household's own org for the figure (the same narrowing
-- client_households_studio_update's WITH CHECK and
-- assert_household_threshold_principal() make), and once per seat on the
-- studio the PROJECT RECORDS, which is the resolver
-- project_party_authority's own policies use. A silent under- or over-grant
-- is the failure 00624's COMMENT names, so a caller who may move the figure
-- but not one of its grants gets the whole act refused.
--
-- ERASING THE FIGURE CLOSES THOSE GRANTS. NULL co_threshold_cents means the
-- household names no figure; a money grant with a NULL threshold_cents reads
-- "Signs money." with no cap (00624), so mirroring the NULL onto the seat
-- would WIDEN unlimited signing authority out of an act that took a limit
-- away. Leaving 250000 standing is the drift this fix exists to close. The
-- third option is 00624's own shape for ending a delegation — "Delegations
-- end (CS5-24). A delegation during travel is a row, not an edit" — so the
-- row is closed with effective_to, the record of it stays, and PR-n's
-- "the principal's to set, and the principal's to take away" is what the
-- studio was already told.
CREATE OR REPLACE FUNCTION public.set_household_threshold(
  p_household_id    uuid,
  p_threshold_cents integer
)
RETURNS public.client_households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_h        public.client_households%ROWTYPE;
  v_seat     record;
  v_recorded uuid;
BEGIN
  SELECT * INTO v_h FROM public.client_households
   WHERE id = p_household_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_not_found';
  END IF;

  -- SECURITY DEFINER bypasses the table's RLS, so both legs of the SELECT
  -- policy are stated here or they are not stated at all.
  IF NOT (public.is_active_studio_member(v_h.organization_id)
          AND public.is_studio_comember(v_h.designer_id)) THEN
    RAISE EXCEPTION 'household_not_found';
  END IF;

  IF NOT public.is_org_admin_or_owner(v_h.organization_id) THEN
    RAISE EXCEPTION 'household_threshold_forbidden'
      USING HINT = 'A change-order figure is the principal''s to set, and '
                   'the principal''s to take away (PR-n).';
  END IF;

  -- Every open money grant this household is the stated source of. Read
  -- BEFORE the figure moves, so the predicate is about the seats the OLD
  -- figure authorised.
  FOR v_seat IN
    SELECT pa.id AS authority_id, pp.id AS seat_id
      FROM public.project_parties pp
      JOIN public.project_party_authority pa
        ON pa.engagement_id = pp.id
       AND pa.scope         = 'money'
       AND pa.effective_to IS NULL
     WHERE pp.party_kind        = 'client_rep'
       AND pp.studio_contact_id = ANY (v_h.member_person_ids)
       AND pa.source_clause     = 'client_households.co_threshold_cents'
     ORDER BY pp.id
  LOOP
    v_recorded := public.project_party_recorded_studio(v_seat.seat_id);
    IF v_recorded IS NULL THEN
      RAISE EXCEPTION 'household_grant_project_has_no_studio'
        USING HINT = 'One of this household''s seats is on a job that records '
                     'no studio, so PR-n''s owner/admin narrowing on its money '
                     'grant cannot be resolved. Give that job a studio first '
                     '(R-BD).';
    END IF;
    IF NOT public.is_org_admin_or_owner(v_recorded) THEN
      RAISE EXCEPTION 'household_grant_forbidden'
        USING HINT = 'Only an owner or an admin of the studio may move a '
                     'money authority (PR-n).';
    END IF;

    IF p_threshold_cents IS NULL THEN
      UPDATE public.project_party_authority
         SET effective_to = GREATEST(effective_from, CURRENT_DATE)
       WHERE id = v_seat.authority_id;
    ELSE
      UPDATE public.project_party_authority
         SET threshold_cents = p_threshold_cents,
             granted_by      = COALESCE(auth.uid(), granted_by)
       WHERE id = v_seat.authority_id;
    END IF;
  END LOOP;

  UPDATE public.client_households
     SET co_threshold_cents = p_threshold_cents
   WHERE id = p_household_id
  RETURNING * INTO v_h;

  RETURN v_h;
END;
$$;

REVOKE ALL ON FUNCTION public.set_household_threshold(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_household_threshold(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.set_household_threshold(uuid, integer) IS
  'Writes client_households.co_threshold_cents AND moves every open `money` '
  'grant the household is the stated source of — the `client_rep` seats of '
  'its own members carrying source_clause = '
  '''client_households.co_threshold_cents'' (r5 M-1). Without it the figure '
  'and the seats it had already authorised drifted apart, and one Call Sheet '
  'screen printed "Change orders over $5,000 need a signature from the '
  'household." beside "Signs money to $2,500." with no act between them. A '
  'grant the studio re-sourced by hand is left alone; the plain `client` '
  'seat never carried the figure (PR-c). Gated on is_active_studio_member() '
  'AND is_studio_comember() for the household and is_org_admin_or_owner() '
  'for the figure (PR-n), then again per seat on the studio the PROJECT '
  'records — refusing the whole act rather than half-moving the grants. '
  'Erasing the figure CLOSES those grants with effective_to (00624''s own '
  'shape for ending a delegation): a NULL threshold on a money grant reads '
  '"Signs money." with no cap, so mirroring the NULL would widen authority '
  'out of an act that took a limit away. Returns the household row (00632).';
