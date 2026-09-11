-- ═══════════════════════════════════════════════════════════════════════════
-- 00592 — People room CRM · W1a (1 of 3): card extensions, affiliations, rules
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) turns the room's
-- unit from the party row into the person card and makes the firm the unit of
-- compliance, contract and payment. This migration lays the identity half:
--
--   1. studio_contacts gains the person facts (is_sole_proprietor,
--      studio_verdict, studio_verdict_at) and the company facts (legal_name,
--      dba_name, company_kind, trades, w9_on_file_at, tax_id_last4, remit_to,
--      retainage_bps, warranty_until, and the three designated-person FKs).
--   2. studio_person_affiliations — E4: which person does what at which firm.
--      Backfilled from studio_contacts.company_id (00417), which becomes a
--      derived pointer at the open affiliation, kept equal by trigger. One
--      fact, one home — the pointer is the cache. BOUND BOTH WAYS: an
--      affiliation write re-derives the pointer, and a direct write to the
--      legacy pointer (which is still what the shipped hooks do —
--      use-studio-contacts.ts:202, :234) opens the affiliation it names. Bound
--      one way only, the shipped UI produced cards with a firm and no
--      affiliation row, invisible to the company card's crew list (R-W).
--   3. studio_contact_rules — E7: the contact rule (allowed / forbidden /
--      routed / hours / escalation), one per subject, person · company ·
--      engagement.
--
-- NOT DONE HERE, DELIBERATELY (orchestrator ruling, W1a):
--   · studio_contacts does NOT gain never_text / do_not_contact /
--     do_not_contact_reason / route_to_person_id. The contact rule lives ONLY
--     in studio_contact_rules; a second home for the same fact is how a
--     forbidding rule gets missed by one of two readers.
--   · contact_kind stays free TEXT with no CHECK (00417:82-87). PD-4 keeps the
--     kind vocabulary code-resident; company_kind below is the new, narrower
--     vocabulary and takes a CHECK, not an enum, for the same reason (an enum
--     ADD VALUE cannot be used in the transaction that adds it).
--
-- RLS
--   Both new tables gate on the OWNING CARD's organization_id, resolved by the
--   new SECURITY DEFINER helper studio_contact_org(uuid) so the policy never
--   depends on the caller's own visibility of studio_contacts. The engagement
--   leg of studio_contact_rules gates on is_studio_comember(designer_id) via
--   project_party_designer(uuid), matching project_parties' own posture
--   (00584:884-921).
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Subject-resolution helpers
-- ═══════════════════════════════════════════════════════════════════════════
-- studio_contact_org(card) → the org that owns a rolodex card. SECURITY
-- DEFINER for the same reason 00417's is_active_studio_member is: a policy that
-- resolved the org through the caller's own studio_contacts SELECT would make
-- one table's RLS depend on another's, and a card the caller cannot see would
-- read as "no org" rather than "not yours".
CREATE OR REPLACE FUNCTION public.studio_contact_org(p_contact_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id FROM public.studio_contacts WHERE id = p_contact_id;
$$;

REVOKE ALL ON FUNCTION public.studio_contact_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_contact_org(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.studio_contact_org(uuid) IS
  'The organization that owns a studio_contacts card. SECURITY DEFINER so RLS '
  'on the card-owned tables (affiliations, channels, rules) resolves the org '
  'without depending on the caller''s own visibility of studio_contacts (00592).';

-- project_party_designer(party) → the lead designer of the party's project.
-- Feeds is_studio_comember() for the per-job leg of a contact rule.
CREATE OR REPLACE FUNCTION public.project_party_designer(p_party_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.designer_id
  FROM public.project_parties pp
  JOIN public.projects p ON p.id = pp.project_id
  WHERE pp.id = p_party_id;
$$;

REVOKE ALL ON FUNCTION public.project_party_designer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_party_designer(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.project_party_designer(uuid) IS
  'The lead designer of the project a party sits on. SECURITY DEFINER; feeds '
  'is_studio_comember() for the engagement leg of studio_contact_rules (00592).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. studio_contacts — person facts and company facts
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.studio_contacts
  -- person
  ADD COLUMN IF NOT EXISTS is_sole_proprietor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS studio_verdict     text,
  ADD COLUMN IF NOT EXISTS studio_verdict_at  timestamptz,
  -- company
  ADD COLUMN IF NOT EXISTS legal_name         text,
  ADD COLUMN IF NOT EXISTS dba_name           text,
  ADD COLUMN IF NOT EXISTS company_kind       text,
  ADD COLUMN IF NOT EXISTS trades             text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS w9_on_file_at      date,
  ADD COLUMN IF NOT EXISTS tax_id_last4       char(4),
  ADD COLUMN IF NOT EXISTS remit_to           text,
  ADD COLUMN IF NOT EXISTS retainage_bps      integer,
  ADD COLUMN IF NOT EXISTS warranty_until     date,
  ADD COLUMN IF NOT EXISTS paperwork_contact_person_id uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signer_person_id uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_contact_person_id uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL;

-- Named, drop-and-re-add so the file is re-runnable (an inline ADD COLUMN CHECK
-- would be skipped by IF NOT EXISTS on a rerun and could never be widened).
ALTER TABLE public.studio_contacts
  DROP CONSTRAINT IF EXISTS studio_contacts_company_kind_check;
ALTER TABLE public.studio_contacts
  ADD CONSTRAINT studio_contacts_company_kind_check CHECK (
    company_kind IS NULL OR company_kind IN (
      -- crm-model §2 Company.company_kind, verbatim …
      'gc', 'sub', 'architect', 'engineer', 'lender', 'authority',
      'showroom', 'vendor', 'workroom', 'supplier', 'stager',
      'photography', 'maker',
      -- … plus the two the room already uses that the model does not list.
      -- 'authority' is the AHJ (F-27's city department); it is NOT 'inspector',
      -- which stays for the private/lender inspector of §3.8's paper-exempt pair.
      'inspector', 'other'
    )
  );

COMMENT ON COLUMN public.studio_contacts.is_sole_proprietor IS
  'The person IS the firm (crm-model §4: the only case where a company card and '
  'a person card may merge). Lets the person card carry the Paper region.';
COMMENT ON COLUMN public.studio_contacts.studio_verdict IS
  'Would rehire / would not, in the studio''s own words, dated by '
  'studio_verdict_at. Never printed at a pick (PR-i).';
COMMENT ON COLUMN public.studio_contacts.company_kind IS
  'What the firm is to the studio. CHECKed, not an enum: an enum ADD VALUE '
  'cannot be used in the transaction that adds it, and the widening vocabulary '
  'stays code-resident per PD-4/PR-f. The list is crm-model §2 verbatim plus '
  '''inspector'' and ''other''; it must stay a superset of the shipped UI''s '
  'COMPANY_KIND_LABELS (gc/workroom/showroom/vendor/supplier) so folding the '
  'free-text contact_kind (00417) into this column cannot raise 23514. '
  'Reconciled spelling: the trade noun ''photography'' (crm-model §2) wins over '
  '''photographer''; nothing writes either today.';
COMMENT ON COLUMN public.studio_contacts.trades IS
  'Trades the FIRM covers (crm-model §2: a firm carries trades, a person does '
  'not). Distinct from specialties, which 00417 seeded from vendor categories.';
COMMENT ON COLUMN public.studio_contacts.tax_id_last4 IS
  'Last four of the TIN from the W-9. Enough to catch duplicate vendor cards '
  'splitting a 1099 total (CS6-11); the full TIN is never stored.';
COMMENT ON COLUMN public.studio_contacts.retainage_bps IS
  'Retainage held on this firm, in basis points (1000 = 10%). Integer, never a '
  'float — the money rule.';
COMMENT ON COLUMN public.studio_contacts.paperwork_contact_person_id IS
  'The person card the studio chases paper at. F-14, not F-11''s dead email.';
COMMENT ON COLUMN public.studio_contacts.signer_person_id IS
  'The person card that signs the subcontract for this firm.';
COMMENT ON COLUMN public.studio_contacts.site_contact_person_id IS
  'The one name per firm the superintendent calls about the site.';

-- Company cards are looked up by kind inside a studio (the Firms chip).
CREATE INDEX IF NOT EXISTS idx_studio_contacts_org_company_kind
  ON public.studio_contacts(organization_id, company_kind)
  WHERE company_kind IS NOT NULL;

-- studio_contacts already carries RLS + explicit grants from 00417
-- (SELECT/INSERT/UPDATE to authenticated, ALL to service_role). Column
-- privileges follow the table grant, so no new GRANT is owed for the columns
-- above.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. studio_person_affiliations — E4, person at firm
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_person_affiliations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  person_id    uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,

  -- owner / signer / pm / superintendent / foreman / office_manager /
  -- dispatcher / estimator / ap_ar / rep / crew. Free TEXT, vocabulary
  -- code-resident (PD-4), same posture as studio_contacts.contact_kind.
  role_at_firm text,

  is_paperwork_contact boolean NOT NULL DEFAULT false,
  is_signer            boolean NOT NULL DEFAULT false,
  holds_trade_license  boolean NOT NULL DEFAULT false,

  from_date    date,
  to_date      date,

  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT studio_person_affiliations_dates_check
    CHECK (to_date IS NULL OR from_date IS NULL OR to_date >= from_date)
);

COMMENT ON TABLE public.studio_person_affiliations IS
  'E4: which person does what at which firm, dated. A person moving firms '
  'closes one row (to_date) and opens another; the person card and its channels '
  'survive (crm-model §4). Both ids point at studio_contacts — person_id at a '
  'person card, company_id at a company card. THIS TABLE IS THE HOME of the '
  'person-at-firm fact and the one the room reads (the company card''s crew '
  'list, R-W). Both kinds are ENFORCED by assert_affiliation_card_kinds(), and '
  'a card may not be its own firm '
  '(studio_person_affiliations_distinct_cards_check). studio_contacts.company_id (00417) is now a DERIVED POINTER at '
  'the person''s open affiliation, kept for the legacy readers and maintained '
  'by sync_studio_contact_company_pointer(); a direct write to that legacy '
  'column opens the matching affiliation here, through '
  'sync_person_affiliation_from_pointer(), so neither writer can leave a person '
  'at a firm the crew list cannot see.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_person_affiliations_open
  ON public.studio_person_affiliations(person_id, company_id)
  WHERE to_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_studio_person_affiliations_company
  ON public.studio_person_affiliations(company_id);

DROP TRIGGER IF EXISTS set_updated_at_studio_person_affiliations
  ON public.studio_person_affiliations;
CREATE TRIGGER set_updated_at_studio_person_affiliations
  BEFORE UPDATE ON public.studio_person_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_person_affiliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_person_affiliations_member_select
  ON public.studio_person_affiliations;
CREATE POLICY studio_person_affiliations_member_select
  ON public.studio_person_affiliations FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(person_id)));

-- WITH CHECK also pins the two cards to the SAME studio: an affiliation that
-- straddled two studios would let one studio's book name another's firm.
DROP POLICY IF EXISTS studio_person_affiliations_member_insert
  ON public.studio_person_affiliations;
CREATE POLICY studio_person_affiliations_member_insert
  ON public.studio_person_affiliations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_studio_member(public.studio_contact_org(person_id))
    AND public.studio_contact_org(person_id) = public.studio_contact_org(company_id)
  );

DROP POLICY IF EXISTS studio_person_affiliations_member_update
  ON public.studio_person_affiliations;
CREATE POLICY studio_person_affiliations_member_update
  ON public.studio_person_affiliations FOR UPDATE
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(person_id)))
  WITH CHECK (
    public.is_active_studio_member(public.studio_contact_org(person_id))
    AND public.studio_contact_org(person_id) = public.studio_contact_org(company_id)
  );

