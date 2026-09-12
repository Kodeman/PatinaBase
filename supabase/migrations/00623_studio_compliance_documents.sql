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
--      30-day window stated once. SECURITY INVOKER so the table's member-only
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
  v_kind text;
  v_org  uuid;
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
    PERFORM 1 FROM public.studio_compliance_documents d
      WHERE d.id = NEW.superseded_by
        AND d.organization_id = NEW.organization_id
        AND d.holder_id = NEW.holder_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'compliance_successor_other_holder'
        USING HINT = 'superseded_by must name another document held for the '
                     'SAME card in the SAME studio. A renewal supersedes its '
                     'own predecessor, not somebody else''s paper.';
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
  'studio (compliance_holder_not_found / _kind_mismatch / _other_studio / '
  'compliance_successor_other_holder). The FKs cannot say any of this — '
  'studio_contacts holds both kinds of card and every studio''s cards (00623, '
  'the 00592 R-AP shape).';

DROP TRIGGER IF EXISTS assert_compliance_holder_trg
  ON public.studio_compliance_documents;
CREATE TRIGGER assert_compliance_holder_trg
  BEFORE INSERT OR UPDATE OF holder_id, holder_type, organization_id, superseded_by
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
                  WHERE d.expires_on IS NOT NULL
                    AND d.expires_on < CURRENT_DATE) > 0 THEN 'lapsed'
           WHEN count(*) FILTER (
                  WHERE d.expires_on IS NOT NULL
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
  '30-day window stated once. Worst-first: one lapsed paper makes the holder '
  'lapsed. Undated paper (a W-9) is held and cannot lapse; NO paper is '
  'not_on_file, a different fact. SECURITY INVOKER — the table''s member-only '
  'RLS is the access rule, so a caller outside the studio reads not_on_file '
  'rather than another studio''s word (00623).';
