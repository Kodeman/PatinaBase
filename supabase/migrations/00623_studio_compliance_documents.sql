-- ═══════════════════════════════════════════════════════════════════════════
-- 00623 — People room CRM · W1b (1 of 5): compliance documents (E10)
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) §7. G-14: a
-- COI, a W-9, a licence, a bond and a lien waiver have no table anywhere in
-- Patina. The only compliance words that exist are POLICY booleans on
-- studio_trade_agreements (00579:58-108 — insurance_certificate_required,
-- lien_waiver_policy, retainage_bps), which say what the studio ASKS FOR and
-- never what it HOLDS. So "do we hold a current COI for this sub" is
-- unanswerable, and the fixture's F-11 (Northgate Electric, COI lapsed
-- 2026-03-31) is invisible on every surface.
--
-- This migration adds the holding:
--
--   1. studio_compliance_documents — one row per paper, held against a rolodex
--      CARD. holder_type person|company because a COI is the FIRM's and a
--      master licence is the PERSON's (CS2-21, crm-model §2); holder_id is a
--      studio_contacts id and the two are asserted to agree by
--      assert_compliance_holder(), the same shape 00592's
--      assert_studio_contact_designations() takes and for the same reason — a
--      plain FK into studio_contacts permits a COMPANY card where a person is
--      meant, another tenant's card, and (for superseded_by) the row itself.
--
--   2. compliance_state(holder) → current | lapses_soon | lapsed |
--      not_on_file. Direction §3.8's paper word family, in one place, with the
--      30-day window stated once, over GATING paper only — a lapse that holds
--      no gate changes nothing (CS2 §4, PR-h; w1b r1 MAJOR-3). SECURITY INVOKER so the table's member-only
--      RLS is the whole access rule — the posture 00594's
--      channel_consent_status() established: a caller who is not a member of
--      the owning studio reads 'not_on_file', never another studio's word.
--
-- blocks[] is the point of the whole object (CS2 §4: "a date with no gate
-- changes nothing"), constrained to the three gates this program actually has
-- a surface for — site_access, payment, draw. contract / permit /
-- mobilization from crm-model §2 are deliberately NOT in the vocabulary yet:
-- nothing reads them, and a token no gate honours is a promise on a face.
--
-- PR-a (BUILD the trade-side upload door in P3) is why `source` and `inbound`
-- exist here in P1: a document that arrived over a paperwork link is the same
-- object as one the studio typed, distinguished by provenance and by an
-- unverified-until-confirmed state (verified_at IS NULL), never by a second
-- table. PR-u (no cross-studio sharing) is why organization_id is on the row
-- and not derived: each studio verifies independently.
--
-- RLS: is_active_studio_member(organization_id), the studio_contacts family's
-- predicate (00417:219-249, 00592, 00593) — a document is a fact inside one
-- rolodex, not a fact about a project.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
--
-- LINEAGE (this file is unapplied on Strata, so the fixes are edits in place):
--   · w1b final review r1 MAJOR-3 — compliance_state() now reads blocks[].
--   · w1b final review r1 MAJOR-4 — a supersede must be the same doc_type,
--     expiring no earlier.
--   · w1b final review r2 MAJOR-1 — the same consequence through two more
--     doors: (a) a DATED type may no longer be recorded, or accepted as a
--     successor, with no expires_on
--     (studio_compliance_documents_dated_expiry_check +
--     compliance_successor_undated); (b) a supersede must name the head of its
--     own chain (compliance_successor_already_superseded), which makes the
--     two-row cycle that emptied a card of its dated paper unreachable.
--   · w1b final review r3 MAJOR-1 — the THIRD door to the same consequence,
--     reachable with two ordinary member writes and `blocks` never typed: a
--     successor must itself be IN FORCE
--     (compliance_successor_already_lapsed) and must carry at least the gates
--     of the row it retires (compliance_successor_drops_a_gate). Without the
--     second leg, `blocks`' empty default retires a gating lapse with a
--     gateless row and the card reads `current` with no cover on file.
--   · w1b final review r4 MAJOR-1 — the FOURTH door, and the last of that
--     family: the undated leg and the in-force leg both enumerated the five
--     DATED doc_types, so for w9, lien_waiver_conditional,
--     lien_waiver_unconditional and other_named an UNDATED successor still
--     retired a gating, already-expired paper (walked: an expired
--     lien_waiver_conditional gating {draw,payment} went `lapsed` ->
--     `current` in two ordinary member writes). Both legs now key on the
--     PAPER'S OWN DATE — a dated row may only be retired by a dated one, and
--     the in-force test applies whenever the successor carries a date — so
--     one rule covers all nine types and no type list has to be kept in
--     step. The dated-expiry CHECK keeps its five-type list on purpose: it
--     says which types MUST carry a date, which is a different question.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_compliance_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  holder_type     text NOT NULL CHECK (holder_type IN ('person', 'company')),
  holder_id       uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,

  doc_type        text NOT NULL,
  -- Required when doc_type = 'other_named' (the PR-f vocabulary rule: an
  -- other_named with no label is exactly the row that goes dark).
  doc_label       text,

  number          text,
  issuer          text,
  issued_on       date,
  expires_on      date,
  file_path       text,

  verified_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at     timestamptz,

  -- The GC's office holds sub COIs in studio-led work (CS3 AA-4).
  held_by         text NOT NULL DEFAULT 'studio' CHECK (held_by IN ('studio', 'gc')),

  blocks          text[] NOT NULL DEFAULT '{}'::text[],

  -- A renewal supersedes its predecessor; the old paper is never deleted
  -- (crm-model §4: documents of an absorbed firm keep their original holder
  -- id and are marked superseded).
  superseded_by   uuid REFERENCES public.studio_compliance_documents(id) ON DELETE SET NULL,

  -- PR-a's P3 door: 'field_link' is a document a trade uploaded over a
  -- paperwork link. `inbound` is the company card's queue flag.
  source          text NOT NULL DEFAULT 'studio' CHECK (source IN ('studio', 'field_link')),
  inbound         boolean NOT NULL DEFAULT false,

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT studio_compliance_documents_dates_check
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on),
  CONSTRAINT studio_compliance_documents_not_own_successor_check
    CHECK (superseded_by IS NULL OR superseded_by <> id)
);

