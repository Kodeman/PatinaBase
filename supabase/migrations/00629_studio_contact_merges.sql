-- ═══════════════════════════════════════════════════════════════════════════
-- 00629 — People room CRM · W3/P2 (2 of 6): the merge record, and the two
--         standing doors on a rolodex card (archive, restore)
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) §7 (P2 row
-- `studio_contact_merges`), §8 (P2: "duplicates converge"), §3.1's duplicate
-- band, crm-model §4 (identity and dedupe rules), PR-o and R-Y.
--
-- PR-o, ruled: "On merge, may the studio flip which card survives — Yes,
-- always the studio's call. The older card is pre-picked, BOTH IDS STAY
-- RESOLVABLE." So a merge is not a delete and not a rename. It is:
--
--   1. a repointing of everything the merged card carries onto the survivor,
--   2. a durable pointer (studio_contacts.merged_into) that keeps the old id
--      resolvable forever,
--   3. an append-only record of who merged what, on what evidence, and when.
--
-- LINEAGE: 00417 (studio_contacts, archived_at and its owner/admin-only
-- archive leg) → 00418 (the legacy fold that created most duplicates) → 00592
-- (affiliations, rules, designations) → 00593 (typed channels,
-- assert_studio_contact_identity_stable) → 00594 (studio_channel_consent,
-- keyed on the channel VALUE) → 00623 (compliance documents) → 00624 (the
-- seat's card pointers) → 00626 (people_directory v4, one row per identity) →
-- 00629.
--
-- ── WHAT CONSENT DOES, AND DOES NOT, DO HERE ──────────────────────────────
-- Nothing. studio_channel_consent is keyed on (organization_id, channel_kind,
-- channel_value) — never on a card id — so a number's consent follows the
-- number through a merge with no write at all (crm-model §4: "Consent per
-- channel value is untouched"; R-AY: the record is the only gate). This RPC
-- therefore touches no consent table and no frozen project_parties column, and
-- the union of channels below cannot change a single verdict.
--
-- ── THE ONE MERGE THE MODEL FORBIDS ───────────────────────────────────────
-- crm-model §4: "Never merge a firm card into a person card, EXCEPT when the
-- person is declared sole proprietor, which sets is_sole_proprietor and keeps
-- both ids." So a cross-kind merge is allowed in exactly one direction and on
-- exactly one condition: merged is a COMPANY, survivor is a PERSON, and the
-- survivor already carries is_sole_proprietor. Every other cross-kind pair is
-- refused (merge_kind_mismatch). In that one permitted case the firm IS the
-- person, so the firm's affiliations are dropped rather than repointed — an
-- affiliation of a person AT THEMSELVES is what
-- studio_person_affiliations_distinct_cards_check already refuses — and the
-- documents and channels it held move across with their holder/owner kind
-- rewritten to `person`, because assert_compliance_holder() and
-- assert_channel_owner_kind() each hold that word to the card's own
-- entity_kind.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. studio_contacts.merged_into — the pointer that keeps the old id alive
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.studio_contacts
  ADD COLUMN IF NOT EXISTS merged_into uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL;

-- A card is never its own survivor.
ALTER TABLE public.studio_contacts
  DROP CONSTRAINT IF EXISTS studio_contacts_merged_into_self_check;
ALTER TABLE public.studio_contacts
  ADD CONSTRAINT studio_contacts_merged_into_self_check
  CHECK (merged_into IS NULL OR merged_into <> id);

COMMENT ON COLUMN public.studio_contacts.merged_into IS
  'The SURVIVING card this one was merged into (PR-o). NULL on every live '
  'card. Set once by merge_studio_contacts() and never cleared: the merged '
  'card is not deleted and not archived, so both ids stay resolvable — '
  'resolve_merged_contact() maps an old id forward and studio_contact_merges '
  'holds the act. people_directory (00629) emits no identity row for a card '
  'that carries it, because the room''s unit is the identity and the '
  'survivor''s row is now the whole human. ON DELETE SET NULL, never CASCADE: '
  'losing the survivor must not vaporise the history (the 00212 posture).';

CREATE INDEX IF NOT EXISTS idx_studio_contacts_merged_into
  ON public.studio_contacts(merged_into)
  WHERE merged_into IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. studio_contact_merges — append-only, one row per merge
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_contact_merges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  survivor_id     uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,
  merged_id       uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,

  -- crm-model §4's precedence, named by the studio at the act: profile (rule 1,
  -- proof), phone (rule 2), email (rule 3), company_name (rule 4, "company plus
  -- name", weak — a member confirms), manual (the member's own act, which is
  -- what PR-o makes the final word in every case).
  matched_on      text NOT NULL,

  merged_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  merged_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT studio_contact_merges_distinct_check CHECK (survivor_id <> merged_id)
);

-- Stated as a named constraint so a rerun over an existing table really does
-- widen it (the 00592/00593/00623 idiom).
ALTER TABLE public.studio_contact_merges
  DROP CONSTRAINT IF EXISTS studio_contact_merges_matched_on_check;
ALTER TABLE public.studio_contact_merges
  ADD CONSTRAINT studio_contact_merges_matched_on_check CHECK (
    matched_on IN ('profile', 'phone', 'email', 'company_name', 'manual')
  );

COMMENT ON TABLE public.studio_contact_merges IS
  'APPEND-ONLY lineage: one row per merge of two rolodex cards (direction §7, '
  'P2). No UPDATE and no DELETE policy and no UPDATE/DELETE grant — a merge '
  'that happened is a fact, and PR-o''s "both ids stay resolvable" is this '
  'table plus studio_contacts.merged_into. A LATER merge of the survivor '
  'writes its own row; the earlier row is never rewritten, and '
  'resolve_merged_contact() walks the chain (00629).';

