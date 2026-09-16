BEGIN;
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
--      retainage_bps, warranty_until, and the three designated-person FKs —
--      each guarded by assert_studio_contact_designations() to a PERSON card
--      in the SAME studio, never the row itself, since a self-FK into a table
--      holding both kinds of card and every tenant's cards says none of that).
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
--      engagement. channels_allowed / channels_forbidden are CHECKed against
--      00593's channel_kind vocabulary plus the rule-only token `sms` (a value
--      the composer cannot match is a silent permission, not a forbidding; and
--      without `sms` the fixtures' "phone yes, text no" cannot be written down
--      at all — r4 R4-M2), and route_to_person_id — the
--      fourth self-FK into studio_contacts — is guarded by
--      assert_studio_contact_rule_route() to a PERSON card in the subject's
--      OWN studio, never the subject itself.
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

-- ── The three designated people must be people, in this studio ──────────────
-- (r5 M5-4, ruling R-AP.) All three columns are plain self-FKs into
-- studio_contacts, which holds BOTH kinds of card AND every studio's cards, so
-- the FK alone permits another tenant's card, a COMPANY card, or the row
-- itself as its own site contact. This is the same hole
-- assert_affiliation_card_kinds() closes for studio_person_affiliations, and it
-- is closed the same way: a CHECK cannot see another table, so a BEFORE
-- trigger asserts it. paperwork_contact_person_id is what P3's trade-upload
-- chase (PR-a) will mint a token against — a cross-tenant value there is a
-- cross-tenant paperwork link waiting for a SECURITY DEFINER reader that does
-- not re-check.
CREATE OR REPLACE FUNCTION public.assert_studio_contact_designations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_col  text;
  v_id   uuid;
  v_kind text;
  v_org  uuid;
BEGIN
  FOR v_col, v_id IN
    SELECT t.col, t.ref
      FROM (VALUES
              ('paperwork_contact_person_id', NEW.paperwork_contact_person_id),
              ('signer_person_id',            NEW.signer_person_id),
              ('site_contact_person_id',      NEW.site_contact_person_id)
           ) AS t(col, ref)
     WHERE t.ref IS NOT NULL
  LOOP
    IF v_id = NEW.id THEN
      RAISE EXCEPTION 'designated_person_is_self'
        USING HINT = v_col || ' may not name the card it sits on: a firm is not '
                     'its own site contact, and a person is not their own signer.';
    END IF;

    SELECT sc.entity_kind, sc.organization_id INTO v_kind, v_org
      FROM public.studio_contacts sc WHERE sc.id = v_id;

    IF v_kind IS DISTINCT FROM 'person' THEN
      RAISE EXCEPTION 'designated_person_not_a_person'
        USING HINT = v_col || ' must name a PERSON card. The studio chases '
                     'paper at a human, not at a firm.';
    END IF;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'designated_person_other_studio'
        USING HINT = v_col || ' must name a card in the SAME studio. A '
                     'designated person is a fact inside one rolodex.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_studio_contact_designations()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_studio_contact_designations() IS
  'BEFORE INSERT/UPDATE on studio_contacts: paperwork_contact_person_id, '
  'signer_person_id and site_contact_person_id must each name a PERSON card in '
  'the SAME organization_id, and never the row itself '
  '(designated_person_not_a_person / designated_person_other_studio / '
  'designated_person_is_self). The self-FKs cannot say this — studio_contacts '
  'holds both kinds of card and every studio''s cards — and '
  'paperwork_contact_person_id is the pointer the trade-upload chase mints a '
  'token against (00592, r5 M5-4/R-AP).';

DROP TRIGGER IF EXISTS assert_studio_contact_designations_trg
  ON public.studio_contacts;
CREATE TRIGGER assert_studio_contact_designations_trg
  BEFORE INSERT OR UPDATE OF
    paperwork_contact_person_id, signer_person_id, site_contact_person_id,
    organization_id
  ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.assert_studio_contact_designations();

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
  '(studio_person_affiliations_distinct_cards_check). '
  'N PERSONS x N FIRMS (R-AO): a person may hold MORE THAN ONE open row — the '
  'sole proprietor who also crews for a GC (crm-model §4) — and neither '
  'trigger below ever closes a row it was not pointed at. '
  'studio_contacts.company_id (00417) is now a DERIVED POINTER at '
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
          WHERE sc.id = NEW.company_id) IS DISTINCT FROM 'company' THEN
    -- 00417's studio_contacts_company_link_check permits the legacy pointer to
    -- name a person card, or the card itself. Opening the affiliation would
    -- raise out of assert_affiliation_card_kinds() and take the whole
    -- studio_contacts write down with it, so this half stands down for the
    -- same reason it stands down for a cross-studio pointer: the malformation
    -- is older than this file and is left visible, not mirrored.
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

REVOKE ALL ON FUNCTION public.sync_person_affiliation_from_pointer()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_person_affiliation_from_pointer() IS
  'AFTER INSERT/UPDATE OF company_id on studio_contacts: opens the person''s '
  'affiliation at the firm the pointer names, and closes THAT ONE — the one the '
  'pointer named — when the pointer is cleared. It never touches a sibling '
  'affiliation: the model is N persons x N firms (R-AO), a person may stand '
  'open at two firms, and the pointer simply holds the most recently begun. '
  'Clearing the pointer re-derives it onto any surviving open affiliation. The '
  'reverse half of '
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
  'crew list can see, and neither writer silently discards the other. ONE '
  'POINTER, MANY AFFILIATIONS (R-AO): writing this column opens the '
  'affiliation it names and leaves every sibling standing, so moving the '
  'pointer is not a way to end a person''s other firm (00592).';

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
  'project_parties.id when it is engagement. No FK — polymorphic. The pairing '
  'is ENFORCED anyway, on every rule whether it routes or not, by '
  'assert_studio_contact_rule_route(): the card must be OF the named kind and '
  'the party must exist (r8 F1). A rule filed under the wrong noun is a rule '
  'the room never finds, and an unfound forbidding rule fails open.';

-- ── The channel vocabulary is CHECKED, both ways (r6 M6-5) ─────────────────
-- This table's own COMMENT promises "Omission fails closed at the composer,
-- never open." A WRONG value is not an omission, and it fails OPEN: unchecked
-- text[] took channels_forbidden = '{carrier pigeon,sms}' happily, and would
-- equally have taken '{never_text}', '{SMS}' or '{txt}' — none of which match
-- anything the composer compares against, so R-S's blocked clause never prints
-- and the forbidding fact is silently not there. Decision 1 made this table the
-- ONE home of that fact precisely so a second reader could not miss it; a
-- non-matching value is that same failure inside the one home. The fixture
-- cases it loses are F-27 Ray Thao (NEVER texted; scheduled through 311) and
-- F-10 Sam Rowe (never texted). W1a ships no writer for this table, which is
-- exactly why it is cheap to close now, before W1b's rule editor becomes the
-- thing that has to be trusted.
--
-- The vocabulary is 00593's channel_kind — the rule names the kinds of channel
-- a card actually carries, and the two lists must be comparable to
-- studio_contact_channels.channel_kind without translation — PLUS ONE TOKEN
-- THAT IS NOT A CHANNEL KIND: `sms` (r4 R4-M2).
--
-- SMS is not a channel kind in this model. It rides on `mobile`, distinguished
-- only by studio_contact_channels.sms_capable — which 00593's header insists is
-- a fact about THE LINE, settled by an evidence test, not a studio's
-- preference. So with the seven kinds alone the two fixture cases this CHECK's
-- own comment names cannot be written down at all: F-10 Sam Rowe is "email
-- only; phone for emergencies … never texted" and F-27 Ray Thao is "phone and
-- email only; NEVER texted; scheduled through 311". Forbidding `mobile`
-- forbids the voice call BOTH fixtures explicitly permit; permitting `mobile`
-- permits the text. Decision 1 removed never_text from studio_contacts and made
-- this table the ONE home of the forbidding fact (crm-model §2 carries
-- Person.never_text as a required field in its own right, CS4-5, distinct from
-- Reach channel.sms_capable, CS4-7) — so the fact has to be sayable HERE, and
-- "phone yes, text no" is exactly the sentence it has to say.
--
-- `sms` is therefore RULE vocabulary, not channel-row vocabulary: it never
-- appears in studio_contact_channels.channel_kind, and a composer reading a
-- rule resolves it against the mobile line's sms_capable rather than against a
-- channel row of its own. W1a ships no writer for this table, which is why the
-- token is cheap to mint now and expensive at W1b — a rule editor without it
-- writes `mobile` into channels_forbidden and silently loses the distinction
-- the whole fixture pair is built on.
--
-- Stated in the DROP IF EXISTS / ADD idiom so a rerun can widen it.
ALTER TABLE public.studio_contact_rules
  DROP CONSTRAINT IF EXISTS studio_contact_rules_channels_allowed_check;
ALTER TABLE public.studio_contact_rules
  ADD CONSTRAINT studio_contact_rules_channels_allowed_check CHECK (
    channels_allowed <@ ARRAY[
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311',
      -- Not a channel kind — the rule-only token (r4 R4-M2).
      'sms'
    ]::text[]
  );

ALTER TABLE public.studio_contact_rules
  DROP CONSTRAINT IF EXISTS studio_contact_rules_channels_forbidden_check;
ALTER TABLE public.studio_contact_rules
  ADD CONSTRAINT studio_contact_rules_channels_forbidden_check CHECK (
    channels_forbidden <@ ARRAY[
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311',
      -- Not a channel kind — the rule-only token (r4 R4-M2). '{sms}' is
      -- F-10's and F-27's "never texted" WITHOUT forbidding the voice call
      -- on the same mobile line.
      'sms'
    ]::text[]
  );

COMMENT ON COLUMN public.studio_contact_rules.channels_allowed IS
  'The channel kinds this subject may be reached on, from 00593''s '
  'channel_kind vocabulary and CHECKed against it, PLUS the rule-only token '
  '`sms` (r4 R4-M2) — SMS is not a channel kind, it rides on `mobile` and is '
  'settled by studio_contact_channels.sms_capable, a fact about the line. An '
  'empty array is the ordinary state: the rule forbids or routes without '
  'narrowing.';
COMMENT ON COLUMN public.studio_contact_rules.channels_forbidden IS
  'The channel kinds this subject must NEVER be reached on — F-27''s "never '
  'texted", F-10''s "never texted". CHECKed against 00593''s channel_kind '
  'vocabulary: a value the composer cannot match is not a forbidding, it is a '
  'silent permission, and this table is the one home of the fact (r6 M6-5). '
  'The vocabulary carries ONE token that is not a channel kind — `sms` '
  '(r4 R4-M2) — because those two fixtures forbid the TEXT while permitting '
  'the voice call on the same mobile line, and decision 1 left this table as '
  'the only place that sentence can be written. A composer resolves a '
  'forbidden `sms` against the mobile line''s sms_capable, not against a '
  'channel row of its own.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_contact_rules_subject
  ON public.studio_contact_rules(subject_type, subject_id);

DROP TRIGGER IF EXISTS set_updated_at_studio_contact_rules ON public.studio_contact_rules;
CREATE TRIGGER set_updated_at_studio_contact_rules
  BEFORE UPDATE ON public.studio_contact_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── The routed person is a person, in the subject's own studio (r6 M6-4) ────
-- route_to_person_id is the FOURTH self-FK into studio_contacts and the only
-- one R-AP's assert_studio_contact_designations() does not cover — and the FK
-- says nothing for the same reason stated at the top of this file: the table
-- holds BOTH kinds of card AND every studio's cards. Unguarded it took a
-- cross-studio route, a route to a COMPANY card, and a card routed to itself.
--
-- It is not a read leak today (studio_contacts RLS blanks the fetch), and that
-- is precisely the damage: R-L prints the routed person's email and office
-- phone on that line, direction §5.4's do-not-contact state collapses Channels
-- to "Do not contact directly. Write <name> instead.", and R-S appends the
-- routed line wherever a rule blocks. So a dangling or cross-tenant route
-- blanks the ONE line that tells a designer how to reach a do-not-contact
-- person, and a self-route renders "write themselves instead".
--
-- Same shape as assert_affiliation_card_kinds() / R-AP: a CHECK cannot see
-- another table, so a BEFORE trigger asserts it. The subject's org is resolved
-- the way this table's own RLS resolves the subject — off the card for a card
-- subject, through the project for an engagement subject — and an org that will
-- not resolve REFUSES rather than passing a NULL comparison.
--
-- ── And the SUBJECT is held to its own noun, on every rule (r8 F1) ───────────
-- subject_id is polymorphic and unFK'd, so nothing but this trigger can say
-- that subject_type='person' names a PERSON card. Unguarded it took both
-- crossings: a 'person' rule filed against a COMPANY card and a 'company' rule
-- filed against a PERSON card. The RLS legs below catch only the cross-FAMILY
-- slip (studio_contact_org() / project_party_designer() return NULL for the
-- wrong table), never the wrong noun inside studio_contacts.
--
-- The damage is the damage decision 1 made this table the ONE home of that
-- fact to avoid: the room looks a rule up by the noun it is holding — the
-- person card asks for ('person', card_id), the firm card for
-- ('company', card_id) — so a rule filed under the other noun is invisible to
-- every reader that asks correctly, and a FORBIDDING rule nobody finds fails
-- OPEN. That is F-27 Ray Thao (NEVER texted; scheduled through 311) and F-10
-- Sam Rowe (never texted) lost, exactly as the unchecked channel vocabulary
-- below loses them. So the route's early return now sits BELOW the subject
-- test: a routeless rule is still a rule, and it is still inspected.
CREATE OR REPLACE FUNCTION public.assert_studio_contact_rule_route()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subject_kind text;
  v_subject_org  uuid;
  v_route_kind   text;
  v_route_org    uuid;
BEGIN
  -- The subject is inspected on EVERY rule, routed or not (r8 F1).
  IF NEW.subject_type = 'engagement' THEN
    SELECT COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
      INTO v_subject_org
      FROM public.project_parties pp
      JOIN public.projects p ON p.id = pp.project_id
     WHERE pp.id = NEW.subject_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'rule_subject_not_found'
        USING HINT = 'subject_type engagement means subject_id names a row in '
                     'project_parties — the one per-job override (PD-3). No '
                     'party carries that id, so there is no engagement to rule '
                     'on.';
    END IF;
  ELSE
    SELECT sc.entity_kind, sc.organization_id
      INTO v_subject_kind, v_subject_org
      FROM public.studio_contacts sc
     WHERE sc.id = NEW.subject_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'rule_subject_not_found'
        USING HINT = 'subject_type ' || NEW.subject_type || ' means subject_id '
                     'names a studio_contacts card, and no card carries that '
                     'id.';
    END IF;

    IF v_subject_kind IS DISTINCT FROM NEW.subject_type THEN
      RAISE EXCEPTION 'rule_subject_kind_mismatch'
        USING HINT = 'subject_type says ' || NEW.subject_type || ', but that '
                     'card is a ' || COALESCE(v_subject_kind, '<no kind>') ||
                     ' card. The room looks a rule up by the noun on the card '
                     'it is holding, so a rule filed under the other noun is a '
                     'rule no reader finds — and a forbidding rule nobody '
                     'finds fails OPEN.';
    END IF;
  END IF;

  IF NEW.route_to_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.route_to_person_id = NEW.subject_id THEN
    RAISE EXCEPTION 'rule_route_is_self'
      USING HINT = 'route_to_person_id may not name the rule''s own subject: '
                   '"write themselves instead" is not a route.';
  END IF;

  IF v_subject_org IS NULL THEN
    RAISE EXCEPTION 'rule_subject_studio_unresolved'
      USING HINT = 'The studio this rule''s subject belongs to could not be '
                   'resolved, so the route cannot be checked against it. A '
                   'route that cannot be checked is not a route that may be '
                   'stored.';
  END IF;

  SELECT sc.entity_kind, sc.organization_id INTO v_route_kind, v_route_org
    FROM public.studio_contacts sc WHERE sc.id = NEW.route_to_person_id;

  IF v_route_kind IS DISTINCT FROM 'person' THEN
    RAISE EXCEPTION 'rule_route_not_a_person'
      USING HINT = 'route_to_person_id must name a PERSON card. "Write '
                   '<firm> instead" is not a name a designer can write to.';
  END IF;
  IF v_route_org IS DISTINCT FROM v_subject_org THEN
    RAISE EXCEPTION 'rule_route_other_studio'
      USING HINT = 'route_to_person_id must name a card in the SAME studio as '
                   'the rule''s subject. A route is a fact inside one rolodex.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_studio_contact_rule_route()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_studio_contact_rule_route() IS
  'BEFORE INSERT/UPDATE on studio_contact_rules, in two parts. THE SUBJECT, on '
  'every rule whether it routes or not (r8 F1): subject_type person/company '
  'must match the named card''s entity_kind and subject_type engagement must '
  'name a live project_parties row (rule_subject_kind_mismatch / '
  'rule_subject_not_found) — subject_id is polymorphic and unFK''d, the RLS '
  'legs catch only the cross-FAMILY slip, and a rule filed under the wrong '
  'noun is invisible to the reader that asks by the right one, so a FORBIDDING '
  'rule fails OPEN. THE ROUTE: route_to_person_id must name '
  'a PERSON card in the SAME studio as the rule''s subject, and never the '
  'subject itself (rule_route_not_a_person / rule_route_other_studio / '
  'rule_route_is_self / rule_subject_studio_unresolved). The fourth self-FK '
  'into studio_contacts, and the one R-AP''s '
  'assert_studio_contact_designations() does not cover; the FK cannot say this '
  'because studio_contacts holds both kinds of card and every studio''s cards. '
  'The routed line is what the room prints where a rule blocks (R-L, R-S, '
  'direction §5.4), so a dangling or cross-tenant route blanks the one line '
  'that says how to reach the person (00592, r6 M6-4).';