DROP POLICY IF EXISTS studio_person_affiliations_member_delete
  ON public.studio_person_affiliations;
CREATE POLICY studio_person_affiliations_member_delete
  ON public.studio_person_affiliations FOR DELETE
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(person_id)));

REVOKE ALL ON TABLE public.studio_person_affiliations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_person_affiliations TO authenticated;
GRANT ALL ON public.studio_person_affiliations TO service_role;

-- ── Both sides have to be the card they claim to be ─────────────────────────
-- person_id and company_id are both FKs into studio_contacts, which holds
-- BOTH kinds of card, so the FK alone permits a firm as the person and a
-- person as the firm. That is not a cosmetic malformation: company_id here is
-- copied into studio_contacts.company_id by _sync_person_company_pointer()
-- below, the column every pre-affiliation reader still follows, and
-- studio_contacts_company_link_check (00417:119) only asks that the HOLDER is
-- a person. A row with person_id = company_id therefore produced a person card
-- that is its own firm — rendered as the firm line on the card (direction §2.2
-- E2) and as its own crew (R-W).
--
-- A CHECK cannot see another table, so the kinds are asserted by a BEFORE
-- trigger; person_id <> company_id is a plain CHECK. Stated with the
-- DROP/ADD idiom so a re-run over an existing table really does add it.
ALTER TABLE public.studio_person_affiliations
  DROP CONSTRAINT IF EXISTS studio_person_affiliations_distinct_cards_check;