COMMENT ON COLUMN public.studio_contact_merges.matched_on IS
  'Which of crm-model §4''s rules the studio named at the act: profile (1, '
  'proof) | phone (2) | email (3) | company_name (4, weak — a member confirms) '
  '| manual (the member''s own act). Recorded, never re-derived: PR-o makes '
  'the studio''s call final, so this is the reason given and not a verdict '
  'the room recomputes later.';

CREATE INDEX IF NOT EXISTS idx_studio_contact_merges_survivor
  ON public.studio_contact_merges(survivor_id, merged_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_contact_merges_merged
  ON public.studio_contact_merges(merged_id);
CREATE INDEX IF NOT EXISTS idx_studio_contact_merges_org
  ON public.studio_contact_merges(organization_id, merged_at DESC);

-- ── RLS: the rolodex's own gate, and only SELECT + INSERT ─────────────────
ALTER TABLE public.studio_contact_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_contact_merges_member_select ON public.studio_contact_merges;
CREATE POLICY studio_contact_merges_member_select
  ON public.studio_contact_merges FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

-- INSERT is here for completeness of the member's own act through PostgREST;
-- merge_studio_contacts() is SECURITY DEFINER and does not depend on it. There
-- is deliberately NO UPDATE and NO DELETE policy.
DROP POLICY IF EXISTS studio_contact_merges_member_insert ON public.studio_contact_merges;
CREATE POLICY studio_contact_merges_member_insert
  ON public.studio_contact_merges FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND EXISTS (SELECT 1 FROM public.studio_contacts sc
                 WHERE sc.id = survivor_id AND sc.organization_id = organization_id)
    AND EXISTS (SELECT 1 FROM public.studio_contacts sc
                 WHERE sc.id = merged_id   AND sc.organization_id = organization_id)
  );

