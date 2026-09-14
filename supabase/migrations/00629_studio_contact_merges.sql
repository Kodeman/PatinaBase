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
-- 00629. Sideways: 00578 (agreement_draw_lien_waivers.contact_id) and 00579
-- (studio_trade_agreements / _tokens.contact_id) are repointed here too, the
-- three FK columns into studio_contacts no other repoint reaches (r4 M-3).
--
-- ── WHAT CONSENT DOES, AND DOES NOT, DO HERE ──────────────────────────────
-- Nothing. studio_channel_consent is keyed on (organization_id, channel_kind,
-- channel_value) — never on a card id — so a number's consent follows the
-- number through a merge with no write at all (crm-model §4: "Consent per
-- channel value is untouched"; R-AY: the record is the only gate). This RPC
-- therefore touches no consent table and no frozen project_parties column, and
-- the union of channels below cannot change a single verdict. It can change
-- the WORD the survivor's row prints, and must: the reduction is worst-first
-- over every number the identity carries, so carrying the absorbed card's own
-- number across is what makes a recorded refusal keep showing after the merge
-- (r3 W3-R3-4).
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
-- 1b. merged_into IS NOT AN ORDINARY COLUMN — the write guard
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations review r2 BLOCKING B2-1, reproduced locally as a plain `member`
-- of the studio.
--
-- 00417's member UPDATE policy on studio_contacts is COLUMN-BLIND except for
-- archived_at (it splits that one out on both sides, :238-255), so a column
-- added later is reachable from PostgREST by any active member with one PATCH.
-- One PATCH of merged_into did all of this at once:
--
--   * the card left people_directory (§6's `merged_into IS NULL` leg) while
--     its seats kept the dead id — the exact orphaning §4's banner says must
--     never occur, and the r3 MAJOR-1 defect the v4 rebuild closed;
--   * a PERSON was folded into a FIRM, the one merge crm-model §4 forbids;
--   * merge_survivor_already_merged was skipped, so chains and cycles became
--     hand-buildable and resolve_merged_contact()'s depth cap became the only
--     thing between the room and a loop;
--   * nothing was repointed — no channel, affiliation, document, designation,
--     seat, bid pointer or household — and no studio_contact_merges row was
--     written, so PR-o's append-only lineage read "no merge happened";
--   * the pointer could name a card in ANOTHER studio, after which §4's guard
--     refused every seat write on the card and echoed the foreign id back in
--     its HINT;
--   * and merge_studio_contacts() then refused to repair any of it
--     (merge_already_merged / merge_survivor_already_merged), so the room's
--     own act could not undo the room's own damage.
--
-- TWO LEGS, because 00417 has two UPDATE policies and only one of them is the
-- member's. The policy split below states the rule the way 00417 states it for
-- archived_at — a member may neither set it nor edit a card that carries it —
-- and the trigger states it for EVERY signed-in caller, owners and admins
-- included, because 00417's admin leg (:256-262) carries no column predicate
-- at all and a policy cannot compare OLD to NEW.
--
-- THE DOOR is the 00594 refuse_legacy_consent_write() idiom: one
-- transaction-local GUC, set by merge_studio_contacts() around its own two
-- statements and cleared immediately after, so the SECURITY DEFINER RPC stays
-- the only writer without having to guess at auth.uid() (which a DEFINER
-- function still reports as the caller's).
CREATE OR REPLACE FUNCTION public.assert_merged_into_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_surv public.studio_contacts%ROWTYPE;
BEGIN
  -- BEFORE INSERT fires on every card the room mints, and the column is null on
  -- all of them; BEFORE UPDATE OF fires whenever a column is NAMED in the SET
  -- list, whether or not its value moves, and the shipped portal writes whole
  -- rows. Only a real change is judged (the 00594 shape).
  IF TG_OP = 'INSERT' THEN
    IF NEW.merged_into IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.merged_into IS NOT DISTINCT FROM OLD.merged_into THEN
    RETURN NEW;
  END IF;

  -- The FK is ON DELETE SET NULL (§1). When the SURVIVOR is deleted the
  -- referential action clears this pointer, and the parent row is already gone
  -- by the time this trigger sees it — that is the FK doing what §1 declares,
  -- not a caller un-merging a card, and refusing it would make a survivor
  -- undeletable.
  IF TG_OP = 'UPDATE'
     AND NEW.merged_into IS NULL
     AND OLD.merged_into IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.studio_contacts sc
                      WHERE sc.id = OLD.merged_into) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.contact_merge_in_progress', true), '') <> 'on' THEN
    RAISE EXCEPTION 'studio_contact_merge_pointer_forbidden'
      USING HINT = 'merged_into is written by merge_studio_contacts() and by '
                   'nothing else (PR-o). Merging two cards repoints their '
                   'channels, affiliations, paper, designations, seats, bid '
                   'pointers and household and writes the lineage row; '
                   'setting the pointer by hand does none of that and folds '
                   'the card''s seats out of the room.';
  END IF;

  -- BESIDE the door, not behind it: the two structural facts the RPC's own
  -- gates state, restated where no writer — the RPC, a repair, service_role —
  -- can get past them.
  IF NEW.merged_into IS NOT NULL THEN
    SELECT * INTO v_surv FROM public.studio_contacts WHERE id = NEW.merged_into;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_contact_merge_survivor_not_found'
        USING HINT = 'merged_into must name a rolodex card that exists.';
    END IF;
    IF v_surv.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'studio_contact_merge_other_studio'
        USING HINT = 'Two cards merge only inside one studio''s rolodex '
                     '(PD-1). A pointer across tenants makes every later seat '
                     'write on this card unsatisfiable.';
    END IF;
    IF v_surv.entity_kind IS DISTINCT FROM NEW.entity_kind
       AND NOT (NEW.entity_kind = 'company'
                AND v_surv.entity_kind = 'person'
                AND COALESCE(v_surv.is_sole_proprietor, false)) THEN
      RAISE EXCEPTION 'studio_contact_merge_kind_mismatch'
        USING HINT = 'A firm card merges into a person card only when that '
                     'person is declared a sole proprietor, and a person '
                     'never merges into a firm (crm-model §4).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_merged_into_write()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_merged_into_write() IS
  'BEFORE INSERT/UPDATE OF merged_into on studio_contacts: the pointer is '
  'merge_studio_contacts()''s to write and nobody else''s (00629, migrations '
  'review r2 B2-1). A change from any other caller — owner and admin '
  'included, since 00417''s admin UPDATE leg carries no column predicate — '
  'raises studio_contact_merge_pointer_forbidden. The RPC opens the door with '
  'SET LOCAL app.contact_merge_in_progress = ''on'' around its own two '
  'statements, the 00594 refuse_legacy_consent_write() idiom. Two structural '
  'rules hold for EVERY writer: the survivor is a card in the SAME studio, '
  'and the kind pair is legal (crm-model §4''s sole-proprietor fold is the '
  'one cross-kind case). Clearing the pointer is allowed only where the '
  'survivor no longer exists, which is the FK''s own ON DELETE SET NULL.';

DROP TRIGGER IF EXISTS assert_merged_into_write_trg ON public.studio_contacts;
CREATE TRIGGER assert_merged_into_write_trg
  BEFORE INSERT OR UPDATE OF merged_into
  ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.assert_merged_into_write();

-- ── the policy split, 00417's archived_at shape ───────────────────────────
-- Grafted from 00417:224-255 with ONE predicate added to each of the three
-- clauses. Nothing else moves: same names, same roles, same helpers, same
-- archived_at legs. The admin UPDATE leg (00417:256-262) is deliberately NOT
-- re-issued — it is the archive flip, and the trigger above is what holds it
-- to archived_at.
DROP POLICY IF EXISTS studio_contacts_member_insert ON public.studio_contacts;
CREATE POLICY studio_contacts_member_insert
  ON public.studio_contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND archived_at IS NULL
    AND merged_into IS NULL
  );

DROP POLICY IF EXISTS studio_contacts_member_update ON public.studio_contacts;
CREATE POLICY studio_contacts_member_update
  ON public.studio_contacts FOR UPDATE
  TO authenticated
  USING (
    public.is_active_studio_member(organization_id)
    AND archived_at IS NULL
    AND merged_into IS NULL
  )
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND archived_at IS NULL
    AND merged_into IS NULL
  );

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
  'P2). SELECT is the only member policy and the only member grant — no '
  'INSERT, no UPDATE, no DELETE: merge_studio_contacts() writes the row and a '
  'merge that happened is a fact nobody may forge or take back (r3 '
  'W3-R3-5). PR-o''s "both ids stay resolvable" is this '
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