ALTER TABLE public.studio_person_affiliations
  ADD CONSTRAINT studio_person_affiliations_distinct_cards_check
  CHECK (person_id <> company_id);

CREATE OR REPLACE FUNCTION public.assert_affiliation_card_kinds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_kind  text;
  v_company_kind text;
BEGIN
  SELECT sc.entity_kind INTO v_person_kind
    FROM public.studio_contacts sc WHERE sc.id = NEW.person_id;
  SELECT sc.entity_kind INTO v_company_kind
    FROM public.studio_contacts sc WHERE sc.id = NEW.company_id;

  IF v_person_kind IS DISTINCT FROM 'person' THEN
    RAISE EXCEPTION 'affiliation_person_not_a_person'
      USING HINT = 'studio_person_affiliations.person_id must name a person '
                   'card. A firm does not work at a firm.';
  END IF;
  IF v_company_kind IS DISTINCT FROM 'company' THEN
    RAISE EXCEPTION 'affiliation_company_not_a_company'
      USING HINT = 'studio_person_affiliations.company_id must name a company '
                   'card — it is also what studio_contacts.company_id is kept '
                   'equal to.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_affiliation_card_kinds()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_affiliation_card_kinds() IS
  'BEFORE INSERT/UPDATE on studio_person_affiliations: person_id must be a '
  'person card and company_id a company card '
  '(affiliation_person_not_a_person / affiliation_company_not_a_company). The '
  'FKs cannot say this — studio_contacts holds both kinds — and the pointer '
  'trigger copies company_id onto the person card, so an unguarded row made a '
  'card its own firm (00592).';