REVOKE ALL ON TABLE public.studio_contact_merges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.studio_contact_merges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_contact_merges TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. resolve_merged_contact — an old id, mapped forward
-- ═══════════════════════════════════════════════════════════════════════════
-- PR-o's "both ids stay resolvable" in one function. merge_studio_contacts()
-- FLATTENS the chain on every merge (every card already pointing at the merged
-- one is repointed at the survivor), so this walk normally terminates on the
-- first hop; the recursion and its depth cap exist for rows written before the
-- flattening, and for the pathological case of a hand-edited pointer.
--
-- SECURITY INVOKER: studio_contacts' own member-only SELECT policy is the
-- whole access rule, so a caller outside the owning studio resolves NULL
-- rather than another tenant's card id — compliance_state()'s posture (00623).
CREATE OR REPLACE FUNCTION public.resolve_merged_contact(p_contact_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE hop(id, next, depth) AS (
    SELECT sc.id, sc.merged_into, 0
      FROM public.studio_contacts sc
     WHERE sc.id = p_contact_id
    UNION ALL
    SELECT s.id, s.merged_into, h.depth + 1
      FROM hop h
      JOIN public.studio_contacts s ON s.id = h.next
     WHERE h.next IS NOT NULL
       AND h.depth < 16
  )
  SELECT h.id FROM hop h WHERE h.next IS NULL ORDER BY h.depth DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_merged_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_merged_contact(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_merged_contact(uuid) IS
  'The card an id resolves to TODAY: itself while it is live, else the '
  'survivor it was merged into, following the chain to its head (PR-o, "both '
  'ids stay resolvable"). NULL when the id names no card the caller may read '
  '— SECURITY INVOKER, so studio_contacts'' member-only SELECT policy is the '
  'access rule and no caller resolves another tenant''s card. Depth-capped at '
  '16; merge_studio_contacts() flattens the chain on every merge, so the '
  'ordinary answer is one hop (00629).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A seat may not be stamped with a card that was merged away
-- ═══════════════════════════════════════════════════════════════════════════
-- people_directory groups a human by party_identity_key(), whose FIRST leg is
-- studio_contact_id, and §6 below stops a merged card emitting its own
-- identity row. Those two together mean a seat stamped with a MERGED id
-- belongs to no Directory row at all: the CONTACTS branch no longer emits the
-- merged card, and the party branch is `studio_contact_id IS NULL`. The human
-- would vanish from the room.
--
-- merge_studio_contacts() repoints every seat it finds, so the only way to
-- reach that state is a later write carrying a stale id — which is exactly
-- what a portal holding a cached picker list does. A separate BEFORE trigger
-- rather than a graft of assert_project_party_cards() (00624): that function
-- is 176 lines of tenancy reasoning this rule has nothing to do with, and two
-- triggers on one event fire in name order with no interaction.
CREATE OR REPLACE FUNCTION public.assert_party_card_not_merged()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_survivor uuid;
BEGIN
  IF NEW.studio_contact_id IS NOT NULL THEN
    SELECT sc.merged_into INTO v_survivor
      FROM public.studio_contacts sc WHERE sc.id = NEW.studio_contact_id;
    IF v_survivor IS NOT NULL THEN
      RAISE EXCEPTION 'party_card_merged_away'
        USING HINT = 'This rolodex card was merged into ' || v_survivor::text
                     || '. Stamp the seat with the surviving card.';
    END IF;
  END IF;

  IF NEW.company_id IS NOT NULL THEN
    SELECT sc.merged_into INTO v_survivor
      FROM public.studio_contacts sc WHERE sc.id = NEW.company_id;
    IF v_survivor IS NOT NULL THEN
      RAISE EXCEPTION 'party_company_merged_away'
        USING HINT = 'This firm card was merged into ' || v_survivor::text
                     || '. Point the seat at the surviving card.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_party_card_not_merged()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_party_card_not_merged() IS
  'BEFORE INSERT/UPDATE on project_parties: refuses a studio_contact_id or a '
  'company_id naming a card that was merged away. A merged card emits no '
  'people_directory row (00629 §6) and the party branch only carries '
  'unstamped seats, so a seat pointing at one would belong to no identity row '
  'at all. merge_studio_contacts() repoints every seat it finds; this catches '
  'the later write that carries a stale id (00629).';

DROP TRIGGER IF EXISTS assert_party_card_not_merged_trg ON public.project_parties;
CREATE TRIGGER assert_party_card_not_merged_trg
  BEFORE INSERT OR UPDATE OF studio_contact_id, company_id
  ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.assert_party_card_not_merged();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. merge_studio_contacts — one transaction, one act
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.merge_studio_contacts(
  p_survivor   uuid,
  p_merged     uuid,
  p_matched_on text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_survivor public.studio_contacts%ROWTYPE;
  v_merged   public.studio_contacts%ROWTYPE;
  v_first    uuid;
  v_second   uuid;
  v_cross    boolean := false;
  v_merge_id uuid;
BEGIN
  IF p_survivor IS NULL OR p_merged IS NULL THEN
    RAISE EXCEPTION 'merge_contact_not_found'
      USING HINT = 'Both the surviving and the merged card must be named.';
  END IF;
  IF p_survivor = p_merged THEN
    RAISE EXCEPTION 'merge_same_card'
      USING HINT = 'A card cannot be merged into itself.';
  END IF;
  IF p_matched_on IS NULL
     OR p_matched_on NOT IN ('profile', 'phone', 'email', 'company_name', 'manual') THEN
    RAISE EXCEPTION 'merge_matched_on_invalid'
      USING HINT = 'matched_on is one of profile, phone, email, company_name, '
                   'manual (crm-model §4).';
  END IF;

  -- Lock both cards in id order, so two members merging the same pair from
  -- opposite directions cannot deadlock.
  v_first  := least(p_survivor, p_merged);
  v_second := greatest(p_survivor, p_merged);
  PERFORM 1 FROM public.studio_contacts WHERE id = v_first  FOR UPDATE;
  PERFORM 1 FROM public.studio_contacts WHERE id = v_second FOR UPDATE;

  SELECT * INTO v_survivor FROM public.studio_contacts WHERE id = p_survivor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contact_not_found'
      USING HINT = 'The surviving card does not exist.';
  END IF;
  SELECT * INTO v_merged FROM public.studio_contacts WHERE id = p_merged;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contact_not_found'
      USING HINT = 'The merged card does not exist.';
  END IF;

  IF v_survivor.organization_id IS DISTINCT FROM v_merged.organization_id THEN
    RAISE EXCEPTION 'merge_other_studio'
      USING HINT = 'Two cards merge only inside one studio''s rolodex (PD-1).';
  END IF;

  -- THE GATE. SECURITY DEFINER bypasses studio_contacts'' RLS, so the member
  -- test is stated here or it is not stated at all.
  IF NOT public.is_active_studio_member(v_survivor.organization_id) THEN
    RAISE EXCEPTION 'merge_not_a_member'
      USING HINT = 'Only an active member of the studio may merge its cards.';
  END IF;

  IF v_merged.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'merge_already_merged'
      USING HINT = 'That card was already merged into '
                   || v_merged.merged_into::text || '.';
  END IF;
  IF v_survivor.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'merge_survivor_already_merged'
      USING HINT = 'The surviving card was itself merged into '
                   || v_survivor.merged_into::text
                   || '. Merge into that card instead.';
  END IF;

  -- crm-model §4's one exception, and nothing else.
  IF v_survivor.entity_kind IS DISTINCT FROM v_merged.entity_kind THEN
    IF v_merged.entity_kind = 'company'
       AND v_survivor.entity_kind = 'person'
       AND v_survivor.is_sole_proprietor THEN
      v_cross := true;
    ELSE
      RAISE EXCEPTION 'merge_kind_mismatch'
        USING HINT = 'A firm card merges into a person card only when that '
                     'person is declared a sole proprietor, and a person '
                     'never merges into a firm (crm-model §4).';
    END IF;
  END IF;

  -- ── channels: union, exact duplicates by kind + value dropped ───────────
  DELETE FROM public.studio_contact_channels m
   WHERE m.owner_id = p_merged
     AND EXISTS (
       SELECT 1 FROM public.studio_contact_channels s
        WHERE s.owner_id     = p_survivor
          AND s.channel_kind = m.channel_kind
          AND s.value        = m.value);

  UPDATE public.studio_contact_channels
     SET owner_id   = p_survivor,
         owner_type = v_survivor.entity_kind
   WHERE owner_id = p_merged;

  -- ── affiliations ────────────────────────────────────────────────────────
  IF v_cross THEN
    -- The firm IS the person now. An affiliation of a person at themselves is
    -- what studio_person_affiliations_distinct_cards_check refuses, and a
    -- person card can never be a company_id, so these rows are dropped rather
    -- than repointed. sync_studio_contact_company_pointer() recomputes every
    -- affected person's legacy company_id pointer as they go.
    DELETE FROM public.studio_person_affiliations WHERE company_id = p_merged;
    UPDATE public.studio_contacts SET company_id = NULL WHERE company_id = p_merged;
  ELSIF v_survivor.entity_kind = 'person' THEN
    DELETE FROM public.studio_person_affiliations a
     WHERE a.person_id = p_merged
       AND a.to_date IS NULL
       AND EXISTS (SELECT 1 FROM public.studio_person_affiliations s
                    WHERE s.person_id  = p_survivor
                      AND s.company_id = a.company_id
                      AND s.to_date IS NULL);
    UPDATE public.studio_person_affiliations
       SET person_id = p_survivor WHERE person_id = p_merged;
  ELSE
    DELETE FROM public.studio_person_affiliations a
     WHERE a.company_id = p_merged
       AND a.to_date IS NULL
       AND EXISTS (SELECT 1 FROM public.studio_person_affiliations s
                    WHERE s.company_id = p_survivor
                      AND s.person_id  = a.person_id
                      AND s.to_date IS NULL);
    UPDATE public.studio_person_affiliations
       SET company_id = p_survivor WHERE company_id = p_merged;
    -- Belt and braces: the affiliation writes above already moved every
    -- derived pointer through sync_studio_contact_company_pointer(). A card
    -- still naming the merged firm here carried a pointer with no affiliation
    -- behind it, which 00592's reverse binding then repairs.
    UPDATE public.studio_contacts SET company_id = p_survivor WHERE company_id = p_merged;
  END IF;

  -- ── contact rules: the survivor's wins; the merged's is kept as history
  --    on the merged card unless the survivor has none ─────────────────────
  UPDATE public.studio_contact_rules r
     SET subject_id   = p_survivor,
         subject_type = v_survivor.entity_kind
   WHERE r.subject_type = v_merged.entity_kind
     AND r.subject_id   = p_merged
     AND NOT EXISTS (SELECT 1 FROM public.studio_contact_rules s
                      WHERE s.subject_type = v_survivor.entity_kind
                        AND s.subject_id   = p_survivor);

  -- A rule that ROUTES to the merged card now routes to the survivor. Only a
  -- person card may be a route target (assert_studio_contact_rule_route), so
  -- this can only arise where both cards are people.
  IF v_survivor.entity_kind = 'person' THEN
    UPDATE public.studio_contact_rules
       SET route_to_person_id = p_survivor WHERE route_to_person_id = p_merged;
  END IF;

  -- ── compliance documents ────────────────────────────────────────────────
  UPDATE public.studio_compliance_documents
     SET holder_id   = p_survivor,
         holder_type = v_survivor.entity_kind
   WHERE holder_id = p_merged;

  -- ── the three designations other cards hold ─────────────────────────────
  -- Not in the brief's repoint list, and not optional: a firm card naming the
  -- merged person as its paperwork contact, signer or site contact would
  -- print a name the Directory no longer carries a row for. Only a person
  -- card may hold a designation (assert_studio_contact_designations).
  IF v_survivor.entity_kind = 'person' THEN
    UPDATE public.studio_contacts
       SET paperwork_contact_person_id = p_survivor
     WHERE paperwork_contact_person_id = p_merged;
    UPDATE public.studio_contacts
       SET signer_person_id = p_survivor WHERE signer_person_id = p_merged;
    UPDATE public.studio_contacts
       SET site_contact_person_id = p_survivor WHERE site_contact_person_id = p_merged;
  END IF;

  -- ── seats ───────────────────────────────────────────────────────────────
  -- The identity key itself (party_identity_key()'s first leg).
  UPDATE public.project_parties
     SET studio_contact_id = p_survivor WHERE studio_contact_id = p_merged;

  IF v_cross THEN
    -- No person card may be a seat's company_id (00624's
    -- party_company_not_a_company). The firm is the person, and the seat's
    -- own studio_contact_id now says so.
    UPDATE public.project_parties SET company_id = NULL WHERE company_id = p_merged;
    UPDATE public.project_parties
       SET warranty_contact_person_id = p_survivor
     WHERE warranty_contact_person_id = p_merged;
  ELSIF v_survivor.entity_kind = 'company' THEN
    UPDATE public.project_parties SET company_id = p_survivor WHERE company_id = p_merged;
  ELSE
    UPDATE public.project_parties
       SET warranty_contact_person_id = p_survivor
     WHERE warranty_contact_person_id = p_merged;
  END IF;

  -- ── the pointer, and the chain flattened ────────────────────────────────
  UPDATE public.studio_contacts SET merged_into = p_survivor WHERE id = p_merged;
  UPDATE public.studio_contacts
     SET merged_into = p_survivor
   WHERE merged_into = p_merged AND id <> p_survivor;

  -- ── the record ──────────────────────────────────────────────────────────
  INSERT INTO public.studio_contact_merges
    (organization_id, survivor_id, merged_id, matched_on, merged_by)
  VALUES
    (v_survivor.organization_id, p_survivor, p_merged, p_matched_on, auth.uid())
  RETURNING id INTO v_merge_id;

  RETURN p_survivor;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_studio_contacts(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_studio_contacts(uuid, uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_studio_contacts(uuid, uuid, text) IS
  'Merges one rolodex card into another in ONE transaction and returns the '
  'survivor''s id (direction §7 P2, §3.1''s duplicate band, PR-o). Gated on '
  'is_active_studio_member() of the cards'' shared studio — SECURITY DEFINER '
  'bypasses the table''s RLS, so the member test is stated in the body. '
  'Repoints, in order: typed channels (union, exact duplicates by '
  'channel_kind + value dropped), affiliations, contact rules (the '
  'survivor''s wins; the merged card keeps its own as history unless the '
  'survivor has none), the route_to pointer, compliance documents, the three '
  'designations other cards hold, and every seat''s studio_contact_id / '
  'company_id / warranty_contact_person_id. CONSENT IS UNTOUCHED: '
  'studio_channel_consent is keyed on (organization_id, channel_kind, '
  'channel_value) and never on a card, so a number''s verdict follows the '
  'number with no write (crm-model §4, R-AY). Refuses a firm into a person '
  'unless the person is_sole_proprietor, and a person into a firm always '
  '(merge_kind_mismatch). Neither card is deleted or archived: the merged one '
  'takes merged_into and stays resolvable through resolve_merged_contact() '
  '(00629).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. people_directory v5 — the same view, with merged cards folded away
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00626:1388-1909 verbatim, with ONE line added to the CONTACTS
-- branch's WHERE. Every branch, every predicate, every appended column and the
-- column order are 00626's byte for byte — CREATE OR REPLACE VIEW cannot
-- reorder or retype a column, and nothing here means to.
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── identity_seats — every identity's seat count, computed ONCE ───────────
-- w1b final review r11 MAJOR-2. This was identity_seat_count(), called once
-- per emitted row on the CONTACTS branch and once more on the PARTY branch.
-- The function is LANGUAGE sql STABLE with a SET clause, so the planner
-- cannot inline it; each call is its own RLS-filtered sequential scan of
-- project_parties (the expression index cannot be used, because
-- project_parties' RLS filter is not leakproof and is applied in the same
-- scan) — 21 ms per call at 631 seats, measured. Cost was rows × seats, and
-- `SELECT * FROM people_directory`, which is exactly what
-- usePeopleDirectory issues with no limit, passed `authenticated`'s own
-- statement_timeout=8s at 649 cards / 631 seats: the room's one feed
-- returned nothing at all.
--
-- The CTE is identity_seat_count()'s body, grouped: the same tenant leg with
-- the same r11 MAJOR-1 designer-of-record disjunction, the same three
-- co-member legs, the same party_identity_key(). MATERIALIZED so it is
-- evaluated ONCE for the whole view rather than once per branch — both
-- branches reference it, and a filtered read (usePerson filters person_id
-- ABOVE the view) then pays one scan instead of one per row.
--
-- EVERY party kind and no kind filter, because that is what
-- people_directory_seats nests (§4) — R-BG: a row claims exactly what it can
-- nest, so this predicate, identity_seat_count()'s and the seats view's are
-- one predicate written three times, and any change to one is a change to
-- all three.
WITH identity_seats AS MATERIALIZED (
  SELECT
    public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                              pp.phone_e164, pp.email, pp.id) AS identity_key,
    count(*)::integer                                         AS seat_count
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE ( public.is_active_studio_member(public.project_tenant_org(pp.project_id))
       OR pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid()) )
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  GROUP BY 1
)

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- Carried verbatim from 00594:1217-1252, plus the five appended columns.
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  COALESCE(NULLIF(btrim(pr.phone), ''), NULLIF(btrim(dc.client_phone), '')) AS phone,
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
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope,
  -- ── appended by 00626 ──
  public.reach_state_for(dc.client_id, NULL, NULL)               AS reach_state,
  NULL::text                                                     AS consent_status,
  NULL::text                                                     AS paper_state,
  NULL::text                                                     AS contact_rule_summary,
-- seat_count is 0, not identity_seat_count(<a profile id>). person_id on this
-- branch is a designer_clients id, while people_directory_seats.person_id is
-- only ever a rolodex card id or a project_parties id (its COALESCE at §4), so
-- NOTHING can
-- nest under this row by construction — the count claimed N seats and unfolded
-- to none, and the seats themselves hung under a person_id the Directory never
-- returns. One ordinary INSERT reached it: PR-c's own client_rep seat stamped
-- with the household member's LOGIN (w1b final review r3 MAJOR-1 in the
-- migrations review, r2's MINOR-24 promoted). 0 is what this row can nest, so
-- 0 is what it claims.
--
-- Keying the seats view at these rows instead (the other option) would move
-- the same defect rather than close it: an uncarded, profile-stamped seat of
-- one of the Directory's seven kinds ALSO gets a party-branch row keyed on
-- that same login, whose person_id is the winning seat's id, so the party row
-- would then claim N and nest 0 — and one login holding both a
-- designer_clients row and an open lead has no single right answer. PR-c's
-- "read the seats under the household member's card" is served today by
-- STAMPING the seat with that person's rolodex card (studio_contact_id), which
-- is what the dev seed does for Chidi Okonkwo and what puts the identity on
-- the contacts branch; the household OBJECT is P2.
  0::integer                                                     AS seat_count
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Carried verbatim from 00594:1258-1284.
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  COALESCE(NULLIF(btrim(hp.phone), ''), NULLIF(btrim(l.contact_phone), '')),
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
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(l.homeowner_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
-- seat_count is 0 for the same reason as the client branch above: person_id
-- here is a leads id, which people_directory_seats.person_id can never be, so this row can nest nothing (r3 MAJOR-1, migrations review).
  0::integer
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- Carried verbatim from 00594:1290-1333.
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
   END)::text,
  public.reach_state_for(v.contact_profile_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
-- seat_count is 0 for the same reason as the client branch above: person_id
-- here is a vendors id, which people_directory_seats.person_id can never be,
-- so this row can nest nothing (r3 MAJOR-1, migrations review).
  0::integer
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

-- ── SEATED PEOPLE WITH NO ROLODEX CARD (v4: one row per IDENTITY) ─────────
-- Was: one row per party per project (00594:1339-1383, unchanged since 00420).
-- Now: parties carrying a lineage stamp are NOT here at all — the CONTACTS
-- branch below emits their identity row — and the rest collapse on
-- party_identity_key(), most-recently-updated seat winning. The kind filter,
-- the three-way co-member predicate, every carried column and the two consent
-- reads are 00594's, byte for byte. project_id stays the winner's project so
-- every shipped reader that opens a person from a Directory row still lands
-- on a real seat; seat_count is what says how many there are.
--
-- The two consent DATES now come off studio_channel_consent (00594 §5.3's
-- debt to W1b) — off the record whose verdict DECIDED the printed word,
-- through identity_consent_evidence(), resolved at the org the ONE resolver
-- project_consent_org() names. They were joined on the winning SEAT's number
-- while the word was the identity's, which is r4 MAJOR-4. The VERDICT still
-- comes from channel_consent_status(), which folds refusal_unanswered — a rule
-- with one home (R-AY); only the raw dates are read beside it.
SELECT
  q.id,
  q.party_kind,
  q.display_name,
  q.email,
  q.phone,
  q.profile_id,
  q.project_id,
  auth.uid(),
  q.consent_word,
  q.updated_at,
  jsonb_build_object(
    'company_name',       q.company_name,
    'vendor_id',          q.vendor_id,
    'project_name',       q.project_name,
    'party_kind',         q.party_kind,
    'trade',              q.trade,
    'phone_e164',         q.phone_e164,
    'sms_consent_status', q.consent_word,
    'sms_consented_at',   q.record_consented_at,
    'sms_opt_out_at',     q.record_opt_out_at,
    'show_to_client',     q.show_to_client,
    'studio_contact_id',  q.studio_contact_id,
    'identity_key',       q.identity_key,
    'stage',              q.stage,
    'on_site_from',       q.on_site_from,
    'on_site_to',         q.on_site_to,
    'company_id',         q.company_id
  ),
  q.scope,
  -- the IDENTITY's links, not the winning seat's (r2 MAJOR-3)
  public.reach_state_for_identity(q.profile_id, q.identity_key),
  q.consent_word,
  -- the identity's own card AND its firm, worst-first (r4 MAJOR-2). This
  -- branch emits only UNSTAMPED seats, so q.studio_contact_id is NULL by
  -- construction and the firm is the whole answer here; the call shape is the
  -- one the other two sites use, so the paper word has one formula.
  public.identity_paper_state(q.studio_contact_id, q.company_id),
  public.contact_rule_summary('engagement', q.id),
  -- counted once for the whole view by the identity_seats CTE above, not
  -- once per row by identity_seat_count() (r11 MAJOR-2). COALESCE because an
  -- identity with no seat the caller may count has no CTE row; the function
  -- returned 0 for the same case.
  COALESCE(iseat.seat_count, 0)
-- The consent word belongs to the IDENTITY, not to whichever seat won the
-- DISTINCT ON. It used to be computed INSIDE that subquery off the winning
-- seat's own phone_e164, while reach_state three lines above already asked the
-- identity through reach_state_for_identity(): an uncarded identity keyed on a
-- login or an email (party_identity_key()'s 2nd and 4th precedence legs) may
-- hold two seats with two DIFFERENT numbers, and the most recently updated one
-- decided the printed word even when a different number of that same identity
-- is the one the studio's record says opted_out (w1b final review r3 tests
-- MAJOR-1 — the carve-out the r2 fix log named as out of scope).
--
-- identity_consent_status() is r2 MAJOR-2's own reduction, already wired into
-- the contacts branch: worst-first over every number the identity carries,
-- each resolved through channel_consent_status() at ONE studio (R-AK),
-- record-only (R-AY) — the frozen project_parties.sms_consent_* columns are
-- read nowhere here. It sits in the wrapper below, AFTER the DISTINCT ON, so
-- it is evaluated once per emitted identity rather than once per candidate
-- seat, and its card-phone argument is NULL because an uncarded identity has
-- no card: its numbers are exactly its seats'. COALESCE to 'not_asked' keeps
-- 00594's party-branch shape, where status_raw and meta.sms_consent_status
-- have always carried a word rather than NULL; the contacts branch's
-- NULL-means-no-number-anywhere is its own rule (R-V).
-- The two consent DATES belong to the number whose verdict WON that
-- reduction, not to the winning seat's number, which is what the LEFT JOIN
-- inside q0 used to supply while the word above was already the identity's
-- (w1b final review r4 MAJOR-4). identity_consent_evidence() returns the
-- deciding record's own consented_at / opt_out_at, or no row at all when the
-- word came from a number with no record — in which case both dates are NULL
-- and the room prints R-V's "no record" line rather than a date it cannot
-- source. One LATERAL, evaluated once per emitted identity like the word.
FROM (
  SELECT
    q0.*,
    -- COALESCEd to 'not_asked' ONLY for a caller who can read the record
    -- that decides the word. r6 MAJOR-1 restored this branch's visibility on
    -- a project that records no studio, where the RECORD lives at the org
    -- project_consent_org() guesses and the studio doing the work is not a
    -- member of it: measured, an admin of the working studio read `not_asked`
    -- over a record that says `opted_out`, which is r5 MAJOR-1's fail-open
    -- word on a send door, reintroduced by the wider gate. Unknown prints as
    -- NULL — R-V's "no record" line — never as the affirmative word. The send
    -- rail is unaffected: it asks channel_consent_status() itself (R-AY) and
    -- NULL is not `granted`.
    CASE WHEN public.is_active_studio_member(
                public.project_consent_org(q0.project_id))
         THEN COALESCE(public.identity_consent_status(
                public.project_consent_org(q0.project_id),
                q0.identity_key, NULL), 'not_asked')
    END                                       AS consent_word,
    ev.consented_at                           AS record_consented_at,
    ev.opt_out_at                             AS record_opt_out_at
  FROM (
    SELECT DISTINCT ON (
      public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                pp.phone_e164, pp.email, pp.id)
    )
      public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                pp.phone_e164, pp.email, pp.id) AS identity_key,
      pp.id, pp.party_kind, pp.display_name, pp.email, pp.phone, pp.profile_id,
      pp.project_id, pp.updated_at, pp.company_name, pp.vendor_id, pp.trade,
      pp.phone_e164, pp.show_to_client, pp.studio_contact_id, pp.stage,
      pp.on_site_from, pp.on_site_to, pp.company_id,
      pj.name AS project_name,
      (CASE
         WHEN pj.designer_id      = (select auth.uid())
           OR pj.lead_designer_id = (select auth.uid())
           OR pj.created_by       = (select auth.uid())
         THEN 'mine' ELSE 'studio'
       END)::text                               AS scope
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
    WHERE public.party_kind_in_directory(pp.party_kind)
      AND pp.studio_contact_id IS NULL
      -- the seat is visible only to a member of the studio whose CONSENT
      -- RECORD decides its word (w1b final review r5 MAJOR-1/MAJOR-3). The
      -- three co-member legs below are satisfied by sharing ANY active
      -- organization with the designer of record, while the word is resolved
      -- at project_consent_org(project_id) — so a caller who could see the
      -- seat but could not read the record had the unreadable record rendered
      -- as the affirmative word `not_asked`, over a record that says
      -- opted_out, on the row party-profile-sheet.tsx:262/:742 opens the text
      -- composer from.
      --
      -- The GATE resolves through project_tenant_org() (00624 §1), not
      -- project_consent_org(): on a project that records no studio_id the
      -- consent resolver's _primary_studio_for() fallback names a studio
      -- nobody on the job belongs to, and an ADMIN of the studio doing the
      -- work lost the seat rows it used to read — 00594's party branch carried
      -- no tenant leg at all, so that was a REGRESSION on 5 of 8 local
      -- projects (w1b final review r6 MAJOR-1). The consent WORD below still
      -- resolves at project_consent_org(), which must read the same for every
      -- caller; only the visibility gate is caller-relative.
      --
      -- BESIDE THE TENANT, THE JOB'S OWN DESIGNER (r11 MAJOR-1). A designer
      -- who belongs to no organization at all resolves project_tenant_org()
      -- to NULL — studio_id is NULL and there is no membership to rank — and
      -- is_active_studio_member(NULL) is false, so the tenant leg alone
      -- erased every party row of their own job from this branch while
      -- project_parties' RLS and v_project_roster still carried the seat.
      -- 00594's party branch had no tenant leg, so that was a regression, and
      -- people_directory_scope_test.sql case (h3) asserts this population is
      -- unchanged. The three legs name the job's designer of record, lead
      -- designer and creator and nobody else, so no member of any second
      -- studio comes in with them.
      AND ( public.is_active_studio_member(public.project_tenant_org(pp.project_id))
         OR pj.designer_id      = (select auth.uid())
         OR pj.lead_designer_id = (select auth.uid())
         OR pj.created_by       = (select auth.uid()) )
      AND ( public.is_studio_comember(pj.designer_id)
         OR public.is_studio_comember(pj.lead_designer_id)
         OR public.is_studio_comember(pj.created_by) )
    ORDER BY
      public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                pp.phone_e164, pp.email, pp.id),
      pp.updated_at DESC, pp.id
  ) q0
  LEFT JOIN LATERAL public.identity_consent_evidence(
    public.project_consent_org(q0.project_id), q0.identity_key, NULL) ev ON true
) q
LEFT JOIN identity_seats iseat ON iseat.identity_key = q.identity_key

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- Carried verbatim from 00594:1389-1429. Already one row per identity
-- (DISTINCT ON user_id). reach_state is `account` by construction — the
-- branch joins project_team_members, which is logins only (00084:160-172).
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
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(t.user_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
-- seat_count is 0 for the same reason as the client branch above: person_id
-- here is a project_team_members id, which people_directory_seats.person_id
-- can never be, so this row can nest nothing (r3 MAJOR-1, migrations review).
  0::integer
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
-- Carried verbatim from 00594:1435-1458, plus the five appended columns. This
-- is the branch that now carries the identity of every carded human AND every
-- firm: PR-g's mixed list ("29 people, 22 firms") reads both kinds from here,
-- told apart by meta.entity_kind, which 00420 already put in the bag.
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
    -- QA-1 (w2 r5): THE FIRM'S OWN NAME, not the person's legacy free-text
    -- column. `studio_contacts.company_name` on a PERSON row is 00417's
    -- typed-by-hand snapshot, which nothing since the affiliation table
    -- (00592) populates — so every carded human whose firm is a real card
    -- printed a bare kind word ("Subcontractor") where direction §1 line 2
    -- and SPEC §5.1 #8 ask for "Northgate Electric · electrical".
    -- `sc.company_id` is the pointer `sync_studio_contact_company_pointer()`
    -- keeps equal to the open `studio_person_affiliations` row, and the firm's
    -- own card is where its name lives (`company_name` on an entity_kind =
    -- 'company' row, `full_name` never). On a firm's OWN row company_id is
    -- NULL, so the join misses and its own name still answers.
    'company_name',    COALESCE(
                         NULLIF(btrim(sc.company_name), ''),
                         NULLIF(btrim(firm.company_name), ''),
                         NULLIF(btrim(firm.full_name), '')
                       ),
    'company_id',      sc.company_id,
    'specialties',     sc.specialties,
    'vendor_id',       sc.vendor_id,
    'organization_id', sc.organization_id,
    'archived_at',     sc.archived_at
  ),
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text,
  -- the IDENTITY's reach, bounded by the seats this row nests (w1b final
  -- review r15 MAJOR-2). This was reach_state_for(sc.profile_id, sc.id, NULL),
  -- whose EXISTS is a plain field_link_tokens JOIN project_parties on
  -- pp.studio_contact_id alone — no projects join, no tenant leg, none of
  -- R-BG's predicate — while r14 MAJOR-1 gave the identity sibling the seats
  -- view's WHERE verbatim. The asymmetry mattered here more than anywhere: the
  -- contacts branch is where every carded human now lives (49 of the seeded
  -- studio's 62 rows, against the party branch's 1), and a seat stamped with a
  -- card of ANOTHER studio — a shape 00624's R-AP guard refuses on every write
  -- from this wave onward but cannot undo on rows already on the table
  -- (00624:724-739's preflight, unmeasured on Strata) — printed `field_link`
  -- over seat_count 0 and no seat line at all: the room offering a door it
  -- cannot open and suppressing the mint the studio needs. A card's identity
  -- key IS its id (party_identity_key()'s first leg), which is the same key
  -- identity_consent_status() and the identity_seats join already use below,
  -- so this deletes the asymmetry rather than writing R-BG's predicate a fifth
  -- time.
  public.reach_state_for_identity(sc.profile_id, sc.id::text),
  -- every number this identity carries, worst-first — the card's AND its
  -- seats' (r2 MAJOR-2). NULL only when there is no number anywhere.
  public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164),
  -- the card's OWN paper AND its firm's, worst-first (r4 MAJOR-2). It was
  -- COALESCE(company_id, id), which asks the person's own card only when they
  -- have no firm — so a person-held lapse, the reason holder_type='person'
  -- exists, was invisible on everyone who carries one. A firm card passes
  -- itself as the card and its own paper is the answer.
  public.identity_paper_state(sc.id, sc.company_id),
  public.contact_rule_summary(sc.entity_kind, sc.id),
  -- counted once for the whole view by the identity_seats CTE above (r11
  -- MAJOR-2). A card's identity key IS its id — party_identity_key()'s first
  -- precedence leg — so the join key is the card id as text.
  COALESCE(iseat.seat_count, 0)
FROM public.studio_contacts sc
LEFT JOIN identity_seats iseat ON iseat.identity_key = sc.id::text
-- QA-1: the firm card this person's affiliation pointer names, for its NAME
-- only. A left join on a primary key; where RLS hides it the name comes back
-- NULL and the row prints exactly what it printed before.
LEFT JOIN public.studio_contacts firm ON firm.id = sc.company_id
WHERE public.is_active_studio_member(sc.organization_id)
  -- 00629: a card that was MERGED AWAY emits no identity row of its own.
  -- PR-o keeps both ids resolvable — the merged card is never deleted and
  -- resolve_merged_contact() maps the old id forward — but the Directory's
  -- unit is the IDENTITY (v4), and two rows for one human is exactly the
  -- over-count the rebuild removed. Its channels, affiliations, paper and
  -- seats already point at the survivor (merge_studio_contacts()), so the
  -- survivor's row is the whole human.
  AND sc.merged_into IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Archive and restore — the standing door 00417 left unopened
-- ═══════════════════════════════════════════════════════════════════════════
-- direction §8 P2: "archive and restore as a standing door". 00417 shipped the
-- RULE — archived_at is a soft delete; the member UPDATE policy blocks setting
-- it on either side, and a separate owner/admin leg carries the flip in both
-- directions (00417:224-256) — but no named act. A portal therefore had to
-- PATCH archived_at through PostgREST and read the policy's silence as a
-- refusal. These two functions are that rule with a name on it; they widen
-- nothing. is_org_admin_or_owner() is the same test the admin policy leg
-- makes, restated because SECURITY DEFINER bypasses the policy that would
-- otherwise make it.
CREATE OR REPLACE FUNCTION public.archive_studio_contact(p_contact_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_at  timestamptz;
BEGIN
  SELECT sc.organization_id, sc.archived_at INTO v_org, v_at
    FROM public.studio_contacts sc WHERE sc.id = p_contact_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'studio_contact_not_found';
  END IF;

  IF NOT public.is_active_studio_member(v_org) THEN
    RAISE EXCEPTION 'studio_contact_not_found';
  END IF;
  IF NOT public.is_org_admin_or_owner(v_org) THEN
    RAISE EXCEPTION 'studio_contact_archive_forbidden'
      USING HINT = 'Only an owner or an admin of the studio may archive a '
                   'rolodex card (00417).';
  END IF;

  IF v_at IS NOT NULL THEN
    RETURN v_at;                      -- idempotent: already archived
  END IF;

  UPDATE public.studio_contacts
     SET archived_at = now()
   WHERE id = p_contact_id
  RETURNING archived_at INTO v_at;

  RETURN v_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_studio_contact(p_contact_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_at  timestamptz;
BEGIN
  SELECT sc.organization_id, sc.archived_at INTO v_org, v_at
    FROM public.studio_contacts sc WHERE sc.id = p_contact_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'studio_contact_not_found';
  END IF;

  IF NOT public.is_active_studio_member(v_org) THEN
    RAISE EXCEPTION 'studio_contact_not_found';
  END IF;
  IF NOT public.is_org_admin_or_owner(v_org) THEN
    RAISE EXCEPTION 'studio_contact_archive_forbidden'
      USING HINT = 'Only an owner or an admin of the studio may restore a '
                   'rolodex card (00417).';
  END IF;

  UPDATE public.studio_contacts
     SET archived_at = NULL
   WHERE id = p_contact_id;

  RETURN NULL::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_studio_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_studio_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_studio_contact(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_studio_contact(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.archive_studio_contact(uuid) IS
  'Soft-deletes a rolodex card and returns its archived_at (direction §8 P2). '
  'Owner/admin only — 00417''s shipped rule (its member UPDATE policy refuses '
  'archived_at on both sides; the admin leg carries the flip), restated in '
  'the body because SECURITY DEFINER bypasses the policy. Idempotent: an '
  'already-archived card returns its existing date and is not re-stamped. A '
  'non-member reads studio_contact_not_found, never a different error, so the '
  'door leaks no card ids (00629).';

COMMENT ON FUNCTION public.restore_studio_contact(uuid) IS
  'Clears a rolodex card''s archived_at (direction §8 P2). Owner/admin only, '
  'the same rule and the same posture as archive_studio_contact(). Restoring '
  'a card that was MERGED away brings back a card people_directory still '
  'folds into its survivor (merged_into), which is correct: archival and '
  'merge are different facts and PR-o keeps both ids resolvable (00629).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Grants on the changed view
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON public.people_directory FROM PUBLIC, anon;
GRANT SELECT ON public.people_directory TO authenticated, service_role;