DROP TRIGGER IF EXISTS assert_studio_contact_rule_route_trg
  ON public.studio_contact_rules;
CREATE TRIGGER assert_studio_contact_rule_route_trg
  BEFORE INSERT OR UPDATE OF route_to_person_id, subject_id, subject_type
  ON public.studio_contact_rules
  FOR EACH ROW EXECUTE FUNCTION public.assert_studio_contact_rule_route();

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
SELECT 'rerun 00592 ok';
-- ═══════════════════════════════════════════════════════════════════════════
-- 00593 — People room CRM · W1a (2 of 3): typed reach channels
--
-- E6. Today a person or firm has exactly one `phone` and one `email` on the
-- rolodex card (00417:70-120) and a second, independent snapshot on every party
-- row (00281:48-61). A mobile, an office line, a dispatch line and an
-- after-hours line are four different facts with four different consent and
-- SMS-capability stories; one text column cannot hold them.
--
-- studio_contact_channels is the typed list, owned by the card that carries it.
-- `value` is NORMALISED on the way in by the same idiom 00281 and 00583 use:
-- one BEFORE INSERT/UPDATE trigger per table, calling the shared pure helper
-- public.normalize_phone_e164(text) for phone kinds; emails are lowercased and
-- trimmed. Unlike the party/lead normalisers, `value` is NOT NULL here, so an
-- unparseable phone falls back to its trimmed raw text rather than becoming
-- NULL — the number the studio typed is never lost, it simply gets no E.164.
--
-- BACKFILL: every phone and email already on a rolodex card, plus the phone and
-- email on any party row already folded to a card (studio_contact_id set,
-- 00418). ON CONFLICT DO NOTHING against the (owner, kind, value) unique index,
-- which is evaluated AFTER the normalising trigger — so the same number typed
-- three different ways lands once. sms_capable is NOT asserted from the card:
-- it keeps its safe `false` default unless public.channel_value_was_on_sms_rail()
-- says the number really was on an SMS rail — an sms_conversations thread on it,
-- or a FIELD-kind seat on it that has been asked for consent. The mere existence
-- of a folded party row is not evidence (party_kind also covers architect,
-- photographer, stager, client, client_rep, vendor, other) (CS4-7 — an office
-- line must never be offered an SMS invite, and person cards routinely carry
-- office numbers).
--
-- The normalising rule itself lives in ONE function, public.normalize_channel_value
-- (created here), because 00594 keys its consent record on the same value. Two
-- statements of the same rule drift: the consent RPC refused an unparseable
-- phone while this trigger kept the raw text, leaving channel rows no consent
-- record could ever be written for.
--
-- The kind vocabulary is crm-model §2's Reach channel list: four voice lines,
-- two email doors (general + AP), and portal_311. status is crm-model's
-- ok/bounced/unsubscribed/dead, with ok spelled `active`.
--
-- RLS gates on the OWNING CARD's organization_id via studio_contact_org(uuid)
-- (00592).
--
-- IT ALSO CLOSES THE REFERENCED SIDE OF THE THREE CARD GUARDS (r8 R8-M2, R-AR).
-- assert_channel_owner_kind (here) and 00592's designation and rule-route
-- guards all fire on the REFERENCING row; nothing fired when the card being
-- pointed AT changed its entity_kind or its studio, which undid all three at
-- once. assert_studio_contact_identity_stable() at the foot of this file is
-- that missing BEFORE UPDATE trigger on studio_contacts — placed here, not in
-- 00592, because it reads studio_contact_channels.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_contact_channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_type text NOT NULL CHECK (owner_type IN ('person', 'company')),
  owner_id   uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,

  channel_kind text NOT NULL CHECK (
    channel_kind IN (
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311'
    )
  ),
  value      text NOT NULL,
  label      text,

  -- An office line must never be offered an SMS invite (CS4-7).
  sms_capable boolean NOT NULL DEFAULT false,

  verified    boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  preferred   boolean NOT NULL DEFAULT false,

  status    text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'bounced', 'unsubscribed', 'dead')),
  status_at timestamptz,

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vocabulary, re-stated as named constraints so a rerun of this file over an
-- existing table really does widen them (CREATE TABLE IF NOT EXISTS would skip
-- the inline versions above) — the 00592 idiom. Both lists are crm-model §2.
--
-- channel_kind carries the four voice lines, BOTH email doors (the general
-- address and the AP address the bookkeeper pays from — direction §2.2 E6, and
-- the partner of 00592's remit_to), and portal_311, the only way F-27 is
-- reachable at all. DELIBERATELY NOT HERE: crm-model's app / account /
-- field_link / paper. Those are not addresses a studio member types onto a
-- card — they are reach tiers derived from an access grant (E9) and belong
-- with that object, not in this table's vocabulary.
ALTER TABLE public.studio_contact_channels
  DROP CONSTRAINT IF EXISTS studio_contact_channels_channel_kind_check;
ALTER TABLE public.studio_contact_channels
  ADD CONSTRAINT studio_contact_channels_channel_kind_check CHECK (
    channel_kind IN (
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311'
    )
  );

-- status: crm-model §2 names ok/bounced/unsubscribed/dead. 'ok' is spelled
-- 'active' here (a rename, harmless); 'bounced' is not optional — it is the
-- commonest verdict the email rail writes back (direction §7 P3, CS6-10, which
-- also requires the date status_at carries).
ALTER TABLE public.studio_contact_channels
  DROP CONSTRAINT IF EXISTS studio_contact_channels_status_check;
ALTER TABLE public.studio_contact_channels
  ADD CONSTRAINT studio_contact_channels_status_check CHECK (
    status IN ('active', 'bounced', 'unsubscribed', 'dead')
  );

COMMENT ON TABLE public.studio_contact_channels IS
  'E6: every way a person or firm is actually reachable, typed. Owned by the '
  'rolodex card (studio_contacts) — owner_type must equal that card''s own '
  'entity_kind, enforced by assert_channel_owner_kind(); `value` is normalised on write — phones to '
  'E.164 via normalize_phone_e164 (00281), emails lowercased. Consent is NOT '
  'here: it is a fact about the channel VALUE per studio, in '
  'studio_channel_consent (00594).';

COMMENT ON COLUMN public.studio_contact_channels.value IS
  'Normalised by normalize_studio_contact_channel(): E.164 for phone kinds '
  '(falling back to the trimmed raw text when unparseable, since the column is '
  'NOT NULL), lower(btrim(...)) for the two email kinds, trimmed raw text for '
  'portal_311 (a portal handle is neither).';
COMMENT ON COLUMN public.studio_contact_channels.channel_kind IS
  'crm-model §2 Reach channel. mobile/office/dispatch/after_hours are voice '
  'lines; email is the general address and ap_email the one the bookkeeper pays '
  'from (pairs with 00592''s remit_to); portal_311 is a municipal scheduling '
  'portal — F-27 is reachable no other way. app/account/field_link/paper are '
  'NOT kinds here: they are reach tiers derived from an access grant (E9).';
COMMENT ON COLUMN public.studio_contact_channels.status IS
  'active | bounced | unsubscribed | dead — the send rails'' verdict on the '
  'channel, dated by status_at (crm-model §2 spells active as ok). Distinct '
  'from consent, which is per studio per value.';

-- ── Normalisation ───────────────────────────────────────────────────────────
-- The channel-key rule lives in ONE function, because 00594's consent record is
-- keyed on the same value and the two must never disagree. A rule stated twice
-- drifted once already: the consent RPC refused an unparseable phone while this
-- trigger kept the trimmed raw text, so a channel row could exist that no
-- consent record could ever be written for.
--
-- IMMUTABLE and side-effect-free, so it is safe to call from a trigger, from a
-- SECURITY DEFINER RPC, and from a backfill's WHERE clause alike.
CREATE OR REPLACE FUNCTION public.normalize_channel_value(
  p_channel_kind text,
  p_value        text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_channel_kind IN ('email', 'ap_email')
      THEN NULLIF(lower(btrim(COALESCE(p_value, ''))), '')
    -- A portal handle/URL is neither phone nor address: keep what was typed.
    WHEN p_channel_kind = 'portal_311'
      THEN NULLIF(btrim(COALESCE(p_value, '')), '')
    ELSE COALESCE(
           public.normalize_phone_e164(p_value),
           NULLIF(btrim(COALESCE(p_value, '')), '')
         )
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_channel_value(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_channel_value(text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.normalize_channel_value(text, text) IS
  'The ONE channel-key rule: E.164 for phone kinds, falling back to the trimmed '
  'raw text when unparseable; lower(btrim(...)) for email and ap_email; trimmed '
  'raw for portal_311. NULL only when nothing was typed. Called by '
  'normalize_studio_contact_channel() (this file) and by 00594''s '
  'record_channel_consent() / record_channel_reconsent(), so a channel row and '
  'its consent record always land on the same key.';

-- ── The SMS-rail evidence test ──────────────────────────────────────────────
-- sms_capable says "this line takes a text". The backfill has to answer that
-- from what the database already knows, and the honest answers are narrow:
--
--   · sms_conversations holds one row per (twilio_number, phone_e164) (00282).
--     A thread exists only because a message actually moved on that number.
--   · a project_parties seat of a FIELD kind (gc / sub / installer / receiver —
--     sms-inbound/pipeline.ts's FIELD_KINDS, the only kinds the rail covers)
--     whose sms_consent_status has left `not_asked`: the number was really put
--     on the rail, even if nothing has been sent yet.
--
-- Deliberately PHONE-GLOBAL: being an SMS-capable line is a fact about the
-- line, not about one studio's consent (that is studio_channel_consent's job,
-- 00594). Deliberately NOT "some party row exists with this number": party_kind
-- also covers architect, photographer, stager, client, client_rep, vendor and
-- other, and marking those SMS-capable is the assertion crm-model §2 CS4-7
-- exists to deny — F-10 Sam Rowe, "never texted", and F-27 Ray Thao, "NEVER
-- texted; scheduled through 311", are both ordinary folded party rows.
--
-- Backfill helper only: SECURITY INVOKER and not granted to authenticated, so
-- it cannot become a half-RLS'd reader of two tables from the portal.
CREATE OR REPLACE FUNCTION public.channel_value_was_on_sms_rail(p_value text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p_value IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.sms_conversations c
          WHERE c.phone_e164 = p_value
       )
       OR EXISTS (
         SELECT 1 FROM public.project_parties pp
          WHERE public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone))
                = p_value
            AND pp.party_kind IN ('gc', 'sub', 'installer', 'receiver')
            AND COALESCE(pp.sms_consent_status, 'not_asked') <> 'not_asked'
       )
     );
$$;

REVOKE ALL ON FUNCTION public.channel_value_was_on_sms_rail(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.channel_value_was_on_sms_rail(text) TO service_role;

COMMENT ON FUNCTION public.channel_value_was_on_sms_rail(text) IS
  'TRUE when a normalised phone really was on an SMS rail: an sms_conversations '
  'thread exists on it (00282), or a FIELD-kind project_parties seat '
  '(gc/sub/installer/receiver) on it has been asked for consent at all. The '
  'evidence test 00593''s backfill uses for sms_capable — the mere existence of '
  'a party row is NOT evidence, since party_kind also covers architect, '
  'photographer, stager, client, client_rep, vendor and other (crm-model §2 '
  'CS4-7). Phone-global on purpose: SMS capability is a fact about the line, '
  'not about a studio''s consent (00593).';

CREATE OR REPLACE FUNCTION public.normalize_studio_contact_channel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- COALESCE to '' because value is NOT NULL here: the number the studio typed
  -- is never lost, it simply gets no E.164.
  NEW.value := COALESCE(
    public.normalize_channel_value(NEW.channel_kind, NEW.value),
    ''
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_studio_contact_channel() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.normalize_studio_contact_channel() IS
  'BEFORE INSERT/UPDATE on studio_contact_channels: defers entirely to '
  'normalize_channel_value(), the one channel-key rule 00594''s consent RPCs '
  'also use. Same shape as 00281''s normalize_party_phone_e164 and 00583''s two '
  'lead/client normalisers — a per-table trigger fn over one shared pure '
  'helper (00593).';

DROP TRIGGER IF EXISTS normalize_studio_contact_channel_trg ON public.studio_contact_channels;
CREATE TRIGGER normalize_studio_contact_channel_trg
  BEFORE INSERT OR UPDATE ON public.studio_contact_channels
  FOR EACH ROW EXECUTE FUNCTION public.normalize_studio_contact_channel();

DROP TRIGGER IF EXISTS set_updated_at_studio_contact_channels ON public.studio_contact_channels;
CREATE TRIGGER set_updated_at_studio_contact_channels
  BEFORE UPDATE ON public.studio_contact_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── owner_type has to be the kind the card actually is ──────────────────────
-- owner_type's CHECK says person|company; owner_id's FK says "some card".
-- Neither says they agree, so a company card could carry owner_type='person'
-- and be offered an SMS invite as a person, or a person card could sit in a
-- firm's Reach list as the firm's own line. A CHECK cannot reach studio_contacts,
-- so this is a BEFORE trigger — the same shape as 00592's
-- assert_affiliation_card_kinds().
CREATE OR REPLACE FUNCTION public.assert_channel_owner_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT sc.entity_kind INTO v_kind
    FROM public.studio_contacts sc WHERE sc.id = NEW.owner_id;

  IF v_kind IS DISTINCT FROM NEW.owner_type THEN
    RAISE EXCEPTION 'channel_owner_kind_mismatch'
      USING HINT = 'studio_contact_channels.owner_type must equal the card''s '
                   'own entity_kind: a company card''s channels are '
                   'owner_type = company, a person card''s are person.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_channel_owner_kind()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_channel_owner_kind() IS
  'BEFORE INSERT/UPDATE on studio_contact_channels: owner_type must equal '
  'studio_contacts.entity_kind for owner_id (channel_owner_kind_mismatch). The '
  'column CHECK and the FK each say half of this and neither says they agree '
  '(00593).';

DROP TRIGGER IF EXISTS assert_channel_owner_kind_trg ON public.studio_contact_channels;
CREATE TRIGGER assert_channel_owner_kind_trg
  BEFORE INSERT OR UPDATE OF owner_type, owner_id
  ON public.studio_contact_channels
  FOR EACH ROW EXECUTE FUNCTION public.assert_channel_owner_kind();

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The ON CONFLICT arbiter for the backfill (and for every later re-fold). The
-- normalising trigger runs first, so the arbiter sees the normalised value.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_contact_channels_owner_kind_value
  ON public.studio_contact_channels(owner_id, channel_kind, value);

-- "Who holds this number / address" — the dedupe and consent join.
CREATE INDEX IF NOT EXISTS idx_studio_contact_channels_value
  ON public.studio_contact_channels(value);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.studio_contact_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_contact_channels_member_select ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_select
  ON public.studio_contact_channels FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(owner_id)));

DROP POLICY IF EXISTS studio_contact_channels_member_insert ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_insert
  ON public.studio_contact_channels FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_studio_member(public.studio_contact_org(owner_id)));

DROP POLICY IF EXISTS studio_contact_channels_member_update ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_update
  ON public.studio_contact_channels FOR UPDATE
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(owner_id)))
  WITH CHECK (public.is_active_studio_member(public.studio_contact_org(owner_id)));

DROP POLICY IF EXISTS studio_contact_channels_member_delete ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_delete
  ON public.studio_contact_channels FOR DELETE
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(owner_id)));

REVOKE ALL ON TABLE public.studio_contact_channels FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_contact_channels TO authenticated;
GRANT ALL ON public.studio_contact_channels TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill
-- ═══════════════════════════════════════════════════════════════════════════
-- (a) Rolodex card phones. The card holds ONE untyped number; nothing on it
--     says which kind of line it is, so this statement asserts as little as it
--     can get away with.
--
--     sms_capable STAYS AT ITS `false` DEFAULT UNLESS THERE IS EVIDENCE.
--     sms_capable exists to deny exactly the thing a blanket `true` would
--     assert: "an office line must not be offered an SMS invite" (crm-model §2
--     CS4-7, direction §5.1). Person cards carrying an office, showroom,
--     dispatch or 311-only number are ordinary in the fixture (F-13 Ingrid,
--     F-14 Rosa, F-17 Jim, F-20 Claire, F-27 Ray), and this statement runs ONCE
--     — a wrong `true` is then a card the studio has to correct by hand.
--
--     THE EVIDENCE IS AN SMS RAIL, NOT A ROW. A party row folded onto the card
--     (00418) proves only that the studio wrote the number down: party_kind
--     ranges over architect, photographer, stager, client, client_rep, vendor
--     and other, none of which the SMS rail covers (FIELD_KINDS = gc | sub |
--     installer | receiver, sms-inbound/pipeline.ts). Sam Rowe the architect
--     (F-10, "never texted") and Ray Thao at the AHJ (F-27, "NEVER texted;
--     scheduled through 311") both have folded rows, and existence alone marked
--     both SMS-capable — the exact assertion CS4-7 exists to deny. So the test
--     is one of two real signals, both phone-global because being an SMS line is
--     a fact about the LINE, not about a studio's consent:
--       · an sms_conversations row on the normalised number — the Field
--         Coordination thread table, keyed (twilio_number, phone_e164) (00282).
--         A thread exists only because a message actually moved.
--       · or a folded party row on a FIELD_KINDS seat whose sms_consent_status
--         has moved off `not_asked` — the number was really put on the rail,
--         even if nothing has been sent yet.
--     Everything else keeps `false` and the `line type unconfirmed` label, so
--     W1b's Reach editor asks the studio rather than asserting for it. Leg (c)
--     below applies the SAME test rather than a literal `true`, so the two legs
--     agree by construction rather than racing the ON CONFLICT.
--
--     channel_kind is still `mobile` for a person and `office` for a firm —
--     the vocabulary has no "unknown" and a row needs some kind — but where
--     there is no SMS evidence the label says so, so W1b's Reach editor can
--     show the studio which lines it is being asked to type.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
SELECT sc.entity_kind,
       sc.id,
       CASE WHEN sc.entity_kind = 'person' THEN 'mobile' ELSE 'office' END,
       COALESCE(sc.phone_e164, sc.phone),
       ev.texted,
       CASE WHEN sc.entity_kind = 'person' AND NOT ev.texted
            THEN 'From the card (00593 backfill) — line type unconfirmed'
            ELSE 'From the card (00593 backfill)' END
FROM public.studio_contacts sc
CROSS JOIN LATERAL (
  SELECT sc.entity_kind = 'person'
         AND public.channel_value_was_on_sms_rail(
               public.normalize_channel_value('mobile', COALESCE(sc.phone_e164, sc.phone))
             ) AS texted
) ev
WHERE btrim(COALESCE(sc.phone_e164, sc.phone, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- (b) Rolodex card emails.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, label)
SELECT sc.entity_kind, sc.id, 'email', sc.email, 'From the card (00593 backfill)'
FROM public.studio_contacts sc
WHERE btrim(COALESCE(sc.email, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- (c) Party-row phones, for parties already folded onto a PERSON card (00418).
--     The snapshot on the row is often the only place a working number lives.
--     Same evidence test as leg (a) — a roster row is where the number came
--     from, not proof it is a mobile: F-27's 311 desk line and F-10's
--     emergency-only number arrive here exactly the same way.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
SELECT 'person', sc.id, 'mobile', COALESCE(pp.phone_e164, pp.phone),
       public.channel_value_was_on_sms_rail(
         public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone))),
       CASE WHEN public.channel_value_was_on_sms_rail(
                   public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone)))
            THEN 'From a project roster (00593 backfill)'
            ELSE 'From a project roster (00593 backfill) — line type unconfirmed' END