DROP TRIGGER IF EXISTS assert_affiliation_card_kinds_trg
  ON public.studio_person_affiliations;
CREATE TRIGGER assert_affiliation_card_kinds_trg
  BEFORE INSERT OR UPDATE OF person_id, company_id
  ON public.studio_person_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.assert_affiliation_card_kinds();

-- ── E4's home, and the legacy pointer ───────────────────────────────────────
-- studio_contacts.company_id (00417:80) held "which firm is this person at"
-- before this table existed, and the shipped hooks still write it
-- (packages/supabase/src/hooks/use-studio-contacts.ts:202, :234). Two homes for
-- one fact is the failure this file's own header refuses for the contact rule,
-- so the two are BOUND rather than left to drift: the affiliation is the fact,
-- company_id is a derived pointer at the person's open affiliation. Without the
-- backfill every person already linked to a firm would have no affiliation row
-- and the company card's crew list would render empty for exactly the firms the
-- studio has been using longest.
INSERT INTO public.studio_person_affiliations (person_id, company_id, from_date, to_date)
SELECT p.id, p.company_id, NULL, NULL
  FROM public.studio_contacts p
  JOIN public.studio_contacts c ON c.id = p.company_id
 WHERE p.company_id IS NOT NULL
   AND p.entity_kind = 'person'
   -- The pointer could already name a PERSON card (00417's CHECK only asks
   -- that the holder is a person). Such a link is left exactly as the
   -- cross-studio one is — for a human — rather than folded into a row
   -- assert_affiliation_card_kinds() would refuse.
   AND c.entity_kind = 'company'
   AND c.id <> p.id
   -- The RLS WITH CHECK pins both cards to one studio; the backfill holds the
   -- same line, so a pre-existing cross-studio link is left for a human.
   AND c.organization_id = p.organization_id
