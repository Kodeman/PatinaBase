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
-- FORWARD, and amended in place for it: 00637 (paperwork_link_tokens.
-- company_id) is the firm's upload door, minted after this file, and a merge
-- that left it on the absorbed card emptied the trade's own page, dropped its
-- next upload where the studio never looks, and broke R-AF (W4 r3 MAJOR-3).
-- Onwards: 00634 (end_party_authority_at_seat_close, r19 MAJOR-1) makes this
-- file's OPEN-SEATS-ONLY carve-out true for the hand close, and R-BS clamps it
-- off the withdrawal path — so 00629 is amended in place with a fourth seat
-- pre-check that asks about the GRANT (merge_seat_authority_collision,
-- r22 MAJOR-1), and amended in place again so that refusal names the repair
-- the state actually has — the seat that LEFT the job goes back in the bidding
-- and is then closed by hand — rather than the close of the live seat, which
-- was measured to lift the gate while leaving the standing grant standing
-- (r23 MAJOR-1).
--
-- ── TWO GUARDS THIS FILE STANDS IN FRONT OF, AND ONE IT STANDS DOWN (r13) ─
-- §5's pre-checks refuse BY NAME and before the first write on BOTH shapes of
-- assert_project_party_cards() (00624) a seat repoint can land on: a job that
-- records no studio (merge_seat_on_studioless_project, r11/r12) and a seat
-- carrying a card of ANOTHER studio (merge_seat_card_other_studio, r13), so
-- neither guard's raw schema token can reach the merge sheet. A THIRD seat
-- pre-check stands in front of no guard at all, because there is none: a fold
-- that would leave one human holding two OPEN seats of the same party_kind on
-- one job is refused as merge_seat_collision (r18 MAJOR-1), since each of the
-- two seats can carry its own open money grant and the Call Sheet would then
-- print the same person twice with two different signing figures. A FOURTH
-- asks that same question of the GRANT rather than of the seat's openness
-- (merge_seat_authority_collision, r22 MAJOR-1): R-BS clamps 00634's
-- end-authority trigger off the withdrawal path, so a seat can be dated and
-- still carry an open grant, and the third pre-check cannot see it. And §4g stands
-- the project_parties updated_at stamp down across the seat block, because a
-- fold is not a touch on anybody's job and the stamp is what the Directory
-- ranks an uncarded identity's seats by (r13 MAJOR-2).
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
-- person, so the firm's affiliation AT THE SURVIVOR is dropped rather than
-- repointed — an affiliation of a person at themselves is what
-- studio_person_affiliations_distinct_cards_check already refuses — and that
-- DELETE runs inside the same patina.suppress_affiliation_sync window as the
-- crew's close, so the survivor's own legacy company_id keeps naming the
-- folded firm rather than being re-derived to NULL over zero open rows. The
-- survivor also CARRIES the firm's company_name forward, because that column
-- is where a firm card's name lives and nothing else on a person card holds
-- it (r9 B-2). Every OTHER person's affiliation at that firm is CLOSED with
-- to_date, not erased,
-- and their legacy company_id pointer stands (r6 M-3, R-BN): a sole
-- proprietor who really has crew is a fact the studio recorded, and the crew
-- must not lose their firm's name off their Directory row — and §4f re-issues
-- identity_paper_state() so that standing pointer resolves FORWARD for paper
-- too, or the crew would keep the folded firm's name beside `Not on file`
-- over a certificate that filed and lapsed (r10 BLOCKING-1). And the
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
-- r7 M-1 — AND FOUR MORE ARE EDIT-VARYING, WHICH IS THE SAME DEFECT BY A
-- SECOND CLOCK. The trigger judges a row against ITS OWN successor and never
-- against its predecessors, while `expires_on`, `blocks` and `doc_type` are
-- all freely editable by any active studio member
-- (studio_compliance_documents_member_update). So an ordinary, permitted edit
-- to a RENEWAL leaves an existing supersede edge failing a leg that nothing
-- re-checks — until merge_studio_contacts()'s holder-move statement re-judges
-- it and loses the whole transaction. Measured, each reached by two ordinary
-- member writes on a seeded firm pair:
--
--   shrink a renewal's blocks to {site_access}, then merge
--     -> ERROR compliance_successor_drops_a_gate
--   correct a renewal's expires_on earlier, then merge
--     -> ERROR compliance_successor_not_later
--
-- compliance_successor_wrong_type and compliance_successor_undated are the
-- same shape (edit the successor's doc_type, or clear its date). All four now
-- take v_retiring, exactly as the two time-varying legs beside them do, and
-- for the same reason.
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
-- Every one of these six legs guards an ACT: pointing a paper at its renewal.
-- Re-running them over an unchanged edge adds nothing, because R-BF already
-- re-reckons at READ time every fact an ordinary member edit can move —
-- compliance_state()'s transitive walk drops a row from the count only while a
-- reachable successor is still IN FORCE, still carries the root's GATES and is
-- still the SAME PAPER, so a chain whose head has since lapsed, shed a gate or
-- been retyped is already counted against the card whatever the trigger said
-- when the edge was written.
--
-- The doc_type third of that sentence was ASPIRATIONAL until W3 round-8 B-1:
-- the reader carried the in-force and gates legs (r9/r10) and nothing
-- re-reckoned the paper, so retyping a renewal laundered the lapse it retired
-- and the card read `current` with no in-force certificate on file. The leg is
-- now in both reckonings (00623's compliance_state(), 00630's
-- compliance_document_state()), and the sentence above is measured rather than
-- assumed. The three legs NOT re-reckoned at read time judge the SHAPE of the
-- edge rather than the state of the successor — a successor dated when the row
-- is dated, dated no earlier than the row it retires, and standing at the head
-- of its own chain. Each is written by CHANGING superseded_by, which is exactly
-- what v_retiring names, and the one edit that would outrun the reader
-- (clearing a dated successor's date) is refused outright by
-- studio_compliance_documents_dated_expiry_check. The FOUR STRUCTURAL legs — holder
-- exists, holder kind, holder studio, and the successor being held for the
-- SAME CARD in the SAME studio — still run on every write, so the r1 MAJOR-4 /
-- r2 MAJOR-1 / r3 MAJOR-1 laundering doors stay shut: each of those is written
-- by CHANGING superseded_by, which is exactly what v_retiring names.
--
-- Grafted from 00623:293-471 verbatim — same signature, same SECURITY DEFINER
-- and search_path, same seven legs in the same order, every HINT byte for byte
-- — plus one boolean and six IF conditions. The trigger itself (00623) is not
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
    IF v_retiring AND v_succ_type IS DISTINCT FROM NEW.doc_type THEN
      RAISE EXCEPTION 'compliance_successor_wrong_type'
        USING HINT = 'A renewal is the same paper: superseded_by must name a '
                     'document of the same doc_type. A W-9 does not renew a '
                     'COI, and pointing one at the other would hide a lapse.';
    END IF;
    IF v_retiring
       AND v_succ_expires IS NOT NULL
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
    IF v_retiring AND NEW.expires_on IS NOT NULL AND v_succ_expires IS NULL THEN
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

    IF v_retiring AND NOT (NEW.blocks <@ v_succ_blocks) THEN
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
-- 4e. A POINTER AT A FOLDED FIRM IS NOT DRIFT THE EDITOR MAY REPAIR
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations review r7 M-2.
--
-- §5's sole-proprietor fold deliberately leaves the folded firm's CREW —
-- and, since r9 B-2, the SURVIVOR — pointing at the folded card: their
-- affiliations are CLOSED with `to_date` (the survivor's self-affiliation is
-- DELETEd) under `patina.suppress_affiliation_sync`, and the legacy
-- studio_contacts.company_id keeps naming the folded firm so
-- people_directory's company_name COALESCE still resolves the firm's name
-- (r6 M-3; R-BN — a merge never deletes a typed fact).
--
-- That leaves those rows in the one state sync_person_affiliation_from_pointer()
-- (00592, R-AI) reads as drift to repair: pointer set, ZERO open affiliations.
-- Its trigger is AFTER INSERT OR UPDATE OF company_id, and Postgres fires
-- `UPDATE OF col` whenever the column is NAMED in the SET list, changed or not
-- — which is every save of the shipped card editor
-- (use-studio-contacts.ts:202, :234, which writes the whole row). So the
-- function's ELSE branch opened a FRESH affiliation, from_date = CURRENT_DATE,
-- role and the three designations at their defaults.
--
-- Measured, on a folded sole proprietor's bookkeeper:
--
--   after the fold   role Bookkeeper · paperwork t · licence t · from 2021-01-01 · to <fold day>
--   one re-save      + role NULL · paperwork f · licence f · from <today> · to (null)   <- NEW OPEN ROW
--
-- person-profile.tsx prints the OPEN affiliation's role and "since", so one
-- ordinary card save turned "Bookkeeper, since 2021" into a bare "since 2026"
-- — r6 M-2's exact harm one act later, with no crew line on the surviving
-- PERSON card to put it back. The typed row survives as history, so this is a
-- reader disagreeing with the record rather than data loss.
--
-- The function already stands down for two older malformations it refuses to
-- mirror — a cross-studio pointer, and a pointer naming a person card or the
-- row itself. A pointer naming a card that was MERGED AWAY is a third, and it
-- is stated in the same place and the same shape. The pointer stands, as R-BN
-- requires; the editor simply stops re-deriving an affiliation the merge
-- deliberately closed.
--
-- Grafted from 00592:580-666 verbatim — same signature, same SECURITY DEFINER
-- and search_path, same branches in the same order, every comment byte for
-- byte — plus one disjunct and its note. It is re-issued HERE rather than
-- edited in 00592 because the disjunct reads studio_contacts.merged_into,
-- which section 1 of this file is the migration that adds: the 00592 body must
-- stay runnable on every write between the two files. The trigger itself
-- (00592) is not re-issued: it already fires on the same column.

CREATE OR REPLACE FUNCTION public.sync_person_affiliation_from_pointer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open     uuid;
  v_rederive boolean := false;
BEGIN
  IF NEW.entity_kind IS DISTINCT FROM 'person' THEN
    RETURN NULL;
  END IF;

  -- What the affiliations already say — the same pick the pointer trigger
  -- makes, so "they already agree" means the same thing on both sides.
  SELECT spa.company_id INTO v_open
    FROM public.studio_person_affiliations spa
   WHERE spa.person_id = NEW.id
     AND spa.to_date IS NULL
   ORDER BY spa.from_date DESC NULLS LAST, spa.created_at DESC
   LIMIT 1;

  IF v_open IS NOT DISTINCT FROM NEW.company_id THEN
    RETURN NULL;   -- nothing to bind; usually this is the pointer trigger's own write
  END IF;

  PERFORM set_config('patina.suppress_affiliation_sync', '1', true);

  IF NEW.company_id IS NULL THEN
    -- The designer cleared the firm: the affiliation THE POINTER NAMED ends
    -- today. Only that one (r5 M5-3, ruling R-AO) — a sibling the pointer was
    -- not naming is a standing fact about a different firm and is not the
    -- designer's to end from this card's firm field.
    --
    -- OLD.company_id NULL with an open affiliation standing is a pointer that
    -- had already drifted from the fact; nothing was named, so nothing closes
    -- and the re-derive below simply lets the pointer catch up.
    IF TG_OP = 'UPDATE' AND OLD.company_id IS NOT NULL THEN
      UPDATE public.studio_person_affiliations spa
         SET to_date = GREATEST(CURRENT_DATE, COALESCE(spa.from_date, CURRENT_DATE))
       WHERE spa.person_id = NEW.id
         AND spa.to_date IS NULL
         AND spa.company_id = OLD.company_id;
    END IF;
    -- A surviving sibling IS the person's open affiliation now, so the pointer
    -- is re-derived onto it rather than left NULL beside a standing fact.
    v_rederive := true;
  ELSIF public.studio_contact_org(NEW.company_id) IS DISTINCT FROM NEW.organization_id THEN
    -- A cross-studio pointer is left exactly as the backfill and the RLS
    -- WITH CHECK leave it: for a human. Opening the affiliation here would
    -- write a row the policy itself refuses.
    NULL;
  ELSIF NEW.company_id = NEW.id
     OR (SELECT sc.entity_kind FROM public.studio_contacts sc
          WHERE sc.id = NEW.company_id) IS DISTINCT FROM 'company'
     OR (SELECT sc.merged_into FROM public.studio_contacts sc
          WHERE sc.id = NEW.company_id) IS NOT NULL THEN
    -- 00417's studio_contacts_company_link_check permits the legacy pointer to
    -- name a person card, or the card itself. Opening the affiliation would
    -- raise out of assert_affiliation_card_kinds() and take the whole
    -- studio_contacts write down with it, so this half stands down for the
    -- same reason it stands down for a cross-studio pointer: the malformation
    -- is older than this file and is left visible, not mirrored.
    --
    -- A THIRD POINTER THIS FUNCTION MAY NOT MIRROR (00629, r7 M-2): one naming
    -- a card that was MERGED AWAY.
    NULL;
  ELSE
    -- Open the affiliation the pointer names, dated today so it outranks any
    -- NULL-dated row the fold left — and OPEN IT ONLY. Siblings stand (r5
    -- M5-3, ruling R-AO): the model is N persons x N firms (crm-model §1 E4),
    -- the sole proprietor who also crews for a GC holds two open affiliations,
    -- and this trigger fires on the column the SHIPPED card editor writes on
    -- every save (use-studio-contacts.ts:202, :234). Closing the others here
    -- meant a designer picking the other firm in today's editor silently ended
    -- a standing affiliation and struck the person off that firm's crew list
    -- (R-W). The pointer holds one — the most recently begun — and the room
    -- reads the affiliations for the rest.
    INSERT INTO public.studio_person_affiliations (person_id, company_id, from_date, to_date)
    VALUES (NEW.id, NEW.company_id, CURRENT_DATE, NULL)
    ON CONFLICT (person_id, company_id) WHERE to_date IS NULL DO NOTHING;
  END IF;

  PERFORM set_config('patina.suppress_affiliation_sync', '', true);

  -- Outside the suppression window on purpose: this is the ordinary pointer
  -- derivation, and its studio_contacts write re-enters this function only to
  -- find pointer and open affiliation already agreeing (the early return
  -- above), so it terminates in one hop.
  IF v_rederive THEN
    PERFORM public._sync_person_company_pointer(NEW.id);
  END IF;

  RETURN NULL;
END;
$$;

-- 00592's REVOKE is restated: a re-issued function keeps its ACL, and stating
-- it is cheaper than trusting that.
REVOKE ALL ON FUNCTION public.sync_person_affiliation_from_pointer()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_person_affiliation_from_pointer() IS
  'AFTER INSERT OR UPDATE OF company_id on studio_contacts: keeps the open '
  'studio_person_affiliations row in step with the legacy firm pointer '
  '(00592, R-AI/R-AO). Stands down for three pointers it may not mirror — '
  'cross-studio, naming a person card or the row itself, and naming a card '
  'that was MERGED AWAY (00629 r7 M-2, so the sole-proprietor fold''s closed '
  'crew affiliations are not re-derived by the next ordinary card save).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4f. identity_paper_state RESOLVES ITS TWO HOLDERS FORWARD
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations review r10 BLOCKING-1.
--
-- §5's sole-proprietor fold moves every compliance document off the folded
-- FIRM onto the surviving person — correctly, the firm IS the person — and
-- §4e above keeps the folded firm's CREW pointing at the folded card: their
-- affiliations close with `to_date` and their legacy
-- studio_contacts.company_id goes on naming it, so their Directory row keeps
-- printing the firm's NAME (r6 M-3, R-BN: a merge never deletes a typed fact).
--
-- Nothing resolved that pointer forward for PAPER. identity_paper_state(card,
-- firm) (00626:949) asks compliance_state() of exactly the two ids it is
-- handed, and the folded firm now holds nothing — so every OTHER human on that
-- crew read their firm's certificate as `not_on_file`.
--
-- Measured on a fresh reset, rolled back
-- (artifacts/…/build/probe52-r10-soleprop-crew-seat.sql): a firm `coi_gl`
-- lapsed 2026-03-31 gating {site_access, payment, draw}; the fold took Joe
-- Crew's people_directory row from `lapsed` to `not_on_file` and his
-- people_directory_seats line with it, while both went on printing `Northgate
-- Probe Electric`. One row, two disagreeing facts, about the certificate that
-- decides whether a body gets on site: PR-h's own stated failure mode ("a
-- designer mobilises an uninsured sub from the Call Sheet"), SPEC §5.4 #7's
-- held clause gone, and `Not on file` printed over a firm that filed and
-- lapsed — the inversion R-K / C13 exists to prevent.
--
-- THE POINTER STANDS (R-BN), SO THE RESOLUTION BELONGS IN THE READER — and in
-- the ONE reader rather than its three call sites (§6's CONTACTS branch, the
-- party branch beside it, and people_directory_seats' COALESCE(seat's firm,
-- card's firm) at 00626:2169), because R-BA is "one formula serves every
-- reader" and three copies is three places for it to drift.
--
-- COALESCE(resolve_merged_contact(id), id), not the bare call: §3 is SECURITY
-- INVOKER and answers NULL for a card the caller may not read, and a holder
-- that cannot be resolved must fall back to the id it was handed rather than
-- drop out of the reduction. A live id resolves to itself, so every unmerged
-- call returns exactly today's answer.
--
-- The seat half needs no second rule. §5 nulls project_parties.company_id for
-- every seat naming the folded firm — not only the proprietor's own — because
-- party_company_not_a_company (00624) refuses a PERSON card in that column and
-- the survivor is a person; 00626's COALESCE then falls back to the crew
-- card's own pointer, which is the folded firm, which this function now
-- resolves. The seat's company_name snapshot is untouched, so the Call Sheet
-- row goes on printing the firm's name beside the word.
--
-- Grafted from 00626:949-972, the latest body
-- (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*identity_paper_state"` answers
-- 00626 alone). The worst-first order, the de-duplication leg, the ACL and the
-- search_path pin are 00626's; only the two ids handed to compliance_state()
-- changed.
CREATE OR REPLACE FUNCTION public.identity_paper_state(
  p_card_id    uuid,
  p_company_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH holder AS (
    SELECT COALESCE(public.resolve_merged_contact(p_card_id), p_card_id)
             AS card_id,
           COALESCE(public.resolve_merged_contact(p_company_id), p_company_id)
             AS company_id
  ),
  words AS (
    SELECT public.compliance_state(h.card_id) AS w
      FROM holder h
     WHERE h.card_id IS NOT NULL
    UNION ALL
    SELECT public.compliance_state(h.company_id) AS w
      FROM holder h
     WHERE h.company_id IS NOT NULL
       AND h.company_id IS DISTINCT FROM h.card_id
  )
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM words WHERE w = 'lapsed')      THEN 'lapsed'
           WHEN EXISTS (SELECT 1 FROM words WHERE w = 'lapses_soon') THEN 'lapses_soon'
           WHEN EXISTS (SELECT 1 FROM words WHERE w = 'current')     THEN 'current'
           ELSE 'not_on_file'
         END;
$$;

-- 00626's ACL is restated: a re-issued function keeps it, and stating it is
-- cheaper than trusting that.
REVOKE ALL ON FUNCTION public.identity_paper_state(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_paper_state(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_paper_state(uuid, uuid) IS
  'direction §3.8''s paper word for one IDENTITY rather than for one holder '
  'card: compliance_state() over the person''s OWN card and over their firm, '
  'reduced worst-first — lapsed, else lapses_soon, else current, else '
  'not_on_file when neither holder has any paper at all, because no paper is a '
  'different fact from a lapse (C21/R-K) and a person holding nothing '
  'personally must not drag their firm''s word down (00626, R-BA). BOTH ids '
  'are resolved through resolve_merged_contact() first, so a crew member whose '
  'legacy pointer still names a firm that was folded into its sole proprietor '
  '— the state §4e and R-BN deliberately leave them in — reads the paper that '
  'moved with the fold instead of not_on_file (00629 r10 BLOCKING-1). '
  'Unmerged ids resolve to themselves; an id the caller may not read falls '
  'back to itself rather than dropping out of the reduction.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4g. A MERGE IS NOT A TOUCH ON THE JOB (r13 MAJOR-2)
-- ═══════════════════════════════════════════════════════════════════════════
-- project_parties.updated_at is not bookkeeping on this table. It is the
-- tie-break people_directory's PARTY branch ranks one uncarded identity's
-- seats by (§6 below, ORDER BY pp.updated_at DESC), the same order
-- people_directory_seats' first_value(pp.id) window names person_id from
-- (00626, R-BG), and the column last_touch_at prints on a Directory row.
--
-- §"seats" in the RPC below repoints three columns across every seat naming
-- the folded card, and set_updated_at_project_parties (00212) is armed for
-- all of them. On an ORDINARY firm-duplicate fold — crm-model §4 rule 4's
-- "saved twice, one firm", the act direction §3.1's duplicate band exists
-- for — that moved an UNCARDED human's Directory row off her live job onto a
-- closed one and printed the merge instant as the day the studio last touched
-- her (measured on a fresh reset, rolled back, with the trigger DISABLED as
-- the negative control: r13 probe D / D2).
--
-- 00624, 00626 and 00631 each bracket their ONE backfill statement with
-- ALTER TABLE … DISABLE TRIGGER. The RPC may not: ALTER TABLE takes ACCESS
-- EXCLUSIVE on project_parties and holds it to COMMIT, so a studio folding
-- two cards would lock the table against every other reader and writer for
-- the whole merge — a worse trade than the defect. So the trigger learns to
-- stand down instead, exactly as sync_studio_contact_company_pointer() stands
-- down under patina.suppress_affiliation_sync (00592, the idiom this file
-- already uses twice): a transaction-local GUC the RPC sets around its seat
-- block and clears immediately after.
--
-- The TRIGGER NAME is unchanged, so 00624:806/819, 00626:580/591 and
-- 00631:335/404's bracketing still names the same object.
CREATE OR REPLACE FUNCTION public.project_parties_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('patina.suppress_party_touch', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.project_parties_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.project_parties_touch_updated_at() IS
  'BEFORE UPDATE on project_parties: stamps updated_at, the column '
  'people_directory and people_directory_seats rank one identity''s seats by '
  'and last_touch_at prints. Stands down while patina.suppress_party_touch is '
  '''1'' — set transaction-locally by merge_studio_contacts() around its seat '
  'repoints, because folding two duplicate cards is not a touch on anybody''s '
  'job and moved an uncarded human''s Directory row onto a closed one '
  '(00629 r13 MAJOR-2). Replaces update_updated_at_column() on this table '
  'only; the trigger keeps its 00212 name so the three backfills that bracket '
  'it by name still do.';

DROP TRIGGER IF EXISTS set_updated_at_project_parties ON public.project_parties;
CREATE TRIGGER set_updated_at_project_parties
  BEFORE UPDATE ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.project_parties_touch_updated_at();

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
  -- The job a seat repoint cannot be checked against (r11 MAJOR-2).
  v_studioless    text;
  -- The job whose seat carries a card of ANOTHER studio (r13 MAJOR-1).
  v_other_studio  text;
  -- The job where BOTH cards already hold an open seat of the same kind
  -- (r18 MAJOR-1). Two columns, because the refusal names the job AND the
  -- kind: "sub on the Okonkwo residence" is the whole of what the studio has
  -- to go and close.
  v_collision_job  text;
  v_collision_kind text;
  -- The job where the two seats of one kind would BOTH still state a live
  -- grant after the fold, though at least one of them has left the job
  -- (r22 MAJOR-1). Same two columns, same reason — plus WHICH of the two
  -- cards holds the seat that left, because r23 MAJOR-1 measured that the
  -- repair is that seat's and no other, so a sentence that cannot point at it
  -- sends the studio to the wrong one.
  v_money_job      text;
  v_money_kind     text;
  v_money_side     text;
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

  -- ── THE CARD BEING KEPT MAY NOT BE ONE THE STUDIO PUT AWAY (r5 M-4) ─────
  -- archived_at and merged_into are two different absences and the RPC read
  -- only one of them. PR-o pre-picks the OLDER card, which is exactly the card
  -- a studio archives, and directoryDuplicatePairs() buckets an archived row
  -- beside a live one — so the room's own pre-pick walked the studio into
  -- folding a live identity onto a put-away card. Measured: the merge was
  -- permitted, the survivor stayed archived, and every channel, document,
  -- seat, designation, agreement token and login landed on a card
  -- useStudioContacts(..., { includeArchived: false }) does not return —
  -- which is what directory-view.tsx reads for a firm's payee-marker signer
  -- and for a routed rule's email and office phone.
  --
  -- Refused by name rather than restored silently: restore_studio_contact()
  -- is the studio's own act, it is one press away on the card, and a merge
  -- may not undo a putting-away nobody asked it to undo. The MERGED card's
  -- archived_at is deliberately not read — folding a put-away duplicate into
  -- a live card is the ordinary tidy, and it is what this room is for.
  IF v_survivor.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'merge_survivor_archived'
      USING HINT = 'The card you chose to keep has been put away. Put it back '
                   'on the shelf first, or keep the other card instead.';
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

  -- ── A RECORDED REFUSAL MAY NOT VANISH IN A MERGE (r4 B-2, WIDENED r5 M-2)
  --
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
  --
  -- r5 M-2 — THE TEST IS SUBSUMPTION, NOT HARD-BLOCKEDNESS. r4 stated the gate
  -- as contact_rule_blocks_contact(), which is R-BL's formula, and R-BL rules
  -- what earns a terracotta leading rule on a face — it does not rule that a
  -- ONE-CHANNEL refusal may be dropped. Measured: a survivor allowing
  -- {email,mobile} absorbed a duplicate forbidding {sms,mobile} with the
  -- reason "Never text. Never ring the mobile."; the merge was permitted,
  -- contact_rule_summary() on the survivor read "Use: email, mobile.", and
  -- the refusal sat on a card people_directory emits no row for. The room
  -- then affirmatively told the studio to ring the mobile of a human the
  -- studio recorded as never-ring-the-mobile. F-27 Ray Thao and F-11 Dana
  -- Kowalski are the fixture rows this reaches.
  --
  -- So the gate is now: does the SURVIVOR's rule already say everything the
  -- absorbed card's rule says? Two legs, both about facts that vanish:
  --
  --   * every channel the absorbed rule forbids is forbidden by the
  --     survivor's too (channels_forbidden <@), and
  --   * a route the absorbed rule names is the same route the survivor's
  --     rule names — "write Rosa instead" is not carried by a survivor that
  --     merely forbids everything and says nothing about Rosa.
  --
  -- channels_ALLOWED is deliberately not in the test: an allowance the
  -- survivor lacks closes nothing, and contact_rule_summary() reduces
  -- worst-first over what is forbidden. Same refusal token and same sentence
  -- r4 already ships, because the studio's act is the same one: settle the
  -- rule on the card you are keeping, then merge.
  SELECT * INTO v_merged_rule
    FROM public.studio_contact_rules r
   WHERE r.subject_type = v_merged.entity_kind AND r.subject_id = p_merged;
  SELECT * INTO v_survivor_rule
    FROM public.studio_contact_rules r
   WHERE r.subject_type = v_survivor.entity_kind AND r.subject_id = p_survivor;

  --
  -- r6 M-1 — A ROUTE AT THE SURVIVOR IS SUBSUMED BY THE FOLD ITSELF.
  -- "This card is the old one — write the other one instead" is the single
  -- most natural thing a studio records about a duplicate it has not yet
  -- merged, and the gate above called it a conflict: the room refused the
  -- merge, named the repair ("settle one rule on the card you are keeping"),
  -- and assert_studio_contact_rule_route() then refused that repair by name
  -- (rule_route_is_self) because the route would point the survivor at
  -- itself. A closed loop with no act in the room that could merge the pair.
  -- The route is not lost by merging — it is ANSWERED by it: after the fold
  -- the two cards are one, so "write the survivor instead" is satisfied, and
  -- the repoint below drops the route rather than writing a self-route.
  IF v_merged_rule.id IS NOT NULL
     AND v_survivor_rule.id IS NOT NULL
     AND NOT (
       COALESCE(v_merged_rule.channels_forbidden, '{}'::text[])
         <@ COALESCE(v_survivor_rule.channels_forbidden, '{}'::text[])
       AND (v_merged_rule.route_to_person_id IS NULL
            OR v_merged_rule.route_to_person_id = p_survivor
            OR v_survivor_rule.route_to_person_id
                 IS NOT DISTINCT FROM v_merged_rule.route_to_person_id)
     ) THEN
    RAISE EXCEPTION 'merge_contact_rule_conflict'
      USING HINT = 'The card being folded in says contact is blocked or '
                   'routed elsewhere, and the card you are keeping says '
                   'something else. Settle one rule on the card you are '
                   'keeping, then merge.';
  END IF;

  -- ── A SEAT ON A JOB THAT RECORDS NO STUDIO (r11 MAJOR-2) ────────────────
  -- §"seats" below repoints studio_contact_id, and the v_cross / company
  -- branches move company_id and warranty_contact_person_id — every one of
  -- them a column in assert_project_party_cards_trg's list. That guard's own
  -- R-BD leg refuses the write outright while project_tenant_org() answers
  -- NULL (00624), so ONE seat on a studio-less job aborted the whole merge
  -- mid-transaction with the raw token party_card_project_has_no_studio on
  -- the merge sheet — a schema word on a face (SPEC §7, §5.7 #8), naming no
  -- act, over a pair the room could then never fold: the duplicate band goes
  -- on offering "Compare them?" and nothing in the People room stamps a
  -- project's studio_id. The population is R-BI's legacy rows (a stamped seat
  -- on a studio_id IS NULL project), 0 locally and counted on Strata by
  -- 00628's NOTICE before the chain.
  --
  -- Refused BY NAME and BEFORE the first write, the way merge_survivor_
  -- archived and merge_two_logins are, with the job named in DETAIL so the
  -- sheet can say which one.
  --
  -- ONE PREDICATE PER COLUMN, BECAUSE THE GUARD RAISES FROM TWO LEGS
  -- (r12 MAJOR-2). r11's pre-check asked project_tenant_org() alone, which is
  -- only the FIRST of assert_project_party_cards()' two doors to
  -- party_card_project_has_no_studio (00624):
  --
  --   leg 1  v_org      := project_tenant_org(NEW.project_id) IS NULL
  --          — reached whenever ANY of the three card columns is non-NULL;
  --   leg 2  v_recorded := project_recorded_studio(NEW.project_id) IS NULL
  --          — reached whenever NEW.studio_contact_id IS NOT NULL ("THE
  --            RECORD, NOT THE WRITER", w1b r11 MAJOR-3).
  --
  -- project_tenant_org() is COALESCE(p.studio_id, the CALLER's own shared-studio
  -- membership); project_recorded_studio() is p.studio_id and nothing else. On
  -- R-BI's legacy population the two disagree for every caller who shares an
  -- active design studio with the job's designer_id / lead_designer_id /
  -- created_by — the ordinary studio member folding duplicates in their own
  -- room, which is the COMMONER half of the population. r11's pre-check found
  -- no row there, the seat repoint at §"seats" fired the trigger, and leg 2
  -- raised the raw schema token onto the merge sheet after all (measured twice
  -- on a fresh reset, rolled back).
  --
  -- So each matched column asks the question the leg that will judge IT asks.
  -- The trigger is BEFORE INSERT OR UPDATE OF company_id,
  -- warranty_contact_person_id, studio_contact_id, project_id and its body
  -- reads NEW.studio_contact_id regardless of which column moved — so a seat
  -- repointed only on company_id / warranty_contact_person_id still takes leg 2
  -- when it ALREADY carries a card in studio_contact_id. That is the third
  -- conjunct below, not a widening: a studio-less seat with no card stamped on
  -- it repoints its firm pointer perfectly well, and refusing it would cost the
  -- room a fold it can make.
  SELECT pj.name INTO v_studioless
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
   WHERE (
           (pp.studio_contact_id = p_merged
            AND (public.project_tenant_org(pp.project_id) IS NULL
                 OR public.project_recorded_studio(pp.project_id) IS NULL))
        OR ((pp.company_id = p_merged
             OR pp.warranty_contact_person_id = p_merged)
            AND (public.project_tenant_org(pp.project_id) IS NULL
                 OR (pp.studio_contact_id IS NOT NULL
                     AND public.project_recorded_studio(pp.project_id) IS NULL)))
         )
   ORDER BY pj.name, pj.id
   LIMIT 1;
  IF v_studioless IS NOT NULL THEN
    RAISE EXCEPTION 'merge_seat_on_studioless_project'
      USING DETAIL = v_studioless,
            HINT   = 'One of these cards holds a seat on a job that records '
                     'no studio, so the seat cannot be moved. Record that '
                     'job''s studio first, then merge.';
  END IF;

  -- ── A SEAT STAMPED WITH A CARD OF ANOTHER STUDIO (r13 MAJOR-1) ──────────
  -- assert_project_party_cards() has a THIRD door, and the pre-check above
  -- reaches neither of the shapes behind it. Both resolvers answer non-NULL
  -- and simply name a studio the card is not in:
  --
  --   party_studio_contact_other_studio    the identity key's card is not in
  --                                        BOTH project_tenant_org() and
  --                                        project_recorded_studio()
  --   party_company_other_studio           the firm pointer's card is not in
  --                                        project_tenant_org()
  --   party_warranty_contact_other_studio  the warranty pointer's, likewise
  --
  -- The population is the legacy shape §8's own comment records as existing on
  -- the table and unmeasured on Strata (00624:724-739's preflight): a seat
  -- carrying a card of another studio, which 00624's guard refuses on every
  -- write from this wave onward but cannot undo on rows already there.
  -- Folding that card's duplicate re-writes the seat, the guard judges the
  -- WHOLE row, and the merge aborted mid-transaction with the raw token in the
  -- merge sheet's role="alert" paragraph — a schema word on a face (SPEC §7,
  -- §5.7 #8) naming no act, over a pair the room could then never fold.
  -- Measured on a fresh reset and rolled back (r13 probe A).
  --
  -- ONLY THE SEATS THE MERGE ACTUALLY WRITES, which is 11k's rule: the three
  -- repoints at §"seats" are branch-dependent — a person survivor never moves
  -- a seat's company_id, a company survivor never moves its warranty pointer —
  -- and a row nothing writes fires no trigger. Refusing over a row the merge
  -- would leave alone costs the room a fold it can make.
  --
  -- THE EFFECTIVE POINTERS, not today's: the trigger reads all three card
  -- columns of NEW whichever one moved, so a seat repointed on its firm alone
  -- is still refused over the foreign card already stamped in
  -- studio_contact_id. The three legs below are the guard's own three tests,
  -- stated in the same order and against the same resolvers.
  SELECT pj.name INTO v_other_studio
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
    CROSS JOIN LATERAL (
      SELECT public.project_tenant_org(pp.project_id)      AS tenant,
             public.project_recorded_studio(pp.project_id) AS recorded
    ) r
    CROSS JOIN LATERAL (
      SELECT
        CASE WHEN pp.studio_contact_id = p_merged
             THEN p_survivor ELSE pp.studio_contact_id END AS card,
        CASE WHEN pp.company_id = p_merged AND v_cross THEN NULL
             WHEN pp.company_id = p_merged
                  AND v_survivor.entity_kind = 'company' THEN p_survivor
             ELSE pp.company_id END AS firm,
        CASE WHEN pp.warranty_contact_person_id = p_merged
                  AND (v_cross OR v_survivor.entity_kind = 'person')
             THEN p_survivor
             ELSE pp.warranty_contact_person_id END AS warranty
    ) e
   WHERE (
           pp.studio_contact_id = p_merged
        OR (pp.company_id = p_merged
            AND (v_cross OR v_survivor.entity_kind = 'company'))
        OR (pp.warranty_contact_person_id = p_merged
            AND (v_cross OR v_survivor.entity_kind = 'person'))
         )
     -- the NULL-resolver doors are the pre-check above's job, by name
     AND r.tenant IS NOT NULL
     AND (
          (e.card IS NOT NULL AND r.recorded IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.studio_contacts sc
                            WHERE sc.id = e.card
                              AND sc.organization_id = r.tenant
                              AND sc.organization_id = r.recorded))
       OR (e.firm IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.studio_contacts sc
                            WHERE sc.id = e.firm
                              AND sc.organization_id = r.tenant))
       OR (e.warranty IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.studio_contacts sc
                            WHERE sc.id = e.warranty
                              AND sc.organization_id = r.tenant))
         )
   ORDER BY pj.name, pj.id
   LIMIT 1;
  IF v_other_studio IS NOT NULL THEN
    RAISE EXCEPTION 'merge_seat_card_other_studio'
      USING DETAIL = v_other_studio,
            HINT   = 'One of these cards holds a seat on a job in another '
                     'studio''s book, so the seat cannot be moved. Ask that '
                     'studio to take the card off the seat, then merge.';
  END IF;

  -- ── BOTH CARDS ALREADY SEATED, SAME KIND, SAME JOB (r18 MAJOR-1) ────────
  -- The seat repoint at §"seats" below is one unconditional statement, and
  -- project_parties carries no uniqueness on
  -- (project_id, studio_contact_id, party_kind) — read from pg_constraint.
  -- So where the same human was seated on ONE job under BOTH cards, the fold
  -- did not converge them: it produced two live seats of the same kind
  -- stamped with one card. identity_seat_count() then said 2 and
  -- people_directory_seats nested two lines for one job and one party_kind.
  --
  -- A DUPLICATED ROW WOULD BE COSMETIC. THE COLUMN 00632 WRITES ONTO IT IS
  -- NOT. Each seat carries its own project_party_authority grant, and the two
  -- doors that open one write different figures from different sources:
  -- R-J's "Confirm from the agreement" (source_clause 'agreement §4') and
  -- add_household_member()'s household figure
  -- (source_clause 'client_households.co_threshold_cents'). Measured on a
  -- fresh reset and rolled back (probe-r18-e): $10,000 on one seat, $2,500 on
  -- the other, both open after the fold, and the Call Sheet's Client side
  -- bands client / client_rep BEFORE the window rule is consulted (00632's
  -- own note), so it prints the same human twice — "Signs money to $2,500."
  -- beside "Signs money to $10,000." — one screen, two contradictory facts
  -- about money, over a record that had just told the studio these are ONE
  -- human. It does not converge afterwards either: set_household_threshold()
  -- correctly moves only the grant it sourced (R-BQ), so raising the figure
  -- widens the gap.
  --
  -- REFUSED BY NAME AND BEFORE THE FIRST WRITE, the sixth refusal in this
  -- file's own posture (merge_survivor_archived, merge_two_logins,
  -- merge_contact_rule_conflict, merge_seat_on_studioless_project,
  -- merge_seat_card_other_studio) and for the same reason as all five: a
  -- state the merge cannot resolve FOR the studio. It cannot be resolved
  -- here because choosing which of the two money grants survives is the
  -- principal's ruling (PR-n), not a repoint's, and R-BN forbids dropping the
  -- other. The repair is already in the room and is named in the HINT —
  -- "Close this seat" on one of the two (useCloseProjectPartySeat) — and
  -- closing one lifts this gate, because the predicate asks only about OPEN
  -- seats. It is the ONE act the room has: r23 MAJOR-1 measured that ending a
  -- grant by hand has no door at all (useSetPartyAuthority is called only from
  -- add-person-sheet.tsx and nothing passes effectiveTo; the People room's
  -- Revoke is the field-link rail, a different table), so no sentence here may
  -- name one.
  --
  -- OPEN SEATS ONLY (off_job_at IS NULL, 00632's own open-seat filter, the
  -- room's "Close this seat" record). A closed seat beside a live one of the
  -- same kind states no second money fact — its grant was ended at the close
  -- — and refusing over a row the studio has already retired would cost the
  -- room a fold it can make, and would name a repair that had already been
  -- taken.
  --
  -- r19 MAJOR-1 — "ITS GRANT WAS ENDED AT THE CLOSE" IS A RULE 00634 MAKES,
  -- and until 00634 nothing did. `useCloseProjectPartySeat` writes `stage`,
  -- `off_job_at` and `off_job_reason` and nothing else, so the repair this
  -- refusal's own HINT names left the closed seat's money grant OPEN, the fold
  -- then went through, and the survivor came out holding two client_rep seats
  -- on one job with two open money grants at two different figures — the exact
  -- state the paragraph above describes, reached by following the refusal's
  -- own instruction. `end_party_authority_at_seat_close_trg` (00634) ends every
  -- open grant on the day the seat closes, GREATEST(effective_from,
  -- off_job_at), which is 00632:713-716's own formula. The carve-out stands as
  -- written BECAUSE of that trigger; do not widen this predicate without
  -- reading it.
  --
  -- r22 MAJOR-1 — AND THE TRIGGER NO LONGER FIRES ON EVERY DATED SEAT, so the
  -- premise is asked DIRECTLY, in the second gate below. R-BS clamped 00634
  -- off the withdrawal path ("a seat dated by a recorded withdrawal keeps its
  -- open grants until the principal closes the seat", 00634:91-99), which is
  -- the right rule about a bidder's act — and it makes `off_job_at IS NOT NULL`
  -- stop meaning "its grant was ended at the close". The paragraph above is
  -- still true of the HAND close and false of a withdrawal, so this predicate
  -- is left exactly as it was and a SECOND one asks the money question the
  -- paragraph is actually arguing about. Measured (probe-r22-a): one press of
  -- "They withdrew" in the Bidding band dated one of two open `sub` seats, the
  -- fold then LANDED, and the survivor came out holding both seats on one job
  -- with BOTH money grants open at $2,500 and $10,000 — r18 MAJOR-1's and
  -- r19 MAJOR-1's harm statement word for word, through a door neither gate
  -- could see.
  SELECT pj.name, pm.party_kind
    INTO v_collision_job, v_collision_kind
    FROM public.project_parties pm
    JOIN public.project_parties ps
      ON ps.project_id = pm.project_id
     AND ps.party_kind = pm.party_kind
     AND ps.studio_contact_id = p_survivor
     AND ps.off_job_at IS NULL
    JOIN public.projects pj ON pj.id = pm.project_id
   WHERE pm.studio_contact_id = p_merged
     AND pm.off_job_at IS NULL
   ORDER BY pj.name, pj.id, pm.party_kind
   LIMIT 1;
  IF v_collision_job IS NOT NULL THEN
    RAISE EXCEPTION 'merge_seat_collision'
      USING DETAIL = v_collision_job || ' · ' || v_collision_kind,
            HINT   = 'Both cards hold an open seat of the same kind on the '
                     'same job, and one person cannot hold the job twice. '
                     'Close one of these two seats first, then merge.';
  END IF;

  -- ── AND THE SAME QUESTION ASKED OF THE GRANT (r22 MAJOR-1) ──────────────
  -- The gate above asks whether the seat is OPEN. The paragraph that justifies
  -- it asks whether the seat still states a live money fact, and those were
  -- the same question only while `off_job_at IS NOT NULL` implied "its grant
  -- was ended at the close". R-BS ended that: a seat dated by a recorded
  -- withdrawal keeps its open grants, by design, because a withdrawal is the
  -- bidder's act on the record and ending a delegation is the principal's
  -- (PR-n). So this gate asks the premise itself — a seat is still LIVE here
  -- if it has not left the job OR if it still carries an open grant — and
  -- refuses the pair that would leave one human holding two live delegations
  -- of one kind on one job. It is a strict superset of the gate above, which
  -- is left untouched so that the plainer shape keeps the plainer sentence.
  --
  -- EVERY SCOPE, not money alone, which is 00634's own reach ("every open
  -- grant the seat carried — every scope, not money alone"). Two live
  -- delegations of one kind for one human on one job is the contradiction,
  -- whatever they delegate; money is only where it is loudest, because
  -- `authorityPhrase` prints a present-tense figure per seat and
  -- `use-project-authority.ts:73-74` deliberately KEEPS a grant still open on
  -- a closed seat, "because that is a state the room should show rather than
  -- hide" — so both figures reach the Call Sheet.
  --
  -- OF THE THREE SHAPES THE REVIEW LEFT OPEN this is the first: ask the
  -- collision predicate about the grant. Not the second (widen 00634's clamp
  -- to end grants on a withdrawal) — R-BS rules that trigger to the hand-close
  -- act and the room has no named re-open act to pair with it. Not the third
  -- alone (name the collision on the face after the fold) — R-BN forbids
  -- dropping a typed fact and the fold would already have happened.
  --
  -- THE REPAIR IS STILL THE ROOM'S OWN, AND IT IS THE SEAT THAT LEFT THE JOB
  -- (r23 MAJOR-1). The first draft of this refusal named the other one —
  -- "Close the seat that is still open" — and that sentence was measured, end
  -- to end on a freshly reset database with room acts only, to be both
  -- destructive and ineffective for the shape this gate actually catches.
  -- That shape is ASYMMETRIC: the pair reaching here can never be two OPEN
  -- seats, because the gate above (`merge_seat_collision`) is that same join
  -- with `off_job_at IS NULL` on both legs and it raises FIRST. So at least
  -- one of the two has left the job, and a seat that has left qualifies here
  -- only through an OPEN GRANT — which is the standing grant the refusal is
  -- about. Closing the live crew seat ends what THAT seat carried (00634),
  -- lifts the gate, takes a working sub off the job, and leaves the survivor
  -- holding no live seat while still signing on the seat that left.
  --
  -- The act that repairs the state named is the one the HINT's second sentence
  -- used to scope to "where both seats have already left the job": the Bidding
  -- band's own correction puts the DATED seat back (R-BR clears `off_job_at`
  -- and `off_job_reason`), and "Close this seat" then fires 00634 and ends
  -- what it carried. It is the same act whether one seat has left or both —
  -- repairing either one leaves a single live delegation on the job — so the
  -- sentence names it once, and names WHICH card holds the seat to take it on
  -- (`v_money_side`, carried in the DETAIL), because the studio is looking at
  -- two cards and cannot otherwise tell them apart.
  --
  -- A dated seat here always carries the open grant (it qualifies no other
  -- way), so 'merged' / 'survivor' / 'both' is a complete answer.
  SELECT pj.name, pm.party_kind,
         CASE
           WHEN pm.off_job_at IS NOT NULL AND ps.off_job_at IS NOT NULL THEN 'both'
           WHEN pm.off_job_at IS NOT NULL THEN 'merged'
           ELSE 'survivor'
         END
    INTO v_money_job, v_money_kind, v_money_side
    FROM public.project_parties pm
    JOIN public.project_parties ps
      ON ps.project_id = pm.project_id
     AND ps.party_kind = pm.party_kind
     AND ps.studio_contact_id = p_survivor
     AND (ps.off_job_at IS NULL
          OR EXISTS (SELECT 1 FROM public.project_party_authority pa
                      WHERE pa.engagement_id = ps.id
                        AND pa.effective_to IS NULL))
    JOIN public.projects pj ON pj.id = pm.project_id
   WHERE pm.studio_contact_id = p_merged
     AND (pm.off_job_at IS NULL
          OR EXISTS (SELECT 1 FROM public.project_party_authority pa
                      WHERE pa.engagement_id = pm.id
                        AND pa.effective_to IS NULL))
   ORDER BY pj.name, pj.id, pm.party_kind
   LIMIT 1;
  IF v_money_job IS NOT NULL THEN
    RAISE EXCEPTION 'merge_seat_authority_collision'
      USING DETAIL = v_money_job || ' · ' || v_money_kind || ' · ' || v_money_side,
            HINT   = CASE WHEN v_money_side = 'both'
                     THEN 'Both of these two seats have left the job and both '
                          'still carry a standing grant, so the fold would '
                          'leave one person holding two of them on the same '
                          'job. Put one of them back in the bidding, then '
                          'close it by hand — closing a seat ends what it '
                          'carried — and merge.'
                     ELSE 'One of these two seats has left the job but still '
                          'carries a standing grant, so the fold would leave '
                          'one person holding two of them on the same job. '
                          'Put THAT seat back in the bidding, then close it by '
                          'hand — closing a seat ends what it carried — and '
                          'merge. Closing the seat that is still open ends '
                          'only what that one carried and leaves the standing '
                          'grant standing.'
                     END;
  END IF;

  -- ── channels: union, duplicates by kind + value REDUCED then dropped ────
  --
  -- r6 B-1 / r14 B-1 — A DUPLICATE ROW IS A DUPLICATE ADDRESS PLUS SEVEN
  -- TYPED FACTS. The union used to open with a blind DELETE of the absorbed
  -- card's row wherever (channel_kind, value) matched the survivor's. "Exact
  -- duplicate" is true of the VALUE and of nothing else on that row:
  -- studio_contact_channels also carries status, status_at, verified,
  -- verified_at, preferred, label and sms_capable, every one of them typed by
  -- the studio through the Reach editor's own acts (save-channel-status and
  -- "This line takes texts"), and all seven were destroyed — not stranded on
  -- an unreachable card, gone from the table.
  --
  -- r14 B-1 named the seventh, which r6's own fix left out: sms_capable is
  -- NOT NULL boolean and is not derivable from the row — channel_kind is
  -- 'mobile' on a backfilled card whether or not the number is a cell, and
  -- 00593's banner says it "STAYS AT ITS false DEFAULT UNLESS THERE IS
  -- EVIDENCE". W2 gave it its one writer, the "This line takes texts" act
  -- (reach-access.tsx -> useUpdateStudioContactChannel). Losing it flipped
  -- the survivor's Reach row back to "Patina has not been told this line
  -- takes texts, so nothing about texting can be written down on it yet."
  -- over a line the studio had confirmed, and took the whole consent-recording
  -- band with it — including PR-m's manual opt-out, which R-AY makes the only
  -- place a verbal STOP can live.
  --
  -- It fired on the commonest merge there is. crm-model §4 rules 2 and 3
  -- match on a shared phone or a shared email and direction §3.1's duplicate
  -- band is literally "These two cards share a phone.", so both cards carry a
  -- row with the same (kind, value) BY CONSTRUCTION; PR-o then pre-picks the
  -- OLDER, blanker card. Measured: a survivor reading `active` absorbed a row
  -- reading `unsubscribed 2025-12-03`, verified, preferred, label "Shop
  -- address"; afterwards the survivor read active / unverified / not
  -- preferred / no label and NOTHING was left on the folded card.
  -- heldChannelReason() had printed "They unsubscribed, 3 December 2025.
  -- Calls still reach them." with direction §5.4's held treatment; after the
  -- merge `held` was false and the Reach region offered the address as live.
  -- A recorded refusal vanishing in a merge is the class r4 B-2 and r5 M-2
  -- closed one table over — this is the same harm on the one refusal the
  -- email rail reads in P3.
  --
  -- So the row REDUCES onto the survivor before it goes (R-BN), the posture
  -- compliance_state() and identity_paper_state() already take for paper:
  --
  --   * status WORST-FIRST, carrying its own status_at. The ranking is
  --     unsubscribed > dead > bounced > active: a recorded refusal outranks
  --     every technical failure because the cost of a missed refusal is a
  --     compliance violation and the cost of a missed bounce is a bounce
  --     (C30). status_at travels with the status that wins — a held date
  --     belonging to some other verdict is a worse fact than no date.
  --   * verified, preferred and sms_capable are OR'd; verified_at follows
  --     the verified that wins, as the verdict/date pair above does.
  --     sms_capable takes the same shape as preferred and for the same
  --     reason: one card was told the line takes texts, so the studio's book
  --     was told, and a fold may not unlearn it.
  --   * label COALESCEs, the survivor's own words first, like every other
  --     scalar this RPC carries.
  --
  -- idx_studio_contact_channels_owner_kind_value is UNIQUE on
  -- (owner_id, channel_kind, value), so at most one absorbed row answers each
  -- surviving row and the correlated subquery below cannot be ambiguous.
  UPDATE public.studio_contact_channels s
     SET status      = CASE WHEN u.merged_rank > u.survivor_rank
                            THEN u.merged_status ELSE s.status END,
         status_at   = CASE WHEN u.merged_rank > u.survivor_rank
                            THEN u.merged_status_at ELSE s.status_at END,
         verified    = s.verified OR u.merged_verified,
         verified_at = CASE WHEN s.verified          THEN s.verified_at
                            WHEN u.merged_verified   THEN u.merged_verified_at
                            ELSE s.verified_at END,
         preferred   = s.preferred OR u.merged_preferred,
         sms_capable = s.sms_capable OR u.merged_sms_capable,
         label       = COALESCE(s.label, u.merged_label)
    FROM (
      SELECT sv.id AS survivor_channel_id,
             CASE sv.status WHEN 'unsubscribed' THEN 4
                            WHEN 'dead'         THEN 3
                            WHEN 'bounced'      THEN 2
                            ELSE 1 END AS survivor_rank,
             CASE mc.status WHEN 'unsubscribed' THEN 4
                            WHEN 'dead'         THEN 3
                            WHEN 'bounced'      THEN 2
                            ELSE 1 END AS merged_rank,
             mc.status      AS merged_status,
             mc.status_at   AS merged_status_at,
             mc.verified    AS merged_verified,
             mc.verified_at AS merged_verified_at,
             mc.preferred    AS merged_preferred,
             mc.sms_capable  AS merged_sms_capable,
             mc.label        AS merged_label
        FROM public.studio_contact_channels sv
        JOIN public.studio_contact_channels mc
          ON mc.owner_id     = p_merged
         AND mc.channel_kind = sv.channel_kind
         AND mc.value        = sv.value
       WHERE sv.owner_id = p_survivor
    ) u
   WHERE s.id = u.survivor_channel_id;

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

  -- ── AND THE VENDOR THE CARD STANDS FOR (r6 M-4) ─────────────────────────
  -- vendor_id is the makers-band fallback directoryBandOf() reads
  -- (people-derivation.ts:1221), so a fold that dropped it moved an identity
  -- to a different Directory chip. It cannot ride in the COALESCE statement
  -- below: idx_studio_contacts_org_vendor is UNIQUE on (organization_id,
  -- vendor_id) where vendor_id IS NOT NULL and both cards are in one studio,
  -- so the pointer is taken OFF the folded card in the same breath it lands
  -- on the survivor. The survivor's own vendor wins where it has one, exactly
  -- as profile_id and email do, and the folded card keeps nothing it needs:
  -- it emits no Directory row and resolves forward.
  IF v_survivor.vendor_id IS NULL AND v_merged.vendor_id IS NOT NULL THEN
    UPDATE public.studio_contacts SET vendor_id = NULL  WHERE id = p_merged;
    UPDATE public.studio_contacts
       SET vendor_id = v_merged.vendor_id
     WHERE id = p_survivor;
  END IF;

  -- ── AND EVERY OTHER TYPED FACT ON THE ABSORBED CARD (r5 B-1) ────────────
  -- The two statements above carried the login and the address, and nothing
  -- else, so thirteen columns the studio had typed stayed on a card that
  -- afterwards emits no people_directory row (§6), no picker entry
  -- (use-studio-contacts.ts filters merged_into) and no ?person= / ?firm=
  -- target (people-room.tsx resolves both FORWARD onto the survivor). The
  -- data was not deleted from the table; it was unreachable from the room,
  -- which is r4 B-1's own standard applied to the rest of the row.
  --
  -- Measured, on the merge PR-o pre-picks by default — the OLDER, blanker
  -- card survives: studio_verdict, remit_to, retainage_bps, tax_id_last4,
  -- legal_name, dba_name, w9_on_file_at, warranty_until, trades, specialties,
  -- notes and company_kind all read blank on the surviving Directory row
  -- afterwards, and three faces then said so out loud: the room announced
  -- "<survivor> carries everything <merged> held", the company card's Payee
  -- region — the one region direction §1 line 5 makes this card the sole
  -- writer of — printed "No remit-to on file." over a remit-to the studio had
  -- typed, and the Verdict region printed "No verdict recorded." over the
  -- studio's own verdict. BOTH entity kinds reach this: the QA walk measured
  -- it on a person-to-person merge (notes, verdict, specialties,
  -- warranty_until), so the statement below sits in the shared path, above
  -- the v_cross branch, and is the only place any of these columns moves.
  --
  -- COALESCE, EXACTLY AS profile_id AND email ALREADY ARE. The survivor's own
  -- value wins; none of these is identity-bearing, so none can conflict
  -- destructively, and the sheet now prints every one of them side by side
  -- before the press so the choice of survivor is not made blind.
  --
  --   * the VERDICT AND ITS DATE travel as a pair, keyed on the verdict: a
  --     verdict with somebody else's date, or a date with no verdict, is a
  --     worse fact than none.
  --   * TRADES and SPECIALTIES are NOT NULL arrays, so there is no NULL to
  --     COALESCE and "empty" is the absent state. They are UNIONED rather
  --     than picked: one firm carded twice does both trades, and a union is
  --     the only shape under which the announcer's sentence is true of them.
  --     The survivor's own order is kept and only the unseen values append.
  --   * IS_SOLE_PROPRIETOR and VENDOR_ID are the last two of this class
  --     (r6 M-4). Neither is identity-bearing and neither can conflict
  --     destructively, so both belong in this statement and neither was in
  --     it. is_sole_proprietor is read by person-profile.tsx:381 as
  --     `soleProprietor`: it prints the literal line "Sole proprietor", it
  --     selects which documents the card shows (own + the firm's) and it
  --     gates the whole Paper region — F-11 Dana Kowalski is the fixture's
  --     sole proprietor, and PR-o's older pre-pick read `false` afterwards,
  --     so the fold silently took a region off a card. vendor_id is
  --     directoryBandOf()'s makers fallback (people-derivation.ts:1221), so
  --     losing it moves an identity to a different Directory chip.
  --     is_sole_proprietor is NOT NULL, so it takes the trades/specialties
  --     treatment (OR) rather than a COALESCE, and it rides in this
  --     statement. vendor_id does NOT: idx_studio_contacts_org_vendor is
  --     UNIQUE on (organization_id, vendor_id) where vendor_id IS NOT NULL,
  --     so writing it onto the survivor while the folded card still holds it
  --     is a constraint violation. It moves in its own guarded block above,
  --     beside the login and the address, which is the same COALESCE by
  --     another shape.
  --   * company_name is the LAST of this class to be named (r9 B-2), and the
  --     one the sole-proprietor fold could least afford to drop: a firm
  --     card's NAME lives there (a company row's full_name is never set, §6
  --     says so), so folding Northgate Electric into Dana Kowalski left her
  --     surviving card carrying neither the name nor — see the DELETE below —
  --     a pointer to it, and the Directory identity line, the person card's
  --     R1 line and the bring-forward mini row all lost the firm half while
  --     her SEATS kept their free-text snapshot and the Call Sheet went on
  --     printing it. One screen named the firm, the other did not. NULLIF
  --     over btrim because 00417 lets the column hold '' as well as NULL; a
  --     survivor with its own name keeps it (display_name is
  --     COALESCE(full_name, company_name), so a person survivor's own name
  --     still wins the display).
  --   * company_kind is carried unconditionally. Only the company card reads
  --     it (company-card.tsx:144/511/641), so on the sole-proprietor fold it
  --     reaches a person card that never prints it — carrying it costs
  --     nothing and dropping it would lose the firm's kind on the one fold
  --     where the firm and the person are the same body.
  --   * THE THREE DESIGNATIONS THE FOLDED CARD ITSELF HOLDS (r7 B-1) are the
  --     last three of this class. The repoint below (§"the three designations
  --     other cards hold") moves the designations OTHER cards hold naming the
  --     merged PERSON; nothing carried the merged FIRM's own three, so a
  --     firm-to-firm merge left paperwork_contact_person_id, signer_person_id
  --     and site_contact_person_id on a card that afterwards emits no
  --     people_directory row. Measured on the PR-o default (the older, blanker
  --     card survives): all three read NULL on the survivor, so the Directory
  --     firm row's payee marker (directory-view.tsx reads signer_person_id,
  --     NOT the affiliation's is_signer that this merge does carry) went blank
  --     over a signer the studio typed, the company card's three designation
  --     rows came back empty, and "Chase the renewal" — which passes
  --     card.paperwork_contact_person_id straight into the queued task with no
  --     affiliation fallback — was drafted with no recipient. The merge sheet
  --     had promised the opposite in words ("…'s seats, channels and firm
  --     designations move onto <survivor>").
  --
  --     They are person-card pointers inside ONE studio and
  --     assert_studio_contact_designations() (00592/R-AP) already holds each
  --     to a person card in the same organization_id that is not the row
  --     itself, so none can conflict destructively — but the self leg is
  --     reachable on the SOLE-PROPRIETOR FOLD, where the survivor is the
  --     person the folded firm named as its own site contact. NULLIF drops
  --     exactly that value and carries the rest: a person is not their own
  --     site contact, and designated_person_is_self would otherwise abort the
  --     whole merge. R-BN keeps the folded card's own copy standing either
  --     way, so nothing is deleted by the drop.
  UPDATE public.studio_contacts s
     SET studio_verdict    = COALESCE(s.studio_verdict,    v_merged.studio_verdict),
         studio_verdict_at = CASE WHEN s.studio_verdict IS NULL
                                  THEN COALESCE(s.studio_verdict_at, v_merged.studio_verdict_at)
                                  ELSE s.studio_verdict_at END,
         legal_name        = COALESCE(s.legal_name,        v_merged.legal_name),
         dba_name          = COALESCE(s.dba_name,          v_merged.dba_name),
         -- r11 MAJOR-1 — AND ONLY WHERE THE SURVIVOR CAN RESOLVE NO FIRM AT
         -- ALL. people_directory's CONTACTS branch reads
         -- COALESCE(NULLIF(btrim(sc.company_name),''), firm.company_name,
         -- firm.full_name) — the free text FIRST (QA-1, w2 r5) — so carrying
         -- the absorbed card's snapshot onto a survivor whose own company_id
         -- still names a firm card put two disagreeing firm facts on one row,
         -- and the worse-sourced one won the face. Measured: the survivor's
         -- meta.company_name went from the firm card's own name to the
         -- absorbed card's 'Northgate Elec (old typo)' with company_id
         -- unchanged. usePromoteToStudioContact() stamps company_name from the
         -- seat on every promotion, so the population is the ordinary
         -- duplicate. company_id = p_merged is the sole-proprietor fold's own
         -- shape (the pointer names the card being folded, and the branch
         -- below keeps it there), which is r9 B-2's whole need.
         company_name      = COALESCE(
                               NULLIF(btrim(s.company_name), ''),
                               CASE WHEN s.company_id IS NULL
                                      OR s.company_id = p_merged
                                    THEN v_merged.company_name END),
         company_kind      = COALESCE(s.company_kind,      v_merged.company_kind),
         remit_to          = COALESCE(s.remit_to,          v_merged.remit_to),
         retainage_bps     = COALESCE(s.retainage_bps,     v_merged.retainage_bps),
         tax_id_last4      = COALESCE(s.tax_id_last4,      v_merged.tax_id_last4),
         w9_on_file_at     = COALESCE(s.w9_on_file_at,     v_merged.w9_on_file_at),
         warranty_until    = COALESCE(s.warranty_until,    v_merged.warranty_until),
         notes             = COALESCE(s.notes,             v_merged.notes),
         paperwork_contact_person_id =
           COALESCE(s.paperwork_contact_person_id,
                    NULLIF(v_merged.paperwork_contact_person_id, s.id)),
         signer_person_id  =
           COALESCE(s.signer_person_id,
                    NULLIF(v_merged.signer_person_id, s.id)),
         site_contact_person_id =
           COALESCE(s.site_contact_person_id,
                    NULLIF(v_merged.site_contact_person_id, s.id)),
         is_sole_proprietor = s.is_sole_proprietor
                              OR COALESCE(v_merged.is_sole_proprietor, false),
         trades            = s.trades
                             || ARRAY(SELECT unnest(v_merged.trades)
                                       EXCEPT SELECT unnest(s.trades)),
         specialties       = s.specialties
                             || ARRAY(SELECT unnest(v_merged.specialties)
                                       EXCEPT SELECT unnest(s.specialties))
   WHERE s.id = p_survivor;

  -- ── affiliations ────────────────────────────────────────────────────────
  --
  -- r6 M-2 / M-3 — AN AFFILIATION ROW IS A KEY PLUS FIVE TYPED FACTS, AND
  -- THE FOLD OF A FIRM IS NOT THE FOLD OF ITS CREW.
  --
  -- Both collision DELETEs below used to drop the absorbed card's OPEN row
  -- whenever the survivor already held one for the same pair, as though the
  -- row were nothing but (person_id, company_id). It also carries
  -- role_at_firm, is_paperwork_contact, is_signer, holds_trade_license and
  -- from_date — the crew line's own words (company-card.tsx:186-201 builds
  -- "Foreman · paperwork contact · signer · holds the trade licence" out of
  -- exactly those) and the person card's "since" (person-profile.tsx:348-354).
  -- PR-o pre-picks the OLDER card, which is the one usually carrying the
  -- blank affiliation. Measured: older row role NULL / from 2024-01-01
  -- absorbed newer "Foreman", paperwork, signer, licence, from 2019-03-01;
  -- afterwards the single surviving row read role NULL, three booleans false,
  -- from_date 2024-01-01 — four words off the crew line and a "since 2024"
  -- the studio never typed. So the row REDUCES first (R-BN): role COALESCEs,
  -- the three designations are OR'd, from_date takes the LEAST of the two
  -- (the earlier start is the true one), and only then does the duplicate go.
  IF v_cross THEN
    -- The firm IS the person now. An affiliation of a person AT THEMSELVES is
    -- what studio_person_affiliations_distinct_cards_check refuses, and a
    -- person card can never be a company_id, so THAT row is dropped rather
    -- than repointed.
    --
    -- IT IS THE ONLY ONE. The statement here used to read
    -- `DELETE … WHERE company_id = p_merged` with no person leg, so every
    -- OTHER carded human affiliated with the folded firm lost their role,
    -- their designations and their start date, and the blanket
    -- `SET company_id = NULL` beside it took their legacy firm pointer too.
    -- Measured: J Bookkeeper (role Bookkeeper, since 2021) came out of a fold
    -- of their own firm with company_id NULL and zero affiliations, so
    -- people_directory's company_name COALESCE (§6) missed and direction §1
    -- line 2's "Northgate Electric · electrical" degraded to the bare kind
    -- word — QA-1 (w2 r5) reached through a different door — with no crew
    -- line on the surviving PERSON card to put them back on.
    --
    -- A sole proprietor who really has crew is a fact the studio recorded, so
    -- the crew's rows are CLOSED rather than erased: to_date stamps the day
    -- the firm stopped being a firm, the role and the designations stay
    -- readable, and the legacy pointer keeps naming the folded card, which
    -- still exists and still resolves forward. The forward pointer sync is
    -- stood down for exactly that write (00592's own
    -- patina.suppress_affiliation_sync flag) so closing the row cannot null
    -- the pointer R-BN says must stand.
    -- r9 B-2 — THE SURVIVOR'S POINTER IS INSIDE THE SAME WINDOW AS THE
    -- CREW'S. This DELETE used to run OUTSIDE it, and
    -- sync_studio_contact_company_pointer_trg is AFTER INSERT OR DELETE OR
    -- UPDATE: the survivor's company_id was re-derived over zero open
    -- affiliations and landed NULL, so the one card the fold was about lost
    -- the pointer that names the folded firm — while every OTHER human on
    -- that crew kept theirs. Suppressed, it keeps naming the folded card,
    -- which still exists and still resolves forward, exactly as the crew's
    -- does.
    PERFORM set_config('patina.suppress_affiliation_sync', '1', true);
    DELETE FROM public.studio_person_affiliations
     WHERE company_id = p_merged AND person_id = p_survivor;

    UPDATE public.studio_person_affiliations
       SET to_date = GREATEST(COALESCE(from_date, CURRENT_DATE), CURRENT_DATE)
     WHERE company_id = p_merged
       AND to_date IS NULL;
    PERFORM set_config('patina.suppress_affiliation_sync', '', true);
  ELSIF v_survivor.entity_kind = 'person' THEN
    UPDATE public.studio_person_affiliations s
       SET role_at_firm         = COALESCE(s.role_at_firm, a.role_at_firm),
           is_paperwork_contact = s.is_paperwork_contact OR a.is_paperwork_contact,
           is_signer            = s.is_signer            OR a.is_signer,
           holds_trade_license  = s.holds_trade_license  OR a.holds_trade_license,
           from_date            = LEAST(COALESCE(s.from_date, a.from_date),
                                        COALESCE(a.from_date, s.from_date))
      FROM public.studio_person_affiliations a
     WHERE a.person_id  = p_merged
       AND a.to_date IS NULL
       AND s.person_id  = p_survivor
       AND s.company_id = a.company_id
       AND s.to_date IS NULL;

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
    -- The mirror image, and the same reduction: two firm cards each holding
    -- an open row for the same human.
    UPDATE public.studio_person_affiliations s
       SET role_at_firm         = COALESCE(s.role_at_firm, a.role_at_firm),
           is_paperwork_contact = s.is_paperwork_contact OR a.is_paperwork_contact,
           is_signer            = s.is_signer            OR a.is_signer,
           holds_trade_license  = s.holds_trade_license  OR a.holds_trade_license,
           from_date            = LEAST(COALESCE(s.from_date, a.from_date),
                                        COALESCE(a.from_date, s.from_date))
      FROM public.studio_person_affiliations a
     WHERE a.company_id = p_merged
       AND a.to_date IS NULL
       AND s.company_id = p_survivor
       AND s.person_id  = a.person_id
       AND s.to_date IS NULL;

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
  -- The rule left behind says nothing the survivor's rule does not already
  -- say: the gate above refuses the merge unless the absorbed card's
  -- forbidden channels and its route are both carried by the survivor's own
  -- rule (r4 B-2, widened r5 M-2), so this repoint can stay conditional
  -- without losing a refusal. What is left behind is the reason text and the
  -- contact hours, which forbid nothing.
  --
  -- r6 M-1 — A ROUTE AT THE OTHER CARD IS DROPPED, NEVER WRITTEN AS A SELF-
  -- ROUTE. assert_studio_contact_rule_route() raises rule_route_is_self on
  -- route_to_person_id = subject_id ("write themselves instead is not a
  -- route"), and its trigger fires on UPDATE OF route_to_person_id,
  -- subject_id, subject_type — both of the columns these two statements
  -- write. Measured, on the most ordinary duplicate there is: the absorbed
  -- card's rule saying "this card is the old one, write the other one
  -- instead" aborted the whole merge with a raw schema token naming nothing
  -- the studio did, and the survivor's rule routing at the absorbed card did
  -- the same. With rules on BOTH cards it was a closed loop — refused
  -- merge_contact_rule_conflict, the refusal naming a repair the database
  -- then refused rule_route_is_self — and no act in the room could merge the
  -- pair.
  --
  -- The fold ANSWERS the route, so the route goes and the rest of the rule
  -- (its forbidden channels, its reason, its hours) travels intact. Two
  -- statements, one per direction, both before the repoints they protect.
  -- Only where the rule is actually travelling (the same NOT EXISTS the
  -- repoint below carries): a rule that stays on the folded card keeps its
  -- route as the record of what the studio wrote.
  UPDATE public.studio_contact_rules r
     SET route_to_person_id = NULL
   WHERE r.subject_type      = v_merged.entity_kind
     AND r.subject_id        = p_merged
     AND r.route_to_person_id = p_survivor
     AND NOT EXISTS (SELECT 1 FROM public.studio_contact_rules s
                      WHERE s.subject_type = v_survivor.entity_kind
                        AND s.subject_id   = p_survivor);

  UPDATE public.studio_contact_rules r
     SET route_to_person_id = NULL
   WHERE r.subject_type      = v_survivor.entity_kind
     AND r.subject_id        = p_survivor
     AND r.route_to_person_id = p_merged;

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
  -- this can only arise where both cards are people. The survivor's own rule
  -- is excluded: its route at the folded card was already nulled above, and
  -- repointing it would write the self-route this RPC exists not to write.
  IF v_survivor.entity_kind = 'person' THEN
    UPDATE public.studio_contact_rules r
       SET route_to_person_id = p_survivor
     WHERE r.route_to_person_id = p_merged
       AND NOT (r.subject_type = v_survivor.entity_kind
                AND r.subject_id = p_survivor);
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
    -- only the six legs that judge the ACT of retiring a paper — so a retired
    -- row reached before its own
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
  --
  -- NULLIF, FOR THE SURVIVOR'S OWN CARD (W3 round-8 M-1). "Other cards"
  -- includes the SURVIVOR, and a bare `= p_survivor` wrote S.signer_person_id
  -- = S there, which assert_studio_contact_designations() (00592/R-AP) refuses
  -- with designated_person_is_self — the whole merge lost, with a raw schema
  -- token naming nothing the studio did. r7 B-1 is what made it reachable:
  -- before it, only company-card.tsx wrote these three and it opens firm cards
  -- only, so no person card could hold one; the COALESCE at §5's contact-facts
  -- reduction now lands a folded firm's paperwork contact and signer on a
  -- PERSON survivor in a sole-proprietor fold, and folding that designated
  -- person into the same survivor a moment later hit this statement. There is
  -- no repair in the room either: person-profile.tsx neither reads nor writes
  -- these columns, so the studio could not clear the pointer that was refusing
  -- the merge and the pair could never be folded — r6 M-1's closed loop.
  --
  -- The fold ANSWERS the designation rather than carrying it: after the merge
  -- the designated person IS the survivor, and a person is not their own
  -- signer, so the pointer is DROPPED exactly where it would become a self
  -- reference and carried everywhere else. The same idiom §5 uses three
  -- hundred lines above, for the same reason. R-BN holds: nothing is deleted,
  -- because §5's COALESCE only ever writes these three ONTO the survivor and
  -- never moves them off the folded card, which keeps its own copy.
  IF v_survivor.entity_kind = 'person' THEN
    UPDATE public.studio_contacts
       SET paperwork_contact_person_id = NULLIF(p_survivor, id)
     WHERE paperwork_contact_person_id = p_merged;
    UPDATE public.studio_contacts
       SET signer_person_id = NULLIF(p_survivor, id)
     WHERE signer_person_id = p_merged;
    UPDATE public.studio_contacts
       SET site_contact_person_id = NULLIF(p_survivor, id)
     WHERE site_contact_person_id = p_merged;
  END IF;

  -- ── seats ───────────────────────────────────────────────────────────────
  --
  -- A MERGE IS NOT A TOUCH ON THE JOB (r13 MAJOR-2). Every statement in this
  -- block matches rows on a card pointer, INCLUDING UNCARDED seats
  -- (studio_contact_id IS NULL) whose firm or warranty pointer names the
  -- folded card — and those are exactly the rows people_directory's PARTY
  -- branch ranks by pp.updated_at DESC and people_directory_seats' first_value
  -- window names person_id from. With set_updated_at_project_parties armed,
  -- an ordinary firm-duplicate fold moved an uncarded human's Directory row
  -- off her live job onto a closed one and printed the merge instant as
  -- last_touch_at. §4g's GUC makes the stamp stand down for this block and
  -- nothing else; it is transaction-local and cleared the moment the block
  -- ends, the way app.contact_merge_in_progress is below.
  PERFORM set_config('patina.suppress_party_touch', '1', true);

  -- The identity key itself (party_identity_key()'s first leg).
  UPDATE public.project_parties
     SET studio_contact_id = p_survivor WHERE studio_contact_id = p_merged;

  IF v_cross THEN
    -- No person card may be a seat's company_id (00624's
    -- party_company_not_a_company). The firm is the person, and the seat's
    -- own studio_contact_id now says so.
    --
    -- THIS NULLS EVERY SEAT NAMING THE FOLDED FIRM, not only the proprietor's
    -- own — a crew seat included — and there is no legal alternative: the
    -- survivor is a PERSON card and the CHECK above refuses one here. It costs
    -- the crew seat nothing. company_name is a free-text snapshot the merge
    -- never writes, so the Call Sheet row goes on printing the firm's name;
    -- and people_directory_seats reads
    -- identity_paper_state(card, COALESCE(seat's firm, card's firm))
    -- (00626:2169, R-BJ), so a nulled seat falls back to the crew card's own
    -- pointer — still the folded firm, as §4e and R-BN require — which §4f now
    -- resolves forward to the survivor for paper (r10 BLOCKING-1).
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

  -- The seat block ends here, and so does §4g's stand-down.
  PERFORM set_config('patina.suppress_party_touch', '', true);

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

  -- ── the firm's PAPERWORK DOOR (00637, W4 r3 MAJOR-3) ────────────────────
  --
  -- The sixth card pointer, and the second one that keys a LIVE DOOR.
  -- `paperwork_link_tokens.company_id` is 00637's table, minted two files
  -- after this one, so nothing above reached it and a firm merge stranded the
  -- door three ways at once (measured, probe608):
  --
  --   1. THE FIRM IS TOLD THE STUDIO HOLDS NONE OF ITS PAPER.
  --      resolve_paperwork_link reads `doc.holder_id = v_row.company_id`,
  --      which stayed the ABSORBED card while §4e moved every document to the
  --      survivor. The trade's live page went from "COI, current" to an empty
  --      table — a reader flatly disagreeing with the record, on the one page
  --      spec §3 exists to tell a firm what is owed.
  --   2. INBOUND PAPER IS LOST. record_inbound_compliance_document takes the
  --      holder from the token row, so the next upload through that same live
  --      link landed on the absorbed card: the survivor's inbound queue band
  --      showed nothing, compliance_state(survivor) counted nothing, and
  --      acceptance 8 failed silently.
  --   3. R-AF BREAKS. uniq_paperwork_link_tokens_active_company keys on
  --      company_id, so minting the survivor's own door afterwards left ONE
  --      firm identity holding TWO live doors.
  --
  -- NAMING A LATER FILE'S TABLE, for the reason the bid_quoted_by_person_id
  -- repoint states three hundred lines above: plpgsql resolves relations at
  -- first EXECUTION, nothing calls this RPC between 00629 and 00637, and two
  -- bodies is how the repoint list went stale in the first place.
  --
  -- REVOKE FIRST, THEN REPOINT. The partial unique index is on an ACTIVE row
  -- per company, so moving the absorbed card's live token onto a survivor that
  -- already has one would abort the whole fold on a schema token; R-AF wants
  -- the survivor's own door to stand, so the absorbed one is CLOSED with a
  -- reason the Access grants list can print rather than deleted (spec §7 keeps
  -- every row).
  IF v_survivor.entity_kind = 'company' THEN
    UPDATE public.paperwork_link_tokens t
       SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
           revoke_reason = 'The firm was merged into another card.',
           updated_at = now()
     WHERE t.company_id = p_merged
       AND t.status = 'active'
       AND EXISTS (SELECT 1 FROM public.paperwork_link_tokens s
                    WHERE s.company_id = p_survivor AND s.status = 'active');

    -- assert_paperwork_token_company() fires on UPDATE OF company_id,
    -- organization_id and holds the survivor to a company card in the same
    -- studio — which is the check this repoint wants, so it is left to run.
    UPDATE public.paperwork_link_tokens t
       SET company_id = p_survivor,
           organization_id = v_survivor.organization_id,
           updated_at = now()
     WHERE t.company_id = p_merged;
  ELSE
    -- The survivor is a PERSON card — the sole-proprietor fold (§4e), where
    -- the firm IS the person. A paperwork link is a firm's door and never a
    -- person's (paperwork_token_company_required), so there is no card left to
    -- hold this one and repointing it would abort the fold with a schema token
    -- naming nothing the studio did. The door is CLOSED, with the same
    -- sentence, and the row stays where the audit trail can read it.
    UPDATE public.paperwork_link_tokens t
       SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
           revoke_reason = 'The firm was merged into another card.',
           updated_at = now()
     WHERE t.company_id = p_merged AND t.status = 'active';
  END IF;

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
  'Repoints, in order: typed channels (union; a duplicate by channel_kind + '
  'value REDUCES onto the surviving row before it goes — status worst-first '
  'with its own status_at, verified and preferred OR''d, label COALESCEd — '
  'because a duplicate row is a duplicate address plus six typed facts and '
  'the blind DELETE destroyed a recorded unsubscribe on the commonest merge '
  'there is, r6 B-1 / R-BN; PLUS the absorbed card''s own phone_e164 and '
  'email minted as channel rows on the survivor so the legacy columns join '
  'the union too — r3 W3-R3-4), affiliations (a collision REDUCES too: '
  'role_at_firm COALESCEd, the three designations OR''d, from_date LEAST — '
  'r6 M-2), contact rules (the '
  'survivor''s wins; the merged card keeps its own as history unless the '
  'survivor has none), the route_to pointer (a route at the OTHER card of '
  'the pair is DROPPED rather than written as a self-route, which '
  'assert_studio_contact_rule_route() refuses — r6 M-1), the three designations other '
  'cards hold, every seat''s studio_contact_id / company_id / '
  'warranty_contact_person_id / bid_quoted_by_person_id (00631), and the '
  'household''s member array and primary pointer (00632), the trade '
  'agreement''s live link token and lien-waiver card pointers (a SENT '
  'agreement''s own contact_id stays frozen where 00579 froze it — r4 M-3), '
  'the firm''s PAPERWORK DOOR (paperwork_link_tokens.company_id, 00637: the '
  'absorbed card''s live token is revoked where the survivor already holds '
  'one so R-AF''s one-live-door-per-firm survives the fold, and closed '
  'outright where the survivor is a person card, since a paperwork link is a '
  'firm''s door and never a person''s — W4 r3 MAJOR-3), '
  'and the absorbed card''s LOGIN and email address onto the survivor where '
  'the survivor has none, because people_directory reads both off the '
  'survivor''s own columns and PR-o pre-picks the older card (r4 B-1). '
  'EVERY OTHER TYPED FACT TRAVELS THE SAME WAY (r5 B-1): studio_verdict with '
  'its date, legal_name, dba_name, company_kind, remit_to, retainage_bps, '
  'tax_id_last4, w9_on_file_at, warranty_until and notes are COALESCEd onto '
  'the survivor (its own value wins, none of them is identity-bearing), '
  'trades, specialties and is_sole_proprietor are UNIONed / OR''d because '
  'they are NOT NULL with no NULL to coalesce, and vendor_id moves in its '
  'own guarded pair of statements because '
  'idx_studio_contacts_org_vendor is UNIQUE per studio (r6 M-4). '
  'Unmoved, they stayed on a card the room cannot open '
  'and the company card printed "No remit-to on file." and "No verdict '
  'recorded." over facts the studio had typed. '
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
  'number with no write (crm-model §4, R-AY). '
  'In the sole-proprietor fold every OTHER person''s affiliation at the '
  'folded firm is CLOSED with to_date, never deleted, and their legacy '
  'company_id pointer stands, so the crew keep their firm''s name on their '
  'own Directory rows (r6 M-3, R-BN). '
  'Refuses a firm into a person '
  'unless the person is_sole_proprietor, and a person into a firm always '
  '(merge_kind_mismatch); refuses two cards naming two DIFFERENT Patina '
  'accounts (merge_two_logins); refuses a merge that would leave a recorded '
  'contact refusal behind on the absorbed card — any forbidden channel or '
  'route the survivor''s own rule does not already carry, not only R-BL''s '
  'hard block (merge_contact_rule_conflict, widened r5 M-2); and refuses a '
  'survivor the studio has PUT AWAY, because a merge onto an archived card '
  'takes the whole identity out of the rolodex read '
  '(merge_survivor_archived, r5 M-4). It also refuses, BY NAME and before the '
  'first write, both shapes assert_project_party_cards() (00624) would abort a '
  'seat repoint over with a raw schema token: a seat on a job that records no '
  'studio (merge_seat_on_studioless_project, r11 MAJOR-2 / r12 MAJOR-2) and a '
  'seat carrying a card of another studio (merge_seat_card_other_studio, r13 '
  'MAJOR-1), each naming the job in DETAIL. And it refuses, by name and before '
  'the first write, a fold that would leave ONE human holding two OPEN seats '
  'of the same party_kind on ONE job — each able to carry its own open money '
  'grant, so the Call Sheet would print the same person twice with two '
  'different signing figures (merge_seat_collision, r18 MAJOR-1). DETAIL names '
  'the job and the kind; the repair is the room''s own "Close this seat" on '
  'one of the two, and closing it lifts the gate, because the predicate reads '
  'open seats only. A fourth pre-check asks that same question of the GRANT '
  'rather than of the seat''s openness (merge_seat_authority_collision, r22 '
  'MAJOR-1): R-BS clamps 00634''s end-authority trigger off the withdrawal '
  'path, so a seat dated by a recorded withdrawal keeps its open grants and '
  'the third pre-check cannot see it — a seat counts as live here where it '
  'has not left the job OR still carries a grant with effective_to NULL, any '
  'scope. Its DETAIL names the job, the kind and WHICH card holds the seat '
  'that left (merged / survivor / both), and its repair is that seat''s and '
  'not the live one''s: put it back in the bidding (R-BR clears off_job_at), '
  'then close it by hand so 00634 ends what it carried. Closing the seat that '
  'is still open would lift the gate while leaving the standing grant standing '
  '(r23 MAJOR-1, measured). Neither card is deleted or archived: the merged '
  'one '
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