-- Vocabulary, re-stated as named constraints so a rerun of this file over an
-- existing table really does widen them (CREATE TABLE IF NOT EXISTS skips the
-- inline versions) — the 00592/00593 idiom.
ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT IF EXISTS studio_compliance_documents_doc_type_check;
ALTER TABLE public.studio_compliance_documents
  ADD CONSTRAINT studio_compliance_documents_doc_type_check CHECK (
    doc_type IN (
      'coi_gl', 'coi_wc', 'coi_auto',
      'w9', 'license', 'bond',
      'lien_waiver_conditional', 'lien_waiver_unconditional',
      'other_named'
    )
  );

ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT IF EXISTS studio_compliance_documents_doc_label_check;
ALTER TABLE public.studio_compliance_documents
  ADD CONSTRAINT studio_compliance_documents_doc_label_check CHECK (
    doc_type <> 'other_named' OR btrim(COALESCE(doc_label, '')) <> ''
  );

-- A DATED type must carry its date (w1b final review r2 MAJOR-1, door a).
-- crm-model §2 already states the rule — expires_on, "yes for dated types" —
-- and nothing enforced it, so a COI could be recorded with no expiry at all.
-- compliance_state() counts an undated paper as HELD and unable to lapse (a
-- W-9, a signed waiver are genuinely open-ended), so an undated COI reads
-- `current` forever; and because assert_compliance_holder() exempts an undated
-- successor, two ordinary member writes — record the renewal without typing
-- the date, mark the old one superseded — flipped Northgate Electric AND every
-- person reading its paper from `lapsed` to `current` with the 2026-03-31
-- lapse still on file. The single most likely data entry a studio makes ("we
-- got the renewal, I didn't have the certificate in front of me") was the
-- door. A certificate, a licence and a bond all expire by construction; the
-- other types (w9, both lien waivers, other_named) legitimately do not.
ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT IF EXISTS studio_compliance_documents_dated_expiry_check;
ALTER TABLE public.studio_compliance_documents
  ADD CONSTRAINT studio_compliance_documents_dated_expiry_check CHECK (
    doc_type NOT IN ('coi_gl', 'coi_wc', 'coi_auto', 'license', 'bond')
    OR expires_on IS NOT NULL
  );

-- blocks is a SUBSET of the three gates that have a surface. `<@` is the
-- array-containment operator, so an empty array passes (a dated paper that
-- gates nothing is a legitimate record) and an unknown token does not.
ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT IF EXISTS studio_compliance_documents_blocks_check;
ALTER TABLE public.studio_compliance_documents
  ADD CONSTRAINT studio_compliance_documents_blocks_check CHECK (
    blocks <@ ARRAY['site_access', 'payment', 'draw']::text[]
  );

COMMENT ON TABLE public.studio_compliance_documents IS
  'E10: a paper with an expiry that gates site, payment or draw. Held against '
  'a studio_contacts CARD — holder_type must equal that card''s own '
  'entity_kind, asserted by assert_compliance_holder(), because a COI is the '
  'firm''s and a master licence is the person''s (CS2-21). One row per studio '
  'per paper: PR-u parks cross-studio sharing, so each studio verifies '
  'independently and organization_id is on the row. A renewal sets '
  'superseded_by on its predecessor; nothing is deleted. source/inbound carry '
  'PR-a''s P3 trade-upload provenance, and an unverified document is one with '
  'verified_at IS NULL — not a second table. The paper WORD every surface '
  'prints comes from compliance_state(holder) (00623).';

COMMENT ON COLUMN public.studio_compliance_documents.blocks IS
  'Which gates this paper holds when it lapses: any subset of site_access, '
  'payment, draw. CS2 §4 — a date with no gate changes nothing. crm-model §2 '
  'also names contract/permit/mobilization; they are deliberately out of the '
  'vocabulary until a gate honours them.';
COMMENT ON COLUMN public.studio_compliance_documents.held_by IS
  'studio | gc — who physically holds the paper. The GC''s office holds sub '
  'COIs in studio-led work (CS3 AA-4); the studio still records that it exists.';
COMMENT ON COLUMN public.studio_compliance_documents.source IS
  'studio | field_link — how the document reached Patina. PR-a builds the '
  'trade-side upload door in P3; a document that arrives over a paperwork '
  'link is the same object, distinguished by provenance.';
COMMENT ON COLUMN public.studio_compliance_documents.verified_at IS
  'NULL means unconfirmed. PR-a''s inbound document lands unverified and a '
  'studio member confirms it; "yes" was true last spring (CS4-1) is why the '
  'date is here at all.';
COMMENT ON COLUMN public.studio_compliance_documents.expires_on IS
  'When the paper stops covering. REQUIRED for the dated types (coi_gl, '
  'coi_wc, coi_auto, license, bond) by '
  'studio_compliance_documents_dated_expiry_check — crm-model §2''s "yes for '
  'dated types". NULL means genuinely open-ended (a W-9, a signed waiver), '
  'which compliance_state() reads as held and unable to lapse; an undated '
  'certificate would therefore read `current` forever, which is how r2 '
  'MAJOR-1 door (a) hid a lapse.';
COMMENT ON COLUMN public.studio_compliance_documents.superseded_by IS
  'The paper that replaced this one. Must name the document still IN FORCE for '
  'the same card in the same studio — same doc_type, expiring no earlier, '
  'dated when the type is dated, and its own superseded_by null, all asserted '
  'by assert_compliance_holder(). The head-of-chain rule is what makes a '
  'supersede cycle unreachable: compliance_state() ignores every superseded '
  'row, so a two-row loop silently emptied a card of its dated paper (r2 '
  'MAJOR-1 door b).';
COMMENT ON COLUMN public.studio_compliance_documents.doc_label IS
  'Required when doc_type = other_named (PR-f). An unnamed other is the row '
  'that goes dark.';

CREATE INDEX IF NOT EXISTS idx_studio_compliance_documents_holder
  ON public.studio_compliance_documents(holder_id, doc_type)
  WHERE superseded_by IS NULL;

-- The expiry sweep (P2) and the paper word both scan by org and date.
CREATE INDEX IF NOT EXISTS idx_studio_compliance_documents_org_expiry
  ON public.studio_compliance_documents(organization_id, expires_on)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_studio_compliance_documents_inbound
  ON public.studio_compliance_documents(organization_id)
  WHERE inbound IS TRUE AND verified_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_studio_compliance_documents
  ON public.studio_compliance_documents;
CREATE TRIGGER set_updated_at_studio_compliance_documents
  BEFORE UPDATE ON public.studio_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- The holder card has to be the card it claims to be, in this studio
-- ═══════════════════════════════════════════════════════════════════════════
-- Same hole, same closure as 00592's assert_studio_contact_designations() and
-- assert_affiliation_card_kinds(). holder_id is a plain FK into
-- studio_contacts, which holds BOTH kinds of card AND every tenant's cards,
-- so the FK alone permits a person card where holder_type says company, and a
-- document filed against another studio's firm — which under PR-u is exactly
-- the thing that must not be possible. A CHECK cannot see another table.
CREATE OR REPLACE FUNCTION public.assert_compliance_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind         text;
  v_org          uuid;
  v_succ_type       text;
  v_succ_expires    date;
  v_succ_superseded uuid;
  v_succ_blocks     text[];
BEGIN
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
    IF v_succ_superseded IS NOT NULL THEN
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
    IF v_succ_expires IS NOT NULL AND v_succ_expires < CURRENT_DATE THEN
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

REVOKE ALL ON FUNCTION public.assert_compliance_holder()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_compliance_holder() IS
  'BEFORE INSERT/UPDATE on studio_compliance_documents: holder_id must name a '
  'card whose entity_kind equals holder_type, in the SAME organization_id, and '
  'superseded_by must name another document for the same card in the same '
  'studio, of the SAME doc_type, expiring no earlier than the row it retires, '
  'carrying its own expires_on whenever the row it retires carries one, still '
  'at the head '
  'of its own chain (its superseded_by null), still IN FORCE (not itself '
  'expired), and carrying at least the blocks[] of the row it retires '
  '(compliance_holder_not_found / _kind_mismatch / _other_studio / '
  'compliance_successor_other_holder / compliance_successor_wrong_type / '
  'compliance_successor_not_later / compliance_successor_undated / '
  'compliance_successor_already_superseded / '
  'compliance_successor_already_lapsed / compliance_successor_drops_a_gate). '
  'The last six are what keeps a '
  'supersede a renewal rather than a way to hide a lapse, since '
  'compliance_state() reads only non-superseded rows, counts only paper with a '
  'non-empty blocks[], and UPDATE is granted to '
  'authenticated: the wrong type and the shorter date were r1 MAJOR-4, the '
  'undated successor and the head-of-chain rule are r2 MAJOR-1 doors (a) and '
  '(b), the second of which took every dated paper on a card out of the '
  'reckoning with two UPDATEs, and the already-lapsed successor and the '
  'dropped gate are r3 MAJOR-1 — two ordinary member writes with blocks left '
  'at its empty default printed `current` over a firm holding no in-force '
  'general-liability cover; and r4 MAJOR-1 re-keyed the undated and in-force '
  'legs off the five-type list onto the paper''s own date, because for w9, '
  'both lien waivers and other_named an undated successor still retired a '
  'gating, expired paper. The FKs '
  'cannot say any of this — studio_contacts holds both kinds of card and every '
  'studio''s cards (00623, the 00592 R-AP shape).';

DROP TRIGGER IF EXISTS assert_compliance_holder_trg
  ON public.studio_compliance_documents;
CREATE TRIGGER assert_compliance_holder_trg
  BEFORE INSERT OR UPDATE OF holder_id, holder_type, organization_id,
                             superseded_by, doc_type, expires_on
  ON public.studio_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.assert_compliance_holder();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — the studio_contacts family's predicate
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.studio_compliance_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_compliance_documents_member_select
  ON public.studio_compliance_documents;
CREATE POLICY studio_compliance_documents_member_select
  ON public.studio_compliance_documents FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

DROP POLICY IF EXISTS studio_compliance_documents_member_insert
  ON public.studio_compliance_documents;
CREATE POLICY studio_compliance_documents_member_insert
  ON public.studio_compliance_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_studio_member(organization_id));