ON CONFLICT (person_id, company_id) WHERE to_date IS NULL DO NOTHING;

-- The pointer, kept equal to the open affiliation. Writing an affiliation moves
-- company_id; the reverse binding (sync_person_affiliation_from_pointer, below)
-- opens the affiliation when the legacy column is written directly, so the fact
-- and its cache cannot disagree whichever writer moved first.
CREATE OR REPLACE FUNCTION public._sync_person_company_pointer(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF p_person_id IS NULL THEN
    RETURN;
  END IF;
  -- A person may hold two open affiliations (crm-model §4 — the sole
  -- proprietor who also crews for a GC). The pointer holds one; it holds the
  -- most recently begun, and the room reads the affiliations for the rest.
  SELECT spa.company_id INTO v_company
    FROM public.studio_person_affiliations spa
   WHERE spa.person_id = p_person_id
     AND spa.to_date IS NULL
   ORDER BY spa.from_date DESC NULLS LAST, spa.created_at DESC
   LIMIT 1;

  UPDATE public.studio_contacts sc
     SET company_id = v_company
   WHERE sc.id = p_person_id
     AND sc.entity_kind = 'person'
     AND sc.company_id IS DISTINCT FROM v_company;
END;
$$;

-- Nothing outside the trigger calls this: it takes a caller-supplied person
-- id and writes a card, so authenticated is revoked too (the trigger runs as
-- the definer owner and needs no grant).
REVOKE ALL ON FUNCTION public._sync_person_company_pointer(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._sync_person_company_pointer(uuid) IS
  'Recomputes studio_contacts.company_id for one person from that person''s '
  'OPEN affiliation (most recently begun, NULL when none). The pointer is '
  'derived; studio_person_affiliations is the fact (00592).';

CREATE OR REPLACE FUNCTION public.sync_studio_contact_company_pointer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- The other half of the binding is writing. sync_person_affiliation_from_pointer()
  -- only ever leaves the affiliations agreeing with the pointer it was handed,
  -- so recomputing the pointer from them would be a no-op — and the flag is
  -- what makes "no-op" provable rather than merely likely.
  IF COALESCE(current_setting('patina.suppress_affiliation_sync', true), '') = '1' THEN
    RETURN NULL;
  END IF;

  -- Both sides on an UPDATE that moves the row to another person.
  IF TG_OP <> 'INSERT' THEN
    PERFORM public._sync_person_company_pointer(OLD.person_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public._sync_person_company_pointer(NEW.person_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_studio_contact_company_pointer()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_studio_contact_company_pointer() IS
  'AFTER INSERT/UPDATE/DELETE on studio_person_affiliations: keeps '
  'studio_contacts.company_id equal to the person''s open affiliation''s '
  'company_id. The affiliation is the fact the room reads, company_id the '
  'derived pointer the legacy readers still follow; '
  'sync_person_affiliation_from_pointer() binds the other direction, and this '
  'function stands down (patina.suppress_affiliation_sync) while that one '
  'writes (00592).';

DROP TRIGGER IF EXISTS sync_studio_contact_company_pointer_trg
  ON public.studio_person_affiliations;
CREATE TRIGGER sync_studio_contact_company_pointer_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.studio_person_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.sync_studio_contact_company_pointer();

-- ── The reverse binding ─────────────────────────────────────────────────────
-- The pointer above is only half a binding. company_id is the column the
-- SHIPPED writers still set — packages/supabase/src/hooks/use-studio-contacts.ts
-- :202 (add a card) and :234 (edit one) — and nothing opened an affiliation
-- from that write. So a designer who set a person's firm through the shipped UI
-- produced a card with company_id set and NO affiliation row: invisible to the
-- company card's crew list (R-W, which reads affiliations), and silently
-- discarded the moment any affiliation was written for that person, because the
-- pointer trigger would then overwrite the firm the designer had chosen.
--
-- R-AI says the room reads affiliations and company_id is a derived pointer
-- kept for legacy readers. That only holds if writing the pointer OPENS the
-- affiliation it points at. It does now, in both directions:
--
--   affiliation written  → pointer re-derived   (sync_studio_contact_company_pointer)
--   pointer written      → affiliation opened   (this function)
--
-- Termination: this function writes affiliations only to make them AGREE with
-- the pointer it was handed, and holds patina.suppress_affiliation_sync while
-- it does, so the pointer trigger cannot write back. The pointer trigger's own
-- UPDATE is guarded IS DISTINCT FROM, so it re-enters this function only when
-- the value really moved, and this function returns at its first test when the
-- open affiliation already equals it.
CREATE OR REPLACE FUNCTION public.sync_person_affiliation_from_pointer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open uuid;
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
    -- The designer cleared the firm: the person left, dated today.
    UPDATE public.studio_person_affiliations spa
       SET to_date = GREATEST(CURRENT_DATE, COALESCE(spa.from_date, CURRENT_DATE))
     WHERE spa.person_id = NEW.id
       AND spa.to_date IS NULL;
  ELSIF public.studio_contact_org(NEW.company_id) IS DISTINCT FROM NEW.organization_id THEN
    -- A cross-studio pointer is left exactly as the backfill and the RLS
    -- WITH CHECK leave it: for a human. Opening the affiliation here would
    -- write a row the policy itself refuses.
    NULL;
  ELSIF NEW.company_id = NEW.id
     OR (SELECT sc.entity_kind FROM public.studio_contacts sc
          WHERE sc.id = NEW.company_id) IS DISTINCT FROM 'company' THEN
    -- 00417's studio_contacts_company_link_check permits the legacy pointer to
    -- name a person card, or the card itself. Opening the affiliation would
    -- raise out of assert_affiliation_card_kinds() and take the whole
    -- studio_contacts write down with it, so this half stands down for the
    -- same reason it stands down for a cross-studio pointer: the malformation
    -- is older than this file and is left visible, not mirrored.
    NULL;
  ELSE
    -- Open the new one FIRST, dated today so it outranks any NULL-dated row
    -- the fold left, then close the others. The reverse order would leave a
    -- moment with no open affiliation at all.
    INSERT INTO public.studio_person_affiliations (person_id, company_id, from_date, to_date)
    VALUES (NEW.id, NEW.company_id, CURRENT_DATE, NULL)
    ON CONFLICT (person_id, company_id) WHERE to_date IS NULL DO NOTHING;

    UPDATE public.studio_person_affiliations spa
       SET to_date = GREATEST(CURRENT_DATE, COALESCE(spa.from_date, CURRENT_DATE))
     WHERE spa.person_id = NEW.id
       AND spa.to_date IS NULL
       AND spa.company_id <> NEW.company_id;
  END IF;

  PERFORM set_config('patina.suppress_affiliation_sync', '', true);

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_person_affiliation_from_pointer()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_person_affiliation_from_pointer() IS
  'AFTER INSERT/UPDATE OF company_id on studio_contacts: opens the person''s '
  'affiliation at the firm the pointer names, closing any other open one, and '
  'closes them all when the pointer is cleared. The reverse half of '
  'sync_studio_contact_company_pointer(), so the legacy column the shipped '
  'hooks still write (use-studio-contacts.ts:202, :234) cannot produce a card '
  'the company''s crew list cannot see. Stands down for a cross-studio pointer, '
  'which the affiliation RLS refuses anyway, and holds '
  'patina.suppress_affiliation_sync while it writes so the two halves cannot '
  'ping-pong (00592).';

DROP TRIGGER IF EXISTS sync_person_affiliation_from_pointer_trg
  ON public.studio_contacts;
CREATE TRIGGER sync_person_affiliation_from_pointer_trg
  AFTER INSERT OR UPDATE OF company_id ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_person_affiliation_from_pointer();

COMMENT ON COLUMN public.studio_contacts.company_id IS
  'DERIVED POINTER at the person''s open affiliation '
  '(studio_person_affiliations.company_id), kept for the legacy readers that '
  'predate that table — the room itself reads the affiliations, which carry the '
  'role, the dates and the paperwork/signer flags a single id cannot. '
  'BOUND IN BOTH DIRECTIONS: sync_studio_contact_company_pointer() re-derives '
  'this column from the open affiliation, and '
  'sync_person_affiliation_from_pointer() opens (or closes) that affiliation '
  'when this column is written directly — which is what the shipped hooks still '
  'do. So a firm set through the legacy column is a firm the company card''s '
  'crew list can see, and neither writer silently discards the other (00592).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. studio_contact_rules — E7, the contact rule
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_contact_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic, so no FK: person/company → studio_contacts.id,
  -- engagement → project_parties.id (the one per-job override, PD-3).
  subject_type text NOT NULL CHECK (subject_type IN ('person', 'company', 'engagement')),
  subject_id   uuid NOT NULL,

  channels_allowed   text[] NOT NULL DEFAULT '{}',
  channels_forbidden text[] NOT NULL DEFAULT '{}',

  route_to_person_id uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  contact_hours      text,
  -- decision_class → channel_kind. jsonb, not a table: the room reads it whole
  -- and never joins through it.
  escalation_by_class jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason             text,

  set_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  set_at     timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.studio_contact_rules IS
  'E7: what channel is required, forbidden, or routed elsewhere. The ONE home '
  'for a forbidding or routing rule — studio_contacts deliberately carries no '
  'never_text / do_not_contact column. One row per subject; an engagement row '
  'overrides the person''s rule for that job only (PD-3). Omission fails closed '
  'at the composer, never open.';

COMMENT ON COLUMN public.studio_contact_rules.subject_id IS
  'studio_contacts.id when subject_type is person or company; '
  'project_parties.id when it is engagement. No FK — polymorphic.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_contact_rules_subject
  ON public.studio_contact_rules(subject_type, subject_id);

DROP TRIGGER IF EXISTS set_updated_at_studio_contact_rules ON public.studio_contact_rules;
CREATE TRIGGER set_updated_at_studio_contact_rules
  BEFORE UPDATE ON public.studio_contact_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_contact_rules ENABLE ROW LEVEL SECURITY;

-- One predicate, two legs: a card rule gates on the card's org; a job override
-- gates on the project's lead designer, exactly as project_parties does.
DROP POLICY IF EXISTS studio_contact_rules_member_select ON public.studio_contact_rules;
CREATE POLICY studio_contact_rules_member_select
  ON public.studio_contact_rules FOR SELECT
  TO authenticated
  USING (
    CASE subject_type
      WHEN 'engagement' THEN public.is_studio_comember(public.project_party_designer(subject_id))
      ELSE public.is_active_studio_member(public.studio_contact_org(subject_id))
    END
  );

DROP POLICY IF EXISTS studio_contact_rules_member_insert ON public.studio_contact_rules;
CREATE POLICY studio_contact_rules_member_insert
  ON public.studio_contact_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE subject_type
      WHEN 'engagement' THEN public.is_studio_comember(public.project_party_designer(subject_id))
      ELSE public.is_active_studio_member(public.studio_contact_org(subject_id))
    END
  );

DROP POLICY IF EXISTS studio_contact_rules_member_update ON public.studio_contact_rules;
CREATE POLICY studio_contact_rules_member_update
  ON public.studio_contact_rules FOR UPDATE
  TO authenticated
  USING (
    CASE subject_type
      WHEN 'engagement' THEN public.is_studio_comember(public.project_party_designer(subject_id))
      ELSE public.is_active_studio_member(public.studio_contact_org(subject_id))
    END
  )
  WITH CHECK (
    CASE subject_type
      WHEN 'engagement' THEN public.is_studio_comember(public.project_party_designer(subject_id))
      ELSE public.is_active_studio_member(public.studio_contact_org(subject_id))
    END
  );

DROP POLICY IF EXISTS studio_contact_rules_member_delete ON public.studio_contact_rules;
CREATE POLICY studio_contact_rules_member_delete
  ON public.studio_contact_rules FOR DELETE
  TO authenticated
  USING (
    CASE subject_type
      WHEN 'engagement' THEN public.is_studio_comember(public.project_party_designer(subject_id))
      ELSE public.is_active_studio_member(public.studio_contact_org(subject_id))
    END
  );

REVOKE ALL ON TABLE public.studio_contact_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_contact_rules TO authenticated;
GRANT ALL ON public.studio_contact_rules TO service_role;