-- NO member INSERT, and no INSERT grant (migrations review r3 W3-R3-5). The
-- policy that used to stand here checked only that both ids were cards in the
-- caller's own studio — never that studio_contacts.merged_into agreed — so a
-- plain member could POST /rest/v1/studio_contact_merges and write lineage for
-- a merge that never happened, over a card the Directory still emits its own
-- row for, with no UPDATE or DELETE policy to take it back. B2-1 shut the
-- pointer against every writer but the RPC; this shuts the other half of
-- PR-o's record. merge_studio_contacts() is SECURITY DEFINER and writes the
-- row itself, so it needs neither the policy nor the grant. There is
-- deliberately NO INSERT, NO UPDATE and NO DELETE policy: SELECT is the whole
-- of what a member may do with the lineage.
DROP POLICY IF EXISTS studio_contact_merges_member_insert ON public.studio_contact_merges;

REVOKE ALL ON TABLE public.studio_contact_merges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_contact_merges TO authenticated;
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
-- 4b. THE AUTO-LINK RESOLVER LEARNS ABOUT MERGED CARDS
-- ═══════════════════════════════════════════════════════════════════════════
-- 00626's rolodex_card_for_party_phone() answers "the ONE person card in this
-- studio carrying this number". §4's trigger above then refuses a seat stamped
-- with a merged card. Those two rules collide the moment a merge happens, and
-- the collision lands on the room's commonest act (migrations review r1 B-2,
-- reproduced locally):
--
--   apply_party_rolodex_link_trg fires first (BEFORE-row triggers run in
--   trigger-name order, 'apply_' < 'assert_'), stamps the seat with a card the
--   resolver still counts, and assert_party_card_not_merged_trg then rejects
--   the row — on an ordinary "Add to the roster" write where the studio named
--   no card at all, with a hint asking it to stamp a survivor the picker gives
--   it no way to stamp. The seat could not be created.
--
-- The same filter closes the SHARED-PHONE MERGE, which is direction §3.1's
-- canonical duplicate ("These two cards share a phone.", crm-model §4 rule 2)
-- and was permanently ambiguous without it (r1 M-1): the merge moves
-- studio_contact_channels but never either card's own phone_e164, so the
-- HAVING count(*) = 1 test kept seeing two rows forever and every later seat on
-- that number was left UNCARDED — a second identity on people_directory's
-- party branch, the exact over-count the merge exists to remove.
--
-- RESOLVED FORWARD, NOT EXCLUDED (migrations review r3 W3-R3-3). Excluding a
-- merged card closes the shared-phone case and opens a worse one for
-- crm-model §4's OTHER rules: rules 3 and 4 (email match; company plus name)
-- merge cards carrying DIFFERENT numbers, so the absorbed card was the only
-- card carrying its own — exclude it and that number resolves to NOTHING, the
-- next ordinary "Add to the roster" write on it lands UNCARDED, and
-- people_directory emits a SECOND identity row for the human the merge had
-- just made one. So the resolver maps every candidate through
-- resolve_merged_contact() and asks its "exactly one" question of the HEADS:
-- a number naming one identity — a live card, or a card merged into one, or
-- both — answers the survivor; a number naming two LIVE identities is still
-- the duplicate band's ambiguity and still answers NULL. §4's seat guard stays
-- satisfiable by construction, because the answer is always a live card.
--
-- Grafted from 00626:413-436: same signature, same STABLE/SECURITY
-- DEFINER/search_path, same grants (kept off `authenticated`), same
-- project_recorded_studio() resolver, same (array_agg)[1] idiom, no consent
-- read or written (R-AY).
CREATE OR REPLACE FUNCTION public.rolodex_card_for_party_phone(
  p_project_id uuid,
  p_phone_e164 text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH c AS (
    -- Every card carrying the number, MERGED ONES INCLUDED: a merged card is
    -- not an answer, but it is evidence about whose number this is.
    SELECT sc.id
      FROM public.studio_contacts sc
     WHERE p_project_id IS NOT NULL
       AND p_phone_e164 IS NOT NULL
       AND btrim(p_phone_e164) <> ''
       AND sc.entity_kind = 'person'
       AND sc.phone_e164 = p_phone_e164
       AND sc.organization_id = public.project_recorded_studio(p_project_id)
  ),
  m AS (
    -- The identities those cards resolve to today, deduplicated: two cards one
    -- merge apart are ONE identity and must not read as two.
    SELECT DISTINCT public.resolve_merged_contact(c.id) AS id FROM c
  ),
  live AS (
    -- 00629 §4: a seat may only be stamped with a LIVE person card, so the
    -- head is re-read and held to the same three facts the candidates were.
    SELECT h.id
      FROM m h
      JOIN public.studio_contacts sc ON sc.id = h.id
     WHERE sc.merged_into IS NULL
       AND sc.entity_kind = 'person'
       AND sc.organization_id = public.project_recorded_studio(p_project_id)
     ORDER BY h.id
     LIMIT 2
  )
  -- (array_agg)[1] rather than min(): there is no min(uuid) in Postgres.
  SELECT (array_agg(id))[1] FROM live HAVING count(*) = 1;
$$;

REVOKE ALL ON FUNCTION public.rolodex_card_for_party_phone(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rolodex_card_for_party_phone(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.rolodex_card_for_party_phone(uuid, text) IS
  'crm-model §4 rule 2''s auto-link, resolved: the ONE LIVE person card in the '
  'studio a project RECORDS (project_recorded_studio(), never the '
  'caller-relative resolver — the link is a fact about the record, not about '
  'the writer) whose phone_e164 is exactly this number. A card carrying '
  'merged_into is RESOLVED FORWARD through resolve_merged_contact() rather '
  'than excluded (00629, r3 W3-R3-3): §4 refuses a seat stamped with a merged '
  'card, so the answer must be a live one, but dropping the card from the '
  'count made a number that only the ABSORBED card carried — crm-model §4 '
  'rules 3 and 4 merge cards with different numbers — resolve to nothing, and '
  'the next seat on it landed uncarded as a SECOND identity for the human the '
  'merge had just made one. Two cards one merge apart are one identity here. '
  'NULL when there is none, '
  'when two LIVE identities share the number (PR-o/R-Y''s duplicate band is a '
  'card-to-card merge the studio rules on, not something a trigger decides) '
  'or when the project records no studio — and that last population therefore '
  'keeps the duplicate identity until R-BD''s W3 backfill names a studio, a '
  'RULING — R-BI (w1b final review r13 MAJOR-1). Reads and writes NO consent '
  '(R-AY). Called only by link_party_to_rolodex_card() and '
  'link_rolodex_card_to_parties(); not granted to authenticated (00626, '
  'merged_into leg 00629).';

-- The mirror, from the card's side. Grafted from 00626:522-548 with one guard
-- added: a MERGED card may not claim seats. Without it, a cosmetic reformat of
-- a merged card's phone stamped live seats with the dead id and then failed the
-- card UPDATE on §4's trigger (r1 B-2, second half).
CREATE OR REPLACE FUNCTION public.link_rolodex_card_to_parties()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.entity_kind IS DISTINCT FROM 'person'
     OR NEW.phone_e164 IS NULL
     OR btrim(NEW.phone_e164) = ''
     OR NEW.organization_id IS NULL
     -- 00629: the survivor claims seats; a card merged away claims nothing.
     OR NEW.merged_into IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.project_parties pp
     SET studio_contact_id = NEW.id
    FROM public.projects pj
   WHERE pj.id = pp.project_id
     AND pj.studio_id = NEW.organization_id
     AND pp.studio_contact_id IS NULL
     AND pp.phone_e164 = NEW.phone_e164
     -- the same "exactly one LIVE card" test, so a number that now names two
     -- live cards stamps nobody.
     AND public.rolodex_card_for_party_phone(pp.project_id, pp.phone_e164) = NEW.id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.link_rolodex_card_to_parties()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.link_rolodex_card_to_parties() IS
  'AFTER INSERT/UPDATE OF phone, phone_e164 on studio_contacts: the mirror of '
  'link_party_to_rolodex_card(). A LIVE person card minted or renumbered '
  'AFTER the seat claims the unstamped seats in its own studio that carry '
  'exactly its number, so the "card written next week" sequence cannot leave '
  'one human as two Directory identities (w1b final review r12 MAJOR-2). A '
  'card carrying merged_into claims nothing (00629). It writes '
  'studio_contact_id only — never a consent column (R-AY), never phone or '
  'phone_e164, so R-AX''s freeze is untouched — and only on projects whose '
  'projects.studio_id IS the card''s own organization, which is precisely '
  'what assert_project_party_cards() will then accept (00626, merged_into '
  'leg 00629).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4c. A SUPERSEDE EDGE IS JUDGED WHEN IT IS WRITTEN, NOT WHENEVER THE ROW MOVES
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations review r2 MAJOR B2-2, reproduced locally (rolled back).
--
-- assert_compliance_holder() (00623) re-validates the WHOLE successor contract
-- on every `UPDATE OF holder_id`, and two of its seven legs are time-varying:
--
--   compliance_successor_already_superseded  the successor is itself retired
--                                            the moment the NEXT renewal lands;
--   compliance_successor_already_lapsed      the successor lapses by the
--                                            calendar, with nobody writing
--                                            anything at all.
--
-- So the ordinary firm merge — an absorbed card that has renewed its COI once,
-- a survivor holding a current one — aborted outright: §5's compliance block
-- moves the absorbed head, then walks the retired rows behind it, and the
-- second statement re-judged an edge written years ago against today. Measured:
-- ERROR compliance_successor_already_superseded, raised from
-- assert_compliance_holder() line 112, the whole transaction lost, and no path
-- in the room past it — Leah's "Compare & merge" on that pair failed every
-- time with a schema error naming nothing she did. Reordering §5's two
-- statements (below) fixes the head-of-chain half and leaves the other:
-- measured, a LAPSED absorbed head with a retired predecessor then answered
-- compliance_successor_already_lapsed instead, which is the commoner shape
-- still (a firm card is folded away precisely because its paper stopped).
--
-- The two legs guard an ACT: pointing a paper at its renewal. Re-running them
-- over an unchanged edge adds nothing, because R-BF already re-reckons both
-- facts at READ time — compliance_state()'s transitive walk drops a row from
-- the count only while a reachable successor is still IN FORCE and still
-- carries its gates, so a chain whose head has since lapsed is already counted
-- against the card whatever the trigger said when the edge was written. The
-- five STRUCTURAL legs — holder exists, holder kind, holder studio, successor
-- held for the SAME CARD, same doc_type, dates, gates — still run on every
-- write, so the r1 MAJOR-4 / r2 MAJOR-1 / r3 MAJOR-1 laundering doors stay
-- shut: each of those is written by CHANGING superseded_by, which is exactly
-- what v_retiring names.
--
-- Grafted from 00623:293-471 verbatim — same signature, same SECURITY DEFINER
-- and search_path, same seven legs in the same order, every HINT byte for byte
-- — plus one boolean and two IF conditions. The trigger itself (00623) is not
-- re-issued: it already fires on the same seven columns.
CREATE OR REPLACE FUNCTION public.assert_compliance_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind         text;
  v_org          uuid;
  -- Is this write the ACT of retiring a paper, or a row being carried
  -- somewhere with the edge it already had? (00629, r2 B2-2.)
  v_retiring     boolean;
  v_succ_type       text;
  v_succ_expires    date;
  v_succ_superseded uuid;
  v_succ_blocks     text[];
BEGIN
  v_retiring := (TG_OP = 'INSERT')
                OR (NEW.superseded_by IS DISTINCT FROM OLD.superseded_by);

  SELECT sc.entity_kind, sc.organization_id INTO v_kind, v_org
    FROM public.studio_contacts sc WHERE sc.id = NEW.holder_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'compliance_holder_not_found'
      USING HINT = 'studio_compliance_documents.holder_id must name a rolodex '
                   'card that exists.';
  END IF;
  IF v_kind IS DISTINCT FROM NEW.holder_type THEN
    RAISE EXCEPTION 'compliance_holder_kind_mismatch'
      USING HINT = 'holder_type must equal the card''s own entity_kind. A COI '
                   'is the firm''s paper and a master licence is the '
                   'person''s; the row may not disagree with the card.';
  END IF;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'compliance_holder_other_studio'
      USING HINT = 'holder_id must name a card in the SAME studio as '
                   'organization_id. PR-u: each studio verifies its own paper.';
  END IF;

  IF NEW.superseded_by IS NOT NULL THEN
    SELECT d.doc_type, d.expires_on, d.superseded_by, d.blocks
      INTO v_succ_type, v_succ_expires, v_succ_superseded, v_succ_blocks
      FROM public.studio_compliance_documents d
      WHERE d.id = NEW.superseded_by
        AND d.organization_id = NEW.organization_id
        AND d.holder_id = NEW.holder_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'compliance_successor_other_holder'
        USING HINT = 'superseded_by must name another document held for the '
                     'SAME card in the SAME studio. A renewal supersedes its '
                     'own predecessor, not somebody else''s paper.';
    END IF;

    -- Card and studio were the whole guard, and they cannot tell a renewal
    -- from a laundering: one UPDATE through PostgREST by a plain studio
    -- member pointed a lapsed COI at the firm's undated W-9 and the paper
    -- word flipped from lapsed to current while the lapsed COI was still on
    -- file (w1b final review r1 MAJOR-4). compliance_state() excludes every
    -- superseded row, so the successor must be the SAME paper, covering at
    -- least as long as the row it retires.
    IF v_succ_type IS DISTINCT FROM NEW.doc_type THEN
      RAISE EXCEPTION 'compliance_successor_wrong_type'
        USING HINT = 'A renewal is the same paper: superseded_by must name a '
                     'document of the same doc_type. A W-9 does not renew a '
                     'COI, and pointing one at the other would hide a lapse.';
    END IF;
    IF v_succ_expires IS NOT NULL
       AND NEW.expires_on IS NOT NULL
       AND v_succ_expires < NEW.expires_on THEN
      RAISE EXCEPTION 'compliance_successor_not_later'
        USING HINT = 'A renewal covers at least as long as the paper it '
                     'retires: superseded_by must name a document whose '
                     'expires_on is not earlier than this row''s. An undated '
                     'successor qualifies only for an undated row — see '
                     'compliance_successor_undated, which keys on the paper''s '
                     'own date rather than on its type.';
    END IF;

    -- w1b final review r2 MAJOR-1, door (a), re-keyed in r4 (MAJOR-1): the
    -- exemption above was the second half of the undated-COI door. The CHECK
    -- (studio_compliance_documents_dated_expiry_check) makes an undated
    -- certificate unrecordable, and this says the same thing where the CHECK
    -- cannot see: over a row that predates the constraint, an undated
    -- successor of a dated paper is refused rather than silently retiring a
    -- lapse the card still holds.
    --
    -- r4 MAJOR-1: this leg, and the in-force leg below, both enumerated the
    -- five DATED doc_types — so for w9, lien_waiver_conditional,
    -- lien_waiver_unconditional and other_named the whole door stayed open,
    -- and it was walked: an expired lien_waiver_conditional gating
    -- {draw,payment} went from `lapsed` to `current` in two ordinary member
    -- writes with the expired certificate still on file. The rule does not
    -- belong to a type list, it belongs to the PAPER: only a DATED row can
    -- lapse, and a dated row may only be retired by a dated one. One rule
    -- covers all nine types and needs no vocabulary kept in step. (An undated
    -- row can never read `lapsed` — compliance_state() counts only
    -- expires_on IS NOT NULL — so retiring one with another undated paper
    -- hides nothing and stays legitimate.)
    IF NEW.expires_on IS NOT NULL AND v_succ_expires IS NULL THEN
      RAISE EXCEPTION 'compliance_successor_undated'
        USING HINT = 'A DATED paper may only be retired by a dated one: this '
                     'row carries an expires_on, so its renewal must carry '
                     'its own. An undated successor is held and can never '
                     'lapse, so it would read `current` forever while the '
                     'lapse it retired is still on file — whatever the '
                     'doc_type. An undated paper may still be retired by '
                     'another undated one.';
    END IF;

    -- w1b final review r2 MAJOR-1, door (b): the two-row supersede CYCLE.
    -- The CHECK could only see self-reference (superseded_by <> id), so
    -- A -> B and then B -> A passed both legs above whenever the two rows
    -- shared a doc_type and a date — and compliance_state() excludes EVERY
    -- superseded row, so the card fell back to whatever gateless paper it
    -- holds and printed `current` (every real firm in the fixture holds a
    -- W-9), or `not_on_file` on a card holding nothing else. Requiring the
    -- successor to be the HEAD of its own chain makes a cycle of any length
    -- unreachable in any number of statements: the edge that would close one
    -- must always point at a row that is already superseded. It costs nothing
    -- — the row was already being read.
    IF v_retiring AND v_succ_superseded IS NOT NULL THEN
      RAISE EXCEPTION 'compliance_successor_already_superseded'
        USING HINT = 'superseded_by must name the paper that is STILL in '
                     'force — a document whose own superseded_by is null. '
                     'Pointing at an already-retired row is how a supersede '
                     'closes a loop and takes every one of a card''s dated '
                     'papers out of the reckoning at once.';
    END IF;

    -- w1b final review r3 MAJOR-1, the THIRD door to r1 MAJOR-4's and r2
    -- MAJOR-1's consequence. Both legs below were reachable with two ordinary
    -- member writes on the seeded Okonkwo fixture, with `blocks` never typed:
    -- record a coi_gl dated CURRENT_DATE - 5 (the column default leaves blocks
    -- '{}'), then point Northgate Electric's 2026-03-31 lapse at it. Every
    -- guard above passes — same doc_type, a date not earlier, a date present,
    -- a successor at the head of its chain — and compliance_state() excludes
    -- every superseded row and counts only cardinality(blocks) > 0, so
    -- Northgate Electric, Dana Kowalski's identity row and BOTH her seat lines
    -- flipped from lapsed to current over a record holding no in-force
    -- general-liability certificate at all.
    --
    -- The two missing invariants, measured apart: with the gates carried
    -- forward the word stays honest even when the successor is itself expired
    -- (the successor's own lapse then holds the card), and an honest
    -- future-dated renewal with blocks left at the default silently drops
    -- {site_access,draw} — the same hole one renewal later. So a successor
    -- must be IN FORCE, and must carry at least the gates of the row it
    -- retires.
    --
    -- Both are checked LAST, after the head-of-chain leg, so a loop-closing
    -- edge that is also expired still answers
    -- compliance_successor_already_superseded — the cycle is the worse fact
    -- and the error a reader should see.
    --
    -- r4 MAJOR-1: keyed on the successor's own DATE rather than on the same
    -- five-type list, for the reason stated at the undated leg above — a
    -- lapsed lien waiver, W-9 or named card is exactly as expired as a lapsed
    -- certificate, and its retirement was unguarded. The in-force test now
    -- applies whenever the successor carries a date at all.
    IF v_retiring AND v_succ_expires IS NOT NULL AND v_succ_expires < CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance_successor_already_lapsed'
        USING HINT = 'A renewal must still be in force: superseded_by may not '
                     'name a paper whose own expires_on has already passed, '
                     'whatever the doc_type. Retiring a lapse with an equally '
                     'lapsed successor takes the first lapse out of the '
                     'reckoning and, when the successor carries no gate of '
                     'its own, prints `current` over a firm with no cover.';
    END IF;

    IF NOT (NEW.blocks <@ v_succ_blocks) THEN
      RAISE EXCEPTION 'compliance_successor_drops_a_gate'
        USING HINT = 'A renewal carries at least the gates of the paper it '
                     'retires: superseded_by must name a document whose '
                     'blocks[] contains every gate this row holds. blocks '
                     'defaults to empty, so a renewal recorded without its '
                     'gates would retire a gating lapse with a gateless row '
                     'and read `current` forever — record the gates on the '
                     'renewal, or do not retire the lapse.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4d. contact_rule_blocks_contact — R-BL's hard block, as one predicate
-- ═══════════════════════════════════════════════════════════════════════════
-- R-BL (Fable, 2026-09-13): a rule is a HARD BLOCK when it forbids EVERY
-- direct channel (do-not-contact) or routes contact to another person — never
-- when it merely closes one direct channel while another stays open. F-15
-- Frank Bauer blocks; F-27 Ray Thao (never text, email and phone open) and
-- F-11 Dana Kowalski (text only, the email is dead) do not.
--
-- The four direct channels are the portal's own list
-- (lib/document/contact-rule.ts DIRECT_CONTACT_CHANNELS): `dispatch`,
-- `after_hours` and `ap_email` are a FIRM's lines and `portal_311` is a
-- municipal scheduling portal, so a rule bars nothing left by naming them.
-- One formula, stated here because the merge now refuses on it (r4 B-2) and a
-- second reading of "blocks" is how the two faces disagreed in the first place.
CREATE OR REPLACE FUNCTION public.contact_rule_blocks_contact(
  p_channels_forbidden text[],
  p_route_to_person_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_route_to_person_id IS NOT NULL
      OR ARRAY['sms', 'mobile', 'office', 'email']
           <@ COALESCE(p_channels_forbidden, '{}'::text[]);
$$;

REVOKE ALL ON FUNCTION public.contact_rule_blocks_contact(text[], uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_rule_blocks_contact(text[], uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.contact_rule_blocks_contact(text[], uuid) IS
  'R-BL''s hard block as one predicate over a studio_contact_rules row: every '
  'direct channel forbidden (sms, mobile, office, email), or contact routed '
  'to another person. The portal''s contactRuleIsHardBlock() is the same '
  'formula; merge_studio_contacts() refuses on it so a recorded block cannot '
  'vanish into an absorbed card (00629 r4 B-2).';

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
  -- The absorbed heads that earn a successor, and the successor each earns,
  -- captured before the first statement makes the predicate false (r2 B2-2).
  v_heads    uuid[];
  v_succs    uuid[];
  -- The two cards' contact rules, read before anything moves (r4 B-2).
  v_survivor_rule public.studio_contact_rules%ROWTYPE;
  v_merged_rule   public.studio_contact_rules%ROWTYPE;
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

  -- ── TWO LOGINS ARE TWO HUMANS (r4 B-1) ──────────────────────────────────
  -- profile_id is crm-model §4 rule 1's PROOF-strength key: two cards naming
  -- two DIFFERENT logins are not one person carded twice, they are two people
  -- the studio believes share a number. Folding them would strand one account
  -- on a card that emits no Directory row. The studio rules on it: unlink one
  -- login, or do not merge.
  IF v_survivor.profile_id IS NOT NULL
     AND v_merged.profile_id IS NOT NULL
     AND v_survivor.profile_id IS DISTINCT FROM v_merged.profile_id THEN
    RAISE EXCEPTION 'merge_two_logins'
      USING HINT = 'These two cards name two different Patina accounts. One '
                   'card, one login (crm-model §4 rule 1) — take the account '
                   'off one of them first, or leave them as two people.';
  END IF;

  -- ── A BLOCK MAY NOT VANISH IN A MERGE (r4 B-2) ──────────────────────────
  -- One rule row per subject (idx_studio_contact_rules_subject), so the two
  -- cards' rules cannot both survive on the survivor — and the repoint below
  -- is conditional, so the absorbed card's rule stays behind wherever the
  -- survivor already carries one. Where the absorbed rule BLOCKS (R-BL: every
  -- direct channel forbidden, or contact routed to another person) and the
  -- survivor's does not, that silence turned "do not contact, write Rosa
  -- instead" into "Use: email, mobile" on the Directory row, the roster row,
  -- the person card and the company card's crew line at once — Leah task 4's
  -- acceptance criterion inverted, and C30's class of harm: the cost of a
  -- missed refusal is a compliance violation, so it may not hide.
  --
  -- The RPC takes three arguments and none of them is a field choice, so
  -- there is no face on which the studio could pick. It refuses instead, by
  -- name, and the studio settles the rule on the surviving card first — both
  -- cards are still live and still openable at that moment. Where the
  -- survivor's own rule ALSO blocks, nothing is lost by keeping it, and the
  -- merge proceeds.
  SELECT * INTO v_merged_rule
    FROM public.studio_contact_rules r
   WHERE r.subject_type = v_merged.entity_kind AND r.subject_id = p_merged;
  SELECT * INTO v_survivor_rule
    FROM public.studio_contact_rules r
   WHERE r.subject_type = v_survivor.entity_kind AND r.subject_id = p_survivor;

  IF v_merged_rule.id IS NOT NULL
     AND v_survivor_rule.id IS NOT NULL
     AND public.contact_rule_blocks_contact(
           v_merged_rule.channels_forbidden, v_merged_rule.route_to_person_id)
     AND NOT public.contact_rule_blocks_contact(
           v_survivor_rule.channels_forbidden,
           v_survivor_rule.route_to_person_id) THEN
    RAISE EXCEPTION 'merge_contact_rule_conflict'
      USING HINT = 'The card being folded in says contact is blocked or '
                   'routed elsewhere, and the card you are keeping says '
                   'something else. Settle one rule on the card you are '
                   'keeping, then merge.';
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

  -- ── and the absorbed card's OWN number and address, which are not rows ───
  -- crm-model §4's "Channels union" over the LEGACY COLUMNS too (migrations
  -- review r3 W3-R3-4). studio_contacts.phone_e164 / email are where a card
  -- created after 00593 keeps its number — 00593's channel fill is a one-time
  -- backfill, not a trigger, and the Add-a-person sheet writes the scalars
  -- alone — and they are what identity_phone_numbers() reads as its card leg,
  -- what rolodex_card_for_party_phone() matches on and what
  -- link_rolodex_card_to_parties() fires on. Unmoved, the absorbed number left
  -- the room at the merge: the survivor's identity reduced its consent word
  -- over its OWN number only, so a human whose duplicate card carried a
  -- recorded `opted_out` printed `Not asked` on the Directory row (R-G), on
  -- the collapsed roster row (R-T) and on the bring-forward mini row (SPEC
  -- §5.7 #4b — Pete Rusk's case exactly), while the merge sheet had just said
  -- "nobody's yes or no changes". No consent is read or written here (R-AY):
  -- a channel row is an address, and channel_consent_status() still answers
  -- from studio_channel_consent per number.
  --
  -- The kind follows the SURVIVOR's own entity_kind, as 00593's backfill does
  -- and as assert_channel_owner_kind() requires; sms_capable takes 00593 leg
  -- (a)'s evidence test rather than a literal, so a number nobody has texted
  -- arrives unconfirmed and W1b's Reach editor asks the studio.
  INSERT INTO public.studio_contact_channels
    (owner_type, owner_id, channel_kind, value, sms_capable, label)
  SELECT v_survivor.entity_kind,
         p_survivor,
         CASE WHEN v_survivor.entity_kind = 'person' THEN 'mobile' ELSE 'office' END,
         s.v,
         v_survivor.entity_kind = 'person'
           AND public.channel_value_was_on_sms_rail(
                 public.normalize_channel_value('mobile', s.v)),
         'From the merged card (00629 merge)'
    FROM (SELECT NULLIF(btrim(COALESCE(v_merged.phone_e164, v_merged.phone, '')), '') AS v) s
   WHERE s.v IS NOT NULL
  ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

  INSERT INTO public.studio_contact_channels
    (owner_type, owner_id, channel_kind, value, label)
  SELECT v_survivor.entity_kind, p_survivor, 'email', s.v,
         'From the merged card (00629 merge)'
    FROM (SELECT NULLIF(btrim(COALESCE(v_merged.email, '')), '') AS v) s
   WHERE s.v IS NOT NULL
  ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

  -- ── THE LOGIN, AND THE ADDRESS THE DIRECTORY ROW READS (r4 B-1) ─────────
  -- people_directory's CONTACTS branch reads `sc.profile_id` and `sc.email`
  -- off the SURVIVOR's own columns — reach_state_for_identity()'s first leg is
  -- "profile_id IS NOT NULL THEN 'account'" — and PR-o pre-picks the OLDER
  -- card, which is exactly the card that predates the account. Unmoved, a
  -- merge read `On paper` over a human who is signed in to Patina and blanked
  -- the row's address: the login was not deleted, but the only card carrying
  -- it emitted no Directory row, no picker entry and no ?person= target.
  -- Direction §3.8 makes Account a reach word the studio acts on and PR-k
  -- makes an account additive — a merge may not subtract one.
  --
  -- COALESCE, never overwrite: the survivor's own login and address stand
  -- wherever it has them, and the two-logins case was refused above. The
  -- number is deliberately NOT carried here — it already travels as a channel
  -- row above, and writing phone/phone_e164 would fire
  -- link_rolodex_card_to_parties() mid-merge, which is a seat claim and not
  -- this statement's business.
  IF v_survivor.profile_id IS NULL AND v_merged.profile_id IS NOT NULL THEN
    UPDATE public.studio_contacts
       SET profile_id = v_merged.profile_id
     WHERE id = p_survivor;
  END IF;

  IF NULLIF(btrim(COALESCE(v_survivor.email, '')), '') IS NULL
     AND NULLIF(btrim(COALESCE(v_merged.email, '')), '') IS NOT NULL THEN
    UPDATE public.studio_contacts
       SET email = v_merged.email
     WHERE id = p_survivor;
  END IF;

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
  -- One row per subject, so only one of the two can stand on the survivor.
  -- The rule left behind is never a BLOCK: the gate above refuses the merge
  -- where the absorbed card blocks and the survivor's rule does not (r4 B-2),
  -- so this repoint can stay conditional without losing a refusal.
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
  -- EVERY ABSORBED DOCUMENT MOVES ONTO THE SURVIVOR, and compliance_state()'s
  -- worst-first reckoning settles the word (migrations review r3 W3-R3-1).
  --
  -- The history, because the rule swung twice. The file first moved every
  -- document with superseded_by left NULL, and compliance_state() reduces
  -- WORST-FIRST over a holder — so a merge manufactured a block the survivor
  -- never earned: a firm whose own COI runs another ten months read `lapsed`
  -- the instant a card carrying an old certificate was folded into it (r1
  -- B-1). The answer then taken was to move the absorbed paper only where the
  -- survivor already held the SAME paper in force — crm-model §4's
  -- ACQUISITION rule ("documents of the absorbed firm keep their original
  -- holder id"), which is the right rule for two firms becoming one.
  --
  -- It is the wrong rule for the merge this room actually offers. Direction
  -- §3.1's duplicate band — "These two cards share a phone. Compare them?",
  -- crm-model §4 rules 2, 3 and 4 — folds ONE firm carded twice, and PR-o
  -- makes which card survives the studio's free choice. Leaving the remainder
  -- behind therefore hid the firm's own paper on a card no surface can reach:
  -- the absorbed card emits no Directory row (§6), the three pickers filter
  -- merged_into and 00630's sweep skips it. Measured: a survivor holding a
  -- LAPSED certificate and an absorbed duplicate holding the CURRENT renewal
  -- read `lapsed` after the merge and earned a nightly "…'s paper has lapsed"
  -- notice to every owner and admin, while the renewal that answers it sat on
  -- a card the room cannot open; a survivor holding nothing read `not_on_file`
  -- and printed R-K's "Not on file" with the act "Record a document" over
  -- paper the studio had already recorded. The word even depended on which
  -- card the studio picked as survivor.
  --
  -- So: the absorbed head keeps its supersede edge where the survivor already
  -- holds a legitimate successor (that lineage is real and superseded_by says
  -- so), and EVERY OTHER absorbed document simply arrives, whole, on the
  -- survivor. r1 B-1's complaint is answered by the studio's own act of
  -- declaring these two cards one firm — a lapse the studio recorded is a
  -- lapse the studio holds — rather than by hiding a lapse and a renewal at
  -- once. Two genuinely different firms are not this act; they are crm-model
  -- §4's acquisition, which the room does not offer.
  --
  -- The predicate below is assert_compliance_holder()'s own supersede gate,
  -- stated as a join so a document the trigger would refuse is never offered
  -- one: same doc_type, successor at the head of its own chain, successor in
  -- force, successor dated when the row is dated and expiring no earlier, and
  -- the successor carrying at least the row's gates (blocks <@).
  --
  -- THREE STATEMENTS, IN THIS ORDER (r2 B2-2, widened in r3). The block used
  -- to move the head and write its superseded_by in ONE statement, and then
  -- walk the rows behind it — so the second statement asked
  -- assert_compliance_holder() to re-validate a supersede edge whose successor
  -- the FIRST statement had just retired, and every merge of a card carrying a
  -- renewal aborted. The order is also what lets the move be UNCONDITIONAL
  -- without tripping the trigger's holder leg (a successor must be held for
  -- the same card): EVERY head moves first, carrying nothing (a row with a
  -- NULL superseded_by is asked no successor question at all), the lineage
  -- behind each one follows while its own successor is already on the
  -- survivor, and the supersede edge onto the survivor's own certificate is
  -- written LAST, when every row it concerns is in place. §4c is the other
  -- half: the two time-varying legs no longer re-judge an unchanged edge.
  IF NOT v_cross THEN
    -- The heads that qualify, and the successor each one earns. Captured ONCE,
    -- into two aligned arrays, because the predicate is `d.holder_id =
    -- p_merged` and the first statement below makes it false.
    SELECT array_agg(q.doc_id ORDER BY q.doc_id),
           array_agg(q.successor_id ORDER BY q.doc_id)
      INTO v_heads, v_succs
      FROM (
        SELECT DISTINCT ON (d.id)
               d.id  AS doc_id,
               s.id  AS successor_id
          FROM public.studio_compliance_documents d
          JOIN public.studio_compliance_documents s
            ON s.holder_id       = p_survivor
           AND s.organization_id = d.organization_id
           AND s.doc_type        = d.doc_type
           AND s.superseded_by IS NULL
           AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
           AND (d.expires_on IS NULL
                OR (s.expires_on IS NOT NULL AND s.expires_on >= d.expires_on))
           AND d.blocks <@ s.blocks
         WHERE d.holder_id = p_merged
           AND d.superseded_by IS NULL
         ORDER BY d.id, s.expires_on DESC NULLS LAST, s.id
      ) q;

    -- 1. EVERY absorbed head moves, carrying the edge it already had (none) —
    --    the qualifying ones of v_heads and the remainder alike (r3 W3-R3-1).
    UPDATE public.studio_compliance_documents d
       SET holder_id   = p_survivor,
           holder_type = v_survivor.entity_kind
     WHERE d.holder_id = p_merged
       AND d.superseded_by IS NULL;

    -- 2. the retired rows BEHIND each moved head follow it, outermost first,
    --    so each one's own successor is already on the survivor when
    --    assert_compliance_holder() reads it. Depth-capped like every other
    --    walk in this file; a chain deeper than sixteen renewals is not a
    --    chain.
    FOR i IN 1..16 LOOP
      UPDATE public.studio_compliance_documents d
         SET holder_id   = p_survivor,
             holder_type = v_survivor.entity_kind
       WHERE d.holder_id = p_merged
         AND d.superseded_by IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.studio_compliance_documents s
                      WHERE s.id = d.superseded_by
                        AND s.holder_id = p_survivor);
      EXIT WHEN NOT FOUND;
    END LOOP;

    -- 3. and only now the new edge: an absorbed head that HAS a legitimate
    --    successor on the survivor says WHY it no longer counts. The heads
    --    with no such successor keep a NULL edge and count for themselves,
    --    which is the whole of the r3 fix.
    IF v_heads IS NOT NULL THEN
      UPDATE public.studio_compliance_documents d
         SET superseded_by = v_succs[array_position(v_heads, d.id)]
       WHERE d.id = ANY (v_heads);
    END IF;
  ELSE
    -- The sole-proprietor fold has no supersede pass at all: the firm IS the
    -- person, declared so by is_sole_proprietor, R-BA already reduces one
    -- paper word over the person AND their firm, and leaving the certificates
    -- on the folded firm card would read `Not on file` over a sole proprietor
    -- who is insured. Everything moves, and holder_type moves with it because
    -- assert_compliance_holder() holds holder_type to the card's entity_kind.
    --
    -- IN THE SAME ORDER AS THE SAME-KIND BRANCH (r4 M-1). This used to be ONE
    -- unordered UPDATE, and assert_compliance_holder()'s STRUCTURAL leg
    -- compliance_successor_other_holder always runs — v_retiring suppresses
    -- only the two time-varying legs — so a retired row reached before its own
    -- successor found superseded_by naming a document still held by the firm,
    -- and the fold aborted with a schema token naming nothing the studio did.
    -- Measured deterministic on a sole proprietor with one renewed COI; the
    -- identical construction passed on other runs, which is worse: it passes a
    -- suite and fails on a real book. F-11 Dana Kowalski — owner-operator,
    -- sole proprietor, the fixture's only lapsed-then-renewed certificate — is
    -- the motivating pair.
    --
    -- So: the heads first, carrying nothing (a NULL superseded_by is asked no
    -- successor question at all), then the lineage behind each one
    -- outermost-first, each row's own successor already on the survivor when
    -- the trigger reads it. Same depth cap, same reason.
    UPDATE public.studio_compliance_documents d
       SET holder_id   = p_survivor,
           holder_type = v_survivor.entity_kind
     WHERE d.holder_id = p_merged
       AND d.superseded_by IS NULL;

    FOR i IN 1..16 LOOP
      UPDATE public.studio_compliance_documents d
         SET holder_id   = p_survivor,
             holder_type = v_survivor.entity_kind
       WHERE d.holder_id = p_merged
         AND d.superseded_by IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.studio_compliance_documents s
                      WHERE s.id = d.superseded_by
                        AND s.holder_id = p_survivor);
      EXIT WHEN NOT FOUND;
    END LOOP;
  END IF;

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

  -- ── the seat's FOURTH card pointer, minted two files later ──────────────
  -- 00631 gives a seat `bid_quoted_by_person_id` — the estimator who priced
  -- the work — and assert_party_bid_quoted_by() refuses a merged card on it.
  -- Unrepointed, a seat whose bid was priced by the duplicate kept the dead id
  -- and the next ordinary save of that bid was refused
  -- party_bid_quoted_by_merged_away, with no way out: the room's "Who priced
  -- it" picker offers live person cards only (migrations review r1 M-2,
  -- reproduced locally). Only a PERSON card may hold it, so a company survivor
  -- can never be the target.
  --
  -- NAMING A LATER FILE'S COLUMN, deliberately: plpgsql resolves relations at
  -- first EXECUTION, never at CREATE, and nothing calls this RPC between
  -- 00629 and 00632 — not the seeds, not the suite, which both run after every
  -- migration. The alternative is a second 250-line copy of this body in
  -- 00632, and two bodies is how the repoint list went stale in the first
  -- place.
  IF v_survivor.entity_kind = 'person' THEN
    UPDATE public.project_parties
       SET bid_quoted_by_person_id = p_survivor
     WHERE bid_quoted_by_person_id = p_merged;
  END IF;

  -- ── the trade agreement's own card pointers (r4 M-3) ────────────────────
  -- Three FK columns into studio_contacts that no repoint above reaches, and
  -- one of them keys a LIVE DOOR. access_grants_trade_agreement_links()
  -- (00627:199) publishes an agreement link as
  -- `subject_type = 'contact', subject_id = studio_trade_agreement_tokens
  -- .contact_id`, and the company card hands ReachAccess exactly one subject
  -- id — the survivor's (company-card.tsx CR7-2, direction §5.1's company
  -- variant: firm-scoped tokens only, and agreement_link is the one tier keyed
  -- on a firm). Unrepointed, the survivor's card listed none of the absorbed
  -- firm's live links and the card that did key them emits no Directory row:
  -- the People room's Revoke could no longer close a door that is still open.
  --
  -- The TOKEN and the WAIVER move. The AGREEMENT ITSELF moves only while it is
  -- a draft: guard_trade_agreement_authored() (00579:240-270) freezes
  -- contact_id the moment the agreement leaves 'draft', because the sent paper
  -- records who it was sent to and the signature's fingerprint is computed
  -- over those essentials. A sent agreement therefore keeps naming the
  -- absorbed card — which resolves forward through resolve_merged_contact()
  -- and still answers studio_contact_org() for the link reader's gate, so
  -- nothing is stranded by it. Repointing it instead would abort every merge
  -- of a firm that has ever sent an agreement, with a refusal in the
  -- agreements room's voice on a face in the People room.
  UPDATE public.studio_trade_agreement_tokens
     SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.agreement_draw_lien_waivers
     SET contact_id = p_survivor WHERE contact_id = p_merged;
  UPDATE public.studio_trade_agreements
     SET contact_id = p_survivor
   WHERE contact_id = p_merged AND state = 'draft';

  -- ── the household (00632) ───────────────────────────────────────────────
  -- A household is an ARRAY of person cards plus a primary pointer, held by
  -- assert_client_household_members() to live, unmerged cards. Unrepointed,
  -- merging a member's duplicate bricked the row: every later write was
  -- refused household_member_not_a_live_person_card, including the room's own
  -- add_household_member(), and there is no RPC to remove a member, so the
  -- only repair was hand-written SQL (r1 M-3, reproduced locally). PR-c's
  -- motivating case — the Okonkwo spouses — is the shape most likely to carry
  -- a duplicate card.
  --
  -- array_remove-then-append rather than array_replace, because BOTH ids may
  -- already be members (one spouse invited twice, both seated): a plain
  -- replace would leave the survivor twice in one household.
  IF v_survivor.entity_kind = 'person' THEN
    UPDATE public.client_households
       SET member_person_ids =
             array_remove(member_person_ids, p_merged)
             || CASE WHEN p_survivor = ANY (array_remove(member_person_ids, p_merged))
                     THEN '{}'::uuid[] ELSE ARRAY[p_survivor] END,
           primary_member_person_id =
             CASE WHEN primary_member_person_id = p_merged
                  THEN p_survivor ELSE primary_member_person_id END
     WHERE p_merged = ANY (member_person_ids);
  END IF;

  -- ── the pointer, and the chain flattened ────────────────────────────────
  -- §1b's door, opened for exactly these two statements and shut again. The
  -- guard refuses merged_into to every other caller, owners and admins
  -- included, so this RPC is the column's only writer (r2 B2-1). Transaction-
  -- local (set_config's third argument), and cleared rather than left for the
  -- rest of the transaction: a SET clause on the function saves and restores
  -- only search_path.
  PERFORM set_config('app.contact_merge_in_progress', 'on', true);

  UPDATE public.studio_contacts SET merged_into = p_survivor WHERE id = p_merged;
  UPDATE public.studio_contacts
     SET merged_into = p_survivor
   WHERE merged_into = p_merged AND id <> p_survivor;

  PERFORM set_config('app.contact_merge_in_progress', 'off', true);

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
  'channel_kind + value dropped, PLUS the absorbed card''s own phone_e164 and '
  'email minted as channel rows on the survivor so the legacy columns join '
  'the union too — r3 W3-R3-4), affiliations, contact rules (the '
  'survivor''s wins; the merged card keeps its own as history unless the '
  'survivor has none), the route_to pointer, the three designations other '
  'cards hold, every seat''s studio_contact_id / company_id / '
  'warranty_contact_person_id / bid_quoted_by_person_id (00631), and the '
  'household''s member array and primary pointer (00632), the trade '
  'agreement''s live link token and lien-waiver card pointers (a SENT '
  'agreement''s own contact_id stays frozen where 00579 froze it — r4 M-3), '
  'and the absorbed card''s LOGIN and email address onto the survivor where '
  'the survivor has none, because people_directory reads both off the '
  'survivor''s own columns and PR-o pre-picks the older card (r4 B-1). '
  'COMPLIANCE PAPER '
  'MOVES, WHOLE: every absorbed document arrives on the survivor and '
  'compliance_state()''s worst-first reckoning settles the word, with the '
  'supersede edge written where the survivor already holds the same paper in '
  'force. Leaving the remainder behind stranded it on a card no surface can '
  'reach — no Directory row, no picker, no sweep — so a merge hid a lapse AND '
  'the renewal that answers it, and the word depended on which card the '
  'studio picked as survivor, which PR-o says is free (r3 W3-R3-1). '
  'CONSENT IS UNTOUCHED: '
  'studio_channel_consent is keyed on (organization_id, channel_kind, '
  'channel_value) and never on a card, so a number''s verdict follows the '
  'number with no write (crm-model §4, R-AY). Refuses a firm into a person '
  'unless the person is_sole_proprietor, and a person into a firm always '
  '(merge_kind_mismatch); refuses two cards naming two DIFFERENT Patina '
  'accounts (merge_two_logins); refuses a merge that would leave a BLOCKING '
  'contact rule behind on the absorbed card while the survivor carries a '
  'permissive one (merge_contact_rule_conflict, R-BL''s formula through '
  'contact_rule_blocks_contact()). Neither card is deleted or archived: the merged one '
  'takes merged_into and stays resolvable through resolve_merged_contact() '
  '(00629).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. people_directory v5 — the same view, with merged cards folded away
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00626:1388-1909 with TWO deltas, and nothing else (r4 M-2 —
-- the banner used to claim one, and a code-only diff of the two bodies returns
-- both):
--
--   1. the CONTACTS branch's WHERE gains `AND sc.merged_into IS NULL`, so a
--      card that was merged away emits no identity row of its own.
--   2. the TEAM branch's WHERE gains the tenant leg every other branch already
--      carried (r1 M-7, R-BD) — is_active_studio_member(project_tenant_org())
--      or the caller standing on the project themselves. This is a
--      NARROWING of who reads a studio's teammate names, job titles, staff
--      roles and project ids, made in this wave and reported as made.
--
-- Every other branch, every other predicate, every appended column and the
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
-- Carried from 00594:1389-1429, plus the project_tenant_org() leg every other
-- branch already carried (R-BD; migrations review r1 M-7 — see the WHERE
-- below). Already one row per identity (DISTINCT ON user_id). reach_state is
-- `account` by construction — the branch joins project_team_members, which is
-- logins only (00084:160-172).
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
    -- 00629 (migrations review r1 M-7), R-BD: THE TENANT LEG, which this
    -- branch alone never took. Gated on is_studio_comember(designer) only, a
    -- co-member of the designer of record THROUGH A SECOND STUDIO read the
    -- working studio's teammate names, their job_title / staff_role and the
    -- project id — a cross-tenant read of names on the one branch W1b left
    -- behind. Written exactly as every other branch writes it: the project's
    -- own tenant org, or the caller standing on the project themselves.
    AND ( public.is_active_studio_member(public.project_tenant_org(tm.project_id))
       OR pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid()) )
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