DROP POLICY IF EXISTS studio_compliance_documents_member_update
  ON public.studio_compliance_documents;
CREATE POLICY studio_compliance_documents_member_update
  ON public.studio_compliance_documents FOR UPDATE
  TO authenticated
  USING (public.is_active_studio_member(organization_id))
  WITH CHECK (public.is_active_studio_member(organization_id));

DROP POLICY IF EXISTS studio_compliance_documents_member_delete
  ON public.studio_compliance_documents;
CREATE POLICY studio_compliance_documents_member_delete
  ON public.studio_compliance_documents FOR DELETE
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

REVOKE ALL ON TABLE public.studio_compliance_documents
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.studio_compliance_documents TO authenticated;
GRANT ALL ON public.studio_compliance_documents TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- compliance_state(holder) — direction §3.8's paper word, stated once
-- ═══════════════════════════════════════════════════════════════════════════
-- current | lapses_soon | lapsed | not_on_file, over the holder's own
-- NON-superseded documents. Precedence is worst-first: one lapsed paper makes
-- the holder lapsed whatever else is current, because the lapse is what blocks
-- a gate. A document with no expires_on (a W-9, a signed waiver) is HELD and
-- cannot lapse, so a holder carrying only undated paper reads `current`; a
-- holder with no paper at all reads `not_on_file`, which is a different fact
-- (C21, R-K).
--
-- Only GATING paper can move the word off `current`: cardinality(blocks) > 0
-- on both date FILTERs. CS2 §4 — "a date with no gate changes nothing" — and
-- PR-h, which puts the word in the blocked family with a terracotta leading
-- rule, are the reason the column exists; reading the dates without it made a
-- lapsed training card that gates nothing print the blocked word over a firm
-- whose COI was current (w1b final review r1 MAJOR-3). count(*) = 0 is
-- deliberately NOT filtered, so `not_on_file` still means no paper at all
-- rather than no gating paper: a gateless certificate on file is held, and a
-- holder carrying only gateless paper reads `current`.
--
-- SECURITY INVOKER, so the table's member-only RLS is the whole access rule —
-- 00594's channel_consent_status() posture. A caller outside the owning studio
-- sees no rows and reads 'not_on_file'; it can never print another studio's
-- word. That degrade is intended (PR-u), not a leak.
CREATE OR REPLACE FUNCTION public.compliance_state(p_holder_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN 'not_on_file'
           WHEN count(*) FILTER (
                  WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL
                    AND d.expires_on < CURRENT_DATE) > 0 THEN 'lapsed'
           WHEN count(*) FILTER (
                  WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL
                    AND d.expires_on <= CURRENT_DATE + 30) > 0 THEN 'lapses_soon'
           ELSE 'current'
         END
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = p_holder_id
     AND d.superseded_by IS NULL;
$$;

REVOKE ALL ON FUNCTION public.compliance_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_state(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.compliance_state(uuid) IS
  'The paper word for one rolodex card: current | lapses_soon | lapsed | '
  'not_on_file (direction §3.8), over its non-superseded documents, with the '
  '30-day window stated once. Worst-first: one lapsed GATING paper makes the '
  'holder lapsed. Only paper with a non-empty blocks[] can move the word off '
  'current — CS2 §4, "a date with no gate changes nothing", and PR-h''s '
  'blocked family. Undated paper (a W-9) is held and cannot lapse; NO paper '
  'at all is not_on_file, a different fact from no GATING paper, which reads '
  'current. SECURITY INVOKER — the table''s member-only RLS is the access '
  'rule, so a caller outside the studio reads not_on_file rather than another '
  'studio''s word (00623).';
