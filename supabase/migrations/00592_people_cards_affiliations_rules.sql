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
  'person card, company_id at a company card.';

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