FROM public.project_parties pp
JOIN public.studio_contacts sc
  ON sc.id = pp.studio_contact_id AND sc.entity_kind = 'person'
WHERE btrim(COALESCE(pp.phone_e164, pp.phone, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- (d) Party-row emails, same fold.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, label)
SELECT 'person', sc.id, 'email', pp.email, 'From a project roster (00593 backfill)'
FROM public.project_parties pp
JOIN public.studio_contacts sc
  ON sc.id = pp.studio_contact_id AND sc.entity_kind = 'person'
WHERE btrim(COALESCE(pp.email, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- The card cannot change WHAT IT IS or WHOSE IT IS while something holds it
-- ═══════════════════════════════════════════════════════════════════════════
-- (r8 R8-M2, ruling R-AR.) The three guards this wave adds —
-- assert_studio_contact_designations() (00592), assert_studio_contact_rule_route()
-- (00592) and assert_channel_owner_kind() (above) — all fire on the REFERENCING
-- row only: the card that holds the designation, the rule that holds the route,
-- the channel that holds owner_type. NOTHING fires when the card being pointed
-- AT changes what it is or whose it is. Both columns are ordinary
-- member-writable columns on studio_contacts (00417's member UPDATE policy) and
-- entity_kind is one the shipped data layer already writes on update
-- (packages/supabase/src/hooks/use-studio-contacts.ts). So ONE UPDATE undid all
-- three at once:
--
--   · flip a person card to a company card and it carries channels with
--     owner_type = 'person' — the exact state assert_channel_owner_kind() was
--     written to prevent ("a company card could be offered an SMS invite as a
--     person");
--   · a firm's paperwork_contact_person_id then names a FIRM, and after an org
--     move names a card in ANOTHER STUDIO — 00592's own "cross-tenant paperwork
--     link waiting for a SECURITY DEFINER reader that does not re-check", which
--     is what P3's trade-upload chase (PR-a) mints a token against;
--   · a contact rule routes to a firm, in another studio — and R-L / R-S print
--     that routed person's name as the one line telling a designer how to reach
--     a do-not-contact person.
--
-- The cheapest correct answer, and the one ruled: REFUSE the change while any
-- channel, designation, rule route, rule SUBJECT or affiliation still points at
-- the card, and name in the hint what holds it. The studio's way out is the same one the room
-- already offers — detach the dependents (or merge the card, PR-o) and then
-- change it — and the refusal is legible rather than a constraint violation
-- three tables away.
--
-- IT REFUSES A CHANGE, NOT A RESTATEMENT: `UPDATE OF` fires whenever the column
-- is in the SET list, unchanged value included, and the shipped hook writes
-- entity_kind on every edit that passes one. So the first test is IS DISTINCT
-- FROM; an UPDATE that merely restates the card's own kind passes through.
--
-- This guard lives in 00593 rather than 00592 for one reason: it reads
-- studio_contact_channels, which 00592 has not created yet. Same shape as the
-- three guards it completes.
CREATE OR REPLACE FUNCTION public.assert_studio_contact_identity_stable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_holders text[] := ARRAY[]::text[];
  v_n       integer;
BEGIN
  IF NEW.entity_kind    IS NOT DISTINCT FROM OLD.entity_kind
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_contact_channels c
   WHERE c.owner_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' reach channel(s) on this card');
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_contacts sc
   WHERE sc.paperwork_contact_person_id = OLD.id
      OR sc.signer_person_id            = OLD.id
      OR sc.site_contact_person_id      = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' designation(s) naming it on other cards');
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_contact_rules r
   WHERE r.route_to_person_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' contact rule(s) routing to it');
  END IF;

  -- THE FIFTH HOLDER: the card a rule is ABOUT, not only the card it routes TO
  -- (r9 R5-M1). studio_contact_rules.subject_id (00592:721) is polymorphic and
  -- deliberately unFK'd, and assert_studio_contact_rule_route() polices it from
  -- the RULE side only (rule_subject_kind_mismatch, 00592:929-937 — added for
  -- r8 F1 because "a rule filed under the other noun is invisible to every
  -- reader that asks correctly, and a FORBIDDING rule nobody finds fails
  -- OPEN"). Omitting it here left the card side of that same hole open: one
  -- member-reachable `UPDATE studio_contacts SET entity_kind` — a column the
  -- shipped hook writes on every edit — flipped a rule's subject to the other
  -- noun and the forbidding rule went unfindable; and the organization_id leg
  -- did the same for rule_route_other_studio, leaving the rule ruling about a
  -- card in another tenant. Worse, the stranded row could never be repaired:
  -- any later write to it raises the very error the rule-side guard exists to
  -- raise, so W1b's rule editor could not undo what the card editor did.
  -- 'engagement' subjects name a project_parties row, not a card, so they are
  -- not this card's holders.
  SELECT count(*) INTO v_n
    FROM public.studio_contact_rules r
   WHERE r.subject_type IN ('person', 'company')
     AND r.subject_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' contact rule(s) filed against this card');
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_person_affiliations a
   WHERE a.person_id = OLD.id OR a.company_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' affiliation(s) standing on it');
  END IF;

  IF array_length(v_holders, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'studio_contact_identity_held'
      USING HINT = 'This card cannot change its entity_kind or its studio '
                   'while something still points at it or is filed about it: '
                   || array_to_string(v_holders, ', ')
                   || '. Detach or move those first — a company card carrying '
                      'a person''s channels, a designation naming a firm, a '
                      'route into another studio, or a contact rule filed under '
                      'the other noun are states the three guards on those rows '
                      'exist to refuse.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_studio_contact_identity_stable()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_studio_contact_identity_stable() IS
  'BEFORE UPDATE OF entity_kind, organization_id on studio_contacts: refuses '
  'the change (studio_contact_identity_held) while any reach channel, '
  'designation, contact-rule route, contact-rule SUBJECT or affiliation still '
  'points at the card, with a HINT naming what holds it. The three guards this wave adds — '
  'assert_channel_owner_kind, assert_studio_contact_designations, '
  'assert_studio_contact_rule_route — all fire on the REFERENCING row, so one '
  'ordinary UPDATE of the REFERENCED card undid all three at once: a company '
  'card carrying owner_type = person channels, a paperwork designation naming a '
  'firm in another studio, a rule routing across tenants. subject_id is counted '
  'alongside route_to_person_id (r9 R5-M1): flipping a rule SUBJECT''s '
  'entity_kind filed a forbidding rule under the other noun — unfindable to a '
  'reader that asks by the card''s own kind, and unrepairable, since '
  'rule_subject_kind_mismatch then refuses every later write to that row. A '
  'restatement of the same values passes through; only an actual change is '
  'refused (00593, r8 R8-M2, R-AR).';

DROP TRIGGER IF EXISTS assert_studio_contact_identity_stable_trg
  ON public.studio_contacts;
CREATE TRIGGER assert_studio_contact_identity_stable_trg
  BEFORE UPDATE OF entity_kind, organization_id
  ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.assert_studio_contact_identity_stable();
SELECT 'rerun 00593 ok';
-- ═══════════════════════════════════════════════════════════════════════════
-- 00594 — People room CRM · W1a (3 of 3): one consent record per studio per
--          channel value
--
-- E8, and the sharpest gap in the room (G-3, F-12). Consent lives today on
-- project_parties.sms_consent_* — one independent ledger per party row
-- (00281:55-61, evidence columns 00432:4-11). The send gate already knows that
-- is wrong and papers over it by reducing consent across EVERY party row on a
-- phone, phone-globally, across every studio (_shared/sms.ts:174-185). So Pete
-- Rusk's STOP on one studio's job silences him for a studio he never heard
-- from, while his new row still prints "Not asked".
--
-- The true shape, from the six construction seats: consent is a fact about a
-- (studio, channel value) pair. Never per project, never cross-studio.
--
--   1. studio_channel_consent, PK (organization_id, channel_kind, channel_value),
--      carrying every 00432 evidence column plus origin_project_id (so the room
--      can print "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." —
--      ruling R-Q).
--   2. backfill_channel_consent_from_parties() — folds the party ledgers in,
--      per org, with opted_out winning over everything, then the most recent
--      granted, then pending, then not_asked.
--   3. mirror_channel_consent_to_parties() — an AFTER trigger that pushes the
--      record back onto every party row in that org on that number. The
--      project_parties.sms_consent_* columns become a READ-ONLY CACHED MIRROR:
--      two readers, one writer. They are kept, not dropped — every existing
--      reader (the roster view, the chips, the send gate's secondary check)
--      keeps working while the room repoints.
--   4. record_channel_consent(...) — SECURITY DEFINER, studio-member gated. The
--      ONLY write path the portal gets: the table grants authenticated SELECT
--      and nothing else, so a consent fact cannot be written without passing
--      through the membership check, the evidence requirement and the
--      transition gate below.
--   5. record_channel_reconsent(...) — the one named door beside that gate:
--      PR-m's fresh recorded consent after a refusal, written as EVIDENCE onto
--      a record that stays `opted_out` (r7 M7-2). It does not move the status
--      and does not run the double opt-in; only the recipient's YES/START on
--      the inbound rail reopens sending.
--
-- Both RPCs key on public.normalize_channel_value(kind, value) — 00593's own
-- rule, in one function, so a channel row and its consent record can never land
-- on different keys (the RPC used to refuse an unparseable phone the channels
-- table deliberately keeps).
--
-- ORDER IS LOAD-BEARING: the mirror trigger is created AFTER the backfill runs.
-- Creating it first would make the backfill push a consent verdict back down
-- onto sibling party rows, and a row moving to evidenced-`pending` fires
-- 00432's fc_dispatch_optin_invite — a real opt-in SMS, from a migration.
--
-- That ordering only protects THIS file's own fold. At runtime the same hazard
-- is live and worse: one recorded `pending` fans out to every party row in the
-- studio on that number, and each newly-evidenced-pending row fires its own
-- opt-in text — N identical messages to one human from one studio act, on a
-- 10DLC campaign where duplicate opt-in traffic is exactly what gets a campaign
-- filtered.
--
-- THE INVARIANT: project_parties carries AFTER-row triggers that reach the
-- OUTSIDE WORLD, and a mirror write must fire none of them. A mirror write is
-- cache maintenance of a verdict decided elsewhere, never a studio act. So this
-- file REDEFINES BOTH of project_parties' outward-facing AFTER triggers to
-- stand down while the mirror is the one writing, reading one shared flag,
-- patina.suppress_consent_dispatch:
--
--   · fc_dispatch_optin_invite  — lineage 00432:27-68 (the grep-winner body,
--     verbatim below), trigger fc_optin_invite_dispatch created 00284:254-257.
--     Fires on an evidenced `pending`; sends the opt-in invite SMS.
--   · _site_request_consent_granted_dispatch — lineage 00374:3399-3444 (the
--     grep-winner body, verbatim below), trigger
--     site_request_consent_granted_dispatch created 00374:3446-3455. Fires when
--     sms_consent_status flips to `granted`; mints site-request dispatch work
--     and calls site-request-dispatch, which calls sendPartySms — a real text.
--
-- Before this file there was no studio-side path to `granted` at all (the
-- portal caps its own party-row write at `pending`), so the second trigger
-- could only ever fire from the recipient's own inbound YES/START. The mirror
-- creates that path, so the mirror has to close it. A designer writing an
-- evidenced `pending` (or a `granted`) onto a party row DIRECTLY still
-- dispatches, unchanged. Sending for a consent RECORD is W2's hook, once,
-- deliberately — not a trigger's fan-out. The invariant is restated as a
-- COMMENT on project_parties so the third such trigger cannot land unguarded.
--
-- IT IS AN INVARIANT ABOUT SENDING, NOT ABOUT WORK. Standing the triggers down
-- wholesale also stranded the DURABLE half: 00374's trigger is the only caller
-- of site_request_dispatch_after_consent(), and the lifecycle sweep only
-- promotes requests that already hold an outbox row. So a seat the mirror moved
-- to `granted` — every sibling seat an inbound YES covers beyond the ones it
-- transitioned itself, and every seat of a studio-recorded grant — read
-- `granted` while its site request sat in awaiting_consent for ever, its
-- consent_status_snapshot still saying not_asked. The mirror therefore carries
-- its own narrow release: for the seats it just moved onto `granted` it calls
-- site_request_dispatch_after_consent() directly, and ONLY that — no
-- invoke_edge_function. Snapshot and outbox row land in this transaction; the
-- eager wake-up, the one outward act, stays with the party-row trigger, and the
-- lifecycle sweep carries the outbox row the ordinary way. (The inbound rail
-- also writes the party rows FIRST, so on a YES/START the real transition fires
-- the real trigger and the mirror's release finds nothing left to do.)
--
-- THE WRITE DOOR IS A TRANSITION GATE, not just a value check.
-- record_channel_consent() is granted to every authenticated studio member, so
-- it has to enforce in SQL what the shipped portal enforces in TypeScript
-- (use-coordination.ts:519-522, :699-703, :721-733, :745):
--   · `pending`/`granted` require source + evidence + disclosure_version;
--     `opted_out` requires source + evidence (PR-m: a manual mark needs both).
--     `not_asked` is refused outright (R-AG) — it is the absence of a record,
--     not a verdict, and taking it was the one evidence-free door into this
--     table: four arguments erased a recorded grant and its whole 10DLC
--     evidence set, from the record and from every mirrored seat.
--   · Nothing leaves `opted_out` through this door — not to granted, not to
--     pending, not to not_asked. A STOP is the only stored record of a refusal
--     and the RPC may not erase it. And `granted` is refused for as long as
--     refusal_unanswered stands — a STORED FACT, raised by every writer that
--     records a refusal and lowered by NOTHING THIS FILE'S RPCs CAN WRITE
--     (r7 M7-1): only the inbound rail's own service_role write, made when the
--     recipient texts YES or START. It is a column rather than a test
--     on opt_out_at because a refusal is routinely DATELESS (the shipped portal
--     writes opted_out party rows with a NULL sms_opt_out_at on purpose, and the
--     fold mints those records verbatim), and a date test failed OPEN for
--     exactly that population: reconsent() plus a grant walked a real STOP back
--     to `granted` in two calls. PR-m's way back is a FRESH recorded
--     consent, which gets its own named door, record_channel_reconsent() —
--     and that door is EVIDENCE-ONLY (r7 M7-2). It writes the studio's fresh
--     consent onto the record and LEAVES the record at `opted_out`, refusal
--     standing. After r6's M6-3 fix an unanswered refusal refuses EVERY send,
--     the opt-in invite included, so a door that moved the row to `pending`
--     sent nothing, cleared the seats' own backstop through the mirror, and
--     could not be called again (it needs `opted_out`) — the studio was
--     strictly worse off for using it. Sending resumes on the recipient's
--     YES/START and on nothing a studio can type. Both doors state
--     that gate INSIDE the write (the upsert's DO UPDATE … WHERE, the UPDATE's
--     own WHERE) rather than as a read before it: a SELECT … FOR UPDATE locks
--     nothing when the row does not exist yet, and the inbound STOP rail writes
--     this table directly as service_role, so a refusal could land in the gap
--     and be overwritten by the grant that read past it.
--   · EXCEPT ON EMAIL, WHERE THE STUDIO'S FRESH CONSENT IS THE WHOLE WAY BACK
--     (r6 R6-M3). Everything above is written for the SMS rail and defended on
--     10DLC grounds: the recipient's own YES/START is what reopens sending, and
--     the inbound rail is the one writer that lowers refusal_unanswered.
--     channel_kind also admits 'email', and on email that reply DOES NOT EXIST —
--     the inbound rail writes channel_kind 'sms' only (sms-inbound/pipeline.ts),
--     nothing in the tree writes an email consent row, and reconsent() leaves
--     the status where it stands. So an email refusal was PERMANENT: a dead
--     address in that studio's book, with no carrier rule asking for one. PR-m
--     rules "a fresh recorded consent OR an inbound START"; email has only the
--     first half, so on email — and on email alone — a `granted` recorded
--     through this door passes the opted_out gate and lowers the flag. The
--     evidence gate still forces source + evidence + disclosure_version, which
--     is what "a fresh recorded consent" means. `pending` stays refused on
--     email: the double opt-in is the SMS rail's dance.
--   · No write may EMPTY the evidence set: source / evidence /
--     disclosure_version / recorded_by keep what stands when the new verdict
--     does not restate them (R-AG). Laundering is closed by the evidence gate,
--     not by nulling — every status this door accepts must supply its own
--     source and evidence, so a status change has always restated them.
--     Blankness is tested the SQL way throughout — NULLIF(btrim(…), ''), not
--     IS NULL (r6 R6-M2). p_disclosure_version is the one evidence argument the
--     opted_out branch does not require, so a caller sending an empty form
--     field rather than omitting it wrote '' over the stored version, and
--     nothing in the file restores it.
--   · AND A REFUSAL WRITES NONE OF THE CONSENT'S FIVE (r6 R6-M1). source /
--     evidence / recorded_at / disclosure_version / recorded_by belong to the
--     GRANT whose consented_at the record keeps; the refusal has four columns
--     of its own. One ordinary PR-m act — a written kickoff-form grant, then a
--     verbal refusal the studio heard — used to leave the record reading
--     (verbal, "He told me on site") against the grant's date, so R-Q's grant
--     sentence composed to "Verbal consent, 2 May 2025" and the consent's own
--     10DLC artifact was gone with no audit row: W4-M2's failure, arriving from
--     the other side. r7 R7-M1's consolation goes with it — a studio refusal
--     recorded over a texted one no longer "lands on the consent side" either.
--     A second refusal adds no fact the record lacks, and the only space to put
--     it was on top of a consent's evidence.
--   · AND THE REFUSAL HAS AN EVIDENCE SET OF ITS OWN: opt_out_source /
--     opt_out_evidence / opt_out_recorded_at / opt_out_recorded_by, written by
--     every writer that records a refusal (the fold, record_channel_consent's
--     opted_out branch, the inbound STOP rail) and by nothing else — reconsent
--     included (r8 W4-M2). With one shared set, the studio's fresh consent
--     recorded over a STOP destroyed the refusal's own "Replied STOP",
--     inbound_sms, on the record and on every mirrored seat: sending stayed
--     blocked, but the carrier-audit artifact and R-Q's "opted out BY TEXT"
--     were gone. The four columns have no party-row counterpart, so the mirror
--     does not carry them.
--   · NOR MAY A LATER REFUSAL SPEAK FOR AN EARLIER ONE (r7 R7-M1). The record
--     keeps the EARLIEST opt_out_at, and a studio-sourced refusal recorded over
--     an inbound_sms one leaves all four opt_out_* columns standing. The seat
--     gate's hint sends a studio through that door on purpose ("record that
--     refusal here first"), and one ordinary call used to turn
--     (inbound_sms, "Inbound STOP", 3 Dec 2025, NULL) into
--     (verbal, "He told me on site", today, that member) on the record and on
--     every mirrored seat. Nor does the studio's own account land on the
--     CONSENT side instead (r6 R6-M1, above): that side holds the GRANT's
--     evidence. A duplicate refusal simply writes nothing.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_channel_consent (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_kind    text NOT NULL CHECK (channel_kind IN ('sms', 'email')),
  channel_value   text NOT NULL,

  status text NOT NULL DEFAULT 'not_asked'
    CHECK (status IN ('not_asked', 'pending', 'granted', 'opted_out')),
  consented_at timestamptz,
  opt_out_at   timestamptz,

  -- "a refusal stands on this record that the person who made it has not
  -- answered". A FACT, not an inference from a nullable date — see the header.
  refusal_unanswered boolean NOT NULL DEFAULT false,

  -- The 00432 evidence set, verbatim in meaning.
  source text CHECK (source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other')),
  evidence           text,
  recorded_at        timestamptz,
  disclosure_version text,
  recorded_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- THE REFUSAL'S OWN EVIDENCE SET, BESIDE THE CONSENT'S (r8 W4-M2). The record
  -- holds two facts at once once record_channel_reconsent() has been called —
  -- "opted out by text, 3 Dec 2025" AND "fresh signed consent, 11 Sep 2026" —
  -- and one evidence set could only hold the later of them. See the column
  -- comments below.
  opt_out_source text
    CHECK (opt_out_source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other')),
  opt_out_evidence    text,
  opt_out_recorded_at timestamptz,
  opt_out_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- "opted out on Lindqvist 2025-12-03" (CS3-14, ruling R-Q).
  origin_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, channel_kind, channel_value)
);

-- CREATE TABLE IF NOT EXISTS skips the body on a rerun, so the column is also
-- stated as an ALTER (the 00592/00593 idiom).
ALTER TABLE public.studio_channel_consent
  ADD COLUMN IF NOT EXISTS refusal_unanswered boolean NOT NULL DEFAULT false;

ALTER TABLE public.studio_channel_consent
  ADD COLUMN IF NOT EXISTS opt_out_source      text,
  ADD COLUMN IF NOT EXISTS opt_out_evidence    text,
  ADD COLUMN IF NOT EXISTS opt_out_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_recorded_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Same constraint name the inline CHECK above produces, so this is a no-op on
-- the fresh-create path and adds the rule on the ALTER path.
DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.studio_channel_consent'::regclass
       AND conname  = 'studio_channel_consent_opt_out_source_check'
  ) THEN
    ALTER TABLE public.studio_channel_consent
      ADD CONSTRAINT studio_channel_consent_opt_out_source_check
      CHECK (opt_out_source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other'));
  END IF;
END
$ck$;

COMMENT ON TABLE public.studio_channel_consent IS
  'E8: ONE consent record per studio per channel value. Never per project '
  '(00417''s "consent is per engagement" note is superseded by the six '
  'construction seats: consent follows the phone, inside one studio). '
  'project_parties.sms_consent_* is now a read-only cached mirror of this table, '
  'maintained by mirror_channel_consent_to_parties(). Written ONLY through '
  'record_channel_consent() or service_role (the inbound SMS rail).';

COMMENT ON COLUMN public.studio_channel_consent.channel_value IS
  'The phone in E.164 or the lowercased email — the fact consent is about. '
  'Normalised by record_channel_consent(); a phone reassigned to a new human '
  'keeps this record until a fresh consent is written (crm-model §4).';
COMMENT ON COLUMN public.studio_channel_consent.origin_project_id IS
  'The job the consent (or the STOP) came from, so the room can name it in '
  'words. Not a scope: consent is studio-wide.';
COMMENT ON COLUMN public.studio_channel_consent.opt_out_source IS
  'THE REFUSAL''S OWN evidence set (with opt_out_evidence / opt_out_recorded_at '
  '/ opt_out_recorded_by): how the refusal arrived, in its own words, and who '
  'wrote it down. Separate from source/evidence/recorded_at/... because the '
  'record has to hold the refusal AND the studio''s later fresh consent at the '
  'same time — R-Q''s sentence "Opted out by text, 3 Dec 2025, on the Lindqvist '
  'kitchen" is composed from THIS source plus opt_out_at plus '
  'origin_project_id, and record_channel_reconsent() writes the consent side. '
  'Written by every writer that records a refusal — the fold, '
  'record_channel_consent''s opted_out branch, the inbound STOP rail — and '
  'touched by NOTHING else: no consent verdict, and never reconsent (r8 W4-M2, '
  'which found reconsent overwriting source/evidence/recorded_at/'
  'disclosure_version/recorded_by while leaving status opted_out, so the STOP''s '
  'own "Replied STOP" / inbound_sms was destroyed on the record and, through '
  'the mirror, on every seat). These four have no party-row counterpart, so the '
  'mirror never carries them.';

COMMENT ON COLUMN public.studio_channel_consent.refusal_unanswered IS
  'TRUE while a refusal stands that the person who made it has not answered. '
  'Set by every writer that records a refusal (the fold, record_channel_consent, '
  'record_channel_reconsent, the inbound STOP rail) and cleared by ONE writer: '
  'the inbound rail''s own service_role write, made when the recipient replies '
  'YES or START (sms-inbound/pipeline.ts writeChannelConsent). No RPC in this '
  'file lowers it (r7 M7-1 — the upsert used to exempt a record already AT '
  '`granted` from the gate and then set the flag false on that very write, so '
  'one ordinary granted-on-granted call by any studio member turned sending '
  'back on for a folded row carrying an unanswered refusal, with no recipient '
  'involved). '
  'record_channel_consent refuses every verdict but opted_out while it stands, '
  'so reconsent() plus a recorded grant cannot compose their way past a STOP. It is a stored FACT '
  'rather than a test on opt_out_at, because a refusal is routinely dateless: '
  'the shipped portal writes opted_out party rows with a NULL sms_opt_out_at on '
  'purpose (use-coordination.ts — "opted out, date unknown" is the truth), every '
  'pre-00432 row carries no date either, and the fold mints those records '
  'verbatim. Inferring the refusal from the date failed OPEN for exactly that '
  'population.';

-- The inbound rail and the merge sheet both ask "who else holds this number".
CREATE INDEX IF NOT EXISTS idx_studio_channel_consent_value
  ON public.studio_channel_consent(channel_kind, channel_value);

DROP TRIGGER IF EXISTS set_updated_at_studio_channel_consent ON public.studio_channel_consent;
CREATE TRIGGER set_updated_at_studio_channel_consent
  BEFORE UPDATE ON public.studio_channel_consent
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_channel_consent ENABLE ROW LEVEL SECURITY;

-- SELECT only for members. There is deliberately NO insert/update/delete policy
-- and NO write grant for authenticated: record_channel_consent() is the one
-- door, so the membership check and the evidence stamping cannot be walked past.
DROP POLICY IF EXISTS studio_channel_consent_member_select ON public.studio_channel_consent;
CREATE POLICY studio_channel_consent_member_select
  ON public.studio_channel_consent FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

REVOKE ALL ON TABLE public.studio_channel_consent FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.studio_channel_consent TO authenticated;
GRANT ALL ON public.studio_channel_consent TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Backfill from the party ledgers
-- ═══════════════════════════════════════════════════════════════════════════
-- A function, not a bare statement, for two reasons: the fold is the precedence
-- rule the whole room now depends on, so it is worth being able to re-run and
-- to test directly (supabase/tests/people/w1a_identity_channels_consent_test.sql);
-- and it is idempotent (ON CONFLICT DO NOTHING), so re-running never overwrites
-- a consent decision recorded after the fold.
CREATE OR REPLACE FUNCTION public.backfill_channel_consent_from_parties()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH party_org AS (
    SELECT pp.phone_e164,
           pp.project_id,
           pp.sms_consent_status,
           pp.sms_consented_at,
           pp.sms_opt_out_at,
           pp.sms_consent_source,
           pp.sms_consent_evidence,
           pp.sms_consent_recorded_at,
           pp.sms_consent_disclosure_version,
           pp.sms_consent_recorded_by,
           pp.updated_at,
           COALESCE(p.studio_id, public._primary_studio_for(p.designer_id)) AS org
    FROM public.project_parties pp
    JOIN public.projects p ON p.id = pp.project_id
    WHERE pp.phone_e164 IS NOT NULL
  ),
  ranked AS (
    SELECT party_org.*,
           ROW_NUMBER() OVER (
             PARTITION BY org, phone_e164
             ORDER BY CASE sms_consent_status
                        WHEN 'opted_out' THEN 0   -- opted_out wins over everything
                        WHEN 'granted'   THEN 1   -- then the most recent granted
                        WHEN 'pending'   THEN 2
                        ELSE 3                    -- not_asked last
                      END,
                      -- INSIDE THE REFUSAL BUCKET, THE SEAT THAT CARRIES THE
                      -- REFUSAL'S OWN FACTS OUTRANKS ONE THAT CARRIES NONE
                      -- (r2 R2-M1). The date fallback below is COALESCE(...,
                      -- updated_at) — a row-maintenance timestamp, not a
                      -- refusal date. The shipped portal writes `opted_out`
                      -- seats with a NULL sms_opt_out_at, a NULL source and no
                      -- words on purpose (use-coordination.ts), and such a row
                      -- is touched whenever anything on the roster changes, so
                      -- its updated_at routinely outranks the 2025
                      -- sms_opt_out_at of the seat that actually received the
                      -- STOP. The winner supplies the record's status, its
                      -- origin project and (where the winner has one) its
                      -- opt-out date, so picking the dateless sibling mints the
                      -- record with none of the refusal's facts. These two
                      -- legs are inert outside the refusal bucket — every row
                      -- in a granted / pending / not_asked group scores 1 — so
                      -- "then the most recent granted" is unchanged.
                      CASE WHEN sms_consent_status = 'opted_out'
                            AND sms_consent_source IS NOT NULL THEN 0 ELSE 1 END,
                      CASE WHEN sms_consent_status = 'opted_out'
                            AND sms_opt_out_at IS NOT NULL THEN 0 ELSE 1 END,
                      COALESCE(sms_opt_out_at, sms_consented_at,
                               sms_consent_recorded_at, updated_at) DESC NULLS LAST
           ) AS rn
    FROM party_org
    WHERE org IS NOT NULL
  ),
  -- THE REFUSAL IS ASKED OF THE WHOLE GROUP, NOT OF THE WINNING ROW (r8 W4-M1).
  -- ROW_NUMBER() above drops every sibling seat before the predicate below can
  -- see it, so a studio holding two seats on one number — a clean recent grant
  -- and a legacy row reading `granted` while carrying a stale opt-out no later
  -- consent answered — folded to a fully SENDABLE record: inside `granted` the
  -- tiebreak is the most recent date, so the clean grant won and the refusal
  -- went in the bin with the row that carried it. Nothing downstream caught it
  -- either — the send gate's second check (orgHasOptedOutParty) and this file's
  -- own seat gate both filter on sms_consent_status = 'opted_out', and the
  -- contaminated seat reads `granted`. That is exactly the record r7's M7-1
  -- ruled must be minted UNSENDABLE, and it only bites on the first prod fold,
  -- over real project_parties data.
  --
  -- The same CTE carries the refusal's OWN evidence (r8 W4-M2): the refusing
  -- sibling is not the row whose source and words land in the consent evidence
  -- set, so without this the record would say "a refusal stands here" and hold
  -- nothing at all about it. Most recently refused wins when there is more than
  -- one.
  --
  -- IT CARRIES THE REFUSAL'S DATE TOO (r6 R6-M2). `opt_out_at` used to be taken
  -- from the WINNING row while the source and the words came from the refusing
  -- sibling — and in this CTE's own population the winner is a clean grant, so
  -- the record was minted saying "it arrived by text, it said Replied STOP, it
  -- was written down on 2025-11-16" with opt_out_at, the column that carries
  -- WHEN THEY REFUSED, empty. R-Q's sentence ("opted out by text, 3 Dec 2025,
  -- on the Lindqvist kitchen") lost its date for exactly this population, and
  -- the belt-and-braces pair the gate below relies on — the date test KEPT
  -- alongside refusal_unanswered — collapsed to one strand for every record the
  -- fold mints, since the fold raises the flag and left the date NULL. The date
  -- had not moved anywhere: it was still only on the losing sibling seat, which
  -- is the thing this CTE exists to stop relying on.
  --
  -- AND THE SIBLING IT PICKS IS THE ONE THAT ACTUALLY HOLDS THE REFUSAL
  -- (r2 R2-M1). Ranking the refusing seats by COALESCE(sms_opt_out_at,
  -- sms_consent_recorded_at, updated_at) alone ranks them by most recently
  -- TOUCHED: a dateless, sourceless portal refusal (the shape
  -- use-coordination.ts writes on purpose) wins over the seat carrying
  -- `inbound_sms` / "Replied STOP" / 2025-12-03 as soon as anything on the
  -- roster touches it. Everything the record knows about the refusal then
  -- comes off a row that knows nothing: opt_out_at NULL and all four opt_out_*
  -- NULL, permanently (ON CONFLICT DO NOTHING means no later fold repairs it,
  -- and record_channel_reconsent never touches opt_out_* by design), so R-Q's
  -- "Opted out by text, 3 Dec 2025" is unprintable and the carrier-audit
  -- artifact is gone. Worse, a NULL opt_out_source is what the mirror reads as
  -- "this refusal has no words" (R-AQ), so it then writes NULL over
  -- source/evidence/recorded_at/recorded_by on EVERY seat in the studio on that
  -- number — including the seat that was holding the STOP's own words. R-AQ's
  -- premise (a NULL here means there were never any refusal words) is true of
  -- the RECORD's writers and false of this picker, which is why the picker has
  -- to be the one that is right.
  --
  -- So: words first, then a date, then recency. And the date has a group-wide
  -- last resort — max(sms_opt_out_at) across the refusing seats — so a refusal
  -- that carries words but no date of its own still lands a real date on the
  -- record instead of NULL, rather than the pair being silently split.
  refusal AS (
    SELECT org, phone_e164,
           COALESCE(sms_opt_out_at, group_opt_out_at) AS sms_opt_out_at,
           -- AND THE WORDS ARE ONLY EVER TAKEN OFF A ROW THAT IS ITSELF A
           -- REFUSAL (r4 R4-M1). This CTE's population is two shapes, not one:
           -- a seat whose STATUS is `opted_out`, and a seat carrying an
           -- unanswered opt-out date while its status still reads granted /
           -- pending (the r8 W4-M1 shape, admitted by the second disjunct
           -- below). project_parties has ONE evidence set, and on that second
           -- shape it belongs to whatever wrote the row's CURRENT status — THE
           -- GRANT. Projected straight across, the studio's own consent
           -- paperwork was filed as the refusal's own words: a record reading
           -- (opted_out, written, "Signed the Lindqvist kickoff form",
           -- recorded 2025-01-01) against an opt_out_at of 2025-11-16 — the
           -- refusal written down ten months before it happened, and R-Q's
           -- sentence printing "Opted out in writing, 16 Nov 2025", naming the
           -- consent document as the refusal. That is verbatim the failure
           -- R-AQ and R5-M1 exist to prevent, arriving from the fold instead of
           -- from the mirror; and because opt_out_source came out non-NULL the
           -- mirror's wordless-refusal branch never fired, so R-AQ's protective
           -- NULL-write was suppressed exactly where it was needed and the
           -- grant's paperwork was mirrored onto every seat.
           --
           -- A refusal whose row is not a refusal has no words of its own, and
           -- NULL is what the record must say: it then reads as the wordless
           -- refusal it is, and R-AQ's branch does its job. The DATE legs are
           -- untouched — a date is a date whichever status carries it, and the
           -- unanswered opt-out date is the whole reason the row is here.
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_source      END AS opt_out_source,
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_evidence    END AS opt_out_evidence,
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_recorded_at END AS opt_out_recorded_at,
           CASE WHEN sms_consent_status = 'opted_out'
                THEN sms_consent_recorded_by END AS opt_out_recorded_by
      FROM (
        SELECT party_org.*,
               max(sms_opt_out_at) OVER (
                 PARTITION BY org, phone_e164
               ) AS group_opt_out_at,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 -- The words leg asks the same question the projection above
                 -- asks (r4 R4-M1): a source that belongs to a GRANT is not
                 -- refusal words, so it must not outrank a real refusal that
                 -- happens to be wordless — which is the shape the shipped
                 -- portal writes on purpose (use-coordination.ts).
                 ORDER BY CASE WHEN sms_consent_status = 'opted_out'
                                AND sms_consent_source IS NOT NULL
                               THEN 0 ELSE 1 END,
                          (sms_opt_out_at IS NOT NULL) DESC,
                          COALESCE(sms_opt_out_at, sms_consent_recorded_at,
                                   updated_at) DESC NULLS LAST
               ) AS rrn
          FROM party_org
         WHERE org IS NOT NULL
           AND (sms_consent_status = 'opted_out'
                OR (sms_opt_out_at IS NOT NULL
                    AND (sms_consented_at IS NULL
                         OR sms_consented_at <= sms_opt_out_at)))
      ) refusals
     WHERE rrn = 1
  ),
  ins AS (
    INSERT INTO public.studio_channel_consent (
      organization_id, channel_kind, channel_value, status,
      consented_at, opt_out_at, refusal_unanswered, source, evidence,
      recorded_at, disclosure_version, recorded_by,
      opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by,
      origin_project_id
    )
    SELECT r.org, 'sms', r.phone_e164, r.sms_consent_status,
           r.sms_consented_at,
           -- The winning row's date, or THE REFUSING SIBLING'S when the winner
           -- has none (r6 R6-M2) — the refusal's words and the refusal's date
           -- come off the same row.
           COALESCE(r.sms_opt_out_at, f.sms_opt_out_at),
           -- An unanswered refusal is recorded as a FACT here, never inferred
           -- later from opt_out_at: a folded `opted_out` row is routinely
           -- DATELESS (the shipped portal writes one deliberately —
           -- use-coordination.ts; so does every pre-00432 row), and a gate that
           -- read the date failed open for that whole population. A row that is
           -- not opted_out still counts as an unanswered refusal when it carries
           -- an opt-out date no later consent has answered — INCLUDING a winner
           -- whose status reads `granted` (r7 M7-1, ruled here), and INCLUDING a
           -- LOSING SIBLING the ranking discarded (r8 W4-M1). A legacy seat
           -- saying granted while carrying a dated opt-out and no later
           -- consented_at is contradictory data, and the refusal is the half
           -- that fails closed: the record is minted UNSENDABLE and only the
           -- recipient's own YES/START reopens it. `refusal` holds one row per
           -- group exactly when such a refusal stands anywhere in it.
           (f.org IS NOT NULL),
           r.sms_consent_source,
           r.sms_consent_evidence, r.sms_consent_recorded_at,
           r.sms_consent_disclosure_version, r.sms_consent_recorded_by,
           f.opt_out_source, f.opt_out_evidence,
           f.opt_out_recorded_at, f.opt_out_recorded_by,
           r.project_id
    FROM ranked r
    LEFT JOIN refusal f
      ON f.org = r.org AND f.phone_e164 = r.phone_e164
    WHERE r.rn = 1
    ON CONFLICT (organization_id, channel_kind, channel_value) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_channel_consent_from_parties()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_channel_consent_from_parties() TO service_role;

COMMENT ON FUNCTION public.backfill_channel_consent_from_parties() IS
  'Folds project_parties.sms_consent_* into studio_channel_consent, one row per '
  '(studio, sms, phone_e164). Precedence: opted_out over everything, then the '
  'most recent granted, then pending, then not_asked. Stamps '
  'refusal_unanswered on any folded refusal, dated or not — and asks for one '
  'across EVERY seat the studio holds on that number, not just the winning row '
  '(r8 W4-M1) — so the granted door '
  'fails closed for the dateless opted_out rows the shipped portal writes on '
  'purpose. The refusing sibling gives the record the refusal''s own source, '
  'words, recorder AND DATE: opt_out_at is the winning row''s date or, where '
  'the winner has none, the refusing sibling''s, so the date and the words come '
  'off the same row (r6 R6-M2). The refusing sibling is chosen by the '
  'refusal''s OWN facts — its words first, then its date, and only then row '
  'recency — so a dateless sourceless portal refusal never outranks the seat '
  'that received the STOP and empties the record''s refusal evidence set '
  '(r2 R2-M1); and the words are only ever taken off a row whose status IS '
  '`opted_out`, so the GRANT''s paperwork on a seat carrying a stale unanswered '
  'opt-out is never filed as the refusal''s own words (r4 R4-M1). '
  'Idempotent — ON CONFLICT '
  'DO NOTHING never overwrites a later decision — and side-effect-free to '
  're-run once the trigger exists: a folded `pending` reaches the party rows '
  'through the mirror, which suppresses 00432''s opt-in dispatch (00594).';

SELECT public.backfill_channel_consent_from_parties();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The mirror — created AFTER the backfill, see the header
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 3a. Teach BOTH outward-facing party triggers to stand down for a mirror ──
--
-- project_parties' non-internal trigger set, probed on the local stack:
--
--   set_updated_at_project_parties        update_updated_at_column        BEFORE
--   normalize_phone_project_parties       normalize_party_phone_e164      BEFORE
--   fc_optin_invite_dispatch              fc_dispatch_optin_invite        AFTER
--   site_request_consent_granted_dispatch _site_request_consent_granted_… AFTER
--
-- The two BEFORE triggers are pure row shaping. BOTH AFTER triggers reach the
-- outside world, and the mirror's UPDATE satisfies both of them — one on an
-- evidenced `pending`, one on any flip to `granted`. Guarding only the first
-- left a recorded `granted` minting site-request dispatch work and texting a
-- trade out of a cache write. Both are redefined here, from their grep-winner
-- bodies verbatim, with the same first-statement guard:
--
--   3a-1  fc_dispatch_optin_invite               lineage 00432:27-68
--   3a-2  _site_request_consent_granted_dispatch lineage 00374:3399-3444
--
-- patina.suppress_consent_dispatch is set (SET LOCAL, via set_config(...,true))
-- only by mirror_channel_consent_to_parties() below, around its own UPDATE, and
-- cleared immediately after it. AFTER-row triggers queued by that UPDATE fire
-- at the end of that statement, before the mirror's next statement, so the
-- window is exactly the mirror's own write and nothing else in the transaction.

-- ── 3a-1. The opt-in invite (lineage 00432:27-68, verbatim + one guard) ──────
-- Trigger fc_optin_invite_dispatch created at 00284:254-257.
CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 00594: the mirror is maintaining the cached copy of a consent record that
  -- was already decided elsewhere. Mirroring a verdict is not asking for one.
  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.sms_consent_source IS NULL
     OR NEW.sms_consent_recorded_at IS NULL
     OR NEW.sms_consent_disclosure_version IS NULL
     OR btrim(COALESCE(NEW.sms_consent_evidence, '')) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.sms_consent_status IS NOT DISTINCT FROM 'pending'
     AND OLD.sms_consent_source IS NOT NULL
     AND OLD.sms_consent_recorded_at IS NOT NULL
     AND OLD.sms_consent_disclosure_version IS NOT NULL
     AND btrim(COALESCE(OLD.sms_consent_evidence, '')) <> '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_optin_invite',
        'type',        'field_optin_confirmation'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_optin_invite: dispatch failed for party %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fc_dispatch_optin_invite() IS
  'Dispatches the SMS double-confirmation only after auditable prior express '
  'consent is recorded (00432), and never for a write made by '
  'mirror_channel_consent_to_parties(), which sets patina.suppress_consent_dispatch '
  'for the duration of its own UPDATE — one recorded consent must not fan out '
  'into one text per party row on the number (00594).';

-- ── 3a-2. The site-request consent dispatch ─────────────────────────────────
-- Lineage: 00374:3399-3444 (current head — the body below is that body
-- verbatim), trigger site_request_consent_granted_dispatch created at
-- 00374:3446-3455 and left exactly as it is. Delta: one guard, first statement.
--
-- This one is the sharper of the two: it calls site_request_dispatch_after_consent()
-- (durable work, in-transaction) and then invoke_edge_function('site-request-dispatch',
-- …), whose handler calls sendPartySms — a real outbound text per awaiting_consent
-- request on the seat. The mirror's UPDATE flips sms_consent_status to 'granted'
-- on EVERY party row in the studio on that number, so one recorded grant fanned
-- out into one dispatch per open request per seat.
CREATE OR REPLACE FUNCTION public._site_request_consent_granted_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
  v_dispatch jsonb;
BEGIN
  -- 00594: the mirror is maintaining the cached copy of a consent record that
  -- was already decided elsewhere. Mirroring a verdict is not asking for one,
  -- and it is not the moment a trade learns there is work waiting.
  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.sms_consent_status <> 'granted'
     OR OLD.sms_consent_status = 'granted' THEN
    RETURN NEW;
  END IF;

  FOR v_request IN
    SELECT id
    FROM public.site_requests
    WHERE assignee_party_id = NEW.id
      AND status = 'awaiting_consent'
    ORDER BY created_at
  LOOP
    -- Durable work is part of the same transaction as the consent update.
    -- The Edge invocation below is only an eager wake-up: pg_net can miss,
    -- retry, or arrive after a worker restart without stranding the request in
    -- awaiting_consent. The lifecycle sweep will claim this identifier-only
    -- row and mint a raw guest token only when an SMS attempt actually begins.
    v_dispatch := public.site_request_dispatch_after_consent(v_request.id);
    BEGIN
      PERFORM public.invoke_edge_function(
        'site-request-dispatch',
        jsonb_build_object(
          'action', 'consent-granted',
          'request_id', v_request.id,
          'party_id', NEW.id,
          'outbox_id', v_dispatch->>'outbox_id'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'site request consent dispatch failed for request %: %',
        v_request.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._site_request_consent_granted_dispatch() IS
  'Releases site requests parked in awaiting_consent when the assignee''s '
  'consent turns granted (00374), and never for a write made by '
  'mirror_channel_consent_to_parties(), which sets patina.suppress_consent_dispatch '
  'for the duration of its own UPDATE — a cached verdict must not mint dispatch '
  'work or text a trade (00594).';

-- The invariant, on the table itself, so the third one cannot land unguarded.
COMMENT ON TABLE public.project_parties IS
  'Track 5 coordination courts (R46): GC / vendor / client_rep / other parties '
  'on a project. profile_id NULLABLE — v1 parties do NOT log in; the designer '
  'records their move via resolve_coordination_item. Setting profile_id later '
  'gives that party a real login (a flag flip, not a migration). vendor_id '
  'soft-links a known vendor; both back-links ON DELETE SET NULL so item/task '
  'court history survives (00212). '
  'sms_consent_* is a READ-ONLY CACHED MIRROR '
  'of studio_channel_consent since 00594, maintained by '
  'mirror_channel_consent_to_parties(). INVARIANT: any AFTER-row trigger added '
  'to this table that reaches outside the transaction (an SMS, an email, an '
  'edge invocation, durable dispatch work) MUST stand down when '
  'current_setting(''patina.suppress_consent_dispatch'', true) = ''1'' — that '
  'flag marks a mirror write, which is cache maintenance of a verdict already '
  'decided, never a studio act. Guarded so far: fc_dispatch_optin_invite, '
  '_site_request_consent_granted_dispatch. The invariant is about SENDING: '
  'mirror_channel_consent_to_parties() still releases the site requests parked '
  'on the seats it moves to granted, by calling '
  'site_request_dispatch_after_consent() itself — durable, in-transaction, no '
  'edge invocation.';

-- ── 3b. The mirror ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mirror_channel_consent_to_parties()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_newly_granted    uuid[];
  v_request          uuid;
  v_seat_source      text;
  v_seat_evidence    text;
  v_seat_recorded_at timestamptz;
  v_seat_recorded_by uuid;
  -- TRUE when the verdict being mirrored is a REFUSAL. Then the seat's four
  -- evidence columns are written STRAIGHT FROM the record's opt_out_* set, with
  -- no seat fallback at all — NULLs included: see the branch below (r8 R8-M1
  -- and r9 R5-M2, rulings R-AQ and its refinement). This used to be a
  -- one-column test (`NEW.opt_out_source IS NULL`), which decided the four
  -- columns individually and let three of them fall back to the seat.
  v_refusal boolean := false;
BEGIN
  IF NEW.channel_kind <> 'sms' THEN
    RETURN NEW;
  END IF;

  -- WHEN THE VERDICT IS A REFUSAL, THE SEAT CARRIES THE REFUSAL'S OWN EVIDENCE
  -- (r9 R5-M1). W4-M2 kept opt_out_source / opt_out_evidence /
  -- opt_out_recorded_at / opt_out_recorded_by off the studio's side of the
  -- record — but project_parties has no second set of columns, and the mirror
  -- was still copying the CONSENT side onto the seat. So a seat that read
  -- (opted_out, inbound_sms, 'Replied STOP') read (opted_out, written, 'Signed
  -- a fresh consent…') the moment record_channel_reconsent() put the studio's
  -- own paperwork on the record: R-Q's sentence, read off the seat — which is
  -- what every shipped surface reads — became "Opted out in writing", naming
  -- the studio's consent as the refusal, and the 10DLC artifact of how the STOP
  -- arrived was gone from the only copy those surfaces see. The refusal's
  -- evidence is the evidence OF the verdict being mirrored, so when the verdict
  -- is `opted_out` the refusal's set is what the seat gets, AND NOTHING ELSE IS
  -- ALLOWED TO STAND IN FOR IT (r6 R6-M1). This branch used to fall back to the
  -- record's CONSENT set — COALESCE(NEW.opt_out_source, NEW.source) and three
  -- siblings — justified as covering "the legacy rows minted before opt_out_*
  -- existed". That population cannot exist: this same file creates the table
  -- with all four opt_out_* columns (the CREATE below, restated as an ALTER for
  -- the rerun path), so no database can hold a row of that shape. What the
  -- fallback actually hit is a refusal that carries NO SOURCE OF ITS OWN — the
  -- shape the shipped portal writes on purpose (use-coordination.ts writes
  -- `opted_out` together with the not-asked columns, nulling source, evidence,
  -- recorded_at, disclosure_version and recorded_by), the shape every pre-00432
  -- row carries, and the shape the fold mints verbatim. On such a record
  -- NEW.source is the studio's OWN fresh consent, written by
  -- record_channel_reconsent(), so the fallback made the seat read
  -- (opted_out, written, "Signed a fresh consent form…", recorded today):
  -- R-Q's sentence off the seat became "Opted out in writing, 12 Sep 2026",
  -- naming the studio's consent document as the refusal and dating the refusal
  -- to the day the studio filed its paperwork. A seat that said nothing about
  -- the refusal (honest) started asserting something false. Every writer that
  -- mints a refusal WITH words fills opt_out_* — record_channel_consent's
  -- opted_out branch and the inbound STOP rail both do — so a NULL here means
  -- there were never any refusal words, and the seat's own standing value is
  -- the fallback (never NULL over non-null, R-AN). disclosure_version has no
  -- refusal-side twin — it belongs to the disclosure the person was shown, not
  -- to how they refused — so it keeps coming from the record's own column.
  --
  -- AND WHERE THE REFUSAL HAS NO WORDS, THE SEAT IS LEFT WITH NONE (r8 R8-M1,
  -- ruling R-AQ). "The seat's own standing value is the fallback" is true only
  -- while that standing value is itself about the refusal. It is not, for the
  -- seat NEXT DOOR. project_parties has ONE evidence set and a sibling seat in
  -- the same studio on the same number routinely holds the GRANT's evidence —
  -- the studio's paperwork, dated the day of the grant. So on the sourceless
  -- refusal the portal and the fold really write, every COALESCE below kept
  -- what the sibling held and left that seat asserting the studio's own consent
  -- document AS the refusal: R-Q's sentence, composed off the seat, printed
  -- "Opted out in writing, 2 Jan 2026" — the studio's consent form named as the
  -- refusal, dated to the day of the grant. It bites on the first prod fold,
  -- over real project_parties data, and needs no later act by anyone.
  --
  -- R-AN's "never NULL over non-null" was written about a verdict that simply
  -- did not restate its evidence. A REFUSAL WITH NO SOURCE IS NOT THAT CASE: it
  -- is a refusal whose evidence is known to be ABSENT, and absent is what the
  -- seat must say. NULL here is therefore the honest write, and it is exactly
  -- what the shipped portal writes for the same verdict (use-coordination.ts
  -- writes `opted_out` together with the not-asked columns). R-AN still governs
  -- every other transition, including a refusal that DOES carry its own words.
  -- disclosure_version is not in this set — it belongs to the disclosure the
  -- person was shown, not to how they refused, and keeps coming from the record.
  --
  -- AND THE REFUSAL'S FOUR COLUMNS ARE DECIDED AS A SET, NOT ONE BY ONE (r9
  -- R5-M2). The test above used to be ONE COLUMN WIDE — `NEW.opt_out_source IS
  -- NULL` — and the other three fell back to the seat whenever the source was
  -- filled. That is the ordinary inbound STOP: opt_out_source is 'inbound_sms',
  -- so the one-column test said "this refusal has words", while
  -- opt_out_recorded_by is DELIBERATELY AND ALWAYS NULL on a rail-written STOP
  -- (the edge pipeline writes it null on purpose: nobody in the studio recorded
  -- it, the recipient did — R7-M1, and the column comment below). The COALESCE
  -- then handed the seat pp.sms_consent_recorded_by — THE STUDIO MEMBER WHO
  -- RECORDED THE GRANT — so every seat that had held a recorded grant came out
  -- of a STOP naming a named studio member as the person who refused: the exact
  -- carrier-audit attribution R7-M1 ruled against, one table over, on the
  -- ordinary path. The two siblings follow from the same one-column test on
  -- folded legacy data: a refusal with no opt_out_evidence took the seat's
  -- GRANT WORDS under the refusal's source, one with no opt_out_recorded_at
  -- took the grant's DATE.
  --
  -- So: when the verdict is a refusal, THE RECORD IS THE AUTHORITY FOR THE
  -- REFUSAL'S OWN EVIDENCE and the four columns are written straight from
  -- NEW.opt_out_* with no seat fallback at all. Every writer that has refusal
  -- words fills what it has, and what it leaves NULL is known absent — which is
  -- R-AQ's rule, now applied to all four columns instead of keyed off one of
  -- them. R-AN's refresh-never-erase COALESCE governs every other transition,
  -- unchanged.
  IF NEW.status = 'opted_out' THEN
    v_seat_source      := NEW.opt_out_source;
    v_seat_evidence    := NEW.opt_out_evidence;
    v_seat_recorded_at := NEW.opt_out_recorded_at;
    v_seat_recorded_by := NEW.opt_out_recorded_by;
    v_refusal          := true;
  ELSE
    v_seat_source      := NEW.source;
    v_seat_evidence    := NEW.evidence;
    v_seat_recorded_at := NEW.recorded_at;
    v_seat_recorded_by := NEW.recorded_by;
  END IF;

  -- The seats this write is about to move ONTO `granted`, captured before the
  -- UPDATE because after it they all read granted. See the release loop below.
  IF NEW.status = 'granted' THEN
    SELECT array_agg(pp.id)
      INTO v_newly_granted
      FROM public.project_parties pp
      JOIN public.projects p ON p.id = pp.project_id
     WHERE pp.phone_e164 = NEW.channel_value
       AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
           = NEW.organization_id
       AND pp.sms_consent_status IS DISTINCT FROM 'granted';
  END IF;

  -- Transaction-local, cleared below: fc_dispatch_optin_invite (redefined in
  -- 3a) reads this and returns without dispatching. Without it, one recorded
  -- `pending` becomes one real opt-in SMS per party row on the number.
  PERFORM set_config('patina.suppress_consent_dispatch', '1', true);

  -- THE VERDICT IS COPIED; THE DATES AND THE EVIDENCE ARE COALESCED, PER
  -- COLUMN (r5 M5-2, ruling R-AN; r6 M6-2 for the two dates). A record can
  -- carry a verdict without carrying every evidence column — the inbound rail
  -- mints one from a YES on a number whose evidence so far lives only on the
  -- seat — and before this, the mirror wrote those NULLs down over a disclosure
  -- version and a recorder the portal had recorded. That is the same
  -- hollow-evidence state r2 M-1 closed, arriving from the other side: the
  -- 10DLC evidence for the send cannot be erased by a write that simply did
  -- not restate it. So the mirror never overwrites a non-null evidence column
  -- with NULL; the record's own door (record_channel_consent) already refuses
  -- to empty the set.
  --
  -- THE SAME IS TRUE OF THE TWO DATES, and for the same reason (r6 M6-2). A
  -- record carrying a verdict without an opt_out_at is the ordinary case —
  -- every record record_channel_consent mints for pending or granted, and
  -- every record the inbound rail mints for a number with no prior row — and
  -- copying it straight wrote NULL over a real, dated refusal on every seat in
  -- the studio. The RPC goes to trouble to keep both dates on the RECORD
  -- ("granted 2 May 2025, opted out 3 Dec 2025" must both stay printable, R-Q)
  -- and the mirror must not destroy the pair on the seats. So each date keeps
  -- what stands when the new verdict does not restate it. The verdict itself
  -- is still copied — the status is the fact the record owns.
  UPDATE public.project_parties pp
     SET sms_consent_status             = NEW.status,
         sms_consented_at               = COALESCE(NEW.consented_at, pp.sms_consented_at),
         sms_opt_out_at                 = COALESCE(NEW.opt_out_at, pp.sms_opt_out_at),
         -- v_seat_* is the record's consent set, or THE REFUSAL'S OWN SET
         -- when the verdict being mirrored is a refusal (r9 R5-M1, above).
         -- CASE, not COALESCE, on the four: a refusal writes its own set
         -- STRAIGHT, NULLs included and all four together (R-AQ as refined by
         -- r9 R5-M2 — never a grant's recorder, words or date under an
         -- opt-out); every other transition refreshes-never-erases (R-AN).
         sms_consent_source             = CASE WHEN v_refusal THEN v_seat_source
                                               ELSE COALESCE(v_seat_source, pp.sms_consent_source) END,
         sms_consent_evidence           = CASE WHEN v_refusal THEN v_seat_evidence
                                               ELSE COALESCE(v_seat_evidence, pp.sms_consent_evidence) END,
         sms_consent_recorded_at        = CASE WHEN v_refusal THEN v_seat_recorded_at
                                               ELSE COALESCE(v_seat_recorded_at, pp.sms_consent_recorded_at) END,
         sms_consent_disclosure_version = COALESCE(NEW.disclosure_version, pp.sms_consent_disclosure_version),
         sms_consent_recorded_by        = CASE WHEN v_refusal THEN v_seat_recorded_by
                                               ELSE COALESCE(v_seat_recorded_by, pp.sms_consent_recorded_by) END
    FROM public.projects p
   WHERE p.id = pp.project_id
     AND pp.phone_e164 = NEW.channel_value
     AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
         = NEW.organization_id
     -- The whole cached tuple, not the status alone. Guarding on status only
     -- suppressed every EVIDENCE refresh too, so a row could sit at `granted`
     -- with NULL source / recorded_at / evidence — a state the portal's own
     -- write path cannot produce and project_parties has no CHECK against,
     -- and it is the 10DLC evidence for the send. Re-firing is already held
     -- off by patina.suppress_consent_dispatch above, so the narrow status
     -- test is no longer load-bearing. Compared against the values this write
     -- would actually leave — v_seat_* included, so a refusal arriving with its
     -- own source and words is not suppressed as identical to the studio's
     -- consent set already on the seat (r9 R5-M1) — so a NULL the COALESCE is
     -- not going to write no longer counts as a difference.
     AND (pp.sms_consent_status, pp.sms_consented_at, pp.sms_opt_out_at,
          pp.sms_consent_source, pp.sms_consent_evidence,
          pp.sms_consent_recorded_at, pp.sms_consent_disclosure_version,
          pp.sms_consent_recorded_by)
         IS DISTINCT FROM
         (NEW.status,
          COALESCE(NEW.consented_at, pp.sms_consented_at),
          COALESCE(NEW.opt_out_at, pp.sms_opt_out_at),
          CASE WHEN v_refusal THEN v_seat_source
               ELSE COALESCE(v_seat_source, pp.sms_consent_source) END,
          CASE WHEN v_refusal THEN v_seat_evidence
               ELSE COALESCE(v_seat_evidence, pp.sms_consent_evidence) END,
          CASE WHEN v_refusal THEN v_seat_recorded_at
               ELSE COALESCE(v_seat_recorded_at, pp.sms_consent_recorded_at) END,
          COALESCE(NEW.disclosure_version, pp.sms_consent_disclosure_version),
          CASE WHEN v_refusal THEN v_seat_recorded_by
               ELSE COALESCE(v_seat_recorded_by, pp.sms_consent_recorded_by) END);

  PERFORM set_config('patina.suppress_consent_dispatch', '', true);

  -- ── The narrow release path ───────────────────────────────────────────────
  -- The suppression above is about OUTWARD acts: a cached verdict must not text
  -- anyone. It is not a reason to strand durable work. 00374's trigger is the
  -- only caller of site_request_dispatch_after_consent(), and the lifecycle
  -- sweep only promotes requests that already hold an outbox row — so a seat
  -- this write moved to `granted` whose site request is parked in
  -- awaiting_consent stayed parked FOR EVER, reading `granted` with a
  -- consent_status_snapshot still saying not_asked. That is the studio-side
  -- grant (record_channel_consent) and every sibling seat an inbound YES covers
  -- beyond the ones it transitioned itself.
  --
  -- So the mirror releases them itself, and releases them the durable way only:
  -- site_request_dispatch_after_consent() stamps the snapshot and mints the
  -- 'consent-granted' outbox row, all inside this transaction. It does NOT call
  -- invoke_edge_function — the eager wake-up is the one outward act, and it
  -- stays with the party-row trigger. The lifecycle sweep claims the outbox row
  -- the ordinary way.
  --
  -- Idempotent against the party-first path the inbound rail uses: when the
  -- party write already moved the seat, v_newly_granted does not contain it,
  -- and consent_status_snapshot already reads granted.
  IF v_newly_granted IS NOT NULL THEN
    FOR v_request IN
      SELECT sr.id
        FROM public.site_requests sr
       WHERE sr.assignee_party_id = ANY (v_newly_granted)
         AND sr.status = 'awaiting_consent'
         AND sr.consent_status_snapshot IS DISTINCT FROM 'granted'
       ORDER BY sr.created_at
    LOOP
      BEGIN
        PERFORM public.site_request_dispatch_after_consent(v_request);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'mirrored consent could not release site request %: %',
          v_request, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_channel_consent_to_parties() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.mirror_channel_consent_to_parties() IS
  'AFTER INSERT/UPDATE on studio_channel_consent: pushes the studio''s verdict '
  'onto every party row in that studio carrying the same phone_e164, making '
  'project_parties.sms_consent_* a read-only cached mirror. Guarded on the '
  'whole cached tuple (status AND the evidence set) so a re-record does not '
  'rewrite already-identical rows but DOES refresh evidence — refresh, never '
  'erase: each evidence column is COALESCEd over what the seat holds, so a '
  'record that carries a verdict without a disclosure version or a recorder '
  '(the shape the inbound rail mints) cannot null the ones the portal recorded '
  '(R-AN). WHEN THE VERDICT IS `opted_out` THE SEAT GETS THE REFUSAL''S OWN '
  'EVIDENCE SET (opt_out_source / opt_out_evidence / opt_out_recorded_at / '
  'opt_out_recorded_by), AND NEVER THE STUDIO''S CONSENT SET IN ITS PLACE — '
  'written STRAIGHT FROM the record with NO SEAT FALLBACK AT ALL, all four '
  'together, so whatever the refusal leaves NULL the seat says NULL too (r8 '
  'R8-M1 / R-AQ, widened from one column to the set by r9 R5-M2): a sibling '
  'seat in the same studio on the same number routinely holds the GRANT''s '
  'evidence, so keeping it left that seat naming the studio''s own consent '
  'document as the refusal, dated to the day of the grant — and on the ordinary '
  'inbound STOP, whose opt_out_recorded_by is deliberately NULL, it left the '
  'seat naming the studio member who recorded the GRANT as the person who '
  'refused (R7-M1''s attribution, one table over). A refusal that does not fill '
  'one of its four columns is a refusal whose evidence is known ABSENT, which '
  'is not the case R-AN''s never-NULL-over-non-null rule was written about; '
  'R-AN still governs every other transition. '
  'project_parties has ONE '
  'evidence set, and mirroring the studio''s consent evidence under an '
  'opted_out status made the seat say the refusal arrived the way the studio''s '
  'paperwork did (r9 R5-M1) — which, for the sourceless refusals the portal and '
  'the fold really write, is every refusal on the books once '
  'record_channel_reconsent() has put the studio''s fresh consent on the '
  'record. '
  'disclosure_version has no refusal-side twin and always comes from the '
  'record. It also sets '
  'patina.suppress_consent_dispatch for the duration of its own UPDATE so a '
  'mirrored verdict cannot fire 00432''s opt-in dispatch or 00374''s '
  'site-request dispatch once per row. A mirrored `granted` DOES release the '
  'site requests parked in awaiting_consent on the seats it just moved — '
  'site_request_dispatch_after_consent() only, never invoke_edge_function, so '
  'the durable work lands in this transaction and the lifecycle sweep carries '
  'it out; without that a studio-recorded grant left the seat reading granted '
  'and its request parked for ever (00594).';

DROP TRIGGER IF EXISTS mirror_channel_consent_to_parties_trg ON public.studio_channel_consent;
CREATE TRIGGER mirror_channel_consent_to_parties_trg
  AFTER INSERT OR UPDATE ON public.studio_channel_consent
  FOR EACH ROW EXECUTE FUNCTION public.mirror_channel_consent_to_parties();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. record_channel_consent — the portal's only write path
-- ═══════════════════════════════════════════════════════════════════════════
-- Granted to every authenticated studio member, so this function IS the
-- policy. It enforces, in SQL, what the shipped portal enforces in TypeScript
-- (use-coordination.ts:519-522, :699-703, :721-733, :745):
--
--   1. EVIDENCE. `pending` and `granted` require source + evidence +
--      disclosure_version; `opted_out` requires source + evidence (PR-m: a
--      verbal STOP the studio heard is a real record, and needs to say who
--      heard it and when). Nothing else may claim consent. `not_asked` is
--      REFUSED outright (R-AG): it is the absence of a record, not a verdict,
--      and there is nothing to record. It stays a legal value in the CHECK
--      because the backfill mints it, and it stays a legal thing to READ — the
--      chip still prints "Not asked" — but no studio act may write it here.
--      Before R-AG the four-argument call record_channel_consent(org, 'sms',
--      number, 'not_asked') was the one door into this table that needed no
--      evidence at all, and it erased a recorded grant, its source, its words
--      and its disclosure version — from the record AND, through the mirror,
--      from every seat in the studio on that number.
--   2. TRANSITION — AND IT READS BOTH LEDGERS, AND IT ASKS ONE QUESTION.
--      The send gate refuses on the record OR on a refusal standing on one of
--      this studio's own party rows; this door does the same (R-AL), because
--      until PR-x retires those writes a refusal can stand on a seat with no
--      record behind it, and granting over it also cleared — through the mirror
--      — the very seat the send gate would have tested. The seat test asks what
--      the send gate asks and nothing more: `sms_consent_status = 'opted_out'`,
--      in this org, DATED OR NOT (r6 M6-1 — orgHasOptedOutParty has no date
--      test, the shipped portal writes dateless refusals on purpose, and every
--      pre-00432 row is dateless).
--
--      Nothing leaves `opted_out` through this door. Not to granted (that is
--      the recipient's to give), not to pending, and not to not_asked — a STOP
--      is the only stored record of a refusal and the RPC may not erase it.
--      PR-m's way back is a fresh recorded consent, which has its own named
--      door: record_channel_reconsent() below.
--
--      AND THE TWO DOORS COMPOSED. The gate above is stated on the row's
--      CURRENT status, so on its own it was walked around: reconsent() USED TO
--      move the row opted_out -> pending (it no longer moves the status at all,
--      r7 M7-2), and a second call then found a row that is
--      no longer `opted_out` and wrote `granted` over it. Two calls, any
--      studio member, and a recorded STOP was back to granted with only
--      opt_out_at left behind — and the mirror cleared the party-row backstop
--      sendPartySms falls back on. So this door ALSO refuses while an
--      unanswered refusal stands — refusal_unanswered TRUE, or an opt_out_at
--      with no later consented_at. The answer is the recipient's, not the
--      studio's — an inbound YES/START, which the rail writes with a fresh
--      consented_at.
--
--      THE GATE IS ON THE REFUSAL, NOT ON THE VERDICT (r6 B6-1). Stated as
--      "refuse `granted`", it left `pending` as a free first hop: a recorded
--      `pending` mirrored `pending` and a NULL opt_out_at onto the seats,
--      erasing the refusal and its date, and the `granted` behind it then
--      passed every leg — strictly worse than the composition above, because
--      reconsent() cannot recover a row that no longer says opted_out. So every
--      verdict but `opted_out` is tested. The one act always open to the studio
--      is recording the refusal it is holding; the fresh consent it holds goes
--      on the record through reconsent(), as EVIDENCE beside the refusal (r7
--      M7-2 — no double opt-in runs from there), and the answer stays the
--      recipient's.
--   3. NO LAUNDERING, AND NO ERASURE. Every status this door still accepts
--      requires its own source and evidence, so a status change always
--      RESTATES them — a grant can never inherit the STOP's own words
--      ("Replied STOP", source inbound_sms) as the evidence a carrier audit
--      would be shown, because the caller had to type new words to get here.
--      And no write may empty the evidence set: source, evidence,
--      disclosure_version and recorded_by are COALESCEd over what stands, so a
--      verdict that does not restate a field keeps it rather than nulling it
--      (R-AG). The only field a change may legitimately omit is
--      disclosure_version on an `opted_out` — a refusal is not shown a
--      disclosure — and the version the person WAS shown when they consented
--      is a fact the audit still needs.
--
--      AND THE REFUSAL KEEPS ITS OWN EVIDENCE SET (r8 W4-M2). A refusal writes
--      opt_out_source / opt_out_evidence / opt_out_recorded_at /
--      opt_out_recorded_by as well as the shared set; no later verdict, and no
--      reconsent, may write them. One evidence set could only ever hold the
--      LATEST act, so the studio's fresh consent recorded over a STOP erased
--      "Replied STOP", source inbound_sms — the carrier-audit artifact of the
--      refusal itself, and the noun R-Q's "Opted out BY TEXT, 3 Dec 2025"
--      prints — from the record and, through the mirror, from every seat.
--
-- Dates still survive a verdict that does not restate them: "granted 2 May
-- 2025, opted out 3 Dec 2025" must both stay printable (R-Q).
CREATE OR REPLACE FUNCTION public.record_channel_consent(
  p_organization_id    uuid,
  p_channel_kind       text,
  p_channel_value      text,
  p_status             text,
  p_source             text DEFAULT NULL,
  p_evidence           text DEFAULT NULL,
  p_disclosure_version text DEFAULT NULL,
  p_origin_project_id  uuid DEFAULT NULL
)
RETURNS public.studio_channel_consent
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_value         text;
  v_now           timestamptz := now();
  v_row           public.studio_channel_consent;
  v_seat_refusal  boolean := false;
  v_record_status text;
BEGIN
  IF NOT public.is_active_studio_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_a_studio_member'
      USING HINT = 'Only an active, non-guest member of this studio may record consent.';
  END IF;

  IF p_channel_kind NOT IN ('sms', 'email') THEN
    RAISE EXCEPTION 'invalid_channel_kind';
  END IF;
  IF p_status NOT IN ('not_asked', 'pending', 'granted', 'opted_out') THEN
    RAISE EXCEPTION 'invalid_consent_status';
  END IF;
  -- R-AG. `not_asked` is the absence of a record; recording it is not an act
  -- the studio can perform, and taking it here destroys the evidence set both
  -- on the record and on every mirrored seat.
  IF p_status = 'not_asked' THEN
    RAISE EXCEPTION 'consent_not_recordable'
      USING HINT = 'There is nothing to record: not_asked is the absence of a '
                   'consent, not a verdict. Record the verdict that actually '
                   'happened (pending / granted / opted_out).';
  END IF;

  -- The channels table's own rule, shared: public.normalize_channel_value
  -- (00593). One function, both callers — so a channel row and its consent
  -- record cannot land on different keys.
  v_value := public.normalize_channel_value(p_channel_kind, p_channel_value);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_value';
  END IF;

  -- ── 1. Evidence ───────────────────────────────────────────────────────────
  IF p_status IN ('pending', 'granted') THEN
    IF COALESCE(btrim(p_source), '') = ''
       OR COALESCE(btrim(p_evidence), '') = ''
       OR COALESCE(btrim(p_disclosure_version), '') = '' THEN
      RAISE EXCEPTION 'consent_evidence_required'
        USING HINT = 'pending and granted need a source, the evidence in words, '
                     'and the disclosure version the person was shown.';
    END IF;
  ELSIF p_status = 'opted_out' THEN
    IF COALESCE(btrim(p_source), '') = ''
       OR COALESCE(btrim(p_evidence), '') = '' THEN
      RAISE EXCEPTION 'consent_evidence_required'
        USING HINT = 'Marking a refusal needs a source and the evidence in words (PR-m).';
    END IF;
  END IF;

  -- ── 2a. The refusal that lives only on a seat (r5 B5-1, ruling R-AL) ─────
  -- The gate below reads the RECORD. The send gate reads BOTH — the record and
  -- this studio's own party rows (_shared/sms.ts orgHasOptedOutParty), because
  -- project_parties.sms_consent_* is still writable by the portal (PR-x has not
  -- retired those writes) and a refusal can therefore stand on a seat with no
  -- record behind it at all: PR-m's manually marked verbal STOP, the phone-edit
  -- path's revertsToOptedOut (use-coordination.ts:596-620), any seat that goes
  -- opted_out after the fold. Reading only the record, this door wrote `granted`
  -- straight over such a refusal — and the mirror then cleared the very party
  -- row the send gate was going to test, so one RPC call by any studio member
  -- turned a refusal into a sendable number with no trace left.
  --
  -- So the write door reads the same two ledgers the read door does. Scoped to
  -- THIS org, resolved the way the mirror resolves it, so R-AK is not reopened:
  -- another studio's STOP is not this studio's fact.
  --
  -- The way past is not a second call to this door: the studio records the
  -- refusal it is holding (status opted_out, with its own evidence), which puts
  -- the fact on the books where reconsent() and the recipient's own YES/START
  -- can act on it.
  --
  -- TWO NARROWINGS ARE GONE (r6 B6-1 / M6-1), because both were walkable.
  --
  --   THE VERDICT. The gate asked `p_status = 'granted'`, so `pending` was an
  --   ungated first hop: one recorded `pending` over a dated, evidenced seat
  --   refusal mirrored `pending` and a NULL opt_out_at back onto the seat,
  --   erasing the refusal and its date, and the `granted` call after it then
  --   passed every leg. Two ordinary calls by any studio member walked a real
  --   inbound STOP back to granted with no trace on either ledger, and
  --   reconsent() could not recover it (it requires status opted_out). So the
  --   gate asks whether a REFUSAL STANDS, not which verdict is being written:
  --   everything but `opted_out` is tested. Recording the refusal is always
  --   allowed — that is the way forward, not around.
  --
  --   THE DATE. The gate also required `sms_opt_out_at IS NOT NULL`, so it
  --   failed OPEN for a DATELESS refusal — which is the shape the shipped
  --   portal writes on purpose (use-coordination.ts: "opted out, date unknown"
  --   is the truth) and the shape every pre-00432 row carries. That is the very
  --   population r4's B-1 forced the RECORD-level test off dates for, which is
  --   why refusal_unanswered exists; the seat test kept the date and kept the
  --   hole. And the SEND gate this door is meant to mirror
  --   (_shared/sms.ts orgHasOptedOutParty) filters on sms_consent_status alone
  --   with no date test at all. So the write door now asks exactly the question
  --   the read door asks.
  IF p_status <> 'opted_out' THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.project_parties pp
        JOIN public.projects p ON p.id = pp.project_id
       WHERE pp.phone_e164 = v_value
         AND pp.sms_consent_status = 'opted_out'
         AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
             = p_organization_id
    ) INTO v_seat_refusal;

    SELECT scc.status INTO v_record_status
      FROM public.studio_channel_consent scc
     WHERE scc.organization_id = p_organization_id
       AND scc.channel_kind    = p_channel_kind
       AND scc.channel_value   = v_value;

    IF v_seat_refusal AND v_record_status IS DISTINCT FROM 'opted_out' THEN
      RAISE EXCEPTION 'channel_opted_out'
        USING HINT = 'A seat in this studio on this number is marked opted out. '
                     'Record that refusal here first (status opted_out, with the '
                     'evidence); record_channel_reconsent() then puts your fresh '
                     'consent on the record, and the grant stays the '
                     'recipient''s to give by replying YES or START.';
    END IF;
  END IF;

  -- ── 2. Transition — stated INSIDE the write, never as a read before it ───
  -- A `SELECT … FOR UPDATE` ahead of the upsert locks NOTHING when no row
  -- exists yet, and the first record on a channel is exactly the contested
  -- case: the inbound STOP rail upserts this table directly as service_role
  -- (sms-inbound/pipeline.ts writeChannelConsent), so it could land `opted_out`
  -- in the gap between that read and the upsert — and the upsert would then
  -- take the DO UPDATE branch and write `granted` straight over a refusal that
  -- was already on the books, leaving only opt_out_at behind and mirroring the
  -- grant onto every seat in the studio on that number.
  --
  -- ON CONFLICT DO UPDATE re-reads the LATEST row version and re-evaluates its
  -- own WHERE, so the rule belongs there: the write either happens or returns
  -- nothing, and nothing returned IS the refusal (the IF NOT FOUND below).
  -- Re-recording a refusal on a refusal is still allowed — hence the
  -- EXCLUDED.status leg.
  --
  -- The SECOND leg of that WHERE is the two doors composed. A gate stated on
  -- the row's CURRENT status alone was walked around in two calls, by any
  -- studio member: record_channel_reconsent() USED TO move the row opted_out ->
  -- pending (since r7 M7-2 it writes evidence only and leaves the status), and
  -- this door then saw a row that is no longer `opted_out` and wrote `granted` over
  -- it, leaving opt_out_at as the only trace and clearing, through the mirror,
  -- the party-row backstop sendPartySms falls back on. So every verdict but
  -- `opted_out` is refused while an UNANSWERED refusal stands (r6 B6-1 — read
  -- on the refusal, never on which verdict the caller happens to be writing;
  -- `pending` mirrors onto the seats exactly as `granted` does).
  --
  -- THAT IS READ OFF refusal_unanswered, A STORED FACT — never inferred from
  -- opt_out_at alone. A refusal is routinely DATELESS: the shipped portal
  -- writes opted_out party rows with a NULL sms_opt_out_at deliberately
  -- (use-coordination.ts — "opted out, date unknown" is the truth), every
  -- pre-00432 row carries no date either, and
  -- backfill_channel_consent_from_parties() folds that population verbatim. A
  -- date test therefore failed OPEN for exactly the records the first prod fold
  -- mints: reconsent() and then this door walked a real STOP back to `granted`
  -- in two calls. The date test is KEPT alongside the flag, so a service_role
  -- writer that dates a refusal without raising the flag still fails closed.
  -- What answers a refusal is the recipient's own YES or START, which the
  -- inbound rail writes directly — lowering the flag and stamping a fresh
  -- consented_at (sms-inbound/pipeline.ts writeChannelConsent); after that this
  -- door opens again. NOTHING HERE LOWERS IT ON SMS (r7 M7-1; email is the one
  -- exception, r6 R6-M3 — there is no inbound START to wait for, so the
  -- studio's recorded grant is the answer). A record already AT
  -- `granted` used to be exempt from this gate so it could restate its
  -- evidence, and the write that came through then set the flag FALSE — one
  -- ordinary granted-on-granted call by any member, no recipient involved, and
  -- the send gate (channelConsentVerdict, which refuses on this flag since r6
  -- M6-3) opened. The first prod fold mints exactly that row: a legacy seat
  -- reading `granted` with a stale, unanswered opt-out. So the exemption is
  -- gone and this door never lowers the flag. Such a row is not stranded:
  -- recording the REFUSAL is always open — it is the way forward — and from
  -- there record_channel_reconsent() puts the studio's fresh consent on the
  -- record. What makes the number sendable again is the recipient's answer.

  -- ── 3. Write ──────────────────────────────────────────────────────────────
  -- No write may empty the evidence set (R-AG): each of source, evidence,
  -- disclosure_version and recorded_by keeps what stands when the new verdict
  -- does not restate it. Laundering is closed by the evidence gate above
  -- rather than by nulling — every status this door accepts must supply its
  -- own source and evidence, so a status CHANGE has already restated them by
  -- the time it reaches here.
  INSERT INTO public.studio_channel_consent AS scc (
    organization_id, channel_kind, channel_value, status,
    consented_at, opt_out_at, refusal_unanswered,
    source, evidence, recorded_at, disclosure_version, recorded_by,
    opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by,
    origin_project_id
  )
  VALUES (
    p_organization_id, p_channel_kind, v_value, p_status,
    CASE WHEN p_status = 'granted'   THEN v_now END,
    CASE WHEN p_status = 'opted_out' THEN v_now END,
    p_status = 'opted_out',
    p_source, p_evidence, v_now, p_disclosure_version, auth.uid(),
    -- THE REFUSAL'S OWN EVIDENCE (r8 W4-M2). Written only when the verdict IS
    -- the refusal, so "Replied STOP" / inbound_sms stays on the record beside
    -- whatever the studio records later. Nothing in this file but a fresh
    -- refusal touches these four again — reconsent() in particular does not.
    CASE WHEN p_status = 'opted_out' THEN p_source END,
    CASE WHEN p_status = 'opted_out' THEN p_evidence END,
    CASE WHEN p_status = 'opted_out' THEN v_now END,
    CASE WHEN p_status = 'opted_out' THEN auth.uid() END,
    p_origin_project_id
  )
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = EXCLUDED.status,
      -- A date already earned is kept when the new verdict does not restate it:
      -- "granted 2 May 2025, opted out 3 Dec 2025" must both survive.
      consented_at = CASE WHEN EXCLUDED.status = 'granted'
                          THEN EXCLUDED.consented_at ELSE scc.consented_at END,
      -- THE REFUSAL KEEPS THE DATE IT ALREADY HAS (r7 R7-M1). A second refusal
      -- recorded over a standing one is not a new refusal: it has stood since
      -- the day it arrived, and that day is what R-Q's sentence prints and what
      -- a carrier audit asks for. Stamping v_now walked "opted out 3 Dec 2025"
      -- forward to today on one ordinary call, through the very door the
      -- channel_opted_out HINT instructs the studio to use. LEAST skips NULLs,
      -- so a DATELESS refusal -- the shape the shipped portal writes on purpose
      -- and the fold mints verbatim -- does take the date of the refusal being
      -- recorded now: that is dating a refusal that had none, not overwriting
      -- one.
      opt_out_at   = CASE WHEN EXCLUDED.status = 'opted_out'
                          THEN LEAST(scc.opt_out_at, EXCLUDED.opt_out_at)
                          ELSE scc.opt_out_at END,
      -- A refusal raises the flag; NO verdict written through this door lowers
      -- it (r7 M7-1). Only the inbound rail's own write does, when the person
      -- who refused answers. A studio re-recording the consent it holds —
      -- `granted` or `pending` — does not answer the refusal, and the WHERE
      -- below means the only writes that reach here while one stands are the
      -- refusals themselves.
      refusal_unanswered = CASE
                             WHEN EXCLUDED.status = 'opted_out' THEN true
                             -- THE EMAIL ASYMMETRY (r6 R6-M3). An email refusal
                             -- has no inbound START to answer it, so the grant
                             -- the studio records IS the answer — see the
                             -- WHERE's email leg below and the header.
                             WHEN EXCLUDED.channel_kind = 'email'
                              AND EXCLUDED.status = 'granted' THEN false
                             ELSE scc.refusal_unanswered END,
      -- THE CONSENT SIDE IS NOT FREE SPACE (r6 R6-M1). A refusal writes NONE of
      -- these five: they belong to the GRANT whose consented_at this same
      -- statement keeps, and the refusal has four columns of its own below.
      -- Before this, one ordinary PR-m act — a written kickoff-form grant, then
      -- a verbal refusal the studio heard — left the record reading
      -- (verbal, "He told me on site") against the GRANT's date, so R-Q's grant
      -- sentence composed to "Verbal consent, 2 May 2025" and the consent's own
      -- 10DLC artifact was gone with no audit row. That is verbatim W4-M2's
      -- failure arriving from the other side, and it contradicts :1139-1142's
      -- rule that the evidence a consent stood on is a fact the audit keeps.
      --
      -- r7 R7-M1's consolation is WITHDRAWN with it: a studio refusal recorded
      -- over a texted one no longer "lands on the consent side" either. A
      -- second refusal adds no fact the record lacks, and the only place to put
      -- it was on top of a consent's evidence. Nothing is written rather than
      -- the wrong thing.
      --
      -- AND BLANKNESS IS TESTED THE WAY EVERY GATE IN THIS RPC TESTS IT (r6
      -- R6-M2): NULLIF(btrim(…), ''), not IS NULL. p_disclosure_version is the
      -- one evidence argument the opted_out branch does not require, so a
      -- caller sending an empty form field rather than omitting it used to
      -- write '' straight over the stored version — the single column
      -- :1139-1142 names as the one a refusal may not touch — and nothing in
      -- the file restores it. Kept on source and evidence for the same reason.
      source             = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.source
                                ELSE COALESCE(NULLIF(btrim(EXCLUDED.source), ''), scc.source) END,
      evidence           = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.evidence
                                ELSE COALESCE(NULLIF(btrim(EXCLUDED.evidence), ''), scc.evidence) END,
      recorded_at        = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.recorded_at
                                ELSE EXCLUDED.recorded_at END,
      disclosure_version = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.disclosure_version
                                ELSE COALESCE(NULLIF(btrim(EXCLUDED.disclosure_version), ''),
                                              scc.disclosure_version) END,
      recorded_by        = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.recorded_by
                                ELSE COALESCE(EXCLUDED.recorded_by, scc.recorded_by) END,
      -- A NEW refusal restates the refusal's own evidence; every other verdict
      -- leaves it exactly as it stands (r8 W4-M2). This is the half of the
      -- record a later consent must not be able to speak for.
      --
      -- AND A STUDIO-SOURCED REFUSAL NEVER SPEAKS FOR A TEXTED ONE (r7 R7-M1).
      -- The seat gate's HINT tells a studio facing an opted_out seat to
      -- "record that refusal here first"; obeying it over a number that really
      -- replied STOP used to write (verbal, "He told me on site", today, that
      -- member) straight over (inbound_sms, "Inbound STOP", 3 Dec 2025, NULL) --
      -- on the record and, through the mirror, on every seat. Sending stayed
      -- blocked, but the 10DLC artifact that the refusal ARRIVED BY TEXT was
      -- gone with no audit row, and opt_out_recorded_by named a studio member
      -- for a refusal the recipient made -- the attribution the inbound rail
      -- deliberately writes NULL to avoid. "They texted STOP / we also heard it
      -- verbally" is not a pair this record has to collapse -- and since r6
      -- R6-M1 the studio's account does not go on the CONSENT side either: that
      -- side is the GRANT's evidence, not free space. The hearsay refusal
      -- writes nothing at all, which is what a duplicate refusal is worth.
      -- A second INBOUND refusal does restate all four -- that is the carrier
      -- speaking again, and its later words are the better ones.
      opt_out_source      = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_source
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_source
                              ELSE EXCLUDED.opt_out_source END,
      opt_out_evidence    = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_evidence
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_evidence
                              ELSE EXCLUDED.opt_out_evidence END,
      opt_out_recorded_at = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_recorded_at
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_recorded_at
                              ELSE EXCLUDED.opt_out_recorded_at END,
      opt_out_recorded_by = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_recorded_by
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_recorded_by
                              ELSE EXCLUDED.opt_out_recorded_by END,
      -- The origin follows the CURRENT verdict, in both writers (the inbound
      -- rail agrees: pipeline.ts writes t.projectId ?? prior). R-Q's sentence
      -- names the job the verdict on the books came from, not an older one.
      origin_project_id  = COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)
  WHERE (scc.status IS DISTINCT FROM 'opted_out'
         OR EXCLUDED.status = 'opted_out'
         -- EMAIL HAS NO INBOUND START, SO THE STUDIO'S FRESH CONSENT IS THE WAY
         -- BACK (r6 R6-M3). Everything above is written for the SMS rail, where
         -- the recipient's own YES/START is what reopens sending and 10DLC says
         -- it must be. There is no such reply on email: nothing in the tree
         -- writes an email consent row, the inbound rail is SMS-only
         -- (pipeline.ts writes channel_kind 'sms'), and reconsent() leaves the
         -- status where it is — so an email refusal recorded by a studio member
         -- was PERMANENT, a dead address in that studio's book with no door at
         -- all. PR-m's ruling is "a fresh recorded consent OR an inbound
         -- START"; for email only the first half can exist, so it is the one
         -- that operates. The evidence gate above already forces a `granted`
         -- to carry source + evidence + disclosure_version, which is exactly
         -- what "a fresh recorded consent" means. `pending` is NOT let through:
         -- the double opt-in is the SMS rail's dance.
         OR (EXCLUDED.channel_kind = 'email' AND EXCLUDED.status = 'granted'))
    -- Stated on whether a refusal STANDS, not on which verdict is written
    -- (r6 B6-1). `EXCLUDED.status <> 'granted'` let `pending` through while an
    -- unanswered refusal stood, and a `pending` that lands is a `pending` the
    -- mirror stamps on every seat in the studio — the backstop gone, and the
    -- record moved off the status reconsent() needs to act on. Only `opted_out`
    -- is exempt: recording the refusal is the way forward. A record already at
    -- `granted` is NOT exempt either (r7 M7-1): the escape that let it restate
    -- its evidence was the one write that lowered the flag, and the fold mints
    -- the row it fired on.
    AND (EXCLUDED.status = 'opted_out'
         -- The same email leg (r6 R6-M3). refusal_unanswered is the flag the
         -- send rail reads, so letting the grant through without lowering it
         -- would be a door onto nothing; the SET above lowers it on exactly
         -- this leg. opt_out_at is kept either way — "opted out 3 Dec 2025,
         -- consented again 12 Sep 2026" must both stay printable (R-Q).
         OR (EXCLUDED.channel_kind = 'email' AND EXCLUDED.status = 'granted')
         OR (scc.refusal_unanswered IS NOT TRUE
             AND (scc.opt_out_at IS NULL
                  OR (scc.consented_at IS NOT NULL
                      AND scc.consented_at > scc.opt_out_at))))
    -- 2a's seat test again, inside the write. The check above is what refuses
    -- the INSERT case (no record yet, refusal on a seat only); this leg is the
    -- same rule where the row already exists, so a seat marked opted_out
    -- between that read and this write cannot be written over either. Same two
    -- narrowings removed: every verdict but `opted_out` is tested (r6 B6-1),
    -- and a DATELESS refusal counts (r6 M6-1) — it is what the portal really
    -- writes and what the send gate really reads.
    AND (EXCLUDED.status = 'opted_out'
         OR NOT EXISTS (
              SELECT 1
                FROM public.project_parties pp
                JOIN public.projects p ON p.id = pp.project_id
               WHERE pp.phone_e164 = scc.channel_value
                 AND pp.sms_consent_status = 'opted_out'
                 AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
                     = scc.organization_id))
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Nothing was written. Re-read the row the conflict landed on purely to
    -- say WHICH leg refused; the write is already decided either way.
    SELECT * INTO v_row
      FROM public.studio_channel_consent scc
     WHERE scc.organization_id = p_organization_id
       AND scc.channel_kind    = p_channel_kind
       AND scc.channel_value   = v_value;

    IF v_row.status = 'opted_out' THEN
      -- On email, `granted` never reaches here (r6 R6-M3's leg lets it through),
      -- so the only verdict this refuses on an email refusal is `pending` — and
      -- the double opt-in it asks for is the SMS rail's dance. Say so rather
      -- than telling an email address to reply START.
      IF p_channel_kind = 'email' THEN
        RAISE EXCEPTION 'channel_opted_out'
          USING HINT = 'This address already opted out, and `pending` is the SMS '
                       'opt-in dance — there is no inbound START on email. '
                       'Record the studio''s fresh consent as `granted`, with '
                       'its source, evidence and disclosure version: on email '
                       'that IS PR-m''s way back.';
      END IF;
      RAISE EXCEPTION 'channel_opted_out'
        USING HINT = 'This number or address already opted out. Only they can '
                     'rejoin, by replying START. record_channel_reconsent() puts '
                     'the studio''s fresh consent on the record — the refusal '
                     'keeps standing until they answer.';
    END IF;

    -- The seat leg (2a) raced in between: name it for what it is rather than
    -- letting it print as an unanswered refusal on the record.
    IF p_status <> 'opted_out' AND EXISTS (
         SELECT 1
           FROM public.project_parties pp
           JOIN public.projects p ON p.id = pp.project_id
          WHERE pp.phone_e164 = v_value
            AND pp.sms_consent_status = 'opted_out'
            AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
                = p_organization_id) THEN
      RAISE EXCEPTION 'channel_opted_out'
        USING HINT = 'A seat in this studio on this number is marked opted out. '
                     'Record that refusal here first (status opted_out, with the '
                     'evidence); record_channel_reconsent() then puts your fresh '
                     'consent on the record, and the grant stays the '
                     'recipient''s to give by replying YES or START.';
    END IF;

    RAISE EXCEPTION 'consent_awaiting_recipient'
      USING HINT = 'A refusal on this channel has not been answered yet. Put the '
                   'studio''s fresh consent on the record with '
                   'record_channel_reconsent() if it is not there; sending '
                   'resumes only when they reply YES or START.';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid) IS
  'The one write path into studio_channel_consent for the portal. Studio-member '
  'gated (not_a_studio_member); requires source + evidence + disclosure_version '
  'for pending/granted and source + evidence for opted_out '
  '(consent_evidence_required); REFUSES not_asked outright '
  '(consent_not_recordable — there is nothing to record, R-AG); refuses every '
  'SMS transition OUT of opted_out (channel_opted_out — record_channel_reconsent() '
  'is the named door for putting the studio''s fresh consent on the record, '
  'PR-m, and it leaves the refusal standing, r7 M7-2), and states that gate '
  'inside the upsert''s '
  'DO UPDATE … WHERE so a concurrent STOP cannot land in a read-then-write '
  'window; also refuses EVERY verdict but opted_out while a refusal stands '
  'unanswered — refusal_unanswered TRUE, or an opt_out_at with no later '
  'consented_at (consent_awaiting_recipient) — so '
  'reconsent() plus a grant cannot compose their way back to granted without '
  'the recipient''s own YES or START; it never LOWERS refusal_unanswered on any '
  'verdict either (r7 M7-1 — only the inbound rail does), and a DATELESS '
  'refusal (the shipped '
  'portal writes them on purpose and the fold mints them) fails closed like a '
  'dated one; refuses the same verdicts (channel_opted_out) while an opted_out '
  'seat stands in THIS studio on that number — dated or not — even when the '
  'record knows nothing of it, since the portal still writes party rows '
  'directly and the send gate reads both ledgers with no date test of its own '
  '(R-AL, r6 B6-1/M6-1: gated on whether a refusal stands, never on which '
  'verdict is being written — a recorded `pending` mirrors onto the seats '
  'exactly as a `granted` does, and was the ungated first hop); '
  'stamps the refusal''s OWN evidence set (opt_out_source, opt_out_evidence, '
  'opt_out_recorded_at, opt_out_recorded_by) when and only when the verdict is '
  'opted_out, and leaves it untouched on every other verdict, so a later '
  'consent cannot speak for the refusal (r8 W4-M2) — nor may a later REFUSAL: '
  'the record keeps the earliest opt_out_at, and a studio-sourced refusal '
  'recorded over an inbound_sms one (the path the seat-gate hint instructs) '
  'leaves all four columns standing and writes nothing in their place — not on '
  'the consent side either, which holds the grant''s evidence (r7 R7-M1 as '
  'narrowed by r6 R6-M1); '
  'ON EMAIL THE OPTED_OUT GATE IS ASYMMETRIC (r6 R6-M3): a `granted` with its '
  'source, evidence and disclosure version passes it and LOWERS '
  'refusal_unanswered, because email has no inbound START — the rail is SMS-only '
  '— so PR-m''s "a fresh recorded consent OR an inbound START" has only its '
  'first half there, and without this an email refusal was permanent; `pending` '
  'stays refused on email (the double opt-in is the SMS dance), and every SMS '
  'rule above is unchanged; '
  'never empties the evidence set — source, '
  'evidence, disclosure_version and recorded_by are kept when the new verdict '
  'does not restate them (blankness tested as NULLIF(btrim(…), ''''), not IS '
  'NULL, so an empty form field cannot wipe the disclosure version a refusal is '
  'not even asked for — r6 R6-M2), and laundering is closed by the evidence '
  'gate, since '
  'every accepted status must supply its own source and evidence; A REFUSAL '
  'WRITES NONE OF THOSE FIVE (r6 R6-M1) — they are the GRANT''s evidence, '
  'standing beside the consented_at this door keeps, and the refusal has its own '
  'four; normalises '
  'the channel value through normalize_channel_value(); stamps '
  'recorded_by/recorded_at; and keeps an earlier granted/opt-out date when the '
  'new verdict does not restate it (00594).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. record_channel_reconsent — PR-m's fresh recorded consent, on the record
-- ═══════════════════════════════════════════════════════════════════════════
-- PR-m: "The way back is always a fresh recorded consent or an inbound START."
-- The inbound START is the rail's own path. This is the other one, and it is
-- deliberately a SEPARATE, named door rather than a fourth argument to
-- record_channel_consent: superseding a refusal is not the same act as
-- recording one, it must be visible in the audit, and it must not be reachable
-- by a caller that merely got the status string wrong.
--
-- IT IS EVIDENCE-ONLY, AND IT LEAVES THE RECORD AT `opted_out` (r7 M7-2).
-- It used to land on `pending`, on the reading that the studio's fresh consent
-- put the record into the state the double opt-in confirmation exists for. That
-- reading died with r6's M6-3 fix: channelConsentVerdict refuses on
-- refusal_unanswered whatever the status says, so NO send could follow — the
-- opt-in invite included (sms.test.ts, "the opt-in invite does not slip past an
-- unanswered refusal", stages exactly the row this door used to write). What
-- the `pending` hop DID do was mirror `pending` onto every seat in the studio
-- on that number, erasing the party-row refusal the send rail falls back on,
-- and move the record off the one status this door can act on, so it could not
-- be called twice. The studio was strictly worse off for having called it.
--
-- So: the refusal keeps standing, the seats keep it, the studio's fresh consent
-- goes on the record where the room can print it ("opted out by text, 3 Dec
-- 2025; fresh signed consent 11 Sep 2026, waiting on their reply"), and the
-- door stays re-callable. THE DOUBLE OPT-IN DOES NOT RUN FROM HERE, and no
-- invite is dispatched (fc_dispatch_optin_invite fires on a mirrored `pending`,
-- which this no longer writes). `granted` is the recipient's to give by
-- replying YES or START, which the inbound rail writes directly — the one
-- writer that lowers refusal_unanswered. PR-m's "a fresh recorded consent OR an
-- inbound START" is read this way on the record: the fresh recorded consent is
-- what the studio may WRITE; the inbound START is what reopens SENDING.
--
-- THAT READING IS THE SMS RAIL'S (r6 R6-M3). On email there is no inbound
-- START, so this door is not where an email refusal is answered: the studio
-- records `granted` through record_channel_consent(), which on email — and only
-- on email — passes the opted_out gate and lowers refusal_unanswered. This door
-- still works on an email record (it is evidence-only and harmless), but it is
-- not the way back there.
CREATE OR REPLACE FUNCTION public.record_channel_reconsent(
  p_organization_id    uuid,
  p_channel_kind       text,
  p_channel_value      text,
  p_source             text,
  p_evidence           text,
  p_disclosure_version text,
  p_origin_project_id  uuid DEFAULT NULL
)
RETURNS public.studio_channel_consent
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_value text;
  v_now   timestamptz := now();
  v_row   public.studio_channel_consent;
BEGIN
  IF NOT public.is_active_studio_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_a_studio_member'
      USING HINT = 'Only an active, non-guest member of this studio may record consent.';
  END IF;

  IF p_channel_kind NOT IN ('sms', 'email') THEN
    RAISE EXCEPTION 'invalid_channel_kind';
  END IF;

  IF COALESCE(btrim(p_source), '') = ''
     OR COALESCE(btrim(p_evidence), '') = ''
     OR COALESCE(btrim(p_disclosure_version), '') = '' THEN
    RAISE EXCEPTION 'consent_evidence_required'
      USING HINT = 'Superseding a refusal needs a source, the evidence in words, '
                   'and the disclosure version the person was shown.';
  END IF;

  v_value := public.normalize_channel_value(p_channel_kind, p_channel_value);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_value';
  END IF;

  -- The mirror image of record_channel_consent's gate, stated the same way:
  -- inside the write. A read-then-check here had the same window in reverse —
  -- the read saw `opted_out`, a concurrent writer moved the row, and this
  -- UPDATE then superseded a refusal that was no longer on the books. In READ
  -- COMMITTED an UPDATE re-reads the row it blocked on and re-applies its own
  -- WHERE, so `AND scc.status = 'opted_out'` IS the gate and zero rows returned
  -- is the refusal.
  UPDATE public.studio_channel_consent scc
         -- status is NOT MOVED (r7 M7-2). The refusal stays on the books at
         -- `opted_out`, and through the mirror so does the refusal on every
         -- seat. It is restated rather than left alone so the row is normalised
         -- whatever a prior writer left, and so the WHERE below is the gate.
     SET status             = 'opted_out',
         -- opt_out_at is KEPT. The room still has to be able to say "opted out
         -- by text, 3 Dec 2025" alongside the fresh consent recorded against it.
         -- refusal_unanswered is KEPT TRUE for the same reason, and it is the
         -- fact record_channel_consent's granted door AND the send rail read:
         -- the studio holds its own fresh consent, but the person who refused
         -- still has not answered. Only their YES/START lowers it.
         -- Stated rather than left alone, so this door is correct even on a row
         -- some other writer left at opted_out without raising the flag.
         refusal_unanswered = true,
         -- opt_out_source / opt_out_evidence / opt_out_recorded_at /
         -- opt_out_recorded_by ARE NOT IN THIS LIST, and must never be (r8
         -- W4-M2). They are the REFUSAL's evidence; the five columns below are
         -- the STUDIO's. Before they existed this UPDATE wrote the studio's
         -- source and words over "Replied STOP" / inbound_sms while leaving the
         -- status at opted_out — so the record still refused every send but
         -- could no longer say what the refusal was or how it arrived, and the
         -- mirror pushed the same overwrite onto every seat in the studio on
         -- that number, taking the party-row copy with it. R-Q's sentence needs
         -- both halves printable at once.
         source             = p_source,
         evidence           = p_evidence,
         recorded_at        = v_now,
         disclosure_version = p_disclosure_version,
         recorded_by        = auth.uid(),
         origin_project_id  = COALESCE(p_origin_project_id, scc.origin_project_id)
   WHERE scc.organization_id = p_organization_id
     AND scc.channel_kind    = p_channel_kind
     AND scc.channel_value   = v_value
     AND scc.status          = 'opted_out'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_opt_out_to_supersede'
      USING HINT = 'There is no refusal on the books for this channel. Record '
                   'the consent through record_channel_consent() instead.';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_channel_reconsent(uuid, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_channel_reconsent(uuid, text, text, text, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_channel_reconsent(uuid, text, text, text, text, text, uuid) IS
  'PR-m''s named door for putting the studio''s OWN fresh consent on the record '
  'over a recorded opt-out, with source + evidence + disclosure_version all '
  'required. Refuses unless the channel is currently opted_out '
  '(no_opt_out_to_supersede — the condition is in the UPDATE''s own WHERE, so a '
  'concurrent writer cannot move the row out from under it). It is EVIDENCE-ONLY '
  'and LEAVES THE RECORD AT opted_out (r7 M7-2): it writes source, evidence, '
  'recorded_at, disclosure_version, recorded_by and origin_project_id, and keeps '
  'status, opt_out_at, refusal_unanswered AND THE REFUSAL''S OWN EVIDENCE SET '
  '(opt_out_source / opt_out_evidence / opt_out_recorded_at / '
  'opt_out_recorded_by) exactly as they stand — before that set existed this '
  'door overwrote the STOP''s own source and words with the studio''s, on the '
  'record and, through the mirror, on every seat (r8 W4-M2). It does NOT '
  'run the double opt-in — it used to land on `pending`, but since r6 M6-3 the '
  'send rail refuses on refusal_unanswered whatever the status says, so that hop '
  'sent nothing, cleared the mirrored refusal off every seat, and left the row '
  'on a status this door cannot act on (so it could not be called again). '
  'Sending resumes only when the recipient replies YES or START, which the '
  'inbound rail writes directly — the one writer that lowers '
  'refusal_unanswered — after which record_channel_consent opens again. Safe to '
  'call more than once: each call restates the studio''s latest evidence '
  '(00594).';
SELECT 'rerun 00594 ok';
ROLLBACK;
